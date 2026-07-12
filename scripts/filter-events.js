// scripts/filter-events.js
// Claude APIで記事を判定・分類・日本語化して data/{city}/events.json に保存する
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const client = new Anthropic();

const CATEGORY_TARGET_RATIO = { event: 0.30, show: 0.20, gourmet: 0.30, sale: 0.10 };
const CATEGORY_CAP_BUFFER = 1.2;

const CITY_NAMES = { sg: 'シンガポール', bkk: 'バンコク', syd: 'シドニー' };
const CITY_LOCATIONS = { sg: 'Singapore', bkk: 'Bangkok', syd: 'Sydney' };
const CITY_AREAS = {
  sg:  '"Central"/"East"/"West"/"North"/"North-East"/"Island-wide"',
  bkk: '"Sukhumvit"/"Silom"/"Sathorn"/"Siam"/"Riverside"/"Thonglor"/"Ekkamai"/"Asok"/"On Nut"/"City-wide"',
  syd: '"CBD"/"Inner West"/"Eastern Suburbs"/"North Shore"/"Northern Beaches"/"Western Sydney"/"South"/"City-wide"',
};

const BATCH_SIZE = 10;
const ENRICH_BATCH_SIZE = 8;

// ─── X投稿のリンク先記事コンテンツ取得 ─────────────────────────────
async function fetchArticleContent(url) {
  if (!url || url.includes('x.com') || url.includes('twitter.com')) return null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
                      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
    const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const desc = (ogDescMatch?.[1] || metaDescMatch?.[1] || '').replace(/\s+/g, ' ').trim();

    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
                       || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const ogTitle = (ogTitleMatch?.[1] || title).replace(/\s+/g, ' ').trim();

    const parts = [ogTitle, desc].filter(Boolean);
    return parts.length > 0 ? parts.join(' — ').slice(0, 600) : null;
  } catch {
    return null;
  }
}

// ─── OGP画像取得 ──────────────────────────────────────────────────
async function fetchOgpImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                 || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
                 || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    const imgUrl = (ogMatch && ogMatch[1]) || (twMatch && twMatch[1]) || null;
    // Instagram CDNは期限切れ・動画URLになるため除外
    if (imgUrl && (imgUrl.includes('cdninstagram.com') || imgUrl.match(/\.(mp4|mov|webm)(\?|$)/i))) return null;
    return imgUrl;
  } catch {
    return null;
  }
}

