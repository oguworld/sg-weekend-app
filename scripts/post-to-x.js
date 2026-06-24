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
シンガポールに長く住んでいる30〜40代の日本人男性。仕事でSGに来た経緯だが、今は生活者として根を張っている。
日本びいきでもシンガポールびいきでもなく、どちらの社会もフラットに観察している。良い面も悪い面も、そのまま見る。
「なぜそうなっているのか」「どういう構造でこうなっているのか」を考えるのが習慣になっている。
読んだ人が「あーなるほど、確かにそういう見方もあるか」「あー実はこういう構造になっていたのか」と気づくような一言を残すのが好き。
知識はあるが押し付けない。説教しない。答えを断言するより、視点を提示するスタイル。
つぶやきは個人の独り言。駐在員か現地採用かは分からないくらいの温度感。`;

const LIFE_THEMES = [
  // 週末探し・日常の逆説
  '行き先を決めずに出かけて、結局ホーカーでのんびりしてしまう週末。これが最適解なのかもしれない',
  '「今週末こそ行こう」と思っていたのに月曜になっていた件。意志の力より習慣の力の方が強い',
  '週末の予定をきっちり立てるほど、なぜか楽しくなくなるという現象',
  'ネットで「SG 週末」と検索しても出てくる情報が同じになってきた。アルゴリズムに慣れさせられている',
  'チャンギ空港に用もないのにふらっと行く週末。世界中の人が通過するのを眺めるだけで妙に満たされる',
  '「行ってみたいリスト」は増え続けるのに消化速度が追いつかない。情報過多の時代の週末問題',

  // SG生活の斜め観察
  'MRTが定時通りなのに2年経つと「遅延している」と感じるようになった。人間の基準値がいかに簡単に書き換えられるか',
  'チキンライスを「また食べた」と言える状態になると、SG生活が板についてきたサイン。観光客と住人の境界線はそこにある',
  'おしゃれになったホーカーが増えるほど、本来のホーカー文化が薄まっていく皮肉。保存と進化は両立しない',
  'ドンキが日本人コミュニティの社交場になっている件。商業施設がコミュニティを作る時代',
  'シングリッシュが少しずつ染みついてきた自覚。言語は環境に負ける',
  'スコールの直後だけ外が涼しくなる。その5分間だけ、SGが別の街になる',

  // SG社会の構造・逆説
  'HDB高騰で「市民のための住宅」というコンセプトが少しずつ崩れてきている気がする',
  '外国人締め出し強化と外資招致を同時にやっているSGの巧みさ。矛盾に見えて矛盾じゃない',
  'SGって「清潔で安全」が売りだけど、その維持コストは誰が払っているのかを考えると複雑になる',
  'SGと米中の間で立ち回る外交を見ていると、小国が生き残るための知恵として純粋に面白い',
  'SGのAI・テック投資がここ数年で急加速している。国家が本気で産業転換しようとするとこうなる',
  'リーシェンロン体制が終わって、SGの次の章が始まっている。安定していた国のターニングポイントは静かに来る',
  'SGって年々「観光地化」されていく気がして、住人目線では複雑。誰のための都市設計なのかという問い',
  'アジア経済の重心がどこにあるのか、SGにいるとなんとなく肌感覚でわかる気がする',

  // 日本との比較（逆説的に）
  '日本に一時帰国するたびに「あ、これ当たり前じゃなかったんだ」と気づく。海外に出るのは日本を見るためでもある',
  '日本のサービスの丁寧さに感動しながら、その丁寧さを支えるコストのことも考えてしまう',
  'SGに長くいると日本の「空気を読む文化」が客観的に見えてくる。内側にいると見えないものがある',
  '帰国したとき日本のコンビニで毎回感動する。感動できるうちは、まだ自分の中に日本の基準が生きている証拠',
  '円安がまだ続いていて、日本円の感覚がだいぶ遠くなってきた。通貨感覚のズレは静かに価値観のズレになる',

  // 海外生活・駐在の本質
  'アジアで長く生活していると「次はどこに行く？」が普通の会話になってくる。定住という概念が溶けていく',
  '海外に長くいると「これってどこの国の感覚だっけ」となる瞬間がある。アイデンティティは環境で変わる',
  '在住者目線でSGを案内するとき、観光客と全然違う場所に連れて行きたくなる。「本当のSG」は観光マップにない',
  '平日忙しいと週末への期待値が上がりすぎて、実際の土曜がちょっと負けてしまう。幸福は比較から生まれない',
  'グローバルに動く人が増えているのか、周りの日本人の選択肢が昔より多様になってきた。それは良いことのはずなのに、少し寂しい気もする',

  // 時事・世界（斜め読み）
  '米国の動きを見ながら「アジアはどうなるんだろう」と考える週末がある。答えはないけど考え続けることに意味がある',
  'AIがここ1〜2年で仕事の感覚を変えてきていて、SGにいてもその波を感じる。変化の速さが加速している',
  'SGの物価上昇、外食費の話ばかりになるけど、本当の問題は「何を諦めるかの選択が増えた」ことだと思う',
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
  let count = 0;
  for (const char of text) {
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
      content: `以下の人物として、イベントを見かけてふと思った独り言をX投稿として書いてください。

