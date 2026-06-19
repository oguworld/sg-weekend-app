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
シンガポール在住歴が長く、「行くところが尽きてきた感」が出てきた30〜40代の日本人男性。
平日は仕事が忙しく、通勤の行き帰りに週末の予定を考える。
「今週末どうしよう」といつも悩んでいる週末探し人。
シンガポールの生活には慣れているが、達観しすぎず、まだ新しい発見に素直に反応する。
つぶやきは「週末何しようか悩む人の独り言」スタイル。`;

const LIFE_THEMES = [
  // 週末探し
  '週末どこ行こうか迷って結局いつものホーカーになる件',
  '金曜の夜、明日何しようか考えながら帰る電車の気持ちよさ',
  '土曜の朝、起きた瞬間に「今日どこ行こう」と思う習慣',
  '行き先を決めずに出かけて、結局ホーカーでのんびりしてしまう週末',
  '「今週末こそ行こう」と思っていたのに月曜になっていた件',
  '子連れでどこ行けばいいか悩む週末の朝',
  '週末イベントの情報収集に気づいたら30分使っていた木曜夜',
  'ネットで「SG 週末」と検索しても出てくる情報が同じになってきた',
  'チャンギ空港に用もないのにふらっと行く週末はアリなのかどうか',

  // SG生活の観察
  '同じホーカーセンターばかりになってくる（行ったことないところが減ってきた）',
  'スコールの直後だけ外が涼しくなる。その5分間のために傘を持ち歩いている',
  'MRTが定時通りなのに2年経つと「遅延している」と感じるようになった。基準が上がりすぎ',
  'チキンライスを「また食べた」と言える状態になると、SG生活が板についてきたサインらしい',
  'ホーカーランチ、毎日選ぶだけで小さい意思決定が一つ増える話',
  'スーパーで日本食材を見つけたときの嬉しさと値段のギャップ',
  'ドンキのだし醤油が切れると気づいたときのあの焦り',

  // 仕事・日常
  '通勤中に週末のことを考えるのが唯一の息抜きになっている件',
  '平日忙しいと週末への期待値が上がりすぎて、実際の土曜がちょっと負けてしまう',
  '新しいフードスポットを見つけると、週末の計画がそこから始まる',

  // 家族・子ども
  '子どもが「どこ行くの？」と聞いてくる前に答えを用意できていない罪悪感',
  '「前も行ったよ」と言われるまで同じ場所に連れて行ってしまうパターン',
  '家族を連れてきて良かったと思う瞬間と、申し訳ないと思う瞬間',
  '子どもがシングリッシュを覚えてくるのが誇らしいような心配なような',

  // 将来・転勤
  '赴任が終わったあとどこに住むかを本気で考え始めた',
  'SGで働いていると「次はどこに行く？」という会話が普通に出てくる不思議',
  'アジア拠点を渡り歩く人たちを見ていると自分の将来も揺れる',
  '現地ノリに慣れてきたら逆に日本帰国が怖くなってきた話',

  // 日本との比較・一時帰国
  '帰国したとき日本のコンビニで毎回感動する',
  '日本に一時帰国するたびに「あ、これ当たり前じゃなかったんだ」と気づく',
  '日本のスーパーの安さに毎回驚く',

  // 海外生活一般
  'GrabFoodでデリバリーが当たり前になった生活',
  'SGは英語で生活できるのが楽な一方、ふとした瞬間に孤独を感じることがある',
  '海外に長くいると「これってどこの国の感覚だっけ」となる瞬間がある',
  'シングリッシュが少しずつ染みついてきた自覚',
  '在住者目線でSGを案内するとき、観光客と全然違う場所に連れて行きたくなる',
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
    sg:  '#シンガポール #シンガポール生活',
    bkk: '#バンコク #バンコク生活',
    syd: '#シドニー #シドニー生活',
  };
  return `${cityTags[city] || ''} #週末おでかけ`.trim();
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
- 「行ってみたいな」「これ気になる」「また値段上がったのか」など個人の反応として書く
- 書き出しのパターンを多様に（気になる感じ／迷っている感じ／発見した感じ等）
- 毎回違う書き方になるよう意識する
- 絵文字を1〜2個（国旗絵文字🇸🇬🇹🇭🇦🇺は使わない）
- URLとハッシュタグは含めない（別途追加します）
- 本文は80〜100文字で（X無料アカウントの文字制限のため短めに厳守）
- 内容の区切りで適度に改行を入れる（1〜2回）
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
- 書き出しのパターンを多様に（気づき／あるある／感動／ぼやき／懐かしさ等）
- 「〜だよね」「〜あるある」「〜になってきた」など自然な口語
- 絵文字を1〜2個
- URLとハッシュタグは含めない
- 本文は90〜110文字で（X無料アカウントの文字制限のため厳守）
- 内容の区切りで適度に改行を入れる（1〜2回）
- 日本語のみ
- 複数案・区切り線は不要。1つだけ完成した投稿文を出力（前置き・説明不要）`,
    }],
  });

  const body = res.content[0].text.trim();
  return `${body}\n\n#海外生活 #東南アジア生活 #海外在住`;
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
