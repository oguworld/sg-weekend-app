#!/usr/bin/env node
// scripts/recheck-types.js
// 既存イベントのtypeをClaude APIで再分類する（edu追加対応）
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic();
const EVENTS_PATH = path.join(__dirname, '..', 'data', 'events.json');
const BATCH_SIZE = 10;

async function recheckTypes() {
  const events = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
  console.log(`\n🔍 type再分類開始: ${events.length}件\n`);

  const updated = [...events];

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(events.length / BATCH_SIZE);
    console.log(`  [バッチ ${batchNum}/${totalBatches}] ${batch.length}件を処理中...`);

    const prompt = `以下のシンガポールのイベント・スポット情報のtypeを再分類してください。

typeの定義（厳密に守ること）：
- "event": 公園・大型施設・会場・テーマパーク・動物園・美術館・図書館・モール内の体験型イベントなど「週末に行く場所・体験」。飲食・教育は含めない。
- "gourmet": 飲食店・カフェ・フードコート・ホテルレストランの通常営業・期間限定メニュー・テーマビュッフェ・フードフェア・ハイティーなど「食べる・飲む」を主目的とするもの。
- "sale": スーパー・ファッション・家電・雑貨・小売店の割引・セール・クーポン・キャッシュバック。購入が主目的のもの。
- "edu": 学校の体験入学・オープンハウス・語学キャンプ・サマーキャンプ・習い事の無料体験・キャンペーン・ワークショップ・子ども向け教育プログラムなど「学ぶ・習う」を主目的とするもの。

分類の判断基準：
- 「食べる・飲む」が主目的 → gourmet
- 「体験する・見る・遊ぶ・行く」が主目的 → event
- 「買う・割引で得をする」が主目的 → sale
- 「学ぶ・習う・体験入学・教育プログラム」が主目的 → edu

現在のtypeが正しければそのまま返すこと。変更が必要な場合のみ変更すること。
"other"は使わない。

以下のJSON配列のみ返すこと（前置き・説明不要）：
[{ "id": "xxx", "type": "event|gourmet|sale|edu" }, ...]

アイテム:
${JSON.stringify(batch.map(e => ({
  id: e.id,
  store: e.store,
  current_type: e.type,
  content: (e.content || '').slice(0, 150),
})), null, 2)}`;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: '指示されたJSONのみを返してください。',
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].text.trim();
      const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (!match) { console.log('    ⚠️  JSON取得失敗'); continue; }

      const results = JSON.parse(match[0]);
      for (const r of results) {
        const idx = updated.findIndex(e => e.id === r.id);
        if (idx === -1) continue;
        const old = updated[idx];
        if (old.type !== r.type) {
          console.log(`    ✏️  ${old.store}: ${old.type} → ${r.type}`);
          updated[idx] = { ...old, type: r.type };
        }
      }

      if (i + BATCH_SIZE < events.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      console.error(`    ❌ バッチエラー: ${e.message}`);
    }
  }

  fs.writeFileSync(EVENTS_PATH, JSON.stringify(updated, null, 2), 'utf8');
  console.log(`\n✅ 完了: events.json を更新しました\n`);
}

recheckTypes().catch(e => {
  console.error('❌ エラー:', e.message);
  process.exit(1);
});
