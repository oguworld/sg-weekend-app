#!/usr/bin/env node
// scripts/discover-sources.js
// ソース候補プール (source-pool.json) をプローブ・スコアリングして
// source-candidates.json を自動更新する（週1回実行想定）
// 実行: node discover-sources.js [--city=sg|bkk|syd|all] [--dry-run] [--force]
// --force: lastProbed に関わらず全ソースを再プローブ

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Anthropic = require('@anthropic-ai/sdk');
const Parser    = require('rss-parser');
const fs        = require('fs');
const path      = require('path');
const axios     = require('axios');

const client = new Anthropic();
const parser = new Parser({ timeout: 10000 });

// ─── 設定 ─────────────────────────────────────────────────────────
const PROBE_DAYS         = 7;   // 投稿取得対象の日数
const PROBE_COOLDOWN     = 5;   // 再プローブまでの最低日数
const CANDIDATES_IG_MAX  = 10;  // 都市ごとの IG 候補上限数
const CANDIDATES_FEED_MAX = 5;  // 都市ごとの Feed 候補上限数
const SCORE_BATCH_SIZE   = 10;  // Claude に一度に渡す投稿数

const CITY_NAMES = { sg: 'シンガポール', bkk: 'バンコク', syd: 'シドニー' };

const PATHS = {
  pool:            path.join(__dirname, '..', 'data', 'source-pool.json'),
  sources:         path.join(__dirname, '..', 'data', 'sources.json'),
  candidates:      path.join(__dirname, '..', 'data', 'source-candidates.json'),
  log:             path.join(__dirname, '..', 'logs', 'discover-sources.log'),
  discoverResult:  path.join(__dirname, '..', 'logs', 'discover-sources-result.json'),
};

// ─── ユーティリティ ────────────────────────────────────────────────
const isDryRun  = process.argv.includes('--dry-run');
const isForce   = process.argv.includes('--force');
const isNoNotify = process.argv.includes('--no-notify');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(PATHS.log, line + '\n');
}

function loadJson(filePath, defaultVal) {
  if (!fs.existsSync(filePath)) return defaultVal;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return defaultVal; }
}

