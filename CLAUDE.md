# おでかけNavi (dosuru.app) - CLAUDE.md

## プロジェクト概要
シンガポール在住日本人向け週末おでかけ情報PWA。
ブランド名: Willoa / アプリ名: おでかけNavi

## ターゲットユーザー
シンガポール在住の日本人駐在員・家族（30〜40代中心）
日本語UI必須。スマホファースト。

## サーバー情報
- VPS: Contabo (IP: 194.233.82.43)
- ユーザー: masahiko
- プロジェクトパス: /home/masahiko/sg-weekend-app/
- ドメイン: dosuru.app（アプリ本体）/ about.dosuru.app（紹介LP）
- SSL: Let's Encrypt (Cloudflare DNS)

## サブドメイン
- **about.dosuru.app**: アプリ紹介LP（2026-07-04公開、2026-07-09ルートバグ修正）
  - ファイル: `public/about.html`
  - nginx: `/etc/nginx/sites-available/dosuru.app`内の3つ目のserverブロックに同居（Node.jsへプロキシ）
  - Express route: `GET /about` → `public/about.html`（パスベース）。`GET /`（ルートパス、Hostヘッダーが`about.dosuru.app`の場合のみ`about.html`を返す）は`server.js`内`express.static`直前に配置（2026-07-09追加）
  - App StoreのURLはプレースホルダー（審査通過後に差し替え）

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
├── ios-app/                       ← iOSアプリ化（Capacitor）2026-07-03追加
│   ├── package.json
│   ├── capacitor.config.ts
│   ├── Gemfile
│   ├── fastlane/
│   │   ├── Appfile
│   │   └── Fastfile
│   ├── resources/
│   │   ├── icon.png    ← 1024×1024px
│   │   └── splash.png  ← 2732×2732px
│   └── README.md       ← MacInCloud初回セットアップ手順
├── .github/
│   └── workflows/
│       └── ios-deploy.yml  ← releaseブランチpushで自動デプロイ
└── .claude/
    ├── plan.md
    ├── next.md
    └── session-log.md

## データ構造
カテゴリ: event / gourmet / sale / edu
主要フィールド: title, date, url, who, age, major_score

## コース機能（2026-06-22実装・2026-06-25 BKK/SYD対応・2026-06-26 候補3択対応・2026-06-27 予定表連携対応）
- ナビ: イベント（2026-07-10改名、旧称「期間限定」） / コース / 予定表 / 設定 の4タブ
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
- タイトル編集シート（`#title-edit-sheet`）: 2026-07-09に `.plan-modal` クラス方式（`.visible`トグル）に統一。旧インラインstyle（display:block/none）方式は廃止

## AIチャット機能の廃止（2026-07-09）
- AIチャットFAB（`fab-ai`）とチャットシート（`#chat-overlay`/`#chat-sheet`）はUIごと削除済み
- `server.js` の `/api/chat` エンドポイントは旧App Store版の後方互換のため残置（新規呼び出し元なし）
- `.chat-overlay` / `.chat-sheet-handle` / `.chat-mic-btn` クラスは pin-picker/emoji-picker/コースメモ音声入力（`course-note-mic-btn`）が共有するため引き続き使用

## PWAインストール・更新バナーの廃止（2026-07-09）
- 「ホーム画面に追加」誘導バナー（`#install-banner`）とService Worker経由の「アプリが更新されました」バナー（`#update-banner`）はUIごと削除済み（iOSアプリ（App Store配信）を正式な運用形態とするため）
- 削除対象だった `handleInstall()` / `showInstallBanner()` / `dismissInstallBanner()` / SW登録処理ブロック（`navigator.serviceWorker.register()`含む）はすべて撤去済み
- `openShareModal()`（設定画面「使い方」ボタンと共用のHOWTOモーダル）・`#share-modal`・`/api/version`・`@capacitor/app`バージョン取得処理は影響なし、従来通り残置
- `public/sw.js`本体は変更なし（Web版のオフライン対応・キャッシュ機構として残置。登録処理を削除したため新規訪問者には未登録になる点に注意）
- 既知の残存事項（対応不要・スコープ外）: `public/index.html`に到達不能な`#install-modal`（「ホーム画面に追加する」手順モーダル）が残存。開く関数`openInstallModal()`が存在せずorphaned markup。ボタンの`onclick="handleInstall()"`は関数削除済みで無効だが、到達不能なため実害なし

