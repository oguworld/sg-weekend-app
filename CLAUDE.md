# おでかけNavi — CLAUDE.md

プロジェクトの全体像・技術構成・運用手順のリファレンス。
Claude Code でこのプロジェクトを触る際は最初に読むこと。

---

## 1. アプリ概要

**「おでかけNavi」** — 東南アジア・オセアニア在住の日本人向け週末おでかけ情報PWA。
トップキャッチコピーは「週末どうする？」。設定で都市を切り替えられる。

### 対応都市（server.js の CITIES オブジェクトで管理）
| 都市 | コード | ステータス |
|------|--------|-----------|
| シンガポール | `sg` | 稼働中 |
| バンコク | `bkk` | 稼働中 |
| シドニー | `syd` | 稼働中 |

### URL
- `dosuru.app` — 単一PWA、`localStorage: app_city` で都市切り替え

---

## 2. 技術スタック

| レイヤー | 技術 |
|---------|------|
| ランタイム | Node.js v22.22.3（nvm管理） |
| Webフレームワーク | Express ^4.21.2 |
| HTTP クライアント | axios ^1.16.1 |
| 環境変数 | dotenv ^16.4.7 |
| 決済 | Stripe SDK ^17.7.0（現在コメントアウト） |
| Web Push | web-push ^3.6.7（VAPID） |
| QRコード | qrcode ^1.5.4 |
| フロントエンド | Vanilla JS + HTML/CSS（Single File） |
| PWA | Web App Manifest + Service Worker（現在 sg-weekend-v430） |
| フォント | Google Fonts (Noto Sans JP, Kaisei Opti) |
| アナリティクス | Google Analytics（G-JDCJPD1P9X） |
| プロセス管理 | PM2 |
| リバースプロキシ | nginx |
| SSL | Let's Encrypt |
| DNS | Cloudflare（dosuru.app → 194.233.92.41） |
| イベント取得 | rss-parser + Instagram Graph API |
| フィルタリング | Anthropic Claude API (claude-sonnet-4-6) |
| AIチャット | Anthropic Claude API (claude-sonnet-4-6) |
| LINE Bot | LINE Messaging API（Webhook） |
| 天気予報 | OpenWeatherMap API |
| X自動投稿 | X API v2 OAuth 1.0a |

### nvm PATH（毎セッション冒頭で必要）
```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
```

---

## 3. サーバー情報

| 項目 | 値 |
|------|-----|
| VPS IP | `194.233.92.41` |
| ドメイン | `dosuru.app` |
| ユーザー | masahiko |
| プロジェクトパス | `/home/masahiko/sg-weekend-app/` |

---

## 4. ファイル構成

```
sg-weekend-app/
├── server.js                    # Express バックエンド（全APIここ）
├── package.json
├── .env                         # 環境変数（Git除外）
│
├── scripts/
│   ├── fetch-events.js          # RSS + Instagram からイベント取得
│   ├── filter-events.js         # Claude APIで判定・日英生成・events.json保存
│   ├── notify-fetch-summary.js  # 取得結果をまとめてLINE通知
│   ├── post-to-x.js             # X自動投稿（event/feature交互）
│   ├── analyze-sources.js       # ソース採用率分析・自動入れ替え
│   ├── discover-sources.js      # source-pool.json をプローブ・スコアリング
│   ├── retip-events.js          # 既存events.jsonのtips/tips_en一括更新
│   ├── refresh-ig-images.js     # Instagram画像URLを再取得して更新
│   ├── post-to-line.js          # LINE投稿ドラフト生成
│   ├── notify-line.js           # LINE通知ヘルパー
│   ├── fill-english.js          # content_en/tips_enが空のイベントを補完（レガシー）
│   ├── recheck-dates.js         # 既存イベントの日付をClaude APIで再チェック（レガシー）
│   ├── recheck-types.js         # 既存イベントのtypeをClaude APIで再分類（レガシー）
│   ├── update-claude-md.js      # CLAUDE.mdを自動更新（github-backup.shから呼ばれる）
│   └── github-backup.sh         # Gitバックアップ週次実行
│
├── data/
│   ├── sg/
│   │   ├── events.json
│   │   ├── school-calendar.json
│   │   ├── line-post-history.json
│   │   └── pending-events.json
│   ├── bkk/
│   │   ├── events.json
│   │   ├── school-calendar.json
│   │   ├── line-post-history.json
│   │   └── pending-events.json
│   ├── syd/
│   │   ├── events.json
│   │   ├── school-calendar.json
│   │   ├── line-post-history.json
│   │   └── pending-events.json
│   ├── shared-calendars/        # 共有カレンダーファイル（{groupId}.json）
│   ├── sources.json             # 都市別ソース設定（active/paused）
│   ├── source-candidates.json   # 候補ソールプール上位（discover-sources.jsが自動生成）
│   ├── source-history.json      # ソース別採用率履歴
│   ├── source-pool.json         # 未試行候補ソースプール
│   ├── push-subscriptions.json  # Webプッシュ購読リスト
│   └── x-post-history.json      # X投稿履歴
│
└── public/
    ├── index.html               # PWA フロントエンド（全UIここ）
    ├── manifest.json
    ├── sw.js                    # Service Worker
    └── icons/
```