function saveJson(filePath, data) {
  if (isDryRun) { console.log(`[dry-run] 書き込みをスキップ: ${path.basename(filePath)}`); return; }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function isStale(lastProbed) {
  if (!lastProbed || isForce) return true;
  const daysSince = (Date.now() - new Date(lastProbed).getTime()) / 864e5;
  return daysSince >= PROBE_COOLDOWN;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ─── LINE 通知 ─────────────────────────────────────────────────────
async function notifyLINE(message) {
  if (isDryRun) { console.log('[dry-run] LINE:\n' + message); return; }
  const token  = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const userId = process.env.LINE_USER_ID;
  if (!token || !userId) return;
  try {
    await axios.post('https://api.line.me/v2/bot/message/push', {
      to: userId,
      messages: [{ type: 'text', text: message }],
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  } catch (e) {
    log(`LINE通知失敗: ${e.message}`);
  }
}

// ─── Instagram プローブ ────────────────────────────────────────────
async function probeInstagram(username) {
  const pageToken = process.env.INSTAGRAM_PAGE_TOKEN;
  const igUserId  = process.env.INSTAGRAM_IG_USER_ID;
  if (!pageToken || !igUserId) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PROBE_DAYS);

  try {
    const url = new URL(`https://graph.facebook.com/v25.0/${igUserId}`);
    url.searchParams.set(
      'fields',
      `business_discovery.username(${username}){media{caption,media_type,timestamp}}`
    );
    url.searchParams.set('access_token', pageToken);

    const res  = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    if (!data.business_discovery?.media?.data) return [];

    return data.business_discovery.media.data
      .filter(p => new Date(p.timestamp) >= cutoff && p.caption)
      .map(p => ({
        title:       p.caption.split('\n')[0].slice(0, 80),
        description: p.caption.slice(0, 400),
      }));
  } catch (e) {
    log(`  ⚠️ @${username}: ${e.message}`);
    return [];
  }
}

// ─── RSS プローブ ──────────────────────────────────────────────────
async function probeRss(feedUrl, feedName) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PROBE_DAYS);
  try {
    const result = await parser.parseURL(feedUrl);
    return (result.items || [])
      .filter(item => {
        const pub = item.pubDate ? new Date(item.pubDate) : new Date();
        return pub >= cutoff && item.title;
      })
      .slice(0, 20)
      .map(item => ({
        title:       item.title || '',
        description: (item.contentSnippet || item.summary || '').slice(0, 300),
      }));
  } catch (e) {
    log(`  ⚠️ ${feedName}: ${e.message}`);
    return [];
  }
}

// ─── Claude 軽量スコアリング ───────────────────────────────────────
// スコア 6 以上の投稿数 (potentialYield) と平均スコアを返す
async function scoreWithClaude(posts, cityName) {
  if (posts.length === 0) return { potentialYield: 0, avgScore: 0, totalCount: 0 };

  const allScores = [];

  for (let i = 0; i < posts.length; i += SCORE_BATCH_SIZE) {
    const batch     = posts.slice(i, i + SCORE_BATCH_SIZE);
    const postsJson = JSON.stringify(
      batch.map((p, idx) => ({ idx, title: p.title, description: p.description })),
      null, 2
    );

    try {
      const response = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system:     `あなたは${cityName}在住の日本人向けおでかけアプリの審査員です。投稿のスコアリングのみ行います。`,
        messages: [{
          role:    'user',
          content: `以下の投稿について、「${cityName}在住の日本人が週末のおでかけ・体験として興味を持つ可能性」を1〜10でスコアしてください（6以上=採用レベル）。

採用対象：期間限定イベント、展示、フードフェア、新規オープン、セール、ショッピングモールのキャンペーン
非採用：日常商品紹介、スポーツ試合中継、求人、常設店の通常メニュー紹介、政治・コミュニティ系

JSON配列のみ返してください（前置き・コードブロック不要）: [{"idx": 0, "score": 7}, ...]

投稿:\n${postsJson}`,
        }],
      });

      const raw    = response.content[0].text;
      const match  = raw.match(/\[[\s\S]*?\]/);
      if (!match) { log(`  Claudeレスポンス解析失敗`); continue; }
      const parsed = JSON.parse(match[0]);
      allScores.push(...parsed);
    } catch (e) {
      log(`  Claudeスコアリングエラー: ${e.message}`);
    }
  }

  if (allScores.length === 0) return { potentialYield: 0, avgScore: 0, totalCount: posts.length };

  const potentialYield = allScores.filter(s => s.score >= 6).length;
  const avgScore       = Math.round(allScores.reduce((s, r) => s + r.score, 0) / allScores.length * 10) / 10;
  return { potentialYield, avgScore, totalCount: posts.length };
}

