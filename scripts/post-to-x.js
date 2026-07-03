#!/usr/bin/env node
// scripts/post-to-x.js
// X (Twitter) への自動投稿スクリプト
// 使い方: node post-to-x.js --type=event|life [--city=sg|bkk|syd|all]
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Anthropic = require('@anthropic-ai/sdk');
const crypto    = require('crypto');
const fs        = require('fs');
const path      = require('path');

const HISTORY_PATH = path.join(__dirname, '../data/x-post-history.json');
const HISTORY_MAX  = 50;

const CITY_CONFIG = {
  sg:  { nameJa: 'シンガポール', flag: '🇸🇬', code: 'SG',  appUrl: 'https://dosuru.app/sg',  eventsPath: path.join(__dirname, '../data/sg/events.json') },
  bkk: { nameJa: 'バンコク',     flag: '🇹🇭', code: 'BKK', appUrl: 'https://dosuru.app/bkk', eventsPath: path.join(__dirname, '../data/bkk/events.json') },
  syd: { nameJa: 'シドニー',     flag: '🇦🇺', code: 'SYD', appUrl: 'https://dosuru.app/syd', eventsPath: path.join(__dirname, '../data/syd/events.json') },
};

const PERSONA = `【人物設定】
シンガポール在住10年超の日本人男性。ここが普通の生活の場になっている。
ランニング・テニス・サッカー観戦など体を動かすことが好き。
SGのローカルカルチャーや歴史、ホーカーフードにも興味がある。
シンガポール在住日本人向けの週末おでかけ情報アプリ（dosuru.app）を作っていて、
使ってもらえると嬉しいとは思っているが、ごり押しはしたくない。
日本に対してもSGに対してもポジティブでもネガティブでもなく、ただ生活している。
家族のことはあまり話さない。自分自身の日常をつぶやくスタイル。`;