## iOSアプリ化（Capacitor）2026-07-03実装
- 方式: ローカルバンドル（webDir: `../public`）。Web版と同じHTMLをアプリ内に同梱
- appId: `app.dosuru.odenavi` / appName: `おでかけNavi`
- `_isCapacitorApp`: `window.Capacitor?.isNativePlatform?.()` で検出。app.js 先頭で定義
- `API_BASE`: Capacitor環境では `https://dosuru.app`、Web環境では空文字列。全fetchに付与済み
- GA4スキップ: `_isCapacitorApp` 時に `window.gtag = function(){}` でnoop化
- 外部リンク: `a[target="_blank"]` クリックを `Capacitor.Plugins.Browser.open()` でデバイスブラウザに渡す
- SW登録・インストールバナー・Push通知UI: Capacitor環境でスキップ/非表示
- CI/CD: `release` ブランチpush → GitHub Actions（macOS runner）→ Fastlane deploy → TestFlight配信（社内テストのみ、`distribute_external: false`）
- Fastlane: レーンは `deploy` のみ。中身は `upload_to_testflight`（App Store本番申請は含まない）
- App Store本番申請は現状このワークフローに含まれず、別途手動対応が必要
- GitHub Secrets: ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY / MATCH_PASSWORD / MATCH_GIT_BASIC_AUTH
- 初回セットアップ: MacInCloudで `npx cap add ios` → Xcode確認 → `fastlane match init` → GitHub Secrets登録
- 詳細手順: `ios-app/README.md` 参照

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
- 対応済み: イベントタブ（旧称「期間限定」）・コース機能全体・設定画面・予定表モーダル・ボトムナビ
- 未対応（スコープ外）: 共有カレンダー機能・インストールモーダル

### ⚠️ i18n 必須ルール
UI文字列を追加・変更するときは **必ず ja と en の両方を同時に対応** する。
- 静的HTMLにテキストを直書きしない。`data-i18n="キー名"` を付け、デフォルトテキストは日本語にする
- `app.js` の `STRINGS.ja` と `STRINGS.en` に **同じキーを同時に** 追加する
- JS側でテキストを生成する場合は `t('キー名')` を使う（ハードコード禁止）
- 変更後は英語モードに切り替えて目視確認すること（キー名がそのまま表示されたら追加漏れ）

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
- **z-index**: bottom-nav は `9999`固定。モーダル・ボトムシート・オーバーレイ系は原則`bottom-nav未満`（2026-07-09、全モーダルを10000番台→3000番台に統一。詳細は下記「z-index方針」参照）。overlay/modalのペアは相対的な重なり順（modalがoverlayより上）を維持すること
- **画面ヘッダー上部余白（2026-07-10統一、同日に縦センタリング起因のズレを再修正）**: ホーム/コース/予定表/設定の4画面すべて、上部余白は`env(safe-area-inset-top, 0px) + 20px`の1回のみの加算で統一する。
  - ホーム（`.app-header`）: `padding-top: calc(env(safe-area-inset-top, 0px) + 20px)`
  - コース（`#screen-course` + `.course-screen-header`）: コンテナに`padding-top: env(safe-area-inset-top)`、ヘッダーに`padding: 20px 20px 0; margin: 0;`（2箇所で分担、合計1回分）
  - 予定表・設定（`#screen-plan`/`#screen-settings` + `.plan-title-header`）: コンテナに`padding-top: env(safe-area-inset-top)`が既にあるため、`.plan-title-header`側は`padding: 20px 20px 0`のみ（safe-areaを重ねて加算しない）
  - ⚠️ 新しい画面を追加する際、コンテナとヘッダー要素の両方に`env(safe-area-inset-top)`を入れると二重加算になり、notch環境（safe-area-inset-top > 0）で他画面よりタイトルが大きくずれる。Web版（safe-area-inset-top=0）では気づけないため、実機での確認が必須
  - ⚠️ **`.plan-title-header`は`align-items: flex-start;`固定（2026-07-10修正）**: 以前`align-items:center`だったため、52pxの箱内でタイトルが縦センタリングされ、コース画面（`margin`方式で箱に上部paddingがない）で約9.5px、予定表画面（隣の「共有」ボタンが背高で箱が伸びる）で約10.5px、実機で余分に下にずれるバグがあった。`margin`方式もコースのみ`padding`方式に統一し、縦センタリングに依存しない決定的な位置にした。新しいヘッダーを`.plan-title-header`ベースで作る際は、内部要素の高さ差でズレが起きないことを実機で確認すること
