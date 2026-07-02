// scripts/fill-genres.js
// genres フィールドが空のイベントにジャンルタグを遡及付与するスクリプト
// 使い方: node scripts/fill-genres.js [--city=sg] [--dry-run]
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const cityArg = (args.find(a => a.startsWith('--city=')) || '--city=sg').split('=')[1];
const isDryRun = args.includes('--dry-run');

const BATCH_SIZE = 20;

async function fillGenres(city) {
  const eventsPath = path.join(__dirname, '..', 'data', city, 'events.json');
  if (!fs.existsSync(eventsPath)) {
    console.error(`[fill-genres] ファイルが見つかりません: ${eventsPath}`);
    process.exit(1);
  }

  const all = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));

  // genres が undefined / null / 空配列 [] のものを対象にする
  const noGenres = all.filter(e => !Array.isArray(e.genres) || e.genres.length === 0);

  console.log(`[fill-genres] ${city}: 全${all.length}件中、ジャンル未設定 ${noGenres.length}件`);

  if (noGenres.length === 0) {
    console.log('[fill-genres] 処理対象なし');
    return;
  }

  if (isDryRun) {
    console.log('[dry-run] 対象イベント:');
    noGenres.forEach((e, i) => console.log(`  ${i}: ${e.store || e.id} (type: ${e.type})`));
    console.log('[dry-run] Claude API 呼び出しをスキップします。');
    return;
  }

  const client = new Anthropic();
  const systemPrompt = `あなたはイベント分類の専門家です。指示されたJSONのみを返してください。`;

  const instructionText = `以下のイベント一覧について、各イベントに当てはまるジャンルIDを選んでください。

ジャンル定義:
gourmet: 食べる・飲む・食のフェアが主体
nature: 公園・自然・アウトドア・植物が主体
art: アート展示・美術・文化・クラフトが主体
shopping: ショッピング・マーケット・セールが主体
workshop: 体験・ワークショップ・DIY・ものづくりが主体
music: コンサート・ライブ・音楽イベントが主体
kids: 子ども向け・ファミリー特化のイベントが主体
sports: スポーツ・フィットネス・アウトドアアクティビティが主体
theater: 映画・演劇・ミュージカル・舞台が主体
learning: 学習・教育・セミナー・知的体験が主体
wellness: スパ・ヨガ・ウェルネス・リラクゼーションが主体
festival: 祭り・フェスティバル・マーケット・フードフェスが主体
animals: 動物・ペット・水族館・動物園が主体

各イベントについて1〜3個のジャンルIDを選ぶこと。該当なし・不明は []。
JSON配列のみ返すこと（説明文不要）:
[{"index": 0, "genres": ["gourmet", "festival"]}, ...]

イベント:`;

  let updatedCount = 0;
  const totalBatches = Math.ceil(noGenres.length / BATCH_SIZE);

  for (let i = 0; i < noGenres.length; i += BATCH_SIZE) {
    const batch = noGenres.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`\n[fill-genres] バッチ ${batchNum}/${totalBatches}: ${batch.length}件処理中...`);

    const eventsJson = JSON.stringify(
      batch.map((e, idx) => ({
        index: idx,
        id: e.id,
        store: e.store || '',
        type: e.type || '',
        content: (e.content || '').slice(0, 200),
      })),
      null,
      2
    );

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: [
          {
            type: 'text',
            text: systemPrompt,
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
                text: eventsJson,
              },
            ],
          },
        ],
      });

      const text = response.content[0].text.trim();
      const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
      const match = clean.match(/\[[\s\S]*\]/);

      if (!match) {
        console.error(`  [バッチ ${batchNum}] JSONパース失敗。genres: [] でスキップ`);
        batch.forEach(e => { e.genres = []; });
        continue;
      }

      const results = JSON.parse(match[0]);
      for (const r of results) {
        if (r.index !== undefined && batch[r.index]) {
          batch[r.index].genres = Array.isArray(r.genres) ? r.genres : [];
          updatedCount++;
          console.log(`  ${batch[r.index].store || batch[r.index].id}: [${batch[r.index].genres.join(', ')}]`);
        }
      }

      // 結果が返ってこなかったイベントは空配列をセット
      batch.forEach((e, idx) => {
        if (!Array.isArray(e.genres)) e.genres = [];
      });
    } catch (err) {
      console.error(`  [バッチ ${batchNum}] エラー: ${err.message}。genres: [] でスキップ`);
      batch.forEach(e => { e.genres = []; });
    }

    if (i + BATCH_SIZE < noGenres.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // id をキーにマージして全件上書き保存
  const updatedById = {};
  for (const e of noGenres) updatedById[e.id] = e;

  const result = all.map(e => updatedById[e.id] ? updatedById[e.id] : e);
  fs.writeFileSync(eventsPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n[fill-genres] 完了: ${updatedCount}件のジャンルを補完しました`);
}

if (require.main === module) {
  fillGenres(cityArg).catch(e => {
    console.error('[fill-genres] エラー:', e.message);
    process.exit(1);
  });
}

module.exports = { fillGenres };
