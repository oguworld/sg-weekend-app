# SG在住Navi (dosuru.app) - CLAUDE.md

**簡潔さを保つため、決定事項の詳細な経緯・過去の不具合修正/微調整のストーリーは`CLAUDE_HISTORY.md`に分離してある**（本ファイルは毎ターン自動読み込みされるため）。ある挙動を変更する前に「なぜ今の実装になっているか」を確認したい場合は、該当キーワードで`CLAUDE_HISTORY.md`をgrepしてから読むこと。

## プロジェクト概要
シンガポール在住日本人向け週末おでかけ情報PWA。ブランド名: Willoa / アプリ名: SG在住Navi（旧名: おでかけNavi）。ターゲット: シンガポール在住の日本人駐在員・家族（30〜40代中心）。日本語UI必須・スマホファースト。

## サーバー情報
- VPS: Contabo (IP: 194.233.82.43)、ユーザー: masahiko、プロジェクトパス: `/home/masahiko/sg-weekend-app/`
- ドメイン: `dosuru.app`（アプリ本体）/ `about.dosuru.app`（紹介LP）。SSL: Let's Encrypt (Cloudflare DNS)

### サブドメイン about.dosuru.app（紹介LP）
- ファイル: `public/about.html`。nginx: `/etc/nginx/sites-available/dosuru.app`内3つ目のserverブロック(Node.jsへプロキシ)。Express route: `GET /about`(パスベース)、`GET /`(Hostヘッダーが`about.dosuru.app`の場合のみ)
- App StoreのURL: `https://apps.apple.com/sg/app/sg%E5%9C%A8%E4%BD%8Fnavi/id6787159354`
- 現行機能一覧「5つの便利な機能」（くらし情報/おでかけ情報/カレンダー/気温・PSI・為替/ピン留めの順）・スクリーンショット4枚(1170×2309px統一)は2026-09-09時点の実機最新版と同期済み。`public/privacy.html`/`public/contact.html`（`public/css/about-shared.css`共有）ともに柳グリーン配色で統一済み
- **このLPのレイアウト微調整（角丸・余白・クロップ位置等）は過去に非常に多くの反復があった。次に触る際はブラウザ実機で確認しながら調整すること**（詳細経緯は`CLAUDE_HISTORY.md`参照、数値だけ復元しても実機での見え方は保証されない）

## 起動・操作コマンド
```
pm2 restart sg-weekend
pm2 logs sg-weekend
pm2 status
```

## スタック
- バックエンド: Node.js / Express。フロントエンド: Vanilla JS / Tailwind CSS / PWA。インフラ: nginx / PM2 / Let's Encrypt
- データ: `events.json`/`sales.json`等（ファイルベース、DBなし）

## フォルダ構成
```
sg-weekend-app/
├── server.js
├── scripts/
│   ├── fetch-events.js             ← おでかけイベント取り込み
│   ├── filter-events.js            ← イベントのHaiku分類・Sonnet記事生成
│   ├── fetch-life-info.js          ← 生活情報・ニュースのRSS取り込み
│   ├── fill-images.js              ← 既存イベントへの画像補完
│   └── lib/unsplash.js
├── data/
│   ├── sg/
│   │   ├── events.json / life-info.json(gitignore対象) / calendar-events.json(gitignore対象、手動キュレーション、年1回更新要)
│   │   ├── model-courses.json 等   ← コース・探訪機能削除済み(設計書178)の残置データ、APIは削除済み
│   │   └── school-calendar.json / sponsored-cards.json 等
│   ├── bkk/ / syd/ (同様、現在停止中都市)
├── public/
│   ├── index.html                  ← ボトムナビ4タブ: くらし/おでかけ/カレンダー/設定
│   └── sw.js
├── ios-app/                        ← iOSアプリ化（Capacitor）
├── .github/workflows/ios-deploy.yml
└── .claude/{plan.md, next.md, session-log.md}
```

## データ構造
カテゴリ: event / gourmet / sale / edu。主要フィールド: title, date, url, who, age, major_score

## 現在の主要機能構成
探訪（スタンプラリー）・コース・予定表・共有カレンダー機能は完全削除済み。ボトムナビは4タブ（アイコン付き、`data-i18n`表示ラベル基準）:

- **くらし** 🏛️(`#screen-news`/`#nav-news`): 日本人在住者向けニュースサイトのキュレーション。カテゴリ7種: 新着/SG政府/交通/医療・健康/天候・災害/コミュニティ/教育・子育て
- **おでかけ** 🏖️(`#screen-home`/`#nav-home`): イベント情報キュレーション。カテゴリ7種: 新着/イベント(→「限定イベント」に改称)/展示・公演/グルメ・フェア/プロモ・お得/新規オープン/旅行。PRカード枠あり(現状非表示)
- **カレンダー**(`#screen-calendar`): 下記「カレンダー機能」参照
- **設定** ⚙️(`#screen-settings`/`#nav-settings`): プロフィール・アカウント連携(Google/Apple Sign-In)・データバックアップ・言語切替(UIは日本語固定)・アカウント削除等

ピン留めは独立タブではなく、くらし・おでかけ画面のみに表示されるクリップ型FAB(`#fab-pin`)から開くボトムシート(`#pin-sheet-overlay`/`#pin-sheet`)。**コメント機能は完全削除済み**(バックエンドAPI4本・フロント関数群・CSS・`data/sg/comments.json`とも削除。`generateEventPost()`等のX投稿/LINE通知本体ロジックは無関係のため残置)。

## 広告表示機能（実装済み・2026-07以降停止中）
コード自体は削除せず残置、停止中。
- **PRカード**: `data/{city}/sponsored-cards.json`が空配列のため非表示。再開は同ファイルへのデータ追記のみ(`_pickSponsoredCardForToday()`は無変更)
- **Klookアフィリエイトウィジェット**: `renderEventCards()`内のマーカー挿入`splice`をコメントアウトして停止中。再開はコメントアウト解除のみ

## Google/Apple Sign-In認証基盤
Google Sign-In・Sign in with Appleに対応。予定表データ/共有カレンダーとのユーザー紐づけは未実装。

- **認証情報最小化**: サーバーが保存・利用するのは`idToken`の`sub`クレームのみ。`data/users.json`スキーマは`userId`/`provider`/`providerSub`/`createdAt`/`lastLoginAt`/`subscriptions`のみ(email・氏名・画像は含まない)
- **サーバー(`server.js`)**: `POST /api/auth/google`(`google-auth-library`)／`POST /api/auth/apple`・`GET /api/auth/apple/state`・`POST /api/auth/apple/callback`(`apple-signin-auth`、Web版はCSRF対策の`state`+`response_mode:'form_post'`)／`GET /api/auth/me`／`DELETE /api/auth/me`(アカウント削除: `data/users.json`削除+`data/user-plans/{userId}.json`削除+全都市`community-courses.json`の該当`authorId`をnullに匿名化、コース自体は削除しない)／`GET /api/config`。`verifyAppJwtOptional()`は後方互換認証用
- **iOS版**: `@codetrix-studio/capacitor-google-auth`・`@capacitor-community/apple-sign-in`。Google用URL SchemeはCIで`Info.plist`に自動注入(`plistlib`使用)。`App.entitlements`に`applesignin` capability
- **Web版**: Google Identity Services `renderButton()`方式(One Tap `prompt()`は不使用)／Apple公式JSボタン(`scope:''`で同意画面を出さない)
- **トークン保存**: `authedFetch()`が`localStorage`の`app_auth_token`を自動付与。iOS版は`@capacitor/preferences`をソースオブトゥルースとする3層ハイブリッド(`_authTokenCache`同期変数／`localStorage`ミラー／`Preferences`永続化)。`refreshLoginUI()`は401以外のサーバーエラー時トークンを破棄しない
- **設定画面UI**: 「アカウント」セクション(ログイン+バックアップ統合)。ログアウトは確認ダイアログあり
- **アカウント削除**(App Store Review Guideline 5.1.1(v)対応): 設定画面最下部に見出しなし・中央寄せ(`--terracotta`色)で独立配置、未ログイン時は非表示。`confirm()`後にサーバー側削除→ローカルのJWT・バックアップ鍵material・saltを一括クリア(500系エラー時はローカル状態を保持)