// ─── Step1: Haikuでフィルタリングのみ ────────────────────────────
async function filterBatch(batch, cityKey = 'sg', categoryStats = null) {
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksLater = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);

  const articlesJson = JSON.stringify(
    batch.map((item, i) => ({
      index: i,
      title: item.title,
      description: item.description.slice(0, 800),
      article_content: item.articleContent || null,
      url: item.link,
      date: (() => { if (!item.pubDate) return null; const d = new Date(item.pubDate); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); })(),
      source: item.source,
      image: item.image || null,
    })),
    null,
    2
  );

  const cityName = CITY_NAMES[cityKey] || 'シンガポール';
  const cityLocation = CITY_LOCATIONS[cityKey] || 'Singapore';
  const cityAreas = CITY_AREAS[cityKey] || CITY_AREAS.sg;
  const scoreThreshold = 6;

  let categoryBalanceNote = '';
  if (categoryStats) {
    const total = Object.values(categoryStats).reduce((s, n) => s + n, 0);
    const thinCategories = [];
    const targets = { event: 0.30, show: 0.20, gourmet: 0.30, sale: 0.10 };
    for (const [type, target] of Object.entries(targets)) {
      const ratio = total > 0 ? (categoryStats[type] || 0) / total : 0;
      if (ratio < target * 0.70) thinCategories.push(type);
    }
    const dist = Object.entries(categoryStats).map(([t, n]) => `${t}:${n}件`).join(', ');
    if (thinCategories.length > 0) {
      categoryBalanceNote = `\n【カテゴリ補完】現在のDB分布: ${dist}。${thinCategories.join('・')}が目標比率を下回っています。これらカテゴリの記事はscore 5以上で採用してよい（品質は維持、具体性・期間限定性の基準は変えない）。他カテゴリは引き続きscore ${scoreThreshold}以上。`;
    }
  }

  const scoringCriteria = `採用基準（score ${scoreThreshold}以上のみ採用）：
- 日本文化・日本ブランドとの関連で加点
- ファミリー・子連れ対応で加点
- 発見感・意外性で加点（major_scoreが低いほど加点）
- 情報が具体的（日時・場所・価格）で加点${categoryBalanceNote}
- 【厳格化】以下は加点要素があっても採用を見送ること:
  - 既存の定番スポット・チェーン店の「よくある」プロモーション（同種の告知が頻繁に繰り返されているもの）
  - 情報の具体性が低い（日時・場所・価格のいずれか2つ以上が不明確）
  - 対象読者（在住日本人ファミリー・カップル）にとって新規性・独自性が乏しく、単なる日常商品紹介の域を出ないもの`;

  const instructionText = `あなたは${cityName}在住の日本人向けおでかけアプリのコンテンツ編集者です。
以下の記事を評価し、採用するもののみJSON配列で返してください。

【X（Twitter）投稿について】
source が "X /" で始まる記事はXのリストから取得したツイートです。
- article_content フィールドがある場合は、リンク先記事の内容です。title・description より優先して情報を読み取ってください。
- url フィールドが x.com を含まない場合は記事URLです。x.com を含む場合はツイートURLです。どちらの場合もそのまま url として使用してください。

typeの定義（厳密に守ること）：
- "event": 公園・大型施設・テーマパーク・動物園・図書館・モール内の体験型イベント・ワークショップ・学校オープンハウス・教育キャンプ・マーケット・バザー・マルシェなど「週末に行く場所・体験する・遊ぶ・学ぶ」を主目的とするもの。飲食・鑑賞は含めない。
- "show": コンサート・ライブ・演劇・ミュージカル・ダンスショー・サーカス・映画祭・アート展示・写真展・デジタルアート展・美術館の企画展など「パフォーマンスを観る・作品を鑑賞する」体験。チケット購入を伴う公演・入場料のある展覧会。「見る・観る・鑑賞する」が主目的。体験・遊ぶ系（ワークショップ・マーケット等）はeventへ。
- "gourmet": 食に関する【新メニュー・新商品の登場】や【フェア・フードイベントの開催】。「〇〇フェア開催」「新メニュー登場」「期間限定コラボ」「フードフェスティバル」など、新しい食体験を提供するもの。チェーン店・個人店問わず対象。通常営業・定番メニュー紹介など常設コンテンツは含めない。
- "sale": 食品・非食品を問わず【割引・プロモ・クーポン】が主目的の情報。「○%オフ」「1for1」「セット割引」「クーポン配布」「バウチャー」など、価格の優遇が主訴求のもの。新メニューや食のイベントではなく「安く買える・お得に食べられる」がメインの記事はsale。
- "opening": レストラン・カフェ・ショップ・施設・モール・アトラクションなどの【グランドオープン（初めて営業を開始する）】記事のみ。オープン日が明記されているもの。今後も継続して営業・運営される全く新しいお店・施設に限る。リニューアルオープン・新エリア追加・新ゾーン開設・改装再開業はopeningに含めない（eventまたはgourmetで分類）。

【重要】"other"/"market"/"edu" は使わない。上記5つのいずれかに必ず分類すること。
分類の判断基準（優先順位順に適用すること）：
1. 全く新しいお店・施設のグランドオープン（初めて営業開始）→ opening
2. リニューアル・改装再開業・新エリア追加は opening にしない → event またはgourmetで分類
3a. 割引・クーポン・プロモが主訴求（価格のお得感がメイン）かつグランドオープンでない → sale
3b. 新メニュー登場・フェア開催・食のイベントかつグランドオープンでない → gourmet
4. 「観る・鑑賞する」が主目的かつグランドオープンでない → show
5. 「体験する・遊ぶ・行く・学ぶ・マーケットを楽しむ」が主目的かつグランドオープンでない → event
6. 非食品の割引・セール・クーポンかつグランドオープンでない → sale

【重要】opening は他のすべてのtypeより優先する。食に関わる記事でも「割引・クーポン・プロモ」が主目的ならsale、「新メニュー登場・フェア開催」が主目的ならgourmet。

各採用記事について以下のフィールドのみ返すこと：
- index: 元の記事のインデックス番号（0始まり）
- store: 施設名・店名・イベント名（英語OK）
- type: "event" | "show" | "gourmet" | "sale" | "opening"
- who: ["family","couple","solo","group"] から該当するもの（複数可）
- age: ["all","baby","preschool","school"] から該当するもの（複数可）
- style: ["beginner","resident","local"] から該当するもの（複数可）
- score: 0-10（${cityName}在住の日本人にとっての週末おでかけとしての有益度）
- major_score: 1-5（1=超ニッチ発見感あり、5=誰でも知ってる定番）
- start_date: "YYYY-MM-DD"（不明な場合は今日 ${today}）
- end_date: "YYYY-MM-DD"（記事に終了日の記載がない場合は${twoWeeksLater}）
- area: ${cityAreas}
- emoji: 内容に合った絵文字1つ
- image: 記事のサムネイルURL（ない場合はnull）
- imageSearch: English keyword for Unsplash image search (2-4 words)
- genres: 以下のジャンルIDリストから当てはまるものを1〜3個選択。
  gourmet（食べる・飲む・食のフェアが主体）
  nature（公園・自然・アウトドア・植物が主体）
  art（アート展示・美術・文化・クラフトが主体）
  shopping（ショッピング・マーケット・セールが主体）
  workshop（体験・ワークショップ・DIY・ものづくりが主体）
  music（コンサート・ライブ・音楽イベントが主体）
  kids（子ども向け・ファミリー特化のイベントが主体）
  sports（スポーツ・フィットネス・アウトドアアクティビティが主体）
  theater（映画・演劇・ミュージカル・舞台が主体）
  learning（学習・教育・セミナー・知的体験が主体）
  wellness（スパ・ヨガ・ウェルネス・リラクゼーションが主体）
  festival（祭り・フェスティバル・マーケット・フードフェスが主体）
  animals（動物・ペット・水族館・動物園が主体）
  該当なし・不明な場合は空配列 [] を返すこと

${scoringCriteria}
- 不動産・金融・求人・保険・ビザ関連は採用しない
- storeが「Various」「TBC」「Multiple locations」「${cityLocation}」など場所が不特定・具体的でないものは採用しない
- 具体的な店名・施設名・イベント名が明記されていないものは採用しない
- まとめ記事（listicle）の場合は各スポット・イベントを個別エントリとして抽出してよい（最大5エントリまで）。同じ記事から複数エントリを生成する場合は同じ index を使うこと。
- 【重要】常設・通年営業の飲食店の通常メニュー紹介・グルメレビューは採用しない。「新メニュー」でも開催期間が明記されていなければ不採用（新規オープン記事はopeningとして採用する）
- openingの場合、end_dateは記事に終了日がなければstart_dateの1ヶ月後とすること
- 【日本人フィルタ】地元コミュニティ限定・民族向けイベント、現地代表チーム応援イベント、現地市民向け政治・コミュニティイベントは不採用。観光客歓迎・外国人が参加できるもの（コンサート・展示・フードフェス等）は採用すること

JSON配列のみ返すこと（前置き・説明・コードブロック不要）。不採用は配列に含めない。

記事:`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: `あなたは${cityName}在住の日本人向けコンテンツ編集者です。指示されたJSONのみを返してください。`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: instructionText,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: articlesJson,
          },
        ],
      },
    ],
  });

  const text = response.content[0].text.trim();
  const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

