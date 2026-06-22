// scripts/fill-images.js
// image フィールドが空のイベントに Unsplash 画像を補完するスクリプト
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { fetchUnsplashImage } = require('./lib/unsplash');

const args = process.argv.slice(2);
const cityArg = (args.find(a => a.startsWith('--city=')) || '--city=sg').split('=')[1];
const isDryRun = args.includes('--dry-run');

const CITY_NAMES = { sg: 'シンガポール', bkk: 'バンコク', syd: 'シドニー' };

async function generateImageSearchKeywords(events, city) {
  const client = new Anthropic();
  const cityName = CITY_NAMES[city] || city;

  const prompt = `以下の${cityName}イベント一覧について、各イベントに最適なUnsplash検索キーワードを生成してください。
英語2〜4語。具体的なイベント内容を反映すること。
JSON配列で返してください: [{"index":0,"imageSearch":"singapore food festival"}]

イベント一覧:
${events.map((e, i) => `${i}. ${e.store || e.title_ja || ''} (${e.type || 'event'})`).join('\n')}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].text.trim();
  const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) return [];

  return JSON.parse(match[0]);
}

async function fillImages(city) {
  const eventsPath = path.join(__dirname, '..', 'data', city, 'events.json');
  if (!fs.existsSync(eventsPath)) {
    console.error(`[fill-images] ファイルが見つかりません: ${eventsPath}`);
    process.exit(1);
  }

  const all = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  const noImage = all.filter(e => !e.image);

  console.log(`[fill-images] ${city}: 全${all.length}件中、画像なし ${noImage.length}件`);

  if (noImage.length === 0) {
    console.log('[fill-images] 処理対象なし');
    return;
  }

  if (isDryRun) {
    console.log('[dry-run] 対象イベント:');
    noImage.forEach((e, i) => console.log(`  ${i}: ${e.store || e.title_ja}`));
    console.log('[dry-run] Claude API / Unsplash 呼び出しをスキップします。');
    return;
  }

  console.log('[fill-images] imageSearch キーワードを生成中...');
  const keywords = await generateImageSearchKeywords(noImage, city);

  const keywordMap = {};
  for (const k of keywords) {
    if (k.index !== undefined && k.imageSearch) {
      keywordMap[k.index] = k.imageSearch;
    }
  }

  console.log('[fill-images] Unsplash 画像を取得中...');
  let updated = 0;

  for (let i = 0; i < noImage.length; i++) {
    const keyword = keywordMap[i] || `${city} weekend`;
    console.log(`  [${i + 1}/${noImage.length}] "${keyword}" を検索中...`);
    const imageUrl = await fetchUnsplashImage(keyword);
    if (imageUrl) {
      noImage[i].image = imageUrl;
      updated++;
      console.log(`    -> 取得成功`);
    } else {
      console.log(`    -> 取得失敗（スキップ）`);
    }
    if (i < noImage.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  // 元配列に反映
  const noImageIds = new Set(noImage.map(e => e.id));
  const noImageByOrigId = {};
  for (const e of noImage) noImageByOrigId[e.id] = e;

  const result = all.map(e => noImageIds.has(e.id) ? noImageByOrigId[e.id] : e);
  fs.writeFileSync(eventsPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n[fill-images] 完了: ${updated}件の画像を補完しました`);
}

fillImages(cityArg).catch(e => {
  console.error('[fill-images] エラー:', e.message);
  process.exit(1);
});
