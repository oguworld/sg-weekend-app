#!/usr/bin/env node
// scripts/analyze-sources.js
// ソース採用率・コンテンツ多様性を分析し、不良ソースを永久除外リストに追加する
// （2026-09-03: 候補への自動入れ替えは廃止。除外するのみで、新規ソース追加は手動運用）
// 実行: node analyze-sources.js [--city=sg|bkk|syd|all] [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

// ─── 閾値設定 ─────────────────────────────────────────────────────
const THRESHOLDS = {
  minRuns:          3,     // 最低このラン数のデータがあれば判定対象（3=3回以上で判定）
  minTotalSent:     15,    // ウィンドウ内の最低送信件数（少なすぎるソースは判定保留）
  poorAdoptionRate: 0.05,  // 採用率5%未満を「不良」とみなす（8%から緩和: 有益な総合メディアを保護）
  targetRawMin:     80,    // rawTotal がこれを下回ったら候補から追加
  minActiveTotal:   5,     // 都市あたりの最低アクティブソース数
  historyWindow:    4,     // 採用率計算に使う直近ラン数
  maxHistoryRuns:   12,    // ファイルに保持する最大ラン数
};

// コンテンツ種別の目標比率（イベント40% / 展示・公演20% / グルメ30% / セール10%）
const TARGET_TYPE_RATIO = { event: 0.40, show: 0.20, gourmet: 0.30, sale: 0.10 };
// この差分(実績-目標)がある場合に「偏り」とみなす
const TYPE_IMBALANCE_THRESHOLD = 0.15;

const CITY_NAMES = { sg: 'シンガポール', bkk: 'バンコク', syd: 'シドニー' };
const TYPE_LABELS = { event: 'イベント', show: '展示・公演', gourmet: 'グルメ・フェア', sale: 'セール・プロモ' };

const PATHS = {
  history:         path.join(__dirname, '..', 'data', 'source-history.json'),
  sources:         path.join(__dirname, '..', 'data', 'sources.json'),
  log:             path.join(__dirname, '..', 'logs', 'source-analysis.log'),
  analysisResult:  path.join(__dirname, '..', 'logs', 'source-analysis-result.json'),
};

// ─── ユーティリティ ───────────────────────────────────────────────
const isDryRun  = process.argv.includes('--dry-run');
const isNoNotify = process.argv.includes('--no-notify');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(PATHS.log, line + '\n');
}

function loadJson(filePath, defaultVal = {}) {
  if (!fs.existsSync(filePath)) return defaultVal;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return defaultVal; }
}