- **画面タイトルのマークアップ**: `<span class="screen-title" data-i18n="...">`は、装飾用の親ラッパー（`.app-title`等の独自クラス）で包まない。子孫セレクタ（例: `.app-title span`）による意図しないCSS詳細度衝突で`.screen-title`本来のスタイルが上書きされる事故があったため、ヘッダーコンテナ（`.header-top`/`.plan-title-header`等）の直接の子要素として配置する

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

## 環境構成と注意事項（2026-07-07）

### Web版 = テスト環境 / iOS App Store版 = 本番環境

| 環境 | URL/配布 | 役割 |
|------|----------|------|
| Web版 | dosuru.app | 開発・確認用（テスト環境） |
| iOS App Store版 | App Store `id6787159354` | 本番（エンドユーザーが使う） |

⚠️ **重要: データ層は両環境で共有**

- `data/sg/events.json` / `model-courses.json` / `community-courses.json` などのデータファイル
- `/api/*` エンドポイント（events・courses・generate など）

これらはサーバー上で1つだけ存在し、**Web版とApp Store版の両方が同じデータを参照している。**

**Web版でテスト中に絶対やってはいけないこと:**
- イベントデータを大量削除・破壊的に更新する（本番App利用者に影響する）
- コース生成の挙動を壊すようなサーバー変更をデプロイしたまま放置する
- APIレスポンスの構造を非互換に変更する（旧App Store版が壊れる）

**対応方針:**
- データ構造の破壊的変更は、App Store版のリリースと同時に行う
- テスト用の一時データ変更は必ず元に戻してからコミットする
- APIを変更する場合は後方互換性を保つ（旧バージョンのアプリが動き続けるか確認）

## iOS / Capacitor 開発ノウハウ（2026-07-08）

### Web版とiOS版の関係
- **同一コード**: Capacitorは `public/` をバンドル。Web版とiOS版は完全に同じHTML/CSS/JS
- **`_isCapacitorApp`フラグ**で分岐: GA4スキップ / 外部リンク処理 / overscroll防止 / SW登録スキップ / インストールバナースキップ / Push通知UI非表示
- データは共有（events.json / API）。Web版でデータ破壊 = 本番App利用者への影響

### ❌ 絶対にやってはいけないこと

**`html, body { overflow: hidden; height: 100% }` を使わない**
→ WKWebView で bottom-nav が常に「上に上がった状態」で固定されてしまう副作用がある。overscrollをJSで制御する（下記参照）。

**スクリーンコンテナに `position: fixed` を使わない**
→ stacking context が生成され、その上に重なるはずの bottom-nav のクリックが効かなくなる。スクリーンは `height: calc(100dvh - 60px - env(safe-area-inset-bottom, 0px))` で通常フローに置く。

**overlay の z-index を bottom-nav (9999) より低くしない（旧ルール）**
→ モーダルオーバーレイが nav を隠せず、キーボード表示時に nav がオーバーレイの上に飛び出して見える。

**方針転換（2026-07-09、全モーダルに横展開して統一済み）**: ユーザーのUX判断により、モーダル表示中も bottom-nav を表示し続ける設計を正式採用。既存の全モーダル・オーバーレイを bottom-nav (9999) 未満の3000番台z-indexに統一済み（旧ルールの「10000番台にする」は廃止）。