---

## 5. データ構造

### events.json

保存先: `data/{city}/events.json`

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
  "content_en": "Special weekend event...",
  "tips": ["週末は混むので開店直後がおすすめ"],
  "tips_en": ["Arrive early to beat crowds"],
  "location": "18 Marina Gardens Dr",
  "area": "Central",
  "url": "https://www.gardensbythebay.com.sg",
  "source": "The Smart Local",
  "fetched_at": "2026-05-28"
}
```

### type の定義
| type | 内容 |
|------|------|
| `event` | 公園・施設・体験型イベント・展示・マーケットなど |
| `gourmet` | 飲食店・カフェ・期間限定メニュー・フードフェア |
| `sale` | スーパー・ファッション・小売店の割引・セール |
| `opening` | グランドオープン（開始日から14日で非表示） |

---

## 6. フロントエンド（public/index.html）

### index.html 更新時の手順
```bash
grep CACHE_NAME ~/sg-weekend-app/public/sw.js   # 現在バージョン確認（現在 v430）
sed -i "s/sg-weekend-vN/sg-weekend-vN+1/" ~/sg-weekend-app/public/sw.js
pm2 reload sg-weekend --update-env
```

### ボトムナビ（3タブ）
| タブ | id | ラベル | 機能 |
|------|-----|--------|------|
| 1 | `nav-home` | 探す | イベント一覧（`/api/events`） |
| 2 | `nav-plan` | 予定表 | カレンダー + 予定管理 |
| 3 | `nav-settings` | 設定 | プロフィール・言語・都市設定 |

### 週末タブ（探すタブ内）
- 今週末 / 来週末 / 再来週末 / 3週後（4タブ、`tabs-weekend-group`）
- 長期休暇・祝日の週は休暇名ラベルに動的に変わる

### カテゴリフィルター
| value | ラベル |
|-------|--------|
| `event` | 🗺 イベント |
| `gourmet` | 🍽 グルメ・フェア |
| `sale` | 🏷 プロモ・お得 |
| `opening` | 🎊 新規オープン |

単一選択。同じチップを再タップで解除。

Section Headerの右端: 🔥今週まで / 開始日ソート / 件数カウント / リフレッシュ

### 予定表タブ
- カレンダー（縦スクロール）+ 予定管理
- イベントプラン追加（Modal A）・カスタム予定追加（Modal B）・詳細編集（Modal C）
- 各予定に ⭐ 重要 / 🔔 通知 フラグ
- 共有カレンダー機能（🔗ボタン → グループID生成・参加・同期）
- 重要フラグ: `.schedule-row` に `border-left: 3px solid transparent` を持ち、重要時は `var(--terracotta)` に変わる（ズレなし）

### AIチャット（FAB）
- 右下フローティングボタン（fab-ai）→ ボトムシート
- `POST /api/chat` に送信、直近3往復（6メッセージ）の履歴を保持
- レスポンス: `{ message: string, eventIds: string[] }` → カード形式表示

### 多言語対応（i18n）
- `STRINGS` オブジェクトに `ja` / `en` の翻訳辞書
- `getLang()` → `localStorage: sg_lang`（デフォルト: `ja`）
- `t(key)` で現在言語の文字列取得
- `applyI18n()` → `[data-i18n]` / `[data-i18n-ph]` 属性に一括適用

### ダークモード
- `localStorage: sg_theme`（`auto` / `light` / `dark`）
- ページロード時に `data-theme="dark"` を `<html>` に付与してフラッシュ防止

### localStorage キー一覧
| キー | 内容 |
|------|------|
| `app_city` | 選択中の都市（`sg` / `bkk` / `syd`、デフォルト: `sg`） |
| `sg_lang` | 表示言語（`ja` / `en`） |
| `sg_theme` | テーマ（`auto` / `light` / `dark`） |
| `sg_who` | 誰と行く（JSON配列、グローバル設定） |
| `sg_age` | 子どもの年齢（`all` / `baby` / `preschool` / `school`） |
| `{city}_pins` | ピン留めデータ（都市別） |
| `{city}_hidden_events` | 非表示イベントID（都市別） |
| `{city}_hidden_spots` | 非表示スポットID（都市別） |
| `{city}_custom_plans` | カスタム予定（都市別） |
| `{city}_event_plans` | イベントプラン（都市別） |
| `{city}_shared_group_id` | 共有カレンダーグループID（都市別） |
| `sg_install_dismissed` | インストールバナーを閉じた記録 |

---

## 7. バックエンドAPI（server.js）

全APIに `?city=sg|bkk|syd` クエリパラメータを受け付ける（省略時 `sg`）。

### 有効なエンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/spots` | スポット一覧 |
| GET | `/api/events?city=sg` | イベント一覧（start/end_date から `tab` を動的付与） |
| GET | `/api/sales?city=sg` | type==="sale" のみ返す |
| GET | `/api/weather?city=sg` | 週末の天気予報（OpenWeatherMap） |
| GET | `/api/school-calendar?city=sg` | 長期休暇設定 |
| POST | `/api/feedback` | フィードバック → LINE Push送信 |
| POST | `/api/chat` | AIチャット（claude-sonnet-4-6 + tool_use） |
| POST | `/api/line-webhook` | LINE Bot Webhook（SG専用） |
| GET | `/api/vapid-public-key` | VAPID公開鍵 |
| POST | `/api/push-subscribe` | プッシュ通知購読登録 |
| DELETE | `/api/push-subscribe` | プッシュ通知購読解除 |
| POST | `/api/notify-events-updated` | 全購読者にプッシュ通知送信 |
| POST | `/api/calendar/create` | 共有カレンダー作成（グループID発行 + QRコード生成） |
| GET | `/api/calendar/:groupId` | 共有カレンダー取得 |
| PUT | `/api/calendar/:groupId` | 共有カレンダー更新（上書き） |
| POST | `/api/calendar/:groupId/join` | 共有カレンダー参加（予定をマージ） |
| POST | `/api/calendar/:groupId/push-subscribe` | カレンダー別プッシュ通知登録 |
| DELETE | `/api/calendar/:groupId/push-subscribe` | カレンダー別プッシュ通知解除 |
| POST | `/api/calendar/:groupId/notify` | カレンダーメンバーにプッシュ通知送信 |
| GET | `/privacy` | プライバシーポリシーページ |

