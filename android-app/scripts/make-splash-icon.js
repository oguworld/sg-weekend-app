// Android 12+ のOS標準スプラッシュ用アイコンを resources/splash*.png から生成する。
// アイコンはOSが中央の円(キャンバスの2/3)でマスクするため、「ロゴ+アプリ名」をセットでその円内に収める。
// 背景は透過抽出せず、splash画像の背景色をそのまま使い、windowSplashScreenBackground を同色にして境界を消す。
// OS標準スプラッシュは文字だけを別に出せないので、アプリ名は画像に描き込む(iOS版の「ロゴ+SG在住Navi」に合わせる)。
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const CANVAS = 1152;                 // 288dp @ xxxhdpi
const ART_CROP = { left: 0, top: 180, width: 2000, height: 1790 }; // 素材内の絵(ピン+スカイライン)の範囲
const ART_W = 528;                   // 絵の幅(2026-10-04に1.2倍へ拡大。440→528)
const GAP = 26;                      // 絵と文字の間
const FONT_SIZE = 101;                // 84→101(1.2倍)
const FONT = 'Noto Sans CJK JP';

const VARIANTS = [
  { src: 'resources/splash.png',      out: 'native-overrides/drawable-nodpi/splash_icon.png',       bg: { r: 254, g: 252, b: 249 }, name: '#2B2B29', navi: '#4F6B49' },
  { src: 'resources/splash-dark.png', out: 'native-overrides/drawable-night-nodpi/splash_icon.png', bg: { r: 25,  g: 24,  b: 24  }, name: '#F2F2EE', navi: '#9DBB93' },
];

(async () => {
  const artH = Math.round(ART_W * ART_CROP.height / ART_CROP.width);
  const textBox = Math.round(FONT_SIZE * 1.25);
  const artLeft = Math.round((CANVAS - ART_W) / 2);
  // 文字は円の下側ほど入る幅が狭くなる。文字の幅(約5.71em)が円からはみ出さない一番下の位置に文字を置き、
  // その上に絵を重ねる(上下の中央揃えにはしない)。
  const textHalf = FONT_SIZE * 2.86;
  const maxOffset = Math.sqrt((CANVAS / 3) ** 2 - textHalf ** 2);
  const inkBottom = CANVAS / 2 + maxOffset - 10;
  const textTop = Math.round(inkBottom - FONT_SIZE * 1.06);
  const artTop = textTop - GAP - artH;

  for (const v of VARIANTS) {
    // 元画像の背景に微妙な濃淡があり、縁がうっすら四角く見えるため、縁を背景色へぼかして馴染ませる
    const feather = Math.round(ART_W * 0.04);
    const alphaMask = await sharp({ create: { width: ART_W, height: artH, channels: 3, background: '#000' } })
      .composite([{ input: { create: { width: ART_W - feather * 2, height: artH - feather * 2, channels: 3, background: '#fff' } }, left: feather, top: feather }])
      .blur(feather / 2).greyscale().raw().toBuffer();
    const art = await sharp(path.join(ROOT, v.src)).removeAlpha().extract(ART_CROP).resize(ART_W, artH)
      .joinChannel(alphaMask, { raw: { width: ART_W, height: artH, channels: 1 } }).png().toBuffer();

    const svg = Buffer.from(
      `<svg width="${CANVAS}" height="${textBox}" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="${CANVAS / 2}" y="${Math.round(FONT_SIZE * 0.98)}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${FONT_SIZE}">` +
      `<tspan fill="${v.name}">SG在住</tspan><tspan fill="${v.navi}">Navi</tspan></text></svg>`);
    const text = await sharp(svg).png().toBuffer();

    await sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: v.bg } })
      .composite([{ input: art, left: artLeft, top: artTop }, { input: text, left: 0, top: textTop }])
      .png()
      .toFile(path.join(ROOT, v.out));
    console.log('wrote', v.out, { artTop, artLeft, artH, textTop });
  }
})();
