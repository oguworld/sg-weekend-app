# おでかけNavi (dosuru.app) - CLAUDE.md

## プロジェクト概要
シンガポール在住日本人向け週末おでかけ情報PWA。
ブランド名: Willoa / アプリ名: おでかけNavi

## ターゲットユーザー
シンガポール在住の日本人駐在員・家族（30〜40代中心）
日本語UI必須。スマホファースト。

## サーバー情報
- VPS: Contabo (IP: 194.233.92.41)
- ユーザー: masahiko
- プロジェクトパス: /home/masahiko/sg-weekend-app/
- ドメイン: dosuru.app
- SSL: Let's Encrypt (Cloudflare DNS)

## 起動・操作コマンド
pm2 restart sg-weekend
pm2 logs sg-weekend
pm2 status

## スタック
- バックエンド: Node.js / Express
- フロントエンド: Vanilla JS / Tailwind CSS / PWA
- インフラ: nginx / PM2 / Let's Encrypt
- データ: events.json / sales.json（ファイルベース、DBなし）

## フォルダ構成
sg-weekend-app/
├── server.js
├── scripts/
│   ├── fetch-events.js
│   ├── filter-events.js
│   ├── generate-model-courses.js  ← モデルコース生成（Claude API + Unsplash）
│   ├── fill-images.js             ← 既存イベントへの画像補完
│   └── lib/
│       └── unsplash.js            ← Unsplash API ユーティリティ
├── data/
│   ├── sg/
│   │   ├── events.json
│   │   ├── model-courses.json     ← AIプリセットコース
│   │   └── community-courses.json ← ユーザー公開コース
│   ├── bkk/ (同様)
│   └── syd/ (同様)
├── public/
│   ├── index.html
│   └── sw.js
└── .claude/
    ├── plan.md
    ├── next.md
    └── session-log.md

## データ構造
カテゴリ: event / gourmet / sale / edu
主要フィールド: title, date, url, who, age, major_score

## コース機能（2026-06-22実装・2026-06-25 BKK/SYD対応・2026-06-26 候補3択対応・2026-06-27 予定表連携対応）
- ナビ: 探す / コース / 予定表 / 設定 の4タブ
- コース画面タブ: 人気（popular） / 公開コース（community） / マイコース（mylist）の3タブ
  - 人気: いいね数降順 上位5件
  - 公開コース: 登録日降順（新しい順）
  - マイコース: 作成日昇順（作った順）
- コース作成フロー: FABタップ → 条件選択シート → [Haiku] POST /api/courses/candidates で候補3件生成 → カード選択 → [Sonnet] POST /api/courses/generate でフルコース生成
  - 候補シート: `#course-step-candidates`。タイトル・タグライン・説明のみ。「← 条件に戻る」で戻れる
  - selectedCandidate を generate エンドポイントに渡すと候補のコンセプトに沿って生成（後方互換: 未指定時は従来動作）
- ユーザー公開コース: `data/{city}/community-courses.json`（sg/bkk/syd 全都市対応）
- マイコース: localStorage `{city}_my_courses`（published フィールドで公開管理）
- API: GET /api/courses, POST /api/courses/chat, POST /api/courses/generate, POST /api/courses/candidates, POST /api/courses/publish, POST /api/courses/:id/like, GET /api/courses/image
- 日付ピッカー統一: `openDatePickerSheet(opts)` で日付選択を共通化（コース追加・予定追加の両方）
- 予定表連携: 空き週末日タップ → アクション選択シート（予定追加 / コース作成）。`window._coursePresetDate` で日付プリセットを共有
- イベント → コース: 🗺 ボタン（イベントカード/ピン一覧/ピン詳細）から `openCourseSheetFromEvent()` でコースシートを起動
- プロフィール連携: app_who（おでかけスタイル）/ app_age（子どもの年齢）をチャット・生成プロンプトに反映
  - 旧キー sg_who / sg_age は読み取り時にフォールバック
- 画像補完: `node scripts/fill-images.js --city=sg`（generate-model-courses.jsは参照なし）
- コース生成プロンプト: 都市別食スポット選定ルール（sg: ホーカーセンター / bkk: タラート / syd: フードホール）
- エリアチップ: CITY_COURSE_AREAS 定数で都市別に動的生成（sg/bkk/syd 各6エリア）
- transportチップ: data-val=公共交通・バス（表示ラベルは都市別: SG=MRT・バス, BKK=BTS・MRT・バス, SYD=電車・バス）
- コース詳細ボタン: 予定表追加（メイン）/ 公開+タイトル変更（横2列）/ 削除（テキストリンク）
- マイコースカード: ❤️の代わりに公開状態バッジ（🌐公開中 / 🔒非公開）表示