## プライバシーポリシー
`public/privacy.html`にGoogle/Appleアカウント識別子(subのみ保存)・バックアップデータ(ゼロ知識暗号化)・共有カレンダーデータ・アカウント削除の記載あり。文言はCLAUDE.mdに記録された技術的事実の範囲でのみ記述(誇大な安全性主張はしない方針)。

## データバックアップ（端末移行用、ゼロ知識暗号化）
設定画面から任意でパスフレーズを設定すると、端末移行用に一部データをサーバーへゼロ知識暗号化(PBKDF2+AES-256-GCM、サーバーはパスフレーズ自体を保存しない)バックアップできるオプトイン機能。

- **現状バックアップ対象は`{version, genres, who, ageList, avatar}`のみ**(ジャンル設定・家族構成・年齢リスト・アバター絵文字。コース/探訪/予定表削除に伴い縮小済み)。「アカウント連携時にバックアップ必須」方針も撤回済み、完全にオプトイン
- **API**: `GET/PUT /api/user-plans/me`(`requireAppAuth`必須、`data/user-plans/{userId}.json`に`{userId, salt, encryptedData, updatedAt}`のみ保存)
- **UI**: 設定画面「アカウント」セクション内、`renderBackupSection()`＋パスフレーズ入力シート(`#backup-passphrase-sheet`)
- **設定画面構成**: プロフィール→アカウント(ログイン+バックアップ統合)→アプリ設定→サポート・情報→フィードバック→アカウント削除の6セクション
- **App Store審査対応(プライバシーマニフェスト)**: `@codetrix-studio/capacitor-google-auth`が古いSDKに依存し審査で`ITMS-91061`エラーになるため、CIで`GoogleSignIn`/`GTMAppAuth`/`GTMSessionFetcher`用の`PrivacyInfo.xcprivacy`(`ios-app/PrivacyManifests/`)をビルド時に注入(`scripts/ensure-privacy-manifests.py`、`Podfile`の`post_install`フックに冪等挿入)

## PWA・Service Worker
- 「ホーム画面に追加」誘導バナー・「アプリが更新されました」バナーはUIごと削除済み(iOSアプリ=App Store配信を正式運用形態とするため)
- **SW登録は`public/app.js`の初期化処理内**(Web版プッシュ通知の`navigator.serviceWorker.ready`依存＋SW更新時の自動反映のため必要)。登録時に`navigator.serviceWorker.controller`が既にあった場合(既存訪問者のSW更新時)のみ`controllerchange`で1回だけ`location.reload()`(フラグ`_hadController`で新規訪問者と区別)
- 既知の残存事項(対応不要): `public/index.html`に到達不能な`#install-modal`が残存(orphaned markup、実害なし)

## アプリアイコン・スプラッシュ画面
アイコンは「シンガポール島スカイライン＋コンパス針のピン」（現在はアプリアイコンのみ背景を無地白に変更済み、スプラッシュ画面のスカイライン背景は無変更）。

- **Web版**: `dosuru-icon.png`(1024x1024マスター)→`node generate-icons.js`で`public/icons/icon-{72,96,128,144,152,192,384,512}.png`・`apple-touch-icon.png`・`favicon.png`を生成。差し替え時は必ずマスター差し替え→スクリプト再実行の手順を踏む
- **iOSネイティブアイコン**: `ios-app/resources/icon.png`(1024x1024、RGB・アルファチャンネルなし必須)
- **iOSスプラッシュ画面**: `ios-app/resources/splash.png`(ライト)・`splash-dark.png`(ダーク)とも2732x2732。ロゴ+テキストブロックは縦42.5%位置(中央よりやや上寄せ)、scale 0.82に縮小配置。次回アイコンを差し替える際は画像解析で背景色差分を検出→新素材の背景を到達先背景色に補正→`composite()`→境界をピクセル値で検証、という手順を踏むこと(詳細は`CLAUDE_HISTORY.md`参照)
- **Web Push通知アイコン**: `public/sw.js`は`public/icons/icon-192.png`/`icon-512.png`(PNG、`.svg`ではない)を参照。アイコン変更時は`STATIC_ASSETS`配列と`showNotification()`内`icon`/`badge`パスが実在ファイルと一致するか必ず確認
- **iOSプッシュ通知アイコン(Notifications 20pt)は`@capacitor/assets`のシングルサイズ生成では反映されない**: `npx capacitor-assets generate --ios`はホーム画面用(60pt/76pt)のみ自動生成し、Notifications用20ptサイズは対象外。**現行方式**: `.github/workflows/ios-deploy.yml`内でシングルサイズの`Contents.json`/pngを使わず、`ios-app/resources/icon.png`からiOS標準のフルサイズAppIconセット一式(18ファイル)を`sharp`で生成し`AppIcon.appiconset`を丸ごと置き換える。`build_app`後に`xcrun assetutil --info`で`Assets.car`内の20x20エントリ存在を診断ログ出力(失敗してもデプロイは継続)。**新ビルド配信後、ユーザー側で一度アプリを完全アンインストール→再インストールしないと端末側キャッシュにより旧アイコンのまま残ることがある**

## iOSアプリ化（Capacitor）
- 方式: ローカルバンドル(`webDir: '../public'`)。Web版と同じHTMLをアプリ内に同梱
- appId: `app.dosuru`（`ios-app/capacitor.config.js`で確認） / appName: `SG在住Navi`
- `_isCapacitorApp`: `window.Capacitor?.isNativePlatform?.()`で検出(`app.js`先頭)
- `API_BASE`: Capacitor環境では`https://dosuru.app`、Web環境では空文字列。**全fetchに必須付与**
- GA4は`_isCapacitorApp`時に`window.gtag = function(){}`でnoop化。外部リンクは`a[target="_blank"]`クリックを`Capacitor.Plugins.Browser.open()`へ。SW登録・インストールバナーはCapacitor環境でスキップ/非表示
- CI/CD: `release`ブランチpush→GitHub Actions(macOS runner)→Fastlane deploy→TestFlight配信(社内テストのみ、`distribute_external: false`)。Fastlaneレーンは`deploy`のみ(`upload_to_testflight`、本番申請は含まない・別途手動対応要)
- GitHub Secrets: `ASC_KEY_ID`/`ASC_ISSUER_ID`/`ASC_PRIVATE_KEY`/`MATCH_PASSWORD`/`MATCH_GIT_BASIC_AUTH`
- 詳細手順: `ios-app/README.md`参照

