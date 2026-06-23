require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const webpush = require('web-push');

webpush.setVapidDetails(
  'mailto:oguworld@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const PUSH_SUBS_PATH = path.join(__dirname, 'data', 'push-subscriptions.json');
function loadPushSubs() {
  try { return JSON.parse(fs.readFileSync(PUSH_SUBS_PATH, 'utf8')); } catch { return []; }
}
function savePushSubs(subs) {
  fs.writeFileSync(PUSH_SUBS_PATH, JSON.stringify(subs, null, 2), 'utf8');
}
async function sendPushToAll(cityKey) {
  const cityConf = CITIES[cityKey] || CITIES.sg;
  const payload = JSON.stringify({
    title: '新着おでかけ情報',
    body: '最新の週末スポット情報が届きました！',
  });
  const subs = loadPushSubs();
  if (subs.length === 0) return 0;
  const expiredEndpoints = new Set();
  await Promise.allSettled(subs.map(async sub => {
    try {
      await webpush.sendNotification(sub, payload);
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) expiredEndpoints.add(sub.endpoint);
    }
  }));
  if (expiredEndpoints.size > 0) savePushSubs(subs.filter(s => !expiredEndpoints.has(s.endpoint)));
  return subs.length - expiredEndpoints.size;
}

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
// STRIPE（現在無効化中 — 将来の有料プラン復活時にコメントを外す）
// ─────────────────────────────────────────────
/*
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-04-22.dahlia',
});
const premiumSessions = new Map();

app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (webhookSecret && webhookSecret !== 'whsec_REPLACE_WITH_YOUR_WEBHOOK_SECRET') {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'subscription') {
        premiumSessions.set(session.id, {
          customerId: session.customer,
          subscriptionId: session.subscription,
          email: session.customer_details?.email,
          active: true,
        });
      }
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      for (const [, data] of premiumSessions.entries()) {
        if (data.subscriptionId === sub.id) data.active = (sub.status === 'active' || sub.status === 'trialing');
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      for (const [, data] of premiumSessions.entries()) {
        if (data.subscriptionId === sub.id) data.active = false;
      }
      break;
    }
  }
  res.json({ received: true });
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const priceId = process.env.STRIPE_PRICE_ID;
    const { email } = req.body;
    const params = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/`,
      allow_promotion_codes: true,
      subscription_data: { trial_period_days: 7, metadata: { app: 'sg-weekend' } },
    };
    if (email) params.customer_email = email;
    const session = await stripe.checkout.sessions.create(params);
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>プライバシーポリシー | おでかけNavi</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #333; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #C8804A; padding-bottom: 8px; }
    h2 { font-size: 1.1rem; margin-top: 2em; }
    a { color: #C8804A; }
  </style>
</head>
<body>
  <h1>プライバシーポリシー</h1>
  <p>最終更新日：2026年6月4日</p>

  <p>おでかけNavi（以下「本アプリ」）は、東南アジア・オセアニア在住の日本人向け週末おでかけ情報PWAです。本プライバシーポリシーは、本アプリにおける個人情報の取り扱いについて説明します。</p>

  <h2>1. 収集する情報</h2>
  <p>本アプリは以下の情報を収集することがあります。</p>
  <ul>
    <li>設定情報（都市・言語・プロフィール）：端末のlocalStorageに保存され、サーバーには送信されません。</li>
    <li>フィードバック：任意で送信いただいた内容（運営者のみが受信）。</li>
    <li>AIチャットの入力内容：イベント検索のためにAnthropicのClaude APIに送信されます。</li>
  </ul>

  <h2>2. 情報の利用目的</h2>
  <ul>
    <li>アプリ機能の提供・改善</li>
    <li>イベント情報のフィルタリング（Claude API利用）</li>
    <li>フィードバック対応</li>
  </ul>

  <h2>3. 第三者への提供</h2>
  <p>収集した情報を第三者に販売・提供することはありません。ただし、以下のサービスを利用しています。</p>
  <ul>
    <li>Anthropic Claude API（AIチャット・コンテンツ生成）</li>
    <li>OpenWeatherMap（天気情報）</li>
    <li>Meta / Instagram（イベント情報収集）</li>
  </ul>

  <h2>4. Cookieおよびローカルストレージ</h2>
  <p>本アプリはCookieを使用しません。設定情報はブラウザのlocalStorageに保存されます。</p>

  <h2>5. お問い合わせ</h2>
  <p>プライバシーに関するご質問は<a href="https://dosuru.app/#settings">アプリのフィードバックフォーム</a>からご連絡ください。</p>

  <p><a href="/">← おでかけNaviに戻る</a></p>
</body>
</html>`);
});

app.get('/api/subscription-status', async (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.query.session_id || null;
  let premium = false;
  if (sessionId) {
    const cached = premiumSessions.get(sessionId);
    if (cached !== undefined) {
      premium = cached.active;
    } else {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
        if (session.mode === 'subscription' && session.subscription) {
          const sub = session.subscription;
          premium = sub.status === 'active' || sub.status === 'trialing';
          premiumSessions.set(sessionId, { customerId: session.customer, subscriptionId: typeof sub === 'string' ? sub : sub.id, email: session.customer_details?.email, active: premium });
        }
      } catch (_) {}
    }
  }
  res.json({ premium });
});
*/

// ─────────────────────────────────────────────
// FILE LOCK UTILITY
// ─────────────────────────────────────────────
const fileLocks = {};
async function withFileLock(filePath, fn) {
  while (fileLocks[filePath]) await new Promise(r => setTimeout(r, 10));
  fileLocks[filePath] = true;
  try { return await fn(); }
  finally { fileLocks[filePath] = false; }
}

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────
app.use(express.json());

// index.html と sw.js はキャッシュしない
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html' || req.path === '/sw.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// 都市設定
// ─────────────────────────────────────────────
const CITIES = {
  sg: {
    nameJa: 'シンガポール', nameEn: 'Singapore', flag: '🇸🇬', code: 'SG',
    timezone: 'Asia/Singapore',
    weatherQ: 'Singapore',
    currency: 'SGD',
    appUrl: 'https://dosuru.app/sg',
  },
  bkk: {
    nameJa: 'バンコク', nameEn: 'Bangkok', flag: '🇹🇭', code: 'BKK',
    timezone: 'Asia/Bangkok',
    weatherQ: 'Bangkok',
    currency: 'THB',
    appUrl: 'https://dosuru.app/bkk',
  },
  syd: {
    nameJa: 'シドニー', nameEn: 'Sydney', flag: '🇦🇺', code: 'SYD',
    timezone: 'Australia/Sydney',
    weatherQ: 'Sydney',
    currency: 'AUD',
    appUrl: 'https://dosuru.app/syd',
  },
};

// 都市別祝日 2026（週末tabを祝日まで拡張するため）
const CITY_HOLIDAYS = {
  sg: [
    '2026-01-01','2026-02-17','2026-02-18','2026-03-21','2026-04-03',
    '2026-05-01','2026-05-27','2026-05-31','2026-06-01',
    '2026-08-09','2026-08-10','2026-11-08','2026-11-09','2026-12-25',
  ],
  bkk: [
    '2026-01-01','2026-03-03','2026-04-06','2026-04-13','2026-04-14','2026-04-15',
    '2026-05-01','2026-05-04','2026-05-31','2026-06-01','2026-06-03',
    '2026-07-28','2026-07-29','2026-08-12','2026-10-13','2026-10-23',
    '2026-12-05','2026-12-07','2026-12-10','2026-12-31',
  ],
  syd: [
    '2026-01-01','2026-01-26','2026-04-03','2026-04-04','2026-04-05','2026-04-06',
    '2026-04-25','2026-04-27','2026-06-08','2026-08-03','2026-10-05',
    '2026-12-25','2026-12-26','2026-12-28',
  ],
};

function fmtDateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// イベントが週（月〜日）と重なるか判定
function weekOverlap(eventStart, eventEnd, weekStart, weekEnd) {
  return eventStart <= weekEnd && eventEnd >= weekStart;
}

function resolveCity(req) {
  const c = (req.query.city || req.body?.city || 'sg').toLowerCase();
  return CITIES[c] ? c : 'sg';
}

function eventsPath(city) {
  return path.join(__dirname, 'data', city, 'events.json');
}

function calendarPath(city) {
  return path.join(__dirname, 'data', city, 'school-calendar.json');
}

// ─────────────────────────────────────────────
// データファイルの初期化
// ─────────────────────────────────────────────
const SPOTS_PATH    = path.join(__dirname, 'data', 'spots.json');
const CALENDAR_PATH = path.join(__dirname, 'data', 'sg', 'school-calendar.json');

function pendingPath(city) {
  return path.join(__dirname, 'data', city, 'pending-events.json');
}
// 都市別 pending ファイルの初期化
for (const c of ['sg', 'bkk', 'syd']) {
  const pp = pendingPath(c);
  if (!fs.existsSync(pp)) {
    fs.writeFileSync(pp, '[]', 'utf8');
    console.log(`📝 data/${c}/pending-events.json を作成しました`);
  }
}

// ─────────────────────────────────────────────
// イベント自動収集 cron（無効化中 — 手動実行: node scripts/fetch-events.js）
// ─────────────────────────────────────────────
/*
try {
  const cron = require('node-cron');
  const { fetchAllEvents } = require('./scripts/fetch-events');
  const { filterAndEnrich } = require('./scripts/filter-events');
  const { notifyEvents } = require('./scripts/notify-line');

  cron.schedule('0 8 * * 1', async () => {
    console.log('[cron] イベント自動取得開始...');
    try {
      const raw = await fetchAllEvents();
      const filtered = await filterAndEnrich(raw);
      const existing = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8'));
      const existingLinks = new Set(existing.map(e => e.link));
      const newItems = filtered.filter(e => !existingLinks.has(e.link));
      fs.writeFileSync(PENDING_PATH, JSON.stringify([...existing, ...newItems], null, 2), 'utf8');
      if (newItems.length > 0) {
        await notifyEvents(newItems);
        console.log(`[cron] ${newItems.length}件を通知しました`);
      } else {
        console.log('[cron] 新着なし');
      }
    } catch (e) {
      console.error('[cron] エラー:', e.message);
    }
  }, { timezone: 'Asia/Singapore' });

  console.log('⏰ cronスケジューラー設定完了（毎週月曜8:00 SG時間）');
} catch (e) {
  console.warn('⚠️  cronスキップ（依存パッケージ未インストール）:', e.message);
}
*/

// ─────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────

