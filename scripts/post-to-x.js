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
  const type = typeArg ? typeArg.split('=')[1] : 'event';
  const city = cityArg ? cityArg.split('=')[1].toLowerCase() : 'all';
  return { type, city };
}

// ─── 履歴管理 ─────────────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); }
  catch { return { eventIds: [], lastFeatureIndex: -1 }; }
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
    ? JSON.parse(fs.readFileSync(conf.eventsPath, 'utf8'))
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

// ─── テキスト生成 ─────────────────────────────────────────────────
function ensureBlankLineBeforeUrl(text, url) {
  const label = '詳細はおでかけNaviでチェック👇';
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withBlank = text.replace(new RegExp(`\\n?${escaped}`), `\n\n${label}\n${url}`);
  if (!withBlank.includes(url)) return `${text}\n\n${label}\n${url}`;
  return withBlank.replace(/\n{3,}/g, '\n\n');
}

async function generateEventPost(event) {
  const conf = CITY_CONFIG[event.city] || CITY_CONFIG.sg;
  const typeLabel = { event: 'おでかけ', gourmet: 'グルメ', sale: 'お得情報', opening: 'NEW OPEN' }[event.type] || 'おでかけ';
  const periodText = event.period ? `📅 期間：${event.period}` : '';
  const tipsText = event.tips?.length ? `\n💡 ${event.tips.slice(0, 2).join('\n💡 ')}` : '';

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `${conf.nameJa}在住の日本人向けPWA「おでかけNavi」のX投稿文を作ってください。

【情報】
都市: ${conf.nameJa}
種別: ${typeLabel}
施設/店名: ${event.store}
${periodText}
内容: ${event.content}
${tipsText}

【要件】
- 日本語
- 絵文字を1〜2個使う（国旗絵文字🇸🇬🇹🇭🇦🇺は使わない）
- URLを除く本文は150文字以内（厳守）
- 末尾のURLは含めない（別途追加します）
- SNS投稿として完成した文章のみ出力（前置き・説明不要）`,
    }],
  });

  const body = res.content[0].text.trim();
  const cityPrefix = `${conf.flag} ${conf.code} イベント情報`;
  return ensureBlankLineBeforeUrl(`${cityPrefix}\n${body}`, conf.appUrl);
}

async function generateFeaturePost(feature) {
  const appUrl = 'https://dosuru.app';

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `東南アジア在住の日本人向けPWA「おでかけNavi」の機能紹介X投稿文を作ってください。

【紹介する機能】
機能名: ${feature.name}
説明: ${feature.description}

【要件】
- 日本語
- 絵文字を1〜2個使う
- 親しみやすいトーン
- URLを除く本文は100文字以内（厳守）
- 末尾のURLは含めない（別途追加します）
- SNS投稿として完成した文章のみ出力（前置き・説明不要）`,
    }],
  });

  const body = res.content[0].text.trim();
  return ensureBlankLineBeforeUrl(body, appUrl);
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
    throw new Error(`X API error: ${res.status} ${err.detail || JSON.stringify(err.errors || '')}`);
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
  const { type, city } = parseArgs();
  const history = loadHistory();
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
    const nextIndex = (history.lastFeatureIndex + 1) % APP_FEATURES.length;
    const feature = APP_FEATURES[nextIndex];
    console.log(`[post-to-x] 機能紹介: ${feature.name}`);
    text = await generateFeaturePost(feature);
    history.lastFeatureIndex = nextIndex;
  }

  console.log(`[post-to-x] 投稿内容:\n${text}\n`);

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
