// Play Console のスクリーンショット規格に合わせる: 24bit PNG(アルファ無し)、長辺が短辺の2倍以内。
// 実機の縦長画面(1200x2670, 比2.225)は2倍を超えるため、左右の端の画素を複製して幅1336へ広げる(比1.9985)。
// 端の列は背景色/ボトムナビの白で連続しているので、継ぎ目は出ない。
const path = require('path');
const sharp = require('sharp');
const ROOT = path.join(__dirname, '..');
const SRC = process.argv[2];
const SHOTS = [
  ['a14c0ac4-30.png', '01-kurashi.png'],
  ['ca32336d-31.png', '02-odekake.png'],
  ['3df162bb-32.png', '03-calendar.png'],
];
(async () => {
  for (const [from, to] of SHOTS) {
    const m = await sharp(path.join(SRC, from)).metadata();
    const pad = Math.ceil((Math.ceil(m.height / 2) - m.width) / 2) + 1;
    const { data, info } = await sharp(path.join(SRC, from)).removeAlpha()
      .extend({ left: pad, right: pad, extendWith: 'copy' }).raw().toBuffer({ resolveWithObject: true });
    // 見切れているチップ等の端の画素を複製すると横すじになるため、端が「背景色/白」でない行は背景色で塗る
    const BG = [250, 250, 248], WHITE = [255, 255, 255];
    const near = (i, c) => Math.hypot(data[i] - c[0], data[i + 1] - c[1], data[i + 2] - c[2]) < 6;
    for (let y = 0; y < info.height; y++) {
      for (const [edgeX, from_, to_] of [[pad, 0, pad], [pad + m.width - 1, pad + m.width, info.width]]) {
        const e = (y * info.width + edgeX) * 3;
        if (near(e, BG) || near(e, WHITE)) continue;
        for (let x = from_; x < to_; x++) { const i = (y * info.width + x) * 3; data[i] = BG[0]; data[i + 1] = BG[1]; data[i + 2] = BG[2]; }
      }
    }
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
      .png().toFile(path.join(ROOT, 'store-assets/screenshots', to));
    const o = await sharp(path.join(ROOT, 'store-assets/screenshots', to)).metadata();
    console.log(to, o.width + 'x' + o.height, 'ratio', (o.height / o.width).toFixed(4), 'alpha', o.hasAlpha);
  }
  // フィーチャーグラフィックはアルファ無し(24bit)が必須
  const fg = path.join(ROOT, 'store-assets/feature-graphic.png');
  const buf = await sharp(fg).flatten({ background: '#fafaf8' }).removeAlpha().png().toBuffer();
  require('fs').writeFileSync(fg, buf);
  const f = await sharp(fg).metadata();
  console.log('feature-graphic.png', f.width + 'x' + f.height, 'alpha', f.hasAlpha, 'channels', f.channels);
})();