// ─── Step2: Sonnetで記事生成のみ ─────────────────────────────────
async function enrichBatch(batch, cityKey = 'sg') {
  const cityName = CITY_NAMES[cityKey] || 'シンガポール';

  const itemsJson = JSON.stringify(
    batch.map(({ filtered, original }) => ({
      index:        filtered._enrichPos,  // listicle分割で同一indexが重複しないよう通し番号を使用
      store:        filtered.store,
      type:         filtered.type,
      title:        original.title,
      description:  original.description.slice(0, 800),
      article_content: original.articleContent || null,
      source:       original.source,
    })),
    null,
    2
  );

  const instructionText = `あなたは${cityName}在住の日本人向けおでかけアプリのコンテンツライターです。
以下の各イベントについて、日本人向けの魅力的な説明文を生成してください。

各エントリについて以下のフィールドを返すこと：
- index: 受け取ったindexをそのまま返す
- title_ja: 日本語タイトル（20文字以内）
- content_ja: 日本人向け説明文（150〜200文字）。内容・特徴・なぜおすすめかを具体的に記述すること
- content_en: English description (100–150 chars). Concise, informative, highlights what makes it worth visiting.
- tips_ja: ひとことアドバイスの配列（2〜3点、各26文字以内）例: ["週末は混むので午前中がねらい目", "ベビーカー入場可", "要予約"]
- tips_en: English tips array (2–3 points, each under 38 chars) e.g. ["Go early on weekends to avoid crowds", "Stroller-friendly", "Booking required"]

JSON配列のみ返すこと（前置き・説明・コードブロック不要）。

イベント:`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    system: [
      {
        type: 'text',
        text: `あなたは${cityName}在住の日本人向けコンテンツライターです。指示されたJSONのみを返してください。`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: instructionText,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: itemsJson,
          },
        ],
      },
    ],
  });

  const text = response.content[0].text.trim();
  const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

