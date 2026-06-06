# Claude Code 変更指示書

## 概要
`filter-events.js` と `index.html` の変更、データリセット、cron実行を行う。
データ構造を統合し、カテゴリ分類を見直し、サムネイル画像取得を追加する。

---

## 0. 作業順序（必ずこの順で実施すること）

1. `filter-events.js` を修正
2. `index.html` を修正
3. `data/events.json` と `data/sales.json` を空配列（`[]`）でリセット
4. `node scripts/fetch-events.js` を手動実行してデータを取得・確認
5. cron を設定する

---

## 1. `scripts/filter-events.js` の変更

### 1-1. データ統合（event・sale を廃止 → events.json に一本化）

- **保存先を `events.json` のみに統一**する。`sales.json` への書き込みは削除。
- IDプレフィックスは `e_` に統一（`s_` は使わない）。
- `EVENTS_PATH` だけを使い、`SALES_PATH` の参照・読み書きはすべて削除する。

### 1-2. カテゴリ分類の変更

Claude API への prompt 内の `type` 定義を **以下の4カテゴリに変更**する：

| カテゴリ値 | 内容 |
|-----------|------|
| `event`   | Gardens by the Bayのような公園・大型会場・モール内イベント・テーマパーク・動物園・美術館・図書館など「週末に行く場所・体験」。飲食は除く |
| `gourmet` | レストラン・カフェ・フードコート・ホテルビュッフェ・期間限定メニュー・ハイティー・フードフェアなど飲食系すべて |
| `sale`    | スーパー・ファッション・家電・雑貨・モール全体のセール・割引・クーポン・キャッシュバック情報 |
| `other`   | 上記に当てはまらないもの |

**分類ルール（promptに以下をそのまま含めること）：**

```
typeの定義（厳密に守ること）：
- "event": Gardens by the Bayのような公園・大型施設・会場・テーマパーク・動物園・美術館・図書館・モール内の体験型イベントなど「週末に行く場所・体験」。飲食は絶対に含めない。
- "gourmet": 飲食店・カフェ・フードコート・ホテルレストランの通常営業・期間限定メニュー・テーマビュッフェ・フードフェア・ハイティーなど、「食べる・飲む」を主目的とするものはすべてgourmet。レストランで提供される限定メニューやフェアもgourmet。
- "sale": スーパー・ファッション・家電・雑貨・ドラッグストア・モール全体など小売店の割引・セール・クーポン・キャッシュバックはすべてsale。購入することが主目的のものはすべてsale。
- "other": 上記のいずれにも当てはまらないもの。

分類の判断基準（迷ったらこれで決める）：
- 「食べる・飲む」が主目的 → gourmet（期間限定・フェア・コラボメニューも含む）
- 「体験する・見る・遊ぶ・行く」が主目的 → event
- 「買う・割引で得をする」が主目的 → sale（食品スーパーのセールもsale）
- いずれでもない → other

【重要】食品メーカーやスーパーの割引・新商品はsale。飲食店の限定メニュー・フェアはgourmet。この2つを混同しないこと。
```

### 1-3. フィールド変更

既存の `type: "event"` / `type: "sale"` 分岐を **`type: "event" | "gourmet" | "sale" | "other"`** に変更。

`sale` 固有の `category` フィールド（`"food"/"mall"/"other"`）は**削除**。

保存する各アイテムのフィールドは以下に統一（すべてのtypeで同じ構造）：

```json
{
  "id": "e_xxxxx",
  "type": "event",
  "emoji": "🌸",
  "image": null,
  "store": "Gardens by the Bay",
  "who": ["family", "couple", "solo", "group"],
  "age": ["all"],
  "style": ["beginner", "resident"],
  "major_score": 2,
  "period": "5/28〜6/11",
  "start_date": "2026-05-28",
  "end_date": "2026-06-11",
  "content": "説明文",
  "tips": ["アドバイス1", "アドバイス2"],
  "location": "Central",
  "area": "Central",
  "url": "https://..."
}
```

### 1-4. サムネイル画像の取得（新機能）

`processBatch` の後、採用アイテムの `image` が `null` の場合に**OGP画像をURLから取得**する。
`filterAndSave` 内で採用アイテム確定後、`Promise.all` で並列取得する。

```javascript
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
    return (ogMatch && ogMatch[1]) || (twMatch && twMatch[1]) || null;
  } catch {
    return null;
  }
}
```

取得に失敗・タイムアウトしても処理を継続し、`image` は `null` のままにする。

---

## 2. `index.html` の変更

### 2-1. ボトムナビの変更（5→4アイテム）

「期間限定」メニューを廃止し「おでかけ」に統合する。

```
変更前: 🏠 おでかけ ｜ ⏳ 期間限定 ｜ 📌 ピン留め ｜ 📅 カレンダー ｜ ⚙️ 設定
変更後: 🏠 おでかけ ｜ 📌 ピン留め ｜ 📅 カレンダー ｜ ⚙️ 設定
```

