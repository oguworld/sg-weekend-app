#!/usr/bin/env node
// scripts/recheck-dates.js
// 既存のevents.jsonの開始日・終了日をClaude APIで再チェック・修正する
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic();
const EVENTS_PATH = path.join(__dirname, '..', 'data', 'events.json');
const BATCH_SIZE = 10;

async function recheckDates() {
  const events = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\n📅 日付再チェック開始: ${events.length}件\n`);

  const updated = [...events];

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(events.length / BATCH_SIZE);
    console.log(`  [バッチ ${batchNum}/${totalBatches}] ${batch.length}件を処理中...`);

    const prompt = `以下のイベント・グルメ・セール情報の開始日と終了日を見直してください。

今日の日付: ${today}

各アイテムについて、store名・content（説明文）・現在のstart_date・end_dateをもとに、
以下のルールで正しい日付を推定してください：

【日付推定ルール】
- 説明文に具体的な日付が含まれている場合は必ずその日付を使う
- 期間限定メニュー・フェア・コラボ → 1〜2ヶ月の期間が多い
- モール・ショッピングのセール → 2〜4週間
- 常設スポット・施設 → start_dateはそのまま、end_dateを3ヶ月後に
- 単発イベント → 1週間程度
- 習い事・キャンプ・教育 → 1〜2ヶ月
- すでに終了している（end_dateが過去）ものはそのままにする
- start_dateが今日より大幅に未来（1ヶ月以上先）の場合は今日に修正する

以下のJSON配列のみ返すこと（前置き・説明不要）：
[{ "id": "xxx", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" }, ...]

アイテム:
${JSON.stringify(batch.map(e => ({
  id: e.id,
  store: e.store,
  type: e.type,
  content: (e.content || '').slice(0, 200),
  start_date: e.start_date,
  end_date: e.end_date,
})), null, 2)}`;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: '指示されたJSONのみを返してください。',
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].text.trim();
      const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (!match) continue;

      const results = JSON.parse(match[0]);
      for (const r of results) {
        const idx = updated.findIndex(e => e.id === r.id);
        if (idx === -1) continue;
        const old = updated[idx];
        if (old.start_date !== r.start_date || old.end_date !== r.end_date) {
          console.log(`    ✏️  ${old.store}: ${old.start_date}〜${old.end_date} → ${r.start_date}〜${r.end_date}`);
          updated[idx] = { ...old, start_date: r.start_date, end_date: r.end_date,
            period: formatPeriod(r.start_date, r.end_date) };
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

function formatPeriod(startDate, endDate) {
  if (!startDate || !endDate) return '';
  const [, sm, sd] = startDate.split('-');
  const [, em, ed] = endDate.split('-');
  const s = `${parseInt(sm)}/${parseInt(sd)}`;
  const e = `${parseInt(em)}/${parseInt(ed)}`;
  return s === e ? s : `${s}〜${e}`;
}

recheckDates().catch(e => {
  console.error('❌ エラー:', e.message);
  process.exit(1);
});
