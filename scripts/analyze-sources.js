#!/usr/bin/env node
// scripts/analyze-sources.js
// ソース採用率・コンテンツ多様性を分析し、不良ソースを候補と自動入れ替えする
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
  candidates:      path.join(__dirname, '..', 'data', 'source-candidates.json'),
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

  return { counts, ratios, total, mostNeeded, gaps };
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

// ─── 候補を多様性を考慮してソート ────────────────────────────────
function sortCandidatesByDiversity(candidates, mostNeededType) {
  if (!mostNeededType) return [...candidates];
  return [...candidates].sort((a, b) => {
    const aMatch = a.contentFocus === mostNeededType || a.contentFocus === 'mixed' ? 0 : 1;
    const bMatch = b.contentFocus === mostNeededType || b.contentFocus === 'mixed' ? 0 : 1;
    return aMatch - bMatch;
  });
}

// ─── 都市ごとの分析と入れ替え処理 ────────────────────────────────
function analyzeCity(cityKey, history, sources, candidates) {
  const cityName   = CITY_NAMES[cityKey];
  const cityHist   = history[cityKey] || {};
  const cityConf   = sources[cityKey]    || { feeds: [], instagramAccounts: [] };
  const cityCands  = candidates[cityKey] || { feeds: [], instagramAccounts: [] };

  const activeFeeds = cityConf.feeds.filter(f => f.status === 'active');
  const activeIG    = cityConf.instagramAccounts.filter(a => a.status === 'active');
  const activeTotal = activeFeeds.length + activeIG.length;

  // 直近 rawTotal
  const meta            = cityHist._meta || [];
  const latestRawTotal  = meta.length > 0 ? meta[meta.length - 1].rawTotal : null;

  // コンテンツ種別分布の分析
  const typeDist = analyzeTypeDistribution(cityKey);
  const { mostNeeded } = typeDist;

  log(`\n【${cityName}】アクティブ: feeds ${activeFeeds.length} / IG ${activeIG.length} / raw直近: ${latestRawTotal ?? '不明'}件`);

  if (typeDist.total > 0) {
    const distStr = Object.entries(typeDist.ratios)
      .map(([t, r]) => `${TYPE_LABELS[t]}: ${Math.round(r * 100)}%`)
      .join(' / ');
    log(`  📊 現在の構成: ${distStr}${mostNeeded ? ` → ${TYPE_LABELS[mostNeeded]}が不足` : ''}`);
  }

  const paused    = [];  // { label, reason }
  const activated = [];  // { label, reason, contentFocus }
  const warnings  = [];

  // 候補リスト（まだ未使用のもの）、多様性を考慮してソート
  let unusedFeedCands = sortCandidatesByDiversity(
    (cityCands.feeds || []).filter(c => !cityConf.feeds.some(f => f.url === c.url)),
    mostNeeded
  );
  let unusedIGCands = sortCandidatesByDiversity(
    (cityCands.instagramAccounts || []).filter(c =>
      !cityConf.instagramAccounts.some(a => a.username === c.username)
    ),
    mostNeeded
  );

  // ─ Step1: 不良ソースを特定して入れ替え ─
  const allActive = [
    ...activeFeeds.map(f => ({ type: 'feed', key: f.name, obj: f })),
    ...activeIG.map(a => ({ type: 'ig', key: `Instagram / @${a.username}`, obj: a })),
  ];

  let currentActive = activeTotal;

  for (const { type, key, obj } of allActive) {
    if (obj.pinned) {
      log(`  📌 固定 ${key}: 自動入れ替え対象外`);
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
      warnings.push(`${key}（最低${THRESHOLDS.minActiveTotal}ソース確保のため停止保留）`);
      log(`  → 停止保留（最低ソース数のため）`);
      continue;
    }

    // 同種の候補を探す（多様性考慮済みのソート順）
    let candidate = null;
    if (type === 'feed' && unusedFeedCands.length > 0) {
      candidate = unusedFeedCands.shift();
      cityConf.feeds.push({
        url: candidate.url, name: candidate.name,
        status: 'active', addedAt: new Date().toISOString().slice(0, 10),
        ...(candidate.options ? { options: candidate.options } : {}),
      });
      activated.push({ label: candidate.name, reason: candidate.reason || '', contentFocus: candidate.contentFocus });
    } else if (type === 'ig' && unusedIGCands.length > 0) {
      candidate = unusedIGCands.shift();
      cityConf.instagramAccounts.push({
        username: candidate.username,
        status: 'active', addedAt: new Date().toISOString().slice(0, 10),
      });
      activated.push({ label: `@${candidate.username}`, reason: candidate.reason || '', contentFocus: candidate.contentFocus });
    } else {
      warnings.push(`${key}（採用率${rateStr}・候補ソースなし）`);
      log(`  → 停止保留（候補ソースなし）`);
      continue;
    }

    // 停止処理
    obj.status       = 'paused';
    obj.pausedAt     = new Date().toISOString().slice(0, 10);
    obj.pausedReason = analysis.allZero
      ? `${analysis.windowRuns}回連続0件採用`
      : `採用率${rateStr}（直近${analysis.windowRuns}回平均）`;

    paused.push({ label: key, reason: obj.pausedReason });
    currentActive--;
    log(`  → 停止: ${key} → 追加: ${activated[activated.length - 1].label}（${activated[activated.length - 1].contentFocus}）`);
  }

  // ─ Step2: rawTotal 不足時に候補を追加（多様性優先） ─
  if (latestRawTotal !== null && latestRawTotal < THRESHOLDS.targetRawMin) {
    log(`  ⚠️ rawTotal ${latestRawTotal} < 目標${THRESHOLDS.targetRawMin}件 → 候補を追加（多様性優先）`);
    while (unusedIGCands.length > 0) {
      const candidate = unusedIGCands.shift();
      cityConf.instagramAccounts.push({
        username: candidate.username,
        status: 'active', addedAt: new Date().toISOString().slice(0, 10),
      });
      activated.push({ label: `@${candidate.username}（量補充）`, reason: candidate.reason || '', contentFocus: candidate.contentFocus });
      log(`  → 量補充追加: @${candidate.username}（${candidate.contentFocus}）`);
      if (latestRawTotal + activated.length * 6 >= THRESHOLDS.targetRawMin) break;
    }
    if (unusedIGCands.length === 0 && latestRawTotal < THRESHOLDS.targetRawMin) {
      warnings.push(`rawTotal ${latestRawTotal}件（目標${THRESHOLDS.targetRawMin}件）・候補枯渇`);
    }
  }

  return { paused, activated, warnings, latestRawTotal, activeTotal, typeDist, mostNeeded };
}

