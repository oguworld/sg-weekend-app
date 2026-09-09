require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const webpush = require('web-push');
const rateLimit = require('express-rate-limit');

webpush.setVapidDetails(
  'mailto:oguworld@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ─────────────────────────────────────────────
// APNs (iOSアプリ向けネイティブPush)
// 環境変数未設定時はiOS送信のみスキップ（Web Push可用性には一切影響しない）
// ─────────────────────────────────────────────
const APNS_KEY_ID     = process.env.APNS_KEY_ID;
const APNS_TEAM_ID    = process.env.APNS_TEAM_ID;
const APNS_BUNDLE_ID  = process.env.APNS_BUNDLE_ID;
const APNS_PRIVATE_KEY = process.env.APNS_PRIVATE_KEY;
const APNS_PRODUCTION  = process.env.APNS_PRODUCTION === 'true';
const APNS_ENABLED = !!(APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID && APNS_PRIVATE_KEY);

let apnProvider = null;
if (APNS_ENABLED) {
  try {
    const apn = require('@parse/node-apn');
    apnProvider = new apn.Provider({
      token: {
        key: APNS_PRIVATE_KEY.replace(/\\n/g, '\n'),
        keyId: APNS_KEY_ID,
        teamId: APNS_TEAM_ID,
      },
      production: APNS_PRODUCTION,
    });
    console.log(`📱 APNs初期化完了（production=${APNS_PRODUCTION}）`);
  } catch (e) {
    console.warn('⚠️  APNs初期化に失敗しました。iOS向けPushはスキップされます:', e.message);
    apnProvider = null;
  }
} else {
  console.warn('⚠️  APNs関連の環境変数が未設定のため、iOS向けPushはスキップされます（Web Pushは通常通り動作します）');
}

// APNsへ1件送信。無効トークンなど恒久的な失敗時は true（削除対象）を返す
async function sendApnToToken(deviceToken, { title, body, url }) {
  if (!apnProvider) return false;
  const apn = require('@parse/node-apn');
  const note = new apn.Notification();
  note.topic = APNS_BUNDLE_ID;
  note.alert = { title, body };
  note.sound = 'default';
  note.payload = { url: url || '/' };
  try {
    const result = await apnProvider.send(note, deviceToken);
    const failure = result.failed?.[0];
    if (failure) {
      const reason = failure.response?.reason;
      const isInvalid = failure.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered';
      if (isInvalid) return true;
      console.error('APNs送信失敗:', failure.status, reason);
    }
    return false;
  } catch (e) {
    console.error('APNs送信エラー:', e.message);
    return false;
  }
}

const PUSH_SUBS_PATH = path.join(__dirname, 'data', 'push-subscriptions.json');
function loadPushSubs() {
  try { return JSON.parse(fs.readFileSync(PUSH_SUBS_PATH, 'utf8')); } catch { return []; }
}
function savePushSubs(subs) {
  fs.writeFileSync(PUSH_SUBS_PATH, JSON.stringify(subs, null, 2), 'utf8');
}
// 既存データ（platformフィールドなし）は 'web' にフォールバック
function subPlatform(sub) {
  return sub.platform || 'web';
}
async function sendPushToAll(cityKey) {
  const cityConf = CITIES[cityKey] || CITIES.sg;
  const title = '最新情報を更新しました';
  const body = 'おでかけ情報・生活情報の最新記事をチェックしてみましょう！';
  const url = 'https://dosuru.app/?nav=news';
  const payload = JSON.stringify({ title, body, data: { url } });
  const subs = loadPushSubs();
  if (subs.length === 0) return 0;
  const expiredEndpoints = new Set();
  const expiredTokens = new Set();
  await Promise.allSettled(subs.map(async sub => {
    if (subPlatform(sub) === 'ios') {
      const invalid = await sendApnToToken(sub.deviceToken, { title, body, url });
      if (invalid) expiredTokens.add(sub.deviceToken);
      return;
    }
    try {
      await webpush.sendNotification(sub, payload);
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) expiredEndpoints.add(sub.endpoint);
    }
  }));
  if (expiredEndpoints.size > 0 || expiredTokens.size > 0) {
    savePushSubs(subs.filter(s => !expiredEndpoints.has(s.endpoint) && !expiredTokens.has(s.deviceToken)));
  }
  return subs.length - expiredEndpoints.size - expiredTokens.size;
}

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
// ADMIN AUTH
// ─────────────────────────────────────────────
function requireAdminSecret(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

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
// AUTH（Google/Apple Sign-In、設計書20/35/36/44。認証情報最小化方針: sub のみ保存、email/氏名/画像は一切保存しない）
// ─────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const appleSignin = require('apple-signin-auth');
const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID;
const googleOAuthClient = new OAuth2Client();

// Apple Sign-In（設計書44）。Services ID・App IDのどちらも未設定なら機能を無効化するフェイルセーフ（APNs実装と同パターン）
const APPLE_SERVICE_ID = process.env.APPLE_SERVICE_ID;
const APPLE_APP_ID = process.env.APPLE_APP_ID;
const APPLE_AUTH_ENABLED = !!(APPLE_SERVICE_ID && APPLE_APP_ID);
if (!APPLE_AUTH_ENABLED) {
  console.warn('[auth] APPLE_SERVICE_ID / APPLE_APP_ID が未設定のため Sign in with Apple は無効化されています');
}

// Apple Sign-In Web版CSRF対策のstateパラメータ（サーバー側インメモリMap＋5分TTL）
const appleAuthStates = new Map();
const APPLE_STATE_TTL_MS = 5 * 60 * 1000;
function issueAppleAuthState() {
  const state = crypto.randomBytes(16).toString('hex');
  appleAuthStates.set(state, { createdAt: Date.now() });
  return state;
}
function verifyAndConsumeAppleAuthState(state) {
  const entry = appleAuthStates.get(state);
  appleAuthStates.delete(state);
  if (!entry) return false;
  return (Date.now() - entry.createdAt) < APPLE_STATE_TTL_MS;
}
setInterval(() => {
  const now = Date.now();
  for (const [state, entry] of appleAuthStates.entries()) {
    if (now - entry.createdAt >= APPLE_STATE_TTL_MS) appleAuthStates.delete(state);
  }
}, 60 * 1000).unref();

const USERS_PATH = path.join(__dirname, 'data', 'users.json');
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8')); } catch { return []; }
}
function saveUsers(users) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
}
function genUserId() {
  return 'usr_' + crypto.randomBytes(12).toString('hex');
}

