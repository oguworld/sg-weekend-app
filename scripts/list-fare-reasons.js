#!/usr/bin/env node
// 航空券シーズン表の「色(価格レベル)・理由・根拠」を一覧する見直し用スクリプト（設計書222）
// 実行: node scripts/list-fare-reasons.js [--city=bali] [--basis=fare|demand|check] [--level=high|low]
// 画面には出さない。priceBasis: fare=SG発の実運賃の出典あり / demand=需要・天候からの推定(実運賃は未確認) / check=要確認(出典と食い違う・根拠が弱い。見直しの最優先)
// 並び順: check → demand → fare（見直しの優先度順）、同じ根拠の中は都市・月順

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'content', 'fare-seasons.json');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));

const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
const levelLabel = lv => (lv >= 4 ? '高い' : lv <= 2 ? '安い' : '普通') + `(${lv})`;
const estLabel = lv => (lv >= 4 ? '高め' : lv <= 2 ? '安め' : '普通') + `(${lv})`;
// 色の列: fare=実運賃の出典がある月は色どおり / demand=推察(estLevel基準、画面では普通の色+推察コメント) / check=要確認(estLevel基準、画面ではグレー)
function colorLabel(mo, lv) {
  if (mo.priceBasis === 'demand' && mo.estLevel) return `推察 ${estLabel(mo.estLevel)}`;
  if (mo.priceBasis === 'check' && mo.estLevel) return `要確認 ${estLabel(mo.estLevel)}`;
  return levelLabel(lv);
}

const BASIS_ORDER = { check: 0, '未記入': 1, demand: 2, fare: 3 };
const BASIS_LABEL = { check: 'check⚠要確認' };
const rows = [];
const unmarked = [];
for (const city of data.cities) {
  if (args.city && ![city.id, city.name].includes(args.city)) continue;
  city.monthly.forEach((mo, i) => {
    const lv = city.levels[i];
    if (lv === 3 && !mo.priceReason && !mo.priceBasis && !mo.estLevel) return;
    const eff = mo.estLevel || lv;
    if (args.level === 'high' && eff < 4) return;
    if (args.level === 'low' && eff > 2) return;
    if (args.basis && mo.priceBasis !== args.basis) return;
    if (lv !== 3 && !mo.priceBasis) unmarked.push(`${city.name} ${i + 1}月`);
    rows.push({ city: city.name, month: `${i + 1}月`, level: colorLabel(mo, lv), reason: mo.priceReason || '-', basis: mo.priceBasis || '未記入', order: rows.length, source: mo.priceSource || '-' });
  });
}

rows.sort((a, b) => (BASIS_ORDER[a.basis] - BASIS_ORDER[b.basis]) || (a.order - b.order));

console.log(['都市', '月', '色', '理由', '根拠', '出典'].join('\t'));
for (const r of rows) console.log([r.city, r.month, r.level, r.reason, BASIS_LABEL[r.basis] || r.basis, r.source].join('\t'));

const count = k => rows.filter(r => r.basis === k).length;
console.log(`\n件数: ${rows.length}（fare ${count('fare')} / demand ${count('demand')} / check(要確認) ${count('check')} / 根拠未記入 ${count('未記入')} / 理由なし ${rows.filter(r => r.reason === '-').length}）`);
if (unmarked.length) console.warn(`⚠️ 色が普通以外なのに根拠(priceBasis)が未記入: ${unmarked.join(', ')}`);
