#!/usr/bin/env node
/**
 * イベント取得サマリーをまとめてLINEに通知する
 * 毎週 月・金 8:00 SGT にcronで実行（fetch-events完了後）
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');

// BKK/SYDは一時停止中で取得自体を行っていないため、通知対象からも除外する（2026-08-29）
const CITIES   = ['sg'];
const LOGS_DIR = path.join(__dirname, '../logs');

const CITY_NAMES = { sg: 'シンガポール', bkk: 'バンコク', syd: 'シドニー' };
const SOURCE_ANALYSIS_PATH = path.join(LOGS_DIR, 'source-analysis-result.json');
const DISCOVER_RESULT_PATH = path.join(LOGS_DIR, 'discover-sources-result.json');
const LIFE_INFO_SUMMARY_PATH = path.join(LOGS_DIR, 'fetch-life-info-summary.json');
// ラベル・順番は public/index.html のカテゴリチップ（#screen-news / #screen-home）と一致させること
const LIFE_INFO_CAT_LABELS = { admin: 'SG政府', transport: '都市開発・交通', health: '医療・健康', weather: '天候・災害', community: 'コミュニティ', education: '教育・子育て' };
const EVENT_CAT_LABELS = { event: 'イベント', show: '展示・公演', gourmet: 'グルメ・フェア', sale: 'プロモ・お得', opening: '新規オープン', travel: '旅行' };

// カテゴリ別件数を、チップの表示順（オブジェクトのキー順）で整形する。
// catCounts のキー順はその日の取得データ次第でバラつくため、ラベル定義側の順序に従う。
function formatCatCounts(catCounts, labels) {
  if (!catCounts) return null;
  const parts = Object.keys(labels)
    .filter(k => catCounts[k])
    .map(k => `${labels[k]}:${catCounts[k]}`);
  return parts.length > 0 ? parts.join(' / ') : null;
}

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

  const lines = [`🌴 SG在住Navi 取込み結果`, `📅 ${now}（SGT）`, ''];

  let totalAccepted = 0;

  lines.push('━━ 🏖️ おでかけ情報 ━━');
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

    const catLine = formatCatCounts(s.catCounts, EVENT_CAT_LABELS);
    if (catLine) lines.push(`  ${catLine}`);

    if (!s.newItems || s.newItems.length === 0) {
      lines.push('  （新着なし）');
    }
  }

  lines.push(`合計 ${totalAccepted}件採用`);

  // くらし情報セクションを追記（当日のJSONが存在する場合のみ）
  try {
    if (fs.existsSync(LIFE_INFO_SUMMARY_PATH)) {
      const li = JSON.parse(fs.readFileSync(LIFE_INFO_SUMMARY_PATH, 'utf8'));
      if (li.date === today) {
        lines.push('');
        lines.push('━━ 🏛️ くらし情報 ━━');
        lines.push(`📰 ${li.accepted}件採用 / ${li.rawTotal}件取得`);
        const catLine = formatCatCounts(li.catCounts, LIFE_INFO_CAT_LABELS);
        if (catLine) {
          lines.push(`  ${catLine}`);
        } else {
          lines.push('  （新着なし）');
        }
      }
    }
  } catch (e) {
    console.warn('生活情報サマリーの読み込みに失敗:', e.message);
  }

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
            for (const label of (cityData.removed || [])) lines.push(`🚫 永久除外: ${label}`);
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
          if (d.invalidCount > 0) {
            lines.push(`  ⚠️ 無効な候補${d.invalidCount}件あり（discover-sources.log参照）`);
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
}

main().catch(e => {
  console.error('❌ エラー:', e.message);
  process.exit(1);
});
