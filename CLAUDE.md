# おでかけNavi — CLAUDE.md

プロジェクトの全体像・技術構成・運用手順をまとめたリファレンスドキュメント。
Claude Code でこのプロジェクトを触る際はここを最初に読むこと。

---

## 1. アプリ概要とターゲットユーザー

### コンセプト
**「おでかけNavi」** は、東南アジア在住の日本人向け週末おでかけ・期間限定情報PWA（Progressive Web App）。

トップページのキャッチコピーは「週末どうする？」。
設定で都市を切り替えることで、SG・BKK・SYD に対応。
週末の予定を2〜3日前に確認・計画するシーンを想定している。

### ターゲットユーザー
- 👨‍👩‍👧‍👦 ファミリー（子連れ、0〜12歳）
- 👫 夫婦・カップル
- 🧑‍💼 単身駐在員
- 👥 グループ・友人

### 対応都市
| 都市 | コード | ステータス |
|------|--------|-----------|
| シンガポール | `sg` | 稼働中 |
| バンコク | `bkk` | 稼働中 |
| シドニー | `syd` | 稼働中 |
| クアラルンプール | `kl` | 停止中（data/kl/ は残存、server.js CITIES から除外済み） |

### URL構成
- `dosuru.app` — 現在は単一PWA、設定で都市を切り替え（`localStorage: app_city`）

### プラン構成
| プラン | 価格 | 状態 |
|--------|------|------|
| 無料 | ¥0 | 現在すべて無料で公開中 |
| プレミアム | ¥100/月（7日間無料トライアル付き） | 将来実装予定 |

> ⚠️ 課金機能（Stripe）は現在UIから非表示・コードはコメントアウト済み。
> 応援するセクションに Stripe 寄付ボタン（SGD 5）は設置済み。

---

## 2. 技術スタック

| レイヤー | 技術 | バージョン |
|---------|------|-----------|
| ランタイム | Node.js | v22.22.3 (nvm管理) |
| Webフレームワーク | Express | ^4.21.2 |
| 決済 | Stripe SDK | ^17.7.0（現在コメントアウト） |
| HTTP クライアント | axios | ^1.16.1 |
| 環境変数 | dotenv | ^16.4.7 |
| フロントエンド | Vanilla JS + HTML/CSS | — |
| PWA | Web App Manifest + Service Worker | — |
| フォント | Google Fonts (Noto Sans JP, Kaisei Opti) | — |
| プロセス管理 | PM2 | v7.0.1 |
| リバースプロキシ | nginx | dosuru.app に設定済み |
| SSL | Let's Encrypt (certbot) | dosuru.app に設定済み |
| DNS | Cloudflare | dosuru.app / www.dosuru.app → 194.233.92.41 |
| イベント取得 | rss-parser + Instagram Graph API | cron自動実行（月・金）。SGはRSS+Instagram、BKK・SYDはInstagram一本 |
| Instagram | Instagram Graph API（Business Discovery） | 都市別公式アカウントから投稿取得（直近4日間） |
| X自動投稿 | X API v2 OAuth 1.0a | post-to-x.js が毎日2回自動投稿（イベント紹介・機能紹介） |
| フィルタリング | Anthropic Claude API | claude-sonnet-4-6 |
| AIチャット | Anthropic Claude API | claude-sonnet-4-6（tool_use で respond ツール強制） |
| フィードバック通知 | LINE Messaging API Push | 稼働中 |
| LINE Bot | LINE Messaging API（Webhook） | URL/画像投稿 → 管理者承認フロー |
| 天気予報 | OpenWeatherMap API | 週末の天気を取得 |

### nvm PATH を通すコマンド（毎セッション冒頭で必要）
```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
```

---

## 3. サーバー情報

| 項目 | 値 |
|------|-----|
| VPS IP | `194.233.92.41` |
| ドメイン | `dosuru.app` |
| DNS | Cloudflare（設定済み・Proxied） |
| SSL | Let's Encrypt（設定済み） |
| ユーザー | masahiko |
| プロジェクトパス | `/home/masahiko/sg-weekend-app/` |

---

## 4. ファイル構成