// GET /api/spots — 公開済みスポット一覧
app.get('/api/spots', (req, res) => {
  try {
    const spots = JSON.parse(fs.readFileSync(SPOTS_PATH, 'utf8'));
    res.json({ spots, premium: false, lockedCount: 0, lockedPreviews: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/events — おでかけ・イベント情報一覧
// start_date / end_date から tab を動的付与（weekend / nextweekend / afterweekend / threeweeks）
app.get('/api/events', (req, res) => {
  try {
    const city = resolveCity(req);
    const ep = eventsPath(city);
    if (!fs.existsSync(ep)) return res.json([]);
    const all = JSON.parse(fs.readFileSync(ep, 'utf8'));

    // 今日の0時
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // 期限切れ・end_dateなし（常設）を除外
    // opening は start_date から2週間で非表示（データは1ヶ月保持）
    const active = all.filter(e => {
      if (!e.end_date) return false;
      if (new Date(e.end_date + 'T00:00:00') < today) return false;
      if (e.type === 'opening' && e.start_date) {
        const openLimit = new Date(e.start_date + 'T00:00:00');
        openLimit.setDate(openLimit.getDate() + 14);
        if (today > openLimit) return false;
      }
      return true;
    });
    const dow = today.getDay(); // 0=日, 1=月 ... 6=土

    // 今週の月曜を求める（日曜は -6 日、それ以外は 1-dow 日）
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() + mondayOffset);
    const thisSunday = new Date(thisMonday); thisSunday.setDate(thisMonday.getDate() + 6);

    // 来週・2週後・3週後の月〜日
    const nextMonday      = new Date(thisMonday); nextMonday.setDate(thisMonday.getDate() + 7);
    const nextSunday      = new Date(thisSunday); nextSunday.setDate(thisSunday.getDate() + 7);
    const afterMonday     = new Date(thisMonday); afterMonday.setDate(thisMonday.getDate() + 14);
    const afterSunday     = new Date(thisSunday); afterSunday.setDate(thisSunday.getDate() + 14);
    const threeMonday     = new Date(thisMonday); threeMonday.setDate(thisMonday.getDate() + 21);
    const threeSunday     = new Date(thisSunday); threeSunday.setDate(thisSunday.getDate() + 21);

    const tagged = active.map(e => {
      if (!e.start_date || !e.end_date) return { ...e, tab: 'weekend' };
      const start = new Date(e.start_date + 'T00:00:00');
      let end     = new Date(e.end_date   + 'T00:00:00');
      // opening はタブ表示もオープン日から2週間でキャップ
      if (e.type === 'opening') {
        const openLimit = new Date(e.start_date + 'T00:00:00');
        openLimit.setDate(openLimit.getDate() + 14);
        if (end > openLimit) end = openLimit;
      }

      const tabs = [];
      if (weekOverlap(start, end, thisMonday,  thisSunday))  tabs.push('weekend');
      if (weekOverlap(start, end, nextMonday,  nextSunday))  tabs.push('nextweekend');
      if (weekOverlap(start, end, afterMonday, afterSunday)) tabs.push('afterweekend');
      if (weekOverlap(start, end, threeMonday, threeSunday)) tabs.push('threeweeks');
      if (tabs.length === 0) return { ...e, tab: 'future', tabs: [] };
      return { ...e, tab: tabs[0], tabs };
    }).filter(Boolean);

    res.json(tagged);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sales — セール情報一覧（events.json の type==='sale' のみ返す）
app.get('/api/sales', (req, res) => {
  try {
    const city = resolveCity(req);
    const ep = eventsPath(city);
    if (!fs.existsSync(ep)) return res.json([]);
    const all = JSON.parse(fs.readFileSync(ep, 'utf8'));
    res.json(all.filter(e => e.type === 'sale'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/weather — 今週末の天気予報（OpenWeatherMap）
app.get('/api/weather', async (req, res) => {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'OPENWEATHER_API_KEY not set' });
  }
  try {
    const city = resolveCity(req);
    const weatherQ = CITIES[city].weatherQ;
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(weatherQ)}&appid=${apiKey}&units=metric&lang=ja`
    );
    // 今週の土曜日の正午に最も近い予報を取得
    const today = new Date();
    const diffToSat = (6 - today.getDay() + 7) % 7 || 7;
    const sat = new Date(today);
    sat.setDate(today.getDate() + diffToSat);
    sat.setHours(12, 0, 0, 0);
    const satTimestamp = Math.floor(sat.getTime() / 1000);
    const forecast = response.data.list.reduce((prev, curr) =>
      Math.abs(curr.dt - satTimestamp) < Math.abs(prev.dt - satTimestamp) ? curr : prev
    );
    res.json({
      condition: forecast.weather[0].main,
      temp: Math.round(forecast.main.temp),
      description: forecast.weather[0].description,
      humidity: forecast.main.humidity,
      icon: forecast.weather[0].icon,
    });
  } catch (e) {
    console.error('Weather API error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/school-calendar — 長期休暇設定
app.get('/api/school-calendar', (req, res) => {
  try {
    const city = resolveCity(req);
    res.json(JSON.parse(fs.readFileSync(calendarPath(city), 'utf8')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/feedback — フィードバック受信 → LINE Push送信
app.post('/api/feedback', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const token  = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const userId = process.env.LINE_USER_ID;
  if (!token || !userId) {
    console.error('LINE credentials not set');
    return res.status(500).json({ error: 'LINE not configured' });
  }

  const now = new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Singapore',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  const lineMessage = `📨 フィードバックが届きました\n\n${message.trim()}\n\n🕐 ${now} (SGT)`;

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: lineMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('LINE push error:', err);
      return res.status(500).json({ error: 'LINE push failed' });
    }

    console.log(`📨 フィードバック送信完了 (${now})`);
    res.json({ ok: true });
  } catch (e) {
    console.error('LINE push exception:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chat — AIチャット（Claude API）
app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' });

  const { message, history = [], lang = 'ja' } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  const city = resolveCity(req);
  const cityConf = CITIES[city];

  let events = [];
  try {
    events = JSON.parse(fs.readFileSync(eventsPath(city), 'utf8'));
  } catch (_) {}

  const today = new Date().toLocaleDateString('ja-JP', { timeZone: cityConf.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });

  // コンテキスト用にスリム化（image/url/tips_en/bgClass/style/fetched_atは除外）
  const eventContext = events.map(e => ({
    id: e.id,
    type: e.type,
    emoji: e.emoji,
    store: e.store,
    who: e.who,
    age: e.age,
    major_score: e.major_score,
    period: e.period,
    start_date: e.start_date,
    end_date: e.end_date,
    content: e.content,
    location: e.location,
    area: e.area,
  }));

  const systemPrompt = `あなたは${cityConf.nameJa}在住の日本人向け週末おでかけアシスタント「週末どうする？${cityConf.code}」のAIです。
以下に登録されているイベント・グルメ・セール情報のみを参照して回答してください。
登録されていない場所・イベントは絶対に提案しないでください。

今日の日付（${cityConf.nameJa}時間）: ${today}

【登録イベント一覧】
${JSON.stringify(eventContext)}

回答ルール:
- respond ツールを必ず使って回答してください
- ユーザーの言語（日本語 or 英語）に合わせて回答してください
- おすすめは最大3件まで event_ids に含めてください（なければ空配列）
- 登録外の情報は提案しない
- 返答メッセージは150文字以内で簡潔に`;

  // 直近3往復の履歴を使用
  const messages = [
    ...history.slice(-6),
    { role: 'user', content: message.trim() },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools: [{
          name: 'respond',
          description: 'ユーザーへの返答。必ずこのツールを使うこと。',
          input_schema: {
            type: 'object',
            properties: {
              message: { type: 'string', description: '返答メッセージ（150文字以内）' },
              event_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'おすすめするイベントのIDリスト（最大3件、なければ空配列）',
              },
            },
            required: ['message', 'event_ids'],
          },
        }],
        tool_choice: { type: 'tool', name: 'respond' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(500).json({ error: 'AI response failed' });
    }

    const data = await response.json();
    const toolUse = data.content?.find(b => b.type === 'tool_use' && b.name === 'respond');
    if (toolUse) {
      return res.json({
        message: toolUse.input.message || '',
        eventIds: toolUse.input.event_ids || [],
      });
    }

    // fallback
    const textBlock = data.content?.find(b => b.type === 'text');
    res.json({ message: textBlock?.text || '回答を生成できませんでした。', eventIds: [] });

  } catch (e) {
    console.error('Chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────
// LINE Bot ヘルパー
// ─────────────────────────────────────────────

const LINE_GUIDE_MESSAGE = {
  type: 'flex',
  altText: '📋 おでかけNavi｜イベント投稿の使い方',
  contents: {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FDF0E6',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: '🌴 おでかけNavi', weight: 'bold', size: 'lg', color: '#C8804A' },
        { type: 'text', text: 'イベント投稿ボット（SG / BKK / SYD）', size: 'sm', color: '#6B5E52', margin: 'xs' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        {
          type: 'text',
          text: 'SG・BKK・SYDの週末おでかけ情報を投稿しよう。承認されるとアプリに掲載されます✨\n\n都市を指定するには #sg / #bkk / #syd を付けてください（省略時はSG）。',
          size: 'sm',
          wrap: true,
          color: '#2C2420',
        },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: '📝 投稿の方法', weight: 'bold', size: 'sm', color: '#2C2420', margin: 'md' },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          margin: 'sm',
          contents: [
            {
              type: 'box', layout: 'horizontal', spacing: 'sm',
              contents: [
                { type: 'text', text: '①', size: 'sm', color: '#C8804A', flex: 0 },
                { type: 'text', text: 'URLを送る\nイベントやお店の公式サイト・Instagram等のURLを貼るだけ。AIが自動で情報を読み取ります。', size: 'xs', wrap: true, color: '#2C2420' },
              ],
            },
            {
              type: 'box', layout: 'horizontal', spacing: 'sm',
              contents: [
                { type: 'text', text: '②', size: 'sm', color: '#C8804A', flex: 0 },
                { type: 'text', text: '写真を送る → URLや説明を続けて送る\n写真送信後10分以内にテキストを送ってください。', size: 'xs', wrap: true, color: '#2C2420' },
              ],
            },
          ],
        },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: '📌 投稿できる情報', weight: 'bold', size: 'sm', color: '#2C2420', margin: 'md' },
        {
          type: 'text',
          text: '🗺 イベント・展示・体験\n🍽 グルメ・カフェ・新店情報\n🏷 セール・割引情報',
          size: 'xs',
          wrap: true,
          color: '#6B5E52',
          margin: 'sm',
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#EDF4F1',
      paddingAll: '12px',
      contents: [{
        type: 'text',
        text: '管理者が確認・承認するとアプリに反映されます',
        size: 'xs',
        color: '#6E9E88',
        align: 'center',
        wrap: true,
      }],
    },
  },
};

// 画像メッセージ受信後のテキスト待ち状態を管理（10分でタイムアウト）
const lineUserSessions = new Map();

function cleanLineUserSessions() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [uid, s] of lineUserSessions) {
    if (s.timestamp < cutoff) lineUserSessions.delete(uid);
  }
}

function detectCity(text) {
  if (/#bkk\b|バンコク|bangkok/i.test(text)) return 'bkk';
  if (/#syd\b|シドニー|sydney/i.test(text)) return 'syd';
  return 'sg';
}

async function downloadLineImage(messageId) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`LINE image download failed: ${res.status}`);
  const mediaType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  const buf = await res.arrayBuffer();
  return { base64: Buffer.from(buf).toString('base64'), mediaType };
}

async function fetchWebContent(url) {
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      responseType: 'text',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; sg-weekend-bot/1.0)' },
    });
    const html = String(res.data);
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                 || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const ogImage = ogMatch ? ogMatch[1] : null;
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
    return { text, ogImage };
  } catch (_) {
    return { text: '', ogImage: null };
  }
}

async function generateEventDraft(image, userText, webContent, city = 'sg') {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const cityConf = CITIES[city] || CITIES.sg;
  const today = new Date().toLocaleString('sv-SE', { timeZone: cityConf.timezone }).slice(0, 10);

  const areaGuide = {
    sg:  'Central / East / West / North / North-East / Island-wide',
    bkk: 'Sukhumvit / Silom / Siam / Riverside / Old Town / City-wide',
    syd: 'CBD / Inner West / Eastern Suburbs / North Shore / Western Sydney / City-wide',
  }[city] || 'Central / City-wide';

  const userContent = [];

  if (image) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
    });
  }

  const parts = [`今日の日付（${cityConf.nameJa}時間）: ${today}`];
  if (userText) parts.push(`ユーザーのメモ:\n${userText}`);
  if (webContent) parts.push(`取得したWebコンテンツ:\n${webContent}`);
  userContent.push({ type: 'text', text: parts.join('\n\n') });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `あなたは${cityConf.nameJa}在住の日本人向けおでかけアプリ「おでかけNavi」のイベント登録アシスタントです。
提供された情報（画像・メモ・Webコンテンツ）をもとに create_event ツールを使いイベント情報を1件生成してください。

生成ルール:
- store: 施設・店舗・イベント名（固有名詞は英語のまま）
- type: "event"（体験・展示・公演・教育）/ "gourmet"（飲食・カフェ）/ "sale"（セール・割引）/ "opening"（グランドオープン）
- emoji: 内容を表す絵文字1文字
- who: ["family","couple","solo","group"] から1つ以上
- age: ["all","baby","preschool","school"] から1つ以上
- style: ["beginner","resident"] から1つ以上（beginner=観光客向け, resident=在住者向け）
- major_score: 1〜5（${cityConf.nameJa}在住日本人にとっての魅力度）
- content: 150〜200文字の日本語説明文
- content_en: 100〜150文字の英語説明文
- tips: 日本語ヒント2〜3点の配列（各26文字以内）
- tips_en: 英語ヒント2〜3点の配列（各38文字以内）
- period: "M/D〜M/D" 形式（単日なら "M/D"）
- start_date / end_date: "YYYY-MM-DD"（不明なら今日から1ヶ月後を end_date に）
- location: エリア名（${areaGuide} のいずれか。住所は入れない）
- area: location と同じ値
- url: ソースURL（不明なら ""）`,
      messages: [{ role: 'user', content: userContent }],
      tools: [{
        name: 'create_event',
        description: 'イベント情報を1件生成する',
        input_schema: {
          type: 'object',
          required: ['store', 'type', 'emoji', 'who', 'age', 'style', 'major_score', 'content', 'content_en', 'tips', 'tips_en', 'period', 'start_date', 'end_date', 'location', 'area'],
          properties: {
            store:      { type: 'string' },
            type:       { type: 'string', enum: ['event', 'gourmet', 'sale', 'opening'] },
            emoji:      { type: 'string' },
            who:        { type: 'array', items: { type: 'string' } },
            age:        { type: 'array', items: { type: 'string' } },
            style:      { type: 'array', items: { type: 'string' } },
            major_score: { type: 'number' },
            content:    { type: 'string' },
            content_en: { type: 'string' },
            tips:       { type: 'array', items: { type: 'string' } },
            tips_en:    { type: 'array', items: { type: 'string' } },
            period:     { type: 'string' },
            start_date: { type: 'string' },
            end_date:   { type: 'string' },
            location:   { type: 'string' },
            area:       { type: 'string' },
            url:        { type: 'string' },
          },
        },
      }],
      tool_choice: { type: 'tool', name: 'create_event' },
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${await res.text()}`);
  const data = await res.json();
  const toolUse = data.content?.find(b => b.type === 'tool_use' && b.name === 'create_event');
  if (!toolUse) throw new Error('create_event tool not called');
  return toolUse.input;
}

function savePendingEvent(draft, submittedBy, city = 'sg') {
  const pp = pendingPath(city);
  const pending = JSON.parse(fs.readFileSync(pp, 'utf8'));
  const id = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  pending.push({ id, event: draft, submittedBy, city, createdAt: new Date().toISOString(), status: 'pending' });
  fs.writeFileSync(pp, JSON.stringify(pending, null, 2), 'utf8');
  return id;
}

async function sendLinePush(userId, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: userId, messages }),
  });
}

async function replyLine(replyToken, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages }),
  });
}

function buildEventFlexMessage(pendingId, event, city = 'sg') {
  const whoMap  = { family: '👨‍👩‍👧家族', couple: '👫CP', solo: '🧑単身', group: '👥グループ' };
  const typeMap = { event: '🗺イベント', gourmet: '🍽グルメ', sale: '🏷セール', other: '✨その他' };
  const cityFlag = { sg: '🇸🇬', bkk: '🇹🇭', syd: '🇦🇺' }[city] || '';
  const whoText  = (event.who  || []).map(w => whoMap[w]  || w).join(' ');
  const typeText = typeMap[event.type] || event.type;
  const preview  = (event.content || '').slice(0, 120) + ((event.content || '').length > 120 ? '…' : '');

  const hasImage = !!(event.image);

  return {
    type: 'flex',
    altText: `📋 確認: ${cityFlag} ${event.emoji} ${event.store}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      ...(hasImage ? {
        hero: {
          type: 'image',
          url: event.image,
          size: 'full',
          aspectRatio: '20:9',
          aspectMode: 'cover',
        },
      } : {}),
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FDF0E6',
        paddingAll: '12px',
        contents: [{
          type: 'text',
          text: `${cityFlag} ${event.emoji} ${event.store}`,
          weight: 'bold',
          size: 'md',
          wrap: true,
          color: '#2C2420',
        }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: `${typeText}　${whoText}　⭐${event.major_score}`, size: 'xs', color: '#6B5E52', wrap: true },
          { type: 'text', text: `📅 ${event.period || ''}　📍 ${event.area || ''}`, size: 'xs', color: '#6B5E52', wrap: true },
          { type: 'text', text: hasImage ? '🖼️ 画像あり' : '🚫 画像なし', size: 'xxs', color: hasImage ? '#6E9E88' : '#C4705A', margin: 'xs' },
          { type: 'separator', margin: 'sm' },
          { type: 'text', text: preview, size: 'xs', wrap: true, color: '#2C2420' },
          ...(event.tips?.length ? [{
            type: 'text',
            text: '💡 ' + event.tips.slice(0, 2).join(' / '),
            size: 'xxs',
            wrap: true,
            color: '#6E9E88',
            margin: 'sm',
          }] : []),
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#6E9E88',
            height: 'sm',
            flex: 3,
            action: { type: 'postback', label: '✅ 承認して追加', data: `action=approve_event&id=${pendingId}&city=${city}` },
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            flex: 2,
            action: { type: 'postback', label: '❌ キャンセル', data: `action=reject_event&id=${pendingId}&city=${city}` },
          },
        ],
      },
    },
  };
}

function buildDeleteConfirmFlexMessage(keyword, targets, city = 'sg') {
  const cityFlag = { sg: '🇸🇬', bkk: '🇹🇭', syd: '🇦🇺' }[city] || '';
  const list = targets.slice(0, 5).map(e => `・${e.emoji ?? ''} ${e.store}`).join('\n');
  const more = targets.length > 5 ? `\n…他 ${targets.length - 5} 件` : '';
  return {
    type: 'flex',
    altText: `🗑️ 削除確認: 「${keyword}」(${targets.length}件)`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FDF0E6',
        paddingAll: '12px',
        contents: [{
          type: 'text',
          text: `🗑️ 本当に削除しますか？${cityFlag ? ` [${cityFlag} ${city.toUpperCase()}]` : ''}`,
          weight: 'bold',
          size: 'md',
          color: '#C4705A',
        }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: `キーワード: 「${keyword}」`, size: 'sm', color: '#6B5E52' },
          { type: 'text', text: `該当: ${targets.length}件`, size: 'sm', color: '#6B5E52' },
          { type: 'separator', margin: 'sm' },
          { type: 'text', text: list + more, size: 'xs', wrap: true, color: '#2C2420' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#C4705A',
            height: 'sm',
            flex: 3,
            action: { type: 'postback', label: '🗑️ 削除する', data: `action=delete_confirm&keyword=${encodeURIComponent(keyword)}&city=${city}` },
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            flex: 2,
            action: { type: 'postback', label: 'キャンセル', data: `action=delete_cancel` },
          },
        ],
      },
    },
  };
}

// POST /api/line-webhook — LINE Botメッセージ受信・イベント手動追加・承認フロー
app.post('/api/line-webhook', async (req, res) => {
  res.sendStatus(200); // LINE APIへ即座に応答

  const adminUserId = process.env.LINE_USER_ID;
  const lineEvents  = req.body.events || [];

  for (const ev of lineEvents) {
    const userId = ev.source?.userId;
    if (!userId) continue;

    try {
      // ─── 友達追加・ブロック解除 ──────────────────────────────
      if (ev.type === 'follow') {
        await replyLine(ev.replyToken, [
          { type: 'text', text: 'フォローありがとうございます！🙌' },
          LINE_GUIDE_MESSAGE,
        ]);
        continue;
      }

      // ─── 画像メッセージ（誰でも送信可）─────────────────────
      if (ev.type === 'message' && ev.message?.type === 'image') {
        cleanLineUserSessions();
        lineUserSessions.set(userId, { imageMessageId: ev.message.id, timestamp: Date.now(), city: 'sg' });
        await replyLine(ev.replyToken, [{
          type: 'text',
          text: '📸 写真を受け取りました！\nURLや補足説明を続けて送ってください（10分以内）。\n\n都市を指定するには #sg / #bkk / #syd を付けてください（省略時はSG）。\n\n例:\nhttps://... イベント名や補足メモ #bkk',
        }]);
        continue;
      }

      // ─── テキストメッセージ（誰でも送信可）──────────────────
      if (ev.type === 'message' && ev.message?.type === 'text') {
        cleanLineUserSessions();
        const text     = ev.message.text.trim();
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        const url      = urlMatch ? urlMatch[0] : null;
        const session  = lineUserSessions.get(userId);
        const city     = detectCity(text) || session?.city || 'sg';

        // ─── 削除コマンド（管理者のみ）────────────────────────
        if (text.includes('削除') && userId === adminUserId) {
          const keyword = text.replace(/削除/g, '').replace(/#sg\b|#bkk\b|#syd\b/gi, '').trim();
          if (keyword) {
            const allEvents = JSON.parse(fs.readFileSync(eventsPath(city), 'utf8'));
            const lower = keyword.toLowerCase();
            const targets = allEvents.filter(e => e.store?.toLowerCase().includes(lower));
            if (targets.length === 0) {
              await replyLine(ev.replyToken, [{
                type: 'text',
                text: `❌ 「${keyword}」に一致するイベントが見つかりませんでした。`,
              }]);
            } else {
              await replyLine(ev.replyToken, [buildDeleteConfirmFlexMessage(keyword, targets, city)]);
            }
            continue;
          }
        }

        if (!url && !session) {
          await replyLine(ev.replyToken, [LINE_GUIDE_MESSAGE]);
          continue;
        }

        // 処理中を即時通知（replyToken は一度だけ使用）
        await replyLine(ev.replyToken, [{
          type: 'text',
          text: '⏳ イベント情報を生成中です…（30秒ほどお待ちください）',
        }]);
        if (session) lineUserSessions.delete(userId);

        // 非同期処理 → 投稿者に確認、管理者に承認Flexを push
        (async () => {
          let image = null;
          if (session?.imageMessageId) {
            try { image = await downloadLineImage(session.imageMessageId); } catch (_) {}
          }
          const { text: webContent, ogImage } = url ? await fetchWebContent(url) : { text: '', ogImage: null };
          const draft      = await generateEventDraft(image, text, webContent, city);
          draft.image      = ogImage || null;
          draft.city        = city;
          draft.fetched_at  = new Date().toISOString().slice(0, 10);
          const pendingId  = savePendingEvent(draft, userId, city);

          const cityFlag = { sg: '🇸🇬', bkk: '🇹🇭', syd: '🇦🇺' }[city] || '';

          // 投稿者に完了通知
          await sendLinePush(userId, [{
            type: 'text',
            text: `✅ ${cityFlag}「${draft.emoji} ${draft.store}」の情報を管理者に送りました。承認されるとアプリに追加されます。`,
          }]);

          // 管理者に承認用 Flex Message を送信
          if (adminUserId && adminUserId !== userId) {
            await sendLinePush(adminUserId, [
              { type: 'text', text: `📨 ${cityFlag} 新しいイベント投稿が届きました。確認して承認してください：` },
              buildEventFlexMessage(pendingId, draft, city),
            ]);
          } else {
            // 管理者自身が投稿した場合は承認Flexも自分宛に送信
            await sendLinePush(userId, [
              { type: 'text', text: `✅ ${cityFlag} イベント情報を作成しました。確認して承認してください：` },
              buildEventFlexMessage(pendingId, draft, city),
            ]);
          }
        })().catch(async e => {
          console.error('Event generation error:', e.message);
          await sendLinePush(userId, [{ type: 'text', text: `❌ エラーが発生しました:\n${e.message}` }]);
        });
        continue;
      }

      // ─── ポストバック（承認 / キャンセル）管理者のみ ────────
      if (ev.type === 'postback') {
        if (userId !== adminUserId) continue; // 管理者のみ承認可能

        const params    = new URLSearchParams(ev.postback.data);
        const action    = params.get('action');
        const pendingId = params.get('id');
        const pbCity    = params.get('city') || 'sg';

        // ─── イベント削除確認 ────────────────────────────────
        if (action === 'delete_confirm') {
          const keyword  = decodeURIComponent(params.get('keyword') || '');
          const lower    = keyword.toLowerCase();
          const ep       = eventsPath(pbCity);
          const allEvents = JSON.parse(fs.readFileSync(ep, 'utf8'));
          const targets  = allEvents.filter(e => e.store?.toLowerCase().includes(lower));
          if (targets.length === 0) {
            await replyLine(ev.replyToken, [{ type: 'text', text: `❌ 「${keyword}」に一致するイベントがすでに存在しません。` }]);
          } else {
            const remaining = allEvents.filter(e => !e.store?.toLowerCase().includes(lower));
            fs.writeFileSync(ep, JSON.stringify(remaining, null, 2), 'utf8');
            const names = targets.map(e => `・${e.emoji ?? ''} ${e.store}`).join('\n');
            console.log(`🗑️ イベント削除 [${pbCity}]: ${targets.map(e => e.store).join(', ')}`);
            await replyLine(ev.replyToken, [{ type: 'text', text: `🗑️ 削除しました（${targets.length}件）:\n${names}` }]);
          }
          continue;
        }

        if (action === 'delete_cancel') {
          await replyLine(ev.replyToken, [{ type: 'text', text: '↩️ 削除をキャンセルしました。' }]);
          continue;
        }

        const pp      = pendingPath(pbCity);
        const pending = JSON.parse(fs.readFileSync(pp, 'utf8'));
        const target  = pending.find(e => e.id === pendingId);
        if (!target) continue;

        const filtered = pending.filter(e => e.id !== pendingId);
        const targetCity = target.city || pbCity;

        if (action === 'approve_event') {
          const ep        = eventsPath(targetCity);
          const allEvents = JSON.parse(fs.readFileSync(ep, 'utf8'));
          const newEvent = {
            id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            ...target.event,
            city: targetCity,
          };
          allEvents.push(newEvent);
          fs.writeFileSync(ep, JSON.stringify(allEvents, null, 2), 'utf8');
          fs.writeFileSync(pp, JSON.stringify(filtered, null, 2), 'utf8');
          console.log(`✅ 手動イベント追加 [${targetCity}]: ${target.event.store} (${newEvent.id})`);
          await replyLine(ev.replyToken, [{ type: 'text', text: `✅ 「${target.event.emoji} ${target.event.store}」を追加しました！` }]);

          // 投稿者（管理者以外）に承認通知
          const submitterUserId = target.submittedBy;
          if (submitterUserId && submitterUserId !== adminUserId) {
            await sendLinePush(submitterUserId, [{
              type: 'text',
              text: `🎉 「${target.event.emoji} ${target.event.store}」がアプリに追加されました！ありがとうございます。`,
            }]);
          }

        } else if (action === 'reject_event') {
          fs.writeFileSync(pp, JSON.stringify(filtered, null, 2), 'utf8');
          await replyLine(ev.replyToken, [{ type: 'text', text: '❌ キャンセルしました。' }]);
        }
      }
    } catch (e) {
      console.error('LINE webhook error:', e.message);
    }
  }
});

// ─────────────────────────────────────────────
// PUSH NOTIFICATIONS
// ─────────────────────────────────────────────
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push-subscribe', (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'invalid' });
  const subs = loadPushSubs();
  const idx = subs.findIndex(s => s.endpoint === subscription.endpoint);
  if (idx >= 0) subs[idx] = subscription;
  else subs.push(subscription);
  savePushSubs(subs);
  res.json({ ok: true });
});

app.delete('/api/push-subscribe', (req, res) => {
  const { endpoint } = req.body;
  savePushSubs(loadPushSubs().filter(s => s.endpoint !== endpoint));
  res.json({ ok: true });
});

app.post('/api/notify-events-updated', async (req, res) => {
  const city = req.query.city || 'sg';
  try {
    const sent = await sendPushToAll(city);
    res.json({ ok: true, sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────
// INSTAGRAM OEMBED（Meta oEmbed Read 権限が必要 — App Review 通過後に有効化）
// ─────────────────────────────────────────────
/*
const igEmbedCache = new Map();
app.get('/api/ig-embed', async (req, res) => {
  const { shortcode } = req.query;
  if (!shortcode || !/^[A-Za-z0-9_-]+$/.test(shortcode)) return res.status(400).json({ error: 'invalid shortcode' });
  const cached = igEmbedCache.get(shortcode);
  if (cached && Date.now() - cached.cachedAt < 24 * 60 * 60 * 1000) return res.json({ html: cached.html });
  try {
    const accessToken = `${process.env.INSTAGRAM_APP_ID}|${process.env.INSTAGRAM_APP_SECRET}`;
    const resp = await axios.get('https://graph.facebook.com/v25.0/instagram_oembed', {
      params: { url: `https://www.instagram.com/p/${shortcode}/`, hidecaption: true, omitscript: true, access_token: accessToken },
      timeout: 8000,
    });
    igEmbedCache.set(shortcode, { html: resp.data.html, cachedAt: Date.now() });
    res.json({ html: resp.data.html });
  } catch (e) { res.status(500).json({ error: 'oembed failed' }); }
});
*/