const LIFE_THEMES = [
  // 週末・おでかけ
  '今週末も特に決まってない',
  '週末の予定を考えてる時間の方が長い',
  '久しぶりにセントーサに行ったら思ったより人が少なかった',
  'チャンギ空港に用もないのにふらっと来てしまった',
  '行こうと思ってたところがなくなってた',
  '結局いつものホーカーで終わる週末、それはそれでいい',

  // SG日常（10年目線）
  '近所のホーカーの値段が静かに上がってる',
  '知り合いが帰任した。また一人いなくなった',
  'コンドのプールを結局あまり使わない',
  '10年住んでてまだ行ってない場所がある',
  'MRT乗り換えがもう完全に体で覚えてる',
  'スコールが来るかと思ったら来なかった',
  '暑いのにもう慣れすぎて25度だと寒いと感じる',
  'シングリッシュが普通に出てくるようになって久しい',
  '気づいたら10年経ってた',
  'SGって住んでみると意外と狭い',
  '長く住むほどSGのことが分からなくなってくる気がする',
  '周りの日本人が少しずつ入れ替わっていく',

  // 仕事
  '今日ミーティングが多かった。多すぎた',
  '集中したいときにかぎって話しかけられる',
  'リモートワークと出社、結局どっちが合ってるのかよく分からない',
  'SGで働いてると英語で詰められることがある。これはこれで鍛えられる',
  '仕事の打ち合わせをホーカーでやることがたまにある。わりと好き',
  'やること多いのに優先順位がうまくつけられない日がある',
  '週末になると平日の仕事のことを忘れてしまう。月曜にまた思い出す',

  // 食べ物・飲み
  'ホーカーのチキンライス、食べ飽きないな',
  '最近ラクサにはまってる',
  'SGのコーヒー文化、けっこう好き。コピティアムのkopi-o',
  'クラフトビールの店が増えた気がする',
  '近所に新しい店ができてた。入ってみようかな',
  '外食ばかりだと、たまに自炊したくなる',

  // スポーツ・体を動かすこと
  '朝ランしてきた。暑いけどこれが一番頭が動く',
  '週末ランニング、距離より続けることの方が大事だと最近思ってる',
  'テニス久しぶりにやったら思ったより動けた',
  'テニス、うまくなりたいとは思ってるけどなかなか練習できてない',
  'サッカー観てた。やっぱりライブで観るのと全然違う',
  'プレミアリーグの試合、時差的にキツい時間帯に始まる',
  'スポーツ観るのも好きだけど、やっぱり自分で動く方が好き',
  'SGのジムとかスポーツ施設、わりと充実してる',

  // SGローカルカルチャー・歴史・食
  'ホーカーのチキンライス、食べ飽きないな',
  '最近ラクサにはまってる',
  'コピティアムのkopi-o、もう普通に好き',
  '古いショップハウスが残ってるエリアをぶらぶらするのが好き',
  'SGの歴史、住んでみると思ってたよりずっと複雑で面白い',
  'チャイナタウンとかリトルインディアとか、観光地なんだけど何回行っても発見がある',
  'SGのローカルフード、ちゃんと記録しておきたいと思いながらできてない',
  '昔からあるホーカーセンターが少しずつなくなっていくのが寂しい',
  'SGの多文化な感じ、10年経っても慣れないというかまだ面白いと思う',

  // 旅行
  'バンコク、また行きたい。SGから近いのに全然違う感じがする',
  'バリって何回行っても飽きない',
  'SGにいると旅行のハードルが下がる。どこも2〜3時間で着く',
  '旅行から帰ってくると、SGがホームだなと思う',
  '次どこ行くか考えてる。東南アジア、まだ行ってないところがある',
  '連休の使い方、毎回ギリギリまで決まらない',

  // 将来のこと
  'いつか帰るんだろうけど、帰ったらどうするんだろうって時々思う',
  'このままSGに住み続けるのか、まだ全然決まってない',
  '次のステップをそろそろ考えないといけない気がしてきた',
  'SGにいる間にやっておきたいことって、意外と後回しにしてしまう',
  '10年後もここにいるのかな、と時々ふと思う',

  // アプリ開発者としての本音
  '自分で作ったアプリなのに、週末の行き先探すとき普通に使ってる',
  'dosuru.appのコース作成機能、自分で使ってみたら思ったより良かった',
  'この機能どうしようかまだ迷ってる',
  'アプリのデザイン直したいんだけど、なかなか時間が取れない',
  'AIに任せたらだいぶ楽になった部分はあるけど、結局細かい調整が大変',
  'こういうアプリ誰かが作ってくれないかなと思ってたら自分が作ることになってた',
  'シンガポールの週末情報、意外とまとまってるところがなかった',
  'このUI、もうちょっとシンプルにできそうなんだよな',
  '機能追加したいものは山ほどあるけど、時間が足りない',
];

const anthropic = new Anthropic();

// ─── 引数解析 ─────────────────────────────────────────────────────
function parseArgs() {
  const typeArg = process.argv.find(a => a.startsWith('--type='));
  const cityArg = process.argv.find(a => a.startsWith('--city='));
  const type = typeArg ? typeArg.split('=')[1] : 'auto';
  const city = cityArg ? cityArg.split('=')[1].toLowerCase() : 'all';
  const dryRun = process.argv.includes('--dry-run');
  return { type, city, dryRun };
}

// ─── 履歴管理 ─────────────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); }
  catch { return { eventIds: [], lastType: 'event' }; }
}