| 要素 | z-index |
|---|---|
| `.plan-modal-overlay` | 3099 |
| `.plan-modal` / `.plan-sheet` / `#event-filter-sheet` | 3100 |
| `#title-edit-overlay` | 3101 |
| `#title-edit-sheet` | 3102 |
| `.cal-popup-overlay` | 3200 |
| `.cal-popup` | 3201 |
| `.pin-detail-overlay`（`pin-detail-modal`本体/`share-modal`/`cal-sync-modal`/`cal-join-modal`/`install-modal`共通） | 3300 |
| `.pin-detail-modal`（同上5要素共通） | 3301 |
| `#date-picker-overlay` | 3400 |
| `#date-picker-modal` | 3401 |
| `#schedule-plan-action-overlay` | 3500 |
| `#schedule-plan-action-sheet` | 3501 |

シート/オーバーレイのペアは「シート本体 ≥ 自身のoverlay」の相対関係を維持。`date-picker`のように親シート（`.plan-modal`/`.plan-sheet`=3100）の内側から開かれるネスト構造を持つ要素は、親より高い値にすること。新規モーダル追加時も原則この3000番台の方針（bottom-nav未満）に合わせる。

**PTR（プルトゥリフレッシュ）を実装しない**
→ WKWebView でヘッダーずれ・白いステータスバーの原因になる。一度問題になったので永久廃止。

### ✅ 正しいスクロール・レイアウトパターン

```css
/* 固定ヘッダー + スクロールコンテンツ の正解パターン */
.screen-wrapper {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 60px - env(safe-area-inset-bottom, 0px));
}
.screen-header  { flex-shrink: 0; }
.screen-content { flex: 1; min-height: 0; overflow-y: auto; }
/* flex: 1; min-height: 0; の両方が必要。min-height: 0 がないとオーバーフローしない */
```

### ✅ iOS overscroll（ゴムバンドスクロール）防止

```javascript
// touchmove を passive:false で登録し、必要な場合のみ preventDefault
document.addEventListener('touchmove', e => {
  const dy = e.touches[0].clientY - startY;
  let el = e.target;
  while (el && el !== document.documentElement) {
    const ov = window.getComputedStyle(el).overflowY;
    if (ov === 'auto' || ov === 'scroll') {
      if (el.scrollHeight > el.clientHeight) {  // ← 縦スクロール可能な要素のみ対象
        const atTop    = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if (dy > 0 && atTop)    { e.preventDefault(); return; }
        if (dy < 0 && atBottom) { e.preventDefault(); return; }
        return;
      }
      // ← scrollHeight <= clientHeight の要素はスキップ（overflow-x:auto の副作用でoverflow-y:autoになる水平カルーセルを除外）
    }
    el = el.parentElement;
  }
  e.preventDefault();
}, { passive: false });
```

**注意**: `overflow-x: auto` を設定すると CSS仕様で `overflow-y` も暗黙的に `auto` になる。そのため `scrollHeight > clientHeight` の条件チェックが必須。これがないと水平カルーセルで縦スクロールが効かなくなる。

### ✅ Capacitor キーボード設定

`capacitor.config.js` に設定するだけでなく、**`@capacitor/keyboard` パッケージのインストールも必須**。パッケージがないと設定は iOS ネイティブに反映されない（サイレントに無視される）。

```javascript
// capacitor.config.js
plugins: {
  Keyboard: {
    resize: 'none',  // キーボードがWebViewを縮小しない → ナビがキーボード裏に隠れる自然な挙動
  },
},
```

```json
// package.json
"@capacitor/keyboard": "^6.0.0"  // これがないと上記設定が効かない
```

**プラグイン取得は `registerPlugin()` を優先する（2026-07-09追記）**: `window.Capacitor?.Plugins?.Keyboard` だけに頼ると、Capacitor 6環境で `addListener` が動かないケースがある。`window.Capacitor.registerPlugin('Keyboard')` を先に試み、失敗時のみ従来方式にフォールバックする防御的実装にする。

