# カテゴリ変更・日付再チェック 実装指示書

## 概要
- `other` カテゴリを廃止し `edu`（教育）カテゴリを追加
- `index.html` のフィルター・表示をすべて反映
- `filter-events.js` のプロンプトを更新
- 既存の `events.json` の開始日・終了日を一括再チェック・修正

---

## 1. `scripts/filter-events.js` の変更

### 1-1. typeの定義を変更

prompt内の `type` 定義を以下に差し替える：

```
typeの定義（厳密に守ること）：
- "event": Gardens by the Bayのような公園・大型施設・会場・テーマパーク・動物園・美術館・
  図書館・モール内の体験型イベントなど「週末に行く場所・体験」。飲食は絶対に含めない。
- "gourmet": 飲食店・カフェ・フードコート・ホテルレストランの通常営業・期間限定メニュー・
  テーマビュッフェ・フードフェア・ハイティーなど「食べる・飲む」を主目的とするものはすべてgourmet。
- "sale": スーパー・ファッション・家電・雑貨・ドラッグストア・モール全体など小売店の
  割引・セール・クーポン・キャッシュバックはすべてsale。
- "edu": 学校の体験入学・オープンハウス・語学キャンプ・サマーキャンプ・習い事の
  無料体験・キャンペーン・ワークショップ・子ども向け教育イベントなど「学ぶ・体験する」
  を主目的とするもの。

【重要】"other" は使わない。上記4つのいずれかに必ず分類すること。
分類に迷う場合：
- 「食べる・飲む」が主目的 → gourmet
- 「体験する・見る・遊ぶ・行く」が主目的 → event
- 「買う・割引で得をする」が主目的 → sale
- 「学ぶ・習う・体験入学」が主目的 → edu
```

### 1-2. 保存時の `other` フォールバックを変更

```javascript
// 変更前
type: r.type || 'event',

// 変更後
type: ['event', 'gourmet', 'sale', 'edu'].includes(r.type) ? r.type : 'event',
```

---

## 2. `index.html` の変更

### 2-1. カテゴリフィルターを変更

`other` ボタンを削除し `edu` ボタンを追加：

```html
<div class="category-filter-row" id="category-filter-row">
  <button class="sale-filter-chip active" data-cat="all"     onclick="setCategoryFilter('all')">📋 すべて</button>
  <button class="sale-filter-chip" data-cat="new"            onclick="setCategoryFilter('new')">🆕 新着</button>
  <button class="sale-filter-chip" data-cat="event"          onclick="setCategoryFilter('event')">🗺 おでかけ</button>
  <button class="sale-filter-chip" data-cat="gourmet"        onclick="setCategoryFilter('gourmet')">🍽 グルメ</button>
  <button class="sale-filter-chip" data-cat="sale"           onclick="setCategoryFilter('sale')">🏷 セール</button>
  <button class="sale-filter-chip" data-cat="edu"            onclick="setCategoryFilter('edu')">📚 教育</button>
</div>
```

### 2-2. カレンダーのバッジ色に `edu` を追加

```javascript
const badgeClass = e.type === 'gourmet' ? 'cal-count-gourmet'
                 : e.type === 'sale'    ? 'cal-count-sale'
                 : e.type === 'edu'     ? 'cal-count-edu'
                 : 'cal-count-event';
```

CSS追加：
```css
.cal-count-edu {
  background: #e8f4fd;
  color: #2980b9;
}
```

### 2-3. カードのカテゴリバッジ表示に `edu` を追加

カード内にtypeを表示している箇所があれば以下のラベルに対応：

```javascript
const typeLabel = {
  event:   '🗺 おでかけ',
  gourmet: '🍽 グルメ',
  sale:    '🏷 セール',
  edu:     '📚 教育',
}[e.type] || '🗺 おでかけ';
```

---

## 3. 既存 `data/events.json` の日付再チェック

以下のスクリプトを `scripts/recheck-dates.js` として新規作成し、実行する：

```javascript
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
        model: 'claude-sonnet-4-20250514',
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
```

### 実行コマンド

```bash
node scripts/recheck-dates.js
```

---

## 4. 作業順序

1. `filter-events.js` を修正
2. `index.html` を修正
3. `scripts/recheck-dates.js` を新規作成
4. `node scripts/recheck-dates.js` を実行して既存データの日付を修正
5. アプリで表示を確認

---

## 変更ファイル一覧

| ファイル | 変更種別 |
|---------|---------|
| `scripts/filter-events.js` | `other` 廃止・`edu` 追加・日付ルール適用済み |
| `index.html` | フィルター・カレンダー・カードバッジに `edu` 追加、`other` 削除 |
| `scripts/recheck-dates.js` | 新規作成（既存データの日付一括修正） |
| `data/events.json` | recheck-dates.js 実行後に更新される |
