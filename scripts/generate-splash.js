// generate-splash.js
// ネイティブ起動画面(splash.png)を、アプリアイコン + 「おでかけNavi」ロゴテキストで生成する
// 使い方: node scripts/generate-splash.js

const sharp = require('sharp');
const path = require('path');

const ICON_PATH = path.join(__dirname, '..', 'dosuru-icon.png');
const OUT_PATH = path.join(__dirname, '..', 'ios-app', 'resources', 'splash.png');

const CANVAS_SIZE = 2732;
const ICON_SIZE = 560;
const BG_COLOR = '#FFF9F2'; // --cream
const TEXT_COLOR_DARK = '#2C2420'; // --midnight (「おでかけ」)
const TEXT_COLOR_ACCENT = '#C8804A'; // --caramel (「Navi」)

async function main() {
  const iconBuffer = await sharp(ICON_PATH).resize(ICON_SIZE, ICON_SIZE).png().toBuffer();

  const iconY = Math.round(CANVAS_SIZE / 2 - ICON_SIZE / 2 - 100);
  const textY = iconY + ICON_SIZE + 160;

  const svgText = `
    <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}">
      <text x="50%" y="${textY}" text-anchor="middle" font-family="Noto Sans CJK JP" font-weight="700" font-size="130">
        <tspan fill="${TEXT_COLOR_DARK}">おでかけ</tspan><tspan fill="${TEXT_COLOR_ACCENT}">Navi</tspan>
      </text>
    </svg>
  `;
  const textBuffer = Buffer.from(svgText);

  await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite([
      { input: iconBuffer, top: iconY, left: Math.round(CANVAS_SIZE / 2 - ICON_SIZE / 2) },
      { input: textBuffer, top: 0, left: 0 },
    ])
    .png()
    .toFile(OUT_PATH);

  console.log(`✅ splash.png 生成完了: ${OUT_PATH}`);
}

main().catch(console.error);