// ─── 都市別プローブ処理 ────────────────────────────────────────────
async function probeCity(cityKey, pool, sources) {
  const cityName = CITY_NAMES[cityKey];
  const cityPool = pool[cityKey] || { feeds: [], instagramAccounts: [] };
  const citySrc  = sources[cityKey] || { feeds: [], instagramAccounts: [] };

  const activeUrls      = new Set(citySrc.feeds.map(f => f.url));
  const activeUsernames = new Set(citySrc.instagramAccounts.map(a => a.username));

  log(`\n【${cityName}】プローブ開始`);
  let probedCount = 0;
  let skippedCount = 0;

  // Instagram
  for (const account of cityPool.instagramAccounts || []) {
    if (activeUsernames.has(account.username)) {
      log(`  ⏭ @${account.username}: sources.json にあるためスキップ`);
      skippedCount++;
      continue;
    }
    if (!isStale(account.lastProbed)) {
      log(`  ⏭ @${account.username}: 最近プローブ済み (${account.lastProbed})`);
      skippedCount++;
      continue;
    }

    log(`  📸 @${account.username} をプローブ中...`);
    const posts = await probeInstagram(account.username);
    const { potentialYield, avgScore, totalCount } = await scoreWithClaude(posts, cityName);

    account.lastProbed     = today();
    account.totalCount     = totalCount;
    account.potentialYield = potentialYield;
    account.avgScore       = avgScore;
    probedCount++;

    log(`  ✅ @${account.username}: ${totalCount}件取得 → 潜在採用${potentialYield}件 (avg:${avgScore})`);
  }

  // RSS フィード
  for (const feed of cityPool.feeds || []) {
    if (activeUrls.has(feed.url)) {
      log(`  ⏭ ${feed.name}: sources.json にあるためスキップ`);
      skippedCount++;
      continue;
    }
    if (!isStale(feed.lastProbed)) {
      log(`  ⏭ ${feed.name}: 最近プローブ済み (${feed.lastProbed})`);
      skippedCount++;
      continue;
    }

    log(`  📡 ${feed.name} をプローブ中...`);
    const items = await probeRss(feed.url, feed.name);
    const { potentialYield, avgScore, totalCount } = await scoreWithClaude(items, cityName);

    feed.lastProbed     = today();
    feed.totalCount     = totalCount;
    feed.potentialYield = potentialYield;
    feed.avgScore       = avgScore;
    probedCount++;

    log(`  ✅ ${feed.name}: ${totalCount}件取得 → 潜在採用${potentialYield}件 (avg:${avgScore})`);
  }

  log(`  📊 完了: プローブ${probedCount}件 / スキップ${skippedCount}件`);
  return cityPool;
}

// ─── source-candidates.json 再構築 ────────────────────────────────
function buildCandidates(pool, sources) {
  const result = {
    _note:      'discover-sources.jsにより自動更新。手動編集は次回実行時に上書きされます。新しいアカウント追加は source-pool.json へ。',
    _updatedAt: today(),
  };

  for (const cityKey of Object.keys(CITY_NAMES)) {
    const cityPool = pool[cityKey] || { feeds: [], instagramAccounts: [] };
    const citySrc  = sources[cityKey] || { feeds: [], instagramAccounts: [] };

    const activeUrls      = new Set(citySrc.feeds.map(f => f.url));
    const activeUsernames = new Set(citySrc.instagramAccounts.map(a => a.username));

    // スコア済みのみ対象。potentialYield 降順 → avgScore 降順
    const scoredIG = (cityPool.instagramAccounts || [])
      .filter(a => !activeUsernames.has(a.username) && a.potentialYield != null)
      .sort((a, b) => b.potentialYield - a.potentialYield || b.avgScore - a.avgScore);

    const scoredFeeds = (cityPool.feeds || [])
      .filter(f => !activeUrls.has(f.url) && f.potentialYield != null)
      .sort((a, b) => b.potentialYield - a.potentialYield || b.avgScore - a.avgScore);

    // 未スコアは末尾に残す（プローブ失敗・初回前）
    const unscoredIG = (cityPool.instagramAccounts || [])
      .filter(a => !activeUsernames.has(a.username) && a.potentialYield == null);
    const unscoredFeeds = (cityPool.feeds || [])
      .filter(f => !activeUrls.has(f.url) && f.potentialYield == null);

    const toCandidate = (src, keys) =>
      Object.fromEntries(keys.filter(k => src[k] != null).map(k => [k, src[k]]));

    result[cityKey] = {
      instagramAccounts: [
        ...scoredIG.slice(0, CANDIDATES_IG_MAX).map(a =>
          toCandidate(a, ['username', 'contentFocus', 'reason', 'potentialYield', 'avgScore', 'lastProbed'])
        ),
        ...unscoredIG.map(a => toCandidate(a, ['username', 'contentFocus', 'reason'])),
      ],
      feeds: [
        ...scoredFeeds.slice(0, CANDIDATES_FEED_MAX).map(f =>
          toCandidate(f, ['url', 'name', 'contentFocus', 'reason', 'options', 'potentialYield', 'avgScore', 'lastProbed'])
        ),
        ...unscoredFeeds.map(f => toCandidate(f, ['url', 'name', 'contentFocus', 'reason', 'options'])),
      ],
    };
  }

  return result;
}

