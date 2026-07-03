#!/usr/bin/env node
// イベント取り込み後に実行: システム生成コースを新陳代謝させる
// - いいね数が少ない（同数なら古い順）システムコースを2件削除
// - 新コースを3件ランダム生成・公開
// 使い方: node scripts/refresh-courses.js [--city=sg|bkk|syd|all]

const fs   = require('fs');
const path = require('path');
const http = require('http');

const SYSTEM_AUTHOR = 'おでかけNavi';
const TRIM_COUNT    = 2;
const ADD_COUNT     = 3;

const CITY_AREAS = {
  sg:  ['Central', 'East', 'West', 'North', 'North-East', 'Island-wide'],
  bkk: ['Sukhumvit', 'Silom', 'Siam', 'Riverside', 'Old Town', 'City-wide'],
  syd: ['CBD', 'Inner West', 'Eastern Suburbs', 'North Shore', 'Western Sydney', 'City-wide'],
};
const WHO_OPTIONS      = ['ファミリー', 'カップル', 'ひとり', '友人グループ'];
const AGE_OPTIONS      = ['baby', 'preschool', 'elementary', 'all'];
const PURPOSE_OPTIONS  = ['ぶらぶら散歩', '自然・公園', 'アート・文化', '雑貨・お土産', 'フォトスポット'];
const OCCASION_OPTIONS = ['普段使い', 'ちょっと特別'];
const STYLE_OPTIONS    = ['定番', 'ローカル', 'ニッチ'];
const FOOD_OPTIONS     = ['食べ歩きメイン', 'バランス', '見どころメイン'];
const TRANSPORT_OPTIONS = ['歩き中心', '公共交通・バス', '車・タクシー移動'];
const TIMESLOT_OPTIONS  = ['午前', '午後', '夕方・夜'];

// 在住日本人が入力しそうなひとこと（バリエーションを広げるため）
const NOTE_OPTIONS = {
  sg: [
    '子どもが走り回れる場所を入れてほしい',
    '暑いので屋内中心で',
    'ローカルフードを楽しみたい',
    '写真映えするスポットを入れて',
    '子どもが飽きないようにしたい',
    '在住3年だけどまだ行ったことない場所で',
    '夜は早めに帰りたいので夕方解散で',
    '混んでいる観光地は避けたい',
    '歩くのが好きなのでたくさん歩きたい',
    'カフェでゆっくりする時間がほしい',
    'ホーカーで地元飯を食べたい',
    '子どもが動物や自然に触れられる場所で',
    '日差しが強いので日陰が多いルートで',
    '赤ちゃん連れなのでベビーカーで回れる場所で',
    '買い物もしたい',
    '久しぶりの一人時間なので自分のペースで',
    '日本人があまり行かない穴場を知りたい',
    '夕日がきれいな場所を入れてほしい',
    'お酒が飲める場所を夜に入れて',
    'アートや壁画が見たい',
  ],
  bkk: [
    'トゥクトゥクで移動したい',
    '本場タイ料理をたくさん食べたい',
    '暑いのでクーラーの効いた場所も入れて',
    '市場でローカル体験したい',
    'マッサージも組み込んでほしい',
    '寺院めぐりをしたい',
    '子ども連れなので安全なルートで',
    '夜市にも行きたい',
    'バンコク在住2年、まだ行ったことない場所で',
    '屋台グルメを食べ歩きしたい',
    '川沿いをのんびり歩きたい',
    '混雑を避けて午前中にメインを回りたい',
    '写真スポットを重視して',
    'ローカルのコーヒーショップでゆっくりしたい',
    'チャトチャックみたいなマーケット系で',
  ],
  syd: [
    '海沿いのコースにしてほしい',
    '子どもが遊べる公園を入れて',
    'ブランチが食べたい',
    'フェリーで移動したい',
    'ビーチを歩きたい',
    '自然の中でリフレッシュしたい',
    'シドニー在住1年でまだ知らない場所へ',
    'コーヒー文化を楽しみたい',
    '週末マーケットに行きたい',
    '子どもが動物と触れ合える場所で',
    '日本人があまり行かない郊外を探索したい',
    'アートギャラリーや博物館を入れて',
    'ハーバービューが見える場所で',
    'ウォーキングコースにしたい',
    '夕方サンセットが見える場所を入れて',
  ],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function post(path_, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(
      { hostname: 'localhost', port: 3000, path: path_, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch(e) { reject(new Error('Parse error: ' + raw.slice(0, 200))); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('Timeout')));
    req.write(body);
    req.end();
  });
}

