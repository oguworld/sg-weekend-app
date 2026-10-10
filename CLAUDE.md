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
- Android版がPlay Storeで公開済み(2026-10時点、`app.dosuru`)になったため、ダウンロードセクション(`.cta-store-badges`)にApp Storeバッジと並べてGoogle Play公式日本語バッジ・リンク(`https://play.google.com/store/apps/details?id=app.dosuru`)も追加済み
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
├── android-app/                    ← Androidアプリ化（Capacitor、VPS上でCLIビルド）
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

## 停止・廃止済み機能（詳細・復活手順は`CLAUDE_HISTORY.md`末尾「2026-10退避」節）
現行コードに実体が無い、または停止中の機能。触る前に該当節を`CLAUDE_HISTORY.md`で確認すること。
- **Google/Apple Sign-In・データバックアップ・アカウント削除**: UI・`/api/auth/*`・`/api/user-plans/*`ルートは削除済み。`server.js`にJWT/OAuth等の補助関数が残るのみ。`ios-app/package.json`に`@codetrix-studio/capacitor-google-auth`・`@capacitor-community/apple-sign-in`が依存として残り、iOS CIは`GoogleSignIn`等の`PrivacyInfo.xcprivacy`注入(`scripts/ensure-privacy-manifests.py`)を実行する。設定画面は「アプリ設定→サポート・情報→Willoa→フィードバック」構成
- **プライバシーポリシー**: 外部ページ`https://willoa.net/privacy-policy`を使用。`dosuru.app`側に`privacy.html`・`/privacy`ルートは無い。内容が現行機能(いいね等)に追いついているかは未確認
- **広告(PRカード・Klookウィジェット)**: 停止中。再開は`sponsored-cards.json`へのデータ追記/`renderEventCards()`のコメントアウト解除のみ
- **ジャンル・興味**: UI`display:none`、ロジック残置
- **i18n**: 日本語固定。`t(key)`/`data-i18n`は存続。**新しいUI文字列は`data-i18n`属性＋`STRINGS.ja`へのキー追加のみ(英語キー不要)**
- **X自動投稿**: API送信は停止、`post-to-x.js --to-line`でLINEへ下書き通知する運用(crontab 1日2回)
- **iOSカメラ許可(NSCameraUsageDescription)**: カメラ機能無しのためCIステップ削除済み。QRスキャナー等を作る際はPlistBuddy追記を復活させる

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
- GA4・Instagram embed.jsは`public/index.html`の`<head>`先頭のスクリプトが、ホスト名が`dosuru.app`(Web版)のときだけ読み込む(Capacitorではホスト名が`localhost`)。**以前は静的な`<script>`と`gtag('config')`が先に実行され、app.js側の`window.gtag = function(){}`(今も残置)では間に合わず、iOS/Androidアプリでもアクセスデータが送られていた(設計書221で修正、Play Storeのデータ安全性の申告のため)。iOS版に反映するには次回ビルドが必要**。外部リンクは`a[target="_blank"]`クリックを`Capacitor.Plugins.Browser.open()`へ。SW登録・インストールバナーはCapacitor環境でスキップ/非表示
- CI/CD: `release`ブランチpush→GitHub Actions(`ios-deploy.yml`、macOS runner)→Fastlane `deploy`レーン→TestFlight配信(社内テストのみ、`distribute_external: false`)
- 証明書管理はFastlane Matchを使用していない(`ios-app/fastlane/Appfile`/`Fastfile`に実装なし)。配布証明書(`.p12`)・プロビジョニングプロファイル(`.mobileprovision`)は事前に手動作成してbase64化しGitHub Secretsに登録する運用
- GitHub Secrets: `ASC_KEY_ID`/`ASC_ISSUER_ID`/`ASC_PRIVATE_KEY`/`DIST_CERT_BASE64`/`DIST_CERT_PASSWORD`/`PROVISION_PROFILE_BASE64`/`APPLE_TEAM_ID`
- **本番審査提出の自動化(設計書224)**: `release`ブランチpushトリガーの既存フローとは完全に分離した新規ワークフロー`.github/workflows/ios-release-production.yml`を`workflow_dispatch`専用(pushトリガー無し)で追加。手動実行時に`inputs.confirm`へ厳密に`SUBMIT`と入力しないとジョブ先頭で`exit 1`する安全策あり。Fastlaneレーン`release_production`(`deploy`と同じ証明書インポート～`build_app`を経て`deliver`を呼ぶ、`deploy`レーン自体は無変更)が`skip_metadata: true`/`skip_screenshots: true`(メタデータはApp Store Connect側の既存設定をそのまま使用、リポジトリ管理化はスコープ外)・`submit_for_review: true`・`automatic_release: true`(審査通過後に人間の追加操作なしで即座に一般公開)・`force: true`で`deliver`を実行。既存`ASC_KEY_ID`等のAPIキーが`deliver`に必要なApp Manager以上の権限を持つかは未確認(権限不足時はCI実行時にエラーになるのみで既存TestFlight配信には影響しない)
  - **リリースノート指定(設計書224拡張)**: `workflow_dispatch.inputs.release_notes`(optional)に値を入れると、`release_production`レーンが`deliver`に`release_notes: {"ja"=>...}`を渡し、App Store Connectの「新機能」欄(ja)だけを更新する(`skip_metadata: true`のままでも反映される、他のメタデータ・スクリーンショットには影響しない)。未指定時は`release_notes`パラメータ自体を渡さず従来通りの挙動(後方互換)
  - **既存ドラフトの審査提出専用レーン(設計書224拡張)**: 新規ワークフロー`.github/workflows/ios-submit-existing-draft.yml`(`workflow_dispatch`専用、同様の`confirm`="SUBMIT"必須ガードあり)とFastlaneレーン`submit_existing_draft`。`build_app`・証明書インポート等のビルド関連処理を一切行わず、`deliver(skip_binary_upload: true, ...)`のみ実行して**App Store Connect上に人間が事前に用意した既存のビルド・ドラフトをそのまま審査提出**する(新規ビルドは作られない)。`release_notes` inputも同様にサポート。使い方・前提条件は`ios-app/README.md`参照
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