// provider + providerSub をユニークキーに data/users.json を upsert する（email/displayName等は一切扱わない）
async function upsertUser(provider, providerSub) {
  let user;
  await withFileLock(USERS_PATH, () => {
    const users = loadUsers();
    const now = new Date().toISOString();
    const existing = users.find(u => u.provider === provider && u.providerSub === providerSub);
    if (existing) {
      existing.lastLoginAt = now;
      user = existing;
    } else {
      user = {
        userId: genUserId(),
        provider,
        providerSub,
        createdAt: now,
        lastLoginAt: now,
        subscriptions: [],
      };
      users.push(user);
    }
    saveUsers(users);
  });
  return user;
}

function issueAppJwt(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

// Authorization: Bearer <JWT> を検証し userId を返す。不正・欠如時は null（例外を投げない、任意認証用）
function verifyAppJwtOptional(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.userId || null;
  } catch {
    return null;
  }
}

// GET /api/auth/me 等、認証必須エンドポイント用ミドルウェア
function requireAppAuth(req, res, next) {
  const userId = verifyAppJwtOptional(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  req.authUserId = userId;
  next();
}

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────
app.use(express.json());

// 許可オリジン（about サブドメイン + Capacitor アプリ）
const ALLOWED_ORIGINS = [
  'https://about.dosuru.app',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
];
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// index.html と sw.js はキャッシュしない
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html' || req.path === '/sw.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.get('/', (req, res, next) => {
  if (req.hostname === 'about.dosuru.app') {
    return res.sendFile(path.join(__dirname, 'public', 'about.html'));
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

function calendarEventsPath(city) {
  return path.join(__dirname, 'data', city, 'calendar-events.json');
}

// アイテムが指定の期間(rangeStart〜rangeEnd、月/年どちらの範囲にも使える)と重なるか判定（weekOverlapと同じロジック）
function monthOverlap(itemStart, itemEnd, monthStart, monthEnd) {
  return itemStart <= monthEnd && itemEnd >= monthStart;
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

// GET /api/life-info — シンガポール在住日本人向け生活情報・ニュース一覧（設計書172）
// data/{city}/life-info.json が存在しない場合は空配列を返す（エラーにしない）
app.get('/api/life-info', (req, res) => {
  try {
    const city = resolveCity(req);
    const p = path.join(__dirname, 'data', city, 'life-info.json');
    if (!fs.existsSync(p)) return res.json([]);
    let items = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(items)) items = [];

    const category = (req.query.category || '').toLowerCase();
    const VALID_CATEGORIES = ['admin', 'weather', 'transport', 'community', 'health', 'education'];
    if (VALID_CATEGORIES.includes(category)) {
      items = items.filter(item => item.category === category);
    }

    items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────
// COMMENTS（イベント・生活情報カードへのコメント機能。設計書174）
// events.json/life-info.jsonとは独立したファイルで管理し、元データの
// 再取得・保持期間切れ削除の影響を受けない。
// ─────────────────────────────────────────────
function commentsPath(city) {
  return path.join(__dirname, 'data', city, 'comments.json');
}
function loadComments(city) {
  try { return JSON.parse(fs.readFileSync(commentsPath(city), 'utf8')); } catch { return []; }
}
function saveComments(city, comments) {
  fs.writeFileSync(commentsPath(city), JSON.stringify(comments, null, 2), 'utf8');
}

// GET /api/comments?itemType=event|news&itemId=xxx — 閲覧は認証不要
app.get('/api/comments', (req, res) => {
  try {
    const city = resolveCity(req);
    const { itemType, itemId } = req.query;
    if (!['event', 'news'].includes(itemType) || !itemId) {
      return res.status(400).json({ error: 'itemType and itemId required' });
    }
    const comments = loadComments(city)
      .filter(c => c.itemType === itemType && c.itemId === itemId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    res.json(comments);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/comments/counts?itemType=event|news — カード一覧描画時に1回だけ呼び、
// itemId毎のコメント数をまとめて返す（カード枚数分のN+1リクエストを避けるため）
app.get('/api/comments/counts', (req, res) => {
  try {
    const city = resolveCity(req);
    const { itemType } = req.query;
    if (!['event', 'news'].includes(itemType)) {
      return res.status(400).json({ error: 'itemType required' });
    }
    const counts = {};
    for (const c of loadComments(city)) {
      if (c.itemType !== itemType) continue;
      counts[c.itemId] = (counts[c.itemId] || 0) + 1;
    }
    res.json(counts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/comments — 投稿はrequireAppAuth（アカウント連携済みユーザー）または
// x-admin-secretヘッダー（post-to-x.jsからのbot投稿）のいずれかの認証で受け付ける
app.post('/api/comments', async (req, res) => {
  try {
    const isBot = process.env.ADMIN_SECRET && req.headers['x-admin-secret'] === process.env.ADMIN_SECRET;
    let authUserId = null;
    if (isBot) {
      authUserId = 'bot_odekake_navi';
    } else {
      authUserId = verifyAppJwtOptional(req);
      if (!authUserId) return res.status(401).json({ error: 'unauthorized' });
    }

    const city = resolveCity(req);
    const { itemType, itemId, text, nickname } = req.body || {};
    if (!['event', 'news'].includes(itemType) || !itemId) {
      return res.status(400).json({ error: 'invalid itemType/itemId' });
    }
    const trimmed = (text || '').trim();
    if (!trimmed) return res.status(400).json({ error: 'text required' });
    if (trimmed.length > 300) return res.status(400).json({ error: 'text too long (max 300 chars)' });

    const comment = {
      id: 'cmt_' + crypto.randomBytes(12).toString('hex'),
      itemType,
      itemId,
      userId: authUserId,
      nickname: (nickname || '').trim().slice(0, 30) || null,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    await withFileLock(commentsPath(city), () => {
      const comments = loadComments(city);
      comments.push(comment);
      saveComments(city, comments);
    });
    res.json({ ok: true, comment });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/comments/:id — 投稿者本人のみ削除可
app.delete('/api/comments/:id', requireAppAuth, async (req, res) => {
  try {
    const city = resolveCity(req);
    let status = null; // 'deleted' | 'forbidden' | 'not_found'
    await withFileLock(commentsPath(city), () => {
      const comments = loadComments(city);
      const idx = comments.findIndex(c => c.id === req.params.id);
      if (idx === -1) { status = 'not_found'; return; }
      if (comments[idx].userId !== req.authUserId) { status = 'forbidden'; return; }
      comments.splice(idx, 1);
      saveComments(city, comments);
      status = 'deleted';
    });
    if (status === 'not_found') return res.status(404).json({ error: 'not found' });
    if (status === 'forbidden') return res.status(403).json({ error: 'forbidden' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sponsored-cards — PRカード（スポンサー広告枠）一覧（設計書23フェーズ2・設計書29）
// data/{city}/sponsored-cards.json が存在しない場合は空配列を返す（エラーにしない）
app.get('/api/sponsored-cards', (req, res) => {
  try {
    const city = resolveCity(req);
    const p = path.join(__dirname, 'data', city, 'sponsored-cards.json');
    if (!fs.existsSync(p)) return res.json([]);
    const cards = JSON.parse(fs.readFileSync(p, 'utf8'));
    res.json(Array.isArray(cards) ? cards : []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/config — 認証不要、公開情報のみを返す軽量エンドポイント（Web版のGoogle Identity Services / Sign in with Apple JS初期化用）
app.get('/api/config', (req, res) => {
  res.json({
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID || null,
    appleServiceId: process.env.APPLE_SERVICE_ID || null,
    appleRedirectUri: 'https://dosuru.app/api/auth/apple/callback',
  });
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
// GET /api/widget-stats — ホーム画面上部の指標ウィジェット（為替・天気・PSI）
// 為替: Frankfurter（無料・キー不要）/ 天気: OpenWeatherMap（既存キー流用、降水確率付き）/ PSI: data.gov.sg（SGのみ）
// フィールドごとに個別キャッシュ（1つが取得失敗しても他のフィールドの鮮度に影響しない。
// 失敗時は古いキャッシュ値があればそれをフォールバックとして返す）
const widgetStatsCache = new Map(); // city -> { exchangeRate: {value,cachedAt}, weather: {...}, psi: {...} }
const WIDGET_STATS_TTL_MS = 30 * 60 * 1000; // 30分

function psiLevel(value) {
  if (value <= 50) return '良好';
  if (value <= 100) return '普通';
  if (value <= 200) return '要注意';
  if (value <= 300) return '健康に悪い';
  return '危険';
}

// NEA(シンガポール気象庁)の2時間先ナウキャスト予報の日本語訳＋深刻度（スコール等の急変を検知するため）
// 深刻度が高い項目ほど数値を大きくし、全地域中で最も深刻な状況を「今の空模様」として採用する
const NOWCAST_SEVERITY = [
  ['Heavy Thundery Showers with Gusty Winds', 9, '激しい雷雨・突風'],
  ['Heavy Thundery Showers', 8, '激しい雷雨'],
  ['Thundery Showers', 7, '雷雨'],
  ['Heavy Showers', 6, '激しいにわか雨'],
  ['Heavy Rain', 6, '激しい雨'],
  ['Showers', 5, 'にわか雨'],
  ['Moderate Rain', 5, 'まとまった雨'],
  ['Light Showers', 4, '小雨(にわか雨)'],
  ['Light Rain', 4, '小雨'],
  ['Passing Showers', 3, '通り雨'],
  ['Windy', 2, '風が強い'],
  ['Mist', 2, '霧'],
  ['Fog', 2, '濃霧'],
  ['Hazy', 2, 'ヘイズ(煙霧)'],
  ['Slightly Hazy', 1, 'やや煙霧'],
  ['Cloudy', 1, '曇り'],
  ['Partly Cloudy', 0, '一部曇り'],
  ['Fair', 0, '晴れ'],
];
function classifyNowcast(text) {
  const base = text.replace(/\s*\((Day|Night)\)\s*$/i, '').trim();
  const match = NOWCAST_SEVERITY.find(([key]) => base === key);
  return match ? { severity: match[1], ja: match[2] } : { severity: -1, ja: base };
}

function dengueLevel(clusterCount) {
  if (clusterCount === 0) return '警報なし';
  if (clusterCount <= 5) return '注意';
  if (clusterCount <= 15) return '警戒';
  return '厳重警戒';
}

// data.gov.sgの新API（ダウンロードURLを一度発行してから取得する2段階方式）
async function fetchDataGovSgDataset(datasetId) {
  const poll = await axios.get(`https://api-open.data.gov.sg/v1/public/api/datasets/${datasetId}/poll-download`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 6000,
  });
  const url = poll.data.data.url;
  const file = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000 });
  return file.data;
}

app.get('/api/widget-stats', async (req, res) => {
  const city = resolveCity(req);
  const cityCache = widgetStatsCache.get(city) || {};
  const currency = CITIES[city].currency;
  const now = Date.now();
  const isFresh = (field) => cityCache[field] && now - cityCache[field].cachedAt < WIDGET_STATS_TTL_MS;

  const [fxSettled, weatherSettled, psiSettled, nowcastSettled, dengueSettled] = await Promise.allSettled([
    isFresh('exchangeRate') ? Promise.resolve(null) : axios.get(`https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=JPY`, { timeout: 6000 }),
    isFresh('weather') || !process.env.OPENWEATHER_API_KEY
      ? Promise.resolve(null)
      : axios.get(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(CITIES[city].weatherQ)}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric&lang=ja`, { timeout: 6000 }),
    isFresh('psi') || city !== 'sg'
      ? Promise.resolve(null)
      : axios.get('https://api.data.gov.sg/v1/environment/psi', { timeout: 6000 }),
    isFresh('nowcast') || city !== 'sg'
      ? Promise.resolve(null)
      : axios.get('https://api.data.gov.sg/v1/environment/2-hour-weather-forecast', { timeout: 6000 }),
    isFresh('dengue') || city !== 'sg'
      ? Promise.resolve(null)
      : fetchDataGovSgDataset('d_dbfabf16158d1b0e1c420627c0819168'),
  ]);

  if (fxSettled.status === 'fulfilled' && fxSettled.value) {
    cityCache.exchangeRate = { value: fxSettled.value.data.rates.JPY, cachedAt: now };
  } else if (fxSettled.status === 'rejected') {
    console.error('widget-stats fx error:', fxSettled.reason.message);
  }

  if (weatherSettled.status === 'fulfilled' && weatherSettled.value) {
    const nowSec = now / 1000;
    const list = weatherSettled.value.data.list;
    const next = list.find(item => item.dt >= nowSec) || list[0];
    cityCache.weather = {
      value: {
        temp: Math.round(next.main.temp),
        rainProbPercent: Math.round((next.pop || 0) * 100),
        condition: next.weather[0].main,
      },
      cachedAt: now,
    };
  } else if (weatherSettled.status === 'rejected') {
    console.error('widget-stats weather error:', weatherSettled.reason.message);
  }

  if (psiSettled.status === 'fulfilled' && psiSettled.value) {
    const readings = psiSettled.value.data.items[0].readings.psi_twenty_four_hourly;
    const values = Object.values(readings);
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    cityCache.psi = { value: { value: avg, level: psiLevel(avg) }, cachedAt: now };
  } else if (psiSettled.status === 'rejected') {
    console.error('widget-stats psi error:', psiSettled.reason.message);
  }

  if (nowcastSettled.status === 'fulfilled' && nowcastSettled.value) {
    const forecasts = nowcastSettled.value.data.items[0].forecasts;
    let worst = { severity: -1, ja: '晴れ' };
    for (const f of forecasts) {
      const c = classifyNowcast(f.forecast);
      if (c.severity > worst.severity) worst = c;
    }
    cityCache.nowcast = { value: { text: worst.ja }, cachedAt: now };
  } else if (nowcastSettled.status === 'rejected') {
    console.error('widget-stats nowcast error:', nowcastSettled.reason.message);
  }

  if (dengueSettled.status === 'fulfilled' && dengueSettled.value) {
    const features = dengueSettled.value.features || [];
    const clusterCount = features.length;
    const totalCases = features.reduce((sum, f) => sum + (f.properties.CASE_SIZE || 0), 0);
    cityCache.dengue = { value: { clusterCount, totalCases, level: dengueLevel(clusterCount) }, cachedAt: now };
  } else if (dengueSettled.status === 'rejected') {
    console.error('widget-stats dengue error:', dengueSettled.reason.message);
  }

  widgetStatsCache.set(city, cityCache);

  const result = {};
  if (cityCache.exchangeRate) result.exchangeRate = cityCache.exchangeRate.value;
  if (cityCache.weather) result.weather = cityCache.weather.value;
  if (cityCache.psi) result.psi = cityCache.psi.value;
  if (cityCache.nowcast) result.nowcast = cityCache.nowcast.value;
  if (cityCache.dengue) result.dengue = cityCache.dengue.value;
  res.json(result);
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

// GET /api/calendar?city=sg&year=YYYY — カレンダー画面用（祝日・主要行事・学校休暇を1年分まとめて返す。実イベントは件数過多のため対象外）
app.get('/api/calendar', (req, res) => {
  try {
    const city = resolveCity(req);
    const year = req.query.year || new Date().getFullYear().toString();
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const result = [];

    // 手動キュレーションデータ（祝日・主要行事・季節イベント・締切）
    try {
      const curated = JSON.parse(fs.readFileSync(calendarEventsPath(city), 'utf8'));
      for (const item of curated.items || []) {
        const end = item.endDate || item.date;
        if (monthOverlap(item.date, end, yearStart, yearEnd)) {
          result.push({
            id: item.id, category: item.category, date: item.date, endDate: item.endDate,
            name: item.name, note: item.note, confirmed: item.confirmed,
          });
        }
      }
    } catch (e) { /* ファイル未作成の場合は無視 */ }

    // 学校休暇（school-calendar.json＝日本人学校(SIJS)の休暇をcategory:'school-vacation'として正規化。
    // シンガポール現地校(MOE)の休暇はcalendar-events.json側に直接収録し、ここでは名称に「日本人学校」と付けて区別する）
    try {
      const school = JSON.parse(fs.readFileSync(calendarPath(city), 'utf8'));
      for (const v of school.vacations || []) {
        if (monthOverlap(v.start, v.end, yearStart, yearEnd)) {
          result.push({
            id: `school-${v.start}`, category: 'school-vacation', date: v.start, endDate: v.end,
            name: `日本人学校: ${v.name}`, note: null, confirmed: true,
          });
        }
      }
    } catch (e) { /* ファイル未作成の場合は無視 */ }

    result.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/debug-log — 実機デバッグ用ログ収集（原因特定後に削除すること）
app.post('/api/debug-log', (req, res) => {
  const line = JSON.stringify({ receivedAt: new Date().toISOString(), ...req.body }) + '\n';
  fs.appendFile(path.join(__dirname, 'logs', 'debug-nav.log'), line, () => {});
  res.json({ ok: true });
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

// ─────────────────────────────────────────────
// LINE Bot ヘルパー
// ─────────────────────────────────────────────

const LINE_GUIDE_MESSAGE = {
  type: 'flex',
  altText: '📋 SG在住Navi｜イベント投稿の使い方',
  contents: {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FDF0E6',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: '🌴 SG在住Navi', weight: 'bold', size: 'lg', color: '#C8804A' },
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
      system: `あなたは${cityConf.nameJa}在住の日本人向けおでかけアプリ「SG在住Navi」のイベント登録アシスタントです。
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
- tips: 日本語ヒント2〜3点の配列（各26文字以内）
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
          required: ['store', 'type', 'emoji', 'who', 'age', 'style', 'major_score', 'content', 'tips', 'period', 'start_date', 'end_date', 'location', 'area'],
          properties: {
            store:      { type: 'string' },
            type:       { type: 'string', enum: ['event', 'gourmet', 'sale', 'opening'] },
            emoji:      { type: 'string' },
            who:        { type: 'array', items: { type: 'string' } },
            age:        { type: 'array', items: { type: 'string' } },
            style:      { type: 'array', items: { type: 'string' } },
            major_score: { type: 'number' },
            content:    { type: 'string' },
            tips:       { type: 'array', items: { type: 'string' } },
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
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: userId, messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[LINE push] ${res.status} ${res.statusText} — ${body}`);
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
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

  // LINE requires absolute HTTPS URLs for images
  const hasImage = !!(event.image && /^https:\/\//i.test(event.image));

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
          draft.fetched_at  = new Date().toISOString();
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
// AUTH ROUTES（Google Sign-In。設計書20/35/36、今回はGoogle Sign-Inのみ実装。Apple・予定表紐づけは次回）
// ─────────────────────────────────────────────

// POST /api/auth/google — Google idToken を検証し、自前JWTを発行する
// iOS版（GOOGLE_IOS_CLIENT_ID）・Web版（GOOGLE_WEB_CLIENT_ID）どちらのクライアントIDが発行したトークンでも検証を通す
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ error: 'idToken required' });

    const audience = [GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID].filter(Boolean);
    if (audience.length === 0) {
      console.error('auth/google: GOOGLE_WEB_CLIENT_ID / GOOGLE_IOS_CLIENT_ID が未設定です');
      return res.status(500).json({ error: 'server not configured' });
    }

    const ticket = await googleOAuthClient.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    const sub = payload?.sub;
    if (!sub) return res.status(401).json({ error: 'invalid token' });

    // 認証情報最小化方針: email/name/picture等は一切保存・利用しない。sub のみ使用
    const user = await upsertUser('google', sub);
    const token = issueAppJwt(user.userId);
    res.json({ token, userId: user.userId });
  } catch (e) {
    console.error('auth/google error:', e.message);
    res.status(401).json({ error: 'verification failed' });
  }
});

// GET /api/auth/me — 自前JWTを検証し、ユーザー情報（userId/provider/createdAt のみ）を返す
app.get('/api/auth/me', requireAppAuth, (req, res) => {
  const users = loadUsers();
  const user = users.find(u => u.userId === req.authUserId);
  if (!user) return res.status(401).json({ error: 'user not found' });
  res.json({ userId: user.userId, provider: user.provider, createdAt: user.createdAt });
});

// DELETE /api/auth/me — アカウント削除（設計書65）。ユーザーレコード・予定表バックアップを削除し、
// 公開コースの authorId は匿名化（null）する。冪等: 対象レコードが既に無くても200を返す
app.delete('/api/auth/me', requireAppAuth, async (req, res) => {
  const userId = req.authUserId;
  try {
    // 1. data/users.json からレコードを削除（冪等: 既に無くても成功扱い）
    await withFileLock(USERS_PATH, () => {
      const users = loadUsers();
      const next = users.filter(u => u.userId !== userId);
      saveUsers(next);
    });

    // 2. data/user-plans/{userId}.json を削除（存在すれば）
    const fp = getUserPlansFilePath(userId);
    if (fp && fs.existsSync(fp)) {
      await withFileLock(fp, () => {
        try { fs.unlinkSync(fp); } catch (_) {}
      });
    }

    // 3. 全都市のコミュニティコースの authorId を匿名化（null化）
    for (const city of ['sg', 'bkk', 'syd']) {
      const cPath = path.join(__dirname, 'data', city, 'community-courses.json');
      if (!fs.existsSync(cPath)) continue;
      await withFileLock(cPath, () => {
        const courses = JSON.parse(fs.readFileSync(cPath, 'utf8'));
        let changed = false;
        for (const c of courses) {
          if (c.authorId === userId) { c.authorId = null; changed = true; }
        }
        if (changed) fs.writeFileSync(cPath, JSON.stringify(courses, null, 2));
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/auth/me error:', e.message);
    res.status(500).json({ error: 'delete failed' });
  }
});

// ─────────────────────────────────────────────
// Sign in with Apple（設計書44。iOS版はidentityTokenを直接POST、Web版はresponse_mode:'form_post'経由のcallback）
// ─────────────────────────────────────────────

// Apple idToken を検証し upsertUser する共通コアロジック（iOS/Web両経路から呼ぶ）
async function verifyAppleTokenAndUpsert(identityToken) {
  const audience = [APPLE_APP_ID, APPLE_SERVICE_ID].filter(Boolean);
  const payload = await appleSignin.verifyIdToken(identityToken, { audience, ignoreExpiration: false });
  const sub = payload?.sub;
  if (!sub) throw new Error('invalid apple token: no sub');
  // 認証情報最小化方針: email等は一切保存・利用しない。sub のみ使用
  const user = await upsertUser('apple', sub);
  return user;
}

// POST /api/auth/apple — iOS版ネイティブSign in with AppleのidentityTokenを検証し、自前JWTを発行する
app.post('/api/auth/apple', async (req, res) => {
  try {
    const { identityToken } = req.body || {};
    if (!identityToken) return res.status(400).json({ error: 'identityToken required' });
    if (!APPLE_AUTH_ENABLED) {
      console.error('auth/apple: APPLE_SERVICE_ID / APPLE_APP_ID が未設定です');
      return res.status(500).json({ error: 'server not configured' });
    }
    const user = await verifyAppleTokenAndUpsert(identityToken);
    const token = issueAppJwt(user.userId);
    res.json({ token, userId: user.userId });
  } catch (e) {
    console.error('auth/apple error:', e.message);
    res.status(401).json({ error: 'verification failed' });
  }
});

// GET /api/auth/apple/state — Web版CSRF対策用のワンタイムstateを発行する
app.get('/api/auth/apple/state', (req, res) => {
  res.json({ state: issueAppleAuthState() });
});

// POST /api/auth/apple/callback — Web版 response_mode:'form_post' のリダイレクト先。
// AppleサーバーがブラウザのフルページPOSTでここに戻ってくる。JSON応答ではなくHTML中継でJWTをURLフラグメント経由で渡す
app.post('/api/auth/apple/callback', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { id_token, state } = req.body || {};
    if (!state || !verifyAndConsumeAppleAuthState(state)) {
      return res.redirect('https://dosuru.app/?auth_error=state_mismatch');
    }
    if (!id_token) return res.redirect('https://dosuru.app/?auth_error=no_token');
    if (!APPLE_AUTH_ENABLED) {
      console.error('auth/apple/callback: APPLE_SERVICE_ID / APPLE_APP_ID が未設定です');
      return res.redirect('https://dosuru.app/?auth_error=server_not_configured');
    }
    const user = await verifyAppleTokenAndUpsert(id_token);
    const token = issueAppJwt(user.userId);
    res.send(`<script>location.replace('https://dosuru.app/#auth_token=${token}');</script>`);
  } catch (e) {
    console.error('auth/apple/callback error:', e.message);
    res.redirect('https://dosuru.app/?auth_error=verification_failed');
  }
});

// ─────────────────────────────────────────────
// PUSH NOTIFICATIONS
// ─────────────────────────────────────────────
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push-subscribe', async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'invalid' });
  await withFileLock(PUSH_SUBS_PATH, () => {
    const subs = loadPushSubs();
    const idx = subs.findIndex(s => s.endpoint === subscription.endpoint);
    if (idx >= 0) subs[idx] = subscription;
    else subs.push(subscription);
    savePushSubs(subs);
  });
  res.json({ ok: true });
});

app.delete('/api/push-subscribe', async (req, res) => {
  const { endpoint } = req.body;
  await withFileLock(PUSH_SUBS_PATH, () => {
    savePushSubs(loadPushSubs().filter(s => s.endpoint !== endpoint));
  });
  res.json({ ok: true });
});

// ─── iOS（APNs）向け購読登録・解除（既存Web Pushエンドポイントとは完全に分離） ───
app.post('/api/push-subscribe-ios', async (req, res) => {
  const { deviceToken } = req.body;
  if (!deviceToken) return res.status(400).json({ error: 'invalid' });
  await withFileLock(PUSH_SUBS_PATH, () => {
    const subs = loadPushSubs();
    const idx = subs.findIndex(s => s.platform === 'ios' && s.deviceToken === deviceToken);
    const entry = { platform: 'ios', deviceToken, registeredAt: new Date().toISOString() };
    if (idx >= 0) subs[idx] = entry;
    else subs.push(entry);
    savePushSubs(subs);
  });
  res.json({ ok: true });
});

app.delete('/api/push-subscribe-ios', async (req, res) => {
  const { deviceToken } = req.body;
  await withFileLock(PUSH_SUBS_PATH, () => {
    savePushSubs(loadPushSubs().filter(s => !(s.platform === 'ios' && s.deviceToken === deviceToken)));
  });
  res.json({ ok: true });
});

app.post('/api/notify-events-updated', requireAdminSecret, async (req, res) => {
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
// USER PLANS BACKUP（個人予定表のログインユーザー同期＋ゼロ知識暗号化バックアップ、設計書54）
// サーバーは salt（非秘密のPBKDF2ソルト）と encryptedData（暗号文）のみを保持し、
// customPlans/eventPlansの平文は一切扱わない・検証もしない（暗号文のためパースも不可能）。
// ─────────────────────────────────────────────
const USER_PLANS_DIR = path.join(__dirname, 'data', 'user-plans');
if (!fs.existsSync(USER_PLANS_DIR)) fs.mkdirSync(USER_PLANS_DIR, { recursive: true });

function getUserPlansFilePath(userId) {
  // userId は upsertUser() が 'usr_' + hex24 で発行する既知フォーマットのみ許可（パストラバーサル対策）
  if (!/^usr_[a-f0-9]{24}$/.test(userId)) return null;
  return path.join(USER_PLANS_DIR, `${userId}.json`);
}

app.get('/api/user-plans/me', requireAppAuth, (req, res) => {
  const fp = getUserPlansFilePath(req.authUserId);
  if (!fp) return res.status(400).json({ error: 'invalid user' });
  if (!fs.existsSync(fp)) {
    return res.json({ userId: req.authUserId, salt: null, encryptedData: null, updatedAt: null });
  }
  try {
    res.json(JSON.parse(fs.readFileSync(fp, 'utf8')));
  } catch (e) {
    res.status(500).json({ error: 'read failed' });
  }
});

app.put('/api/user-plans/me', requireAppAuth, async (req, res) => {
  const fp = getUserPlansFilePath(req.authUserId);
  if (!fp) return res.status(400).json({ error: 'invalid user' });
  const { salt, encryptedData } = req.body;
  if (!salt || !encryptedData) return res.status(400).json({ error: 'salt and encryptedData are required' });
  try {
    await withFileLock(fp, () => {
      const data = {
        userId: req.authUserId,
        salt,
        encryptedData,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(fp, JSON.stringify(data, null, 2));
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'write failed' });
  }
});

// ─────────────────────────────────────────────
// Static HTML pages (about subdomain)
// ─────────────────────────────────────────────
app.get('/api/version', (req, res) => {
  const pkg = require('./ios-app/package.json');
  res.json({ version: pkg.version });
});

app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});
app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
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