## ジャンル・興味機能（2026-07-02実装）
- ジャンルマスター: GENRE_LIST 定数（13種）。id / emoji / label を持つ
- ユーザー設定: localStorage `app_genres`（選択ジャンルIDの配列）
- 設定場所: 設定画面「ジャンル・興味」セクション（`#genre-chips-container`）
- おすすめモード: 「すべて」チップをタップすると `_recommendModeActive = true` になり、ジャンルマッチのイベントのみ表示。もう一度タップで全件表示に戻る
  - ジャンル未設定時は `#recommend-setup-banner` を5秒表示して設定を促す
- 「すべて」チップのラベル: おすすめモードON時は「⭐ おすすめ」に変化（`_syncRecommendChip()`）
- イベントデータ: `genres` フィールド（文字列配列）。filter-events.js の filterBatch() で付与
- 遡及タグ付け: `node scripts/fill-genres.js --city=sg [--dry-run]`（Haiku、バッチ20件）

## i18n対応（2026-06-24実装）
- 言語切り替え: STRINGS オブジェクト（ja/en）+ `t(key)` 関数 + `applyI18n()`
- 対応済み: 探すタブ・コース機能全体・設定画面・予定表モーダル・ボトムナビ
- 未対応（スコープ外）: 共有カレンダー機能・AIチャットシート・インストールモーダル

## X自動投稿（scripts/post-to-x.js）
- ペルソナ: 日本・SG両方フラットに見る30-40代男性。構造・逆説・気づきを提示するスタイル
- 投稿タイプ: event（イベント紹介）/ life（生活つぶやき）を交互に自動選択
- 文字数: 本文日本語90文字以内（X上限280ウェイト）
- 実行: `node scripts/post-to-x.js [--type=event|life] [--city=sg|bkk|syd|all] [--dry-run]`

## アーキテクチャルール
- ビジネスロジックはサーバーサイドに置く
- フロントエンドはAPI経由でデータを取得する
- DBは使わない、JSONファイルで管理する

## UIルール
- 日本語UI
- スマホファースト
- Tailwind CSSを使う
- 既存のデザインパターンを踏襲する

## UIスタイル規約（2026-07-01統一）
- **カラー**: inline style で生の色値（`#C8804A` 等）を書かない。必ず `:root` のCSS変数（`var(--caramel)` 等）を使う
- **閉じる ✕ ボタン**: `background:var(--sand); border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:16px; border:none; cursor:pointer` を標準スタイルとして使う
- **CSSクラスの二重定義禁止**: 既存クラスを再定義する場合は古い定義をその場で削除する
- **カードタイトル**: font-size 16px / font-weight 700 を標準とする（メインイベントカード `.card-title` のみ 18px）
- **border-radius**: カード系 16〜18px、ボタン系 `var(--radius-btn)`(14px) または 50px(pill) を基本とする

## フィルターUI（2026-06-28刷新）
- tabs-section（いつ行く？4タブ）廃止
- `#filter-row-category` カテゴリチップ横スクロール行を header 直下に常時表示（何も選ばない = 全件）
- `#event-filter-btn` 絞り込みボタン → `#event-filter-sheet` ボトムシート（いつ行く？/誰と/エリア/キーワード）
- JS変数: `filterCats` / `filterWeek` / `filterWho` / `filterAreas` / `filterKeyword` / `filterEnding`
- プロフィールの who フィルターは廃止。filterWho（シート選択）で統一

## 都市対応状況（2026-06-28更新）
- **SG（シンガポール）**: 稼働中
- **BKK（バンコク）**: 一時停止中（イベント数少ないため）
- **SYD（シドニー）**: 一時停止中（イベント数少ないため）

BKK/SYD 停止箇所:
1. `scripts/run-fetch-all.sh` — BKK/SYD fetchとcourseリフレッシュをコメントアウト済み。discover/analyzeも `--city=sg` に変更済み
2. `public/index.html` — `ACTIVE_CITIES = ['sg']` 定数で都市セレクトを制御

**復活手順:**
1. `index.html` の `ACTIVE_CITIES = ['sg']` → `['sg', 'bkk', 'syd']`
2. `run-fetch-all.sh` のコメントアウトを外し `--city=all` に戻す

## やってはいけないこと
- cronはシステムcrontabを使う（PM2 cronはスケジュール制御に不向きなため使わない）
- APIキー・秘密情報をログに出力しない
- DBを勝手に導入しない
- force pushしない

## 鉄則
どんな小さな修正でも必ずplanner→orchestratorの順で回す。

## エージェントの使い方
@planner → 設計書作成 → ユーザー承認
「承認します。@orchestrator 実行して」
→ builder→checker→closerが自動で動く