```
sg-weekend-app/
│
├── server.js                # ★ Express バックエンド（全APIここ）
├── package.json
├── package-lock.json
├── .env                     # 環境変数（Gitに含めない）
├── generate-icons.js        # PWAアイコン生成スクリプト
├── nginx-sg-weekend.conf    # nginx設定（参考用）
├── update-nginx.sh          # nginx更新スクリプト
├── CLAUDE.md                # このファイル
│
├── scripts/
│   ├── fetch-events.js          # ★ RSS + Instagramからイベント情報を取得・保存（--city=sg|bkk|syd）
│   ├── filter-events.js         # ★ Claude APIで判定・日英両言語で生成・{city}/events.jsonに保存
│   ├── notify-fetch-summary.js  # 全都市の取得結果をまとめてLINE通知（月・金 8:00）
│   ├── post-to-line.js          # LINE投稿ドラフト生成（--city=all で全都市対応）
│   ├── post-to-x.js             # ★ X自動投稿（--type=event|feature --city=all）投稿後LINE通知
│   └── analyze-sources.js       # ★ ソース採用率・多様性分析・自動入れ替え（--city=all [--dry-run]）
│
├── data/
│   ├── sg/                  # シンガポール用データ
│   │   ├── events.json          # SGイベント・グルメ・セール情報
│   │   ├── school-calendar.json # SIJS準拠長期休暇（毎年4月更新）
│   │   ├── line-post-history.json  # LINEポスト履歴
│   │   └── pending-events.json  # LINE Bot承認待ち
│   ├── bkk/                 # バンコク用データ
│   │   ├── events.json          # BKKイベント・グルメ・セール情報
│   │   ├── school-calendar.json # バンコク日本人学校準拠長期休暇
│   │   ├── line-post-history.json
│   │   └── pending-events.json
│   ├── syd/                 # シドニー用データ
│   │   ├── events.json          # SYDイベント・グルメ・セール情報
│   │   ├── school-calendar.json # NSW学校カレンダー準拠長期休暇
│   │   ├── line-post-history.json
│   │   └── pending-events.json
│   ├── kl/                  # クアラルンプール用データ（停止中・データは残存）
│   ├── sources.json             # ★ 都市別ソース設定（active/paused）fetch-events.jsが読む
│   ├── source-candidates.json   # ★ 入れ替え候補ソールプール（contentFocus付き）
│   ├── source-history.json      # ★ ソース別採用率履歴（analyze-sources.jsが蓄積）
│   ├── pending-events.json  # LINE Bot（SG）グローバル承認キュー
│   └── x-post-history.json  # X投稿履歴（post-to-x.jsが管理）
│
├── logs/
│   ├── fetch-events-sg.log      # SG取り込みログ
│   ├── fetch-events-bkk.log     # BKK取り込みログ
│   ├── fetch-events-syd.log     # SYD取り込みログ
│   ├── fetch-summary-sg.json    # SG取得結果サマリー（notify-fetch-summaryが読む）
│   ├── fetch-summary-bkk.json   # BKK取得結果サマリー
│   ├── fetch-summary-syd.json   # SYD取得結果サマリー
│   ├── line-post.log            # LINEポストログ
│   ├── post-to-x.log            # X自動投稿ログ
│   └── source-analysis.log      # ソース分析ログ（analyze-sources.jsが書く）
│
├── public/
│   ├── index.html           # ★ PWA フロントエンド（全UIここ）
│   ├── manifest.json        # PWA マニフェスト
│   ├── sw.js                # Service Worker（現在 sg-weekend-v158）
│   └── icons/               # PWAアイコン（generate-icons.jsで生成）
│
└── node_modules/
```

> ⚠️ `data/events.json`（ルート直下）は廃止。都市別ディレクトリ `data/sg/` `data/kl/` で管理。

---

## 5. データ構造

### events.json（おでかけ・イベント・グルメ・セール、全type統合）

保存先: `data/{city}/events.json`（SG: `data/sg/events.json`、KL: `data/kl/events.json`）

```json
{
  "id": "e_1234567890_xxxxx",
  "city": "sg",
  "type": "event",
  "emoji": "🎡",
  "image": "https://example.com/thumb.jpg",
  "store": "Gardens by the Bay",
  "who": ["family", "couple"],
  "age": ["baby", "preschool", "school"],
  "style": ["beginner", "resident"],
  "major_score": 4,
  "period": "5/28〜6/15",
  "start_date": "2026-05-28",
  "end_date": "2026-06-15",
  "content": "週末限定の特別イベント...",
  "content_en": "Special weekend event at Gardens by the Bay...",
  "tips": ["週末は混むので開店直後がおすすめ", "ベビーカー入場可"],
  "tips_en": ["Arrive early to beat crowds", "Stroller-friendly"],
  "location": "18 Marina Gardens Dr",
  "area": "Central",
  "url": "https://www.gardensbythebay.com.sg",
  "source": "The Smart Local",
  "fetched_at": "2026-05-28"
}
```

### type の定義
| type | 内容 | 例 |
|------|------|-----|
| `event` | 公園・施設・体験型イベント・展示・マーケット・バザーなど「行く場所・体験」 | Gardens by the Bay, Snow City |
| `gourmet` | 飲食店・カフェ・期間限定メニュー・フードフェア | レストラン、ハイティー |
| `sale` | スーパー・ファッション・小売店の割引・セール | Cold Storage, Orchard Road |

> ⚠️ `edu` / `market` / `other` は廃止。上記3つのみ使用。

> ⚠️ `category` フィールドは events.json には**不要**（廃止）。
> `content_en` / `tips_en` は英語モード時に表示。ない場合は日本語にフォールバック。

---

