#!/usr/bin/env node
// scripts/post-to-x.js
// X (Twitter) への自動投稿スクリプト
// 使い方: node post-to-x.js [--city=sg|bkk|syd|all] [--to-line] [--dry-run]
// --to-line 指定時はX APIを呼ばず、生成した投稿文（本文＋URL＋ハッシュタグ）を
//           見出しなし・素のまま1通でLINEに下書き送信する（手動投稿用。設計書53）。
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
シンガポールに長く暮らす日本人男性。ここが普通の生活の場になっている。
ランニング・テニス・サッカー観戦など体を動かすことが好き。
SGのローカルカルチャーや歴史、ホーカーフードにも興味がある。
シンガポール在住日本人向けの週末おでかけ情報アプリ（dosuru.app）を作っていて、
使ってもらえると嬉しいとは思っているが、ごり押しはしたくない。
基本的にSGの暮らしを楽しんでいる。愚痴・不満・ネガティブな感想は発信しない。
発見・共感・小さな喜びを自然に伝えるスタイル。
家族のことはあまり話さない。自分自身の日常をつぶやくスタイル。

【投稿する上での軸】
「情報を伝える」ことより「これは自分だから気づけたことだ」と思える細部を1つ拾って書く。
誰でも書けそうな一般論・要約・キャッチコピーめいた言い回しは避ける。
本数や頻度を意識せず、ネタが弱いと感じたら無理に個性を盛らず、素朴に短く書いてもよい。
「長く住んでいるからこそ気づく些細な変化・違和感・懐かしさ」のような、その人にしかない時間の蓄積が滲む視点を大事にする。`;

const anthropic = new Anthropic();

// ─── 引数解析 ─────────────────────────────────────────────────────
function parseArgs() {
  const typeArg = process.argv.find(a => a.startsWith('--type='));
  const cityArg = process.argv.find(a => a.startsWith('--city='));
  const type = typeArg ? typeArg.split('=')[1] : 'auto';
  const city = cityArg ? cityArg.split('=')[1].toLowerCase() : 'all';
  const dryRun = process.argv.includes('--dry-run');
  const toLine = process.argv.includes('--to-line');
  return { type, city, dryRun, toLine };
}

// ─── 履歴管理 ─────────────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); }
  catch { return { eventIds: [], lastType: 'event' }; }
}

function resolveType(type, history) {
  return 'event';
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

function pickEvent(events, history) {
  const { eventIds = [], postedStores = [] } = history;
  const unseen = events.filter(e => !eventIds.includes(e.id) && !postedStores.includes(e.store));
  const pool = (unseen.length > 0 ? unseen : events.filter(e => !eventIds.includes(e.id)))
    .sort((a, b) => (b.major_score || 0) - (a.major_score || 0))
    .slice(0, 15);
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
- 実際には行っていない。ネットや情報収集で見かけた程度の距離感で書く
- 「行ってきた」「食べた」など実体験のように書かない
- 行きたいとは思うけど結局行かないかも、くらいの温度感でいい
- 「〜が好きだな」「〜っていいな」など、まとめるような感想で締めない
- 一人称は使わない（「俺」「私」「僕」は書かない）
- オチや気づきは不要。思ったことをそのまま書く
- 深読みしない、分析しない、教えようとしない
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

async function generateLifePost(articles) {
  const summary = articles.map((e, i) =>
    `${i + 1}. [${e.type || 'info'}] ${e.store || ''}${e.content ? ': ' + e.content.slice(0, 80) : ''}`
  ).join('\n');

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `以下の人物として、最近のシンガポールの話題に触れて感じたことをX投稿として書いてください。

${PERSONA}

【最近のSGの話題（参考）】
${summary}

【要件】
- イベント告知・宣伝・アナウンスにならないこと。「在住者の生活目線のつぶやき」として書く
- 実際には行っていない。情報として見かけた・知った程度の距離感で書く
- 「行ってきた」「食べた」など実体験のように書かない
- 行きたいとは思うけど結局行かないかも、くらいの温度感でいい
- 「〜が好きだな」「〜っていいな」など、まとめるような感想で締めない
- 一人称は使わない（「俺」「私」「僕」は書かない）
- 特定の記事を紹介するのではなく、話題から連想した日常の気づき・発見を書く
- 愚痴・不満・ネガティブな感想は絶対に書かない
- SGの暮らしへの親しみや小さな喜びを自然に込める
- 深読みしない、分析しない、教えようとしない
- 絵文字は0〜2個（国旗絵文字は使わない）
- URLとハッシュタグは含めない
- 本文は日本語90文字以内に厳守
- 日本語のみ。完成した投稿文のみ出力（前置き・説明不要）`,
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
  const { type: rawType, city, dryRun, toLine } = parseArgs();
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
    const event = pickEvent(events, history);
    const conf = CITY_CONFIG[event.city] || CITY_CONFIG.sg;
    console.log(`[post-to-x] 選択イベント: ${event.store} (${conf.nameJa})`);
    text = await generateEventPost(event);
    history.eventIds = [event.id, ...history.eventIds].slice(0, HISTORY_MAX);
    history.postedStores = [event.store, ...(history.postedStores || [])].slice(0, HISTORY_MAX);

  } else if (type === 'life') {
    const allEvents = getActiveEvents(loadEvents(city));
    const sample = allEvents.sort(() => Math.random() - 0.5).slice(0, 5);
    console.log(`[post-to-x] 生活つぶやき参考: ${sample.map(e => e.store).join(' / ')}`);
    text = await generateLifePost(sample);

  }

  history.lastType = type;

  console.log(`[post-to-x] 投稿内容:\n${'─'.repeat(40)}\n${text}\n${'─'.repeat(40)}`);
  console.log(`文字数: ${text.length}文字 / ウェイト: ${weightedLength(text)}/280`);

  if (dryRun) {
    console.log('[post-to-x] --dry-run のため投稿スキップ');
    return;
  }

  // --to-line: X APIを呼ばず、生成した投稿文を素のまま1通LINEに下書き送信する（設計書53）
  if (toLine) {
    try {
      await notifyLine(text);
      console.log('[post-to-x] ✅ LINEに下書きを送信しました');
    } catch (err) {
      console.error('[post-to-x] LINE送信エラー:', err.message);
      throw err;
    } finally {
      saveHistory(history);
    }
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