function trimSystemCourses(city) {
  const filePath = path.join(__dirname, '..', 'data', city, 'community-courses.json');
  if (!fs.existsSync(filePath)) return 0;

  const courses = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const sysCourses = courses.filter(c => c.authorName === SYSTEM_AUTHOR);
  const userCourses = courses.filter(c => c.authorName !== SYSTEM_AUTHOR);

  if (sysCourses.length <= TRIM_COUNT) {
    console.log(`  [trim] システムコース ${sysCourses.length}件（少ないため削除スキップ）`);
    return 0;
  }

  // いいね昇順 → 同数なら作成日昇順（古い順）でソート → 先頭TRIM_COUNT件を削除
  sysCourses.sort((a, b) => {
    const likeDiff = (a.likes || 0) - (b.likes || 0);
    if (likeDiff !== 0) return likeDiff;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  const toDelete = sysCourses.slice(0, TRIM_COUNT);
  const deleteIds = new Set(toDelete.map(c => c.id));
  const remaining = courses.filter(c => !deleteIds.has(c.id));

  fs.writeFileSync(filePath, JSON.stringify(remaining, null, 2), 'utf8');

  toDelete.forEach(c => console.log(`  [trim] 削除: ❤️${c.likes || 0}  ${c.title}`));
  return toDelete.length;
}

function loadExistingCourses(city) {
  const filePath = path.join(__dirname, '..', 'data', city, 'community-courses.json');
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isSimilarToExisting(course, existing) {
  const title = course.title || '';
  const newSpots = (course.spots || []).map(s => s.name || '').filter(Boolean);
  const titleKeywords = (title.match(/[぀-龯゠-ヿ]{2,}|[A-Za-z]{4,}/g) || []).filter(w => w.length >= 3);

  return existing.some(c => {
    if (c.id === course.id) return false;

    // スポット名が2件以上一致 → 類似
    const existSpots = (c.spots || []).map(s => s.name || '').filter(Boolean);
    const spotOverlap = newSpots.filter(s => existSpots.includes(s)).length;
    if (spotOverlap >= 2) return true;

    // タイトルキーワードが2語以上共通 → 類似
    const existKeywords = ((c.title || '').match(/[぀-龯゠-ヿ]{2,}|[A-Za-z]{4,}/g) || []).filter(w => w.length >= 3);
    const keywordOverlap = titleKeywords.filter(kw => existKeywords.includes(kw)).length;
    if (keywordOverlap >= 2) return true;

    return false;
  });
}

async function addSystemCourses(city) {
  let success = 0;
  for (let i = 1; i <= ADD_COUNT; i++) {
    const note = pick(NOTE_OPTIONS[city] || NOTE_OPTIONS.sg);
    const conditions = {
      with:      pick(WHO_OPTIONS),
      area:      pick(CITY_AREAS[city]),
      purpose:   pick(PURPOSE_OPTIONS),
      occasion:  pick(OCCASION_OPTIONS),
      style:     pick(STYLE_OPTIONS),
      foodFocus: pick(FOOD_OPTIONS),
      transport: pick(TRANSPORT_OPTIONS),
      timeslot:  pick(TIMESLOT_OPTIONS),
      note,
    };
    const profile = { age: pick(AGE_OPTIONS) };

    console.log(`  [add ${i}/${ADD_COUNT}] ${conditions.area} / ${conditions.style} / ${conditions.with} / "${note}"`);

    try {
      const genRes = await post('/api/courses/generate', {
        city, conditions, profile,
        userName: SYSTEM_AUTHOR, userAvatar: '🗺️',
      });
      if (genRes.status !== 200 || !genRes.body?.id) {
        console.error(`  ✗ 生成失敗 (${genRes.status})`);
      } else {
        const course = genRes.body;
        // 公開前に重複チェック（現時点のファイルを再読み込み）
        const existing = loadExistingCourses(city);
        if (isSimilarToExisting(course, existing)) {
          console.log(`  ⚠ スキップ（重複）: "${course.title}"`);
        } else {
          const pubRes = await post('/api/courses/publish', course);
          if (pubRes.status !== 200) {
            console.error(`  ✗ 公開失敗 (${pubRes.status})`);
          } else {
            console.log(`  ✓ "${course.title}"`);
            success++;
          }
        }
      }
    } catch(e) {
      console.error(`  ✗ エラー: ${e.message}`);
    }

    if (i < ADD_COUNT) await sleep(5000);
  }
  return success;
}

async function refreshCity(city) {
  console.log(`\n=== ${city.toUpperCase()} ===`);
  const added = await addSystemCourses(city);
  console.log(`  → 追加${added}件`);
}

(async () => {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => a.replace('--', '').split('='))
  );
  const cityArg = args.city || 'all';
  const cities  = cityArg === 'all' ? ['sg', 'bkk', 'syd'] : [cityArg];

  console.log(`[$(date)] コースリフレッシュ開始: [${cities.join(', ')}]`);

  for (const city of cities) {
    await refreshCity(city);
    if (city !== cities[cities.length - 1]) await sleep(3000);
  }

  console.log('\n完了！');
})();