### `/api/events` の tab 付与ロジック
- 今週（月〜日）と重なる → `weekend`
- 来週 → `nextweekend`
- 再来週 → `afterweekend`
- 3週後 → `threeweeks`
- それ以外 → `future`（フロントで非表示）
- `opening` タイプは start_date から14日でキャップ

### 無効化中（コメントアウト）
- Stripe: `/api/create-checkout-session` / `/api/webhook` / `/api/subscription-status`
- server.js内cron（外部cronに切り替え済み）
- Instagram oEmbed: `/api/ig-embed`

---

## 8. 環境変数（.env）

```env
PORT=3000
ANTHROPIC_API_KEY=sk-ant-...
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
LINE_USER_ID=...                       # 管理者のLINE User ID
OPENWEATHER_API_KEY=...
VAPID_PUBLIC_KEY=...                   # Web Push（npx web-push generate-vapid-keys で生成）
VAPID_PRIVATE_KEY=...
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
INSTAGRAM_PAGE_TOKEN=...               # 長期ページトークン
INSTAGRAM_IG_USER_ID=...               # Business Discoveryの起点IG User ID
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
# STRIPE_*=...（無効化中）
```

---

## 9. データ収集フロー（scripts/）

### crontab（サーバーは Europe/Berlin CEST UTC+2 で動作。SGT = CEST + 6h）