// ─── LINE 通知用レポート生成 ──────────────────────────────────────
function buildReport(results) {
  const lines = [isDryRun ? '🔍 [DRY-RUN] ソース分析' : '🔄 ソース採用率チェック', '━'.repeat(22)];

  for (const [cityKey, r] of Object.entries(results)) {
    const cityName = CITY_NAMES[cityKey] || cityKey;
    const rawLabel = r.latestRawTotal != null ? `raw ${r.latestRawTotal}件` : 'rawデータなし';

    if (r.paused.length === 0 && r.activated.length === 0 && r.warnings.length === 0) {
      lines.push(`✅ ${cityName}: 変更なし（${rawLabel} / アクティブ${r.activeTotal}ソース）`);
      continue;
    }

    lines.push(`\n【${cityName}】${rawLabel}`);

    // 変更内容
    for (const { label, reason } of r.paused)     lines.push(`❌ 停止: ${label}（${reason}）`);
    for (const { label, reason, contentFocus } of r.activated) {
      const focus = contentFocus && contentFocus !== 'mixed' ? ` [${TYPE_LABELS[contentFocus] || contentFocus}]` : '';
      lines.push(`➕ 追加: ${label}${focus}（${reason}）`);
    }
    for (const w of r.warnings) lines.push(`⚠️ 要確認: ${w}`);

    // コンテンツ構成の偏り
    if (r.mostNeeded) {
      lines.push(`📊 ${TYPE_LABELS[r.mostNeeded]}が不足（目標: event40%/show20%/gourmet30%/sale10%）`);
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
  const candidates = loadJson(PATHS.candidates, {});

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

    results[cityKey] = analyzeCity(cityKey, history, sources, candidates);
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
      const activeIG    = (sources[cityKey]?.instagramAccounts || []).filter(a => a.status === 'active').length;
      analysisResult.cities[cityKey] = {
        changed:     r.paused.length > 0 || r.activated.length > 0,
        added:       r.activated.map(a => a.label),
        removed:     r.paused.map(p => p.label),
        activeCount: activeFeeds + activeIG,
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