// 旧関数名の互換エイリアス（filterAndEnrich から呼ばれる）
async function processBatch(batch, cityKey = 'sg', categoryStats = null) {
  return filterBatch(batch, cityKey, categoryStats);
}

// ─── カテゴリ上限削除ロジック ─────────────────────────────────
function enforceTypeCap(eventsPath) {
  const all = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  const nonOpening = all.filter(e => e.type !== 'opening');
  const baseTotal = nonOpening.length;
  if (baseTotal === 0) return;

  const today = new Date();
  const protectCutoff = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  let changed = false;
  let toKeep = [...all];

  for (const [type, ratio] of Object.entries(CATEGORY_TARGET_RATIO)) {
    const cap = Math.floor(baseTotal * ratio * CATEGORY_CAP_BUFFER);
    const ofType = toKeep.filter(e => e.type === type);
    if (ofType.length <= cap) continue;

    // 終了日が7日以内のものは保護
    const deletable = ofType
      .filter(e => !e.end_date || new Date(e.end_date) > protectCutoff)
      .sort((a, b) => (a.fetched_at || '').localeCompare(b.fetched_at || ''));
    const excess = ofType.length - cap;
    const toDelete = new Set(deletable.slice(0, excess).map(e => e.id || e.url));

    if (toDelete.size > 0) {
      console.log(`  [enforceTypeCap] ${type}: ${ofType.length}件 → ${ofType.length - toDelete.size}件（上限${cap}件、${toDelete.size}件削除）`);
      toKeep = toKeep.filter(e => e.type !== type || !toDelete.has(e.id || e.url));
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(eventsPath, JSON.stringify(toKeep, null, 2), 'utf8');
  }
}

// ─── メイン関数：フィルタリング＆保存 ──────────────────────────
async function filterAndSave(items, { eventsPath, cityKey = 'sg' } = {}) {
  if (!eventsPath) {
    eventsPath = path.join(__dirname, '..', 'data', cityKey, 'events.json');
  }

  // 外部リンクのある記事コンテンツを事前取得してdescriptionを補強
  const itemsWithExternalLink = items.filter(item => {
    if (!item.link) return false;
    if (item.link.includes('x.com') || item.link.includes('twitter.com')) return false;
    if (item.link.includes('instagram.com')) return false;
    return true; // すべての外部URLを対象に
  });
  if (itemsWithExternalLink.length > 0) {
    console.log(`\n  🔗 外部リンク記事を取得中... (${itemsWithExternalLink.length}件)`);
    await Promise.all(
      itemsWithExternalLink.map(async item => {
        const content = await fetchArticleContent(item.link);
        if (content) {
          item.articleContent = content;
          console.log(`    ✅ 取得: ${item.link.slice(0, 60)}...`);
        }
      })
    );
  }

  // 現在のカテゴリ分布を取得してバランス補正に使用
  const existingEvents = fs.existsSync(eventsPath) ? JSON.parse(fs.readFileSync(eventsPath, 'utf8')) : [];
  const categoryStats = { event: 0, show: 0, gourmet: 0, sale: 0, opening: 0 };
  for (const e of existingEvents) {
    if (categoryStats[e.type] !== undefined) categoryStats[e.type]++;
  }

  let totalAccepted = 0;
  let totalRejected = 0;

  const newItems = [];
  const sourceStats = {}; // { sourceName: { sent: N, accepted: N } }

  // ── Step1: Haikuで全件フィルタリング ──
  const filtered = []; // { filtered: {index,store,type,...}, original: item }
  const totalBatches = Math.ceil(items.length / BATCH_SIZE);

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`\n  [Filter ${batchNum}/${totalBatches}] ${batch.length}件をHaikuでフィルタリング中...`);

    for (const item of batch) {
      const src = item.source || 'Unknown';
      if (!sourceStats[src]) sourceStats[src] = { sent: 0, accepted: 0 };
      sourceStats[src].sent++;
    }

    try {
      const results = await filterBatch(batch, cityKey, categoryStats);
      totalRejected += batch.length - results.length;
      for (const r of results) {
        filtered.push({ filtered: r, original: batch[r.index] || {} });
      }
      if (i + BATCH_SIZE < items.length) await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error(`    ❌ フィルタエラー: ${e.message}`);
      totalRejected += batch.length;
    }
  }

  totalAccepted = filtered.length;
  console.log(`\n  📊 フィルタ結果: ${items.length}件 → 採用${totalAccepted}件`);

  // ── Step2: Sonnetで採用分のみ記事生成 ──
  // listicleで同一indexが重複する問題を防ぐため、filtered配列の通し番号を_enrichPosとして付与
  filtered.forEach((item, i) => { item.filtered._enrichPos = i; });

  const enriched = new Map(); // _enrichPos → { title_ja, content_ja, content_en, tips_ja, tips_en }
  const enrichBatches = [];
  for (let i = 0; i < filtered.length; i += ENRICH_BATCH_SIZE) {
    enrichBatches.push(filtered.slice(i, i + ENRICH_BATCH_SIZE));
  }

  for (let i = 0; i < enrichBatches.length; i++) {
    const batch = enrichBatches[i];
    console.log(`\n  [Enrich ${i + 1}/${enrichBatches.length}] ${batch.length}件をSonnetで記事生成中...`);
    try {
      const results = await enrichBatch(batch, cityKey);
      for (const r of results) enriched.set(r.index, r);
      if (i + 1 < enrichBatches.length) await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`    ❌ 記事生成エラー: ${e.message}`);
    }
  }

  // ── Step1+2のデータを結合してnewItemsに積む ──
  const defaultLocation = CITY_LOCATIONS[cityKey] || 'Singapore';
  const defaultArea = cityKey === 'bkk' ? 'Sukhumvit' : cityKey === 'syd' ? 'CBD' : 'Central';

  for (const { filtered: f, original } of filtered) {
    const enrich = enriched.get(f._enrichPos) || {};
    const id = `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const validType = ['event', 'show', 'gourmet', 'sale', 'opening'].includes(f.type) ? f.type : 'event';
    const endDate = validType === 'opening' ? oneMonthLater(f.start_date) : f.end_date;
    const period  = validType === 'opening' ? formatOpenDate(f.start_date) : formatPeriod(f.start_date, endDate);

    const item = {
      id,
      city:        cityKey,
      fetched_at:  new Date().toISOString().slice(0, 10),
      type:        validType,
      emoji:       f.emoji || '📌',
      image:       f.image || original.image || null,
      imageSearch: f.imageSearch || null,
      store:       f.store || '',
      who:         Array.isArray(f.who) ? f.who : ['family', 'couple', 'solo', 'group'],
      age:         Array.isArray(f.age) ? f.age : ['all'],
      style:       f.style || ['beginner'],
      major_score: f.major_score || 3,
      period,
      start_date:  f.start_date,
      end_date:    endDate,
      content:     enrich.content_ja || '',
      content_en:  enrich.content_en || '',
      tips:        Array.isArray(enrich.tips_ja) ? enrich.tips_ja : [],
      tips_en:     Array.isArray(enrich.tips_en) ? enrich.tips_en : [],
      location:    f.area || defaultLocation,
      area:        f.area || defaultArea,
      url:         original.link || '',
      source:      original.source || '',
      genres:      Array.isArray(f.genres) ? f.genres : [],
    };

    const src = original.source || 'Unknown';
    if (sourceStats[src]) sourceStats[src].accepted++;
    console.log(`    ✅ 採用: ${enrich.title_ja || f.store} (score: ${f.score}, type: ${f.type}, source: ${src})`);
    newItems.push(item);
  }

  // OGP画像の取得（imageがnullのものだけ）
  if (newItems.length > 0) {
    console.log(`\n  🖼 OGP画像取得中... (${newItems.length}件)`);
    await Promise.all(
      newItems.map(async item => {
        // 外部URLがある場合はOGP優先（Instagram CDNは期限切れになるため）
        const hasExternalUrl = item.url && !item.url.includes('instagram.com');
        const isInstagramCdn = item.image && item.image.includes('cdninstagram.com');
        if ((item.image === null || isInstagramCdn) && hasExternalUrl) {
          const ogp = await fetchOgpImage(item.url);
          if (ogp) item.image = ogp;
        }
      })
    );
  }

  // Unsplash画像補完（imageがまだnullで imageSearch があるもの）
  const stillNoImage = newItems.filter(item => !item.image && item.imageSearch);
  if (stillNoImage.length > 0) {
    console.log(`\n  🖼 Unsplash画像補完中... (${stillNoImage.length}件)`);
    const { fetchUnsplashImage } = require('./lib/unsplash');
    for (const item of stillNoImage) {
      const url = await fetchUnsplashImage(item.imageSearch);
      if (url) item.image = url;
      await new Promise(r => setTimeout(r, 300));
    }
  }

  if (newItems.length > 0) {
    const existing = fs.existsSync(eventsPath)
      ? JSON.parse(fs.readFileSync(eventsPath, 'utf8'))
      : [];
    fs.writeFileSync(eventsPath, JSON.stringify([...existing, ...newItems], null, 2), 'utf8');
    console.log(`\n  💾 ${eventsPath} に ${newItems.length}件追記`);
  }

  console.log(`\n  📊 Claude API結果: ${totalAccepted + totalRejected}件送信 → 採用${totalAccepted}件 / 不採用${totalRejected}件`);
  console.log('\n  📊 ソース別採用率:');
  for (const [src, stat] of Object.entries(sourceStats).sort((a, b) => b[1].sent - a[1].sent)) {
    const rate = stat.sent > 0 ? Math.round(stat.accepted / stat.sent * 100) : 0;
    console.log(`    ${stat.accepted > 0 ? '✅' : '  '} ${src}: ${stat.accepted}/${stat.sent}件 (${rate}%)`);
  }

  enforceTypeCap(eventsPath);
  return { accepted: totalAccepted, rejected: totalRejected, newItems, sourceStats };
}

// ─── ユーティリティ ──────────────────────────────────────────────
function oneMonthLater(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const year = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const month = (d.getMonth() + 1) % 12;
  const day = Math.min(d.getDate(), new Date(year, month + 1, 0).getDate());
  return new Date(year, month, day).toISOString().slice(0, 10);
}

function formatOpenDate(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)} OPEN`;
}

function formatPeriod(startDate, endDate) {
  if (!startDate || !endDate) return '';
  const [, sm, sd] = startDate.split('-');
  const [, em, ed] = endDate.split('-');
  const s = `${parseInt(sm)}/${parseInt(sd)}`;
  const e = `${parseInt(em)}/${parseInt(ed)}`;
  return s === e ? s : `${s}〜${e}`;
}

// 旧インターフェース互換
async function filterAndEnrich(events) {
  const results = [];
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    try {
      const processed = await processBatch(batch);
      processed.forEach(r => {
        const original = batch[r.index] || {};
        results.push({
          ...original,
          titleJa:    r.title_ja,
          type:       r.type,
          area:       r.area,
          emoji:      r.emoji,
          status:     'pending',
          isRelevant: true,
        });
      });
    } catch(e) {
      console.error(`バッチエラー: ${e.message}`);
    }
  }
  return results;
}

module.exports = { filterAndSave, filterAndEnrich };
