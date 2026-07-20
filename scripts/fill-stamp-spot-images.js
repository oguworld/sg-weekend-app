// scripts/fill-stamp-spot-images.js
// data/{city}/stamp-spots.json の imageUrl が空のスポットに Unsplash 画像を補完するスクリプト（設計書73）
// fill-images.js と異なり、スポット名は既に確定した固有名詞のため
// Claude API によるキーワード生成は行わず、spot.name をそのまま検索クエリに使う
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { fetchUnsplashImage } = require('./lib/unsplash');

const args = process.argv.slice(2);
const cityArg = (args.find(a => a.startsWith('--city=')) || '--city=sg').split('=')[1];
const isDryRun = args.includes('--dry-run');

function buildQuery(spot) {
  // 既に地名 "Singapore" を含むスポット名（例: "Singapore Zoo"）は重複させない
  return /singapore/i.test(spot.name) ? spot.name : `${spot.name} Singapore`;
}

async function fillStampSpotImages(city) {
  const filePath = path.join(__dirname, '..', 'data', city, 'stamp-spots.json');
  if (!fs.existsSync(filePath)) {
    console.error(`[fill-stamp-spot-images] ファイルが見つかりません: ${filePath}`);
    process.exit(1);
  }

  const all = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const noImage = all.filter(s => !s.imageUrl);

  console.log(`[fill-stamp-spot-images] ${city}: 全${all.length}件中、画像なし ${noImage.length}件`);

  if (noImage.length === 0) {
    console.log('[fill-stamp-spot-images] 処理対象なし');
    return;
  }

  if (isDryRun) {
    console.log('[dry-run] 対象スポット:');
    noImage.forEach((s, i) => console.log(`  ${i}: ${s.id} -> query: "${buildQuery(s)}"`));
    console.log('[dry-run] Unsplash 呼び出しをスキップします。');
    return;
  }

  console.log('[fill-stamp-spot-images] Unsplash 画像を取得中...');
  let updated = 0;

  for (let i = 0; i < noImage.length; i++) {
    const spot = noImage[i];
    const query = buildQuery(spot);
    console.log(`  [${i + 1}/${noImage.length}] "${query}" を検索中...`);
    const imageUrl = await fetchUnsplashImage(query);
    if (imageUrl) {
      spot.imageUrl = imageUrl;
      updated++;
      console.log(`    -> 取得成功`);
    } else {
      console.log(`    -> 取得失敗（スキップ）`);
    }
    if (i < noImage.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  // 元配列に反映（id一致でマージ、順序・他フィールドは変更しない）
  const noImageById = {};
  for (const s of noImage) noImageById[s.id] = s;

  const result = all.map(s => noImageById[s.id] ? noImageById[s.id] : s);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n[fill-stamp-spot-images] 完了: ${updated}件の画像を補完しました`);
}

if (require.main === module) {
  fillStampSpotImages(cityArg).catch(e => {
    console.error('[fill-stamp-spot-images] エラー:', e.message);
    process.exit(1);
  });
}

module.exports = { fillStampSpotImages };
