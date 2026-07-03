#!/usr/bin/env node
/**
 * イベント取得サマリーをまとめてLINEに通知する
 * 毎週 月・金 8:00 SGT にcronで実行（fetch-events完了後）
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');

const CITIES   = ['sg', 'bkk', 'syd'];
const LOGS_DIR = path.join(__dirname, '../logs');

const CITY_NAMES = { sg: 'シンガポール', bkk: 'バンコク', syd: 'シドニー' };
const SOURCE_ANALYSIS_PATH = path.join(LOGS_DIR, 'source-analysis-result.json');
const DISCOVER_RESULT_PATH = path.join(LOGS_DIR, 'discover-sources-result.json');

async function pushToLine(text) {
  const token  = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const userId = process.env.LINE_USER_ID;
  if (!token || !userId) {
    console.warn('⚠️  LINE credentials未設定のため通知をスキップ');
    return;
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('LINE通知エラー:', err.message || res.status);
  }
}

async function main() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  const now   = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Singapore', hour12: false });

  const lines = [`🌴 おでかけNavi イベント取込み結果`, `📅 ${now}（SGT）`, ''];

  let totalAccepted = 0;

  for (const cityKey of CITIES) {
    const summaryPath = path.join(LOGS_DIR, `fetch-summary-${cityKey}.json`);

    if (!fs.existsSync(summaryPath)) {
      lines.push(`— ${cityKey.toUpperCase()}: データなし`);
      continue;
    }

    const s = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

    if (s.date !== today) {
      lines.push(`— ${s.cityLabel}: 本日未実行`);
      continue;
    }

    totalAccepted += s.accepted;

    lines.push(`【${s.cityLabel}】${s.accepted}件採用 / ${s.rawTotal}件取得`);

    // ソース別サマリー
    if (s.sourceStats && Object.keys(s.sourceStats).length > 0) {
      const srcParts = Object.entries(s.sourceStats)
        .filter(([, v]) => v.sent > 0)
        .sort((a, b) => b[1].sent - a[1].sent)
        .map(([src, v]) => `${src}(${v.accepted}/${v.sent})`);
      lines.push(`  📡 ${srcParts.join(' / ')}`);
    }

    if (!s.newItems || s.newItems.length === 0) {
      lines.push('  （新着なし）');
    }

    lines.push('');
  }

  lines.push(`合計 ${totalAccepted}件採用`);

  // ソース分析セクションを追記（当日のJSONが存在する場合のみ）
  try {
    if (fs.existsSync(SOURCE_ANALYSIS_PATH)) {
      const analysisData = JSON.parse(fs.readFileSync(SOURCE_ANALYSIS_PATH, 'utf8'));
      if (analysisData.date === today) {
        lines.push('');
        lines.push('━━ ソース分析 ━━');
        for (const cityKey of CITIES) {
          const cityName = CITY_NAMES[cityKey] || cityKey;
          const cityData = analysisData.cities?.[cityKey];
          if (!cityData) continue;
          if (!cityData.changed) {
            lines.push(`✅ ${cityName}: 変更なし（アクティブ${cityData.activeCount}ソース）`);
          } else {
            lines.push(`【${cityName}】`);
            for (const label of (cityData.removed || [])) lines.push(`❌ 停止: ${label}`);
            for (const label of (cityData.added   || [])) lines.push(`➕ 追加: ${label}`);
          }
        }
      }
    }
  } catch (e) {
    console.warn('ソース分析結果の読み込みに失敗:', e.message);
  }

  // ソース候補探索セクション（discover-sources-result.json が当日のものなら追記）
  try {
    if (fs.existsSync(DISCOVER_RESULT_PATH)) {
      const discoverData = JSON.parse(fs.readFileSync(DISCOVER_RESULT_PATH, 'utf8'));
      if (discoverData.date === today) {
        lines.push('');
        lines.push('━━ ソース候補 ━━');
        for (const cityKey of CITIES) {
          const cityName = CITY_NAMES[cityKey] || cityKey;
          const d = discoverData.cities?.[cityKey];
          if (!d) continue;
          const parts = [...(d.topIG || []), ...(d.topFeed || [])];
          if (parts.length > 0) {
            lines.push(`🔎 ${cityName}: ${parts.join(' / ')}`);
          } else {
            lines.push(`🔎 ${cityName}: 新候補なし`);
          }
        }
      }
    }
  } catch (e) {
    console.warn('ソース候補探索結果の読み込みに失敗:', e.message);
  }

  // LINE 5000文字制限対応
  let message = lines.join('\n');
  if (message.length > 4900) {
    message = message.slice(0, 4900) + '\n…（文字数制限のため省略）';
  }

  console.log(message);

  await pushToLine(message);
  console.log('📱 LINE通知送信完了');

  if (totalAccepted > 0 && !process.argv.includes('--skip-push')) {
    const port = process.env.PORT || 3000;
    fetch(`http://localhost:${port}/api/notify-events-updated`, {
      method: 'POST',
      headers: { 'x-admin-secret': process.env.ADMIN_SECRET || '' },
    })
      .then(() => console.log('🔔 Webプッシュ通知送信完了'))
      .catch(() => {});
  }
}

main().catch(e => {
  console.error('❌ エラー:', e.message);
  process.exit(1);
});
