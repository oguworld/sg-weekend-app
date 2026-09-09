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
const LIFE_INFO_SUMMARY_PATH = path.join(LOGS_DIR, 'fetch-life-info-summary.json'); // 最新1回分（設計書187で現役使用に復帰）
const LIFE_INFO_HISTORY_PATH = path.join(LOGS_DIR, 'fetch-life-info-summary-history-sg.jsonl');
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

// fetch-events.jsは1日3回（run-fetch-all.sh 7:00 + run-fetch-extra.sh 12:30/19:30）実行され、
// 設計書187により通知も1日3回・その都度その回だけの件数を通知する方式に戻した。
// 最新1回分の上書きファイル（fetch-events.js の saveFetchSummary() が毎回更新）をそのまま読む。
function loadLatestSummary(cityKey) {
  const summaryPath = path.join(LOGS_DIR, `fetch-summary-${cityKey}.json`);
  if (!fs.existsSync(summaryPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch (e) {
    console.warn(`イベントサマリー(${cityKey})の読み込みに失敗:`, e.message);
    return null;
  }
}

// 2026-09-07に「通知は1日1回、過去24時間分を履歴ファイルから合算」する方式へ変更したが、
// 設計書187でユーザー要望により「1日3回、その都度その回だけの件数」方式に戻した。
// この合算関数自体は将来の分析・復元用途のため削除せず残置する（現在はmain()から未呼び出し）。
function loadLast24hSummary(cityKey) {
  const historyPath = path.join(LOGS_DIR, `fetch-summary-history-${cityKey}.jsonl`);
  if (!fs.existsSync(historyPath)) return null;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const entries = fs.readFileSync(historyPath, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
    .filter(e => e && new Date(e.updatedAt).getTime() >= cutoff);
  if (entries.length === 0) return null;

  const merged = { cityKey, cityLabel: entries[0].cityLabel, accepted: 0, rawTotal: 0, catCounts: {}, newItems: [] };
  for (const e of entries) {
    merged.accepted += e.accepted || 0;
    merged.rawTotal += e.rawTotal || 0;
    for (const [k, v] of Object.entries(e.catCounts || {})) merged.catCounts[k] = (merged.catCounts[k] || 0) + v;
    merged.newItems.push(...(e.newItems || []));
  }
  return merged;
}

// fetch-life-info.jsが毎回更新する最新1回分の上書きファイルをそのまま読む（設計書187）。
// ユーザー向けプッシュ通知は19:30の回にのみ送られるが（fetch-life-info.js側の--no-notify制御）、
// この開発者向けLINE通知はこの制御とは独立しており、7:00/12:30/19:30の3回とも通知する。
function loadLifeInfoLatestSummary(cityKey) {
  if (cityKey !== 'sg') return null; // 現状SGのみ運用（BKK/SYDは対応外）
  if (!fs.existsSync(LIFE_INFO_SUMMARY_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(LIFE_INFO_SUMMARY_PATH, 'utf8'));
  } catch (e) {
    console.warn('生活情報サマリーの読み込みに失敗:', e.message);
    return null;
  }
}

// 2026-09-07に「通知は1日1回、過去24時間分を履歴ファイルから合算」する方式へ変更したが（設計書183）、
// 設計書187でユーザー要望により「1日3回、その都度その回だけの件数」方式に戻した。
// この合算関数自体は将来の分析・復元用途のため削除せず残置する（現在はmain()から未呼び出し）。
function loadLifeInfoLast24hSummary(cityKey) {
  if (cityKey !== 'sg') return null; // 現状SGのみ運用（BKK/SYDは対応外、設計書183スコープ外）
  if (!fs.existsSync(LIFE_INFO_HISTORY_PATH)) return null;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const entries = fs.readFileSync(LIFE_INFO_HISTORY_PATH, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
    .filter(e => e && new Date(e.updatedAt).getTime() >= cutoff);
  if (entries.length === 0) return null;

  const merged = { accepted: 0, rawTotal: 0, catCounts: {}, newItems: [] };
  for (const e of entries) {
    merged.accepted += e.accepted || 0;
    merged.rawTotal += e.rawTotal || 0;
    for (const [k, v] of Object.entries(e.catCounts || {})) merged.catCounts[k] = (merged.catCounts[k] || 0) + v;
    merged.newItems.push(...(e.newItems || []));
  }
  return merged;
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

  lines.push('━━ 🏖️ おでかけ情報（今回の取り込み結果）━━');
  for (const cityKey of CITIES) {
    const s = loadLatestSummary(cityKey);

    if (!s) {
      lines.push(`— ${cityKey.toUpperCase()}: データなし`);
      continue;
    }

    totalAccepted += s.accepted;

    lines.push(`【${s.cityLabel}】${s.accepted}件採用 / ${s.rawTotal}件取得`);

    const catLine = formatCatCounts(s.catCounts, EVENT_CAT_LABELS);
    if (catLine) {
      lines.push(`  ${catLine}`);
    } else if (s.accepted > 0) {
      lines.push(`  （${s.accepted}件は重複のため新規追加なし）`);
    } else if (!s.newItems || s.newItems.length === 0) {
      lines.push('  （新着なし）');
    }
  }

  lines.push(`合計 ${totalAccepted}件採用`);

  // くらし情報セクションを追記（今回1回分のみ、設計書187）
  try {
    const li = loadLifeInfoLatestSummary('sg');
    if (li) {
      lines.push('');
      lines.push('━━ 🏛️ くらし情報（今回の取り込み結果）━━');
      lines.push(`📰 ${li.accepted}件採用 / ${li.rawTotal}件取得`);
      const catLine = formatCatCounts(li.catCounts, LIFE_INFO_CAT_LABELS);
      if (catLine) {
        lines.push(`  ${catLine}`);
      } else if (li.accepted > 0) {
        lines.push(`  （${li.accepted}件は重複のため新規追加なし）`);
      } else {
        lines.push('  （新着なし）');
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
