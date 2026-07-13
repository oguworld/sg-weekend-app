// scripts/generate-model-courses.js
// Claude API でモデルコースを生成して data/{city}/model-courses.json に保存する
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { fetchUnsplashImage } = require('./lib/unsplash');

const args = process.argv.slice(2);
const cityArg = (args.find(a => a.startsWith('--city=')) || '--city=sg').split('=')[1];
const isDryRun = args.includes('--dry-run');

const CITY_NAMES = { sg: 'シンガポール', bkk: 'バンコク', syd: 'シドニー' };

const SG_SYSTEM_PROMPT = `あなたはシンガポール在住日本人向け週末おでかけアプリのコースプランナーです。
様々な条件の組み合わせをカバーする8種類のモデルコースをJSON配列で生成してください。

各コースは以下のフィールドを含めること：
- id: "mc_sg_001" 〜 "mc_sg_008"（連番）
- title: コースタイトル（20文字以内・日本語）
- tagline: キャッチコピー（30文字以内・日本語）
- description: このコースの魅力（2〜3文・日本語・なぜおすすめか具体的に）
- imageSearch: 英語キーワード（2〜4語、Unsplash検索用）
- conditions: { "with": "子連れ|カップル|友人|ひとり|誰でも", "time": "午前のみ|午後のみ|終日", "mood": "のんびり|アクティブ|グルメ|ショッピング", "area": "中心部|東|西|南|北", "pace": "ゆったり|ふつう|めいっぱい" }
- spots: スポット配列（ペースに応じて ゆったり:2〜3件 / ふつう:4〜5件 / めいっぱい:6〜8件）
- authorId: "ai"
- authorName: "AI"
- isPublic: true
- likes: 0
- views: 0
- city: "sg"
- type: "preset"

各spotのフィールド：
- time: "HH:MM"
- name: スポット名（英語OK）
- type: "観光|グルメ|ショッピング|公園|文化|移動"
- duration: "XX分"
- description: おすすめポイント（40〜60文字・日本語）
- address: エリア・最寄り（英語OK）
- emoji: 適切な絵文字1文字

【注意】訪問時刻は施設の一般的な営業時間内に収まるよう配慮すること。公園・自然施設・宗教施設は早朝閉園や断続的な休止（礼拝等）があるため、早朝・夜間閉園間際の訪問は避けること。スポット名は実在が確信できる正式名称のみを使用し、確信が持てない場合は創作せず、より確実に実在するスポットを選ぶこと。

8コースは以下の条件をバランスよくカバーすること：
1. 子連れ×終日×アクティブ×中心部×ふつう
2. カップル×終日×のんびり×中心部×ゆったり
3. ひとり×午前のみ×グルメ×中心部×めいっぱい
4. 友人×終日×ショッピング×中心部×めいっぱい
5. 子連れ×午前のみ×のんびり×西×ゆったり
6. カップル×終日×グルメ×東×ふつう
7. 誰でも×終日×アクティブ×南×ふつう（セントーサ系）
8. ひとり×午後のみ×文化×中心部×ゆったり

JSON配列のみを返すこと（説明・コードブロック不要）。`;

const BKK_SYSTEM_PROMPT = `あなたはバンコク在住日本人向け週末おでかけアプリのコースプランナーです。
様々な条件の組み合わせをカバーする8種類のモデルコースをJSON配列で生成してください。

各コースは以下のフィールドを含めること：
- id: "mc_bkk_001" 〜 "mc_bkk_008"（連番）
- title: コースタイトル（20文字以内・日本語）
- tagline: キャッチコピー（30文字以内・日本語）
- description: このコースの魅力（2〜3文・日本語・なぜおすすめか具体的に）
- imageSearch: 英語キーワード（2〜4語、Unsplash検索用）
- conditions: { "with": "子連れ|カップル|友人|ひとり|誰でも", "time": "午前のみ|午後のみ|終日", "mood": "のんびり|アクティブ|グルメ|ショッピング", "area": "中心部|東|西|南|北", "pace": "ゆったり|ふつう|めいっぱい" }
- spots: スポット配列（ペースに応じて ゆったり:2〜3件 / ふつう:4〜5件 / めいっぱい:6〜8件）
- authorId: "ai"
- authorName: "AI"
- isPublic: true
- likes: 0
- views: 0
- city: "bkk"
- type: "preset"

各spotのフィールド：
- time: "HH:MM"
- name: スポット名（英語OK）
- type: "観光|グルメ|ショッピング|公園|文化|移動"
- duration: "XX分"
- description: おすすめポイント（40〜60文字・日本語）
- address: エリア・最寄り（英語OK）
- emoji: 適切な絵文字1文字

【注意】訪問時刻は施設の一般的な営業時間内に収まるよう配慮すること。公園・自然施設・宗教施設は早朝閉園や断続的な休止（礼拝等）があるため、早朝・夜間閉園間際の訪問は避けること。スポット名は実在が確信できる正式名称のみを使用し、確信が持てない場合は創作せず、より確実に実在するスポットを選ぶこと。

JSON配列のみを返すこと（説明・コードブロック不要）。`;

