#!/usr/bin/env node
// 既存events.jsonのInstagram画像URLを再取得して更新するワンショットスクリプト
// 使い方: node scripts/refresh-ig-images.js [--city=bkk|syd|all]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');

const pageToken = process.env.INSTAGRAM_PAGE_TOKEN;
const igUserId  = process.env.INSTAGRAM_IG_USER_ID;

const CITIES = {
  sg:  path.join(__dirname, '..', 'data', 'sg',  'events.json'),
  bkk: path.join(__dirname, '..', 'data', 'bkk', 'events.json'),
  syd: path.join(__dirname, '..', 'data', 'syd', 'events.json'),
};

function parseCity() {
  const arg = process.argv.find(a => a.startsWith('--city='));
  const v = arg ? arg.split('=')[1] : 'all';
  if (v === 'all') return Object.keys(CITIES);
  return v.split(',').filter(c => CITIES[c]);
}

function needsRefresh(image) {
  if (!image) return true;
  if (image.includes('cdninstagram.com')) return true;
  return false;
}

async function fetchAccountMedia(username) {
  const url = new URL(`https://graph.facebook.com/v25.0/${igUserId}`);
  url.searchParams.set(
    'fields',
    `business_discovery.username(${username}){media.limit(50){media_url,thumbnail_url,media_type,permalink,children{media_url,thumbnail_url}}}`
  );
  url.searchParams.set('access_token', pageToken);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  const data = await res.json();
  if (!data.business_discovery?.media?.data) return [];
  return data.business_discovery.media.data;
}

async function refreshCity(city) {
  const eventsPath = CITIES[city];
  const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));

  // 更新対象だけ抽出し、アカウント別にグループ化
  const toRefresh = events.filter(e =>
    e.source && e.source.startsWith('Instagram /') && needsRefresh(e.image)
  );
  if (toRefresh.length === 0) {
    console.log(`${city}: 更新対象なし`);
    return;
  }

  // permalink → event のマップ（同じURLが複数あることはないはず）
  const byPermalink = new Map(toRefresh.map(e => [e.url, e]));

  // アカウント → 対象イベントのURL集合
  const accountMap = new Map();
  for (const e of toRefresh) {
    const m = e.source.match(/@(\w+)/);
    if (!m) continue;
    const username = m[1];
    if (!accountMap.has(username)) accountMap.set(username, new Set());
    accountMap.get(username).add(e.url);
  }

  let updated = 0;
  console.log(`\n${city.toUpperCase()}: ${toRefresh.length}件を${accountMap.size}アカウントから更新`);

  for (const [username, permalinks] of accountMap) {
    try {
      process.stdout.write(`  @${username} 取得中...`);
      const posts = await fetchAccountMedia(username);
      let found = 0;
      for (const post of posts) {
        if (!permalinks.has(post.permalink)) continue;
        const ev = byPermalink.get(post.permalink);
        if (!ev) continue;
        const newImage = post.media_type === 'VIDEO'
          ? (post.thumbnail_url || null)
          : post.media_type === 'CAROUSEL_ALBUM'
            ? (post.children?.data?.[0]?.media_url || post.media_url || null)
            : (post.media_url || null);
        if (newImage) {
          ev.image = newImage;
          updated++;
          found++;
        }
      }
      console.log(` ${posts.length}件取得 → ${found}件マッチ`);
    } catch (e) {
      console.log(` ⚠️ エラー: ${e.message}`);
    }
  }

  fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2), 'utf8');
  console.log(`  ✅ ${updated}件の画像URLを更新 → ${eventsPath}`);
}

(async () => {
  if (!pageToken || !igUserId) {
    console.error('INSTAGRAM_PAGE_TOKEN / INSTAGRAM_IG_USER_ID が未設定');
    process.exit(1);
  }
  const cities = parseCity();
  for (const city of cities) await refreshCity(city);
  console.log('\n完了');
})();
