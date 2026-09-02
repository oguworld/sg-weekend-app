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

// ─── 取得結果をファイルに保存（notify-fetch-summary.jsがイベント通知と合算して通知する） ───
function saveFetchSummary({ rawTotal, uniqueTotal, accepted, rejected, newItems }) {
  const summaryPath = path.join(__dirname, '..', 'logs', 'fetch-life-info-summary.json');
  const catCounts = {};
  for (const item of (newItems || [])) catCounts[item.category] = (catCounts[item.category] || 0) + 1;
  const summary = {
    rawTotal,
    uniqueTotal,
    accepted,
    rejected,
    catCounts,
    date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }),
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
}

// ─── 1日1回、朝の取り込み完了後にアプリへプッシュ通知を送る（設計書173） ───
// fetch-events.js（6:30 SGT）→fetch-life-info.js（7:15 SGT）の順で毎日実行されるため、
// 後発のこのスクリプトの完了時点で1日1回だけ呼ぶ。通知はオプトイン済みユーザーのみに届く
// （data/push-subscriptions.jsonに登録済み＝設定で「イベント通知」をONにした人のみ）。
async function notifyContentUpdated() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) { console.log('  ⚠️ ADMIN_SECRET未設定のためプッシュ通知をスキップ'); return; }
  try {
    const res = await fetch('http://localhost:3000/api/notify-events-updated?city=sg', {
      method: 'POST',
      headers: { 'x-admin-secret': secret },
    });
    const data = await res.json().catch(() => ({}));
    console.log(`  🔔 プッシュ通知: ${res.ok ? `${data.sent || 0}件に送信` : `失敗(${res.status})`}`);
  } catch (e) {
    console.log(`  ⚠️ プッシュ通知の送信に失敗: ${e.message}`);
  }
}

