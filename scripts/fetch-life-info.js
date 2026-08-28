#!/usr/bin/env node
// scripts/fetch-life-info.js
// シンガポール在住日本人向け生活情報・ニュースのキュレーション（設計書172）
// CNA / Mothership / JCCI の RSS を取得し、Haiku で一次選別 → Sonnet で日英要約を生成し
// data/{city}/life-info.json に保存する。
// 既存 scripts/fetch-events.js / scripts/filter-events.js のパターン（ハイウォーターマーク方式・
// Anthropic SDK呼び出し・エラーハンドリング）を踏襲する。
// 使い方: node fetch-life-info.js [--city=sg] [--dry-run]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Parser    = require('rss-parser');
const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const parser = new Parser({ timeout: 10000 });
const client = new Anthropic();

// ─── 都市設定 ────────────────────────────────────────────────────
const CITY_CONFIG = {
  sg: {
    nameJa: 'シンガポール',
    lifeInfoPath: path.join(__dirname, '..', 'data', 'sg', 'life-info.json'),
    feeds: [
      { url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=10416', name: 'CNA' },
      { url: 'https://mothership.sg/feed/',                                                          name: 'Mothership' },
      { url: 'https://www.jcci.org.sg/feed/',                                                         name: 'JCCI' },
    ],
  },
};

const CATEGORIES = ['admin', 'weather', 'transport', 'community'];

// ─── CLI引数解析 ─────────────────────────────────────────────────
function parseArgs() {
  const cityArg = process.argv.find(a => a.startsWith('--city='));
  const city = cityArg ? cityArg.split('=')[1].toLowerCase() : 'sg';
  const dryRun = process.argv.includes('--dry-run');
  return { city: CITY_CONFIG[city] ? city : 'sg', dryRun };
}

// ─── ハイウォーターマーク方式（ソースごとの既知GUID管理） ──────
// data/source-fetch-state.json とは分離した専用ファイル
const LIFE_INFO_FETCH_STATE_PATH = path.join(__dirname, '..', 'data', 'life-info-fetch-state.json');

function loadFetchState() {
  if (!fs.existsSync(LIFE_INFO_FETCH_STATE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(LIFE_INFO_FETCH_STATE_PATH, 'utf8'));
  } catch (e) {
    console.error(`  ⚠️  life-info-fetch-state.json 読み込み失敗: ${e.message}`);
    return {};
  }
}

function saveFetchState(state) {
  fs.mkdirSync(path.dirname(LIFE_INFO_FETCH_STATE_PATH), { recursive: true });
  fs.writeFileSync(LIFE_INFO_FETCH_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// ─── ステップ1: RSS取得（ハイウォーターマーク方式で新着のみ） ──
const DAYS_BACK = 7;
const MAX_PER_FEED = 30;

async function fetchNewItems(feeds, cityKey) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_BACK);

  const allItems = [];
  const state = loadFetchState();
  const cityState = state[cityKey] || (state[cityKey] = {});

  for (const feed of feeds) {
    try {
      console.log(`\n  📡 取得中: ${feed.name}`);
      const result = await parser.parseURL(feed.url);
      const raw = result.items || [];

      const prevState = cityState[feed.name];
      const prevSeenGuids = prevState ? new Set(prevState.lastSeenGuids || []) : null;

      const filtered = raw
        .slice(0, MAX_PER_FEED)
        .filter(item => {
          const pub = item.pubDate || item.isoDate ? new Date(item.pubDate || item.isoDate) : new Date();
          if (pub < cutoff) return false;

          // 初回（該当ソースの状態が未保存）は daysBack カットオフのみに委ねる。
          // 2回目以降は「前回未確認のGUID/linkのみ新着」をAND条件で追加適用する。
          if (prevSeenGuids) {
            const guid = item.guid || item.link || '';
            if (guid && prevSeenGuids.has(guid)) return false;
          }

          if (!item.title || item.title.trim().length === 0) return false;
          return true;
        })
        .map(item => ({
          title:       item.title || '',
          description: item.contentSnippet || item.summary || item.content || '',
          link:        item.link || '',
          pubDate:     item.pubDate || item.isoDate || new Date().toISOString(),
          source:      feed.name,
        }));

      console.log(`  ✅ ${raw.length}件取得 → 新着フィルター後${filtered.length}件`);
      allItems.push(...filtered);

      // フィード取得が成功した場合のみ、このフェッチで見た全GUID/linkで状態を更新する
      const seenGuids = raw.map(item => item.guid || item.link || '').filter(Boolean);
      cityState[feed.name] = {
        lastSeenGuids: seenGuids,
        lastFetchedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error(`  ❌ フェッチ失敗: ${feed.name} — ${e.message}`);
      // フィード取得自体が失敗した場合は該当ソースの状態を更新しない（次回また試行される）
    }
  }

  saveFetchState(state);
  return allItems;
}

// ─── 重複チェック（既存 life-info.json との URL 重複） ──────────
function deduplicateItems(newItems, lifeInfoPath) {
  const existing = fs.existsSync(lifeInfoPath) ? JSON.parse(fs.readFileSync(lifeInfoPath, 'utf8')) : [];
  const existingUrls = new Set(existing.map(e => e.sourceUrl).filter(Boolean));
  const deduplicated = newItems.filter(item => !(item.link && existingUrls.has(item.link)));
  console.log(`\n  📊 重複除外後: ${newItems.length}件 → ${deduplicated.length}件 → Claude APIへ送信`);
  return deduplicated;
}

// ─── Step1: Haikuで一次選別（関係あるか判定＋カテゴリ付与） ─────
const BATCH_SIZE = 10;

async function filterBatch(batch, cityKey) {
  const cityName = CITY_CONFIG[cityKey].nameJa;

  const articlesJson = JSON.stringify(
    batch.map((item, i) => ({
      index: i,
      title: item.title,
      description: (item.description || '').slice(0, 800),
      source: item.source,
      date: (() => {
        if (!item.pubDate) return null;
        const d = new Date(item.pubDate);
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      })(),
    })),
    null,
    2
  );

  const instructionText = `あなたは${cityName}在住日本人向け生活情報アプリのコンテンツ編集者です。
以下の記事を評価し、「${cityName}在住日本人の生活に関係がある」と判断できるもののみJSON配列で返してください。

【対象とするカテゴリ】
- "admin": 行政・ビザ/在留手続き（ICA・MOM・大使館等の制度変更・お知らせ、政府の政策発表等）
- "weather": 天候・災害・ヘイズ（PSI指数・洪水警報・大雨警報・気象関連ニュース）
- "transport": 交通・MRT（運行情報・遅延・道路規制・LTA関連の発表）
- "community": 日本人コミュニティ・近隣制度（日本人会・日本人学校・日系企業・近隣国との往来制度等）

【不採用とすべきもの】
- スポーツ・芸能・エンタメ関連のニュース
- 単純な事件・事故報道（生活への影響が薄いもの）
- 政治的な論争・スキャンダル記事で生活情報としての実用性がないもの
- 広告・PR記事
- 上記4カテゴリのいずれにも明確に該当しないもの

各採用記事について以下のフィールドのみ返すこと：
- index: 元の記事のインデックス番号（0始まり）
- category: "admin" | "weather" | "transport" | "community"

JSON配列のみ返すこと（前置き・説明・コードブロック不要）。不採用は配列に含めない。

記事:`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    system: [
      {
        type: 'text',
        text: `あなたは${cityName}在住日本人向けコンテンツ編集者です。指示されたJSONのみを返してください。`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: instructionText, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: articlesJson },
        ],
      },
    ],
  });

  const text = response.content[0].text.trim();
  const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

