// Android 12+ のOS標準スプラッシュ用アイコンを resources/splash*.png から生成する。
// アイコンはOSが中央の円(キャンバスの2/3)でマスクするため、ロゴ(ピン)全体がその円内に収まる倍率で配置する。
// 背景は透過抽出せず、splash画像の背景色をそのまま使い、windowSplashScreenBackground を同色にして境界を消す。
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const CANVAS = 1152;                       // 288dp @ xxxhdpi
const CIRCLE = CANVAS * 2 / 3;             // OSが見せる円の直径
const LOGO_CENTER = { x: 1000, y: 1300 };  // 絵全体(ピン+スカイライン)を円に収める中心
const LOGO_RADIUS = 1170;                  // 中心から最も遠い絵の画素までの距離(左右端・上端)
const SCALE = (CIRCLE / 2) / LOGO_RADIUS;

// 端末がダークモードでもライト版を使う(夜用リソースは作らない)
const VARIANTS = [
  { src: 'resources/splash.png',      out: 'native-overrides/drawable-nodpi/splash_icon.png',       bg: { r: 254, g: 252, b: 249 } },
];

(async () => {
  for (const v of VARIANTS) {
    const size = Math.round(2000 * SCALE);
    // 元画像の背景に微妙な濃淡があり、縁がうっすら四角く見えるため、縁を背景色へぼかして馴染ませる
    const feather = Math.round(size * 0.04);
    const alphaMask = await sharp({ create: { width: size, height: size, channels: 3, background: '#000' } })
      .composite([{ input: { create: { width: size - feather * 2, height: size - feather * 2, channels: 3, background: '#fff' } }, left: feather, top: feather }])
      .blur(feather / 2).greyscale().raw().toBuffer();
    const resized = await sharp(path.join(ROOT, v.src)).removeAlpha().resize(size, size)
      .joinChannel(alphaMask, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer();
    const left = Math.round(CANVAS / 2 - LOGO_CENTER.x * SCALE);
    const top = Math.round(CANVAS / 2 - LOGO_CENTER.y * SCALE);
    await sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: v.bg } })
      .composite([{ input: resized, left, top }])
      .png()
      .toFile(path.join(ROOT, v.out));
    console.log('wrote', v.out, { scale: SCALE.toFixed(3), left, top });
  }
})();