## iOSアプリのAPNsプッシュ通知対応
Web版(VAPID/Web Push)とは完全独立の仕組みとしてiOSネイティブPush(APNs)に対応、既存Web Pushと並存。

- サーバーから`@parse/node-apn`経由でAPNsへ直接送信。`APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID`/`APNS_PRIVATE_KEY`未設定なら`apnProvider = null`で正常起動しiOS向け送信のみスキップ
- データモデル: 購読情報に`platform`(`'web'`/`'ios'`)フィールド。web: `{platform:'web', endpoint, keys}` / ios: `{platform:'ios', deviceToken, registeredAt}`
- API: `POST/DELETE /api/push-subscribe-ios`。`sendPushToAll()`内で`platform`別に振り分け送信。無効トークン(410/BadDeviceToken/Unregistered)は自動削除
- クライアント: `_isCapacitorApp`時は`_initNativePush()`/`_toggleNativePush()`(`@capacitor/push-notifications`)。デバイストークンは`@capacitor/preferences`をソースオブトゥルースとするハイブリッド方式で永続化
- **ユーザーのON/OFF意思とOS許可状態は別軸で管理**: `app_push_enabled`フラグを永続化し、OS許可(granted)とユーザー意思の両方が揃ったときのみ`register()`
- iOS/CI: `App.entitlements`に`aps-environment: production`。`scripts/ensure-apns-bridge.py`が`AppDelegate.swift`にAPNsブリッジメソッドを冪等注入(無ければCI失敗)
- スコープ外: Android版、通知既読管理・一覧UI、パーソナライズ配信、FCM、サイレントプッシュ、通知文言多言語化

## ジャンル・興味機能（UI非表示・実質不使用）
設定画面「ジャンル・興味」セクションは`display:none`で非表示化済み。ロジック(`GENRE_LIST`等)は削除していないため、再開時はUI非表示解除のみで動く。

## イベントカードのDOM差分更新
`renderEventCards()`は`grid.innerHTML`一括再代入ではなく、**イベントID+言語をキーにしたDOM要素キャッシュ(`_cardElCache`)による差分更新**方式(Instagram埋め込み等`<iframe>`を含むカードの不要な再読み込みを避けるため)。
- 既存キャッシュがあれば`renderEventCard()`を呼ばずDOM要素を再利用、新規のみ`_getOrCreateCardEl()`で生成。除外カードは破棄せず`display:none`。`loadEventData()`冒頭で`_cardElCache.clear()`
- 画像読み込み失敗時は`handleImgError()`が1.2秒後に1回だけ自動リトライしてから絵文字フォールバック
- **同様のパターンを他画面に導入する際の注意**: `grid.innerHTML`丸ごと再代入が別分岐に残っていると、そこでキャッシュ済みノード(iframe含む)がdocumentから切り離され破棄される

## 公開いいね機能（設計書210）
「くらし」「おでかけ」各カードに、全ユーザーに見える公開の「いいね数」表示（例: `❤️ 12`）。個人用のお気に入り（ピン留め）とは別物、人気度の可視化が目的。

- **確定仕様**: ログイン不要・取り消し（アンいいね）機能なし（一度押したら押しっぱなし、Instagram的な片道仕様）。連打・水増し防止は端末の`localStorage`のみ（ピン留めと同方式）、**サーバー側はIPレート制限等を入れず「1リクエストにつき+1固定」でパラメータ改ざん（負の値・大量加算）のみ防ぐ**方針（ユーザー明示承認済み）
- **データ**: `data/sg/likes.json`（`data/`配下のためgitignore対象）。キー形式`{itemType}:{itemId}`（`itemType`は`event`|`news`）、値`{count}`
- **API**（`server.js`）: `GET /api/likes?itemType=event|news`（全件一括取得、`likes.json`未存在なら`{}`）／`POST /api/likes`（`{itemType,itemId}`、常に+1固定、`withFileLock`でアトミック処理）。いずれも認証不要
- **クリーンアップ**: `scripts/fetch-events.js`の`purgeExpiredData()`直後・`scripts/fetch-life-info.js`のリテンション削除直後、それぞれ`purgeOrphanedLikes()`（各ファイルに重複定義）が現存ID集合に含まれない`likes.json`内キーを削除
- **フロント状態管理**: `likedKey()`/`getLikedItems()`/`saveLikedItems()`（`localStorage`、ピン留めパターン踏襲）、`LIKE_COUNTS = {event:{}, news:{}}`（メモリキャッシュ、`loadLikeCounts()`で`loadEventData()`/`loadLifeInfoNewsScreen()`時に取得）、`likeItem()`（楽観的UI、POST失敗時もローカル状態は維持しロールバックしない）
- **`_cardElCache`との整合（重要）**: `renderEventCards()`のforEachループ内で、キャッシュヒット/新規生成いずれの場合も`.like-btn`の件数・いいね済み状態（ハート塗りつぶし）を`LIKE_COUNTS`/`getLikedItems()`の最新値で都度同期する処理が必須（上記「イベントカードのDOM差分更新」の注意点と同じ理由）
- **くらしカード**（`_lifeInfoCardHtml()`）は`innerHTML`一括再代入方式のため、件数をテンプレート文字列に直接埋め込むのみでよい（差分更新の特別対応不要）
- ピン留め画面（`renderPinList()`/`renderNewsPinList()`）は`renderEventCard()`/`_lifeInfoCardHtml()`を再利用しているため、いいねボタン・件数は自動的に反映される
- **スコープ外**: いいね取り消し、いいねユーザー一覧、サーバー側IPレート制限、ランキング機能、ホームプレビュー（`_lifeInfoPreviewCardHtml()`）へのいいね表示

## i18n対応（廃止済み、日本語固定の内部実装として存続）
英語対応(多言語切替)は「実際には使われておらず紛らわしい」との判断で廃止。**`t(key)`関数・`data-i18n`属性・`applyI18n()`自体は削除せず残っている**(常に日本語を表示する内部実装として存続)。

- `STRINGS.en`は削除済み(`STRINGS.ja`のみ)。`getLang()`は常に`'ja'`を返す(`localStorage`は参照しない)。`t(key)`は`STRINGS.ja`のみ参照
- 言語切替ボタン(`#lang-toggle-btn`)・`setLang()`は削除済み。`isEn`系の到達不能分岐は全削除済み
- 既存データの英語フィールド(`content_en`等)は生成・保存されなくなった。`data/bkk/`/`data/syd/`(停止中都市)には旧`content_en`が残存するが対象外
- **新しいUI文字列を追加する場合、`data-i18n`属性＋`STRINGS.ja`へのキー追加のみでよい(英語キーは不要)**