## 6. フロントエンド（public/index.html）

### ⚠️ ファイル更新時の注意
```
✅ 正しい: /home/masahiko/sg-weekend-app/public/index.html
❌ 間違い: /home/masahiko/sg-weekend-app/index.html
```
index.html 更新時は sw.js の CACHE_NAME を必ずインクリメントすること。

```bash
# 現在のバージョン確認
grep CACHE_NAME ~/sg-weekend-app/public/sw.js

# バージョンアップ例（v102→v103）
sed -i "s/sg-weekend-v102/sg-weekend-v103/" ~/sg-weekend-app/public/sw.js
pm2 reload sg-weekend --update-env
```

### ボトムナビ（4タブ）
| 順番 | タブ | アイコン | 機能 |
|------|------|--------|------|
| 1 | おでかけ | 🏠 | `/api/events` から動的生成 |
| 2 | カレンダー | 📅 | 縦12ヶ月スクロール表示 |
| 3 | ピン留め | 📌 | ピン留めしたスポット・情報 |
| 4 | 設定 | ⚙️ | プロフィール・エリア・言語設定 |

> タブ切り替え時はカテゴリフィルターが「すべて」にリセットされる（`switchNav` 内で `setCategoryFilter('all')` を呼ぶ）。

### ヘッダー
- 右上に📤シェアボタンのみ
- タブ: 🌤 今週末 / 🌈 来週末 / 🏫 次の連休（休暇名に動的に変わる）
- 連休タブの表示: `textContent` で設定（`innerHTML` + `vertical-align` によるズレを避けるため）

### カテゴリフィルター（Section Header）
| value | ラベル |
|-------|--------|
| `event` | 🗺 イベント |
| `gourmet` | 🍽 グルメ・フェア |
| `sale` | 🏷 プロモ・お得 |
| `opening` | 🎊 新規オープン |

- **単一選択**（複数選択不可）。同じチップを再タップで解除。
- `starting` / `ending` チップは廃止（コメントアウト済み）。

Section Headerの右端には **🔥今週まで**（`#ending-filter-btn`）・**開始日ソート**（`#event-sort-btn`）・件数カウント（`result-count`）・リフレッシュボタン（`↻`）が横並び。

- 🔥今週まで: `setCategoryFilter('ending')` を呼ぶトグルボタン。カテゴリフィルターとのAND絞り込みが可能。
- `opening` タイプは「今週まで」フィルターおよび「あと◯日」バナーの対象外。

### おでかけカードのデータ取得
- `loadEventData()` で `/api/events` を取得
- `EVENT_DATA` にセットして `renderEventCards()` を呼ぶ
- `renderEventCard(e, i)` でカードを1件ずつ生成

`renderEventCard` が使うフィールド：
| フィールド | 用途 |
|-----------|------|
| `id` | カードID・ピン留めキー |
| `store` | カードタイトル |
| `emoji` | 絵文字・背景アイコン |
| `bgClass` | 背景グラデーションクラス（ない場合は `cafe` がデフォルト） |
| `tab` | タブフィルタ（weekend/nextweekend/holiday） |
| `who` | 誰向けバッジ（family/couple/solo/group） |
| `age` | 年齢フィルタ（all/baby/preschool/school） |
| `major_score` | 星の数（1〜5） |
| `location` | 場所 |
| `period` または `hours` | 期間・時間 |
| `content` / `content_en` | 説明文（言語設定に応じて切り替え） |
| `tips` / `tips_en` | ヒント配列（言語設定に応じて切り替え） |
| `url` | 公式サイトURL |

### カード共通仕様
- ピン留め📌・共有📤ボタンを中央寄せで統一
- 右上✕ボタンで非表示（localStorageに保存）
- 公式サイトは🌐アイコンのみ

### AI チャット（FAB）
- 右下にフローティングAIボタン（fab-ai）
- タップするとチャットシート（ボトムシート）が開く
- `POST /api/chat` に送信し、Claude が登録済みイベントの中からおすすめを回答
- 会話履歴は直近3往復（6メッセージ）を保持
- おすすめイベントは `event_ids` で返却 → カード形式で表示

### 多言語対応（i18n）
- `STRINGS` オブジェクトに `ja` / `en` の翻訳辞書を保持
- `getLang()` → localStorage `sg_lang`（デフォルト: `ja`）
- `t(key)` → 現在言語の文字列を返す
- `applyI18n()` → `[data-i18n]` / `[data-i18n-ph]` 属性の要素に一括適用
- `setLang(lang)` → 言語変更 + 全画面再描画
- イベントコンテンツ: 英語時は `content_en` / `tips_en` を優先、なければ日本語にフォールバック

---

## 7. 設定画面

### セクション順序
1. **プロフィール** — 🌏 都市（SG/KL）/ 誰と行く / 子どもの年齢（ファミリー選択時のみ表示）
2. **応援する** — Stripe 寄付ボタン（SGD 5）
3. **フィードバック** — LINE Push送信
4. **データ** — ピン留め削除・非表示リセット
5. **アプリ情報** — アプリ名・バージョン・言語トグル

