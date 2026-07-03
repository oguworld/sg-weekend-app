#!/usr/bin/env node
// コミュニティコースのシードデータ生成
// 使い方: node scripts/seed-courses.js [--city=sg|bkk|syd|all] [--count=10]

const http = require('http');

const CITY_AREAS = {
  sg:  ['Central', 'East', 'West', 'North', 'North-East', 'Island-wide'],
  bkk: ['Sukhumvit', 'Silom', 'Siam', 'Riverside', 'Old Town', 'City-wide'],
  syd: ['CBD', 'Inner West', 'Eastern Suburbs', 'North Shore', 'Western Sydney', 'City-wide'],
};

const WHO_OPTIONS      = ['ファミリー', 'カップル', 'ひとり', '友人グループ'];
const AGE_OPTIONS      = ['baby', 'toddler', 'preschool', 'elementary', 'all'];
const PURPOSE_OPTIONS  = ['ぶらぶら散歩', '自然・公園', 'アート・文化', '雑貨・お土産', 'フォトスポット'];
const OCCASION_OPTIONS = ['普段使い', 'ちょっと特別'];
const STYLE_OPTIONS    = ['定番', 'ローカル', 'ニッチ'];
const FOOD_OPTIONS     = ['食べ歩きメイン', 'バランス', '見どころメイン'];
const TRANSPORT_OPTIONS = ['歩き中心', '公共交通・バス', '車・タクシー移動'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = http.request(options, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch(e) { reject(new Error('Parse error: ' + raw.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('Timeout')));
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function generateAndPublish(city, index, total) {
  const conditions = {
    with:       pick(WHO_OPTIONS),
    area:       pick(CITY_AREAS[city]),
    purpose:    pick(PURPOSE_OPTIONS),
    occasion:   pick(OCCASION_OPTIONS),
    style:      pick(STYLE_OPTIONS),
    foodFocus:  pick(FOOD_OPTIONS),
    transport:  pick(TRANSPORT_OPTIONS),
  };
  const profile = { age: pick(AGE_OPTIONS) };

  console.log(`  [${index}/${total}] 生成中... ${conditions.area} / ${conditions.style} / ${conditions.with}`);

  const genRes = await post('/api/courses/generate', {
    city,
    conditions,
    profile,
    userName: 'おでかけNavi',
    userAvatar: '🗺️',
  });

  if (genRes.status !== 200 || !genRes.body?.id) {
    console.error(`  ✗ 生成失敗 (${genRes.status}):`, JSON.stringify(genRes.body).slice(0, 100));
    return false;
  }

  const course = genRes.body;

  const pubRes = await post('/api/courses/publish', course);
  if (pubRes.status !== 200) {
    console.error(`  ✗ 公開失敗 (${pubRes.status})`);
    return false;
  }

  console.log(`  ✓ "${course.title}"`);
  return true;
}

async function seedCity(city, count) {
  console.log(`\n=== ${city.toUpperCase()} (${count}件) ===`);
  let success = 0;
  for (let i = 1; i <= count; i++) {
    const ok = await generateAndPublish(city, i, count);
    if (ok) success++;
    if (i < count) await sleep(5000);
  }
  console.log(`  → ${success}/${count} 件完了`);
}

(async () => {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => a.replace('--', '').split('='))
  );
  const cityArg = args.city || 'all';
  const count   = parseInt(args.count) || 10;
  const cities  = cityArg === 'all' ? ['sg', 'bkk', 'syd'] : [cityArg];

  console.log(`コースシード開始: [${cities.join(', ')}] × ${count}件`);
  console.log('（各生成に5秒ほどかかります）');

  for (const city of cities) {
    await seedCity(city, count);
    if (city !== cities[cities.length - 1]) await sleep(3000);
  }

  console.log('\n完了！');
})();