## X自動投稿（scripts/post-to-x.js）
- ペルソナ: 日本・SG両方フラットに見る30-40代男性(`PERSONA`定数)。投稿タイプ: event/news/life を自動選択
- **文字数・文体はタイプごとに異なる**: event/news = 日本語80文字程度、客観的紹介文(`TONE_GUIDE`定数、個人の感想・一人称は含めない)／life = 40文字以内、個人のつぶやきスタイル(`PERSONA`使用)
- **イベント選定(`pickEvent()`)**: 過去24時間以内に`fetched_at`された候補プールから`score`(Haiku採点0-10)最高の1件。プール内全件score欠落時のみ`fetched_at`降順フォールバック。候補が無ければ`null`(スキップ)
- **ニュース選定(`pickNewsArticle()`)**: 暦日(当日`fetched_at`)優先→フォールバックで`fetched_at`降順15件→ランダム1件
- 実行: `node scripts/post-to-x.js [--type=event|news|life] [--city=sg|bkk|syd|all] [--dry-run]`
- **現在はX API自動投稿ではなく「投稿下書きのLINE通知」運用**(X APIクレジット枯渇のため停止)。`--to-line`フラグで生成文をLINE送信、手動でXに貼る。1日2回、crontab `0 2,12 * * *`(サーバー時刻Europe/Berlin基準、SGT換算8:00/18:00)。X API送信経路自体は無変更で残置(`--to-line`を外せば復活可能)

## アーキテクチャルール
- ビジネスロジックはサーバーサイドに置く。フロントエンドはAPI経由でデータ取得。DBは使わずJSONファイルで管理
- `data/`配下JSONは各APIエンドポイントがリクエストの都度`fs.readFileSync`で直接読み込む(メモリキャッシュなし)。**データファイルの内容のみ編集した場合は`pm2 restart`不要**(`server.js`本体のコード変更時のみ再起動要)。`data/`は`.gitignore`対象

## UIルール
日本語UI / スマホファースト / Tailwind CSSを使う / 既存のデザインパターンを踏襲する

## UIスタイル規約
- **カラー**: inline styleで生の色値を書かない。必ず`:root`のCSS変数(`var(--caramel)`等)を使う
- **閉じる✕ボタン**: `background:var(--sand); border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:16px; border:none; cursor:pointer`を標準スタイルとする
- **CSSクラスの二重定義禁止**: 既存クラスを再定義する場合は古い定義をその場で削除する
- **カードタイトル**: font-size 16px / font-weight 700(メインイベントカード`.card-title`のみ18px)
- **border-radius**: カード系16〜18px、ボタン系`var(--radius-btn)`(14px)または50px(pill)
- **z-index**: bottom-navは`9999`固定。モーダル・ボトムシート・オーバーレイ系は原則bottom-nav未満(3000番台)。overlay/modalペアは相対的な重なり順(modalがoverlayより上)を維持
- **画面ヘッダー上部余白**: `env(safe-area-inset-top, 0px) + 20px`の1回のみの加算で統一。ホーム画面は`.app-header`に`padding-top`直接指定。くらし/ピン留め/設定画面は共通`.plan-title-header`を使い、コンテナ側`padding-top: env(safe-area-inset-top)`+ヘッダー側`padding: 20px 20px 0`の2箇所分担で合計1回分に。**⚠️新しい画面追加時、コンテナとヘッダー要素の両方に`env(safe-area-inset-top)`を入れると二重加算になる(notch環境のみ発生、Web版では気づけないため実機確認必須)**
- **画面タイトルのマークアップ**: `<span class="screen-title" data-i18n="...">`は装飾用の親ラッパーで包まない(子孫セレクタによる意図しないCSS詳細度衝突を避けるため、ヘッダーコンテナの直接の子要素として配置)
- **オーバーレイの表示切替は`classList.toggle('visible')`方式に統一**(`display`/`opacity`のインラインstyle直書きは禁止。表示側と非表示側で操作箇所数が食い違いタップ不能になる事故の温床になるため)。新規オーバーレイもCSS側に`.要素名.visible{display:block;opacity:1}`を定義しJS側は`classList`操作のみ
- **設定画面のピル型トグルボタンの枠線は`var(--sand-dark)`に統一**
- **タッチ端末対応の3点セット原則(重要、複数箇所で繰り返し発生した不具合パターン)**: ボトムナビ/フィルターチップ/FAB等のタブ・カテゴリ構成を変更する際は、(1) `switchNav()`等の画面配列 (2) 同名のtouchend委譲用配列またはリスナー登録 (3) HTML側`onclick`属性、の3箇所すべてを揃って更新すること。動作確認はマウスクリックだけでなく実機タッチ(またはPlaywrightの`hasTouch`+`tap()`)で行うこと（詳細は下記「iOS/Capacitor開発ノウハウ」のゴーストクリック節参照）

## ダークモード機能
「配色」3択循環(キャラメル/柳グリーン/ダーク)は廃止し、「ダークモード」設定(自動(端末追従)/ライト/ダークの3択、表示ラベルは自動/オフ/オン)に統一。ライト/ダーク双方の配色は柳グリーン基調（キャラメル系の値は完全に置換済みで残っていない）。

- **状態管理**: `localStorage`の`sg_theme`キー(値: `auto`/`light`/`dark`)。`getTheme()`/`applyTheme()`/`cycleTheme()`/`updateThemeUI()`(`public/app.js`)
- **既定値**: 新規ユーザー(未設定)は`light`。設定画面タップで自動→ライト→ダーク→自動…と循環
- **自動モード**: `window.matchMedia('(prefers-color-scheme: dark)')`で検知、`change`イベントでリアルタイム追従(自動モード時のみ)。iOS Capacitor(WKWebView)でのメディアクエリ動作は実機未検証
- `public/index.html`の`<head>`内スクリプトが初期描画ちらつき防止のため`sg_theme`を先読みし`data-theme`属性を先行設定
- 旧`sg_palette`キーからのマイグレーション処理あり(初回起動時1回のみ)
- ボトムナビアイコンはSVG(`currentColor`)で`.nav-icon-svg{color:var(--light-gray)}`／`.nav-item.active .nav-icon-svg{color:var(--caramel)}`によりダークモード切替に画像差し替えなしで自動追従

## 指標ウィジェット
おでかけ画面・くらし画面それぞれの最上部に3項目ずつ、外部データの実況値を表示。`GET /api/widget-stats?city=sg`1本のAPIで全項目をまとめて返す(`loadWidgetStats()`、init時に1回呼び出し)。

- **おでかけ画面**: 気温・降水確率(`#stat-temp`/`#stat-rain`、OpenWeatherMap)・2時間予報(`#stat-nowcast`、NEAナウキャスト、47エリア中最も深刻な区分を採用)
- **くらし画面**: 為替SGD→JPY(`#stat-fx`、Frankfurter API)・PSI(`#stat-psi`、data.gov.sg)・デング熱クラスター警戒(`#stat-dengue`、data.gov.sg新API方式。**表示件数は日次新規感染者数ではなく活動中クラスター数のスナップショット**)
- **PSI表示に顔絵文字**: 判定レベルに応じ絵文字を数値前に表示(良好😊/普通😐/要注意😷/健康に悪い😫/危険☠️)。マッピングは`STAT_LEVEL_EMOJI`。**`server.js`の`psiLevel()`/`dengueLevel()`としきい値・ラベル文言を必ず一致させること**(文字列マッチングで強調表示を行っているため)
- **PSI・デング熱タップでクライテリア表示**: `#stat-criteria-popover`に指標説明+レベル一覧チップ、該当レベルを強調。判定基準は`STAT_CRITERIA`(PSI: 良好0-50/普通51-100/要注意101-200/健康に悪い201-300/危険301+、デング熱: 警報なし0/注意1-5/警戒6-15/厳重警戒16+)
- **キャッシュ**: `widgetStatsCache`はフィールド単位(為替/天気/PSI/nowcast/dengue)で30分キャッシュ。1項目失敗でも他項目に影響しない(フォールバックで古い値保持)