### localStorage キー一覧
| キー | 型 | 内容 |
|------|----|------|
| キー | 型 | 内容 |
|------|----|------|
| `app_city` | 文字列 | 選択中の都市（"sg" / "kl"、デフォルト: "sg"） |
| `sg_who` | JSON配列 | 誰と行く（空＝全対象）※グローバル設定 |
| `sg_age` | 文字列 | 子どもの年齢（all/baby/preschool/school）※グローバル設定 |
| `sg_lang` | 文字列 | 表示言語（"ja" / "en"、デフォルト: "ja"）※グローバル設定 |
| `{city}_pins` | JSON | ピン留めデータ（都市別: `sg_pins`, `kl_pins`） |
| `{city}_hidden_events` | JSON配列 | 非表示にした期間限定情報ID（都市別） |
| `{city}_hidden_spots` | JSON配列 | 非表示にしたスポットID（都市別） |
| `sg_install_dismissed` | 文字列 | インストールバナーを閉じた記録（グローバル） |

> ⚠️ `sg_active`・`sg_style` は廃止済み。`data-area` は廃止済み。

---

## 8. バックエンドAPI（server.js）

### 有効なエンドポイント

全APIに `?city=sg|bkk|syd` クエリパラメータを受け付ける（省略時は `sg`）。

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/spots` | 公開済みスポット一覧 |
| GET | `/api/events?city=sg` | おでかけ・イベント情報。start/end_date から `tab` を動的付与 |
| GET | `/api/sales?city=sg` | セール情報（type==="sale" のみ） |
| GET | `/api/weather?city=sg` | 週末の天気予報（OpenWeatherMap、都市別座標） |
| GET | `/api/school-calendar?city=sg` | 長期休暇設定（都市別カレンダー） |
| POST | `/api/feedback` | フィードバック受信 → LINE Push送信 |
| POST | `/api/chat` | AIチャット（Claude API + tool_use）、bodyに `city` を含める |
| POST | `/api/line-webhook` | LINE Bot Webhook（SG専用） |
| GET | `/privacy` | プライバシーポリシーページ |

> `/api/events` は `tab` フィールドをサーバー側で計算して返す（今週末/来週末/それ以外=holiday）。
> 都市設定は `server.js` の `CITIES` 定数オブジェクトで管理。

### 無効化中（コードはコメントアウトで残す）
Stripe関連: `/api/create-checkout-session` / `/api/webhook` / `/api/subscription-status`
cron（server.js内）: 自動収集スケジューラ（手動実行に切り替え済み）

### `/api/chat` の仕組み
- `events.json` を読み込み、スリム化したコンテキストをシステムプロンプトに埋め込む
- `respond` ツールを `tool_choice: { type: 'tool', name: 'respond' }` で強制
- レスポンス: `{ message: string, eventIds: string[] }`
- 会話履歴: 最新6メッセージ（3往復）を `messages` に含める

---

## 9. 環境変数（.env）

```env
PORT=3000
ANTHROPIC_API_KEY=sk-ant-...          # Claude APIフィルタリング・AIチャット用
LINE_CHANNEL_ACCESS_TOKEN=...          # フィードバック・LINE Bot Push送信用（設定済み）
LINE_CHANNEL_SECRET=...                # LINE webhook署名検証用
LINE_USER_ID=...                       # 管理者のLINE User ID（承認フロー用）
OPENWEATHER_API_KEY=...                # 天気予報用
X_BEARER_TOKEN=...                     # X API v2 Bearer Token（現在未使用。投稿はOAuth 1.0aを使用）
X_API_KEY=...                          # X API v2 OAuth 1.0a（post-to-x.js 自動投稿用）
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
INSTAGRAM_APP_ID=...                   # Instagram Graph API（Business Discovery）
INSTAGRAM_APP_SECRET=...
INSTAGRAM_SHORT_TOKEN=...              # 短期トークン（定期更新が必要）
INSTAGRAM_PAGE_TOKEN=...               # 長期ページトークン（fetch-events.jsで使用）
INSTAGRAM_IG_USER_ID=...               # 自社IGユーザーID（Business Discoveryの起点）
# STRIPE_*=...（無効化中）
```

---

## 10. データ収集フロー（scripts/）

### 実行タイミング（crontab）

```
TZ=Asia/Singapore
# イベント取得: 月・金 7:00〜7:30 SGT（都市間15分ずらし、8:00の通知に間に合わせる）
0 7   * * 1,5  fetch-events.js --city=sg
15 7  * * 1,5  fetch-events.js --city=bkk
30 7  * * 1,5  fetch-events.js --city=syd
# 取得結果サマリー通知: 月・金 8:00 SGT（全都市まとめて1通）
0 8   * * 1,5  notify-fetch-summary.js
# ソース採用率・多様性分析・自動入れ替え: 月・金 8:30 SGT（全fetch完了後）
30 8  * * 1,5  node ~/sg-weekend-app/scripts/analyze-sources.js --city=all
# X自動投稿: 毎日0:01・0:02 SGTに起動、ランダム遅延で投稿（0時〜6時は除外）
1 0   * * *    sleep $(shuf -i 21600-50400 -n 1) && post-to-x.js --type=event --city=all   # 6:00〜14:00のランダムな時間
2 0   * * *    sleep $(shuf -i 50400-82800 -n 1) && post-to-x.js --type=feature --city=all # 14:00〜23:00のランダムな時間
```

`post-to-x.js` は直接X投稿し、投稿後にLINEへ内容＋ツイートURLを通知する。
`notify-fetch-summary.js` は `logs/fetch-summary-{city}.json` を読んで当日分のみ集計。
`analyze-sources.js` は `fetch-summary-{city}.json` を読んで `data/source-history.json` に蓄積し、
採用率が低いソースを `data/source-candidates.json` の候補と自動入れ替え。変更時のみLINE通知。

### ソース管理ファイル

| ファイル | 役割 |
|----------|------|
| `data/sources.json` | 都市別の有効ソース一覧（status: active/paused）。fetch-events.jsが読む |
| `data/source-candidates.json` | 入れ替え候補プール。contentFocus(event/gourmet/sale/mixed)でコンテンツ多様性を確保 |
| `data/source-history.json` | ランごとの送信数・採用数を蓄積。直近4回の平均採用率で判定 |

判定基準: **直近4回で送信10件以上かつ採用率8%未満** → 候補と入れ替え。
多様性: events.jsonの現在のtype分布（目標: event50%/gourmet35%/sale15%）と比較し、
不足typeのcontentFocusを持つ候補を優先的に選ぶ。

### 手動実行
```bash
node ~/sg-weekend-app/scripts/fetch-events.js --city=sg
node ~/sg-weekend-app/scripts/notify-fetch-summary.js
node ~/sg-weekend-app/scripts/analyze-sources.js --city=all          # 実際に変更
node ~/sg-weekend-app/scripts/analyze-sources.js --city=all --dry-run # 確認のみ
node ~/sg-weekend-app/scripts/post-to-line.js --city=all
node ~/sg-weekend-app/scripts/post-to-x.js --type=event --city=all
node ~/sg-weekend-app/scripts/post-to-x.js --type=feature --city=all
```

### 処理の流れ
```
fetch-events.js --city=sg|bkk|syd
  ↓ ステップ1: end_date 切れのデータを data/{city}/events.json から自動削除
  ↓ ステップ2: RSSフィードから取得（SGのみ。BKK・SYDは feeds:[] でスキップ）
  ↓ ステップ3: Instagram都市別公式アカウントから投稿取得（直近4日間）
       ↓ キャプション内の外部URL（instagram.com以外）を抽出し link に設定
  ↓ ステップ4: URL・タイトル類似度で重複チェック（新着 vs 既存）
  ↓ ステップ5: filter-events.js（Claude APIで判定・10件バッチ）
       ↓ 外部リンクがある記事はリンク先コンテンツを事前取得してClaudeに渡す
       ↓ OGP画像取得（外部URLを優先、Instagram CDNより安定した画像を使用）
       ↓ type/content/tips を日英両言語で生成 → data/{city}/events.json に追記
  ↓ ステップ6: events.json 全体の重複チェック（URL一致・店名60%類似）
  ↓ ステップ7: 結果を logs/fetch-summary-{city}.json に保存