// ─────────────────────────────────────────────
// 共有カレンダー API
// ─────────────────────────────────────────────
const QRCode = require('qrcode');
const SHARED_CAL_DIR = path.join(__dirname, 'data', 'shared-calendars');
if (!fs.existsSync(SHARED_CAL_DIR)) fs.mkdirSync(SHARED_CAL_DIR, { recursive: true });

function generateGroupId() {
  // 紛らわしい文字(0,O,1,I)を除いた32文字から6文字
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function getCalFilePath(groupId) {
  if (!/^[A-Z2-9]{6}$/.test(groupId)) return null;
  return path.join(SHARED_CAL_DIR, `${groupId}.json`);
}

app.post('/api/calendar/create', async (req, res) => {
  try {
    const { city = 'sg', encryptedData } = req.body;
    let groupId;
    do { groupId = generateGroupId(); }
    while (fs.existsSync(path.join(SHARED_CAL_DIR, `${groupId}.json`)));

    const calData = {
      groupId, city,
      createdAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
      encryptedData: encryptedData || null,
    };
    fs.writeFileSync(getCalFilePath(groupId), JSON.stringify(calData, null, 2));
    res.json({ groupId });
  } catch (e) {
    console.error('calendar create:', e);
    res.status(500).json({ error: 'failed' });
  }
});

app.get('/api/calendar/:groupId', (req, res) => {
  const fp = getCalFilePath(req.params.groupId);
  if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  try { res.json(JSON.parse(fs.readFileSync(fp, 'utf8'))); }
  catch (e) { res.status(500).json({ error: 'read failed' }); }
});

app.put('/api/calendar/:groupId', (req, res) => {
  const fp = getCalFilePath(req.params.groupId);
  if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  try {
    const existing = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const { encryptedData, customPlans, eventPlans } = req.body;
    const updated = { ...existing, lastSyncAt: new Date().toISOString() };
    if (encryptedData !== undefined) {
      updated.encryptedData = encryptedData;
      delete updated.customPlans;
      delete updated.eventPlans;
      delete updated.qrDataUrl;
    } else {
      updated.customPlans = customPlans || [];
      updated.eventPlans = eventPlans || [];
    }
    fs.writeFileSync(fp, JSON.stringify(updated, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'write failed' }); }
});

app.post('/api/calendar/:groupId/join', (req, res) => {
  // Merge now happens client-side; this endpoint just returns current data
  const fp = getCalFilePath(req.params.groupId);
  if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  try { res.json(JSON.parse(fs.readFileSync(fp, 'utf8'))); }
  catch (e) { res.status(500).json({ error: 'join failed' }); }
});

app.post('/api/calendar/:groupId/push-subscribe', (req, res) => {
  const fp = getCalFilePath(req.params.groupId);
  if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  const { subscription, deviceId } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'invalid' });
  try {
    const cal = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const subs = cal.pushSubscriptions || [];
    const idx = subs.findIndex(s => s.endpoint === subscription.endpoint);
    const entry = { ...subscription, deviceId: deviceId || null };
    if (idx >= 0) subs[idx] = entry;
    else subs.push(entry);
    fs.writeFileSync(fp, JSON.stringify({ ...cal, pushSubscriptions: subs }, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'subscribe failed' }); }
});