## カレンダー機能（ボトムナビ4タブ目）
`#screen-calendar`でその年(1〜12月)の祝日・主要行事・記念日・学校休暇を月カード(`.cal-month-card`)+日付グループ化リストで**1年分まとめてリスト表示**(グリッドではなく縦スクロールのみ、月送りボタンなし)。日本語固定(i18n不要)。

- **データソース**: `data/sg/calendar-events.json`(手動キュレーション、年1回更新要。SG祝日/日本の祝日/主要行事/記念日/現地校(MOE)休暇)＋`school-calendar.json`(日本人学校SIJS休暇)を`GET /api/calendar?city=sg&year=YYYY`が1年分フラット配列で返す。**`events.json`の実イベントは対象外**（件数過多のため）。`calendar-events.json`編集はpm2再起動・キャッシュ更新不要(毎回読み直し)
- **学校休暇の2系統**: 日本人学校(SIJS)とシンガポール現地校(MOE)は休み時期が異なるため両方掲載、名前頭に`日本人学校: `/`現地校(MOE): `で区別
- **カテゴリ**: `holiday-sg`/`holiday-jp`/`festival`(「文化・催し」表示、主要行事・記念日・全国試験含む)/`school-vacation`(「学校行事」表示、休暇+PSLE/O-Level試験等含む)の4種。`CALENDAR_CATEGORY_LABELS`一本化(バッジ・チップ両方に自動反映)。フィルターチップ順は「すべて・祝日・主要行事(文化・催し)・学校行事・日本の祝日」
- **「すべて」表示では日本の祝日・学校行事を除外**(`CALENDAR_HIDDEN_IN_ALL = ['holiday-jp', 'school-vacation']`、該当チップを明示タップした時のみ表示。データ自体は返る、フロント表示ロジックのみ)
- **SG祝日は現地通用名のカタカナ表記**(建国記念日ではなくナショナルデー等)。**SG祝日バッジのみ固定で薄い赤**(`--holiday-red`/`--holiday-red-pale`、他カテゴリと違いテーマに関わらず常に赤。日本の祝日は対象外で`--sky`青系のまま)。**`festival`バッジも固定ゴールド**(`--festival-gold`)。カテゴリ配色が被る場合はこの2例のパターン(固定色変数を`:root`に追加)を踏襲する
- **予定のinfoアイコン(`.cal-info-btn`)**: `note`フィールドを持つ予定に表示、タップで吹き出し(`.cal-note-bubble`)。**`holiday-jp`は対象外**(意図的、振替休日等の説明ニーズが薄いため非表示)
- **月見出しの季節アイコン**: `.cal-month-head`右端に月ごとの季節の話題(☂️モンスーン/🍈ドリアン/🌫️ヘイズ/🛍️GSS)を`MONTH_SEASONAL_TAGS`(JS静的定数、年非依存のためJSONではなくJS定数)から0〜3個表示。タップで`.cal-month-season-bubble`に説明(予定infoの吹き出しとは相互排他)
- **ボトムナビからカレンダーを開くと今月までスクロール**(「すべて」表示時のみ。カテゴリ絞り込み時は常に先頭(1月)に戻す)。`_scrollCalendarToCurrentMonth()`が`.cal-month-card[data-month]`から今月一致カードを探し位置計算(`getBoundingClientRect()`差分)。「すべて」表示時のみ末尾に実測ベースの最小限余白を動的付与
- **予定名の横位置揃え**: `.cal-item`はCSS Grid(`grid-template-columns: 84px 1fr auto`)、カテゴリバッジ列を固定幅にして予定名の開始X位置を揃える
- **祝日データは`calendar-events.json`に一本化済み**(旧`CITY_HOLIDAY_NAMES`等の重複データ・デッドコードは削除済み)
- **カテゴリフィルターのスワイプ切り替え**: `_switchCalCatBySwipe()`(他画面と同パターン)。`#calendar-filter-row`上で始まったタッチは除外
- **スクロールトップFAB(`#fab-top`)**: `calendar-scroll-content`も監視対象。新しい`.screen-scroll-content`画面追加時はスクロールリスナー・`fabScrollTop()`のtargetId分岐の2箇所を必ず更新

### ピン留めのFAB化
ピン留めはくらし・おでかけ画面のみに表示されるクリップ型FAB(`#fab-pin`、`#fab-top`と反対の左下)から開くボトムシート。中身(`#pins-sectioned-content`等)は旧`#screen-pins`から無変更で移設。
- **FABの表示条件**: ピン留め0件時は非表示(`updatePinFabVisibility(screen)`)
- **開閉**: `classList.toggle('visible')`方式
- **z-index教訓(重要)**: `bottom:0`で画面最下部まで届く新規`position:fixed`要素(シート・モーダル)は、z-indexが`.bottom-nav`(9999)より高くないと、画面下部(ボトムナビと重なる帯)でボトムナビがヒットテストを奪いタッチが一切効かなくなる。`.pin-sheet-overlay`/`.pin-sheet`は10000/10001に設定済み。同パターンの他モーダル(`.pin-detail-modal`等)追加時も要確認

## アプリ共有機能
設定画面「シェア」ボタン(`#do-share-btn`)は**まずQRコード表示シートを開く**(直接`navigator.share`/クリップボードコピーには分岐しない)。シート内「リンクを共有」ボタン(`#qr-share-link-btn`)から従来の`doShare()`を呼ぶ。
- QRコード生成: `public/qrcode-generator.js`(Kazuhiko Arase氏のMIT製、依存なし)。`qrcode(0,'M').addData(url); .make(); .createSvgTag(6,4)`でSVG取得、`#qr-code-canvas`にキャッシュ挿入
- QRコードURL: 既存`doShare()`と同じApp Store URL(`https://apps.apple.com/app/id6787159354`)
- シートの見た目・開閉パターンは`#backup-passphrase-overlay`と同じ(`classList.add/remove('visible')`、`lockScroll()`/`unlockScroll()`)
- `#qr-code-canvas`背景は`#fff`固定(CSS変数不使用、ダークモードでも読み取り精度確保のため)
- おでかけ画面: tabs-section(いつ行く？4タブ)は廃止済み。`#filter-row-category`がheader直下に常時表示、`#event-filter-btn`→`#event-filter-sheet`ボトムシート(いつ行く？/誰と/エリア/キーワード)。プロフィールのwhoフィルターは廃止、`filterWho`(シート選択)に統一

## 都市対応状況
現状SG(シンガポール)のみ稼働中。BKK/SYDはイベント数が少なく一時停止中(`ACTIVE_CITIES = ['sg']`)。設定画面の都市選択欄も非表示化済み(ロジックは残置)。

## SGエリア区分
Central/East/West/North/North-East/Island-wide/Sentosaの7区分(Sentosaはケーブルカー・モノレールで渡る独立「行き先」のため単独区分)。定義箇所: `public/index.html`の`#event-filter-sheet`内`.ef-chip`、`scripts/filter-events.js`の`CITY_AREAS.sg`。BKK/SYDはSentosa非対象。

## イベント取り込みパイプライン構成
システムcrontabで動くジョブは実質3本:

| ジョブ | 内容 | 頻度(SGT) |
|---|---|---|
| `scripts/run-fetch-all.sh` | `fetch-events.js --city=sg`→`check-content-integrity.js`→`fetch-life-info.js`(**ユーザー向けプッシュ通知あり**)→`notify-fetch-summary.js`(開発者向けLINE通知) | 毎日7:00 |
| `scripts/run-fetch-extra.sh` | 同上だが`fetch-life-info.js --no-notify` | 毎日12:00・21:00 |
| `scripts/run-source-analysis.sh` | `discover-sources.js --no-notify`→`analyze-sources.js --no-notify` | 水・日7:30 |

BKK/SYDのfetchは`run-fetch-all.sh`内でコメントアウト中。旧`refresh-courses.js`のcronは完全削除済み。

- **1日3回取得の理由**: Goody Feed/The Smart Local/Eatbook等、投稿頻度に対しRSSフィード保持件数が少なく1日1回では記事が流れ落ちるリスクがあるため。ハイウォーターマーク方式(`data/source-fetch-state.json`)により重複取得はされない
- **開発者向けLINE通知は1日3回、その都度その回だけの件数を通知**(`notify-fetch-summary.js`が`logs/fetch-summary-${city}.json`/`logs/fetch-life-info-summary.json`の最新1回分をそのまま表示)。過去24h合算用の関数・履歴ファイル(48時間分)は残置だが現在未使用
- **イベント側の「採用件数」は重複削除後の実件数**(設計書209で修正済み): `fetch-events.js`はHaiku採否直後の速報値から、直後の`deduplicateSaved()`(タイトル類似度75%以上の重複削除)で削除された件数を差し引いた値を`logs/fetch-summary-${city}.json`の`accepted`として記録する。削除が発生したバッチはLINE通知本文に「（うち重複除外N件）」も付記。**くらし情報側(`fetch-life-info.js`)には同型のバグが残存する可能性がある(`filterAndSaveLifeInfo()`の`totalAccepted`が事後の意味的重複除外・要約失敗除外を反映していない)**、未調査・未修正(`.claude/next.md`参照)
- **ユーザー向けWebプッシュ通知はイベント側(`fetch-events.js`)は完全停止済み**(`notify-fetch-summary.js`は開発者向けのみ、`sendPushToAll()`自体は残置)。**生活情報側(`fetch-life-info.js`)のユーザー向けプッシュは現役稼働中**(1日1回、7:00 SGT固定)。両者を混同しないこと
- **ハイウォーターマーク方式**(`fetch-events.js`): `data/source-fetch-state.json`にソースごとの`lastSeenGuids`/`lastFetchedAt`。初回は`daysBack=7`フォールバック
- **Haiku採否・記事生成**(`filter-events.js`): `scoreThreshold=6`(薄いカテゴリはscore5以上に緩和)。採用イベントはSonnetで日本語記事生成(英語記事生成は廃止済み)
- **`data/sources.json`のstatus**: `active`/`paused`/`rejected`の3値のみが取得可否を左右
- **カテゴリ上限機能・Instagram取り込みは完全削除済み**(3ファイルから関連関数・設定を削除、データファイル内の残置キーは無害)
- **`analyze-sources.js`のソース自動入れ替えロジックは廃止**: 不良ソース(直近4回で採用率5%未満または4回連続0件)は直接`status:'rejected'`にするのみ。新規ソース追加は手動で`data/sources.json`を編集する運用

## シンガポール在住日本人向け生活情報・ニュースのキュレーション機能
おでかけイベント取り込みパイプラインとはデータ・API・UIとも独立。ボトムナビ「くらし」タブの中身。

- **カテゴリ**: 6種(admin/weather/transport/community/health/education)。`server.js`の`VALID_CATEGORIES`もこの6種
- **データ取得**(`scripts/fetch-life-info.js`): RSS8件(CNA/Mothership/Straits Times/JCCI/CNA Sport/Expat Living/SingaporeMotherhood/AsiaX)を`rss-parser`で取得、ハイウォーターマーク方式(`data/life-info-fetch-state.json`、イベント用とは別)。Haikuで関連性判定+カテゴリ付与、Sonnetで日本語要約(`data/sg/life-info.json`、gitignore対象)。リテンション7日
  - **Expat Living**は Cloudflare WAFがNode標準fetch(undici)からのリクエストのみ403でブロックする状態(curl/rss-parserでは200が返る、外部サイトのボット対策でありバグではない)。エラーハンドリングは正常機能し該当ソースのみスキップ。**くらし側には自動評価・除外の仕組みが無いため、採用ゼロが続いても自動検知されない。手動モニタリングが必要**
- **`summary_ja`の文字数目安は現在150〜180文字程度**(「記事内容そのものを客観的に記述、読者への呼びかけ調は書かない」指示。文字数は複数回の調整を経て確定、経緯は`CLAUDE_HISTORY.md`参照)
- **スポーツニュースの扱い**: 日本人選手の移籍・日本代表戦等、在住日本人の関心が高いものは`community`カテゴリに分類(「チケット販売中の参加イベント告知」はおでかけ側の対象、こちらでは対象外)。**両パイプライン間の技術的な重複排除ロジックは存在せず、同じ話題が両タブに出る可能性は残る**
- **1日3回取得、ユーザー向けプッシュ通知は7:00 SGT固定**(`CITY_CONFIG.sg.feeds`全5本を一律1日3回取得、ハイウォーターマークのため重複処理なし。通知は朝の回のみ、12:00/21:00は`--no-notify`)
- **API**: `GET /api/life-info?city=sg&category=...`。**フロント**: くらし画面(`#screen-news`)＋おでかけ画面のプレビューセクション(`#life-info-preview-section`、直近3件)。未ログインでも閲覧可能
- **新着リストのソート順**: 1次キー=`fetched_at`(取り込み時間、降順)、2次キー=カテゴリ順(固定順)。くらし画面はfetched_at基準(旧publishedAt基準から変更済み)

## 環境構成と注意事項

### Web版 = テスト環境 / iOS App Store版 = 本番環境

| 環境 | URL/配布 | 役割 |
|------|----------|------|
| Web版 | dosuru.app | 開発・確認用（テスト環境） |
| iOS App Store版 | App Store `id6787159354` | 本番（エンドユーザーが使う） |

⚠️ **重要: データ層は両環境で共有**（`data/sg/events.json`等・`/api/*`エンドポイント全般。サーバー上に1つだけ存在し両環境が同じデータを参照）

**Web版でテスト中に絶対やってはいけないこと**: イベントデータを大量削除・破壊的に更新する／APIレスポンス構造を非互換に変更する

**対応方針**: データ構造の破壊的変更はApp Store版リリースと同時に行う／テスト用の一時データ変更は必ず元に戻してからコミット／APIは後方互換性を保つ(旧バージョンアプリが動き続けるか確認)

## iOS / Capacitor 開発ノウハウ（重要、実機不具合の再発防止ルール集）

### Web版とiOS版の関係
同一コード（Capacitorは`public/`をバンドル）。`_isCapacitorApp`フラグで分岐: GA4スキップ/外部リンク処理/overscroll防止/SW登録スキップ/インストールバナースキップ/Push通知UI非表示。データは共有（Web版でのデータ破壊=本番App利用者への影響）。

### ❌ 絶対にやってはいけないこと