```cron
# イベント取得: 水・日 7:00〜7:30 SGT = 1:00〜1:30 CEST
0 1  * * 3,0  node fetch-events.js --city=sg
15 1 * * 3,0  node fetch-events.js --city=bkk
30 1 * * 3,0  node fetch-events.js --city=syd

# 取得結果サマリーLINE通知: 水・日 8:00 SGT = 2:00 CEST
0 2  * * 3,0  node notify-fetch-summary.js

# ソース採用率分析・自動入れ替え: 水・日 8:30 SGT = 2:30 CEST
30 2 * * 3,0  node analyze-sources.js --city=all

# X自動投稿: 毎日 6:00〜14:00 SGT にランダム（CEST 0:01 + sleep 21600〜50400秒）
1 18 * * *    sleep $(shuf -i 21600-50400 -n 1) && node post-to-x.js --city=all

# GitHub週次バックアップ: 毎週日曜 3:00 SGT = 土曜 21:00 CEST
0 21 * * 6    ~/sg-weekend-app/scripts/github-backup.sh
```

### 手動実行コマンド
```bash
node ~/sg-weekend-app/scripts/fetch-events.js --city=sg
node ~/sg-weekend-app/scripts/fetch-events.js --city=bkk
node ~/sg-weekend-app/scripts/fetch-events.js --city=syd
node ~/sg-weekend-app/scripts/notify-fetch-summary.js
node ~/sg-weekend-app/scripts/analyze-sources.js --city=all [--dry-run]
node ~/sg-weekend-app/scripts/discover-sources.js --city=all [--dry-run] [--force]
node ~/sg-weekend-app/scripts/post-to-x.js --type=event --city=all
node ~/sg-weekend-app/scripts/post-to-x.js --type=feature --city=all
node ~/sg-weekend-app/scripts/retip-events.js           # tips/tips_en一括更新
node ~/sg-weekend-app/scripts/refresh-ig-images.js --city=bkk  # IG画像URL再取得
```

### 処理フロー
```
fetch-events.js
  ↓ ① end_date 切れを data/{city}/events.json から削除
  ↓ ② RSSフィード取得（SGのみ、BKK・SYDはfeeds:[]でスキップ）
  ↓ ③ Instagram Business Discovery API で直近4日間の投稿取得
  ↓ ④ URL・タイトル類似度で重複チェック
  ↓ ⑤ filter-events.js（Claude API、10件バッチ）
       ↓ 外部リンクがある投稿はリンク先コンテンツを取得してClaudeに渡す
       ↓ OGP画像取得（外部URLを優先）
       ↓ type/content/tips を日英両言語で生成
       ↓ data/{city}/events.json に追記
  ↓ ⑥ events.json全体の重複チェック（URL一致・店名60%類似）
  ↓ ⑦ 結果を logs/fetch-summary-{city}.json に保存
→ notify-fetch-summary.js が全都市サマリーをLINEに送信
→ analyze-sources.js がソース採用率を source-history.json に蓄積・自動入れ替え
```

### ソース構成（fetch-events.js の CITY_CONFIG）

**SG — RSS 9サイト + Instagram 3アカウント**
| RSS サイト |
|--------|
| The Smart Local |
| Expat Living |
| Honeycombers |
| Seth Lui |
| Little Day Out |
| SINGPromos |
| Eatbook |
| The New Age Parents |
| Luma SG（RSSHub: localhost:1200/luma/singapore） |

Instagram: `gardensbythebay` / `jewelchangiairport` / `capitalandmallssg`

**BKK — Instagram 10アカウント（RSSなし）**
`iconsiam` / `centralworld` / `centralembassy` / `siamparagonshopping` / `emporium_emquartier` / `theemsphere` / `terminal21asok` / `one_bangkok` / `bangkokfoodies` / `bangkok.foodie`

**SYD — Instagram 14アカウント（RSSなし）**
`sydneyoperahouse` / `royalbotanicgarden` / `artgalleryofnsw` / `vividsydney` / `cityofsydney` / `westfieldsyd` / `westfieldbondijunction` / `timeoutsydney` / `broadsheet_syd` / `concreteplayground` / `goodfoodau` / `placesinsydney` / `tasteofsydney` / `secretfoodies`

### ソース管理ファイル（3層構造）
| ファイル | 役割 |
|----------|------|
| `data/source-pool.json` | 未試行候補プール。新しいアカウントはここに追加 |
| `data/source-candidates.json` | プール上位スコアラー（discover-sources.jsが自動更新） |
| `data/sources.json` | 現在使用中ソース（analyze-sources.jsが管理） |
| `data/source-history.json` | ランごとの送信数・採用数を蓄積 |

