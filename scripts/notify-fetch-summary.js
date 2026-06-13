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

    // 採用イベント一覧
    if (s.newItems && s.newItems.length > 0) {
      for (const item of s.newItems) {
        lines.push(`  ${item.emoji} ${item.store}${item.period ? `（${item.period}）` : ''}`);
      }
    } else {
      lines.push('  （新着なし）');
    }

    lines.push('');
  }

  lines.push(`合計 ${totalAccepted}件採用`);

  const message = lines.join('\n');
  console.log(message);

  await pushToLine(message);
  console.log('📱 LINE通知送信完了');

  if (totalAccepted > 0) {
    const port = process.env.PORT || 3000;
    fetch(`http://localhost:${port}/api/notify-events-updated`, { method: 'POST' })
      .then(() => console.log('🔔 Webプッシュ通知送信完了'))
      .catch(() => {});
  }
}

main().catch(e => {
  console.error('❌ エラー:', e.message);
  process.exit(1);
});
