// generate-icons.js
// PWAアイコンを生成するスクリプト
// 使い方: node generate-icons.js
// 必要: npm install sharp

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE_IMAGE = path.join(__dirname, 'dosuru-icon.png');

function base() {
  return sharp(SOURCE_IMAGE);
}

async function generateIcons() {
  if (!fs.existsSync('public/icons')) {
    fs.mkdirSync('public/icons', { recursive: true });
  }

  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

  for (const size of sizes) {
    await base()
      .resize(size, size)
      .png()
      .toFile(`public/icons/icon-${size}.png`);
    console.log(`✅ icon-${size}.png`);
  }

  // Apple Touch Icon（iOS用 180x180）
  await base()
    .resize(180, 180)
    .png()
    .toFile('public/icons/apple-touch-icon.png');
  console.log('✅ apple-touch-icon.png');

  // favicon（ブラウザタブ用 32x32）
  await base()
    .resize(32, 32)
    .png()
    .toFile('public/icons/favicon.png');
  console.log('✅ favicon.png');

  console.log('\n🎉 全アイコン生成完了！');
}

generateIcons().catch(console.error);