// ─── Step2: Sonnetで日本語要約＋英語要約を生成 ───────────────────
const ENRICH_BATCH_SIZE = 8;

async function enrichBatch(batch, cityKey) {
  const cityName = CITY_CONFIG[cityKey].nameJa;

  const itemsJson = JSON.stringify(
    batch.map(({ filtered, original }) => ({
      index:       filtered._enrichPos,
      category:    filtered.category,
      title:       original.title,
      description: (original.description || '').slice(0, 800),
      source:      original.source,
    })),
    null,
    2
  );

  const instructionText = `あなたは${cityName}在住日本人向け生活情報アプリのコンテンツライターです。
以下の各記事について、日本語要約と英語要約を生成してください。

各エントリについて以下のフィールドを返すこと：
- index: 受け取ったindexをそのまま返す
- title_ja: 日本語タイトル（30文字以内）
- title_en: English title (concise, under 15 words)
- summary_ja: 日本語要約（100〜150文字程度）。何が起きたか・在住日本人にとってどう関係するかを具体的に記述すること
- summary_en: English summary (60–100 words). Concise, informative.

JSON配列のみ返すこと（前置き・説明・コードブロック不要）。

記事:`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: [
      {
        type: 'text',
        text: `あなたは${cityName}在住日本人向けコンテンツライターです。指示されたJSONのみを返してください。`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: instructionText, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: itemsJson },
        ],
      },
    ],
  });

  const text = response.content[0].text.trim();
  const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