**`html, body { overflow: hidden; height: 100% }` を使わない** → WKWebViewでbottom-navが常に「上に上がった状態」で固定される副作用がある。overscrollはJSで制御する（下記参照）。

**スクリーンコンテナに`position: fixed`を使わない** → stacking contextが生成され、重なるはずのbottom-navのクリックが効かなくなる。スクリーンは`height: calc(100dvh - 60px - env(safe-area-inset-bottom, 0px))`で通常フローに置く。

**モーダル表示中もbottom-navを表示し続ける設計**: 全モーダル・オーバーレイはbottom-nav(9999)未満の3000番台z-indexに統一する（`#event-filter-sheet`=3100、`.pin-detail-overlay`=3300、`.pin-detail-modal`=3301等）。シート/オーバーレイのペアは「シート本体≥自身のoverlay」の相対関係を維持。

**例外**: パスフレーズ入力シート（`#backup-passphrase-sheet`/`#cal-passphrase-sheet`）はテキスト入力中に限りbottom-navを一時的に隠す（モバイルSafariのキーボード表示時可視領域追従が`position:fixed;bottom:0`要素間で同期しないため）。`document`レベルの`focusin`/`focusout`で対象2シート内のINPUT/TEXTAREAにフォーカスがある間だけ`.bottom-nav`を`visibility:hidden`に。

**PTR（プルトゥリフレッシュ）**: `_initPtr(container, indicatorId, onRefresh, watchSwipeIntent)`共通ヘルパーでiOS版・Web版両方に有効化済み（ホーム画面・くらし画面）。スクロールコンテナ内の`.ptr-indicator`要素のみ操作、ヘッダー・`html`/`body`には触れない設計。リフレッシュ確定閾値60px。**iOS overscroll防止JS・StatusBar Info.plist設定の2箇所を変更しないことがPTR正常動作の前提条件**（変更する場合は実機で回帰確認）。

### ⚠️ `position:fixed`要素は、キーボード表示・非表示の過渡期間中にタッチイベントの配送先が親要素にずれることがある
iOS WKWebViewでは、キーボードが閉じた後`window.innerHeight`が実値に戻るまでの過渡期間（数秒〜数十秒、`resize:'none'`下でも発生）、`position:fixed`要素の**子孫**へのネイティブタッチイベント配送が親のfixed要素自体をターゲットにしてしまうことがある。`document.elementFromPoint()`は常に正確（CSSOM上は正常）。「見た目・DOM構造は正常なのにタップが効かない」系の調査ではまずこれを疑い、両方（elementFromPointの理論値 vs 実イベントターゲット）を並べて記録する診断ログを仕込む。対応例: 親のfixed要素に「保険」の`touchend`ハンドラを追加し、`e.target`が個別の子要素でない場合のみ`elementFromPoint()`で実対象を特定して手動ディスパッチ（`e.target.closest()`で二重発火防止必須）。

### ✅ 正しいスクロール・レイアウトパターン
```css
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
      // scrollHeight <= clientHeight の要素はスキップ（overflow-x:autoの副作用による水平カルーセルを除外）
    }
    el = el.parentElement;
  }
  e.preventDefault();
}, { passive: false });
```
**注意**: `overflow-x: auto`はCSS仕様上`overflow-y`も暗黙的に`auto`になるため、`scrollHeight > clientHeight`のチェックが必須（無いと水平カルーセルで縦スクロールが効かなくなる）。

### ✅ Capacitor キーボード設定
`capacitor.config.js`への設定だけでなく、**`@capacitor/keyboard`パッケージのインストールも必須**（無いとサイレントに無視される）。
```javascript
// capacitor.config.js
plugins: { Keyboard: { resize: 'none' } }  // キーボードがWebViewを縮小しない→ナビが裏に隠れる自然な挙動
```
```json
"@capacitor/keyboard": "^6.0.0"
```
**プラグイン取得は`registerPlugin()`を優先**（`window.Capacitor?.Plugins?.Keyboard`のみだとCapacitor 6で`addListener`が動かないケースがある）:
```javascript
let _CapKB = null;
try { if (window.Capacitor?.registerPlugin) _CapKB = window.Capacitor.registerPlugin('Keyboard'); } catch (_) {}
if (!_CapKB) _CapKB = window.Capacitor?.Plugins?.Keyboard;
```

### ✅「トップへ戻る」FABのスクロール監視は内部スクロールコンテナを見る
画面本体が`overflow-y:auto`の内部コンテナ(`#home-scroll-content`等)でスクロールする構成では`window.addEventListener('scroll',...)`は発火しない。`window.scrollY`も常に0。監視・`scrollTo`はその内部コンテナに対して行う。

### ✅ キーボード被り対策（現行実装）
複雑な「シートを縮小しながら移動する」JS一式は撤去済み（真因は無関係な`contentInset:'always'`設定だった、→`'never'`に変更で解決）。`.plan-modal`系シートは内部スクロールとネイティブ挙動に委ねる。**現行は`_scrollFocusedIntoViewOnKb(kbHeight)`という軽量関数1つのみ**（`.plan-modal`/`.plan-sheet`の外側にある入力欄が対象）。
- 判定は「スクロール可能かどうか」ではなく「フォーカス要素が実際に画面のどこにあるか」（`getBoundingClientRect()`）。`Keyboard:{resize:'none'}`下では`clientHeight`が変化しないため旧来の`scrollHeight > clientHeight`判定はコンテンツ量が少ない画面で誤判定する
- キーボード表示中のみ`padding-bottom`を動的拡張してから`scrollTop`を加算（既存paddingでは必要スクロール量に届かないことがあるため）。祖先の`overflow-y:auto`が見つからない場合は何もしない（`scrollIntoView`フォールバックはWKWebViewでレイアウトズレを誘発するため撤去済み）

### ⚠️ z-index是正時は「companion要素」だけでなく「子シート」も辿って確認する
あるz-index値を変更したら: (1)同じCSSクラスを使う他の要素 (2)その要素の内側から開かれる子シート(親だけ上げて子を据え置くと子が親の背後に隠れる) (3)最終的なz-index順序が意図通りか、の3点を横展開で確認する。

### ✅ CSSキャッシュバスティング手順（セットで変更必須）
```html
<link rel="stylesheet" href="/app.css?v=YYYYMMDDX">
```
```javascript
// sw.js
const CACHE_NAME = 'sg-weekend-vXXX';  // 数字を上げる
```
**両方同時に変更しないと古いCSSがServiceWorkerにキャッシュされたまま残る。**

### ✅ iOS ステータスバー
GitHub Actions workflowでInfo.plistを直接書き換え:
```yaml
- name: Set status bar style in Info.plist
  run: |
    /usr/libexec/PlistBuddy -c "Add :UIViewControllerBasedStatusBarAppearance bool false" ios/App/App/Info.plist || \
    /usr/libexec/PlistBuddy -c "Set :UIViewControllerBasedStatusBarAppearance false" ios/App/App/Info.plist
    /usr/libexec/PlistBuddy -c "Add :UIStatusBarStyle string UIStatusBarStyleDarkContent" ios/App/App/Info.plist || \
    /usr/libexec/PlistBuddy -c "Set :UIStatusBarStyle UIStatusBarStyleDarkContent" ios/App/App/Info.plist
```