## Androidアプリ化（Capacitor 8、設計書214→215→217→218）
VPS(Ubuntu 22.04 LTS)上でAndroid Studio等のGUIを使わず、コマンドラインツール(Gradle/Android SDK cmdline-tools)のみでAPKをビルドする運用。iOS版(`.github/workflows/ios-deploy.yml`経由のGitHub Actions CI)とは異なり、現状CI化はしておらずVPS上で手動ビルド。

- `android-app/`(`ios-app/`と対になる構成)。appId: `app.dosuru` / appName: `SG在住Navi`(`android-app/capacitor.config.js`、iOS版と同一値、`ios`固有セクションは無し)
- **iOS版との差分**: Google Sign-In・Sign in with Apple・APNsプッシュ通知はAndroid版に一切含めない(`android-app/package.json`に`@codetrix-studio/capacitor-google-auth`・`@capacitor-community/apple-sign-in`・`@capacitor/push-notifications`を含めない)。設定画面のプッシュ通知トグルUI(`#push-setting-item`)は`public/app.js`の`initPushState()`/`_shouldShowPushPrompt()`で`window.Capacitor?.getPlatform?.() === 'android'`判定により非表示化(既存のiOS版・Web版の`_isCapacitorApp`分岐には影響なし)
- **VPS側ビルド環境(設計書218でCapacitor 8 / API 36へ更新)**: Play Storeは2026-08-31以降、新規アプリのtargetSdkを36以上に要求する(延長は申請制で2026-11-01まで)。Capacitor 8はcompileSdk/targetSdk 36・minSdk 24・AGP 8.13・Java 21・Node 22以上が前提。サーバー(pm2)が使うシステムのNode 20・`~/jdk17`には触れず、Android用に別置き: `~/toolchains/node22`・`~/toolchains/jdk21`・`~/android-sdk`(`platforms;android-34/36`・`build-tools;34.0.0/36.0.0`)。**ビルド時は毎回** `export PATH=$HOME/toolchains/node22/bin:$HOME/toolchains/jdk21/bin:$PATH JAVA_HOME=$HOME/toolchains/jdk21 ANDROID_HOME=$HOME/android-sdk ANDROID_SDK_ROOT=$HOME/android-sdk` を設定する(`~/.bashrc`はJDK 17のままなので非対話・通常シェルでは足りない)。旧Capacitor 6のプロジェクトは`~/backups/android-app-cap6-2026-10-04.tar.gz`に退避済み
- **ビルド**: 上記の環境変数を設定し`cd android-app/android && ./gradlew assembleDebug`で署名無しデバッグAPK(実機確認・`/dl/`配布用)、`./gradlew bundleRelease`で署名付きAAB(`app/build/outputs/bundle/release/app-release.aab`、Play Store用)。`android/`を`npx cap add android`で作り直したら、`npx capacitor-assets generate --android`→`./scripts/apply-native-overrides.sh`(起動画面・署名設定・バージョンを再適用、冪等)の順で実行する
- **リリース署名とバージョン(設計書218)**: アップロード鍵は`~/android-keystore/dosuru-upload.jks`(パスワードは同ディレクトリの`keystore.properties`、リポジトリ外・コミット禁止・chmod 600)。`apply-native-overrides.sh`が`app/build.gradle`に署名設定を注入する(鍵が無ければ署名設定は無効でデバッグビルドは通る)。versionName/versionCodeは`android-app/package.json`の`version`・`androidVersionCode`から反映する。**Playへ更新版を出すたびに`androidVersionCode`を必ず上げる**(同じ値は拒否される)。Play App Signingを使う前提でこれは「アップロード鍵」であり、紛失してもGoogleに申請してリセットできる。鍵ファイルは念のためオフラインにも控えを取ること
- **CORS注意(設計書215で修正済み)**: AndroidのCapacitor WebViewはデフォルトで`androidScheme:'https'`・`hostname:'localhost'`のためオリジンが`https://localhost`になる(iOS版の`capacitor://localhost`とは別値)。`server.js`の`ALLOWED_ORIGINS`に`'https://localhost'`を含めないと全APIリクエストがCORSでブロックされ画面が真っ白/データ欠落になる(実際に発生した不具合、要注意)
- **アイコン・スプラッシュ**: `android-app/resources/icon.png`・`splash.png`・`splash-dark.png`から`npx capacitor-assets generate --android`で`android/app/src/main/res/mipmap-*`(アイコン)・`drawable-*`(スプラッシュ)を生成。**`generateSplash()`はsharpの`resize()`をfit/positionオプション無しで呼ぶためデフォルトcover+centreクロップとなり、正方形素材でロゴがテキストブロック込みで非中央配置だと横長/縦長変換時に大きくズレる**(設計書215で発覚)。ロゴがほぼ画像中央にある正方形素材（背景色込み）を使えば複雑な透過抽出(`logo.png`経由の`generateFromLogo()`)は不要、そのまま`splash.png`/`splash-dark.png`として差し替えれば通常のcover+centre経路で問題なく収まる。スプラッシュ再生成時は`mipmap-*/`配下のアイコンファイルがMD5ハッシュ的に不変であることを必ず確認する(生成コマンドがアイコンも巻き込む可能性があるため)
- **起動画面(Android 12+、設計書217)**: Android 12以降はOS標準のSplash Screen APIが無効化できず、`splash.png`・`androidScaleType`等は起動時に効かない(Capacitor splash-screen v6のREADMEに明記)。端末のダークモードに追従する(ライト=クリーム背景、ダーク=黒背景。`values-night`・`drawable-night-nodpi`に夜用を置く)。「ダークで出るのは正しい動作」とユーザー確認済み(2026-10-04、一度ライト固定にしたが取り消した)。OSが出せるのは「中央アイコン+背景色」のみで、全画面画像や文字だけの表示は出せない。そのため**アプリ名「SG在住Navi」はアイコン画像に描き込んでいる**(`make-splash-icon.js`がロゴ+名前をセットで円に収める。2026-10-04に「小さすぎる」との指摘で1.2倍に拡大(絵の幅528px・文字101px)。文字は円の下側ほど入る幅が狭いため、文字幅が円からはみ出さない一番下に文字を置き、その上に絵を重ねる配置にしている(上下中央揃えではない)。サイズを変えるときは、円の輪郭を重ねたプレビューではみ出しを必ず確認する。フォントはNoto Sans CJK JP Bold、「SG在住」と「Navi」で色分け、ライト/ダークで配色を変える。2026-10-04ユーザー指示でiOS版に合わせた)。`splash.png`が効くのはAndroid 11以前だけ。そのためiOS版に近づける設定を`android-app/native-overrides/`(アイコン画像・背景色XML、コミット対象)と`android-app/scripts/apply-native-overrides.sh`(冪等)で管理し、`styles.xml`の`AppTheme.NoActionBarLaunch`に`windowSplashScreenBackground`/`windowSplashScreenAnimatedIcon`を設定する。アイコン画像は`scripts/make-splash-icon.js`が`resources/splash*.png`から生成(OSの円マスク=キャンバスの2/3にピンが収まる倍率、背景は透過抽出せず同色で一致させる)。**`android-app/android/`を`npx cap add android`で再生成したら、必ず`./scripts/apply-native-overrides.sh`を再実行すること**(生成物はgitignore対象のため設定が消える)。ホーム画面アイコンから起動して確認する(Android 12/12Lはサードパーティランチャーやアプリ情報からの起動でスプラッシュが出ないOS側の既知問題あり)
- **掲載画像zipの配布(一時的)**: `GET /dl-assets/:token`で`releases/android/store-assets.zip`(アイコン512・フィーチャーグラフィック・スクリーンショット3枚・掲載文)を返す。AABの`/dl-aab/:token`、APKの`/dl/:token`とあわせて、Play提出後に撤去する
- **AAB配布(一時的、Play Console提出用)**: `server.js`の`GET /dl-aab/:token`(UUID v4トークンをハードコード)で`releases/android/app-release.aab`を返す。Play提出が済んだら、APK用の`/dl/:token`とあわせて、ルートと`releases/`を撤去する
- **APK配布(一時的な仕組み、恒久機能ではない)**: `releases/android/`(`.gitignore`対象)にビルド済みAPKを配置、`server.js`の`GET /dl/:token`(UUID v4トークンハードコード、`/api/*`向けCORSミドルウェアとは無関係の別パス)でAndroid実機のブラウザから直接ダウンロードさせる。ユーザーの実機動作確認が完了次第、このルートと`releases/`ディレクトリごと撤去する想定(次回別タスク)
- `android-app/android/`(ビルド生成物、巨大)は`.gitignore`対象でコミットしない
- **Play Store申請準備(設計書216、進行中)**: `android-app/store-assets/feature-graphic.png`(1024×500、24bit・アルファ無し)に承認済みフィーチャーグラフィック(クリーム系デザイン)を配置済み。`store-assets/screenshots/`にAndroid実機のスクリーンショット3枚(くらし・おでかけ・カレンダー、1338×2670、24bit PNG)を配置済み。**Playの規格は「長辺が短辺の2倍以内」「アルファ無し」「各辺320〜3840px」「枚数2〜8」**で、実機の縦長画面(1200×2670、比2.225)は超えるため、`android-app/scripts/make-store-screenshots.js`が左右の端を広げて比1.9955にする(見切れたチップの行は背景色で塗る)。同スクリプトはステータスバー(時刻・電池など、実機画面でy=33〜76)も背景色で塗って消す(2026-10-04ユーザー指示)。スクリーンショットを撮り直したら同スクリプトで処理する。アプリ名「SG在住Navi」確定、プライバシーポリシーは`https://willoa.net/privacy-policy`を流用方針(最新性未確認)。残作業: スクリーンショット撮影・連絡先メール確定・Developer登録料$25支払い・Play Console申請操作(いずれもユーザー対応、詳細は`plan.md`設計書216参照)
- **Play Developer API 本番公開自動化(設計書223)**: `android-app/scripts/publish-android.js`(Node.js、CommonJS)が`googleapis`パッケージ経由でGoogle Play Developer API(androidpublisher v3)を直接呼び、審査提出から本番トラック公開までを自動化する。**Fastlane/CI化はせず、VPS上で手動実行する運用**(Android版は既存方針通りCI化しない)。処理フロー: `edits.insert`→`edits.bundles.upload`(AABアップロード)→`edits.tracks.update(track:'production', releases:[{versionCodes:[...], status:'completed'}])`→`edits.commit`。`status:'completed'`・`userFraction`省略(100%ロールアウト)のため、**Googleの審査に通過すると人間の追加操作なしで即座に一般公開される**(Managed Publishingは使わない、デフォルトの「審査通過=即公開」の挙動)
  - **使い方**: `node android-app/scripts/publish-android.js --version-code X`(AABパスは省略時`app/build/outputs/bundle/release/app-release.aab`、`--aab <path>`で明示指定可。versionCodeは省略時`android-app/package.json`の`androidVersionCode`を使用)。実行すると「本番トラックへ公開します。アプリ: SG在住Navi (app.dosuru)、versionCode: X。続行しますか?」と対話確認プロンプトが出て、**`production`と正確に入力しないと中断する**(スキップ用の引数は意図的に用意していない、誤操作・誤自動化防止のため)
  - **ユーザーが事前に行う必要がある手動セットアップ**(エージェントからは実施不可、Googleアカウントの対話操作が必要): (a) Google Cloud Consoleで新規または既存のプロジェクトにサービスアカウントを作成 (b) そのサービスアカウントのJSON鍵をダウンロード (c) Play Console「設定 > API アクセス」でそのサービスアカウントをリンクし、アプリ`app.dosuru`に対して「製品版への公開」権限を付与 (d) ダウンロードしたJSON鍵をVPS上の`~/android-keystore/play-publisher-service-account.json`に配置(リポジトリ外のため`.gitignore`不要、既存の`dosuru-upload.jks`と同ディレクトリ、chmod 600推奨)。鍵パスは環境変数`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH`で上書き可能
  - 鍵未配置・AAB未存在時は分かりやすいエラーメッセージを出して終了する(本番公開への誤操作が発生しないことを確認済み)
  - 上記「APK配布/AAB配布/掲載画像zipの配布(一時的)」の撤去タスクとは別件(このスクリプトはPlay Console提出後の本番公開手順そのものを自動化するもの、撤去タスクは実機確認用の配布導線の後始末)
  - 初回利用時はversionCodeを上げた軽微な更新で一度試すことを推奨(大きな変更と同時に自動公開パイプラインを初めて使うのはリスクが高いため)
  - **`--non-interactive`フラグ(設計書225、リリース自動化エージェント専用)**: 対話確認プロンプト(`production`入力)をスキップしてそのまま本番公開処理を続行する。**人間が直接ターミナルで実行する際には使わないこと**。プロジェクトリポジトリ外のユーザーレベルカスタムエージェント「releaser」(`~/.claude/agents/releaser.md`)から呼び出されることを想定した専用フラグ。デフォルト(フラグ無し)の対話確認必須という挙動は無変更
  - **本番公開中versionCodeとの事前比較チェック(対話・非対話どちらのモードでも常に実行)**: AABアップロードや確認プロンプトより前に、`edits.insert`→`edits.tracks.get(track:'production')`→`edits.delete`(変更を加えずに破棄)で現在本番トラックで公開中の最大versionCodeを取得し、これからアップロードするversionCode(引数または`package.json`の`androidVersionCode`)と比較する。**指定versionCodeが現在の本番versionCode以下の場合は、両方の値を表示したエラーメッセージを出してプロセスを中断する**(Google Play Developer API自体も同一/古いversionCodeを拒否するが、分かりやすいメッセージで早期に止める安全策)。この事前チェック自体がAPIエラー等で失敗した場合は、警告を出しつつ本来の処理を続行する(安全網の不具合で本来成功するはずの公開が止まることを避けるため)

