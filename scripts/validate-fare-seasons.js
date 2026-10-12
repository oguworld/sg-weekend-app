#!/usr/bin/env node
// 航空券シーズン表(content/fare-seasons.json)の形式検証スクリプト（設計書222）
// 実行: node scripts/validate-fare-seasons.js
// 手書きで磨くコンテンツのため、levels/climateが12要素・レベルが1〜5の範囲か等の形式エラーを機械的に検出する。

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'content', 'fare-seasons.json');
const VALID_HAUL = ['near', 'mid', 'far'];

function fail(errors) {
  console.error(`❌ fare-seasons.json 検証エラー (${errors.length}件):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(FILE_PATH, 'utf8');
  } catch (e) {
    fail([`ファイルが読み込めません: ${e.message}`]);
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail([`JSONパースエラー: ${e.message}`]);
    return;
  }

  const errors = [];
  const warnings = [];

  if (!Array.isArray(data.cities) || data.cities.length === 0) {
    fail(['cities配列が存在しないか空です']);
    return;
  }

  const seenIds = new Set();

  data.cities.forEach((city, idx) => {
    const label = `cities[${idx}] (id=${city && city.id})`;

    if (!city.id || typeof city.id !== 'string') {
      errors.push(`${label}: idが無いか文字列ではありません`);
    } else if (seenIds.has(city.id)) {
      errors.push(`${label}: idが重複しています`);
    } else {
      seenIds.add(city.id);
    }

    if (!city.name || typeof city.name !== 'string') {
      errors.push(`${label}: nameが無いか文字列ではありません`);
    }

    if (!VALID_HAUL.includes(city.haul)) {
      errors.push(`${label}: haulが不正です(near/mid/farのいずれか必須、実際: ${city.haul})`);
    }

    if (typeof city.direct !== 'boolean') {
      errors.push(`${label}: directが真偽値ではありません`);
    }

    if (!city.flightHours || typeof city.flightHours !== 'string') {
      errors.push(`${label}: flightHoursが無いか文字列ではありません`);
    }

    if (!Array.isArray(city.levels) || city.levels.length !== 12) {
      errors.push(`${label}: levelsが12要素の配列ではありません(実際: ${Array.isArray(city.levels) ? city.levels.length : typeof city.levels}要素)`);
    } else {
      city.levels.forEach((lv, i) => {
        if (!Number.isInteger(lv) || lv < 1 || lv > 5) {
          errors.push(`${label}: levels[${i}] (${i + 1}月) が1〜5の整数ではありません(実際: ${lv})`);
        }
      });
    }

    if (!Array.isArray(city.climate) || city.climate.length !== 12) {
      errors.push(`${label}: climateが12要素の配列ではありません(実際: ${Array.isArray(city.climate) ? city.climate.length : typeof city.climate}要素)`);
    } else {
      city.climate.forEach((c, i) => {
        if (!c || typeof c !== 'string') {
          errors.push(`${label}: climate[${i}] (${i + 1}月) が空か文字列ではありません`);
        }
      });
    }

    if (!Array.isArray(city.cheapestMonths)) {
      errors.push(`${label}: cheapestMonthsが配列ではありません(最安レベルが3以上の都市は空配列[])`);
    } else {
      city.cheapestMonths.forEach(m => {
        if (!Number.isInteger(m) || m < 1 || m > 12) {
          errors.push(`${label}: cheapestMonthsに不正な月があります(実際: ${m})`);
        }
      });
      // cheapestMonthsとlevelsの整合性（最安月として挙げた月のlevelが最低値と一致しているか）
      if (Array.isArray(city.levels) && city.levels.length === 12) {
        const minLevel = Math.min(...city.levels);
        if (city.cheapestMonths.length === 0 && minLevel < 3) {
          errors.push(`${label}: 最安レベル(${minLevel})の月があるのにcheapestMonthsが空です`);
        }
        city.cheapestMonths.forEach(m => {
          const lv = city.levels[m - 1];
          if (lv !== minLevel) {
            errors.push(`${label}: cheapestMonths(${m}月)のlevel(${lv})が最安値(${minLevel})と一致していません`);
          }
        });
      }
    }

    if (!city.notes || typeof city.notes !== 'string') {
      errors.push(`${label}: notesが無いか文字列ではありません`);
    }

    if (!Array.isArray(city.monthly) || city.monthly.length !== 12) {
      errors.push(`${label}: monthlyが12要素の配列ではありません(実際: ${Array.isArray(city.monthly) ? city.monthly.length : typeof city.monthly}要素)`);
    } else {
      city.monthly.forEach((m, i) => {
        ['weather', 'local'].forEach(key => {
          if (!m || typeof m[key] !== 'string' || m[key].trim() === '') {
            errors.push(`${label}: monthly[${i}] (${i + 1}月) の${key}が空か文字列ではありません`);
          }
        });
        const pr = m && m.priceReason;
        if (pr !== undefined && pr !== null && (typeof pr !== 'string' || pr.trim() === '' || pr.length > 30)) {
          errors.push(`${label}: monthly[${i}] (${i + 1}月) のpriceReasonは1〜30文字の文字列かnullにしてください`);
        }
        const lv = Array.isArray(city.levels) ? city.levels[i] : 3;
        if (lv !== 3 && (pr === undefined || pr === null)) {
          warnings.push(`${city.name} ${i + 1}月(レベル${lv}): 価格の理由(priceReason)が未記入`);
        }
        const pb = m && m.priceBasis;
        const ps = m && m.priceSource;
        if (pb !== undefined && pb !== 'fare' && pb !== 'demand' && pb !== 'check' && pb !== 'unsupported') {
          errors.push(`${label}: monthly[${i}] (${i + 1}月) のpriceBasisはfare・demand・check・unsupportedのいずれかです(実際: ${pb})`);
        }
        if ((pb === 'fare' || pb === 'check' || pb === 'unsupported') && (typeof ps !== 'string' || ps.trim() === '')) {
          errors.push(`${label}: monthly[${i}] (${i + 1}月) はpriceBasisが${pb}なのでpriceSource(出典・理由)が必要です`);
        }
        const el = m && m.estLevel;
        if (el !== undefined && (!Number.isInteger(el) || el < 1 || el > 5)) {
          errors.push(`${label}: monthly[${i}] (${i + 1}月) のestLevelは1〜5の整数です(実際: ${el})`);
        }
        if (pb === 'demand' && (lv !== 3 || el === undefined)) {
          errors.push(`${label}: monthly[${i}] (${i + 1}月) はpriceBasisがdemand(推定)なのでlevelsは3、estLevelが必要です(色は実運賃の出典がある月のみ)`);
        }
        if (pb === 'fare' && lv === 3) {
          errors.push(`${label}: monthly[${i}] (${i + 1}月) はpriceBasisがfareなのにlevelsが3です`);
        }
        if ((pb === 'check' || pb === 'unsupported') && (el === undefined || lv !== 3)) {
          errors.push(`${label}: monthly[${i}] (${i + 1}月) はpriceBasisが${pb}なのでlevelsは3、estLevel(元の想定)が必要です(出典で高い・安いが確認できない月は普通の色)`);
        }
        if (lv !== 3 && pb === undefined) {
          warnings.push(`${city.name} ${i + 1}月(レベル${lv}): 根拠(priceBasis)が未記入`);
        }
      });
    }
  });

  if (!data.legend || typeof data.legend !== 'object') {
    errors.push('legendが存在しません');
  } else {
    ['1', '2', '3', '4', '5'].forEach(k => {
      if (!data.legend[k]) errors.push(`legend["${k}"]が存在しません`);
    });
  }

  if (!data.bookingLeadTime || typeof data.bookingLeadTime !== 'object') {
    errors.push('bookingLeadTimeが存在しません');
  } else {
    VALID_HAUL.forEach(h => {
      if (!data.bookingLeadTime[h]) {
        errors.push(`bookingLeadTime["${h}"]が存在しません`);
      } else {
        ['1', '2', '3', '4', '5'].forEach(k => {
          if (!data.bookingLeadTime[h][k]) errors.push(`bookingLeadTime["${h}"]["${k}"]が存在しません`);
        });
      }
    });
  }

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  if (warnings.length > 0) {
    console.warn(`⚠️ 価格の理由・根拠が未記入の月 (${warnings.length}件):`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }
  console.log(`✅ fare-seasons.json 検証OK（${data.cities.length}都市）`);
}

main();