// ─── メイン関数：フィルタリング＆保存 ──────────────────────────
async function filterAndSaveLifeInfo(items, { lifeInfoPath, cityKey, dryRun }) {
  let totalAccepted = 0;
  let totalRejected = 0;
  const newItems = [];

  // ── Step1: Haikuで全件フィルタリング ──
  const filtered = []; // { filtered: {index,category}, original: item }
  const totalBatches = Math.ceil(items.length / BATCH_SIZE);

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`\n  [Filter ${batchNum}/${totalBatches}] ${batch.length}件をHaikuで一次選別中...`);

    try {
      const results = await filterBatch(batch, cityKey);
      totalRejected += batch.length - results.length;
      for (const r of results) {
        if (!CATEGORIES.includes(r.category)) continue;
        filtered.push({ filtered: r, original: batch[r.index] || {} });
      }
      if (i + BATCH_SIZE < items.length) await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error(`    ❌ フィルタエラー: ${e.message}`);
      console.log(`    🔁 フィルタリングをリトライします...`);
      try {
        const retryResults = await filterBatch(batch, cityKey);
        totalRejected += batch.length - retryResults.length;
        for (const r of retryResults) {
          if (!CATEGORIES.includes(r.category)) continue;
          filtered.push({ filtered: r, original: batch[r.index] || {} });
        }
      } catch (e2) {
        console.error(`    ❌ フィルタリングリトライも失敗: ${e2.message}`);
        totalRejected += batch.length;
      }
    }
  }

  totalAccepted = filtered.length;
  console.log(`\n  📊 一次選別結果: ${items.length}件 → 採用${totalAccepted}件`);

  // ── Step2: Sonnetで採用分のみ日英要約生成 ──
  filtered.forEach((item, i) => { item.filtered._enrichPos = i; });

  const enriched = new Map();
  const enrichBatches = [];
  for (let i = 0; i < filtered.length; i += ENRICH_BATCH_SIZE) {
    enrichBatches.push(filtered.slice(i, i + ENRICH_BATCH_SIZE));
  }

  for (let i = 0; i < enrichBatches.length; i++) {
    const batch = enrichBatches[i];
    console.log(`\n  [Enrich ${i + 1}/${enrichBatches.length}] ${batch.length}件をSonnetで要約生成中...`);
    try {
      const results = await enrichBatch(batch, cityKey);
      for (const r of results) enriched.set(r.index, r);
      if (i + 1 < enrichBatches.length) await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`    ❌ 要約生成エラー: ${e.message}`);
      console.log(`    🔁 要約生成をリトライします...`);
      try {
        const retryResults = await enrichBatch(batch, cityKey);
        for (const r of retryResults) enriched.set(r.index, r);
      } catch (e2) {
        console.error(`    ❌ 要約生成リトライも失敗: ${e2.message}`);
      }
      if (i + 1 < enrichBatches.length) await new Promise(r => setTimeout(r, 1000));
    }
  }

  // ── Step1+2のデータを結合してnewItemsに積む ──
  let enrichFailedCount = 0;
  for (const { filtered: f, original } of filtered) {
    if (!enriched.has(f._enrichPos)) {
      enrichFailedCount++;
      continue;
    }
    const enrich = enriched.get(f._enrichPos);
    const id = `li_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const pub = original.pubDate ? new Date(original.pubDate) : new Date();
    const publishedAt = isNaN(pub.getTime()) ? new Date().toISOString() : pub.toISOString();

    const item = {
      id,
      category:   f.category,
      title:      enrich.title_ja || original.title || '',
      title_en:   enrich.title_en || original.title || '',
      summary:    enrich.summary_ja || '',
      summary_en: enrich.summary_en || '',
      source:     original.source || '',
      sourceUrl:  original.link || '',
      publishedAt,
      fetched_at: new Date().toISOString().slice(0, 10),
    };

    console.log(`    ✅ 採用: ${item.title} (category: ${item.category}, source: ${item.source})`);
    newItems.push(item);
  }

  if (enrichFailedCount > 0) {
    console.log(`  ⚠️ 要約生成に失敗したため${enrichFailedCount}件を除外しました`);
  }

  if (dryRun) {
    console.log(`\n  🧪 --dry-run のため保存はスキップします（採用${newItems.length}件）`);
    console.log(JSON.stringify(newItems, null, 2));
  } else if (newItems.length > 0) {
    const existing = fs.existsSync(lifeInfoPath) ? JSON.parse(fs.readFileSync(lifeInfoPath, 'utf8')) : [];
    fs.mkdirSync(path.dirname(lifeInfoPath), { recursive: true });
    fs.writeFileSync(lifeInfoPath, JSON.stringify([...existing, ...newItems], null, 2), 'utf8');
    console.log(`\n  💾 ${lifeInfoPath} に ${newItems.length}件追記`);
  }

  console.log(`\n  📊 Claude API結果: ${totalAccepted + totalRejected}件送信 → 採用${totalAccepted}件 / 不採用${totalRejected}件`);

  return { accepted: totalAccepted, rejected: totalRejected, newItems };
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  const { city: cityKey, dryRun } = parseArgs();
  const conf = CITY_CONFIG[cityKey];

  console.log(`\n📰 fetch-life-info.js 開始（${conf.nameJa}）${dryRun ? ' [--dry-run]' : ''}\n`);
  console.log('━'.repeat(50));

  console.log('\n📡 RSSフィード取得中...');
  const rawItems = await fetchNewItems(conf.feeds, cityKey);
  console.log(`\n  合計取得: ${rawItems.length}件`);

  if (rawItems.length === 0) {
    console.log('\n✅ 新着なし。終了します。\n');
    return;
  }

  const uniqueItems = deduplicateItems(rawItems, conf.lifeInfoPath);
  if (uniqueItems.length === 0) {
    console.log('✅ 重複なし新着なし。終了します。\n');
    return;
  }

  console.log('\n🤖 Claude APIでフィルタリング・要約生成開始...');
  await filterAndSaveLifeInfo(uniqueItems, { lifeInfoPath: conf.lifeInfoPath, cityKey, dryRun });

  console.log('\n🎉 fetch-life-info.js 完了\n');
}

if (require.main === module) {
  main().catch(e => {
    console.error('\n❌ 予期しないエラー:', e.message);
    process.exit(1);
  });
}

module.exports = { filterAndSaveLifeInfo };