判定: **直近4回で送信10件以上かつ採用率8%未満** → 候補と入れ替え

### filter-events.js の分類・生成ルール
- `content`（150〜200文字）と `content_en`（100〜150文字）を両方生成
- `tips`（2〜3点、各26文字以内）と `tips_en`（各38文字以内）を両方生成
- 採用基準: score 6以上（全都市統一）
- 不採用: まとめ記事（listicle）、常設店の通常メニュー、ローカル住民向けコミュニティイベント

---

## 10. LINE Bot（server.js に実装）

### フロー
1. 誰でも URL または 画像+テキストをLINE Botに送信
2. Bot がWebページ・画像を読み取り、Claude APIでイベント下書き生成
3. `data/{city}/pending-events.json` に保存
4. 管理者（`LINE_USER_ID`）に承認用 Flex Message を Push
5. 管理者が「承認」→ `events.json` に追加 / 「キャンセル」→ pending から削除

### 管理者コマンド
| コマンド | 動作 |
|---------|------|
| `XXX削除` + `#sg|#bkk|#syd` | 該当都市から「XXX」を含む店名を検索・削除確認 |
| 承認ボタン | pending → events.json へ移行 |
| キャンセルボタン | pending から削除 |

> LINE Bot の都市判定: テキスト中の `#bkk` / `#syd` / `バンコク` / `シドニー` 等を検出。デフォルトはSG。

---

## 11. 共有カレンダー機能（server.js + index.html）

- `POST /api/calendar/create` でグループID（6文字英数字）を発行し QRコード生成
- `GET /?join={groupId}&city={city}` で参加（URLパラメータ自動処理）
- データは `data/shared-calendars/{groupId}.json` に保存
- Push通知対応: グループメンバー全員に予定更新を通知

---

## 12. 長期休暇設定

`public/index.html` の `LONG_VACATIONS_BY_CITY` と `data/{city}/school-calendar.json` を毎年更新。

```js
LONG_VACATIONS_BY_CITY = {
  sg:  [ { name: '春休み', start: new Date(...), end: new Date(...) }, ... ],
  bkk: [ ... ],
  syd: [ ... ],
}
```

都市別祝日: `CITY_HOLIDAYS_2026`（`server.js` にも同様の定義あり）。

---

## 13. カラーパレット

```css
--caramel: #C8804A  --caramel-light: #E0A878  --caramel-pale: #FDF0E6
--sage:    #6E9E88  --sage-light:    #A0C4B4  --sage-pale:    #EDF4F1
--terracotta: #C4705A  --cream: #FFF9F2  --warm-white: #FFFDF9
--midnight:   #2C2420  --warm-gray: #6B5E52  --light-gray: #C4B8AC
--gold: #C0903A  --sky: #7AADCC
```

---

## 14. 起動・運用コマンド

```bash
# nvm PATH（毎セッション冒頭）
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"

# PM2
pm2 reload sg-weekend --update-env
pm2 logs sg-weekend
pm2 status

# nginx
sudo nginx -t && sudo systemctl reload nginx
```

---

## 15. 新都市追加時の更新箇所

| ファイル | 更新内容 |
|----------|---------|
| `server.js` | `CITIES` オブジェクトに追加。`CITY_HOLIDAYS` に祝日追加 |
| `scripts/fetch-events.js` | `CITY_CONFIG` に追加（timezone / eventsPath / instagramAccounts / feeds） |
| `scripts/filter-events.js` | `CITY_NAMES` / `CITY_LOCATIONS` / `CITY_AREAS` に追加 |
| `public/index.html` | `CITY_META` / `LONG_VACATIONS_BY_CITY` / `CITY_HOLIDAYS_2026` に追加。`updateCityUI()` の共有テキストも追加 |
| `data/{city}/` | `events.json` / `school-calendar.json` / `line-post-history.json` / `pending-events.json` を作成 |
| `scripts/post-to-x.js` | `CITY_CONFIG` に追加 |
| `public/sw.js` | `CACHE_NAME` をインクリメント |
| `CLAUDE.md` | 対応都市一覧・ソース一覧を更新 |

---

*最終更新: 2026-06-13（コードから再生成）*