- `id="nav-sale"` のナビアイテムを削除
- `id="screen-sale"` のセール画面（`<div class="screen" id="screen-sale">` ブロック全体）を削除
- `loadSaleData()`、`renderSaleList()`、`renderSaleCard()`、`setSaleFilter()`、`toggleSalePin()` 等のsale専用関数を削除
- `SALE_DATA` 変数を削除
- `switchNav` から `'sale'` を除外
- `loadSaleData()` の呼び出しを削除

### 2-2. カテゴリフィルターの追加

ホーム画面の `section-header` の**下**に追加：

```html
<div class="category-filter-row" id="category-filter-row">
  <button class="sale-filter-chip active" data-cat="all"     onclick="setCategoryFilter('all')">📋 すべて</button>
  <button class="sale-filter-chip" data-cat="event"          onclick="setCategoryFilter('event')">🗺 おでかけ</button>
  <button class="sale-filter-chip" data-cat="gourmet"        onclick="setCategoryFilter('gourmet')">🍽 グルメ</button>
  <button class="sale-filter-chip" data-cat="sale"           onclick="setCategoryFilter('sale')">🏷 セール情報</button>
  <button class="sale-filter-chip" data-cat="other"          onclick="setCategoryFilter('other')">✨ その他</button>
</div>
```

CSS追加：
```css
.category-filter-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  margin-bottom: 18px;
  padding-bottom: 2px;
}
.category-filter-row::-webkit-scrollbar { display: none; }
```

JS追加：
```javascript
let currentCategoryFilter = 'all';

function setCategoryFilter(cat) {
  currentCategoryFilter = cat;
  document.querySelectorAll('#category-filter-row .sale-filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.cat === cat);
  });
  renderEventCards();
}
```

`renderEventCards` の `filtered` 計算に条件を追加：
```javascript
const catMatch = currentCategoryFilter === 'all' || e.type === currentCategoryFilter;
return tabMatch && ageMatch && whoMatch && catMatch;
```

### 2-3. カードへのサムネイル画像表示

`renderEventCard` の `.card-image-area` 部分を変更：

```javascript
const imageAreaHtml = e.image
  ? `<div class="card-image-area" style="margin:12px -18px;">
       <img src="${e.image}" alt="${e.store || ''}"
            style="width:100%;height:170px;object-fit:cover;display:block;"
            onerror="this.parentElement.innerHTML='<div class=\\'card-image-bg ${bgClass}\\'>${e.emoji || '📍'}</div>'" />
     </div>`
  : `<div class="card-image-area" style="margin:12px -18px;">
       <div class="card-image-bg ${bgClass}">${e.emoji || '📍'}</div>
     </div>`;
```

### 2-4. カレンダーの変更

`buildCalendarEvents` から `SALE_DATA` の参照をすべて削除し、`EVENT_DATA` のみ使う。
バッジ色を `type` で分ける：

```javascript
// typeに応じてバッジクラスを選択
const badgeClass = e.type === 'gourmet' ? 'cal-count-gourmet'
                 : e.type === 'sale'    ? 'cal-count-sale'
                 : 'cal-count-event';
```

CSS追加：
```css
.cal-count-gourmet {
  background: var(--sage-pale);
  color: var(--sage);
}
```

### 2-5. `/api/sales` 参照の削除

`loadSaleData()` の `fetch('/api/sales')` 呼び出しごと関数を削除する。

---

## 3. データのリセット

以下のコマンドで既存データを空にする：

```bash
echo '[]' > data/events.json
echo '[]' > data/sales.json
```

`sales.json` は今後書き込まれないが、ファイル自体は残しておいてよい（サーバー側で `/api/sales` を返している場合のエラー防止のため）。

---

## 4. 動作確認のための手動実行

```bash
node scripts/fetch-events.js
```

実行後、`data/events.json` に `type` フィールドつきのデータが入っていることを確認する。
`gourmet` / `event` / `sale` が適切に分類されているかログで確認する。

---

## 5. cron の設定

### 毎日1回（午前3時）自動実行する設定

```bash
crontab -e
```

以下を追加（プロジェクトの絶対パスは環境に合わせて変更すること）：

```cron
0 3 * * * cd /path/to/project && node scripts/fetch-events.js >> logs/fetch-events.log 2>&1
```

### ログディレクトリがない場合は作成：

```bash
mkdir -p logs
```

### cron の確認：

```bash
crontab -l
```

### 注意事項：
- Node.js のフルパスが必要な環境では `which node` で確認し、絶対パスで指定する
  ```cron
  0 3 * * * cd /path/to/project && /usr/local/bin/node scripts/fetch-events.js >> logs/fetch-events.log 2>&1
  ```
- `.env` ファイルの `ANTHROPIC_API_KEY` が正しく設定されていることを確認してから cron を有効にする

---

## 変更ファイル一覧

| ファイル | 変更種別 |
|---------|---------|
| `scripts/filter-events.js` | 修正（カテゴリ再定義・統合・OGP取得追加） |
| `index.html` | 修正（ナビ統合・カテゴリフィルター追加・サムネイル表示・SALE_DATA削除） |
| `data/events.json` | リセット（`[]` で上書き） |
| `data/sales.json` | リセット（`[]` で上書き） |