function resolveType(type, history) {
  if (type !== 'auto') return type;
  const types = ['event', 'life'];
  const available = types.filter(t => t !== history.lastType);
  return available[Math.floor(Math.random() * available.length)];
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

// ─── イベント取得 ─────────────────────────────────────────────────
function loadEvents(city) {
  if (city === 'all') {
    const all = [];
    for (const [key, conf] of Object.entries(CITY_CONFIG)) {
      if (fs.existsSync(conf.eventsPath)) {
        const events = JSON.parse(fs.readFileSync(conf.eventsPath, 'utf8'));
        all.push(...events.map(e => ({ ...e, city: e.city || key })));
      }
    }
    return all;
  }
  const conf = CITY_CONFIG[city] || CITY_CONFIG.sg;
  return fs.existsSync(conf.eventsPath)
    ? JSON.parse(fs.readFileSync(conf.eventsPath, 'utf8')).map(e => ({ ...e, city: e.city || city }))
    : [];
}

function getActiveEvents(events) {
  const today = new Date().toISOString().slice(0, 10);
  return events.filter(e => !e.end_date || e.end_date >= today);
}

function pickEvent(events, postedIds) {
  const unseen = events.filter(e => !postedIds.includes(e.id));
  const pool = (unseen.length > 0 ? unseen : events)
    .sort((a, b) => (b.major_score || 0) - (a.major_score || 0))
    .slice(0, 10);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── ハッシュタグ ─────────────────────────────────────────────────
function buildHashtags(city) {
  const cityTags = {
    sg:  '#シンガポール #シンガポール生活 #週末の過ごし方 #海外在住日本人',
    bkk: '#バンコク #タイ生活 #週末の過ごし方 #海外在住日本人',
    syd: '#シドニー #オーストラリア生活 #週末の過ごし方 #海外在住日本人',
  };
  return (cityTags[city] || '#海外生活 #週末の過ごし方 #海外在住日本人').trim();
}

// ─── テキスト生成 ─────────────────────────────────────────────────

// X の無料アカウントは 280 ウェイト文字。日本語1文字=2、ASCII=1、URL=23 固定。
// ハッシュタグ（SG最大 ~61 ウェイト）を除くと本文は ~219 ウェイト ≒ 109 日本語文字が上限。
function weightedLength(text) {
  // XはURLをt.co短縮（23文字固定）でカウントする
  const urls = text.match(/https?:\/\/\S+/g) || [];
  const textWithoutUrls = text.replace(/https?:\/\/\S+/g, '');
  let count = urls.length * 23;
  for (const char of textWithoutUrls) {
    const cp = char.codePointAt(0);
    count += (cp > 0x2E7F) ? 2 : 1;
  }
  return count;
}

async function generateEventPost(event) {
  const conf = CITY_CONFIG[event.city] || CITY_CONFIG.sg;
  const typeLabel = { event: 'おでかけ', gourmet: 'グルメ', sale: 'お得情報', opening: 'NEW OPEN' }[event.type] || 'おでかけ';
  const periodText = event.period ? `期間：${event.period}` : '';
  const tipsText = event.tips?.length ? event.tips.slice(0, 2).join('／') : '';

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `以下の人物として、このイベントを見かけてふと思ったことをX投稿として書いてください。

${PERSONA}

【イベント情報】
都市: ${conf.nameJa}
種別: ${typeLabel}
施設/店名: ${event.store}
${periodText}
内容: ${event.content}
${tipsText ? `ポイント: ${tipsText}` : ''}

【要件】
- 「〜開催中です」「ぜひご参加を」などの告知・アナウンス文は禁止
- 「行ってみたい」「子ども連れて行けそう」「これは気になる」など素直な反応でいい
- オチや気づきは不要。思ったことをそのまま書く
- 深読みしない、分析しない、教えようとしない
- 家族（妻・子ども）が出てきてもいい
- 絵文字は0〜2個（国旗絵文字🇸🇬🇹🇭🇦🇺は使わない）
- URLとハッシュタグは含めない（別途追加します）
- 本文（ハッシュタグ除く）は日本語90文字以内に厳守
- 日本語のみ。完成した投稿文のみ出力（前置き・説明不要）`,
    }],
  });

  const body = res.content[0].text.trim();
  const urlLine = event.url ? `${event.url}\n` : '';
  return `${body}\n\n${urlLine}${buildHashtags(event.city)}`;
}

async function generateLifePost(theme) {

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `以下の人物として、このきっかけからX投稿を書いてください。

${PERSONA}

【きっかけ】
${theme}

【要件】
- 日常のつぶやき。オチや気づきは不要
- ポジティブでもネガティブでもなく、批判も礼賛もしない。ただ思ったことを書く
- 日本に対してもSGに対してもフラット。どちらかをひいきしない
- 深読みしない、分析しない、何かを教えようとしない
- 家族（妻・子ども）の話が出てきてもいい
- 一言でも複数文でも、自然に収まる長さで
- 絵文字は0〜2個
- URLとハッシュタグは含めない
- 本文（ハッシュタグ除く）は日本語90文字以内に厳守
- 日本語のみ。1つだけ完成した投稿文を出力（前置き・説明不要）`,
    }],
  });

  const body = res.content[0].text.trim();
  return `${body}\n\n#海外生活 #海外在住日本人 #週末の過ごし方`;
}