// ─── LINE 通知レポート ─────────────────────────────────────────────
function buildReport(candidates, cities) {
  const lines = [
    isDryRun ? '🔍 [DRY-RUN] ソース候補探索完了' : '🔎 ソース候補探索完了',
    '━'.repeat(22),
  ];

  for (const cityKey of cities) {
    const cityName = CITY_NAMES[cityKey];
    const cands = candidates[cityKey];
    if (!cands) continue;

    const topIG   = cands.instagramAccounts.filter(a => a.potentialYield != null).slice(0, 5);
    const topFeed = cands.feeds.filter(f => f.potentialYield != null).slice(0, 3);

    lines.push(`\n【${cityName}】`);

    if (topIG.length > 0) {
      lines.push('📸 IG候補（潜在採用数順）:');
      for (const a of topIG) {
        lines.push(`  @${a.username}: ${a.potentialYield}件 (avg:${a.avgScore})`);
      }
    } else {
      lines.push('📸 IGスコアデータなし');
    }

    if (topFeed.length > 0) {
      lines.push('📡 RSS候補:');
      for (const f of topFeed) {
        lines.push(`  ${f.name}: ${f.potentialYield}件 (avg:${f.avgScore})`);
      }
    }
  }

  lines.push('');
  lines.push(`実行: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Singapore' })} SGT`);
  if (isDryRun) lines.push('（dry-run: 実際の変更は行いません）');

  return lines.join('\n');
}

// ─── メイン ────────────────────────────────────────────────────────
async function main() {
  const cityArg = (process.argv.find(a => a.startsWith('--city=')) || '--city=all').split('=')[1];
  const cities  = cityArg === 'all' ? Object.keys(CITY_NAMES) : [cityArg];

  log(`\n===== discover-sources.js 開始 (都市: ${cities.join(', ')}${isDryRun ? ' / DRY-RUN' : ''}${isForce ? ' / FORCE' : ''}) =====`);

  const pool    = loadJson(PATHS.pool, {});
  const sources = loadJson(PATHS.sources, {});

  // 都市ごとにプローブ
  for (const cityKey of cities) {
    if (!CITY_NAMES[cityKey]) { log(`未知の都市コード: ${cityKey}`); continue; }
    pool[cityKey] = await probeCity(cityKey, pool, sources);
  }

  // pool を保存（スコアデータを永続化）
  saveJson(PATHS.pool, pool);

  // candidates を再構築・保存
  const candidates = buildCandidates(pool, sources);
  saveJson(PATHS.candidates, candidates);

  const report = buildReport(candidates, cities);
  log('\n' + report);

  if (isNoNotify) {
    // --no-notify: notify-fetch-summary.js に渡す用のJSONを書き出す
    const todayStr = today();
    const result = { date: todayStr, cities: {} };
    for (const cityKey of cities) {
      const cands = candidates[cityKey];
      if (!cands) continue;
      result.cities[cityKey] = {
        topIG:   cands.instagramAccounts.filter(a => a.potentialYield != null).slice(0, 3)
                   .map(a => `@${a.username}(${a.potentialYield}件)`),
        topFeed: cands.feeds.filter(f => f.potentialYield != null).slice(0, 2)
                   .map(f => `${f.name}(${f.potentialYield}件)`),
      };
    }
    if (!isDryRun) {
      fs.writeFileSync(PATHS.discoverResult, JSON.stringify(result, null, 2), 'utf8');
      log(`候補探索結果を書き出し: ${PATHS.discoverResult}`);
    }
  } else {
    await notifyLINE(report);
  }

  log('===== discover-sources.js 完了 =====\n');
}

main().catch(e => {
  log(`予期しないエラー: ${e.message}`);
  process.exit(1);
});
