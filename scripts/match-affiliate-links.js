#!/usr/bin/env node
// scripts/match-affiliate-links.js
//
// コースのスポット名とKlookアフィリエイトカタログCSVを突き合わせ、
// data/sg/affiliate-links.json に半自動（人力確認あり）で登録する支援スクリプト。
//
// マッチング方式（.claude/plan.md 設計書23フェーズ1で確定）:
//   CSVの Affiliate Link 列内の k_site パラメータ（URLエンコードされたKlook活動ページURL）を
//   デコードして英語スラッグを抽出し、それをスポット名（英語）とハイフン単語単位でスコアリングする。
//   Product Name（日本語）は人力確認時の表示用のみに使う。
//
// 使い方:
//   node scripts/match-affiliate-links.js --dry-run   候補を表示するだけ（書き込みなし）
//   node scripts/match-affiliate-links.js              候補を1件ずつ対話確認し、確定したものを保存
//
// インクリメンタル実行: 既存の affiliate-links.json に登録済みのスポット名はスキップする。

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CSV_PATH = path.join(__dirname, '..', 'data', 'klook-catalog-sg.csv');
const LINKS_PATH = path.join(__dirname, '..', 'data', 'sg', 'affiliate-links.json');
const MODEL_COURSES_PATH = path.join(__dirname, '..', 'data', 'sg', 'model-courses.json');
const COMMUNITY_COURSES_PATH = path.join(__dirname, '..', 'data', 'sg', 'community-courses.json');
const STAMP_SPOTS_PATH = path.join(__dirname, '..', 'data', 'sg', 'stamp-spots.json');

const DRY_RUN = process.argv.includes('--dry-run');
// マッチスコアがこれ未満の候補は提示しない（無関係な候補で確認作業を煩雑にしないため）
const MIN_SCORE = 0.34;
// 提示する候補数（上位N件）
const TOP_N = 3;

// ─────────────────────────────────────────────
// CSVパース（シンプルなクォート対応パーサー。exec/execpath不要の自前実装）
// ─────────────────────────────────────────────
function parseCsv(text) {
  // BOM除去
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\r') {
        // skip, \n が改行区切りを担う
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function loadCatalog() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(raw);
  const header = rows[0];
  const idx = {
    productName: header.indexOf('Product Name (Activity name or Hotel name)'),
    affiliateLink: header.indexOf('Affiliate Link'),
  };
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < header.length) continue;
    const productName = r[idx.productName];
    const affiliateLink = r[idx.affiliateLink];
    if (!productName || !affiliateLink) continue;

    const slug = extractSlug(affiliateLink);
    if (!slug) continue;

    items.push({ productName, affiliateLink, slug, slugWords: slugToWords(slug) });
  }
  return items;
}

// k_site パラメータをデコードし、Klook活動ページURL末尾のスラッグを抽出
function extractSlug(affiliateLink) {
  const m = affiliateLink.match(/[?&]k_site=([^&]+)/);
  if (!m) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  // 例: https://www.klook.com/ja/activity/127-gardens-by-the-bay-singapore
  const parts = decoded.replace(/\/$/, '').split('/');
  const last = parts[parts.length - 1];
  if (!last) return null;
  return last;
}

// "127-gardens-by-the-bay-singapore" → ["gardens","by","the","bay","singapore"]
// 先頭の数字ID部分は除去する
function slugToWords(slug) {
  return slug
    .toLowerCase()
    .split('-')
    .filter(w => w && !/^\d+$/.test(w));
}

// スポット名（英語想定）を単語配列に変換
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'at', 'for']);
function spotNameToWords(name) {
  return name
    .toLowerCase()
    .replace(/[–—\-·、,。()（）\[\]|]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w));
}