// ─── 都市設定 ────────────────────────────────────────────────────
const CITY_CONFIG = {
  sg: {
    nameJa: 'シンガポール',
    lifeInfoPath: path.join(__dirname, '..', 'data', 'sg', 'life-info.json'),
    feeds: [
      { url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=10416', name: 'CNA' },
      { url: 'https://mothership.sg/feed/',                                                          name: 'Mothership' },
      { url: 'https://www.straitstimes.com/news/singapore/rss.xml',                                  name: 'Straits Times' },
      { url: 'https://www.jcci.org.sg/feed/',                                                         name: 'JCCI' },
    ],
  },
};

const CATEGORIES = ['admin', 'transport', 'health', 'education', 'weather', 'community'];

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

async function fetchNewItems(feeds, cityKey, dryRun) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_BACK);

  const allItems = [];
  const state = loadFetchState();
  const cityState = state[cityKey] || (state[cityKey] = {});

  for (const feed of feeds) {
    try {
      console.log(`\n  📡 取得中: ${feed.name}`);
      // Mothership等、フィード側の生成不備でタイトル内の "&" が "&amp;" にエスケープされず
      // 生のまま出力されているケースがあり、rss-parser内部のXMLパーサー（xml2js）が
      // "Invalid character in entity name" で例外を投げていた。生テキストを取得し、
      // 正規化された実体参照（&amp; &lt; &gt; &quot; &apos; &#数値; &#x16進;）以外の
      // 素の "&" のみを "&amp;" に置換してから parseString() に渡すことで許容する。
      const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawXml = await res.text();
      const sanitizedXml = rawXml.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
      const result = await parser.parseString(sanitizedXml);
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

  // --dry-run時は状態を永続化しない（安全なテスト実行のため。GUIDを既読扱いにしてしまうと
  // 本番実行時にそのまま「新着なし」として消えてしまう副作用があった、2026-08-29発覚・修正）
  if (!dryRun) saveFetchState(state);
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
- "transport": 交通・MRT（運行情報・遅延・道路規制・LTA関連の発表）
- "health": 医療・健康（クリニック・病院情報、健康アラート、感染症情報など）
- "education": 教育・子育て（学校情報、保活、子育て支援制度など）
- "weather": 天候・災害・ヘイズ（PSI指数・洪水警報・大雨警報・気象関連ニュース）
- "community": 日本人コミュニティ・近隣制度（日本人会・日本人学校・日系企業・近隣国との往来制度等）

【不採用とすべきもの】
- スポーツ・芸能・エンタメ関連のニュース
- 単純な事件・事故報道（生活への影響が薄いもの）
- 政治的な論争・スキャンダル記事で生活情報としての実用性がないもの
- 広告・PR記事
- 上記6カテゴリのいずれにも明確に該当しないもの

各採用記事について以下のフィールドのみ返すこと：
- index: 元の記事のインデックス番号（0始まり）
- category: "admin" | "transport" | "health" | "education" | "weather" | "community"

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

// ─── 重複排除（意味的重複、最後に実施） ────────────────────────
// 複数のニュースソースが同じ実際の出来事を別々の記事として報じているケースをHaikuで検出し、
// 新規候補側から除外する（既存の掲載済み記事は削除しない）。直近3日分の既存記事のみを
// 比較対象にする（重複は近い日付間でのみ起こるため、古い記事まで比較する必要はない）。
async function filterOutDuplicateStories(newItems, existingItems) {
  if (newItems.length === 0) return newItems;

  const recentCutoff = new Date();
  recentCutoff.setHours(0, 0, 0, 0);
  recentCutoff.setDate(recentCutoff.getDate() - 3);
  const recentExisting = existingItems.filter(it => {
    if (!it.fetched_at) return false;
    const d = new Date(it.fetched_at);
    return !isNaN(d.getTime()) && d >= recentCutoff;
  });

  const existingList = recentExisting.map((it, i) => `E${i}: ${it.title}`).join('\n') || '(なし)';
  const candidateList = newItems.map((it, i) => `N${i}: ${it.title}`).join('\n');

  const instructionText = `以下は生活情報ニュースアプリの記事タイトル一覧です。「既存記事」は既に掲載済み、「新規候補」はこれから掲載しようとしている記事です。
異なる情報源が同じ実際の出来事・ニュースを報じているだけの重複（表現・切り口が違っても内容が同じもの）を検出してください。単に同じカテゴリ・似たテーマというだけでは重複としないこと。

新規候補が既存記事と同じ内容の場合、または新規候補同士で同じ内容のものが複数ある場合は、後者（番号が大きい方）を重複として扱ってください。

既存記事:
${existingList}

新規候補:
${candidateList}

重複と判定した新規候補のインデックス番号（"N0","N1"等）のみをJSON配列で返してください（例: ["N1","N3"]）。重複がなければ空配列 [] を返すこと。前置き・説明・コードブロックは不要です。`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: instructionText }],
    });
    const text = response.content[0].text.trim();
    const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) return newItems;
    const dupLabels = new Set(JSON.parse(match[0]));
    return newItems.filter((_, i) => !dupLabels.has(`N${i}`));
  } catch (e) {
    console.error('  ⚠️ 重複チェックに失敗、そのまま続行:', e.message);
    return newItems;
  }
}