```javascript
let _CapKB = null;
try {
  if (window.Capacitor?.registerPlugin) {
    _CapKB = window.Capacitor.registerPlugin('Keyboard');
  }
} catch (_) {}
if (!_CapKB) _CapKB = window.Capacitor?.Plugins?.Keyboard;
```

### ✅ 「トップへ戻る」FABのスクロール監視は内部スクロールコンテナを見る（2026-07-09修正）

画面本体が `overflow-y:auto` の内部コンテナ（例: `#home-scroll-content`）でスクロールする構成の場合、`window.addEventListener('scroll', ...)` は発火しない。`window.scrollY` も常に0のままで、FABの表示切り替え・`scrollTo`はその内部コンテナに対して行う。

```javascript
document.getElementById('home-scroll-content').addEventListener('scroll', () => {
  fab.classList.toggle('visible', document.getElementById('home-scroll-content').scrollTop > 300);
}, { passive: true });
```

### ✅ 全画面共通キーボード被り対策（2026-07-09実装 → 同日Web版無効化 → 同日「縮小+移動」方式に刷新）

`.plan-modal` / `.plan-sheet`（`#title-edit-sheet`は`.plan-modal`クラスを持つため自動的に含まれる）を対象に、**シートを縮小しながら移動する方式**（シート上端の位置は変えず、下端側だけキーボード分削る）。**JSによる制御はCapacitor環境限定**。Web環境はネイティブ挙動に完全に委ねてJS制御なし。

- `_adjustSheetForKb(sheet, kbH)`: 表示中シートの`max-height`（またはheight）を`kbH`分縮小 + `bottom`を`kbH`に設定。`curH <= kbH + 80`の場合は縮小をスキップ（小さいシートで縮めすぎて表示崩れするのを防ぐガード）。どちらのプロパティを縮小したかは`sheet.dataset.kbIsMaxH`に記録
- `_resetSheetAfterKb(sheet)`: `dataset.kbIsMaxH`を見て`maxHeight`または`height`のうち縮小した方だけを元に戻し、`bottom`もリセット
- `_liftVisibleSheetForKeyboard(kbHeight)`: `document.querySelectorAll('.plan-modal.visible, .plan-sheet.visible')`で表示中の全シートに`_adjustSheetForKb`を適用。縮小後`setTimeout`内で、フォーカス中の入力欄が縮小後のシート下端から一定の余白（`MARGIN=16px`）を保てるよう`overflow = fRect.bottom - (sRect.bottom - MARGIN)`を計算し、`overflow > 0`の場合のみ内部スクロールコンテナ（`.plan-modal-body`等）を`scrollBy({top: overflow, behavior:'smooth'})`で動かす（2026-07-10改修。旧`focused.scrollIntoView({block:'nearest'})`は要素下端をスクロールコンテナ下端に密着させてしまい余白が生まれない問題があった）
- `_resetSheetKeyboardOffset()`: 対象シート全てに`_resetSheetAfterKb`を適用
- Capacitor環境: `@capacitor/keyboard` の `keyboardWillShow`/`keyboardWillHide` ネイティブイベントから共通関数を呼ぶ（正確な高さ取得。`resize:'none'`でネイティブ追従が起きないためJS制御が必須）。プラグイン未検出時は `focusin`/`focusout` + `visualViewport.height` によるフォールバック
- **Web環境（iOS Safari/Android Chrome含む）: JSによるシート操作は一切行わない。** モバイルSafariには`position:fixed;bottom:0`要素をキーボード表示時にvisualViewportの可視領域へ自動追従させるネイティブ挙動があり（設定画面でボトムナビが一緒に上がる現象と同じ）、`.plan-sheet`/`.plan-modal`もこの対象になる。ここにJSで`bottom`を加算すると「ネイティブ追従分」+「JS加算分」の二重適用となり、キーボード高さの約2倍押し上げられてシートが画面上端を超えて完全に消える重大バグになった（2026-07-09発覚・当日中に修正）
- `.plan-modal` / `.plan-sheet` に `transition: bottom 0.2s ease` を追加し、Capacitor環境での縮小移動/リセットをアニメーションさせる