## イベントカードのDOM差分更新
`renderEventCards()`は`grid.innerHTML`一括再代入ではなく、**イベントID+言語をキーにしたDOM要素キャッシュ(`_cardElCache`)による差分更新**方式(Instagram埋め込み等`<iframe>`を含むカードの不要な再読み込みを避けるため)。
- 既存キャッシュがあれば`renderEventCard()`を呼ばずDOM要素を再利用、新規のみ`_getOrCreateCardEl()`で生成。除外カードは破棄せず`display:none`。`loadEventData()`冒頭で`_cardElCache.clear()`
- 画像読み込み失敗時は`handleImgError()`が1.2秒後に1回だけ自動リトライしてから絵文字フォールバック
- **同様のパターンを他画面に導入する際の注意**: `grid.innerHTML`丸ごと再代入が別分岐に残っていると、そこでキャッシュ済みノード(iframe含む)がdocumentから切り離され破棄される

## 公開いいね機能（設計書210→設計書211で双方向トグルに変更）
「くらし」「おでかけ」各カードに、全ユーザーに見える公開の「いいね数」表示（例: `❤️ 12`）。個人用のお気に入り（ピン留め）とは別物、人気度の可視化が目的。

- **確定仕様**: ログイン不要・ON/OFF双方向トグル（ハートを何度でも押し直せる、取り消し可能）。連打・水増し防止は端末の`localStorage`のみ（ピン留めと同方式）、**サーバー側はIPレート制限等を入れず「1リクエストにつき+1/-1固定」でパラメータ改ざん（任意値の直接指定）のみ防ぐ**方針（ユーザー明示承認済み）
- **データ**: `data/sg/likes.json`（`data/`配下のためgitignore対象）。キー形式`{itemType}:{itemId}`（`itemType`は`event`|`news`）、値`{count}`
- **API**（`server.js`）: `GET /api/likes?itemType=event|news`（全件一括取得、`likes.json`未存在なら`{}`）／`POST /api/likes`（`{itemType,itemId,action}`、`action`は`'like'`(+1)/`'unlike'`(-1、0未満にはならない)、未指定時は`'like'`扱い（後方互換）、`withFileLock`でアトミック処理）。いずれも認証不要
- **クリーンアップ**: `scripts/fetch-events.js`の`purgeExpiredData()`直後・`scripts/fetch-life-info.js`のリテンション削除直後、それぞれ`purgeOrphanedLikes()`（各ファイルに重複定義）が現存ID集合に含まれない`likes.json`内キーを削除
- **フロント状態管理**: `likedKey()`/`getLikedItems()`/`saveLikedItems()`（`localStorage`、ピン留めパターン踏襲）、`LIKE_COUNTS = {event:{}, news:{}}`（メモリキャッシュ、`loadLikeCounts()`で`loadEventData()`/`loadLifeInfoNewsScreen()`時に取得）、`toggleLike()`（`liked[key]`の真偽で+1/-1・`action`を分岐、楽観的UI、POST失敗時もローカル状態は維持しロールバックしない）
- **`_cardElCache`との整合（重要）**: `renderEventCards()`のforEachループ内で、キャッシュヒット/新規生成いずれの場合も`.like-btn`の件数・いいね済み状態（ハート塗りつぶし）を`LIKE_COUNTS`/`getLikedItems()`の最新値で都度同期する処理が必須（上記「イベントカードのDOM差分更新」の注意点と同じ理由）
- **くらしカード**（`_lifeInfoCardHtml()`）は`innerHTML`一括再代入方式のため、件数をテンプレート文字列に直接埋め込むのみでよい（差分更新の特別対応不要）
- ピン留め画面（`renderPinList()`/`renderNewsPinList()`）は`renderEventCard()`/`_lifeInfoCardHtml()`を再利用しているため、いいねボタン・件数は自動的に反映される
- **スコープ外**: いいねユーザー一覧、サーバー側IPレート制限、ランキング機能、ホームプレビュー（`_lifeInfoPreviewCardHtml()`）へのいいね表示

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
おでかけ画面・くらし画面それぞれの最上部に3項目ずつ、外部データの実況値を表示。`GET /api/widget-stats?city=sg`1本のAPIで全項目をまとめて返す(`loadWidgetStats()`)。