app.delete('/api/calendar/:groupId/push-subscribe', (req, res) => {
  const fp = getCalFilePath(req.params.groupId);
  if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'invalid' });
  try {
    const cal = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const subs = (cal.pushSubscriptions || []).filter(s => s.endpoint !== endpoint);
    fs.writeFileSync(fp, JSON.stringify({ ...cal, pushSubscriptions: subs }, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'unsubscribe failed' }); }
});

app.post('/api/calendar/:groupId/notify', async (req, res) => {
  const fp = getCalFilePath(req.params.groupId);
  if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  const { title = '📅 カレンダーが更新されました', body = '予定が更新されました', deviceId } = req.body;
  try {
    const cal = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const subs = (cal.pushSubscriptions || []).filter(s => !deviceId || s.deviceId !== deviceId);
    if (subs.length === 0) return res.json({ ok: true, sent: 0 });
    const gid = req.params.groupId;
    const city = cal.city || 'sg';
    const payload = JSON.stringify({
      title,
      body,
      data: { url: `/?join=${gid}&city=${city}` },
    });
    const expired = new Set();
    await Promise.allSettled(subs.map(async sub => {
      const { deviceId: _d, ...webSub } = sub;
      try {
        await webpush.sendNotification(webSub, payload);
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) expired.add(sub.endpoint);
      }
    }));
    if (expired.size > 0) {
      const allSubs = (cal.pushSubscriptions || []).filter(s => !expired.has(s.endpoint));
      fs.writeFileSync(fp, JSON.stringify({ ...cal, pushSubscriptions: allSubs }, null, 2));
    }
    res.json({ ok: true, sent: subs.length - expired.size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
// COURSE API
// ─────────────────────────────────────────────

// GET /api/courses
app.get('/api/courses', (req, res) => {
  const city = req.query.city || 'sg';
  const tab = req.query.tab || 'community';

  const communityPath = path.join(__dirname, 'data', city, 'community-courses.json');
  const community = fs.existsSync(communityPath) ? JSON.parse(fs.readFileSync(communityPath)) : [];

  if (tab === 'preset') return res.json([]);
  if (tab === 'community') return res.json([...community].sort((a, b) => b.likes - a.likes));
  if (tab === 'popular') {
    // communityのみからlikes降順上位5件
    const sorted = [...community].sort((a, b) => b.likes - a.likes);
    return res.json(sorted.slice(0, 5));
  }
  res.json([]);
});

// POST /api/courses/generate
app.post('/api/courses/generate', async (req, res) => {
  const { city = 'sg', with: who, time, mood, area, pace = 'ふつう', style, conditions, profile, pinnedEvents = [] } = req.body;

  // conditions オブジェクトが渡された場合はそちらを優先
  const cond = conditions || {};
  const resolvedWho = cond.with || who;
  const resolvedTime = cond.time || time;
  const resolvedMood = cond.mood || mood;
  const resolvedArea = cond.area || area;
  const resolvedPace = cond.pace || pace;
  const resolvedStyle = cond.style || style;
  const resolvedAge = profile?.age;

  // 登録イベントから候補を取得
  const ep = eventsPath(city);
  const events = fs.existsSync(ep) ? JSON.parse(fs.readFileSync(ep)) : [];
  const upcomingEvents = events.filter(e => e.end_date >= new Date().toISOString().slice(0, 10)).slice(0, 5);

  const spotCount = resolvedPace === 'ゆったり' ? '2〜3' : resolvedPace === 'めいっぱい' ? '6〜8' : '4〜5';

  // 年齢情報の日本語表現
  const ageLabels = { baby: '0〜2歳の赤ちゃん', preschool: '幼稚園児（3〜6歳）', school: '小学生以上' };
  const ageNote = resolvedAge && resolvedAge !== 'all' ? `\n- 子どもの年齢: ${ageLabels[resolvedAge] || resolvedAge}` : '';

  // スタイルの説明
  let styleNote = '';
  if (resolvedStyle === '定番') styleNote = '\n- スタイル: 定番（人気スポット・観光地定番コース。誰でも楽しめる王道プラン）';
  else if (resolvedStyle === 'ニッチ') styleNote = '\n- スタイル: ニッチ（ローカルに愛される穴場・あまり知られていないスポット中心のプラン）';
  else styleNote = '\n- スタイル: バランス良く（定番・穴場を適切に組み合わせる）';

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();

  const prompt = `シンガポール在住日本人向けに、以下の条件で週末1日コースを提案してください。

条件:
- 誰と: ${resolvedWho || '誰でも'}
- 時間帯: ${resolvedTime || '終日'}
- 気分: ${resolvedMood || 'アクティブ'}
- エリア: ${resolvedArea || 'Central（中心部）'}
- ペース: ${resolvedPace}（スポット数の目安: ${spotCount}件）${ageNote}${styleNote}

${pinnedEvents.length > 0 ? `ユーザーがピン留めしたイベント（必ずメインスポットとして組み込む）:
${pinnedEvents.map(p => `- ${p.emoji || '📌'} ${p.title}（${p.area || ''}）`).join('\n')}

` : ''}参考にできるその他のイベント（任意で1件組み込んでよい）:
${upcomingEvents.map(e => `- ${e.store || e.title_ja || ''}（${e.start_date}〜${e.end_date}）`).join('\n') || 'なし'}

以下のJSON形式で返してください（余分な説明不要、JSONのみ）:
{
  "title": "コースタイトル（20文字以内）",
  "tagline": "キャッチコピー（30文字以内）",
  "description": "このコースの魅力（2〜3文、なぜおすすめか具体的に）",
  "imageSearch": "英語キーワード2〜4語",
  "spots": [
    {
      "time": "09:00",
      "name": "スポット名",
      "type": "観光|グルメ|ショッピング|公園|文化",
      "duration": "90分",
      "description": "おすすめポイント（40〜60文字）",
      "address": "エリア・場所",
      "emoji": "🌿"
    }
  ]
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'コース生成失敗' });

    const course = JSON.parse(jsonMatch[0]);

    // Unsplash画像取得
    const { fetchUnsplashImage } = require('./scripts/lib/unsplash');
    const imageUrl = await fetchUnsplashImage(course.imageSearch || 'singapore weekend');

    const result = {
      id: `course_${city}_${Date.now()}`,
      city,
      type: 'ai',
      ...course,
      imageUrl,
      conditions: { with: resolvedWho, time: resolvedTime, mood: resolvedMood, area: resolvedArea, pace: resolvedPace, style: resolvedStyle },
      authorId: req.body.userId || 'anonymous',
      authorName: req.body.userName || '匿名',
      isPublic: false,
      likes: 0,
      views: 0,
      createdAt: new Date().toISOString(),
    };

    res.json(result);
  } catch (e) {
    console.error('Course generation error:', e);
    res.status(500).json({ error: 'コース生成に失敗しました' });
  }
});

// POST /api/courses/chat — AIチャットで条件収集
app.post('/api/courses/chat', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' });

  const { city = 'sg', message = '', history = [], profile = {} } = req.body;
  const cityConf = CITIES[city] || CITIES.sg;

  // プロフィール情報の日本語変換
  const whoMap = { family: 'ファミリー（子連れ）', couple: 'カップル', group: '友人グループ', solo: 'ひとり' };
  const ageLabels = { baby: '0〜2歳の赤ちゃん', preschool: '幼稚園児（3〜6歳）', school: '小学生以上' };
  const whoList = Array.isArray(profile.who) ? profile.who : [];
  const whoText = whoList.length > 0 ? whoMap[whoList[0]] || whoList[0] : '未設定';
  const ageText = profile.age && profile.age !== 'all' ? ageLabels[profile.age] || profile.age : null;

  let profileDesc = `おでかけスタイル: ${whoText}`;
  if (ageText) profileDesc += `（子ども: ${ageText}）`;

  const collectTool = {
    name: 'collect_conditions',
    description: 'ユーザーから収集した条件と、AIからユーザーへの返答を記録する',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'ユーザーへの返答メッセージ' },
        conditions: {
          type: 'object',
          properties: {
            with: { type: ['string', 'null'] },
            time: { type: ['string', 'null'] },
            mood: { type: ['string', 'null'] },
            area: { type: ['string', 'null'] },
            pace: { type: ['string', 'null'] },
            style: { type: ['string', 'null'] }
          }
        },
        ready: { type: 'boolean', description: '全条件揃ったらtrue' }
      },
      required: ['message', 'conditions', 'ready']
    }
  };

  // withはプロフィールから補完
  const withFromProfile = whoList.length > 0 ? whoText : null;

  const systemPrompt = `あなたは${cityConf.nameJa}在住日本人向け週末コース作成の聞き取り担当AIです。
日本語で自然な会話形式でコース作成に必要な条件を聞き取ってください。

ユーザーのプロフィール:
- ${profileDesc}

収集する条件（全6項目）:
1. with（誰と）: ${withFromProfile ? `プロフィールから「${withFromProfile}」と判断済み` : '子連れ / カップル / 友人 / ひとり から聞き取る'}
2. time（使える時間）: 午前のみ / 午後のみ / 終日
3. mood（気分）: のんびり / アクティブ / グルメ / ショッピング
4. area（エリア）: Central / East / West / North / North-East / Island-wide（英語値で記録、表示は日本語OK）
5. pace（ペース）: ゆったり / ふつう / めいっぱい
6. style（スタイル）: 定番（人気スポット中心） / ニッチ（穴場・ローカル中心）

ルール:
- withはプロフィールから補完済みの場合は確認だけして次に進む
- 3〜5往復で自然にまとめる
- 複数の条件を1回で聞いても良い
- 全6項目が揃ったら ready: true にし、収集した条件の概要をmessageに含める
- 空メッセージ（初回）の場合はプロフィールを参照した挨拶と最初の質問を返す
- collect_conditions ツールを必ず使って返答すること
- messageはプレーンテキストのみ。**マークダウン記法（**, *, # 等）は一切使わない**
- 選択肢を列挙するときは「①②③」や「A/B/C」形式ではなく、読みやすい文章または改行区切りにする
- 一度に聞く質問は1〜2個まで。長文にならないようにする`;

  // 最大6往復（12メッセージ）に制限
  const limitedHistory = history.slice(-12);
  const messages = message.trim()
    ? [...limitedHistory, { role: 'user', content: message.trim() }]
    : limitedHistory;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.length > 0 ? messages : [{ role: 'user', content: '（初回）' }],
        tools: [collectTool],
        tool_choice: { type: 'tool', name: 'collect_conditions' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error (courses/chat):', err);
      return res.status(500).json({ error: 'AI response failed' });
    }

    const data = await response.json();
    const toolUse = data.content?.find(b => b.type === 'tool_use' && b.name === 'collect_conditions');

    if (toolUse) {
      const input = toolUse.input;
      // withをプロフィールから補完
      if (withFromProfile && !input.conditions?.with) {
        if (input.conditions) input.conditions.with = withFromProfile;
      }
      return res.json({
        message: input.message || '',
        conditions: input.conditions || {},
        ready: input.ready || false,
      });
    }

    // fallback
    const textBlock = data.content?.find(b => b.type === 'text');
    res.json({
      message: textBlock?.text || 'すみません、もう一度お試しください。',
      conditions: {},
      ready: false,
    });
  } catch (e) {
    console.error('courses/chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/courses/publish
app.post('/api/courses/publish', async (req, res) => {
  const course = req.body;
  if (!course?.id || !course?.city) return res.status(400).json({ error: 'invalid' });

  const filePath = path.join(__dirname, 'data', course.city, 'community-courses.json');

  await withFileLock(filePath, async () => {
    const courses = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath)) : [];
    // 重複チェック
    if (courses.find(c => c.id === course.id)) return;
    courses.unshift({ ...course, isPublic: true, publishedAt: new Date().toISOString() });
    fs.writeFileSync(filePath, JSON.stringify(courses, null, 2));
  });

  res.json({ ok: true });
});

// POST /api/courses/:id/like
app.delete('/api/courses/:id', async (req, res) => {
  const { id } = req.params;
  const city = req.query.city || 'sg';
  const filePath = path.join(__dirname, 'data', city, 'community-courses.json');
  if (fs.existsSync(filePath)) {
    await withFileLock(filePath, async () => {
      const courses = JSON.parse(fs.readFileSync(filePath));
      fs.writeFileSync(filePath, JSON.stringify(courses.filter(c => c.id !== id), null, 2));
    });
  }
  res.json({ ok: true });
});

app.post('/api/courses/:id/like', async (req, res) => {
  const { id } = req.params;
  const { city = 'sg', action = 'like' } = req.body;

  const filePath = path.join(__dirname, 'data', city, 'community-courses.json');

  if (fs.existsSync(filePath)) {
    await withFileLock(filePath, async () => {
      const courses = JSON.parse(fs.readFileSync(filePath));
      const course = courses.find(c => c.id === id);
      if (course) {
        course.likes = Math.max(0, (course.likes || 0) + (action === 'like' ? 1 : -1));
        fs.writeFileSync(filePath, JSON.stringify(courses, null, 2));
      }
    });
  }

  res.json({ ok: true });
});

app.post('/api/courses/:id/unpublish', async (req, res) => {
  const { id } = req.params;
  const city = req.body.city || 'sg';
  const filePath = path.join(__dirname, 'data', city, 'community-courses.json');
  if (fs.existsSync(filePath)) {
    await withFileLock(filePath, async () => {
      const courses = JSON.parse(fs.readFileSync(filePath));
      fs.writeFileSync(filePath, JSON.stringify(courses.filter(c => c.id !== id), null, 2));
    });
  }
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// SPA fallback
// ─────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌴 週末どうする？SG`);
  console.log(`   → http://localhost:${PORT}\n`);
});
