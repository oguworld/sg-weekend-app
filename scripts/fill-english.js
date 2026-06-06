#!/usr/bin/env node
// scripts/fill-english.js
// content_en / tips_en が空のイベントを Claude API で補完する
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic();
const EVENTS_PATH = path.join(__dirname, '..', 'data', 'events.json');
const BATCH_SIZE = 8;

async function fillEnglish() {
  const events = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
  const targets = events.filter(e => !e.content_en || !e.tips_en || e.tips_en.length === 0);
  console.log(`\n🌐 英語フィールド補完開始: ${targets.length}件\n`);

  const updated = [...events];

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(targets.length / BATCH_SIZE);
    console.log(`  [バッチ ${batchNum}/${totalBatches}] ${batch.length}件を処理中...`);

    const prompt = `You are an editor for a Singapore weekend activity app targeting Japanese expats.
For each item below, generate English descriptions based on the Japanese content.

Rules:
- content_en: 100–150 chars. Concise, engaging, highlights what makes it worth visiting.
- tips_en: Array of 2–3 tips, each under 60 chars. Practical advice for visitors.

Return ONLY a JSON array, no explanation:
[{ "id": "xxx", "content_en": "...", "tips_en": ["...", "..."] }, ...]

Items:
${JSON.stringify(batch.map(e => ({
  id: e.id,
  store: e.store,
  type: e.type,
  content_ja: e.content,
  tips_ja: e.tips,
})), null, 2)}`;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: 'Return only the requested JSON array.',
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
        updated[idx] = { ...updated[idx], content_en: r.content_en, tips_en: r.tips_en };
        console.log(`    ✅ ${updated[idx].store}`);
      }

      if (i + BATCH_SIZE < targets.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      console.error(`    ❌ バッチエラー: ${e.message}`);
    }
  }

  fs.writeFileSync(EVENTS_PATH, JSON.stringify(updated, null, 2), 'utf8');
  console.log(`\n✅ 完了: events.json を更新しました\n`);
}

fillEnglish().catch(e => {
  console.error('❌ エラー:', e.message);
  process.exit(1);
});