→ notify-fetch-summary.js（月・金 8:00）が全都市サマリーをLINEに送信
```

### ソース構成

**SG — RSS 9サイト + Instagram 3アカウント**
| RSS サイト | URL |
|--------|-----|
| The Smart Local | `https://thesmartlocal.com/feed` |
| Expat Living | `https://expatliving.sg/feed` |
| Honeycombers | `https://thehoneycombers.com/singapore/feed` |
| Seth Lui | `https://sethlui.com/feed` |
| Little Day Out | `https://www.littledayout.com/feed` |
| SINGPromos | `https://singpromos.com/feed` |
| Eatbook | `https://eatbook.sg/feed` |
| The New Age Parents | `https://thenewageparents.com/feed` |
| Luma SG（RSSHub） | `http://localhost:1200/luma/singapore` |
| Instagram | @gardensbythebay / @jewelchangiairport / @capitalandmallssg |
| Instagram (固定) | @otokoramen_alexandra / @daiso_singapore / @sushirosingapore / @mujisg / @uniqlosg |

**BKK — Instagram 10アカウント（RSSなし）**
| カテゴリ | アカウント |
|---------|--------|
| モール・商業施設 | @iconsiam / @centralworld / @centralembassy / @siamparagonshopping / @emporium_emquartier / @theemsphere / @terminal21asok / @one_bangkok |
| フード・グルメメディア | @bangkokfoodies / @bangkok.foodie |
| 固定（日系ブランド） | @daisothailand_official / @muji_thailand / @sushirothailand / @uniqlothailand |