- **おでかけ画面**: 気温・降水確率(`#stat-temp`/`#stat-rain`、OpenWeatherMap)・2時間予報(`#stat-nowcast`、NEAナウキャスト、47エリア中最も深刻な区分を採用)
- **くらし画面**: 為替SGD→JPY(`#stat-fx`、Frankfurter API)・PSI(`#stat-psi`、data.gov.sg)・デング熱クラスター警戒(`#stat-dengue`、data.gov.sg新API方式。**表示件数は日次新規感染者数ではなく活動中クラスター数のスナップショット**)
- **PSI表示に顔絵文字**: 判定レベルに応じ絵文字を数値前に表示(良好😊/普通😐/要注意😷/健康に悪い😫/危険☠️)。マッピングは`STAT_LEVEL_EMOJI`。**`server.js`の`psiLevel()`/`dengueLevel()`としきい値・ラベル文言を必ず一致させること**(文字列マッチングで強調表示を行っているため)
- **PSI・デング熱タップでクライテリア表示**: `#stat-criteria-popover`に指標説明+レベル一覧チップ、該当レベルを強調。判定基準は`STAT_CRITERIA`(PSI: 良好0-50/普通51-100/要注意101-200/健康に悪い201-300/危険301+、デング熱: 警報なし0/注意1-5/警戒6-15/厳重警戒16+)
- **キャッシュ**: `widgetStatsCache`はフィールド単位(為替/天気/PSI/nowcast/dengue)でキャッシュ、TTLはフィールドごとに個別設定(設計書213で一律30分から変更): 為替30分(元データが平日1日1回更新)/天気20分(OpenWeatherMap無料プランが3時間おき予報のため)/PSI・nowcast各10分(体感の鮮度要求からタイムラグを短縮)/デング熱60分(元データが日次更新、2段階APIリクエストでコストもやや高いため延長)。1項目失敗でも他項目に影響しない(フォールバックで古い値保持)
- **フロント側の再取得(設計書213)**: `loadWidgetStats()`はアプリ起動時に加え、`switchNav()`でhome(おでかけ)・news(くらし)画面へ遷移するたびに、前回取得(`_widgetStatsLastLoadedAt`、成功時のみ更新)から5分以上経過していれば自動的に再実行される。定期ポーリングではなく画面遷移トリガー方式（案A）

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

