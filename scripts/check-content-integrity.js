#!/usr/bin/env node
// イベントのコンテンツ整合性チェック
// 1. 同一コンテンツ（先頭60文字）を持つ複数イベントを検出
// 2. 検出した場合は警告を出力して exit 1

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const cityArg = args.find(a => a.startsWith('--city='));
const cities = cityArg ? [cityArg.split('=')[1]] : ['sg', 'bkk', 'syd'];

let hasError = false;

for (const city of cities) {
  const filePath = path.join(__dirname, `../data/${city}/events.json`);
  if (!fs.existsSync(filePath)) continue;

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const groups = new Map();

  for (const e of data) {
    const content = (e.content || '').trim();
    if (!content) continue;
    const key = content.slice(0, 60);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const dupes = [...groups.values()].filter(g => g.length > 1);

  if (dupes.length === 0) {
    console.log(`[${city}] コンテンツ整合性チェック OK（${data.length}件）`);
  } else {
    hasError = true;
    console.error(`[${city}] ⚠️  コンテンツ重複 ${dupes.length}グループ検出！`);
    for (const group of dupes) {
      console.error(`  共通content: ${group[0].content.slice(0, 60)}...`);
      for (const e of group) {
        console.error(`    → [${e.id}] ${e.store}`);
      }
    }
  }
}

if (hasError) {
  console.error('\n⚠️  タイトルと説明の入れ替わりが疑われます。events.jsonを手動確認してください。');
  process.exit(1);
}
