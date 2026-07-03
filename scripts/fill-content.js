#!/usr/bin/env node
// 空contentのイベントにAIで説明文を補完するスクリプト
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs   = require('fs');
const path = require('path');

const client = new Anthropic();
const CITY   = process.argv.find(a => a.startsWith('--city='))?.split('=')[1] || 'sg';
const DRY    = process.argv.includes('--dry-run');

async function fetchText(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,})/i)?.[1]
            || html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,})/i)?.[1];
    if (og) return og.slice(0, 600);
    const body = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                     .replace(/<style[\s\S]*?<\/style>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s+/g, ' ').trim();
    return body.slice(0, 800);
  } catch { return null; }
}

async function generateContent(event, articleText) {
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `以下のイベント情報をもとに、日本語と英語の説明文を生成してください。

イベント名: ${event.store || event.title}
種別: ${event.type}
期間: ${event.period || ''}
参考テキスト: ${articleText || 'なし'}

【要件】
- content_ja: 日本人向け説明文（100〜180文字）。内容・特徴・なぜおすすめかを具体的に
- content_en: English description (80–130 chars). Concise and informative.

JSONのみ出力:
{ "content_ja": "...", "content_en": "..." }`,
    }],
  });
  const text = res.content[0].text.trim().replace(/^```json\s*/i, '').replace(/```$/,'');
  return JSON.parse(text);
}

async function main() {
  const eventsPath = path.join(__dirname, '../data', CITY, 'events.json');
  const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  const targets = events.filter(e => !e.content || e.content.trim().length < 10);

  console.log(`[fill-content] ${CITY}: 対象 ${targets.length}件${DRY ? ' (dry-run)' : ''}`);

  let updated = 0;
  for (const event of targets) {
    console.log(`  処理中: ${event.store || event.title}`);
    const articleText = event.url ? await fetchText(event.url) : null;
    try {
      const { content_ja, content_en } = await generateContent(event, articleText);
      if (!DRY) {
        const idx = events.findIndex(e => e.id === event.id);
        if (idx >= 0) {
          events[idx].content    = content_ja || '';
          events[idx].content_en = content_en || '';
        }
      }
      console.log(`  ✅ ${content_ja?.slice(0, 50)}...`);
      updated++;
    } catch (e) {
      console.log(`  ⚠️  失敗: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!DRY) {
    fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2));
    console.log(`\n✅ ${updated}件を更新しました`);
  } else {
    console.log(`\n[dry-run] ${updated}件を処理予定`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