### 航空券シーズン表（設計書222→2回のUI再設計を経て月カード統合+吹き出しポップオーバー方式に確定、2026-10-09）
**2026-10-10時点で一時非表示化済み**(`public/app.css`の`.cal-fare-icon-btn`に`display:none !important`を追記)。理由: 都市リスト見直し(札幌・クアラルンプール除外、フーコック島・コタキナバル・ジョグジャカルタ等の追加候補)が未着手のまま本番リリース(iOS/Android)を迎えてしまうため、ユーザー指示でUIのみ一時的に隠した。**コード・データは一切削除しておらず、ロジック(`loadFareSeasonsData()`・`toggleFareBubble()`・`renderFareBubble()`等)・`content/fare-seasons.json`・`GET /api/fare-seasons`はすべて残置**。再表示する際は`public/app.css`に追加した非表示ルールを削除するだけでよい(都市リスト見直し完了後が前提)。以下は非表示化前の設計内容(ロジック自体は現存):

SG発の航空券が高い/安い月を行き先別の5段階で示す**静的な目安表**(実運賃は扱わない)。初版15都市: 東京・大阪・札幌・クアラルンプール・ペナン・バンコク・プーケット・バリ・ホーチミン・ダナン・セブ・モルディブ・シドニー・パース・台北。**UIは「別シート(月選択チップ＋ランキングリスト)」方式から、各月カードの見出し行に統合する「吹き出しポップオーバー」方式に作り直し済み**(カレンダー機能とフィットしていないとのフィードバックのため2回再設計。データ・API・ロジックは一貫して無変更)。