**SYD — Instagram 14アカウント（RSSなし）**
| カテゴリ | アカウント |
|---------|--------|
| 観光・文化施設 | @sydneyoperahouse / @royalbotanicgarden / @artgalleryofnsw / @vividsydney |
| 公式・行政 | @cityofsydney |
| モール・商業施設 | @westfieldsyd / @westfieldbondijunction |
| イベント・グルメメディア | @timeoutsydney / @broadsheet_syd / @concreteplayground / @goodfoodau / @placesinsydney / @tasteofsydney / @secretfoodies |
| 固定（日系ブランド） | @mujiaus / @daisoaustraliaofficial / @uniqloau |

### Instagram取得の仕様
- `fetchInstagramPosts()` で Instagram Graph API `business_discovery` を使用
- Business/Creatorアカウントのみ取得可能（個人アカウントは不可）
- `INSTAGRAM_PAGE_TOKEN` / `INSTAGRAM_IG_USER_ID` が必要（設定済み）
- 直近**4日間**の投稿を取得（週2回取り込みに合わせた設定）
- キャプション内の外部URL（instagram.com以外）を抽出して `link` に設定
- `image` = `media_url`（Instagram CDN）。外部URLがある場合はOGP取得を優先
- `media_url`（cdninstagram.com）は有効期限あり → 表示側は onerror でフォールバック済み

### filter-events.js の分類ルール
| type | 内容 | 保存先 |
|------|------|--------|
| `event` | 公園・施設・テーマパーク・体験型イベントなど | data/{city}/events.json |
| `gourmet` | 飲食店・カフェ・期間限定メニュー・フードフェア | data/{city}/events.json |
| `sale` | スーパー・ファッション・小売店の割引・セール | data/{city}/events.json |
| `opening` | グランドオープン（初めて営業開始）のみ | data/{city}/events.json |

- `content`（150〜200文字）と `content_en`（100〜150文字）を両方生成
- `tips`（配列・2〜3点）と `tips_en`（配列・2〜3点）を両方生成
- OGP画像を `image` フィールドに取得（外部リンクがある場合はそちらを優先）
- `source` フィールドに取得元サイト名を保存（ソース別採用率のログに使用）
- 採用基準: **全都市 score 6以上**に統一
- 外部リンクがある投稿はリンク先記事コンテンツをClaudeに渡して精度向上
- 不採用: `store` が不特定のもの、まとめ記事（listicle）、常設店の通常メニュー紹介
- 不採用: 現地代表チームのスポーツ観戦・ローカル住民向けコミュニティイベント
- 言語は問わない（タイ語・中国語のみの案内でも外国人参加可能なものは採用）

### 古いデータの削除・重複チェック
- `fetch-events.js` 冒頭で `end_date` が今日より前のものを自動削除
- 取得完了後に `deduplicateSaved()` で events.json 全体の重複を削除（URL一致 or 店名60%類似）

---

## 11. LINE Bot（投稿・承認フロー）

### フロー概要
1. **誰でも**URLまたは画像+テキストを LINE Bot に送信できる
2. Bot がURLのWebページ内容・画像を読み取り、Claude APIでイベント情報を生成
3. 生成した下書きを `data/pending-events.json` に保存
4. 管理者（`LINE_USER_ID`）に承認用 Flex Message を Push
5. 管理者が「承認」→ `events.json` に追加 / 「却下」→ pending から削除
6. 承認時、投稿者（管理者以外）に通知を Push

### 管理者コマンド
| コマンド | 動作 |
|---------|------|
| `XXX削除` | 「XXX」を含む店名のイベントを検索し、削除確認 Flex を送信 |
| Flex の「承認」ボタン | pending → events.json へ移行 |
| Flex の「却下」ボタン | pending から削除 |

---

## 12. 長期休暇設定（SIJSカレンダー準拠）

毎年4月に `data/school-calendar.json` と `index.html` の `LONG_VACATIONS` 配列を更新。

```json
{
  "year": 2026,
  "vacations": [
    { "name": "春休み",            "start": "2026-03-13", "end": "2026-04-11" },
    { "name": "ゴールデンウィーク", "start": "2026-04-29", "end": "2026-05-05" },
    { "name": "夏休み",            "start": "2026-08-01", "end": "2026-08-31" },
    { "name": "冬休み",            "start": "2026-12-24", "end": "2027-01-06" }
  ]
}
```

> ⚠️ SIJSの夏休みは8月のみ（1ヶ月）。6月は通常授業あり。
> 公式: https://www.sjs.edu.sg/en/calendar/

---

## 13. カラーパレット