const SYD_SYSTEM_PROMPT = `あなたはシドニー在住日本人向け週末おでかけアプリのコースプランナーです。
様々な条件の組み合わせをカバーする8種類のモデルコースをJSON配列で生成してください。

各コースは以下のフィールドを含めること：
- id: "mc_syd_001" 〜 "mc_syd_008"（連番）
- title: コースタイトル（20文字以内・日本語）
- tagline: キャッチコピー（30文字以内・日本語）
- description: このコースの魅力（2〜3文・日本語・なぜおすすめか具体的に）
- imageSearch: 英語キーワード（2〜4語、Unsplash検索用）
- conditions: { "with": "子連れ|カップル|友人|ひとり|誰でも", "time": "午前のみ|午後のみ|終日", "mood": "のんびり|アクティブ|グルメ|ショッピング", "area": "中心部|東|西|南|北", "pace": "ゆったり|ふつう|めいっぱい" }
- spots: スポット配列（ペースに応じて ゆったり:2〜3件 / ふつう:4〜5件 / めいっぱい:6〜8件）
- authorId: "ai"
- authorName: "AI"
- isPublic: true
- likes: 0
- views: 0
- city: "syd"
- type: "preset"

各spotのフィールド：
- time: "HH:MM"
- name: スポット名（英語OK）
- type: "観光|グルメ|ショッピング|公園|文化|移動"
- duration: "XX分"
- description: おすすめポイント（40〜60文字・日本語）
- address: エリア・最寄り（英語OK）
- emoji: 適切な絵文字1文字

【注意】訪問時刻は施設の一般的な営業時間内に収まるよう配慮すること。公園・自然施設・宗教施設は早朝閉園や断続的な休止（礼拝等）があるため、早朝・夜間閉園間際の訪問は避けること。スポット名は実在が確信できる正式名称のみを使用し、確信が持てない場合は創作せず、より確実に実在するスポットを選ぶこと。

JSON配列のみを返すこと（説明・コードブロック不要）。`;

const CITY_PROMPTS = { sg: SG_SYSTEM_PROMPT, bkk: BKK_SYSTEM_PROMPT, syd: SYD_SYSTEM_PROMPT };

async function generateModelCourses(city) {
  const cityName = CITY_NAMES[city] || city;
  const systemPrompt = CITY_PROMPTS[city] || SG_SYSTEM_PROMPT;
  const client = new Anthropic();

  console.log(`\n[generate-model-courses] ${cityName} のモデルコースを生成中...`);

  if (isDryRun) {
    console.log('[dry-run] Claude API 呼び出しをスキップします。');
    console.log('[dry-run] 出力先:', `data/${city}/model-courses.json`);
    return;
  }

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    messages: [{ role: 'user', content: systemPrompt }],
  });

  const text = message.content[0].text.trim();
  const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) {
    console.error('[generate-model-courses] JSON配列が見つかりませんでした');
    console.error('Response text:', text.slice(0, 500));
    process.exit(1);
  }

  let rawJson = match[0];
  let courses;
  try {
    courses = JSON.parse(rawJson);
  } catch (parseErr) {
    console.error('[generate-model-courses] JSON解析エラー:', parseErr.message);
    // JSON repair: remove trailing comma issues
    rawJson = rawJson.replace(/,\s*([}\]])/g, '$1');
    courses = JSON.parse(rawJson);
  }
  console.log(`  ${courses.length} コースを生成しました。Unsplash画像を取得中...`);

  // Unsplash画像取得
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    const keyword = c.imageSearch || `${city} weekend`;
    console.log(`  [${i + 1}/${courses.length}] "${keyword}" を検索中...`);
    const imageUrl = await fetchUnsplashImage(keyword);
    if (imageUrl) {
      courses[i].imageUrl = imageUrl;
      console.log(`    -> 取得成功`);
    } else {
      console.log(`    -> 取得失敗（スキップ）`);
    }
    // Unsplash API レート制限対策
    if (i < courses.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  // createdAt を付与
  const now = new Date().toISOString();
  courses = courses.map(c => ({ ...c, createdAt: now }));

  // 保存
  const outPath = path.join(__dirname, '..', 'data', city, 'model-courses.json');
  fs.writeFileSync(outPath, JSON.stringify(courses, null, 2), 'utf8');
  console.log(`\n[generate-model-courses] 保存完了: ${outPath}`);
  console.log(`  合計: ${courses.length} コース`);
}

generateModelCourses(cityArg).catch(e => {
  console.error('[generate-model-courses] エラー:', e.message);
  process.exit(1);
});
