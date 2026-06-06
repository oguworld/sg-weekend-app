#!/usr/bin/env node
/**
 * おでかけNavi LINE プロモーション投稿スクリプト
 * 毎日8:00・18:00（SGT）にcronで実行。
 * --city=all で全都市のイベントから選択。
 * 毎回: イベント紹介と機能紹介の両方のドラフトを生成してLINEに送信。
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const HISTORY_MAX = 30;

const CITY_CONFIG = {
  sg: {
    nameJa: 'シンガポール', appUrl: 'https://dosuru.app/sg',
    eventsPath:  path.join(__dirname, '../data/sg/events.json'),
    historyPath: path.join(__dirname, '../data/sg/line-post-history.json'),
  },
  bkk: {
    nameJa: 'バンコク', appUrl: 'https://dosuru.app/bkk',
    eventsPath:  path.join(__dirname, '../data/bkk/events.json'),
    historyPath: path.join(__dirname, '../data/bkk/line-post-history.json'),
  },
  syd: {
    nameJa: 'シドニー', appUrl: 'https://dosuru.app/syd',
    eventsPath:  path.join(__dirname, '../data/syd/events.json'),
    historyPath: path.join(__dirname, '../data/syd/line-post-history.json'),
  },
};

const ALL_HISTORY_PATH = path.join(__dirname, '../data/line-post-history-all.json');

function parseCity() {
  const arg = process.argv.find(a => a.startsWith('--city='));
  const city = arg ? arg.split('=')[1].toLowerCase() : 'sg';
  if (city === 'all') return 'all';
  return CITY_CONFIG[city] ? city : 'sg';
}

const cityKey = parseCity();
const isAll = cityKey === 'all';
const HISTORY_PATH = isAll ? ALL_HISTORY_PATH : CITY_CONFIG[cityKey].historyPath;

// アプリの機能一覧（ローテーション）
const APP_FEATURES = [
  {
    name: 'AIチャット',
    description: '右下のAIボタンをタップすると、「子連れで行けるところ教えて」「雨の日におすすめは？」など自然な言葉でおでかけ先を相談できる。登録済みイベントの中からぴったりの情報を提案してくれる。',
  },
  {
    name: 'ピン留め機能',
    description: '気になるイベントやスポットをピン留めしておける。📌タブからいつでもまとめて確認できるので、家族に共有するときも便利。',
  },
  {
    name: 'カレンダー表示',
    description: '📅タブを開くと12ヶ月分のカレンダーが縦スクロールで見られる。イベントの開催期間がカレンダー上に表示されるので、予定が立てやすい。',
  },
  {
    name: 'フィルター機能',
    description: '設定で「誰と行く（ファミリー・カップル・ひとりなど）」「子どもの年齢」を設定しておくと、自分にぴったりの情報だけに絞り込める。',
  },
  {
    name: '英語表示切り替え',
    description: '設定から表示言語を英語に切り替えられる。外国人の配偶者やお子さんと一緒に使うときも安心。イベント内容もすべて英語で表示される。',
  },
  {
    name: '今週末・来週末・連休タブ',
    description: 'トップのタブで「今週末」「来週末」「次の連休（夏休みなど）」を切り替えられる。連休は自動で名前が変わり、少し先の計画も立てやすい。',
  },
  {
    name: 'ホーム画面に追加（PWA）',
    description: 'ブラウザのメニューから「ホーム画面に追加」するとアプリアイコンが作られ、ネイティブアプリのように使える。インストール不要でいつでもすぐ起動できる。',
  },
  {
    name: '非表示機能',
    description: '興味のないイベントは右上の✕ボタンで非表示にできる。次回以降は表示されなくなり、自分に合った情報だけがすっきり並ぶ。設定から非表示のリセットも可能。',
  },
];

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); }
  catch { return { eventIds: [], lastFeatureIndex: -1 }; }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function getNextFeature(history) {
  const nextIndex = (history.lastFeatureIndex + 1) % APP_FEATURES.length;
  return { feature: APP_FEATURES[nextIndex], index: nextIndex };
}

function getActiveEvents(events) {
  const todayStr = new Date().toISOString().split('T')[0];
  return events.filter(e => !e.end_date || e.end_date >= todayStr);
}

function loadAllEvents() {
  const all = [];
  for (const [key, conf] of Object.entries(CITY_CONFIG)) {
    if (fs.existsSync(conf.eventsPath)) {
      const events = JSON.parse(fs.readFileSync(conf.eventsPath, 'utf8'));
      all.push(...events.map(e => ({ ...e, city: e.city || key })));
    }
  }
  return all;
}

function pickEvent(events, eventIds) {
  const unseen = events.filter(e => !eventIds.includes(e.id));
  const pool = (unseen.length > 0 ? unseen : events)
    .sort((a, b) => (b.major_score || 0) - (a.major_score || 0))
    .slice(0, 10);
  return pool[Math.floor(Math.random() * pool.length)];
}

function getCityConf(event) {
  return CITY_CONFIG[event.city] || CITY_CONFIG.sg;
}

async function generateEventMessage(event) {
  const conf = getCityConf(event);
  const typeLabel = { event: 'おでかけ', gourmet: 'グルメ', sale: 'お得情報' }[event.type] || 'おでかけ';
  const periodText = event.period ? `📅 期間：${event.period}` : '';
  const tipsText = event.tips?.length
    ? `\n💡 ${event.tips.slice(0, 2).join('\n💡 ')}`
    : '';

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `${conf.nameJa}在住の日本人向けPWA「おでかけNavi」の管理者向けLINE投稿文を作ってください。
この文章はそのままXやInstagramに投稿する素材として使います。

【情報】
都市: ${conf.nameJa}
種別: ${typeLabel}
施設/店名: ${event.store}
${periodText}
内容: ${event.content}
${tipsText}

【要件】
- 日本語
- 絵文字を1〜2個使う
- 「おでかけNavi」に自然に触れる
- 末尾に「${conf.appUrl}」を入れる
- URL除く本文は100文字以内（厳守）
- SNS投稿として完成した文章を出力（前置き・説明不要）`,
    }],
  });

  return msg.content[0].text.trim();
}

async function generateFeatureMessage(feature) {
  const conf = isAll ? CITY_CONFIG.sg : CITY_CONFIG[cityKey];
  const appUrl = isAll ? 'https://dosuru.app' : conf.appUrl;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `東南アジア在住の日本人向けPWA「おでかけNavi」の機能紹介SNS投稿文を作ってください。
この文章はそのままXやInstagramに投稿する素材として使います。

【紹介する機能】
機能名: ${feature.name}
説明: ${feature.description}

【要件】
- 日本語
- 絵文字を1〜2個使う
- 親しみやすいトーン
- 「おでかけNavi」に触れる
- 末尾に「${appUrl}」を入れる
- URL除く本文は100文字以内（厳守）
- SNS投稿として完成した文章を出力（前置き・説明不要）`,
    }],
  });

  return msg.content[0].text.trim();
}


async function pushToLine(text) {
  const token  = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const userId = process.env.LINE_USER_ID;

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
}

async function main() {
  const history = loadHistory();

  // 配列形式の旧データとの互換
  if (Array.isArray(history)) {
    history.eventIds = history;
    history.lastFeatureIndex = -1;
  }
  if (!history.eventIds) history.eventIds = [];

  // イベント紹介ドラフト
  const rawEvents = isAll
    ? loadAllEvents()
    : JSON.parse(fs.readFileSync(CITY_CONFIG[cityKey].eventsPath, 'utf8'));
  const activeEvents = getActiveEvents(rawEvents);

  if (activeEvents.length > 0) {
    const event = pickEvent(activeEvents, history.eventIds);
    const conf = getCityConf(event);
    console.log(`[post-to-line] 選択イベント: ${event.store} (${conf.nameJa}, score: ${event.major_score})`);

    const eventMessage = await generateEventMessage(event);
    console.log(`[post-to-line] イベントドラフト:\n${eventMessage}\n`);

    await pushToLine(`【イベント案】\n${eventMessage}`);
    console.log('[post-to-line] LINE送信完了（イベント）');

    history.eventIds = [event.id, ...history.eventIds].slice(0, HISTORY_MAX);
  } else {
    console.log('[post-to-line] アクティブなイベントがありません。イベント投稿をスキップします。');
  }

  // 機能紹介ドラフト
  const { feature, index } = getNextFeature(history);
  console.log(`[post-to-line] 機能紹介: ${feature.name}`);

  const featureMessage = await generateFeatureMessage(feature);
  console.log(`[post-to-line] 機能ドラフト:\n${featureMessage}\n`);

  await pushToLine(`【機能紹介案】\n${featureMessage}`);
  console.log('[post-to-line] LINE送信完了（機能紹介）');

  history.lastFeatureIndex = index;
  saveHistory(history);
}

main().catch(err => {
  console.error('[post-to-line] エラー:', err.message);
  process.exit(1);
});