// 単語集合の一致度スコア（Jaccard風。スラッグ側に含まれるスポット単語の割合を重視）
function scoreMatch(spotWords, slugWords) {
  if (spotWords.length === 0 || slugWords.length === 0) return 0;
  const slugSet = new Set(slugWords);
  const spotSet = new Set(spotWords);
  let hit = 0;
  for (const w of spotSet) {
    if (slugSet.has(w)) hit++;
  }
  const union = new Set([...spotSet, ...slugSet]).size;
  // スポット単語のカバー率とJaccardの平均で、短いスポット名でも極端に不利にならないようにする
  const coverage = hit / spotSet.size;
  const jaccard = hit / union;
  return (coverage + jaccard) / 2;
}

function loadUniqueSpotNames() {
  const names = new Set();
  for (const p of [MODEL_COURSES_PATH, COMMUNITY_COURSES_PATH]) {
    if (!fs.existsSync(p)) continue;
    let courses = [];
    try {
      courses = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      continue;
    }
    for (const c of courses) {
      for (const s of c.spots || []) {
        if (s.name) names.add(s.name);
      }
    }
  }
  if (fs.existsSync(STAMP_SPOTS_PATH)) {
    try {
      const stampSpots = JSON.parse(fs.readFileSync(STAMP_SPOTS_PATH, 'utf8'));
      for (const s of stampSpots || []) {
        if (s.name) names.add(s.name);
      }
    } catch {
      // 読み込み失敗時はスタンプスポット分をスキップ（既存のコース側処理は継続）
    }
  }
  return [...names].sort();
}

function loadExistingLinks() {
  if (!fs.existsSync(LINKS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveLinks(links) {
  fs.mkdirSync(path.dirname(LINKS_PATH), { recursive: true });
  fs.writeFileSync(LINKS_PATH, JSON.stringify(links, null, 2), 'utf8');
}

function askQuestion(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  const catalog = loadCatalog();
  const spotNames = loadUniqueSpotNames();
  const links = loadExistingLinks();

  const targets = spotNames.filter(name => !links[name]);

  console.log(`スポット総数: ${spotNames.length}件 / 既登録: ${spotNames.length - targets.length}件 / 未紐付け対象: ${targets.length}件`);
  console.log(`Klookカタログ: ${catalog.length}件\n`);

  if (targets.length === 0) {
    console.log('未紐付けのスポットはありません。終了します。');
    return;
  }

  const rl = DRY_RUN ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
  let addedCount = 0;

  for (const spotName of targets) {
    const spotWords = spotNameToWords(spotName);
    const scored = catalog
      .map(item => ({ ...item, score: scoreMatch(spotWords, item.slugWords) }))
      .filter(item => item.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);

    console.log('─────────────────────────────────────────');
    console.log(`スポット: ${spotName}`);
    if (scored.length === 0) {
      console.log('  候補なし（一致するKlook商品が見つかりませんでした）');
      continue;
    }
    scored.forEach((item, i) => {
      console.log(`  [${i + 1}] ${item.productName}  (score=${item.score.toFixed(2)}, slug=${item.slug})`);
    });

    if (DRY_RUN) continue;

    const answer = (await askQuestion(
      rl,
      `  番号を選択して確定 / Enterでスキップ / q で終了 (1-${scored.length}): `
    )).trim();

    if (answer.toLowerCase() === 'q') {
      console.log('中断しました。');
      break;
    }
    if (!answer) continue;

    const choice = parseInt(answer, 10);
    if (!Number.isInteger(choice) || choice < 1 || choice > scored.length) {
      console.log('  無効な入力のためスキップしました。');
      continue;
    }

    const picked = scored[choice - 1];
    links[spotName] = {
      provider: 'klook',
      url: picked.affiliateLink,
      title: picked.productName,
      updatedAt: new Date().toISOString(),
      confirmedBy: 'manual',
    };
    saveLinks(links);
    addedCount++;
    console.log(`  登録しました: ${spotName} → ${picked.productName}`);
  }

  if (rl) rl.close();

  console.log('\n─────────────────────────────────────────');
  console.log(DRY_RUN ? '(--dry-run のため書き込みは行っていません)' : `${addedCount}件を新規登録しました。`);
}

main().catch(e => {
  console.error('エラー:', e);
  process.exit(1);
});