${PERSONA}

【イベント情報】
都市: ${conf.nameJa}
種別: ${typeLabel}
施設/店名: ${event.store}
${periodText}
内容: ${event.content}
${tipsText ? `ポイント: ${tipsText}` : ''}

【要件】
- 情報共有・アナウンス的な書き方は禁止（「〜開催中です」「ぜひご参加を」などはNG）
- 単なる「行ってみたい」より、そのイベントが示す構造・背景・意外な視点を一言添えてもよい
- 目標は「あーなるほど、そういう見方もあるか」「実はこういう構造だったのか」という気づき
- 日本もSGもフラットに見る。どちらを持ち上げたり落としたりしない
- 答えを断言するより、視点を提示するスタイル（「〜な気がする」「〜ではないか」等）
- 書き出しのパターンを多様に（逆説から入る／疑問形／結論から入る等）
- 毎回違う書き方になるよう意識する
- 絵文字は0〜2個（国旗絵文字🇸🇬🇹🇭🇦🇺は使わない）
- URLとハッシュタグは含めない（別途追加します）
- 本文の長さは自由（一言でも複数文でもよい）。ただし本文（ハッシュタグ除く）は日本語90文字以内に厳守（超えるとX投稿が失敗する）
- 内容の区切りで適度に改行を入れる
- 日本語のみ。SNS投稿として完成した文章のみ出力（前置き・説明不要）`,
    }],
  });

  const body = res.content[0].text.trim();
  return `${body}\n\n${buildHashtags(event.city)}`;
}

async function generateLifePost(theme) {

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `以下の人物としてX投稿を書いてください。

${PERSONA}

【テーマ】
${theme}

【要件】
- アプリの宣伝は一切しない。純粋なシンガポール日常のつぶやき
- 表面的なあるあるより、そこに潜む構造・逆説・気づきを一言入れる（説教にはしない）
- 目標は「あーなるほど、そういう見方もあるか」「実はこういう構造だったのか」という気づきを読者に与えること
- 日本もSGも、良い面も悪い面もフラットに見る。どちらかをひいきしない
- 答えを断言するより、視点を提示するスタイル（「〜な気がする」「〜ではないか」等）
- 書き出しのパターンを多様に（逆説から入る／結論から入る／疑問形等）
- 自然な口語でありながら、知性がにじむ文体
- 絵文字は0〜2個
- URLとハッシュタグは含めない
- 本文の長さは自由（一言でも複数文でもよい）。ただし本文（ハッシュタグ除く）は日本語90文字以内に厳守（超えるとX投稿が失敗する）
- 内容の区切りで適度に改行を入れる
- 日本語のみ
- 複数案・区切り線は不要。1つだけ完成した投稿文を出力（前置き・説明不要）`,
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
