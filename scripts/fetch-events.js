#!/usr/bin/env node
// scripts/fetch-events.js
// RSS + Instagram からイベント・セール情報を取得し、
// Claude APIでフィルタリングして data/{city}/events.json に保存する
// 使い方: node fetch-events.js [--city=sg|bkk|syd]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Parser  = require('rss-parser');
const fs      = require('fs');
const path    = require('path');

const parser = new Parser({
  timeout: 10000,
  customFields: { item: [['itunes:image', 'itunesImage']] },
});

// ─── 都市設定 ────────────────────────────────────────────────────
const CITY_CONFIG = {
  sg: {
    nameJa: 'シンガポール', timezone: 'Asia/Singapore',
    eventsPath: path.join(__dirname, '..', 'data', 'sg', 'events.json'),
    instagramAccounts: ['gardensbythebay', 'jewelchangiairport', 'capitalandmallssg'],
    feeds: [
      { url: 'https://thesmartlocal.com/feed',             name: 'The Smart Local' },
      { url: 'https://expatliving.sg/feed',                name: 'Expat Living' },
      { url: 'https://thehoneycombers.com/singapore/feed', name: 'Honeycombers' },
      { url: 'https://sethlui.com/feed',                   name: 'Seth Lui' },
      { url: 'https://www.littledayout.com/feed',          name: 'Little Day Out' },
      { url: 'https://singpromos.com/feed',                name: 'SINGPromos' },
      { url: 'https://eatbook.sg/feed',                    name: 'Eatbook' },
      { url: 'https://thenewageparents.com/feed',          name: 'The New Age Parents' },
      { url: 'http://localhost:1200/luma/singapore',        name: 'Luma SG',             minDescLen: 0, skipDateFilter: true },
    ],
  },
  bkk: {
    nameJa: 'バンコク', timezone: 'Asia/Bangkok',
    eventsPath: path.join(__dirname, '..', 'data', 'bkk', 'events.json'),
    instagramAccounts: [
      // モール・商業施設（イベント・セール・グランドオープン）
      'iconsiam',
      'centralworld',
      'centralembassy',
      'siamparagonshopping',
      'emporium_emquartier',
      'theemsphere',
      'terminal21asok',
      'one_bangkok',
      // フード・グルメメディア
      'bangkokfoodies',
      'bangkok.foodie',
    ],
    feeds: [],
  },
  syd: {
    nameJa: 'シドニー', timezone: 'Australia/Sydney',
    eventsPath: path.join(__dirname, '..', 'data', 'syd', 'events.json'),
    instagramAccounts: [
      // 観光・文化施設（イベント）
      'sydneyoperahouse',
      'royalbotanicgarden',
      'artgalleryofnsw',
      'vividsydney',
      // 公式・行政（イベント全般）
      'cityofsydney',
      // モール・商業施設（セール・グランドオープン）
      'westfieldsyd',
      'westfieldbondijunction',
      // イベント・グルメメディア
      'timeoutsydney',
      'broadsheet_syd',
      'concreteplayground',
      'goodfoodau',
      'placesinsydney',
      'tasteofsydney',
      'secretfoodies',
    ],
    feeds: [],
  },
};

// 除外キーワード（不動産・金融・求人など）
const EXCLUDE_KEYWORDS = [
  'property', 'mortgage', 'visa', 'immigration', 'insurance',
  'investment', 'stocks', 'crypto', 'forex', 'legal advice',
  'hiring', 'recruitment', 'salary',
];

// ─── sources.json からアクティブなソースを読み込む ──────────────
const SOURCES_PATH = path.join(__dirname, '..', 'data', 'sources.json');

function loadActiveSources(cityKey) {
  const conf = CITY_CONFIG[cityKey];
  if (!fs.existsSync(SOURCES_PATH)) {
    return { feeds: conf.feeds || [], instagramAccounts: conf.instagramAccounts || [] };
  }
  const sourcesJson = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
  const cityConf = sourcesJson[cityKey] || {};

  const feeds = (cityConf.feeds || [])
    .filter(f => f.status === 'active')
    .map(f => ({ url: f.url, name: f.name, ...(f.options || {}) }));

  const instagramAccounts = (cityConf.instagramAccounts || [])
    .filter(a => a.status === 'active')
    .map(a => a.username);

  console.log(`  📋 sources.json から読み込み: feeds ${feeds.length}件 / IG ${instagramAccounts.length}件`);
  return { feeds, instagramAccounts };
}

// ─── CLI引数解析 ─────────────────────────────────────────────────
function parseCity() {
  const arg = process.argv.find(a => a.startsWith('--city='));
  const city = arg ? arg.split('=')[1].toLowerCase() : 'sg';
  return CITY_CONFIG[city] ? city : 'sg';
}

// ─── ステップ1: 古いデータを削除 ───────────────────────────────
function purgeExpiredData(eventsPath) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let deleted = 0;

  if (fs.existsSync(eventsPath)) {
    const all    = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
    const before = all.length;
    const fresh  = all.filter(e => e.end_date && new Date(e.end_date) >= today);
    deleted = before - fresh.length;
    fs.writeFileSync(eventsPath, JSON.stringify(fresh, null, 2), 'utf8');
  } else {
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    fs.writeFileSync(eventsPath, '[]', 'utf8');
  }

  console.log(`🗑  古いデータを削除: ${deleted}件`);
}

