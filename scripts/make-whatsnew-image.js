// 新機能の紹介(What's New)用の画像を、iPhoneのスクショから作る(設計書227)。
// 使い方: node scripts/make-whatsnew-image.js <入力スクショ> <出力名.webp> <left> <top> <width> <height>
// 例:     node scripts/make-whatsnew-image.js ~/shot.png flight.webp 56 600 1180 1380
// 切り出し範囲(元画像のピクセル)は、ステータスバー・下のナビ・右下のスクロールボタンが写らないように指定する。
// 出力: content/whats-new/images/<出力名>(幅720px、角丸、WebP)。画像はアプリに同梱せず、サーバーから配信する。
'use strict';

const path = require('path');
const fs = require('fs');

function loadSharp() {
  const candidates = [
    'sharp',
    path.join(__dirname, '..', 'ios-app', 'node_modules', 'sharp'),
    path.join(__dirname, '..', 'android-app', 'node_modules', 'sharp'),
  ];
  for (const c of candidates) {
    try { return require(c); } catch (_) { /* 次の候補へ */ }
  }
  console.error('sharp が見つかりません。ios-app または android-app で npm install してください。');
  process.exit(1);
}

async function main() {
  const [input, outName, left, top, width, height] = process.argv.slice(2);
  const nums = [left, top, width, height].map(Number);
  if (!input || !outName || nums.some(n => !Number.isInteger(n) || n < 0) || nums[2] === 0 || nums[3] === 0) {
    console.error('使い方: node scripts/make-whatsnew-image.js <入力スクショ> <出力名.webp> <left> <top> <width> <height>');
    process.exit(1);
  }
  if (!/^[\w.-]+\.webp$/.test(outName)) {
    console.error('出力名は英数字・ハイフン・ドット・アンダースコアの .webp にしてください。');
    process.exit(1);
  }
  const [l, t, w, h] = nums;
  const sharp = loadSharp();

  const meta = await sharp(input).metadata();
  if (l + w > meta.width || t + h > meta.height) {
    console.error(`切り出し範囲が画像(${meta.width}x${meta.height})からはみ出しています。`);
    process.exit(1);
  }

  const outW = 720;
  const outH = Math.round(h * outW / w);
  const radius = 28;
  const mask = Buffer.from(
    `<svg width="${outW}" height="${outH}"><rect width="${outW}" height="${outH}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
  );

  const resized = await sharp(input)
    .extract({ left: l, top: t, width: w, height: h })
    .resize(outW, outH)
    .toBuffer();

  const outDir = path.join(__dirname, '..', 'content', 'whats-new', 'images');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, outName);
  await sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .webp({ quality: 82 })
    .toFile(outPath);

  const size = fs.statSync(outPath).size;
  console.log(`出力: ${outPath} (${outW}x${outH}, ${(size / 1024).toFixed(1)}KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