- **データ**: `content/fare-seasons.json`(**`data/`配下ではなくgit管理対象**。手書きで磨くコンテンツのため`data/`のgitignoreから意図的に外している)。都市ごとに`levels`[12か月、1〜5]・`climate`[12か月]・`haul`(near/mid/far)・`direct`・`flightHours`・`cheapestMonths`・`notes`を保持。編集時は`node scripts/validate-fare-seasons.js`で形式検証(levels/climateが12要素、レベル1〜5の整数、cheapestMonthsに挙げた月のレベルが実際に最安値と一致、等)してからコミットする
- **API**: `GET /api/fare-seasons?city=sg`。`content/fare-seasons.json`をそのまま返しつつ、`schoolHolidays: {moe, sijs}`(SGの学校休暇が及ぶ月番号の配列)をサーバーが動的計算して付加する。**月を手書きで二重管理しない**: `calendar-events.json`内の名前が`現地校(MOE):`で始まる`school-vacation`項目からMOE、`school-calendar.json`の`vacations`からSIJSを算出(`computeSchoolHolidayMonths()`)。認証不要、`Cache-Control: public, max-age=3600`
- **通信失敗時のフォールバック**: `sw.js`は`/api/`をネットワーク専用にしているためService Workerキャッシュは使わず、フロントが最後の成功応答を`localStorage`(`sg_fare_seasons_cache`)に保存し、次回通信失敗時はそれを表示する
- **入口**: 各月カードの見出し行(`.cal-month-head-outer`)に✈アイコンボタン(`.cal-fare-icon-btn`、季節アイコン`.cal-season-icon-btn`と同じ丸ボタンの見た目、季節アイコンが無い月でも常時表示)。専用のヘッダーボタン・別シートは廃止済み
- **吹き出しポップオーバー**: ✈タップで`.cal-fare-bubble`がその月カード内に表示。位置計算(矢印追従・左端クランプ)は既存の季節アイコン用吹き出し(`.cal-month-season-bubble`)と共通の`_positionCalBubbleUnderBtn(headRow, btn, bubble)`関数を再利用。横幅は季節アイコンの吹き出しより広い`min(300px, calc(100vw - 56px))`、`max-height:60vh`+縦スクロール
- **吹き出しの中身(2026-10-10再設計: 「安い順」→「おすすめ渡航先」)**: そのカードが指す月(月を選ばせない)の15都市を「おすすめ度スコア」昇順(小さいほどおすすめ)に並べたランキング(`renderFareBubble()`)。見出しは「〇月のおすすめ渡航先」。スコアは価格レベル(`levels`、1〜5)に気候の良し悪しによる補正(good→-0.5/neutral→0/bad→+0.5)を加えたもので、`_fareClimateTier(climateStr)`(`climate`文字列をgood/neutral/badに機械分類。判定順位: ①梅雨/雨季/台風語を含む→bad ②乾季/過ごしやすい/涼しい/初夏/避暑/観光シーズン語を含む→good ③ソンクラーン/旧正月等イベント語を含む→good(例外的に「そこに行く理由」として) ④その他→neutral)と`_fareRecommendScore(level, tier)`で計算。同点時はlevel小さい方→id順で安定ソート。各行はレベルバッジ(数字1〜5＋固定色、`.fare-rank-badge`)・都市名・気候tierアイコン(good:☀️/bad:🌧/neutral:無し、`.fare-climate-icon`)・一言ラベル(`FARE_LEVEL_SHORT_LABEL`: 最安・狙い目/安め/普通/やや高め/高額)+`climate`文字列併記(`.fare-rank-climate`、例:「・暑い・ソンクラーン」)・学校休暇マーク(🏫/🎒)。行タップで簡易詳細(`.fare-rank-detail`、予約目安+学校休暇との重なり程度を1〜2行、`_fareSimpleDetailHtml()`)をその場に展開、再タップで閉じる。最安月・所要時間は割愛(パッと見れることを優先)。**データ・API(`content/fare-seasons.json`・`GET /api/fare-seasons`)は変更しておらず、既存の`levels`/`climate`フィールドのみをフロント側のロジックで組み合わせている**
- **相互排他**: `_closeAllCalBubbles()`に一本化。予定note(`.cal-note-bubble`)・季節アイコン(`.cal-month-season-bubble`)・航空券(`.cal-fare-bubble`)の3種のうちどれか1つを開くと他は全部閉じる
- **データ遅延ロード**: `loadFareSeasonsData()`は初回✈タップ時に未取得なら`toggleFareBubble()`内で呼ぶ(カレンダー画面表示時の先読みはしない)
- **配色**: `--fare-lv1`〜`--fare-lv5`(固定変数、ライト/ダーク双方で別値を定義。色だけに頼らずバッジに1〜5の数字も表示)。レベルの一言ラベル文言`FARE_LEVEL_SHORT_LABEL`(`public/app.js`)はUI専用の表現で、データ側`content/fare-seasons.json`内の`legend`文言(「かなり安い」等、凡例の基礎データとしては維持)とは別物
- **スコープ外**: 実運賃の取得・表示、価格アラート、アフィリエイト、日本以外の出発地、`verified`フィールドの画面表示、更新スクリプト