### ✅ iOS カメラ許可（NSCameraUsageDescription）
`Info.plist`はリポジトリに含まれず`npx cap add ios`実行時に毎回生成されるため、カメラを使う機能がある場合はCIワークフロー内でのPlistBuddy追記が必須。**現在この機能を使う箇所はコード上に存在しないためCIステップは削除済み**。将来QRスキャナー等でカメラを使う際は同パターンで復活させること。

### ✅ TestFlight デバッグのコツ
- Web版で直らない場合でもiOSで直ることがある（WKWebView固有の挙動）
- CSSの変更はSW経由でキャッシュされるためバージョンを上げないと反映されない
- `pm2 restart sg-weekend`はWeb版のみ。iOS版はTestFlightビルドが必要（GitHub Actions→TestFlight反映まで約15〜20分）

### ✅ モーダルを閉じる際は必ずフォーカスを外す（blur）
フォーカスが残ったまま非表示化された`<input>`/`<textarea>`が、iOS WKWebView側のタッチイベント配送（bottom-navへのヒットテスト）を阻害し、ボトムナビが一時的にタップ無反応になる不具合の原因になる。モーダル/シートを閉じる関数の先頭で`_blurIfFocusInside(...containers)`（閉じようとしている要素の内部に`document.activeElement`が含まれる場合のみblur）を呼ぶ。`switchNav()`冒頭でも画面遷移直前にフォーカスが残っていれば無条件でblur。新しいモーダル・シートにinput/textareaがある場合は同様のblur処理を入れること。

### ✅ onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック
ボトムナビ・FAB等は`touchend`にJSハンドラ（`preventDefault()`で後続clickを抑制）を登録しつつ、HTML側にも`onclick`属性を残す二重登録になっている。iOS WKWebViewでは`touchend`の`preventDefault()`が確実に効かないケースがあり、遅延・ゴーストのclickが`onclick`属性を直接トリガーすることがある。

**やってはいけない対処**: タッチ検出後に全clickイベントを無条件グローバルブロックする方式（touchendハンドラを持たないonclick専用ボタンも道連れで無反応になる）。onclick属性の全削除も不可（Web版のマウス操作が動かなくなる）。

**正しい対処**: ゴーストクリックが実証されている要素（ボトムナビ・FAB・シェア/フィードバック/言語切替ボタン・各種オーバーレイのclose等）の`onclick`属性**個別**に`if(!_touchCapableDetected) 関数呼び出し(...)`のガードを埋め込む。グローバルなclickリスナーは追加しない。
```html
<button id="nav-home" onclick="if(!_touchCapableDetected) switchNav('home')">
```
```js
let _touchCapableDetected = false;
document.addEventListener('touchstart', () => { _touchCapableDetected = true; }, { passive: true, capture: true });
```
タッチ端末ではガード対象の`onclick`のみ無効化（touchend側が既に処理済みのため実害なし）。PCブラウザでは`_touchCapableDetected`が常にfalseのため全onclickが機能する。

**⚠️ 落とし穴（実際に発生した事故）**: この二重登録により、タッチ端末ではガード付きonclickが常にスキップされ、touchend側の委譲ハンドラが唯一の実行経路になる。ボトムナビのタブ構成変更時、`switchNav()`内の画面配列は更新したが、別の場所にあるtouchend委譲用ハードコード配列（ボトムナビ即時タップ対応ブロック）の更新を忘れ、新タブがタッチ端末で完全無反応になった（PCブラウザのマウスクリックは正常なため気づきにくい）。→上記「UIスタイル規約」の「タッチ端末対応の3点セット原則」を必ず参照。

オーバーレイ背景タップで閉じる系（`install-overlay`/`pin-detail-overlay`/`pin-picker-overlay`/`emoji-picker-overlay`/`schedule-action-overlay`/`cal-popup-overlay`）は、onclick個別ガードに加えて`app.js`側の配列一括登録touchendリスナーも併用。新規に同種オーバーレイを追加する際は同じパターンに揃える。

## server.js編集時の注意
- ルート追加時は`grep -n "^/\*\|^\*/"`等でコメントアウトブロックの中に紛れ込んでいないか確認する習慣を維持する（過去にコメントアウトされたコードブロック内に新ルートを足してサイレントに一切発火しなかった事故があった）
- 新規ルート追加後は`curl -H "Host: xxx"`等で実際にレスポンスを検証してから完了報告する（行番号だけで配置場所を判断しない）
- **新しいHTTPメソッド(PUT/PATCH等)を使うエンドポイント追加時は、`/api`向けCORSミドルウェアの`Access-Control-Allow-Methods`にそのメソッドが含まれているか必ず確認する**: 漏れるとWeb版は気づかず(Same-Origin)、Capacitor環境(`capacitor://localhost`オリジン)のiOS実機でのみOPTIONSプリフライトが拒否されfetchが失敗する。`curl -i -X OPTIONS -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: <メソッド>" <URL>`で確認してから完了報告する

## 実機デバッグ用ログ収集機能
ユーザーはMacを保有せずSafari Web Inspectorでのリアルタイムデバッグができないため、**サーバーにログを送信しファイルとして記録する方式**を標準デバッグ手段として恒久的に用意している。

- クライアント側: `public/app.js`冒頭に`_sendDebugLog(event, data)`関数(コード中の任意箇所から呼び出し可能、fire-and-forget)
- サーバー側: `POST /api/debug-log`(`server.js`)で受信し`logs/debug-nav.log`に1行1JSONで追記(認証なし)
- 確認方法: サーバーにSSHで`logs/debug-nav.log`を直接読む(`cat`/`tail -f`)
- **この基盤機能自体（`_sendDebugLog`・`/api/debug-log`）は削除しない**（恒久ユーティリティ）。個々の調査用の計装ポイント(呼び出し箇所)は使い捨てで原因特定後に削除してよい
- ⚠️ `logs/debug-nav.log`にサイズ上限・ローテーションなし、認証もない。長期放置でディスク圧迫の可能性、定期的に内容確認し不要なら手動削除する

## やってはいけないこと
- cronはシステムcrontabを使う（PM2 cronはスケジュール制御に不向きなため使わない）
- APIキー・秘密情報をログに出力しない
- DBを勝手に導入しない
- force pushしない

## 鉄則
どんな小さな修正でも必ずplanner→orchestratorの順で回す。

## エージェントの使い方
```
@planner → 設計書作成 → ユーザー承認
「承認します。@orchestrator 実行して」
→ builder→checker→closerが自動で動く
```

## `.claude/plan.md`の扱い
`.claude/`ディレクトリは基本的にgitignore対象だが、**`plan.md`だけは例外的にgit管理下に置く**(`.gitignore`に`.claude/*` + `!.claude/plan.md`で明示)。理由: 過去に「設計だけして実装未着手」のまま別タスクの設計に押されて`plan.md`が上書きされ、設計書の実物が失われる事故が発生したため。

- **`plan.md`は必ず末尾に追記する。既存の設計書(実装済み・未実装問わず)を削除・上書きしない。** 新しい設計書は「設計書N」という連番見出しで追記していく
- 実装未着手のまま長期間放置される設計書があっても構わない(`.claude/next.md`に要約とステータスを記録しておけば十分)。`plan.md`自体は削除しない
- ファイルが肥大化してきたら、削除ではなく「古い設計書を`.claude/plan-archive.md`のような別ファイルに移す」形で対応する(移す場合も内容は保持したままにする)
