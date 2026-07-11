// generate-splash.js
// ネイティブ起動画面(splash.png / splash-dark.png)を、アプリアイコン + 「おでかけNavi」ロゴテキストで生成する
// 使い方: node scripts/generate-splash.js
//
// splash-dark.png が無いと capacitor-assets がライト版を自動で暗く変換するだけになり、
// ロゴ文字が黒背景に沈んでほぼ見えなくなる（2026-07-11判明）。そのため
// app.css の html[data-theme="dark"] 配色に合わせた専用のダーク版を明示的に生成する。

const sharp = require('sharp');
const path = require('path');

const ICON_PATH = path.join(__dirname, '..', 'dosuru-icon.png');
const OUT_DIR = path.join(__dirname, '..', 'ios-app', 'resources');

const CANVAS_SIZE = 2732;
const ICON_SIZE = 560;

const THEMES = [
  {
    name: 'light',
    outPath: path.join(OUT_DIR, 'splash.png'),
    bg: '#FFF9F2', // --cream
    textDark: '#2C2420', // --midnight (「おでかけ」)
    textAccent: '#C8804A', // --caramel (「Navi」、ライト/ダーク共通)
  },
  {
    name: 'dark',
    outPath: path.join(OUT_DIR, 'splash-dark.png'),
    bg: '#1C1410', // html[data-theme="dark"] --cream
    textDark: '#F0E8DF', // html[data-theme="dark"] --midnight
    textAccent: '#C8804A', // --caramel（ダークモードでも上書きされないため同色）
  },
];

async function generate(theme) {
  const iconBuffer = await sharp(ICON_PATH).resize(ICON_SIZE, ICON_SIZE).png().toBuffer();

  const iconY = Math.round(CANVAS_SIZE / 2 - ICON_SIZE / 2 - 100);
  const textY = iconY + ICON_SIZE + 160;

  const svgText = `
    <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}">
      <text x="50%" y="${textY}" text-anchor="middle" font-family="Noto Sans CJK JP" font-weight="700" font-size="130">
        <tspan fill="${theme.textDark}">おでかけ</tspan><tspan fill="${theme.textAccent}">Navi</tspan>
      </text>
    </svg>
  `;
  const textBuffer = Buffer.from(svgText);

  await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: theme.bg,
    },
  })
    .composite([
      { input: iconBuffer, top: iconY, left: Math.round(CANVAS_SIZE / 2 - ICON_SIZE / 2) },
      { input: textBuffer, top: 0, left: 0 },
    ])
    .png()
    .toFile(theme.outPath);

  console.log(`✅ ${theme.name} 生成完了: ${theme.outPath}`);
}

async function main() {
  for (const theme of THEMES) {
    await generate(theme);
  }
}

main().catch(console.error);