function saveJson(filePath, data) {
  if (isDryRun) { console.log(`[dry-run] 書き込みをスキップ: ${filePath}`); return; }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ─── LINE 通知 ────────────────────────────────────────────────────
async function notifyLINE(message) {
  if (isDryRun) { console.log('[dry-run] LINE送信スキップ:\n' + message); return; }
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

// ─── コンテンツ種別の分布を分析 ──────────────────────────────────
function analyzeTypeDistribution(cityKey) {
  const eventsPath = path.join(__dirname, '..', 'data', cityKey, 'events.json');
  const events     = loadJson(eventsPath, []);
  if (events.length === 0) return { counts: {}, ratios: {}, total: 0, mostNeeded: null };

  const counts = { event: 0, show: 0, gourmet: 0, sale: 0 };
  for (const e of events) {
    if (counts[e.type] !== undefined) counts[e.type]++;
  }
  const total  = Object.values(counts).reduce((s, n) => s + n, 0);
  const ratios = Object.fromEntries(
    Object.entries(counts).map(([t, n]) => [t, total > 0 ? n / total : 0])
  );

  // 目標比率との差分（正 = 不足）
  const gaps = Object.entries(TARGET_TYPE_RATIO)
    .map(([t, target]) => ({ type: t, gap: target - (ratios[t] || 0) }))
    .sort((a, b) => b.gap - a.gap);

  const mostNeeded = gaps[0].gap >= TYPE_IMBALANCE_THRESHOLD ? gaps[0].type : null;
  const overRepresented = gaps.find(g => g.gap < -TYPE_IMBALANCE_THRESHOLD)?.type ?? null;

  return { counts, ratios, total, mostNeeded, overRepresented, gaps };
}

// ─── ソース履歴の更新 ─────────────────────────────────────────────
function updateHistory(history, cityKey, fetchSummary) {
  if (!fetchSummary?.sourceStats) return;
  if (!history[cityKey]) history[cityKey] = {};

  const date = fetchSummary.date || new Date().toISOString().slice(0, 10);

  for (const [name, stats] of Object.entries(fetchSummary.sourceStats)) {
    if (!history[cityKey][name]) history[cityKey][name] = [];
    const entry   = { date, sent: stats.sent || 0, accepted: stats.accepted || 0 };
    const sameDay = history[cityKey][name].findIndex(r => r.date === date);
    if (sameDay >= 0) {
      history[cityKey][name][sameDay] = entry;
    } else {
      history[cityKey][name].push(entry);
      if (history[cityKey][name].length > THRESHOLDS.maxHistoryRuns) history[cityKey][name].shift();
    }
  }

  // rawTotal / uniqueTotal を _meta に記録
  if (!history[cityKey]._meta) history[cityKey]._meta = [];
  const meta    = { date, rawTotal: fetchSummary.rawTotal || 0, uniqueTotal: fetchSummary.uniqueTotal || 0 };
  const metaIdx = history[cityKey]._meta.findIndex(r => r.date === date);
  if (metaIdx >= 0) {
    history[cityKey]._meta[metaIdx] = meta;
  } else {
    history[cityKey]._meta.push(meta);
    if (history[cityKey]._meta.length > THRESHOLDS.maxHistoryRuns) history[cityKey]._meta.shift();
  }
}

// ─── ソース単体の採用率分析 ───────────────────────────────────────
function analyzeSource(runs) {
  const window        = runs.slice(-THRESHOLDS.historyWindow);
  const totalSent     = window.reduce((s, r) => s + r.sent, 0);
  const totalAccepted = window.reduce((s, r) => s + r.accepted, 0);
  const adoptionRate  = totalSent > 0 ? totalAccepted / totalSent : 0;
  const allZero       = window.length >= THRESHOLDS.minRuns && window.every(r => r.accepted === 0);

  const isPoor = (
    window.length >= THRESHOLDS.minRuns &&
    totalSent     >= THRESHOLDS.minTotalSent &&
    (adoptionRate  < THRESHOLDS.poorAdoptionRate || allZero)
  );

  return { windowRuns: window.length, totalSent, totalAccepted, adoptionRate, allZero, isPoor };
}

// ─── 過多カテゴリのソースを先頭に移動（優先停止用） ─────────────
function sortActiveByOverrepresented(activeList, overRepresented) {
  if (!overRepresented) return activeList;
  return [
    ...activeList.filter(s => !s.obj.pinned && (s.obj.primaryType || 'mixed') === overRepresented),
    ...activeList.filter(s => s.obj.pinned || (s.obj.primaryType || 'mixed') !== overRepresented),
  ];
}

// ─── 都市ごとの分析と入れ替え処理 ────────────────────────────────
function analyzeCity(cityKey, history, sources) {
  const cityName   = CITY_NAMES[cityKey];
  const cityHist   = history[cityKey] || {};
  const cityConf   = sources[cityKey]    || { feeds: [] };

  const activeFeeds = cityConf.feeds.filter(f => f.status === 'active');
  const activeTotal = activeFeeds.length;

  // 直近 rawTotal
  const meta            = cityHist._meta || [];
  const latestRawTotal  = meta.length > 0 ? meta[meta.length - 1].rawTotal : null;

  // コンテンツ種別分布の分析
  const typeDist = analyzeTypeDistribution(cityKey);
  const { mostNeeded, overRepresented } = typeDist;

  log(`\n【${cityName}】アクティブ: feeds ${activeFeeds.length} / raw直近: ${latestRawTotal ?? '不明'}件`);

  if (typeDist.total > 0) {
    const distStr = Object.entries(typeDist.ratios)
      .map(([t, r]) => `${TYPE_LABELS[t]}: ${Math.round(r * 100)}%`)
      .join(' / ');
    log(`  📊 現在の構成: ${distStr}${mostNeeded ? ` → ${TYPE_LABELS[mostNeeded]}が不足` : ''}`);
  }

  const warnings  = [];
  const rejected  = [];  // { label, reason }

  // ─ Step0: 停止済みソースのうち条件を満たすものを永久除外(rejected)へ昇格 ─
  const REJECT_PAUSED_DAYS = 7;  // 停止後この日数を超えたら昇格判定
  const today = new Date().toISOString().slice(0, 10);
  const pausedFeeds = cityConf.feeds.filter(f => f.status === 'paused');
  for (const obj of pausedFeeds) {
    const key = obj.name;
    const runs = cityHist[key] || [];
    if (runs.length < THRESHOLDS.minRuns) continue;
    const daysSincePause = obj.pausedAt
      ? Math.floor((new Date(today) - new Date(obj.pausedAt)) / 86400000)
      : 999;
    if (daysSincePause < REJECT_PAUSED_DAYS) continue;
    const totalSent = runs.reduce((s, r) => s + (r.sent || 0), 0);
    const totalAcc  = runs.reduce((s, r) => s + (r.accepted || 0), 0);
    if (totalAcc === 0 && totalSent >= THRESHOLDS.minTotalSent) {
      obj.status       = 'rejected';
      obj.rejectedAt   = today;
      obj.rejectedReason = `停止後${daysSincePause}日・通算採用0件（${totalSent}件送信）`;
      rejected.push({ label: key, reason: obj.rejectedReason });
      log(`  🚫 永久除外: ${key}（${obj.rejectedReason}）`);
    }
  }

  // ─ Step1: 不良ソースを永久除外リストに追加（2026-09-03: 自動入れ替えは廃止。停止→候補差し替えはせず、
  //   直接 rejected にする。ユーザーが時々 sources.json / source-candidates.json を見て手動で判断する運用） ─
  const allActiveRaw = activeFeeds.map(f => ({ key: f.name, obj: f }));
  // 過多カテゴリのソースを先頭に移動（優先除外のため）
  const allActive = sortActiveByOverrepresented(allActiveRaw, overRepresented);

  let currentActive = activeTotal;

  for (const { key, obj } of allActive) {
    if (obj.pinned) {
      log(`  📌 固定 ${key}: 自動除外対象外`);
      continue;
    }

    const runs     = cityHist[key] || [];
    if (runs.length === 0) continue;

    const analysis = analyzeSource(runs);
    const rateStr  = `${(analysis.adoptionRate * 100).toFixed(0)}%`;
    const flag     = analysis.isPoor ? '⚠️ 不良' : '✅ OK ';
    log(`  ${flag} ${key}: ${analysis.windowRuns}回 / 送信${analysis.totalSent} / 採用${analysis.totalAccepted} (${rateStr})`);

    if (!analysis.isPoor) continue;

    // 最低アクティブ数チェック
    if (currentActive <= THRESHOLDS.minActiveTotal) {
      warnings.push(`${key}（最低${THRESHOLDS.minActiveTotal}ソース確保のため除外保留）`);
      log(`  → 除外保留（最低ソース数のため）`);
      continue;
    }

    obj.status         = 'rejected';
    obj.rejectedAt     = new Date().toISOString().slice(0, 10);
    obj.rejectedReason = analysis.allZero
      ? `${analysis.windowRuns}回連続0件採用`
      : `採用率${rateStr}（直近${analysis.windowRuns}回平均）`;

    rejected.push({ label: key, reason: obj.rejectedReason });
    currentActive--;
    log(`  → 永久除外: ${key}（${obj.rejectedReason}）`);
  }

  if (latestRawTotal !== null && latestRawTotal < THRESHOLDS.targetRawMin) {
    warnings.push(`rawTotal ${latestRawTotal}件（目標${THRESHOLDS.targetRawMin}件）・ソース追加を検討してください`);
  }

  return { warnings, rejected, latestRawTotal, activeTotal, typeDist, mostNeeded, overRepresented };
}

// ─── LINE 通知用レポート生成 ──────────────────────────────────────
function buildReport(results) {
  const lines = [isDryRun ? '🔍 [DRY-RUN] ソース分析' : '🔄 ソース採用率チェック', '━'.repeat(22)];

  for (const [cityKey, r] of Object.entries(results)) {
    const cityName = CITY_NAMES[cityKey] || cityKey;
    const rawLabel = r.latestRawTotal != null ? `raw ${r.latestRawTotal}件` : 'rawデータなし';

    if (r.rejected.length === 0 && r.warnings.length === 0) {
      lines.push(`✅ ${cityName}: 変更なし（${rawLabel} / アクティブ${r.activeTotal}ソース）`);
      continue;
    }

    lines.push(`\n【${cityName}】${rawLabel}`);

    // 変更内容
    for (const { label, reason } of r.rejected) lines.push(`🚫 永久除外: ${label}（${reason}）`);
    for (const w of r.warnings) lines.push(`⚠️ 要確認: ${w}`);

    // コンテンツ構成の偏り（参考情報のみ、自動対応はしない）
    if (r.overRepresented) {
      lines.push(`📊 ${TYPE_LABELS[r.overRepresented]}が過多`);
    }
    if (r.mostNeeded) {
      lines.push(`📊 ${TYPE_LABELS[r.mostNeeded]}が不足 → 手動でのソース追加を検討してください`);
    }
  }

  lines.push('');
  lines.push(`実行: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Singapore' })} SGT`);
  if (isDryRun) lines.push('（dry-run: 実際の変更は行いません）');

  return lines.join('\n');
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  const cityArg = (process.argv.find(a => a.startsWith('--city=')) || '--city=all').split('=')[1];
  const cities  = cityArg === 'all' ? Object.keys(CITY_NAMES) : [cityArg];

  log(`\n===== analyze-sources.js 開始 (都市: ${cities.join(', ')}${isDryRun ? ' / DRY-RUN' : ''}) =====`);

  const history    = loadJson(PATHS.history, {});
  const sources    = loadJson(PATHS.sources, {});

  const results = {};

  for (const cityKey of cities) {
    if (!CITY_NAMES[cityKey]) { log(`未知の都市コード: ${cityKey}`); continue; }

    // 最新 fetch-summary を読んで履歴に追記
    const summaryPath = path.join(__dirname, '..', 'logs', `fetch-summary-${cityKey}.json`);
    const summary     = loadJson(summaryPath, null);
    if (summary) {
      updateHistory(history, cityKey, summary);
      log(`履歴更新: ${cityKey} (${summary.date})`);
    } else {
      log(`fetch-summary-${cityKey}.json が見つからないためスキップ`);
    }

    results[cityKey] = analyzeCity(cityKey, history, sources);
  }

  // 変更を保存
  saveJson(PATHS.history, history);
  saveJson(PATHS.sources,  sources);

  // レポート & LINE 通知（または JSON 書き出し）
  const report = buildReport(results);
  log('\n' + report);

  if (isNoNotify) {
    // --no-notify: LINE通知を送らず分析結果をJSONに書き出す
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const analysisResult = { date: today, cities: {} };
    for (const [cityKey, r] of Object.entries(results)) {
      const activeFeeds = (sources[cityKey]?.feeds || []).filter(f => f.status === 'active').length;
      analysisResult.cities[cityKey] = {
        changed:     r.rejected.length > 0,
        removed:     r.rejected.map(r => r.label),
        activeCount: activeFeeds,
      };
    }
    // logs/ ディレクトリが存在することを確認してから書き込む
    const logsDir = path.dirname(PATHS.analysisResult);
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    if (!isDryRun) {
      fs.writeFileSync(PATHS.analysisResult, JSON.stringify(analysisResult, null, 2), 'utf8');
      log(`分析結果を書き出し: ${PATHS.analysisResult}`);
    } else {
      console.log(`[dry-run] 書き込みをスキップ: ${PATHS.analysisResult}`);
    }
  } else {
    // 通常実行: LINE通知を送る
    await notifyLINE(report);
  }

  log('===== analyze-sources.js 完了 =====\n');
}

main().catch(e => {
  log(`予期しないエラー: ${e.message}`);
  process.exit(1);
});