// ─── ステップ2: RSS取得 ─────────────────────────────────────────
async function fetchRssItems(feeds, cityKey = 'sg') {
  const daysBack        = 4;
  const maxPerFeed      = 20;
  const globalMinDescLen = cityKey === 'bkk' ? 50 : 100;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  const allItems = [];

  for (const feed of feeds) {
    const minDescLen    = feed.minDescLen !== undefined ? feed.minDescLen : globalMinDescLen;
    const skipDateFilter = feed.skipDateFilter !== undefined ? feed.skipDateFilter : false;
    const feedUrl       = feed.url;

    try {
      console.log(`\n  📡 取得中: ${feed.name}`);
      const result = await parser.parseURL(feedUrl);
      const raw = result.items || [];

      const filtered = raw
        .slice(0, maxPerFeed)
        .filter(item => {
          if (!skipDateFilter) {
            const pub = item.pubDate ? new Date(item.pubDate) : new Date();
            if (pub < cutoff) return false;
          }

          const text = `${item.title || ''} ${item.contentSnippet || item.summary || ''}`.toLowerCase();
          if (EXCLUDE_KEYWORDS.some(kw => text.includes(kw))) return false;

          if (!item.title || item.title.trim().length === 0) return false;
          const desc = item.contentSnippet || item.summary || '';
          if (desc.length < minDescLen) return false;

          return true;
        })
        .map(item => ({
          title:       item.title || '',
          description: item.contentSnippet || item.summary || '',
          link:        item.link || '',
          pubDate:     item.pubDate || new Date().toISOString(),
          image:       item.enclosure?.url || item['media:content']?.['$']?.url
                       || item.itunesImage?.['$']?.href || item.itunesImage || null,
          source:      feed.name,
        }));

      console.log(`  ✅ ${raw.length}件取得 → 粗いフィルター後${filtered.length}件`);
      allItems.push(...filtered);
    } catch (e) {
      console.error(`  ❌ フェッチ失敗: ${feed.name} — ${e.message}`);
    }
  }

  return allItems;
}

// ─── ステップ3: 重複チェック ────────────────────────────────────
function deduplicateItems(newItems, eventsPath) {
  const existing = fs.existsSync(eventsPath) ? JSON.parse(fs.readFileSync(eventsPath, 'utf8')) : [];

  const existingUrls = new Set(existing.map(e => e.url).filter(Boolean));
  const existingTitles = existing.map(e => normalizeTitle(e.store || ''));

  function normalizeTitle(t) {
    return t.toLowerCase().replace(/[^a-z0-9　-鿿]/g, ' ').trim().split(/\s+/).filter(Boolean);
  }

  function isSimilarTitle(titleA, titleB) {
    const wordsA = new Set(normalizeTitle(titleA));
    const wordsB = new Set(normalizeTitle(titleB));
    if (wordsA.size === 0 || wordsB.size === 0) return false;
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const ratio = intersection.length / Math.min(wordsA.size, wordsB.size);
    return ratio >= 0.5;
  }

  const deduplicated = newItems.filter(item => {
    if (item.link && existingUrls.has(item.link)) return false;
    if (existingTitles.some(existTitle => isSimilarTitle(item.title, existTitle.join(' ')))) return false;
    return true;
  });

  console.log(`\n  📊 重複除外後: ${newItems.length}件 → ${deduplicated.length}件 → Claude APIへ送信`);
  return deduplicated;
}

// ─── ステップ4: Instagram投稿取得 ───────────────────────────────
async function fetchInstagramPosts(accounts = []) {
  const pageToken = process.env.INSTAGRAM_PAGE_TOKEN;
  const igUserId  = process.env.INSTAGRAM_IG_USER_ID;

  if (!pageToken || !igUserId || accounts.length === 0) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 4);

  const allItems = [];

  for (const username of accounts) {
    try {
      console.log(`\n  📸 取得中: @${username}`);
      const url = new URL(`https://graph.facebook.com/v25.0/${igUserId}`);
      url.searchParams.set(
        'fields',
        `business_discovery.username(${username}){media{caption,media_url,timestamp,permalink}}`
      );
      url.searchParams.set('access_token', pageToken);

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
      const data = await res.json();

      if (!data.business_discovery?.media?.data) {
        console.log(`  ⚠️  @${username}: 取得失敗`);
        continue;
      }

      const posts = data.business_discovery.media.data;
      let count = 0;

      for (const post of posts) {
        if (new Date(post.timestamp) < cutoff) continue;
        if (!post.caption) continue;

        // キャプション内の外部URL（instagram.com以外）を抽出
        const urlMatch = post.caption.match(/https?:\/\/(?!(?:www\.)?instagram\.com)[^\s\n,!<>"]+/);
        const externalLink = urlMatch ? urlMatch[0].replace(/[.,;:!?)]+$/, '') : null;

        const firstLine = post.caption.split('\n')[0].slice(0, 80);
        allItems.push({
          title:       firstLine,
          description: post.caption.slice(0, 800),
          link:        externalLink || post.permalink,
          pubDate:     post.timestamp,
          image:       post.media_url || null,
          source:      `Instagram / @${username}`,
        });
        count++;
      }

      console.log(`  ✅ ${count}件取得`);
    } catch (e) {
      console.log(`  ⚠️  @${username}: エラー (${e.message})`);
    }
  }

  return allItems;
}