// ─── X投稿 ────────────────────────────────────────────────────────
function buildOAuthHeader(method, url, credentials) {
  const params = {
    oauth_consumer_key:     credentials.apiKey,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            credentials.accessToken,
    oauth_version:          '1.0',
  };
  const base = [method, encodeURIComponent(url),
    encodeURIComponent(Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&'))
  ].join('&');
  const key = `${encodeURIComponent(credentials.apiSecret)}&${encodeURIComponent(credentials.accessTokenSecret)}`;
  params.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.keys(params).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`).join(', ');
}

async function postToX(text) {
  const credentials = {
    apiKey:            process.env.X_API_KEY,
    apiSecret:         process.env.X_API_SECRET,
    accessToken:       process.env.X_ACCESS_TOKEN,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
  };
  if (!credentials.apiKey || !credentials.accessToken) {
    console.warn('⚠️  X credentials未設定のためスキップ');
    return null;
  }
  const url = 'https://api.twitter.com/2/tweets';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: buildOAuthHeader('POST', url, credentials), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const rateLimitRemaining = res.headers.get('x-rate-limit-remaining');
    const appLimitRemaining  = res.headers.get('x-app-limit-24hour-remaining');
    console.error(`[post-to-x] HTTP ${res.status} 詳細:`, JSON.stringify(err));
    if (rateLimitRemaining !== null) console.error(`[post-to-x] rate-limit-remaining: ${rateLimitRemaining}`);
    if (appLimitRemaining  !== null) console.error(`[post-to-x] app-limit-24h-remaining: ${appLimitRemaining}`);
    throw new Error(`X API error: ${res.status} ${err.detail || JSON.stringify(err.errors || err)}`);
  }
  return (await res.json()).data?.id;
}

// ─── LINE通知 ─────────────────────────────────────────────────────
async function notifyLine(text) {
  const token  = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const userId = process.env.LINE_USER_ID;
  if (!token || !userId) return;
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
  });
}

// ─── メイン ───────────────────────────────────────────────────────
async function main() {
  const { type: rawType, city, dryRun } = parseArgs();
  const history = loadHistory();
  const type = resolveType(rawType, history);
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Singapore' });
  console.log(`[post-to-x] 開始 type=${type} city=${city} (${now})`);

  let text;

  if (type === 'event') {
    const events = getActiveEvents(loadEvents(city));
    if (events.length === 0) {
      console.log('[post-to-x] アクティブなイベントなし。終了します。');
      return;
    }
    const event = pickEvent(events, history.eventIds);
    const conf = CITY_CONFIG[event.city] || CITY_CONFIG.sg;
    console.log(`[post-to-x] 選択イベント: ${event.store} (${conf.nameJa})`);
    text = await generateEventPost(event);
    history.eventIds = [event.id, ...history.eventIds].slice(0, HISTORY_MAX);

  } else {
    const theme = LIFE_THEMES[Math.floor(Math.random() * LIFE_THEMES.length)];
    console.log(`[post-to-x] 生活つぶやき: ${theme}`);
    text = await generateLifePost(theme);
  }

  history.lastType = type;

  console.log(`[post-to-x] 投稿内容:\n${'─'.repeat(40)}\n${text}\n${'─'.repeat(40)}`);
  console.log(`文字数: ${text.length}文字 / ウェイト: ${weightedLength(text)}/280`);

  if (dryRun) {
    console.log('[post-to-x] --dry-run のため投稿スキップ');
    return;
  }

  try {
    const tweetId = await postToX(text);
    if (tweetId) {
      const tweetUrl = `https://x.com/i/web/status/${tweetId}`;
      console.log(`[post-to-x] ✅ 投稿完了: ${tweetUrl}`);
      await notifyLine(`【X投稿】\n${text}\n\n${tweetUrl}`);
    }
  } catch (err) {
    console.error('[post-to-x] エラー:', err.message);
    await notifyLine(`【X投稿失敗】${err.message}\n\n投稿しようとした内容:\n${text}`);
    throw err;
  } finally {
    saveHistory(history);
  }
}

main().catch(err => {
  console.error('[post-to-x] エラー:', err.message);
  process.exit(1);
});
