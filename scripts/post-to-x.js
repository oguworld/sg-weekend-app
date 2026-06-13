#!/usr/bin/env node
// scripts/post-to-x.js
// X (Twitter) への自動投稿スクリプト
// 使い方: node post-to-x.js --type=event|feature [--city=sg|bkk|syd|all]
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

const LIFE_THEMES = [
  'ホーカーセンターでのランチ（今日何食べようか問題）',
  'チキンライスへの愛と飽きのなさ',
  '夕方のスコールとその後の涼しさ',
  '冷房が効きすぎている屋内（カーディガン必携）',
  'コピティアムのコピと朝の過ごし方',
  'スーパーで日本食材を見つけたときの嬉しさと値段のギャップ',
  'MRTの清潔さと時刻どおりに来る安心感',
  'ラクサ・チャークイティオ・ナシレマなど現地グルメの発見',
  'ドリアン解禁エリアとその匂いとの戦い',
  '常夏で季節感がない中でのクリスマスや年末年始',
  'GrabFoodでデリバリーが当たり前になった生活',
  'ウェットマーケットで買い物する週末の朝',
  '近所のフードコートがもはやホームグラウンド化している件',
  '多民族の街でいろんな言語が飛び交う日常',
  '帰国したとき日本のコンビニで感動する話',
  'プロウンミー・ロジャックなどSGならではのローカルフード',
  'HDBやコンドのプールで夕涼みする日常',
  '雨のない週が続くと逆に不安になる件',
  'イサタン・ドンドンドンキで日本を補給する話',
  '日本から送ってもらうと嬉しいものリスト',
  'シンガポールの祝日の多さとカレンダーの見方',
  'バスに乗ってふらっと知らない街に降りる休日',
  'ローカルの友人から教わった穴場フードや食べ方',
  '英語とシングリッシュの間で揺れる日々',
];

const APP_FEATURES = [
  { name: 'AIチャット',           description: '右下のAIボタンをタップすると、「子連れで行けるところ教えて」「雨の日におすすめは？」など自然な言葉でおでかけ先を相談できる。登録済みイベントの中からぴったりの情報を提案してくれる。' },
  { name: 'ピン留め機能',         description: '気になるイベントやスポットをピン留めしておける。📌タブからいつでもまとめて確認できるので、家族に共有するときも便利。' },
  { name: 'カレンダー表示',       description: '📅タブを開くと12ヶ月分のカレンダーが縦スクロールで見られる。イベントの開催期間がカレンダー上に表示されるので、予定が立てやすい。' },
  { name: 'フィルター機能',       description: '設定で「誰と行く（ファミリー・カップル・ひとりなど）」「子どもの年齢」を設定しておくと、自分にぴったりの情報だけに絞り込める。' },
  { name: '英語表示切り替え',     description: '設定から表示言語を英語に切り替えられる。外国人の配偶者やお子さんと一緒に使うときも安心。イベント内容もすべて英語で表示される。' },
  { name: '今週末・来週末・連休タブ', description: 'トップのタブで「今週末」「来週末」「次の連休（夏休みなど）」を切り替えられる。連休は自動で名前が変わり、少し先の計画も立てやすい。' },
  { name: 'ホーム画面に追加（PWA）', description: 'ブラウザのメニューから「ホーム画面に追加」するとアプリアイコンが作られ、ネイティブアプリのように使える。インストール不要でいつでもすぐ起動できる。' },
  { name: '非表示機能',           description: '興味のないイベントは右上の✕ボタンで非表示にできる。次回以降は表示されなくなり、自分に合った情報だけがすっきり並ぶ。設定から非表示のリセットも可能。' },
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
  catch { return { eventIds: [], lastFeatureIndex: -1, lastType: 'feature' }; }
}

function resolveType(type, history) {
  if (type !== 'auto') return type;
  const types = ['event', 'feature', 'life'];
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
  return `${cityTags[city] || ''} #週末おでかけ #おでかけNavi`.trim();
}

// ─── テキスト生成 ─────────────────────────────────────────────────
const CTA_LABELS = [
  '気になる方はこちら↓',
  '週末の参考に→',
  'もっと詳しくはここで↓',
  'チェックしてみてください👇',
  'アプリで詳細確認→',
  '詳しくはおでかけNaviで↓',
  'おでかけNaviで詳細をチェック👇',
  '行く前にここで確認→',
];

function appendUrl(text, url) {
  const label = CTA_LABELS[Math.floor(Math.random() * CTA_LABELS.length)];
  return `${text}\n\n${label}\n${url}`;
}