// ─── 取得結果をファイルに保存（8:00のサマリー通知で集計）────────
function saveFetchSummary({ cityKey, cityLabel, accepted, rejected, newItems, rawTotal, uniqueTotal, sourceStats }) {
  const summaryPath = path.join(__dirname, '..', 'logs', `fetch-summary-${cityKey}.json`);
  const summary = {
    cityKey,
    cityLabel,
    accepted,
    rejected,
    rawTotal,
    uniqueTotal,
    sourceStats: sourceStats || {},
    newItems: (newItems || []).map(e => ({ emoji: e.emoji, store: e.store, period: e.period || e.start_date || '', source: e.source || '' })),
    date: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`  💾 取得サマリー保存: ${summaryPath}`);
}

// ─── 最終重複チェック（events.json全体） ────────────────────────
function deduplicateSaved(eventsPath) {
  const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  const before = events.length;

  function normalizeTitle(t) {
    return (t || '').toLowerCase().replace(/[^a-z0-9　-鿿]/g, ' ').trim().split(/\s+/).filter(Boolean);
  }
  function isSimilar(a, b) {
    const wa = new Set(normalizeTitle(a));
    const wb = new Set(normalizeTitle(b));
    if (wa.size === 0 || wb.size === 0) return false;
    const common = [...wa].filter(w => wb.has(w)).length;
    return common / Math.min(wa.size, wb.size) >= 0.6;
  }

  const seen = [];
  const deduped = events.filter(e => {
    // URL完全一致
    if (e.url && seen.some(s => s.url && s.url === e.url)) return false;
    // 店名・タイトル類似
    if (seen.some(s => isSimilar(s.store, e.store))) return false;
    seen.push(e);
    return true;
  });

  const removed = before - deduped.length;
  if (removed > 0) {
    fs.writeFileSync(eventsPath, JSON.stringify(deduped, null, 2), 'utf8');
    console.log(`  🧹 全体重複チェック: ${removed}件削除（${before} → ${deduped.length}件）`);
  } else {
    console.log(`  ✅ 全体重複チェック: 重複なし（${before}件）`);
  }
  return removed;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  const cityKey = parseCity();
  const conf = CITY_CONFIG[cityKey];

  console.log(`\n🌴 fetch-events.js 開始（${conf.nameJa}）\n`);
  console.log('━'.repeat(50));

  purgeExpiredData(conf.eventsPath);

  const { feeds, instagramAccounts } = loadActiveSources(cityKey);

  console.log('\n📡 RSSフィード取得中...');
  const rssItems = await fetchRssItems(feeds, cityKey);

  console.log('\n📸 Instagram投稿取得中...');
  const igItems = await fetchInstagramPosts(instagramAccounts);

  const rawItems = [...rssItems, ...igItems];
  console.log(`\n  合計取得: ${rawItems.length}件（RSS: ${rssItems.length}件 / IG: ${igItems.length}件）`);

  if (rawItems.length === 0) {
    console.log('\n✅ 新着なし。終了します。\n');
    saveFetchSummary({ cityKey, cityLabel: conf.nameJa, accepted: 0, rejected: 0, newItems: [], rawTotal: 0, uniqueTotal: 0 });
    return;
  }

  const uniqueItems = deduplicateItems(rawItems, conf.eventsPath);

  if (uniqueItems.length === 0) {
    console.log('✅ 重複なし新着なし。終了します。\n');
    saveFetchSummary({ cityKey, cityLabel: conf.nameJa, accepted: 0, rejected: 0, newItems: [], rawTotal: rawItems.length, uniqueTotal: 0 });
    return;
  }

  console.log('\n🤖 Claude APIでフィルタリング開始...');
  const { filterAndSave } = require('./filter-events');
  const result = await filterAndSave(uniqueItems, { eventsPath: conf.eventsPath, cityKey });

  console.log('\n🧹 全体重複チェック中...');
  deduplicateSaved(conf.eventsPath);

  console.log('\n🎉 fetch-events.js 完了\n');

  saveFetchSummary({
    cityKey,
    cityLabel:   conf.nameJa,
    accepted:    result.accepted,
    rejected:    result.rejected,
    newItems:    result.newItems,
    rawTotal:    rawItems.length,
    uniqueTotal: uniqueItems.length,
    sourceStats: result.sourceStats,
  });
}

if (require.main === module) {
  main().catch(e => {
    console.error('\n❌ 予期しないエラー:', e.message);
    process.exit(1);
  });
}