// ─── メイン関数：フィルタリング＆保存 ──────────────────────────
async function filterAndSaveLifeInfo(items, { lifeInfoPath, cityKey, dryRun }) {
  let totalAccepted = 0;
  let totalRejected = 0;
  let newItems = [];

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
      fetched_at: new Date().toISOString(),
    };

    console.log(`    ✅ 採用: ${item.title} (category: ${item.category}, source: ${item.source})`);
    newItems.push(item);
  }

  if (enrichFailedCount > 0) {
    console.log(`  ⚠️ 要約生成に失敗したため${enrichFailedCount}件を除外しました`);
  }

  // 重複排除（最後に実施）: 異なるソースが同じ実際の出来事を報じているだけの意味的重複を検出する。
  // URLベースのdeduplicateItems()（取得直後）では検出できないケース（例: Mothership/Straits Times
  // が同じ近隣トラブル調停制度のニュースを別々のURLで報じる）に対応する。既存記事側は削除せず、
  // 新規候補側のみを重複として除外する（既に掲載済みの記事を後から消す方式は取らない）。
  const existingForDedup = fs.existsSync(lifeInfoPath) ? JSON.parse(fs.readFileSync(lifeInfoPath, 'utf8')) : [];
  const beforeDedupCount = newItems.length;
  newItems = await filterOutDuplicateStories(newItems, existingForDedup);
  if (newItems.length < beforeDedupCount) {
    console.log(`  🔁 意味的重複と判定し${beforeDedupCount - newItems.length}件を除外しました`);
  }

  // 保持期間: fetched_atが一定日数以上前の記事は削除する（生活情報は鮮度が命のため、events.jsonと異なり
  // 蓄積し続けない方針。新規採用が0件の日も既存データの棚卸しのため必ず実行する）。
  const RETENTION_DAYS = 7;
  const retentionCutoff = new Date();
  retentionCutoff.setHours(0, 0, 0, 0);
  retentionCutoff.setDate(retentionCutoff.getDate() - RETENTION_DAYS);

  if (dryRun) {
    console.log(`\n  🧪 --dry-run のため保存はスキップします（採用${newItems.length}件）`);
    console.log(JSON.stringify(newItems, null, 2));
  } else {
    const existing = existingForDedup;
    const combined = [...existing, ...newItems];
    const kept = combined.filter(item => {
      if (!item.fetched_at) return true; // 日付不明は安全側で残す
      const fetched = new Date(item.fetched_at);
      return !isNaN(fetched.getTime()) && fetched >= retentionCutoff;
    });
    const removedCount = combined.length - kept.length;
    if (newItems.length > 0 || removedCount > 0) {
      fs.mkdirSync(path.dirname(lifeInfoPath), { recursive: true });
      fs.writeFileSync(lifeInfoPath, JSON.stringify(kept, null, 2), 'utf8');
      console.log(`\n  💾 ${lifeInfoPath} に${newItems.length}件追記 / ${RETENTION_DAYS}日超過${removedCount}件削除（現在${kept.length}件）`);
    }
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
  const rawItems = await fetchNewItems(conf.feeds, cityKey, dryRun);
  console.log(`\n  合計取得: ${rawItems.length}件`);

  if (rawItems.length === 0) {
    console.log('\n✅ 新着なし。終了します。\n');
    if (!dryRun) {
      saveFetchSummary({ rawTotal: 0, uniqueTotal: 0, accepted: 0, rejected: 0, newItems: [] });
      await notifyContentUpdated();
    }
    return;
  }

  const uniqueItems = deduplicateItems(rawItems, conf.lifeInfoPath);
  if (uniqueItems.length === 0) {
    console.log('✅ 重複なし新着なし。終了します。\n');
    if (!dryRun) {
      saveFetchSummary({ rawTotal: rawItems.length, uniqueTotal: 0, accepted: 0, rejected: 0, newItems: [] });
      await notifyContentUpdated();
    }
    return;
  }

  console.log('\n🤖 Claude APIでフィルタリング・要約生成開始...');
  const result = await filterAndSaveLifeInfo(uniqueItems, { lifeInfoPath: conf.lifeInfoPath, cityKey, dryRun });

  if (!dryRun) {
    saveFetchSummary({
      rawTotal: rawItems.length,
      uniqueTotal: uniqueItems.length,
      accepted: result.accepted,
      rejected: result.rejected,
      newItems: result.newItems,
    });
    await notifyContentUpdated();
  }

  console.log('\n🎉 fetch-life-info.js 完了\n');
}

if (require.main === module) {
  main().catch(e => {
    console.error('\n❌ 予期しないエラー:', e.message);
    process.exit(1);
  });
}

module.exports = { filterAndSaveLifeInfo };