async function generateEventPost(event) {
  const conf = CITY_CONFIG[event.city] || CITY_CONFIG.sg;
  const typeLabel = { event: 'おでかけ', gourmet: 'グルメ', sale: 'お得情報', opening: 'NEW OPEN' }[event.type] || 'おでかけ';
  const periodText = event.period ? `期間：${event.period}` : '';
  const tipsText = event.tips?.length ? event.tips.slice(0, 2).join('／') : '';

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `${conf.nameJa}在住の日本人が、気になるお出かけ情報を個人的にシェアするX投稿文を書いてください。

【情報】
都市: ${conf.nameJa}
種別: ${typeLabel}
施設/店名: ${event.store}
${periodText}
内容: ${event.content}
${tipsText ? `ポイント: ${tipsText}` : ''}

【要件】
- 現地在住者が個人として書いたような一人称・主観的なトーン
- 「行ってみたい」「これは行かないと」「子連れにおすすめ」など個人の感想や反応を自然に含める
- 書き出しのパターンを多様に（都市名から始める／質問形式／感想から始める／情報紹介から始めるなど）
- 毎回違う書き方になるよう意識する
- 絵文字を1〜2個（国旗絵文字🇸🇬🇹🇭🇦🇺は使わない）
- URLとハッシュタグは含めない（別途追加します）
- 本文は130〜190文字の範囲で、毎回自然に長さを変えること
- 日本語のみ。SNS投稿として完成した文章のみ出力（前置き・説明不要）`,
    }],
  });

  const body = res.content[0].text.trim();
  const base = appendUrl(body, 'https://dosuru.app');
  return `${base}\n\n${buildHashtags(event.city)}`;
}

async function generateFeaturePost(feature) {
  const appUrl = 'https://dosuru.app';

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `東南アジア在住の日本人が、よく使っているアプリの便利な機能を友人に教えるようなX投稿文を書いてください。

【紹介する機能】
機能名: ${feature.name}
説明: ${feature.description}

【要件】
- 友人に話しかけるような自然な口語トーン
- 「これ使ってみたら〜」「知らなかった人に教えたい」「地味に便利」など体験・感想として伝える
- 書き出しのパターンを多様に（質問形式／発見した感じ／おすすめする感じ等）
- 毎回違う書き方になるよう意識する
- 絵文字を1〜2個
- URLとハッシュタグは含めない（別途追加します）
- 本文は130〜190文字の範囲で、毎回自然に長さを変えること
- 日本語のみ。SNS投稿として完成した文章のみ出力（前置き・説明不要）`,
    }],
  });

  const body = res.content[0].text.trim();
  const base = appendUrl(body, appUrl);
  return `${base}\n\n#週末おでかけ #おでかけNavi #海外生活`;
}

async function generateLifePost() {
  const theme = LIFE_THEMES[Math.floor(Math.random() * LIFE_THEMES.length)];

  const lifeCtas = [
    '週末の予定はここで→',
    '現地のお出かけ情報はこちら→',
    '週末どこ行く？情報はここ→',
    'おでかけ情報はここで↓',
  ];

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `以下の人物としてX投稿を書いてください。

【人物設定】
シンガポールに10年住んでいる日本人エンジニア。現地の生活にどっぷり馴染んでいて、ホーカーでの飯もMRTも当たり前。でも日本への郷愁もある。シンガポールの変化も見てきた。いい意味で達観しているが、たまにローカルあるあるに新鮮に感動したり苦笑したりする。

【テーマ】
${theme}

【要件】
- 10年住んでいるからこその視点・深み・慣れ感を出す
- 「〜だよね」「〜あるある」「〜になってきた」など自然な口語
- アプリの宣伝は一切しない。純粋なシンガポール日常のつぶやき
- 書き出しのパターンを多様に（気づき／あるある／感動／ぼやき／懐かしさ等）
- 絵文字を1〜2個
- URLとハッシュタグは含めない
- 本文は80〜160文字の範囲で（短くてもOK）
- 日本語のみ
- 複数案・区切り線は不要。1つだけ完成した投稿文を出力（前置き・説明不要）`,
    }],
  });

  const body = res.content[0].text.trim();
  const cta = lifeCtas[Math.floor(Math.random() * lifeCtas.length)];
  return `${body}\n\n${cta}\nhttps://dosuru.app\n\n#海外生活 #東南アジア生活 #駐在`;
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

  } else if (type === 'feature') {
    const nextIndex = (history.lastFeatureIndex + 1) % APP_FEATURES.length;
    const feature = APP_FEATURES[nextIndex];
    console.log(`[post-to-x] 機能紹介: ${feature.name}`);
    text = await generateFeaturePost(feature);
    history.lastFeatureIndex = nextIndex;

  } else {
    const theme = LIFE_THEMES[Math.floor(Math.random() * LIFE_THEMES.length)];
    console.log(`[post-to-x] 生活つぶやき: ${theme}`);
    text = await generateLifePost();
  }

  history.lastType = type;

  console.log(`[post-to-x] 投稿内容:\n${'─'.repeat(40)}\n${text}\n${'─'.repeat(40)}`);
  console.log(`文字数: ${text.length}`);

  if (dryRun) {
    console.log('[post-to-x] --dry-run のため投稿スキップ');
    return;
  }

  const tweetId = await postToX(text);
  if (tweetId) {
    const tweetUrl = `https://x.com/i/web/status/${tweetId}`;
    console.log(`[post-to-x] ✅ 投稿完了: ${tweetUrl}`);
    await notifyLine(`【X投稿】\n${text}\n\n${tweetUrl}`);
  }

  saveHistory(history);
}

main().catch(err => {
  console.error('[post-to-x] エラー:', err.message);
  process.exit(1);
});
