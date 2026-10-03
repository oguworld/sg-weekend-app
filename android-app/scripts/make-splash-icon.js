// Android 12+ のOS標準スプラッシュ用アイコンを resources/splash*.png から生成する。
// アイコンはOSが中央の円(キャンバスの2/3)でマスクするため、ロゴ(ピン)全体がその円内に収まる倍率で配置する。
// 背景は透過抽出せず、splash画像の背景色をそのまま使い、windowSplashScreenBackground を同色にして境界を消す。
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const CANVAS = 1152;                       // 288dp @ xxxhdpi
const CIRCLE = CANVAS * 2 / 3;             // OSが見せる円の直径
const LOGO_CENTER = { x: 1000, y: 965 };   // 2000x2000素材内のピン中心
const LOGO_RADIUS = 800;                   // ピン全体を囲む半径
const SCALE = (CIRCLE / 2) / LOGO_RADIUS;

const VARIANTS = [
  { src: 'resources/splash.png',      out: 'native-overrides/drawable-nodpi/splash_icon.png',       bg: { r: 254, g: 252, b: 249 } },
  { src: 'resources/splash-dark.png', out: 'native-overrides/drawable-night-nodpi/splash_icon.png', bg: { r: 25,  g: 24,  b: 24  } },
];

(async () => {
  for (const v of VARIANTS) {
    const size = Math.round(2000 * SCALE);
    const resized = await sharp(path.join(ROOT, v.src)).removeAlpha().resize(size, size).toBuffer();
    const left = Math.round(CANVAS / 2 - LOGO_CENTER.x * SCALE);
    const top = Math.round(CANVAS / 2 - LOGO_CENTER.y * SCALE);
    await sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: v.bg } })
      .composite([{ input: resized, left, top }])
      .png()
      .toFile(path.join(ROOT, v.out));
    console.log('wrote', v.out, { scale: SCALE.toFixed(3), left, top });
  }
})();
