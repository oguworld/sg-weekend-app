#!/usr/bin/env node
// 既存events.jsonのtips/tips_enを短く（1行）に一括更新する
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs   = require('fs');
const path = require('path');

const client = new Anthropic();
const CITIES = process.argv.find(a => a.startsWith('--city='))?.split('=')[1]?.split(',') || ['sg', 'bkk', 'syd'];
const MISSING_ONLY = process.argv.includes('--missing-only');
const BATCH_SIZE = 5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function retipBatch(events) {
  const items = events.map((e, i) => ({
    index: i,
    store: e.store || e.title || '',
    content: e.content || '',
    current_tips_ja: e.tips || [],
    current_tips_en: e.tips_en || [],
  }));

  const prompt = `以下のイベント情報について、tips_ja と tips_en を書き直してください。

【ルール】
- tips_ja: 2〜3点、各26文字以内、1行に収まる短さ。例: ["週末は混むので午前中がねらい目", "ベビーカー入場可", "要予約"]
- tips_en: 2〜3 points, each under 38 chars, one-liner. e.g. ["Go early on weekends to avoid crowds", "Stroller-friendly", "Booking required"]
- 内容の本質（混雑回避・持ち物・注意点など）は残しつつ、できるだけ短く簡潔に
- 元のtipsが既に短ければそのままでよい

イベント一覧:
${JSON.stringify(items, null, 2)}

レスポンスはJSONのみ。形式:
[
  { "index": 0, "tips_ja": [...], "tips_en": [...] },
  ...
]`;

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content[0].text.trim();
  const jsonStr = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(jsonStr);
}

async function processCity(city) {
  const eventsPath = path.join(__dirname, '..', 'data', city, 'events.json');
  if (!fs.existsSync(eventsPath)) { console.log(`[${city}] events.json なし、スキップ`); return; }

  const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  const targets = MISSING_ONLY ? events.filter(e => !e.tips || e.tips.length === 0) : events;
  console.log(`[${city}] ${targets.length}件処理開始${MISSING_ONLY ? '（tips未設定のみ）' : ''}`);

  const updated = [...events];
  const targetIndices = MISSING_ONLY ? events.map((e, i) => (!e.tips || e.tips.length === 0) ? i : -1).filter(i => i >= 0) : events.map((_, i) => i);

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    process.stdout.write(`  ${i + 1}〜${Math.min(i + BATCH_SIZE, events.length)}件目... `);

    try {
      const results = await retipBatch(batch);
      for (const r of results) {
        const idx = targetIndices[i + r.index];
        if (r.tips_ja && r.tips_ja.length) updated[idx].tips    = r.tips_ja;
        if (r.tips_en && r.tips_en.length) updated[idx].tips_en = r.tips_en;
      }
      console.log('完了');
    } catch (e) {
      console.log(`エラー: ${e.message}`);
    }

    if (i + BATCH_SIZE < events.length) await sleep(1000);
  }

  fs.writeFileSync(eventsPath, JSON.stringify(updated, null, 2), 'utf8');
  console.log(`[${city}] 保存完了\n`);
}

(async () => {
  for (const city of CITIES) {
    await processCity(city);
  }
  console.log('全都市完了');
})();