```css
--caramel:      #C8804A   --caramel-light: #E0A878   --caramel-pale: #FDF0E6
--sage:         #6E9E88   --sage-light:    #A0C4B4   --sage-pale:    #EDF4F1
--terracotta:   #C4705A   --cream:         #FFF9F2   --warm-white:   #FFFDF9
--midnight:     #2C2420   --warm-gray:     #6B5E52   --light-gray:   #C4B8AC
--gold:         #C0903A   --sky:           #7AADCC
```

---

## 14. 起動・運用コマンド

```bash
# nvm PATH（毎セッション冒頭）
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"

# PM2
pm2 reload sg-weekend --update-env   # 通常の再起動
pm2 logs sg-weekend                  # ログ確認
pm2 status                           # 状態確認

# nginx
sudo nginx -t && sudo systemctl reload nginx

# イベント手動収集
node ~/sg-weekend-app/scripts/fetch-events.js

# ログ確認
tail -f ~/sg-weekend-app/logs/events.log
```

---

## 15. 開発時の注意点

### index.html更新手順
1. ファイルを編集
2. `sed -i "s/sg-weekend-vN/sg-weekend-vN+1/" ~/sg-weekend-app/public/sw.js`
3. `pm2 reload sg-weekend --update-env`

### bgClassについて
既存: `kite` / `jewel` / `science` / `gardens` / `sentosa` / `safari` / `aquarium` / `haji` / `eastcoast` / `botanical` / `ramen` / `cafe` / `park`
新規追加時はindex.htmlのCSSにグラデーションを追加すること。
APIから取得したイベントに `bgClass` がない場合は `cafe` がデフォルト。

### i18n対応について
- 静的HTML要素には `data-i18n="key"` 属性を付与
- プレースホルダーには `data-i18n-ph="key"` 属性を付与
- JS生成HTML内では `t('key')` を使う
- 言語変更時は `setLang()` を呼ぶ（`applyI18n()` + 全画面再描画を内包）

### タブラベルの innerHTML vs textContent
- 連休タブのラベル更新は `textContent` を使うこと（`innerHTML` + `vertical-align` を使うと絵文字とテキストの縦位置がずれる）

### フィードバック（LINE Push）
- `POST /api/feedback` → LINE Messaging API Push でシンガポール時間付きで送信
- 環境変数 `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_USER_ID` が必要（設定済み）

### Stripe Webhookはraw bodyが必要（将来復活時の注意）
```js
app.post('/api/webhook', express.raw({ type: 'application/json' }), handler)
app.use(express.json())
```

### localStorage の型
```js
// ✅ 正しい
const who = JSON.parse(localStorage.getItem('sg_who') || '[]');
```

---

## 16. 新都市追加ガイド

KL（2026-05）・SYD（2026-06）追加時の知見をもとにした作業チェックリスト。
抜け・漏れが出やすい箇所を中心に記載する。

### チェックリスト（全8ファイル）

#### ① `server.js` — `CITIES` オブジェクトに追加
```js
xxx: {
  nameJa: '都市名（日本語）', nameEn: 'City Name', flag: '🏳️', code: 'XXX',
  timezone: 'Region/City',   // IANA タイムゾーン
  weatherQ: 'City Name',     // OpenWeatherMap 検索文字列
  currency: 'XXX',
  appUrl: 'https://dosuru.app/xxx',
},
```

#### ② `scripts/fetch-events.js` — `CITY_CONFIG` に追加
```js
xxx: {
  nameJa: '都市名', timezone: 'Region/City',
  eventsPath: path.join(__dirname, '..', 'data', 'xxx', 'events.json'),
  feeds: [],  // SGはRSSを使用。他都市はInstagram一本のため空配列
  instagramAccounts: ['account1', 'account2'],  // Business Discoveryで取得できるアカウント
},
```
- `parseCity()` は未知の都市コードを `'sg'` にフォールバックするので、キー名のスペルを確認
- instagramAccountsはBusiness/Creatorアカウントのみ有効（取得失敗は `⚠️` ログで確認）

#### ③ `scripts/filter-events.js` — 4か所すべて更新（抜けると採用0件になる）

```js
const CITY_NAMES     = { ..., xxx: '都市名（日本語）' };
const CITY_LOCATIONS = { ..., xxx: 'City Name' };
const CITY_AREAS     = { ..., xxx: '"Area1"/"Area2"/"City-wide"' };
```

```js
// scoreThreshold: 全都市6に統一
const scoreThreshold = 6;

// defaultArea: 都市の代表エリア名を追加（現在の設定: sg=Central, bkk=Sukhumvit, syd=CBD）
const defaultArea = cityKey === 'syd' ? 'CBD' : cityKey === 'bkk' ? 'Sukhumvit' : cityKey === 'xxx' ? 'Centre' : 'Central';
```

> ⚠️ **SYD 追加時に踏んだ罠**: これらを追加しなかったため Claude に「シンガポール向け」として渡され、シドニーコンテンツが全件スコア不足でスキップされた（採用0件）。

