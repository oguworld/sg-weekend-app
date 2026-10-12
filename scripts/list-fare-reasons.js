#!/usr/bin/env node
// 航空券シーズン表の「色(価格レベル)・理由・根拠」を一覧する見直し用スクリプト（設計書222）
// 実行: node scripts/list-fare-reasons.js [--city=bali] [--basis=fare|demand] [--level=high|low]
// 画面には出さない。priceBasis: fare=SG発の実運賃の出典あり / demand=需要・天候からの推定(実運賃は未確認)

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'content', 'fare-seasons.json');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));

const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
const levelLabel = lv => (lv >= 4 ? '高い' : lv <= 2 ? '安い' : '普通') + `(${lv})`;

const rows = [];
const unmarked = [];
for (const city of data.cities) {
  if (args.city && ![city.id, city.name].includes(args.city)) continue;
  city.monthly.forEach((mo, i) => {
    const lv = city.levels[i];
    if (lv === 3 && !mo.priceReason && !mo.priceBasis) return;
    if (args.level === 'high' && lv < 4) return;
    if (args.level === 'low' && lv > 2) return;
    if (args.basis && mo.priceBasis !== args.basis) return;
    if (lv !== 3 && !mo.priceBasis) unmarked.push(`${city.name} ${i + 1}月`);
    rows.push({ city: city.name, month: `${i + 1}月`, level: levelLabel(lv), reason: mo.priceReason || '-', basis: mo.priceBasis || '未記入', source: mo.priceSource || '-' });
  });
}

console.log(['都市', '月', '色', '理由', '根拠', '出典'].join('\t'));
for (const r of rows) console.log([r.city, r.month, r.level, r.reason, r.basis, r.source].join('\t'));

const count = k => rows.filter(r => r.basis === k).length;
console.log(`\n件数: ${rows.length}（fare ${count('fare')} / demand ${count('demand')} / 根拠未記入 ${count('未記入')} / 理由なし ${rows.filter(r => r.reason === '-').length}）`);
if (unmarked.length) console.warn(`⚠️ 色が普通以外なのに根拠(priceBasis)が未記入: ${unmarked.join(', ')}`);
