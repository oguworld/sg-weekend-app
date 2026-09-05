# SG在住Navi (dosuru.app) - CLAUDE.md

## プロジェクト概要
シンガポール在住日本人向け週末おでかけ情報PWA。
ブランド名: Willoa / アプリ名: SG在住Navi（旧名: おでかけNavi）

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

## フォルダ構成（2026-09-03時点）
sg-weekend-app/
├── server.js
├── scripts/
│   ├── fetch-events.js             ← おでかけイベント取り込み
│   ├── filter-events.js            ← イベントのHaiku分類・Sonnet記事生成
│   ├── fetch-life-info.js          ← 生活情報・ニュースのRSS取り込み（設計書172/175）
│   ├── fill-images.js              ← 既存イベントへの画像補完
│   └── lib/
│       └── unsplash.js             ← Unsplash API ユーティリティ
├── data/
│   ├── sg/
│   │   ├── events.json
│   │   ├── life-info.json          ← 生活情報・ニュース（gitignore対象）
│   │   ├── comments.json           ← コメント機能
│   │   ├── model-courses.json / community-courses.json / affiliate-links.json / stamp-spots.json
│   │   │   ← コース・探訪機能削除済み（設計書178）の残置データ、`server.js`側API未クリーンアップのため現存
│   │   └── school-calendar.json / sponsored-cards.json 等
│   ├── bkk/ (同様)
│   └── syd/ (同様)
├── public/
│   ├── index.html                  ← ボトムナビ4タブ: ホーム/ニュース/ピン留め/設定
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

## 現在の主要機能構成（2026-09-03時点、コード確認済み）
探訪（スタンプラリー）・コース・予定表・共有カレンダー機能は設計書178で完全削除済み（下記「探訪（スタンプラリー）機能・コース機能・予定表機能の完全削除」節参照）。現在`public/index.html`のボトムナビは以下4タブのみ（アイコン付き、`data-i18n`表示ラベル基準）:

- **くらし** 🏛️（`#screen-news` / `#nav-news`）: 暮らしの情報＝日本人在住者向けニュースサイトのキュレーション表示。カテゴリ: 新着/SG政府/交通/医療・健康/天候・災害/コミュニティ/教育・子育ての7種。下記「シンガポール在住日本人向け生活情報・ニュースのキュレーション機能」節参照
- **おでかけ** 🏖️（`#screen-home` / `#nav-home`）: イベント情報のキュレーション。カテゴリ: 新着/イベント/展示・公演/グルメ・フェア/プロモ・お得/新規オープン/**旅行**の7種（`data-cat="travel"`、設計書175→176でこの画面のカテゴリタブとして再配置済み）。**PRカード**（スポンサー広告枠、現状非表示中）もこの一覧に条件付きで挿入される。下記「イベント取り込みパイプライン構成」「広告表示機能」節参照
- **ピン留め** 📌（`#screen-pins` / `#nav-pins`）: くらし・おでかけ両方の保存済みアイテムを1画面に統合表示（`#news-pin-list-content`/`#pin-list-content`の2セクション構成）。この機能を単独で説明したセクションは本ファイル内に存在しないため、詳細はコード（`public/index.html`の`#screen-pins`、`public/app.js`のpin関連関数）を直接参照すること
- **設定** ⚙️（`#screen-settings` / `#nav-settings`）: プロフィール（ニックネーム・アバター。設計書157/158で一度非表示化されたが、設計書174〈CLAUDE.md未記録〉で再表示に戻っている）・アカウント連携（Google/Apple Sign-In）・データバックアップ・言語切替・アカウント削除等

コメント機能（`postComment()`等）・全データバックアップ・Sign-Inは上記4タブ横断で現役。詳細は各セクション参照。

## 広告表示機能（PRカード・Klookアフィリエイトウィジェット、2026-07-13実装 → 同月中に両方とも非表示化）
2つの広告枠を実装したが、広告掲載準備が整うまでの一時停止として2026-07-16設計書47でいずれも非表示化した。**コード自体は削除しておらず、残置されたまま停止中**。
- **PRカード**（スポンサー広告枠、設計書29）: `data/{city}/sponsored-cards.json`が空配列のため`_pickSponsoredCardForToday()`が`null`を返し非表示。再開は同ファイルに本番データを追記するだけ（`GET /api/sponsored-cards`・`renderSponsoredCard()`等は無変更）
- **Klookアフィリエイトウィジェット**（設計書30/31）: `renderEventCards()`内のマーカー挿入`splice`をコメントアウトして停止中。再開はコメントアウト解除のみ（`_createKlookWidgetEl()`等は無変更）
- 詳細な実装ロジックが必要な場合はコード（`public/app.js`の`_pickSponsoredCardForToday`/`_createKlookWidgetEl`周辺）を直接参照

## Google/Apple Sign-In認証基盤（iOS版+Web版、2026-09-03時点で現行仕様のみ記載）
Google Sign-In・Sign in with Appleに対応。予定表データ/共有カレンダーとのユーザー紐づけは未実装。

- **認証情報最小化**: サーバーが保存・利用するのは`idToken`の`sub`クレームのみ。`data/users.json`のスキーマは`userId`/`provider`/`providerSub`/`createdAt`/`lastLoginAt`/`subscriptions`のみ（email・氏名・画像は含まない）。Google同意画面には仕様上email/profileへのアクセス許可が表示されるが（回避不可能、実機で確認済み）、サーバー側では保存・利用しない。Appleはemail/fullNameを個別に許可/拒否でき、emailは実アドレスかプライベートリレーかを選択できる
- **サーバー（`server.js`）**: `POST /api/auth/google`（`google-auth-library`でidToken検証、`sub`のみ抽出して`data/users.json`をupsert、自前JWTを発行・有効期限30日）／`POST /api/auth/apple`・`GET /api/auth/apple/state`・`POST /api/auth/apple/callback`（`apple-signin-auth`で検証。Web版はCSRF対策のワンタイム`state`＋`response_mode:'form_post'`受信後URLフラグメント経由でJWTを渡す）／`GET /api/auth/me`（JWT検証、`{userId,provider,createdAt}`を返す）／`DELETE /api/auth/me`（アカウント削除。`data/users.json`削除＋`data/user-plans/{userId}.json`削除＋全都市`community-courses.json`の該当`authorId`を`null`に匿名化、コース自体は削除しない）／`GET /api/config`（`googleWebClientId`/`appleServiceId`/`appleRedirectUri`を返す）。`verifyAppJwtOptional()`はコース公開/削除系エンドポイントの後方互換認証（JWTなしなら旧来通り無検証で動作）に使用
- **iOS版（Capacitor）**: `@codetrix-studio/capacitor-google-auth`・`@capacitor-community/apple-sign-in`。Google用URL Scheme（Reversed Client ID）はCIで`Info.plist`の`CFBundleURLTypes`に自動注入（`plistlib`使用、ネスト配列構造のためPlistBuddy不使用）。`App.entitlements`に`applesignin` capability。ボタンは公式ロゴのインラインSVGで自前描画（`.oauth-btn`系CSS、ダークモード時はAppleボタンに薄い枠を付与）
- **Web版**: Google Identity Services SDKの`renderButton()`方式（One Tap `prompt()`は使わない、ログアウト後の再表示不可問題を回避するため）／Apple公式JSボタン（`scope:''`指定で同意画面を出さない設計）
- **トークン保存**: `authedFetch()`が`localStorage`の`app_auth_token`を自動付与。iOS版は`@capacitor/preferences`をソースオブトゥルースとする3層ハイブリッド方式（`_authTokenCache`同期変数／`localStorage`ミラー／`Preferences`永続化）で、アプリ完全終了後の再起動でも連携が維持される。`refreshLoginUI()`はサーバーエラー時（401以外）はトークンを破棄せず楽観的に「連携中」表示を維持する
- **設定画面UI**: 「アカウント」セクション（ログイン+バックアップ統合、見出しは「アカウント連携」）。ボタンはGoogle/Apple共通で`_isCapacitorApp`により自前描画/公式SDK描画を切り替え。ログアウトは確認ダイアログあり
- **アカウント削除**（App Store Review Guideline 5.1.1(v)対応）: 「アカウント」セクションとは別に、設定画面最下部に見出しなし・中央寄せテキストのみ（`--terracotta`色）で独立配置、未ログイン時は非表示。削除は`confirm()`後にサーバー側削除→ローカルのJWT・バックアップ鍵material・saltを一括クリア。500系エラー時はローカル状態を保持（サーバー側削除確認後にのみクリア）

## プライバシーポリシー更新（2026-07-19実装、設計書65）
`public/privacy.html`第1章「収集する情報」に「Google/Appleアカウントの識別子（sub のみ保存、email/氏名/画像は保存しない。同意画面表示は各社仕様上回避不可能である旨も明記）」「予定表・マイコース等のバックアップデータ（ゼロ知識暗号化、パスフレーズはサーバー未送信）」「共有カレンダーのデータ（パスフレーズ暗号化）」の3項目を追記。第6章「情報の保管と削除」に「アカウントの削除」（設定画面からいつでも削除可能、公開コースは匿名化されるのみで削除されない旨）を追記。**章番号は変更せず既存章の拡張のみ**（第1〜8章の構成は維持）。最終更新日を2026年7月19日に更新。文言はCLAUDE.mdに記録された技術的事実の範囲でのみ記述（誇大な安全性主張はしない方針）。

## データバックアップ（端末移行用、ゼロ知識暗号化。2026-09-03時点でバックアップ対象は縮小済み）
設定画面から任意でパスフレーズを設定すると、端末移行用に一部データをサーバーへゼロ知識暗号化（PBKDF2+AES-256-GCM、サーバーはパスフレーズ自体を保存しない）バックアップできるオプトイン機能（2026-07-17設計書54実装）。

⚠️ **当初は「予定表・マイコース・共有カレンダー等を含む全データ」を対象にしていたが（設計書58）、その後の設計書178フェーズ1〜3（コース・探訪・予定表機能の削除）で対象フィールドが順次剥がされ、2026-09-03時点で`_collectBackupPayload()`が実際に送るのは`{version, genres, who, ageList, avatar}`（ジャンル設定・家族構成・年齢リスト・アバター絵文字のみ）に縮小している。** また「アカウント連携時にバックアップを必須にする」方針（設計書118）も後に撤回され、現在は完全にオプトインの任意機能（`app.js:3041`のコメント「アカウント連携だけで完結させる方針に変更。バックアップパスフレーズの必須化は廃止」参照）。

- **API**: `GET/PUT /api/user-plans/me`（`requireAppAuth`必須、`data/user-plans/{userId}.json`に`{userId, salt, encryptedData, updatedAt}`のみ保存）
- **UI**: 設定画面「アカウント」セクション内、`renderBackupSection()`＋パスフレーズ入力シート（`#backup-passphrase-sheet`）
- 実装の詳細経緯（タッチ不発バグ修正・パスフレーズシートのレイアウト修正・必須化とその撤回等）はコード内コメント・git履歴を参照

- **設定画面構成**: プロフィール→アカウント（ログイン+バックアップ統合、見出し「アカウント連携」）→アプリ設定→サポート・情報→フィードバック→アカウント削除（見出しなし・中央寄せ、下記「Google/Apple Sign-In認証基盤」参照）の6セクション構成
- **App Store審査対応（プライバシーマニフェスト）**: `@codetrix-studio/capacitor-google-auth`が古いGoogleSignIn SDKに依存し審査で`ITMS-91061: Missing privacy manifest`エラーになったため、CIで`GoogleSignIn`/`GTMAppAuth`/`GTMSessionFetcher`用の`PrivacyInfo.xcprivacy`（`ios-app/PrivacyManifests/`に格納）をビルド時に注入する方式で対応。`scripts/ensure-privacy-manifests.py`が生成済み`Podfile`の`post_install`フックにコピー処理を冪等に挿入する（`.github/workflows/ios-deploy.yml`の`Sync Capacitor`直後で実行）

## PWA・Service Worker
- 「ホーム画面に追加」誘導バナー（`#install-banner`）と「アプリが更新されました」バナー（`#update-banner`）はUIごと削除済み（iOSアプリ（App Store配信）を正式な運用形態とするため）。`handleInstall()`/`showInstallBanner()`/`dismissInstallBanner()`は撤去済み
- `openShareModal()`（設定画面「使い方」ボタンと共用のHOWTOモーダル）・`#share-modal`・`/api/version`・`@capacitor/app`バージョン取得処理はバナー廃止と無関係、従来通り残置
- **SW登録（`navigator.serviceWorker.register('/sw.js')`）は`public/app.js`の初期化処理内に存在**（Web版プッシュ通知の`navigator.serviceWorker.ready`依存＋SW更新時の自動反映のために必要）。登録時に`navigator.serviceWorker.controller`が既にあった場合（＝既存訪問者のSW更新時）のみ`controllerchange`で1回だけ`location.reload()`し、新デザイン等の反映漏れを防止。新規訪問者では初回の`controllerchange`では自動リロードしない（フラグ`_hadController`で判定）
- 既知の残存事項（対応不要・スコープ外）: `public/index.html`に到達不能な`#install-modal`（「ホーム画面に追加する」手順モーダル）が残存。開く関数`openInstallModal()`が存在せずorphaned markup。ボタンの`onclick="handleInstall()"`は関数削除済みで無効だが、到達不能なため実害なし

## iOSアプリ化（Capacitor）2026-07-03実装
- 方式: ローカルバンドル（webDir: `../public`）。Web版と同じHTMLをアプリ内に同梱
- appId: `app.dosuru`（2026-07-10訂正: 以前`app.dosuru.odenavi`と誤記していたが、実際にApple Developer Portalに登録され署名・TestFlight配信に使われている値は`ios-app/capacitor.config.js`の`app.dosuru`） / appName: `SG在住Navi`（`ios-app/capacitor.config.js`で確認済み、旧名`おでかけNavi`から改名）
- `_isCapacitorApp`: `window.Capacitor?.isNativePlatform?.()` で検出。app.js 先頭で定義
- `API_BASE`: Capacitor環境では `https://dosuru.app`、Web環境では空文字列。全fetchに付与済み
- GA4スキップ: `_isCapacitorApp` 時に `window.gtag = function(){}` でnoop化
- 外部リンク: `a[target="_blank"]` クリックを `Capacitor.Plugins.Browser.open()` でデバイスブラウザに渡す
- SW登録・インストールバナー: Capacitor環境でスキップ/非表示
- Push通知UI: 2026-07-10よりCapacitor環境でも表示・利用可能（APNs対応。詳細は下記「APNsプッシュ通知対応」セクション参照）
- CI/CD: `release` ブランチpush → GitHub Actions（macOS runner）→ Fastlane deploy → TestFlight配信（社内テストのみ、`distribute_external: false`）
- Fastlane: レーンは `deploy` のみ。中身は `upload_to_testflight`（App Store本番申請は含まない）
- App Store本番申請は現状このワークフローに含まれず、別途手動対応が必要
- GitHub Secrets: ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY / MATCH_PASSWORD / MATCH_GIT_BASIC_AUTH
- 初回セットアップ: MacInCloudで `npx cap add ios` → Xcode確認 → `fastlane match init` → GitHub Secrets登録
- 詳細手順: `ios-app/README.md` 参照

## iOSアプリのAPNsプッシュ通知対応
Web版（VAPID/Web Push）とは完全に独立した仕組みとしてiOSネイティブPush（APNs）に対応。既存のWeb Pushエンドポイント・データ構造とは無関係に並存する。

- サーバーから`@parse/node-apn`経由でAPNsへ直接送信。`APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID`/`APNS_PRIVATE_KEY`のいずれかが`.env`未設定なら`apnProvider = null`のまま正常起動し、iOS向け送信のみスキップ（Web Pushの可用性には影響しない）
- データモデル: `data/push-subscriptions.json`等の購読情報に`platform`（`'web'`/`'ios'`）フィールドを持つ。web: `{platform:'web', endpoint, keys}` / ios: `{platform:'ios', deviceToken, registeredAt}`
- API: `POST/DELETE /api/push-subscribe-ios`（既存Web Push系エンドポイントとは別）。`sendPushToAll()`内で`platform`別に振り分け送信。無効トークン（410/BadDeviceToken/Unregistered）は自動削除
- クライアント（`public/app.js`）: `_isCapacitorApp`時は`_initNativePush()`/`_toggleNativePush()`（`@capacitor/push-notifications`）。デバイストークンは`@capacitor/preferences`をソースオブトゥルースとするハイブリッド方式で永続化（アプリ完全終了後の再起動でもトグルON表示が維持される）
- **ユーザーのON/OFF意思とOS許可状態は別軸で管理**: `app_push_enabled`フラグをlocalStorage+Preferencesで永続化し、OS許可（granted）とアプリ内トグルのユーザー意思の両方が揃ったときのみ`register()`する。意思フラグ未設定時はトークン有無から「以前ON」を推定（後方互換）
- 通知タップ時: `pushNotificationActionPerformed`リスナーで`switchNav('home')`
- iOS/CI: `ios-app/package.json`に`@capacitor/push-notifications`。CIで`App.entitlements`に`aps-environment: production`を設定しXcodeビルド設定に紐付け。`scripts/ensure-apns-bridge.py`が`AppDelegate.swift`にAPNsブリッジメソッド（`didRegisterForRemoteNotificationsWithDeviceToken`等）を冪等に注入（無ければCI失敗させる）
- スコープ外: Android版対応、通知既読管理・一覧UI、パーソナライズ配信、FCM導入、サイレントプッシュ、通知文言の多言語化

## ジャンル・興味機能（2026-07-02実装、2026-09-03時点でUI非表示・実質不使用）
設定画面「ジャンル・興味」セクションは`display:none`で非表示化済み（未記録の変更、`public/index.html`のコメント「ユーザー要望により非表示化。ロジック・関数は残置」参照）。ジャンルを設定する手段がないため、連動する「おすすめ」フィルターチップ（`data-cat="recommend"`、ジャンル未設定時は自動非表示）も実質常に非表示。ロジック（`GENRE_LIST`定数13種・`saveGenreList`/`getGenreList`・`genreMatch()`・`scripts/fill-genres.js`等）は削除されていないため、再開時はUI非表示を解除するだけで動く。

## イベントカードのDOM差分更新
`renderEventCards()`（`public/app.js`）は`grid.innerHTML`一括再代入ではなく、**イベントID+言語をキーにしたDOM要素キャッシュ（`_cardElCache`）による差分更新**方式を採用している（Instagram埋め込み等`<iframe>`を含むカードの不要な再読み込みを避けるため）。
- 既存キャッシュがあれば`renderEventCard()`を呼ばずDOM要素を再利用し`insertBefore`でノード移動のみ行う。新規イベントのみ新規生成（`_getOrCreateCardEl()`）
- フィルタで除外されたカードは破棄せず`display:none`で保持。`loadEventData()`（データ再フェッチ・都市切替時）冒頭で`_cardElCache.clear()`
- 新規生成カードのみ`fadeUp`アニメーション、再利用カードは`.spot-card--reused`（`animation:none`）
- 画像読み込み失敗時は`handleImgError()`が1.2秒待って1回だけ自動リトライしてから絵文字フォールバックに切り替える（メインカード・ピン詳細・ピン一覧の3箇所で共有）
- 同様の「DOM要素キャッシュで差分更新」パターンを他画面に導入する際の注意: `grid.innerHTML`の丸ごと再代入が別の分岐に残っていると、そこでキャッシュ済みノード（iframe含む）がdocumentから切り離されて破棄される

## i18n対応
- 言語切り替え: STRINGS オブジェクト（ja/en）+ `t(key)` 関数 + `applyI18n()`
- 対応済み: くらし・おでかけ・ピン留め・設定の全画面、ボトムナビ

### ⚠️ i18n 必須ルール
UI文字列を追加・変更するときは **必ず ja と en の両方を同時に対応** する。
- 静的HTMLにテキストを直書きしない。`data-i18n="キー名"` を付け、デフォルトテキストは日本語にする
- `app.js` の `STRINGS.ja` と `STRINGS.en` に **同じキーを同時に** 追加する
- JS側でテキストを生成する場合は `t('キー名')` を使う（ハードコード禁止）
- 変更後は英語モードに切り替えて目視確認すること（キー名がそのまま表示されたら追加漏れ）

## X自動投稿（scripts/post-to-x.js）
- ペルソナ: 日本・SG両方フラットに見る30-40代男性。構造・逆説・気づきを提示するスタイル。「自分だから気づけたこと」を重視し、具体的な在住年数は書かない（個人特定リスク回避のため`PERSONA`定数には「長く」とだけ記載）
- 投稿タイプ: event（イベント紹介）/ life（生活つぶやき）を交互に自動選択。本文日本語90文字以内
- 実行: `node scripts/post-to-x.js [--type=event|life] [--city=sg|bkk|syd|all] [--dry-run]`
- **現在はX API自動投稿ではなく「投稿下書きのLINE通知」運用**（X APIのクレジット枯渇のため停止）: `--to-line`フラグ指定時、生成した投稿文をそのままLINEに送信し、ユーザーが手動でXに貼る。毎日SGT 07:00/19:00にcron実行、ログは`logs/post-to-x-draft.log`。X API送信経路自体は無変更で残置（`--to-line`を外せば復活可能）

## アーキテクチャルール
- ビジネスロジックはサーバーサイドに置く
- フロントエンドはAPI経由でデータを取得する
- DBは使わない、JSONファイルで管理する
- `events.json`/`community-courses.json`等の`data/`配下JSONファイルは、`server.js`の各APIエンドポイントがリクエストの都度`fs.readFileSync`で直接読み込む方式（メモリキャッシュなし）。そのため**データファイルの内容のみを直接編集した場合は`pm2 restart`不要**（`server.js`本体のコード変更を伴う場合のみ再起動が必要）。なお`data/`ディレクトリは`.gitignore`対象のためgit管理外（git commit対象にならない）

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
- **画面ヘッダー上部余白**: 上部余白は`env(safe-area-inset-top, 0px) + 20px`の1回のみの加算で統一する。ホーム画面は`.app-header`に`padding-top: calc(env(safe-area-inset-top, 0px) + 20px)`。くらし/ピン留め/設定画面は共通の`.plan-title-header`（`align-items: flex-start;`固定）を使い、コンテナ側に`padding-top: env(safe-area-inset-top)`、ヘッダー側に`padding: 20px 20px 0`という2箇所分担で合計1回分にする
  - ⚠️ 新しい画面を追加する際、コンテナとヘッダー要素の両方に`env(safe-area-inset-top)`を入れると二重加算になり、notch環境でタイトルがずれる。Web版（safe-area-inset-top=0）では気づけないため実機での確認が必須
- **画面タイトルのマークアップ**: `<span class="screen-title" data-i18n="...">`は、装飾用の親ラッパー（`.app-title`等の独自クラス）で包まない。子孫セレクタ（例: `.app-title span`）による意図しないCSS詳細度衝突で`.screen-title`本来のスタイルが上書きされる事故があったため、ヘッダーコンテナ（`.header-top`/`.plan-title-header`等）の直接の子要素として配置する
- **オーバーレイの表示切替は`classList.toggle('visible')`方式に統一する（2026-07-11追記）**: `display`/`opacity`のインラインstyle直書きによる表示制御は禁止。「表示側は4箇所でstyle操作・非表示側は1箇所だけ」のような取りこぼしパターンが発生しやすく、実際に`.plan-modal-overlay`でこの不統一が確認され、モーダル操作後にタップが効かなくなる重大バグの構造的リスク要因の一つとして`classList`方式へ統一した（`.claude/plan.md`「設計書5」参照）。新規オーバーレイ実装時も必ずCSS側に`.要素名.visible{display:block;opacity:1}`を定義し、JS側は`classList.add/remove('visible')`のみで制御する

## 配色機能（2026-09-05実装、ダークモードは同日中に統合済み）
設定画面「配色」1項目のみで「キャラメル」（従来の暖色系）/「柳グリーン」（Willoaコーポレートカラー、白ベース＋柳グリーン差し色）/「ダーク」の3状態をボタンタップで循環切替（`default`→`willow`→`dark`→`default`…）。**旧来あった独立の「ダークモード」設定行は廃止し、この1つの設定に統合済み**（自動/ライト/ダークの3択だった旧ダークモードの「自動(端末追従)」は廃止）。
- 状態管理は`localStorage`の`sg_palette`キー1本のみ（旧`sg_theme`キーは廃止）。`getPalette()`/`applyPalette()`/`togglePalette()`/`updatePaletteUI()`（`public/app.js`）
- 各状態が実際にセットする`html`要素の属性: `default`→属性なし（`app.css`の`:root`既定値）／`willow`→`data-palette="willow"`のみ／`dark`→`data-palette="willow"`と`data-theme="dark"`の両方（＝「ダーク」の実体は柳グリーンのダーク版。キャラメル単体のダーク版は用意していない）
- **ボトムナビアイコン（2026-09-05実装）**: 絵文字（🏛️🏖️📌⚙️）を廃止し、`currentColor`で塗るインラインSVG（新聞紙／パラソル／地図ピン／スライダー）に置換。色は`.nav-icon-svg{color:var(--light-gray)}`／`.nav-item.active .nav-icon-svg{color:var(--caramel)}`（`public/app.css`）でCSS側から制御するため、配色（キャラメル/柳グリーン/ダーク）切り替えに画像差し替えなしで自動追従する。アプリアイコン（後述）と同じ「フラットなシルエット塗り」の世界観で統一
- **「キャラメル」選択時の配色は無変更**: `app.css`の`:root`（既定値）自体は無変更。`html[data-palette="willow"]`セレクタで同じ変数名（`--caramel`/`--sage`/`--terracotta`/`--gold`/`--sky`/`--plum`とその`-light`/`-pale`派生）を上書きする方式。ダーク状態は`html[data-theme="dark"]`（既存の汎用ダーク配色、コンポーネント個別の暗色指定を含む）と`html[data-palette="willow"][data-theme="dark"]`（柳グリーン用のCSS変数上書き、セレクタ詳細度が高いため優先適用）の組み合わせ
- `public/index.html`の`<head>`内スクリプトは初期描画のちらつき防止のため`sg_palette`を読んで`data-palette`/`data-theme`属性を先読み設定（`applyPalette()`実行前に反映するため）
- **見出しフォント**: 新規CSS変数`--font-heading`を導入（既定値`'Kaisei Opti', serif`、柳グリーン時は`'Noto Sans JP', sans-serif`）。旧来ハードコードされていた`font-family: 'Kaisei Opti', serif;`（`app.css`15箇所・`app.js`/`index.html`各所のインラインstyle）を全て`var(--font-heading)`参照に置換済み
- **カテゴリタグの配色**（`EVENT_CATEGORY_COLORS`/`LIFE_INFO_CATEGORY_COLORS`、`public/app.js`）: 従来ハードコードされていた`rgba(...)`値を`--sky-pale`/`--terracotta-pale`/`--gold-pale`/`--terracotta-light-pale`等の新規CSS変数参照に置換（既定値は旧`rgba()`と同じ見た目、柳グリーン時は全カテゴリが同一の柳トーンに収束する）
- **カテゴリタブ（`.filter-chip`）**: 既定は下線タブのまま無変更。柳グリーン時のみピル塗り（未選択=グレー輪郭／選択中=柳グリーン塗り）に変更
- **ボトムナビ**: 既定はラベル色変化のみで無変更。柳グリーン時のみ選択中アイコンの背後に柳グリーンの薄いピルハイライトを追加（`.nav-item.active .nav-icon`、新規HTML要素追加なし）
- i18n: `labelPalette`（配色/Color Theme）を追加。旧`labelDarkMode`は廃止

## フィルターUI（2026-06-28刷新）
- tabs-section（いつ行く？4タブ）廃止
- `#filter-row-category` カテゴリチップ横スクロール行を header 直下に常時表示（何も選ばない = 全件）
- `#event-filter-btn` 絞り込みボタン → `#event-filter-sheet` ボトムシート（いつ行く？/誰と/エリア/キーワード）
- JS変数: `filterCats` / `filterWeek` / `filterWho` / `filterAreas` / `filterKeyword` / `filterEnding`
- プロフィールの who フィルターは廃止。filterWho（シート選択）で統一

## 都市対応状況（2026-09-03時点）
現状SG（シンガポール）のみ稼働中。BKK/SYDはイベント数が少なく一時停止中（`public/index.html`の`ACTIVE_CITIES = ['sg']`、`scripts/run-fetch-all.sh`・`scripts/run-source-analysis.sh`がSG固定）。設定画面の都市選択欄も選択肢が1つしかないため非表示化済み（設計書161、ロジック自体は残置）。再開時は`ACTIVE_CITIES`とスクリプトのcity指定を戻す作業になる。

## SGエリア区分
SGのエリア区分はCentral/East/West/North/North-East/Island-wide/Sentosaの7区分（Sentosaはケーブルカー・モノレールで渡る独立した「行き先」のため単独区分）。定義箇所: `public/index.html`の`#event-filter-sheet`内`.ef-chip`（イベント絞り込みシート）、`scripts/filter-events.js`の`CITY_AREAS.sg`（取り込みパイプラインのAI分類プロンプト用列挙値）。BKK/SYDはSentosa非対象。

## イベント取り込みパイプライン構成（2026-09-05時点、crontab・コード確認済み）

システムcrontabで動いているジョブは実質3本:

| ジョブ | 内容 | 頻度 |
|---|---|---|
| `scripts/run-fetch-all.sh` | `fetch-events.js --city=sg` → `check-content-integrity.js --city=sg` → `fetch-life-info.js --city=sg` → `notify-fetch-summary.js`（イベント＋生活情報をまとめて1通のLINE通知） | 毎日 6:30 SGT |
| `scripts/run-fetch-extra.sh` | `fetch-events.js --city=sg` → `check-content-integrity.js --city=sg`（**通知なし**、生活情報も含まない） | 毎日 12:30 SGT・19:30 SGT |
| `scripts/run-source-analysis.sh` | `discover-sources.js --city=sg --no-notify` → `analyze-sources.js --city=sg --no-notify` | 水・日 7:30 SGT |

BKK/SYDのfetchは`run-fetch-all.sh`内でコメントアウト中（「都市対応状況」参照）。**旧`refresh-courses.js`のcronエントリはコース機能削除（設計書178）に伴い完全に削除済み**（旧CLAUDE.mdに記載があったが実態と乖離していたため訂正）。生活情報取得も当初は独立cronエントリ（毎日7:15 SGT）だったが、後日`run-fetch-all.sh`内に統合され独立エントリは廃止済み（詳細は下記「生活情報・ニュースのキュレーション機能」参照）。

- **`run-fetch-extra.sh`（2026-09-05追加）**: Goody Feed（推定12.6件/日、フィード窓19時間分）・The Smart Local（7.9件/日、窓30時間分）・Eatbook（7.8件/日、窓31時間分）のように、投稿頻度に対してRSSフィードの保持件数が少なく、1日1回の取得だけでは記事がフィードから流れ落ちて取りこぼされるリスクがあるソースへの対策。1日1回（6:30 SGT）だった取得を1日3回に増やし、取得漏れリスクを下げた。ハイウォーターマーク方式（`data/source-fetch-state.json`）により重複取得はされない。通知は6:30 SGTの本実行時のみ行うため、`fetch-summary-sg.json`は直近の実行結果で毎回上書きされる仕様上、**LINE通知に表示される件数はその日の累計ではなく直近の実行分のみ**（events.json自体には各回の新着が正しく累積される）

- **ハイウォーターマーク方式**（`fetch-events.js`）: `data/source-fetch-state.json`にソースごとの`lastSeenGuids`/`lastFetchedAt`を保存し新着記事のみ抽出。初回は`daysBack=7`カットオフにフォールバック。取得失敗ソースは状態未更新（次回また試行）
- **Haiku採否・記事生成**（`filter-events.js`）: `scoreThreshold=6`（`BATCH_SIZE=10`件ずつ、`max_tokens:6000`、失敗時1回リトライ）。カテゴリ比率が薄いカテゴリはscore5以上に緩和。採用イベントはSonnetで日本語/英語記事を生成（`ENRICH_BATCH_SIZE=8`、`max_tokens:6000`、同じく1回リトライ）
- **`data/sources.json`のstatus運用**: `active`/`paused`/`rejected`の3値のみが実際の取得可否を左右する。`pausedAt`/`pausedReason`等は記録用メタデータのみで`fetch-events.js`は参照しない
- **ユーザー向けWebプッシュ通知は完全停止済み**（`notify-fetch-summary.js`は開発者向けLINE通知のみ、`sendPushToAll()`自体は将来の手動再送信用に関数として残置）
- 画像URL疎通確認・discover-sources.jsのAPIエラー握りつぶし修正等の細かい改修履歴はgit履歴を参照

**2026-09-03削除（コード変更）**:
- **カテゴリ上限機能を完全削除**: `filter-events.js`から`CATEGORY_TARGET_RATIO`/`CATEGORY_CAP_BUFFER`定数・`enforceTypeCap()`関数・その呼び出しを削除。カテゴリ超過分の自動削除は行わなくなった（採用側のスコア緩和ロジック`categoryStats`/`thinCategories`は別機能のため維持）
- **Instagram取り込みを完全削除**（`fetch-events.js`/`discover-sources.js`/`analyze-sources.js`の3ファイル）: 削除前時点でSGの全24アカウントが`paused`/`rejected`/`retired`で実際には1件も取得されていなかった（APIトークンは`.env`に設定済みだったが対象0件のため常にスキップ）。
  - `fetch-events.js`: `fetchInstagramPosts()`関数・`CITY_CONFIG`各都市の`instagramAccounts`配列・`loadActiveSources()`のIG読み込みを削除
  - `discover-sources.js`: `probeInstagram()`関数・`probeCity()`/`buildCandidates()`/`buildReport()`内のIG候補プローブ・スコアリング・レポート生成ロジックを削除（RSS候補のプローブ・分析機能は無変更で存続）
  - `analyze-sources.js`: `activeIG`集計・IG停止済みソースの永久除外判定・IG候補への入れ替えロジックを削除。**Step2「rawTotal不足時の量補充」はIG候補のみで実装されていたため機能ごと削除**（RSS候補による代替実装は行っていない、rawTotal不足は警告ログのみになった）
  - 3ファイルとも`node --check`・`--dry-run`実行で正常動作確認済み（Instagram関連の出力が一切出ないこと、RSS側の処理は従来通り動くことを確認）
  - `data/sources.json`/`data/source-pool.json`/`data/source-candidates.json`内の既存`instagramAccounts`データ自体は削除していない（コードから参照されなくなっただけで、意図的にファイルには残置）
- **`analyze-sources.js`のソース自動入れ替えロジックを廃止、直接「永久除外」する方式に変更**: ユーザー要望「入れ替えロジックとめていい、採用率が低いやつだけ永久除外のリストに追加するだけにして。ときどきチェックするので」を受けて変更。旧Step1（不良ソースを`paused`にして`source-candidates.json`の候補と自動で入れ替え）を撤去し、不良ソース（直近4回で採用率5%未満または4回連続0件）を検知したら直接`status:'rejected'`にするだけに単純化。候補との入れ替え・`source-candidates.json`の読み込み自体を`analyze-sources.js`から削除（`sortCandidatesByDiversity()`関数・`PATHS.candidates`・`cityCands`も不要になったため削除）。新規ソースの追加は今後ユーザーが手動で`data/sources.json`を編集する運用。`notify-fetch-summary.js`のソース分析セクション表示も「❌ 停止」「➕ 追加」の2行から「🚫 永久除外」の1行のみに変更。`--dry-run`実行で正常動作確認済み（不良ソースが直接rejectedになり、候補入れ替えが発生しないことを確認）

## シンガポール在住日本人向け生活情報・ニュースのキュレーション機能（2026-08-28実装、設計書172。2026-09-03時点でコード確認済み）
週末おでかけイベント取り込みパイプライン（`fetch-events.js`/`filter-events.js`）とはデータ・API・UIとも独立した機能。ボトムナビ「くらし」タブ（表示ラベル、内部id`#nav-news`）の中身。

⚠️ 「旅行」カテゴリは設計書175で一度この機能に追加されたが、同日中に設計書176でロールバックされ、**現在は「おでかけ」画面（イベント一覧）のカテゴリタブとして再配置されている**（上記「イベント取り込みパイプライン構成」の`CATEGORY_TARGET_RATIO`参照）。以下は現在のコード基準の記述。

- **カテゴリ**: 6種（admin/weather/transport/community/health/education）。`server.js`の`VALID_CATEGORIES`もこの6種（travelは含まれない）
- **データ取得**（`scripts/fetch-life-info.js`）: RSS4件（CNA/Mothership/Straits Times/JCCI、⚠️Straits Times追加の経緯は未記録）を`rss-parser`で取得、ハイウォーターマーク方式（`data/life-info-fetch-state.json`、イベント用の状態ファイルとは分離）。Haikuで在住日本人への関連性判定＋カテゴリ付与、Sonnetで日本語/英語要約を生成し`data/sg/life-info.json`（gitignore対象）に保存。リテンション期間は一律7日
- **cron**: 独立エントリではなく、`run-fetch-all.sh`内で`fetch-events.js`の直後・`notify-fetch-summary.js`の直前に実行（毎日6:30 SGT）。当初（設計書172時点）は独立cronエントリ（毎日7:15 SGT）だったが、その後`run-fetch-all.sh`に統合されイベントと同じLINE通知にまとめられている
- **API**: `GET /api/life-info?city=sg&category=...`（`server.js`、`GET /api/events`の直後）
- **フロントエンド**: ボトムナビ「くらし」画面（`#screen-news`）＋ホーム（「おでかけ」画面）のプレビューセクション（`#life-info-preview-section`、直近3件）。未ログインでも閲覧可能（探訪・予定表で使われていたアカウント連携ゲートは適用外）
- 詳細なi18nキー・UI構造等はコード直接参照

## 環境構成と注意事項（2026-07-07）

### Web版 = テスト環境 / iOS App Store版 = 本番環境

| 環境 | URL/配布 | 役割 |
|------|----------|------|
| Web版 | dosuru.app | 開発・確認用（テスト環境） |
| iOS App Store版 | App Store `id6787159354` | 本番（エンドユーザーが使う） |

⚠️ **重要: データ層は両環境で共有**

- `data/sg/events.json`・`data/sg/life-info.json`等のデータファイル
- `/api/*` エンドポイント全般

これらはサーバー上で1つだけ存在し、**Web版とApp Store版の両方が同じデータを参照している。**

**Web版でテスト中に絶対やってはいけないこと:**
- イベントデータを大量削除・破壊的に更新する（本番App利用者に影響する）
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

**モーダル表示中も bottom-nav を表示し続ける設計**: 全モーダル・オーバーレイは bottom-nav (9999) 未満の3000番台z-indexに統一する。

| 要素 | z-index |
|---|---|
| `#event-filter-sheet` | 3100 |
| `.pin-detail-overlay` | 3300 |
| `.pin-detail-modal` | 3301 |

⚠️ 上記以外（`.plan-modal*`/`title-edit*`/`.cal-popup*`/`share-modal`/`cal-sync-modal`/`cal-join-modal`/`install-modal`/`date-picker*`/`schedule-plan-action*`）は探訪・コース・予定表・共有カレンダー機能の削除に伴いDOM上に存在しない（2026-09-03コード確認）。シート/オーバーレイのペアは「シート本体 ≥ 自身のoverlay」の相対関係を維持し、新規モーダル追加時も3000番台の方針（bottom-nav未満）に合わせること。

**例外: パスフレーズ入力シート（`#backup-passphrase-sheet`/`#cal-passphrase-sheet`）はテキスト入力中に限りbottom-navを一時的に隠す**
→ モバイルSafariは`position:fixed;bottom:0`要素のキーボード表示時可視領域追従がbottom-navとシートとで同期せず、ボタン行が重なる問題があったための例外措置。`document`レベルの`focusin`/`focusout`リスナーで、対象2シート内のINPUT/TEXTAREAにフォーカスがある間だけ`.bottom-nav`を`visibility:hidden`にする（Web版・iOS版共通）

**PTR（プルトゥリフレッシュ）**: `_initPtr(container, indicatorId, onRefresh, watchSwipeIntent)`共通ヘルパーでiOS版のみ有効化（`_isCapacitorApp`、Web版は対象外）。現在ホーム画面（`#home-scroll-content`）・くらし画面（`#news-scroll-content`）に適用。スクロールコンテナ内の`.ptr-indicator`要素の`height`/`opacity`のみを操作し、ヘッダー・`html`/`body`には一切触れない設計。リフレッシュ確定閾値60px
→ **iOS overscroll防止JS（下記）・StatusBar Info.plist設定の2箇所を変更しないことが、PTRが正常動作する前提条件**（過去にこの2箇所の不備でPTRのヘッダーずれ・白いステータスバー問題が起きたため）。変更する場合はPTR・ヘッダー位置・ステータスバー色を実機で回帰確認すること

### ⚠️ `position:fixed`要素は、キーボード表示・非表示の過渡期間中にタッチイベントの配送先が親要素にずれることがある（2026-07-11）

実機ログ解析（設計書9）により判明した既知の食い違い: iOS WKWebViewでは、キーボードが閉じた後`window.innerHeight`/`visualViewport.height`が実際の値に戻るまでの過渡期間（数秒〜数十秒、`resize:'none'`設定下でも発生）、`position:fixed`要素（ボトムナビ等）の**子孫**へのネイティブタッチイベント配送が、子要素ではなく親のfixed要素自体をターゲットにしてしまうことがある。

- この間、`document.elementFromPoint()`によるプログラム的ヒットテストは常に正確に子要素を返し続ける（CSSレイアウト・座標系自体は破壊されていない）
- つまり「JS/CSSOM上は正常なのに、実際のタップだけが効かない」という食い違いが生じる。見た目やDOMを見ても異常が発見できないため原因特定が難しい
- 同様の「見た目・DOM構造は正常なのにタップが効かない」系の調査では、まずこの食い違い（`elementFromPoint()`の理論値 vs 実際のイベントターゲット）を疑い、両方を並べて記録する診断ログをまず仕込むこと
- 対応例（方針C、設計書9で採用）: 親のfixed要素自体に「保険」の`touchend`ハンドラを追加し、`e.target`が個別の子要素（ボタン）でない場合のみ`document.elementFromPoint()`でタップ座標から実際の対象を特定して手動でディスパッチする。既存の子要素個別ハンドラとの二重発火防止（`e.target.closest('.子要素セレクタ')`で判定）が必須

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

### ✅ キーボード被り対策（2026-07-09実装 → 2026-07-11に大幅簡素化、現行実装）
当初「シートを縮小しながら移動する」複雑なJS一式（`_adjustSheetForKb`/`_liftVisibleSheetForKeyboard`等）を実装したが、ビューポート固着バグの真因は無関係な`capacitor.config.js`の`contentInset:'always'`設定（→`'never'`に変更）と判明（設計書15）し、複雑なJS一式は**無害な被害者として全撤去済み**（コード上に現存しないことを確認済み、`app.js:138`にその経緯コメントあり）。`.plan-modal`/`.plan-sheet`系のシートは内部スクロール（`.plan-modal-body{overflow-y:auto}`）とネイティブ挙動に委ねる。

**現行実装は`_scrollFocusedIntoViewOnKb(kbHeight)`という軽量関数1つのみ**（`public/app.js`、設定画面直下の`#feedback-text`/`#nickname-input`等`.plan-modal`/`.plan-sheet`の外側にある入力欄が対象）。実装上の教訓2点:
- **判定は「スクロール可能かどうか」ではなく「フォーカス要素が実際に画面のどこにあるか」**（`getBoundingClientRect()`で判定）。`Keyboard:{resize:'none'}`下では`clientHeight`が変化しないため、旧来の「`scrollHeight > clientHeight`」判定はコンテンツ量が少ない画面で常にfalseになり誤判定していた
- 祖先の`overflow-y:auto`コンテナが見つかっても、既存`padding-bottom`では実際に必要なスクロール量に届かないことがある（`scrollTop`は`scrollHeight-clientHeight`で頭打ち）。キーボード表示中のみ`padding-bottom`を動的に拡張してから`scrollTop`を加算する。祖先が見つからない場合は何もしない（`scrollIntoView`フォールバックはWKWebViewでレイアウトズレを誘発する副作用があり撤去済み、設計書59）

### ⚠️ z-index是正時は「companion要素」だけでなく「子シート」も辿って確認する（一般則、2026-07-09教訓）
`.plan-modal-overlay`/`.plan-modal`のようなoverlay+本体のペアだけでなく、同じ構造を持つ別クラス（`.plan-sheet`等）にも是正漏れが起きやすい。あるz-index値を変更したら: (1)同じCSSクラスを使う他の要素、(2)その要素の内側から開かれる子シート（親だけ上げて子を据え置くと子が親の背後に隠れる）、(3)最終的なz-index順序を一覧化して意図した重なり順になっているか、の3点を横展開で確認すること。

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

`Info.plist`はリポジトリに含まれず`npx cap add ios`実行時に毎回生成されるため、`getUserMedia()`等でカメラを使う機能がある場合、CIワークフロー内でのPlistBuddy追記が必須（パターンとして記録）。

2026-09-03時点、現在この機能を使う箇所はコード上に存在しないため、`.github/workflows/ios-deploy.yml`の「Set camera usage description in Info.plist」ステップは削除済み（共有カレンダー機能削除に伴う後始末）。将来カメラを使う機能（QRスキャナー等）を追加する際は、このステップを同パターンで復活させること。

### ✅ TestFlight デバッグのコツ

- Web版で直らない場合でもiOSで直ることがある（WKWebView固有の挙動）
- CSSの変更はSW経由でキャッシュされるため、バージョンを上げないと反映されない
- `pm2 restart sg-weekend` は Web版のみ。iOS版は TestFlight ビルドが必要
- ビルド時間: GitHub Actions → TestFlight 反映まで約15〜20分

### ✅ モーダルを閉じる際は必ずフォーカスを外す（blur）
フォーカスが残ったまま非表示化された`<input>`/`<textarea>`が、iOS WKWebView側のタッチイベント配送（`position:fixed`要素であるボトムナビへのヒットテスト）を阻害し、ボトムナビが一時的にタップ無反応になる不具合の原因になる。
- モーダル/シートを閉じる関数の先頭で、「閉じようとしている要素の内部に`document.activeElement`が含まれる場合のみ`blur()`する」ガード付きヘルパー（`public/app.js`の`_blurIfFocusInside(...containers)`）を呼ぶ
- `switchNav()`の冒頭でも、画面遷移直前にフォーカスが残っていれば無条件で`blur()`する
- 新しいモーダル・シートを追加する際、内部にinput/textareaを持つ場合は、close関数に同様のblur処理を入れること

### ✅ onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック
ボトムナビ・FAB等は応答性向上のため`touchend`にJSハンドラ（`e.preventDefault()`で後続clickを抑制）を登録しつつ、HTML側にも`onclick`属性を残す二重登録になっている。iOS WKWebViewでは`touchend`の`preventDefault()`によるネイティブclick抑制が確実に効かないケースがあり、遅延・ゴースト状態のclickイベントが`onclick`属性を直接トリガーしてしまうことがある。

**やってはいけない対処**: タッチ操作検出後に全てのclickイベントを無条件にグローバルブロックする方式（`touchend`ハンドラを持たずonclick属性のみに依存するボタンも道連れで無反応になる）。`onclick`属性の全削除も不可（マウス操作のWeb版で`touchstart`/`touchend`が発火せずボタンが反応しなくなる）。

**正しい対処**: ゴーストクリックが実証されている要素（ボトムナビ・FAB・シェア/フィードバック/言語切替ボタン・各種オーバーレイのclose等）の`onclick`属性**個別**に、`if(!_touchCapableDetected) 関数呼び出し(...)`のガードを埋め込む。グローバルなclickリスナーは追加しない。

```html
<button id="nav-home" onclick="if(!_touchCapableDetected) switchNav('home')">
```
```js
let _touchCapableDetected = false;
document.addEventListener('touchstart', () => { _touchCapableDetected = true; }, { passive: true, capture: true });
```

タッチ操作が一度でも発生した端末では、ガード対象の`onclick`のみ無効化される（`touchend`ハンドラが既に処理済みのため実害なし）。ガード対象外のボタンは通常のclickイベントで動作する。PCブラウザ（マウス操作）では`_touchCapableDetected`が常に`false`のため全onclickが従来通り機能する。

オーバーレイ背景タップで閉じる系（`install-overlay`/`pin-detail-overlay`/`pin-picker-overlay`/`emoji-picker-overlay`/`schedule-action-overlay`/`cal-popup-overlay`）は、`onclick`の個別ガードに加えて`app.js`側の配列一括登録`touchend`リスナーも併用している。新規に同種オーバーレイを追加する際は同じパターンに揃えること。

## server.js編集時の注意（2026-07-09追記）
- `server.js`内、47〜200行目付近は無効化中のStripe決済コードが`/* ... */`で丸ごとコメントアウトされている。この範囲に新しいルートを追加すると**サイレントに一切発火しない**（エラーも出ない）ため要注意
- ルート追加時は必ず追加後に`grep -n "^/\*\|^\*/"`等でコメントブロックの範囲を確認し、対象行が有効なコード領域にあるか確認する
- 新規ルート追加後は`curl -H "Host: xxx"`等で実際にレスポンスを検証してから完了報告すること（行番号だけを頼りに配置場所を判断しない）
- **新しいHTTPメソッド（PUT/PATCH等）を使うエンドポイントを追加する際は、`/api`向けCORSミドルウェアの`Access-Control-Allow-Methods`にそのメソッドが含まれているか必ず確認する**: 漏れるとWeb版はSame-Originのため気づかず、Capacitor環境（`capacitor://localhost`オリジン）のiOS実機でのみOPTIONSプリフライトが拒否され`fetch()`が失敗する。`curl -i -X OPTIONS -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: <メソッド>" <URL>`で確認してから完了報告すること

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

## `.claude/plan.md`の扱い（2026-07-12ルール化）
`.claude/`ディレクトリは基本的にgitignore対象だが、**`plan.md`だけは例外的にgit管理下に置く**（`.gitignore`に`.claude/*` + `!.claude/plan.md`で明示）。理由: 過去に「設計だけして実装未着手」のまま別タスクの設計に押されて`plan.md`が上書きされ、2026-07-11のGoogle/Apple IDログイン設計書が実物ごと失われる事故が発生したため。

- **`plan.md`は必ず末尾に追記する。既存の設計書（実装済み・未実装問わず）を削除・上書きしない。** 新しい設計書は「設計書N」という連番見出しで追記していく
- 実装未着手のまま長期間放置される設計書があっても構わない（`.claude/next.md`に要約とステータスを記録しておけば十分）。`plan.md`自体は削除しない
- ファイルが肥大化してきたら、削除ではなく「古い設計書を`.claude/plan-archive.md`のような別ファイルに移す」形で対応する（移す場合も内容は保持したままにする）