#### ④ `public/index.html` — 4か所

**a) `CITY_META`**
```js
xxx: { code: 'XXX', flag: '🏳️', nameJa: '都市名', nameEn: 'City Name',
       subtitleJa: 'XXX在住者の週末おでかけガイド', subtitleEn: 'Weekend guide for Japanese in City Name' },
```

**b) `updateCityUI` 内のシェア説明文**
```js
const descJa = { ..., xxx: 'XXX在住の友達にこのアプリを紹介しよう！' };
const descEn = { ..., xxx: 'Share this app with your friends in City Name!' };
```

**c) `LONG_VACATIONS_BY_CITY`**
- 都市の学校カレンダーに合わせた長期休暇を配列で定義
- **新しい休暇名**（例: SYD の「秋休み」）がある場合は `vacLabels`（`updateTabLabels` 関数内）にも追加すること
```js
ja: { ..., '秋休み': '🍂 秋休み' },
en: { ..., '秋休み': '🍂 Autumn Break' },
```

**d) `CITY_HOLIDAYS_2026`**
- 都市の祝日を `new Date(年, 月-1, 日)` 形式で定義

> ⚠️ **SYD 追加時に踏んだ罠**: `selectCity` で `updateTabLabels()` を呼んでいなかったため、都市切り替え後もタブに旧都市の休暇名（SG「冬休み」）が残った。`selectCity` では `updateCityUI()` + `updateTabLabels()` の両方を呼ぶこと。

#### ⑤ `data/{city}/` — 4ファイルを作成

```bash
mkdir -p data/{city}
echo '[]' > data/{city}/events.json
echo '[]' > data/{city}/line-post-history.json
echo '[]' > data/{city}/pending-events.json
```

`school-calendar.json` は以下の形式で作成：
```json
{
  "year": 2026,
  "city": "xxx",
  "school": "学校名",
  "vacations": [
    { "name": "春休み", "start": "2026-XX-XX", "end": "2026-XX-XX" }
  ]
}
```

#### ⑥ `public/sw.js` — `CACHE_NAME` をインクリメント

`index.html` を変更するたびに必須。

```bash
# 例: v154 → v155
sed -i "s/sg-weekend-v154/sg-weekend-v155/" public/sw.js
pm2 reload sg-weekend --update-env
```

#### ⑦ `scripts/post-to-line.js` と `scripts/post-to-x.js` — `CITY_CONFIG` に追加
```js
xxx: {
  nameJa: '都市名', appUrl: 'https://dosuru.app/xxx',
  eventsPath:  path.join(__dirname, '../data/xxx/events.json'),
  historyPath: path.join(__dirname, '../data/xxx/line-post-history.json'),
},
```

#### ⑧ `CLAUDE.md` — 対応都市一覧・Instagramアカウント一覧を更新

#### ⑧ RSS フィードの選定

- WordPress ベースのサイトは `/feed` が有効なことが多い
- 大手メディア・雑誌系は RSS を廃止している場合が多い（SYD で5サイト404確認）
- 有効か確認してから `fetch-events.js` に追加する

### 既知の制限事項

| 機能 | 制限 |
|------|------|
| LINE Bot 承認フロー（`/api/line-webhook`） | `EVENTS_PATH` が `data/sg/` にハードコードされているため **SG専用** |
| `fetchRssItems` の `minDescLen` | デフォルト 100。英語圏コンテンツが短い場合は都市ごとに条件を追加 |
| `resolveCity()` / `parseCity()` | 未知の都市コードは `'sg'` にフォールバック |
| Instagram `media_url` | cdninstagram.com URLは有効期限あり（数日で切れる）。表示側は onerror でフォールバック済み |

---

## 17. 今後の実装予定

### 🔴 優先度：高
- [ ] OpenWeatherMap API連携（天気バナー本番化）
- [ ] カレンダーの件数バッジ表示（おでかけ：オレンジ）

### 🟡 優先度：中
- [ ] OGPタグ設定
- [ ] 表示件数制御（イベント上限設定）
- [ ] LINE Bot 承認フローの改善

### 🟢 優先度：低
- [ ] 課金機能（Stripe）再有効化
- [ ] App Store / Google Play申請
- [ ] 他都市展開
- [ ] プッシュ通知（毎週金曜朝）
- [ ] 管理画面

---

*最終更新: 2026-06-05（X Listソース廃止 / BKK・SYDをInstagram一本化 / BKK 10アカウント・SYD 14アカウントに拡充 / スコア閾値を全都市6に統一 / Instagram外部リンク追跡対応 / ローカルスポーツ観戦除外フィルター追加 / post-to-x.js新規作成・X自動投稿cron追加 / analyze-sources.js追加・ソース採用率・多様性自動最適化 / カテゴリフィルター単一選択化・今週までボタンをSection Headerに移動・openingタイプを今週まで対象外に）*