### ピン留めのFAB化
ピン留めはくらし・おでかけ画面のみに表示されるクリップ型FAB(`#fab-pin`、`#fab-top`と反対の左下)から開くボトムシート。中身(`#pins-sectioned-content`等)は旧`#screen-pins`から無変更で移設。
- **FABの表示条件**: ピン留め0件時は非表示(`updatePinFabVisibility(screen)`)
- **開閉**: `classList.toggle('visible')`方式
- **z-index教訓(重要)**: `bottom:0`で画面最下部まで届く新規`position:fixed`要素(シート・モーダル)は、z-indexが`.bottom-nav`(9999)より高くないと、画面下部(ボトムナビと重なる帯)でボトムナビがヒットテストを奪いタッチが一切効かなくなる。`.pin-sheet-overlay`/`.pin-sheet`は10000/10001に設定済み。同パターンの他モーダル(`.pin-detail-modal`等)追加時も要確認

## アプリ共有機能
設定画面「シェア」ボタン(`#do-share-btn`)は**まずQRコード表示シートを開く**(直接`navigator.share`/クリップボードコピーには分岐しない)。シート内「リンクを共有」ボタン(`#qr-share-link-btn`)から従来の`doShare()`を呼ぶ。
- QRコード生成: `public/qrcode-generator.js`(Kazuhiko Arase氏のMIT製、依存なし)。`qrcode(0,'M').addData(url); .make(); .createSvgTag(6,4)`でSVG取得、`#qr-code-canvas`にキャッシュ挿入
- QRコードURL: 紹介LP(`https://about.dosuru.app`、iOS/Android両方のダウンロードリンクを掲載、2026-10-10変更)。`doShare()`のテキスト共有は引き続き紹介LP・App Store URL両方を含む文言(変更なし)
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
- **ユーザー向けWebプッシュ通知はイベント側(`fetch-events.js`)は完全停止済み**(`notify-fetch-summary.js`は開発者向けのみ、`sendPushToAll()`自体は残置)。**生活情報側(`fetch-life-info.js`)のユーザー向けプッシュは現役稼働中**(1日1回、7:00 SGT固定でトリガーのみ実行。実際に送信するかどうか・内容は「今日は何の日通知」(設計書225)によりカレンダー連動、詳細は後述の該当節参照)。両者を混同しないこと
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
- **1日3回取得、ユーザー向けプッシュ通知のトリガーは7:00 SGT固定**(`CITY_CONFIG.sg.feeds`全5本を一律1日3回取得、ハイウォーターマークのため重複処理なし。トリガーは朝の回のみ、12:00/21:00は`--no-notify`)
- **「今日は何の日通知」(設計書225、2026-10-10)**: 上記トリガーで呼ばれる`POST /api/notify-events-updated`は、新着記事の固定文言ではなく**その日のカレンダー行事と連動した内容**を送る。`server.js`の`getTodayCalendarNotification(cityKey)`が`data/sg/calendar-events.json`からSGT基準の「今日」に一致し`category`が`holiday-sg`/`festival`(`holiday-jp`/`school-vacation`は対象外)かつ`confirmed !== false`の項目を抽出(複数該当時は`holiday-sg`優先、同カテゴリ内は記載順で先頭)。**該当する行事が無い日はプッシュ通知自体を送らない**(従来の「毎朝必ず1通届く」という挙動からの変更、`{skipped:true}`を返しログに記録)。該当がある日はタイトル`今日は{name}です`、本文`今日は{name}です。{note}`(`note`があれば)+末尾に新着記事を促す一文を付けて1通に統合送信する。通知文はAI生成ではなく固定テンプレート組み立て(コスト・レイテンシ・失敗リスク回避のため意図的な選択)。`sendPushToAll(cityKey, title, body, url)`は引数化済み(デフォルト値は旧来の固定文言のまま、呼び出し元が明示指定しない場合のみ適用される設計)
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