**⚠️ なぜ「持ち上げるだけ」ではなく「縮小+移動」なのか（2026-07-09オーバーシュート修正の経緯）**:
`.plan-modal`/`.plan-sheet`は`max-height: 88vh`。画面上部の余白はわずか12vhしかない。単純に`sheet.style.bottom = kbHeight + 'px'`でシート全体を持ち上げるだけだと、シート上端も`kbHeight`分だけ画面上方向に押し上げられる。iPhoneのソフトウェアキーボード高さ（日本語キーボード、候補バー込みで概ね300〜350px）は画面上部の余白（iPhone14/15クラスで約101〜112px）を大きく超えるため、コンテンツ量が多く実高さが`88vh`近くまで達するモーダル（「予定を追加」等）では上端が画面外・ステータスバー裏まで突き抜けた。「縮小+移動」方式（高さを`kbH`分縮め、`bottom`も`kbH`分動かす）なら**シート上端の位置は変わらない**（下端側だけがキーボード分削られて画面内に収まる）ため、この問題が原理的に発生しない。

**⚠️ 実装時の注意**:
1. `_liftVisibleSheetForKeyboard`に「シート全体を持ち上げた後、フォーカス要素がまだ隠れていたら内部スクロール可能な祖先要素の`scrollTop`も追加操作する」フォールバックを**足さないこと**。内部スクロール領域を持つシートで「シートが上がりすぎる」二重対応バグになる（一度実装され修正済み）
2. **Web環境で`visualViewport.resize`から`_liftVisibleSheetForKeyboard`/シート操作を呼ばないこと**。ネイティブ追従と二重適用になりシートが消える（一度実装され2026-07-09に撤去済み）。Web環境はブラウザのネイティブ挙動に完全に委ね、JS側は何もしない
3. `_screenH`（キーボード表示前の画面高さ）は`let`で保持し、`_resetSheetKeyboardOffset()`実行時（＝キーボードが閉じた正しいタイミング）にのみ再取得する（Capacitor環境でのみ使用）
4. `curH <= kbH + 80`のガード値はやや恣意的。実機テストで表示崩れがあれば調整する

### ⚠️ z-index是正時は「companion要素」だけでなく「子シート」も辿って確認する（2026-07-09追記）

`.plan-modal-overlay`/`.plan-modal`のようなoverlay+本体のペアだけでなく、同じ構造を持つ**別クラス**（`.plan-sheet`等）にも是正漏れが起きやすい。あるz-index値を変更したら、以下を横展開で確認すること:

1. 同じCSSクラスを使う他の要素（`.plan-sheet`は`#course-sheet`と`#course-detail-sheet`の2箇所で共有されていた）
2. その要素の**内側から開かれる子シート**（`#course-detail-sheet`内の「タイトルを編集」ボタンが開く`#title-edit-sheet`など）。親のz-indexだけ上げて子のz-indexを据え置くと、子シートが親の背後に隠れる新規バグになる
3. 最終的なz-index順序を一覧化し、意図した重なり順（overlay < 本体 < 子シート < 日付ピッカー等のさらに上位シート）になっているか確認する

### ⚠️ `resize:'none'`下のキーボード回避フォールバックは「スクロール可能判定」に頼らない（2026-07-09追記）

`Keyboard: { resize: 'none' }`設定下では、キーボード表示中も`clientHeight`はビューポート全体のまま変化しない。そのため「`overflowY === 'auto' && scrollHeight > clientHeight`（＝物理的にスクロール可能かどうか）」で祖先要素を判定する方式は、**コンテンツ量が少ない画面では常にfalseになり、実際にはキーボードに隠れているのにフォールバック処理が発火しない**という誤判定を起こす。

正しい判定は「スクロール可能かどうか」ではなく「フォーカス要素が実際に画面のどこにあるか」:

```javascript
const rect = focused.getBoundingClientRect();
const visibleBottom = _screenH - kbHeight - 24; // キーボード上の余白
const overflow = rect.bottom - visibleBottom;
if (overflow > 0) {
  // 祖先の overflow-y:auto/scroll 要素の scrollTop を overflow 分だけ動かす
  // （スクロール可能かどうかに関わらず操作を試みる。動かせない場合は実害なし）
}
```

### ✅ CSSキャッシュバスティング手順（セットで変更必須）

```html
<!-- index.html -->
<link rel="stylesheet" href="/app.css?v=YYYYMMDDX">
```
```javascript
// sw.js
const CACHE_NAME = 'sg-weekend-vXXX';  // 数字を上げる
```
**両方同時に変更しないと古いCSSがServiceWorkerにキャッシュされたまま残る。**

### ✅ iOS ステータスバー

GitHub Actions の workflow で Info.plist を直接書き換えて設定:
```yaml
- name: Set status bar style in Info.plist
  run: |
    /usr/libexec/PlistBuddy -c "Add :UIViewControllerBasedStatusBarAppearance bool false" ios/App/App/Info.plist || \
    /usr/libexec/PlistBuddy -c "Set :UIViewControllerBasedStatusBarAppearance false" ios/App/App/Info.plist
    /usr/libexec/PlistBuddy -c "Add :UIStatusBarStyle string UIStatusBarStyleDarkContent" ios/App/App/Info.plist || \
    /usr/libexec/PlistBuddy -c "Set :UIStatusBarStyle UIStatusBarStyleDarkContent" ios/App/App/Info.plist
```

### ✅ iOS カメラ許可（NSCameraUsageDescription）

`Info.plist`はリポジトリに含まれず`npx cap add ios`実行時に毎回生成されるため、`getUserMedia()`等でカメラを使う機能（QRスキャナー等）がある場合、CIワークフロー内でのPlistBuddy追記が必須。設定漏れがあると審査は通ってもTestFlight/本番でカメラが起動できない（サイレントに失敗する）ので要注意:
```yaml
- name: Set camera usage description in Info.plist
  run: |
    cd ios-app
    /usr/libexec/PlistBuddy -c "Add :NSCameraUsageDescription string 予定表の共有グループに参加するためQRコードを読み取ります" ios/App/App/Info.plist || \
    /usr/libexec/PlistBuddy -c "Set :NSCameraUsageDescription 予定表の共有グループに参加するためQRコードを読み取ります" ios/App/App/Info.plist
```

### ✅ Instagram API: CAROUSEL_ALBUM 対応

`CAROUSEL_ALBUM` タイプの投稿は `media_url` がルートに返ってこない。`children` を必ずリクエストする:
```javascript
// fields に children{media_url,thumbnail_url} を追加
`business_discovery.username(${username}){media{caption,media_url,thumbnail_url,media_type,timestamp,permalink,children{media_url,thumbnail_url}}}`

// 画像取得ロジック
const image = post.media_type === 'VIDEO'
  ? post.thumbnail_url
  : post.media_type === 'CAROUSEL_ALBUM'
    ? (post.children?.data?.[0]?.media_url || post.media_url)
    : post.media_url;
```

### ✅ TestFlight デバッグのコツ

- Web版で直らない場合でもiOSで直ることがある（WKWebView固有の挙動）
- CSSの変更はSW経由でキャッシュされるため、バージョンを上げないと反映されない
- `pm2 restart sg-weekend` は Web版のみ。iOS版は TestFlight ビルドが必要
- ビルド時間: GitHub Actions → TestFlight 反映まで約15〜20分

### ✅ onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック（2026-07-10）

ボトムナビ・FAB等は応答性向上のため`touchend`にJSハンドラ（`e.preventDefault()`で後続clickを抑制する設計）を登録しつつ、HTML側にも`onclick`属性を残す二重登録になっている箇所が多数ある（元々はネイティブclickイベントの座標がスクロール後にずれて信頼できなかったために`touchend`ハンドラが追加された経緯）。

**問題**: iOS WKWebViewでは`touchend`の`preventDefault()`によるネイティブclick抑制が確実に効かないケースがある。過去のタップに対する遅延・ゴースト状態のclickイベントが、しばらく経ってから発火し、`onclick`属性を直接トリガーしてしまう（実機ログで`switchNav@app.js:1505`ではなく`onclick@capacitor://localhost:502`から呼ばれている証拠を確認）。

**やってはいけない対処**: `onclick`属性を全削除する。タッチ非対応のデスクトップブラウザ（マウス操作、Web版）では`touchstart`/`touchend`が発火しないため、ボタンが完全に反応しなくなる。

**正しい対処**: `onclick`属性は残したまま、タッチ操作が一度でも検出された端末では以降の全clickイベントをcaptureフェーズで握りつぶすグローバルな仕組みを追加する（`public/app.js`の`_isCapacitorApp`検出ブロック直後に配置済み）。

```js
// ─── タッチ端末でのゴースト遅延クリック無害化 ───
let _touchCapableDetected = false;
document.addEventListener('touchstart', () => { _touchCapableDetected = true; }, { passive: true, capture: true });

document.addEventListener('click', e => {
  if (_touchCapableDetected) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true); // captureフェーズで登録し、onclick属性より先にブロックする
```

- タッチ操作が一度でも発生した端末（iOS/Android実機、モバイルブラウザ）では、以降の`click`イベントがcaptureフェーズで即座に止められるため、`onclick`属性（遅延ゴーストクリック含む）が発火することは二度とない
- タッチ操作が一度も検出されない端末（PCのマウス操作）では`_touchCapableDetected`は`false`のままなので、`onclick`属性は従来通り機能する
- 各ボタンの`touchend`即時タップハンドラは変更不要。タッチ端末では常にこちらが正規の実行経路になる

## server.js編集時の注意（2026-07-09追記）
- `server.js`内、47〜200行目付近は無効化中のStripe決済コードが`/* ... */`で丸ごとコメントアウトされている。この範囲に新しいルートを追加すると**サイレントに一切発火しない**（エラーも出ない）ため要注意
- ルート追加時は必ず追加後に`grep -n "^/\*\|^\*/"`等でコメントブロックの範囲を確認し、対象行が有効なコード領域にあるか確認する
- 新規ルート追加後は`curl -H "Host: xxx"`等で実際にレスポンスを検証してから完了報告すること（行番号だけを頼りに配置場所を判断しない）

## 実機デバッグ用ログ収集機能（2026-07-10追加）
ユーザーはMacを保有しておらずSafari Web Inspectorでのリアルタイムデバッグができないため、**サーバーにログを送信し、ファイルとして記録する方式**を標準デバッグ手段として恒久的に用意している。

- クライアント側: `public/app.js`冒頭（`API_BASE`定義の直後）に`_sendDebugLog(event, data)`関数を定義済み。**コード中の任意箇所から呼び出し可能**（fire-and-forget、送信結果は待たない・エラーも無視する）
  ```js
  _sendDebugLog('some_event_name', { anyKey: anyValue });
  ```
- サーバー側: `server.js`の`POST /api/debug-log`エンドポイントで受信し、`logs/debug-nav.log`に1行1JSONで追記する（認証なし）
- 確認方法: サーバーにSSHで入り`logs/debug-nav.log`を直接読む（`cat`/`tail -f`。Claudeが代理で読むことも可能）
- **この基盤機能自体（`_sendDebugLog`関数・`/api/debug-log`エンドポイント）は削除しない。** 今後も難しい不具合の実機調査に使い回す前提の恒久ユーティリティ
- 個々の調査のために追加した**計装ポイント（呼び出し箇所）は使い捨て**であり、原因特定後に削除してよい（現在進行中の計装ポイントは`.claude/next.md`を参照）
- ⚠️ 注意: `logs/debug-nav.log`にはサイズ上限・ローテーションを設けていない。認証もないため誰でもPOST可能。長期間放置するとディスクを圧迫する可能性がある点に注意（定期的に内容を確認し、不要になったら手動で削除する）

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