## 鉄則（開発フロー）
- **通常フロー**: 新機能・仕様変更・複数ファイルに跨る修正・`server.js`/データ構造/認証/CI設定に触れる修正は、planner→orchestrator(builder→checker→closer)の順で回す。
- **軽微な修正はメインエージェントが直接実施してよい**(planner/orchestrator省略)。目安: 1ファイル内の定数・文言・表示値・CSS微調整・ドキュメント更新で、API/データ構造/認証/CI設定に触れず影響範囲が自明なもの。迷ったら通常フロー。
  - 直接修正でも省略しないこと: (1)`public/app.js`・`app.css`を変えたら「CSSキャッシュバスティング手順」(`index.html`のクエリ＋`sw.js`の`CACHE_NAME`)を必ず実施(過去にF1アイコン修正で`CACHE_NAME`のバンプ漏れが発生、Web版に反映されなかった) (2)`node --check`等で構文検証 (3)`server.js`を変えたら`pm2 restart sg-weekend`＋curl検証 (4)ローカルコミットし`.claude/next.md`に1行記録(`plan.md`への設計書追記は不要)
- **トークン節約**: 調査系(planner/debugger)は必要に応じて軽量モデルを指定して実行する。話題が切り替わったら`/clear`か`/compact`を使う。

## エージェントの使い方(通常フロー時)
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
