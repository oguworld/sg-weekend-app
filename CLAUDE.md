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

## Google/Apple Sign-In認証基盤（2026-07-14 Google実装・2026-07-15 Apple追加、設計書20/35/36/44。iOS版+Web版。予定表紐づけは次回）
`.claude/plan.md`の設計書20（元設計）・35（認証情報最小化・フェーズ再評価）・36（Web版追加）に基づきGoogle Sign-In（iOS+Web両方）を実装、設計書44でSign in with Apple（iOS+Web両方）を追加した。予定表データ/共有カレンダーのユーザー紐づけ（設計書37）は今回もスコープ外、未着手のまま。

- **認証情報最小化方針（2026-07-15設計書39で訂正）**: サーバー側が保存・利用するのは`idToken`の`sub`クレームのみ。`email`/`name`/`picture`等は一切保存・利用しない。`data/users.json`のスキーマは`userId`/`provider`/`providerSub`/`createdAt`/`lastLoginAt`/`subscriptions`のみ（`email`・`displayName`・`avatarEmoji`は含まない）。**ただし、Google同意画面自体に`email`・`profile`スコープへのアクセス許可（「名前とプロフィール写真」「メールアドレス」）が表示されることは、Google Identity Servicesの仕様上、技術的に回避不可能である**（`google.accounts.id.initialize()`にはそもそも`scope`パラメータが存在せず、より低レベルの`google.accounts.oauth2.initTokenClient`に切り替えても「サインインスコープ（openid, email, profile）はバンドル」という仕様上の制約が及ぶため）。方針は「（Googleに）取得させない」ではなく「（サーバー側で）保存・利用しない」ことを個人情報保護の実質的な担保手段とする（ユーザー合意済み、詳細は`.claude/plan.md`「設計書39」参照）
- **`data/users.json`**: 新規（gitignore対象、既存`data/`ルールでカバー済み）。`provider`+`providerSub`をユニークキーにupsert。既存の`data/push-subscriptions.json`と同じ`withFileLock`パターンを踏襲
- **サーバー**: `server.js`に以下を追加
  - `POST /api/auth/google`: `idToken`を`google-auth-library`の`OAuth2Client.verifyIdToken()`で検証。`audience`に`[GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID]`の配列を渡し、iOS/WebどちらのクライアントID発行トークンも許容。検証成功後`sub`のみ取り出し`data/users.json`をupsert、自前JWT（`jsonwebtoken`、`JWT_SECRET`署名、payloadは`{userId}`のみ、有効期限30日）を発行して返す
  - `GET /api/auth/me`: `Authorization: Bearer <JWT>`を検証し`{userId, provider, createdAt}`のみ返す（`requireAppAuth`ミドルウェア、ヘッダーなし/不正は401）
  - `GET /api/config`: 認証不要、`{googleWebClientId}`のみ返す軽量エンドポイント（Web版のGoogle Identity Services初期化用、`.env`の値を動的反映するため）
  - `verifyAppJwtOptional(req)`: ヘッダーなし/不正時は例外を投げずnullを返す（任意認証用の共通ヘルパー）
- **コース関連エンドポイントの後方互換認証対応**: `POST /api/courses/publish`・`DELETE /api/courses/:id`・`POST /api/courses/:id/unpublish`に`verifyAppJwtOptional()`を追加。`Authorization`ヘッダーがあり有効なJWTなら、そのuserIdを`authorId`として使う（publishはリクエストボディの`authorId`より優先、delete/unpublishは対象コースの`authorId`と一致する場合のみ許可、不一致は403）。**ヘッダーがない場合は現状の挙動を完全維持**（無検証のまま動作、旧バージョンApp・未ログインユーザーの後方互換）
- **CORS設定変更**: `/api`向けミドルウェアの`Access-Control-Allow-Headers`に`Authorization`を追加、`Access-Control-Allow-Methods`に`DELETE`を追加（既存の`Content-Type`のみの許可では`Authorization`ヘッダー付きリクエストがCapacitorアプリ等のクロスオリジンからブロックされるため）
- **iOS版（Capacitor）**: `ios-app/package.json`に`@codetrix-studio/capacitor-google-auth@^3.4.0-rc.4`を追加（**注意**: 同パッケージの安定版3.3.6系はpeerDependencyが`@capacitor/core@^5.0.0`でCapacitor 6非対応。Capacitor 6に正式対応しているのは`3.4.0-rc.1`以降のプレリリース版のみで、`latest`npmタグも`3.4.0-rc.4`を指している。今後関連パッケージのバージョンを見直す際は必ず`npm view <pkg> peerDependencies`でCapacitorバージョンとの整合を確認すること）。`ios-app/capacitor.config.js`に`GoogleAuth`プラグイン設定（`scopes:['openid']`、`iosClientId`は2026-07-15にGoogle Cloud Console発行の実値`928776929755-ne2tlcmg60esqkgfb1uiuujgh7k13bh4.apps.googleusercontent.com`へ設定済み）を追加。**この`scopes:['openid']`設定コメント「email/profileは要求しない」について（2026-07-15設計書39で懸念提起 → 2026-09-03実機確認で解消）**: ネイティブGoogle Sign-In SDKもWeb版と同根の「サインインスコープはバンドル」制約が及ぶ可能性を懸念していたが、iOS実機で確認した結果、同意画面はopenidスコープのみでemail/profileへのアクセス許可表示は出ないことを確認済み。コメント通りの実装で問題なし
- **iOS版URL Scheme設定（2026-07-15実装、設計書41）**: `.github/workflows/ios-deploy.yml`に「Set Google Sign-In URL scheme in Info.plist」ステップを新規追加（`Sync Capacitor`後・既存Info.plist操作3ステップ後・`Create App.entitlements`前に配置）。`@codetrix-studio/capacitor-google-auth`公式ドキュメント記載の必須手順で、認証フロー完了後にアプリへ復帰するためのURL Scheme（Reversed Client ID: `com.googleusercontent.apps.928776929755-ne2tlcmg60esqkgfb1uiuujgh7k13bh4`）を`Info.plist`の`CFBundleURLTypes`に登録する。`CFBundleURLTypes`は配列内に辞書、その中にさらに配列というネスト構造のため、既存のPlistBuddy `Add`/`Set`パターンではなくPython3（macOS runner標準搭載）の`plistlib`モジュールで、既存`CFBundleURLTypes`の有無を確認した上で安全に追記する方式を採用（既存配列があれば追記、無ければ新規作成の両対応）
- **Web版**: `public/index.html`に Google Identity Services SDK（`https://accounts.google.com/gsi/client`）の`<script>`タグを追加
- **`.env`新規変数（プレースホルダー状態、2026-07-14時点）**: `JWT_SECRET`（実際にランダム生成済み、`crypto.randomBytes(32).toString('hex')`）、`GOOGLE_WEB_CLIENT_ID`・`GOOGLE_IOS_CLIENT_ID`（いずれも`REPLACE_WITH_YOUR_...`のプレースホルダー、既存`OPENWEATHER_API_KEY`と同じ運用パターン。Google Cloud Consoleでの実発行はユーザーが別途行う）。値がプレースホルダーのままでもサーバーはクラッシュせず起動する設計（`POST /api/auth/google`は`audience`配列が空の場合500を返すのみ）
- **フロントエンド（`public/app.js`）共通実装**:
  - `authedFetch(url, options)`: `localStorage`の`app_auth_token`があれば`Authorization: Bearer`ヘッダーを自動付与するfetchラッパー。コース公開/削除/非公開化の既存fetch呼び出し（`publishCourseById`/`unpublishCourseById`/`deleteMyCourse`）を`authedFetch`に置き換え済み
  - `handleGoogleLoginClick()`: `_isCapacitorApp`のときのみ`_handleGoogleLoginIOS()`を呼ぶ（`registerPlugin('GoogleAuth')`優先→`Plugins.GoogleAuth`フォールバックの防御的取得パターンを踏襲、既存Keyboardプラグインの取得パターンと同様）。Web版は2026-07-15設計書40で`renderButton()`方式に変更したためこの関数では何もしない（下記参照）
  - `_submitGoogleIdToken(idToken)`: 共通処理。`POST /api/auth/google`に送信し、成功時`localStorage.app_auth_token`に自前JWTを保存、`refreshLoginUI()`で画面表示更新
  - `refreshLoginUI()`: 起動時（`init`シーケンス内`initPushState()`等と並んで呼び出し）および認証状態変化時に、設定画面のログインセクション表示を切り替え。未ログイン時は`GET /api/auth/me`を呼ばない（トークンなしなら即座に未ログイン表示、無駄な401を出さない設計）。トークン失効時（401）は自動的に匿名状態に戻す
  - `handleLogoutClick()`: `localStorage`からJWTを削除するのみ（サーバー側の状態変更は不要という設計書20 §7の方針通り）
- **設定画面UI**: 「ログイン」セクションをプロフィールセクションの直後に新設。`_isCapacitorApp`による表示/非表示分岐はしない（Web・iOS共通表示、押下後の処理のみプラットフォーム分岐）。未ログイン時は「Googleでログイン」ボタン（Apple版ボタンは今回未実装）、ログイン時は「Googleでログイン中」固定表示＋ログアウトボタン（**メールアドレス・氏名は一切表示しない**）。既存の`.settings-section`/`.settings-item`クラスをそのまま使用、CSS変更なし。**Web版のログインボタン自体は2026-07-15設計書40で自前ボタンからGoogle公式`renderButton()`描画に変更済み（下記参照）**
- **i18n**: `secLogin`/`loginWithGoogle`/`loginStatusGoogle`/`logoutBtn`/`toastLoginSuccess`/`toastLoginError`/`toastLogoutSuccess`の7キーをja/en同時追加
- **既知の制約・次回フォロー事項**:
  - 「Googleでログイン中」ラベルは現状固定文言（プロバイダがGoogleのみのため）。次回Sign in with Apple追加時は`provider`に応じた動的表示への変更が必要
  - iOS版のGoogle Sign-In用URL Scheme（`Info.plist`の`CFBundleURLTypes`）は2026-07-15設計書41でCIワークフローに追加済み（上記「iOS版URL Scheme設定」参照）。次回TestFlightビルドでentitlements等と合わせて反映される
  - Google Cloud ConsoleでのOAuthクライアントID（Web用・iOS用の両方）実発行はユーザーが完了済み（iOS用: `928776929755-ne2tlcmg60esqkgfb1uiuujgh7k13bh4.apps.googleusercontent.com`）。`.env`のWeb用クライアントIDも実値設定済み（2026-09-03確認）。実際のGoogleログインのエンドツーエンド動作（iOS版含む）もTestFlight実機で確認済み・正常動作
- **2026-07-15修正（設計書38）**: 「Googleでログイン」「ログアウト」ボタンがタッチ操作（スマホ・タブレット）で反応しない不具合を修正。CLAUDE.md下記「onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック」節のパターンのうち、touchend側の登録が新規ボタン`#google-login-btn`/`#logout-btn`にのみ漏れていたのが原因。既存の設定画面touchendハンドラ（`public/app.js`）に2行追加して解消済み
- **2026-07-15訂正（設計書39、コード変更なし・ドキュメント訂正のみ）**: 実機でGoogleの同意画面を確認した結果、「scopeは`openid`のみ要求し`email`・`profile`スコープは要求しない」という当初記述（上記「認証情報最小化方針」節）が誤りだったと判明。Google Identity Servicesの仕様上、「Sign In With Google」機能を使う限り同意画面への`email`・`profile`スコープのアクセス許可表示は技術的に回避不可能（`google.accounts.id.initialize()`に`scope`パラメータ自体が存在せず、より低レベルのAPIに切り替えても「サインインスコープ（openid, email, profile）はバンドル」という仕様上の制約が及ぶため）。ユーザーに説明したところ「しょうがないね。個人情報は当面持ちたくないです」との回答を得て、方針を「（Googleに）取得させない」から「（サーバー側で）保存・利用しない」に転換した（サーバー側は`sub`のみ保存する実装を維持、コード変更は不要）。Apple Sign-Inは（後日設計書44で実装、2026-09-03裏取り確認済み）Googleと異なり`email`・`fullName`スコープを個別に許可/拒否でき、`email`は実アドレス共有かAppleプライベートリレーかを選択できる、という認識が正しいことを確認済み。詳細は`.claude/plan.md`「設計書39」参照
- **2026-07-15修正（設計書40）: Web版GoogleログインボタンをrenderButton方式に変更（One Tap再表示不可問題の修正）**。「一度ログイン→ログアウトすると、リロードせずに再度ボタンを押しても反応しなくなる」不具合を修正。原因はGoogle One Tap（`google.accounts.id.prompt()`）の仕様で、一度サインインに成功するとページリロードまで内部的に抑制状態が残り、再度`prompt()`を呼んでも表示されなくなるため（Google公式ドキュメント記載の意図的な仕様）。Google公式の推奨解決策である`google.accounts.id.renderButton()`（クリックのたびに確実にポップアップが起動する恒久的なボタン）に切り替えた
  - `public/index.html`: 自前デザインの`<button id="google-login-btn">`を空のコンテナ`<div id="google-login-btn-container">`に置き換え。ボタンの見た目・ラベルはGoogle側が描画するため、既存デザインへの完全一致は不可（許容済み）。`data-i18n="loginWithGoogle"`キー・翻訳文字列自体は死にキーとして残置（削除しない）
  - `public/app.js`: `_handleGoogleLoginWeb()`（`prompt()`呼び出し）を`_initGoogleButtonWeb()`（`renderButton()`呼び出し、`container.dataset.rendered`で多重描画防止）に置き換え。アプリ起動時の初期化フロー内で、GIS SDK（`<script async>`）のロード完了を最大20回×300msリトライで待ってから一度だけ呼ぶ。`handleGoogleLoginClick()`はiOS版分岐（`_handleGoogleLoginIOS()`）のみが残り、Web版では何もしない（ボタンクリック自体をGoogleが処理するため）
  - 設定画面のtouchendガード一覧（`public/app.js`、「onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック」節参照）から`#google-login-btn`の行を削除（IDごとDOM上から消えたため）。`#logout-btn`側は変更なし
  - **`disableAutoSelect()`追加**: `handleLogoutClick()`に`window.google?.accounts?.id?.disableAutoSelect?.()`を追加。GIS未ロード時・iOS環境実行時もオプショナルチェイニングでエラーにならない
  - `renderButton()`オプション: `type:'standard'` `theme:'outline'` `size:'large'` `text:'signin_with'` `shape:'pill'` `logo_alignment:'left'` `width:280`。ダークモード・言語切替への自動追従はしない（初回描画時に固定、スコープ外として許容）
  - iOS版（`_handleGoogleLoginIOS()`）は無変更
  - **2026-09-03確認: 実機（TestFlight）でのログイン→ログアウト→再ログインの動作確認済み・正常動作**
- **2026-07-15修正: iOS版「Googleでログイン」ボタンが表示されない不具合を修正**。原因は設計書40で`#google-login-btn`（自前ボタン）を`#google-login-btn-container`（Web版`renderButton()`専用の空コンテナ）に置き換えた際、iOS版向けの代替ボタン挿入処理を追加し忘れていたため（`_isCapacitorApp`時は元々`if (!_isCapacitorApp) {...}`のWeb版分岐のみで、iOS版は何も描画しないまま放置されていた）。`public/app.js`の初期化コードに`else`分岐を追加し、iOS版では`#google-login-btn-container`に自前ボタン（設計書40以前と同じスタイル）を`innerHTML`で動的挿入する方式に修正。設定画面touchendガード一覧にも`#google-login-btn`の判定行を復元した
- **2026-07-15追加: Sign in with Apple（設計書44）**
  - **サーバー**: `apple-signin-auth`パッケージで`identityToken`を検証。`APPLE_SERVICE_ID`（Services ID、`.env`は2026-07-15時点プレースホルダー`app.dosuru.web`）・`APPLE_APP_ID`（App ID、確定値`app.dosuru`）のどちらか未設定なら`APPLE_AUTH_ENABLED=false`で機能を安全に無効化するフェイルセーフ（APNs実装と同パターン）。`verifyAppleTokenAndUpsert()`共通コアロジックがiOS/Web両経路から呼ばれ、`upsertUser('apple', sub)`で`data/users.json`をupsert（Googleと同じ`sub`のみ保存方針）
  - **API**: `POST /api/auth/apple`（iOS版、`identityToken`を直接POSTしJWTを即時返す）、`GET /api/auth/apple/state`（Web版CSRF対策、ワンタイム`state`をサーバー側インメモリMap+5分TTLで発行）、`POST /api/auth/apple/callback`（Web版、Appleの`response_mode:'form_post'`によるフルページPOSTを受信。`state`検証後、JSONではなく`<script>location.replace('https://dosuru.app/#auth_token=...')</script>`のHTML中継でJWTをURLフラグメント経由でクライアントに渡す）。`GET /api/config`に`appleServiceId`/`appleRedirectUri`を追加（既存`googleWebClientId`と同居、後方互換）
  - **Web版フロントエンド**: Sign in with Apple JS SDK（`appleid.auth.js`・`appleid-button.js`）を`<script async>`で読み込み。設定画面に`<div id="appleid-signin" data-color="black" data-border="true" data-type="sign in" data-width="280" data-height="40">`（Apple公式ボタン、`#apple-login-btn-container`でラップ）を配置。`_initAppleButtonWeb()`が`GET /api/config`→`GET /api/auth/apple/state`→`AppleID.auth.init({clientId, scope:'', redirectURI, state, usePopup:false})`の順で初期化（`scope`を指定しないことで同意画面を出さない設計）。起動時IIFE `_consumeAppleAuthTokenFromHash()`がURLフラグメントの`auth_token`を検出し`localStorage`保存後に`history.replaceState`でURLから除去
  - **iOS版**: `ios-app/package.json`に`@capacitor-community/apple-sign-in@^6.0.0`を追加（Capacitor 6系対応バージョンをpeerDependencies確認済み、latestの7系はCapacitor7要求のため不使用）。`_handleAppleLoginIOS()`が`registerPlugin('SignInWithApple')`優先→`Plugins.SignInWithApple`フォールバックの防御的取得パターン（既存Google/Keyboardと同様）で`authorize({clientId:'app.dosuru', redirectURI, scopes:''})`を呼ぶ。iOS版は自前ボタン（`#apple-login-btn-container`に動的挿入、Googleボタンと同スタイル）
  - **CI**: `.github/workflows/ios-deploy.yml`の「Create App.entitlements」ステップに`com.apple.developer.applesignin: ["Default"]`を追加（配列値のため設計書41で確立したPython plistlib方式、既存`aps-environment`（PlistBuddy）と共存）。Sign in with Apple自体はGoogleと異なりURL Scheme登録は不要
  - **i18n**: `loginWithApple`/`loginStatusApple`をja/en同時追加。`refreshLoginUI()`が`GET /api/auth/me`の`provider`フィールドに応じて`login-status-label`の表示を動的切り替え（Google/Apple共通ラベル要素）
  - **2026-07-19確認（Apple Developer Portal側作業は完了済みと判明）**: 当初「ユーザー側作業として未着手」としていたが、実際には既に完了していたことが確認できた。App ID（`app.dosuru`）でSign In with Apple capability有効化済み、Services ID（`app.dosuru.web`、Description「Odekake Navi Web」）発行済み・Sign In with Apple有効・Web Authentication Configuration（Primary App ID: `app.dosuru`、Domains: `dosuru.app`、Return URLs: `https://dosuru.app/api/auth/apple/callback`）も設定済み。`.env`の`APPLE_SERVICE_ID=app.dosuru.web`はプレースホルダーではなく実際に有効な値だった（コメントの「プレースホルダー」表記が実態と乖離していたため修正要）。ドメイン確認ファイル（`public/.well-known/`）配置は不要だった（Sign in with Apple Web Authenticationの仕組み上、Services IDへのドメイン登録のみで足り、Apple Payのような`.well-known`ファイルホスティングは不要）。2026-07-19、Web版で実際に「Sign in with Apple」ボタンから認証〜連携完了までエンドツーエンド確認済み（`data/users.json`に`provider:"apple"`のレコードあり、既存1件は2026-07-15時点のiOS版由来と推測、いずれにせよ現在はWeb版も動作確認済み）。iOS版は既存レコードの存在から動作している可能性が高いが、次回TestFlightビルド後に改めて実機確認する
- **2026-07-16修正（設計書46）: iOS版ログインボタンのブランド化＋文言の「アカウント連携」化**
  - iOS版（`_isCapacitorApp`分岐、`public/app.js`）の自前Google/Appleボタンに公式ロゴのインラインSVGを付与しブランドガイドライン準拠にした。Google=公式4色「G」マーク（`viewBox="0 0 48 48"`の4パス）＋白背景・グレー枠・pill、Apple=公式Appleロゴ（`fill:#fff`）＋黒背景・白文字・pill。ロゴはインライン埋め込み（オフライン対応のため外部URL参照にしない）。`onclick`・`_touchCapableDetected`ガード・要素id（`#google-login-btn`/`#apple-login-btn`）・`data-i18n`構造は維持（設計書44のtouchendガードを壊さない）。CSSは`public/app.css`に`.oauth-btn`/`.oauth-btn--google`/`.oauth-btn--apple`/`.oauth-btn__logo`を切り出し。ダークモード（`html[data-theme="dark"]`）時、黒背景のAppleボタンが背景と溶けないよう薄い枠（`border:1px solid rgba(255,255,255,0.28)`）を付与。**Web版ボタン（`renderButton()`・Apple公式ボタン）は無変更**
  - 文言を「ログイン」から「アカウント連携」へ統一（匿名でも使えるアプリに対する予定表同期用の連携という位置づけを反映）。i18n 7キーをja/en同時変更: `secLogin`（アカウント連携/Link account）・`loginStatusGoogle`（Google連携中/Linked with Google）・`loginStatusApple`（Apple連携中/Linked with Apple）・`logoutBtn`（連携解除/Unlink）・`toastLoginSuccess`（連携しました/Account linked）・`toastLogoutSuccess`（連携を解除しました/Account unlinked）・`toastLoginError`（連携に失敗しました…/Linking failed…）。`loginWithGoogle`（Googleでログイン）・`loginWithApple`は公式ロゴ承認文言のため据え置き（`loginWithApple`のjaは「Appleでログイン」→「Appleでサインイン」にApple公式ローカライズ表記へ調整）。`index.html`の`data-i18n="secLogin"`/`data-i18n="logoutBtn"`のデフォルト直書きも更新
  - **2026-09-03確認: iOS版ボタンの公式ロゴ表示・ダークモード時のAppleボタン（黒背景）の視認性・タップ挙動、いずれもTestFlight実機で確認済み・問題なし**
- **2026-07-16修正（設計書48・課題2/3）: 連携維持のトークン破棄条件緩和＋連携解除の確認ダイアログ**
  - **課題2（再起動で連携が切れる不具合の対策）**: `refreshLoginUI()`（`public/app.js`）は従来`GET /api/auth/me`が`!res.ok`またはfetch例外のとき無条件で`clearAuthToken()`していた。iOS版は起動直後にネットワーク未確立・サーバー一時エラー（500系）・タイムアウトが起きやすく、有効なトークンでも「連携が切れた」ように見えて破棄していた（実質ログアウト）。**`res.status === 401`（明確な失効）のときのみ`clearAuthToken()`**し、それ以外（500系など`!res.ok`）と`catch`（通信エラー）ではトークンを保持して`_showLoggedInOptimistic(loggedInEl, loggedOutEl, labelEl)`で「連携中」の楽観的表示を維持する。楽観的表示ではproviderが不明なためラベルは既存の`loginStatusGoogle`を汎用流用（新規i18nキーは追加せず）。provider確定は正常時（`res.ok`）経路のみ`data.provider`から正確に更新。**`@capacitor/preferences`へのトークン移行はスコープ外**（設計書48・課題2-2、まずcatch/status修正のみで様子見。localStorage方式のまま）
  - **課題3（連携解除の確認ダイアログ）**: `handleLogoutClick()`先頭に`if (!confirm(t('confirmLogout'))) return;`を追加。誤タップでの即解除を防止。i18n新規キー`confirmLogout`をja（`アカウント連携を解除しますか？`）/en（`Disconnect your linked account?`）に同時追加
  - **2026-09-03確認**: 「連携後にアプリ再起動して連携が維持されるか」はTestFlight実機で確認済み・維持される。「連携解除の確認ダイアログが出るか」は未確認のまま
- **2026-07-16修正（設計書49）: JWT保存を`@capacitor/preferences`ハイブリッド方式に変更（再起動で連携が切れる根本解決）**
  - 設計書48の課題2は「有効なトークンを一時通信エラーで破棄しない」対策だったが、**トークン自体がiOS版WKWebViewの再起動でlocalStorageから消える**ケースには効かなかった。そのためJWTの保存先を`@capacitor/preferences`（iOSネイティブの`UserDefaults`にマップされる永続領域）をソースオブトゥルースとする**ハイブリッド方式**に変更した（`public/app.js`のトークン操作4関数＋起動時初期化のみ。`server.js`無変更＝pm2再起動不要）
  - 3層構造: `_authTokenCache`（JSモジュールスコープ変数、`getAuthToken()`を**同期のまま維持**するための同期読み取り元）／ `localStorage`（ミラー・Web版の主保存先）／ `@capacitor/preferences`（iOS版のソースオブトゥルース、非同期API）。`getAuthToken()`はキャッシュ優先→localStorageフォールバックの同期関数（`authedFetch()`の既存シグネチャを壊さない）。`setAuthToken`/`clearAuthToken`はキャッシュ・localStorageを即時更新し、Preferences書き込みはfire-and-forget（`.catch(()=>{})`、awaitしない）
  - プラグイン取得は`registerPlugin('Preferences')`優先→`window.Capacitor.Plugins.Preferences`フォールバックの防御的実装（Keyboard/PushNotifications既存パターン踏襲）。`_CapPrefs`は`_isCapacitorApp`時のみ非null。Web版は`_CapPrefs===null`で従来通りlocalStorage単独動作（挙動不変）
  - 起動時初期化 `_initAuthToken`（非同期IIFE、旧同期`refreshLoginUI()`呼び出しを置換）: iOS版は`await _CapPrefs.get({key})`でトークン読み出し→`_authTokenCache`セット＋localStorageミラー。Preferencesに無くlocalStorageにあれば（旧バージョン移行）Preferencesへ書き込む。**Preferences読み出し完了「後」に`refreshLoginUI()`を呼ぶことが必須**（非同期のため同期で先に呼ぶとキャッシュ未初期化で匿名表示になる）。`ios-app/package.json`に`@capacitor/preferences@^6.0.0`追加
  - 一時計装`_sendDebugLog('auth_prefs_init', { hasPrefs, hasToken })`を`_initAuthToken`末尾に埋め込み済み。**原因確定後に削除する使い捨て**（`.claude/next.md`参照）
  - **2026-09-03確認: 「連携→アプリ完全終了→再起動して連携が維持されるか」はTestFlight実機で確認済み・維持される（Preferences永続化は機能している）**
- **2026-07-19実装（設計書65）: アカウント削除機能を追加（App Store Review Guideline 5.1.1(v)対応）**
  - **サーバー**: 新規`DELETE /api/auth/me`（`requireAppAuth`必須、`server.js`の`GET /api/auth/me`直後）。(1)`data/users.json`から該当`userId`のレコードを`withFileLock`で削除、(2)`data/user-plans/{userId}.json`が存在すれば`withFileLock`で削除（`getUserPlansFilePath()`の既存バリデーション使用）、(3)全都市（sg/bkk/syd）の`data/{city}/community-courses.json`を走査し該当`authorId`を`null`に匿名化（**コース自体・`spots`・`likes`・`isPublic`は変更しない**。公開コースは他ユーザーが既に閲覧・いいねしている可能性がある公開データのため、削除ではなく作成者情報のみ匿名化する設計。`authorId`は権限判定にのみ使われ画面表示には使われないため`null`化による表示崩れなし）。冪等（対象レコードが既に無くても200 `{ok:true}`を返す）。プッシュ通知トークン（`data/push-subscriptions.json`）・共有カレンダー参加情報（userIdと紐づく仕組みが存在しない）は対象外
  - **クライアント**: `public/app.js`の`handleDeleteAccountClick()`（`handleLogoutClick()`直後）が`confirm(t('confirmDeleteAccount'))`→`authedFetch(DELETE /api/auth/me)`→成功時`_clearAllAccountLocalState()`（JWT・バックアップ鍵material・saltの3点セットを一括クリア）→`refreshLoginUI()`/`renderBackupSection()`で未ログイン表示に戻す、という流れ。**500系エラー時はローカル状態を一切クリアしない**（サーバー側削除が確認できてから消す設計、`handleLogoutClick()`とは逆の慎重さ）。401時（トークン失効）はローカルクリアのみで完了トースト表示
  - **UI配置（2026-07-19設計書66で「アカウント」セクションから分離・設定画面最下部の独立セクションへ移動 → 同日設計書67で見出し廃止・中央寄せテキストのみに変更済み。以下は歴史的経緯）**: 当初は設定画面「アカウント」セクション、`#login-section-logged-in`（ログイン中表示ブロック）の直後に`#delete-account-section`を新設していたが、破壊的・不可逆操作を日常操作から視覚的に切り離すため、設計書66で「フィードバック」セクションの後、新規見出し`secDangerZone`（ja「アカウント削除」/en「Delete Account」、`color:var(--terracotta)`）を持つ独立`.settings-section`として最下部に移動した。さらに設計書67でiOSアプリの一般的なパターンに合わせ、見出し自体を廃止し「アカウントを削除」テキストのみを中央寄せ・pill装飾なしで表示する形に変更した（詳細は下記「アカウント削除ボタンを見出しなし・中央寄せテキストのみに変更」節参照）。**未ログイン時は非表示**（`refreshLoginUI()`/`_showLoggedInOptimistic()`の全分岐で`#login-section-logged-in`と表示/非表示を同期、`document.getElementById('delete-account-section')`によるIDベース参照のためDOM位置移動の影響を受けない）。`.settings-item--danger`（`var(--terracotta)`色、`public/app.css`）で視覚的に区別
  - **touchendハンドラ追加漏れ対策**: 設定画面の`touchend`デリゲーション一覧（`public/app.js`、`#logout-btn`判定行の直後）に`#delete-account-btn`を追加済み。設計書46（iOS版Googleボタン表示漏れ）と同型のミスを踏まないための必須対応として実施
  - **i18n**: `deleteAccountBtn`（アカウントを削除/Delete account）・`confirmDeleteAccount`（取り消せない旨の強い警告文言）・`toastDeleteAccountSuccess`・`toastDeleteAccountError`の4キーをja/en同時追加
  - **リスク・スコープ外（設計書65 §11・§4に明記）**: 部分失敗リスク（3つの独立した`withFileLock`操作のため、途中クラッシュで一部だけ完了する可能性。既存の他マルチステップ処理と同水準のリスクとして許容）。「猶予期間」「復元（アンドゥ）」機能は実装せず即時削除のみ。Google/Appleサーバー側のOAuth連携解除（各プラットフォームの設定画面で行う操作）は範囲外。共有カレンダー参加情報の削除連動は、そもそも紐づけ機能自体が未実装（設計書37 §3・設計書54 §4）のためスコープ外
  - **App Store Connect側「Appプライバシー」申告フォームの更新はコード変更では対応不可、ユーザーが審査提出前に手動対応が必要**（本タスクのスコープ外として明記。2026-09-03確認: ユーザー側で対応済み）
  - **2026-09-03確認: iOS実機でのタップ動作・削除フローのエンドツーエンド確認済み・正常動作**（Web版はcurl・目視で先行検証済み）

## プライバシーポリシー更新（2026-07-19実装、設計書65）
`public/privacy.html`第1章「収集する情報」に「Google/Appleアカウントの識別子（sub のみ保存、email/氏名/画像は保存しない。同意画面表示は各社仕様上回避不可能である旨も明記）」「予定表・マイコース等のバックアップデータ（ゼロ知識暗号化、パスフレーズはサーバー未送信）」「共有カレンダーのデータ（パスフレーズ暗号化）」の3項目を追記。第6章「情報の保管と削除」に「アカウントの削除」（設定画面からいつでも削除可能、公開コースは匿名化されるのみで削除されない旨）を追記。**章番号は変更せず既存章の拡張のみ**（第1〜8章の構成は維持）。最終更新日を2026年7月19日に更新。文言はCLAUDE.mdに記録された技術的事実の範囲でのみ記述（誇大な安全性主張はしない方針）。

## データバックアップ（端末移行用、ゼロ知識暗号化。2026-09-03時点でバックアップ対象は縮小済み）
設定画面から任意でパスフレーズを設定すると、端末移行用に一部データをサーバーへゼロ知識暗号化（PBKDF2+AES-256-GCM、サーバーはパスフレーズ自体を保存しない）バックアップできるオプトイン機能（2026-07-17設計書54実装）。

⚠️ **当初は「予定表・マイコース・共有カレンダー等を含む全データ」を対象にしていたが（設計書58）、その後の設計書178フェーズ1〜3（コース・探訪・予定表機能の削除）で対象フィールドが順次剥がされ、2026-09-03時点で`_collectBackupPayload()`が実際に送るのは`{version, genres, who, ageList, avatar}`（ジャンル設定・家族構成・年齢リスト・アバター絵文字のみ）に縮小している。** また「アカウント連携時にバックアップを必須にする」方針（設計書118）も後に撤回され、現在は完全にオプトインの任意機能（`app.js:3041`のコメント「アカウント連携だけで完結させる方針に変更。バックアップパスフレーズの必須化は廃止」参照）。

- **API**: `GET/PUT /api/user-plans/me`（`requireAppAuth`必須、`data/user-plans/{userId}.json`に`{userId, salt, encryptedData, updatedAt}`のみ保存）
- **UI**: 設定画面「アカウント」セクション内、`renderBackupSection()`＋パスフレーズ入力シート（`#backup-passphrase-sheet`）
- 実装の詳細経緯（タッチ不発バグ修正・パスフレーズシートのレイアウト修正・必須化とその撤回等）はコード内コメント・git履歴を参照

### アプリ全体のフォント統一感チェック（見出し役割のテキストにKaisei Optiを横展開）（2026-07-24実装、設計書160）
design 159（予定タイトル・スタンプ名のフォント統一）の流れで、ユーザーが「全体的にチェックして統一感を持たせて」と依頼。`public/app.css`内の「タイトル/名前」系クラス26個を全件洗い出し、既存の確立済みルール（本文=Noto Sans JP、見出し・固有名詞タイトル=Kaisei Opti明朝系セリフ）に沿っていないものを特定し、6箇所を追加対応した。

- `public/app.css`の以下6クラスに`font-family: 'Kaisei Opti', serif;`を追加（フォントサイズ・太さ・色・その他プロパティは一切変更なし）: `.unscheduled-pin-name`（予定表「未定」欄のピン名）・`.course-card-title`（モデルコースカードのコース名タイトル）・`.stamp-level-complete-badge-title`（探訪スタンプ帳・全制覇バッジのタイトル）・`.stamp-complete-card-name`（探訪スタンプ帳・全制覇済み展開カードのスポット名）・`.badge-row-name`（卒業アルバム・実績バッジのレベル名）・`.stamp-level-title-main`（探訪スタンプ帳・レベル見出しのメインラベル、design 153で新設）
- **意図的に対象外（小さいキャプション/補足ラベルであり見出しではないと判断、無変更のまま）**: `.stamp-detail-memory-title`（12px「あなたの記録」ラベル）・`.ga-section-title`（12px、卒業アルバムのミニ見出し）・`.stamp-level-title-sub`（design 153の年数目安サブラベル）・`.plan-modal-subtitle`・`.schedule-action-name`・`.plan-pin-dropdown-name`（明示的にNoto Sans JP指定済みのドロップダウン/アクション一覧項目）・`.card-new-ribbon--today`（bare `font-family: sans-serif;`、英語リボン表示用）・`.photo-quote::before`（`font-family: Georgia, serif;`、卒業アルバムの引用符装飾グリフ単発指定）
- 既にKaisei Opti適用済みの要素（`.section-title`/`.card-title`/`.pin-card-title`/`.plan-card-title`/`.stamp-card-name`等、design 159までに対応済み）は無変更
- `public/app.js`・`server.js`・データファイルは無変更（`pm2 restart`不要）
- キャッシュバスティング: `index.html` app.css `?v=20260724m`→`20260724n`、`sw.js` CACHE_NAME=`sg-weekend-v710`→`v711`（`app.js`は内容変更なしのため`?v=`据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機での6箇所の新フォント表示・文字幅変化によるレイアウト崩れ有無は2026-07-24時点で`git diff`によるコード照合・curlでのWeb版配信反映確認のみ完了、実ブラウザ・実機とも未確認

### ⚠️ 設定画面セクション構成の変更（2026-07-19実装、設計書64、上記の`secBackup`/`secLogin`関連記述は歴史的経緯として一部実態と乖離）
設定画面が「プロフィール→ログイン→予定表のバックアップ（HTMLコメント上「2.5」）→アプリ設定→その他」という5セクション構成になっていたのを、「プロフィール→**アカウント**（ログイン+バックアップ統合）→アプリ設定→**サポート・情報**→**フィードバック**」の5セクションに再編成した（機能・ロジック変更は一切なし、`.settings-item`内部のid/onclick/classは無変更、見た目上の再編成のみ）。
- **旧「ログイン」セクション（見出しキー`secLogin`）と旧「予定表のバックアップ」セクション（見出しキー`secBackup`）を1つの`.settings-section`に統合**し、見出しを新規キー`secAccount`（ja「アカウント」/en「Account」）に変更。`secLogin`/`secBackup`キー自体はHTML上で無参照になったため`STRINGS.ja`/`STRINGS.en`から削除済み（他機能からの参照なしを`grep`で確認済み）
- **旧「その他」セクション（見出しキー`secOther`）を2分割**: SNS・バージョン・シェア・応援の4項目は既存キー`secOther`を廃止し新規`secSupport`（ja「サポート・情報」/en「Support & Info」、**旧`secSupport`キーは別用途「応援する」/「Support」で使われていた死にキーだったため値を上書き**）に変更。フィードバック送信欄（テキストエリア＋送信ボタン）は独立した新規`.settings-section`として切り出し、見出しは既存キー`secFeedback`（値「フィードバック」/「Feedback」で完全一致のため値変更なし、元々別の死にキーとして存在していたものを再利用）
- 上記に伴い、本CLAUDE.md内の「Google/Apple Sign-In認証基盤」セクションおよび本セクション内の`secLogin`/`secBackup`への言及（設計書20/35/36/44・設計書54/58由来の記述）は、**セクションの見出しキー自体は現在存在しない**という点で実態と乖離している。ロジック・データモデル・API等の実装内容自体はそれらの記述通り無変更で有効
- キャッシュバスティング: `index.html` app.js?v=20260719a、`sw.js` CACHE_NAME=sg-weekend-v625
- **未検証（次回TestFlightビルド後にフォロー）**: iOS版での5セクション表示、「アカウント」セクション内のログイン+バックアップ統合表示、「フィードバック」単独セクションの見た目（他セクションと内容量の差による間延び有無）は2026-07-19時点でWeb版のみ確認済み、iOS実機は未確認

### ⚠️ アカウント削除ボタンを独立セクションとして最下部へ移動（2026-07-19実装、設計書66）
設計書64で「アカウント」セクションに統合されていた`#delete-account-section`（ログイン状態表示・連携解除ボタンと同居）を、破壊的・不可逆操作を日常操作から視覚的・構造的に切り離すため、設定画面の**最後**（「5. フィードバック」の後）に新規「6. アカウント削除」独立セクションとして分離した。設定画面は現在6セクション構成: プロフィール→アカウント→アプリ設定→サポート・情報→フィードバック→**アカウント削除**。
- `public/index.html`: `#delete-account-section`ブロック（`id`/`onclick`/`data-i18n`/ボタン内部構造は完全に無変更）を「アカウント」セクションから削除し、末尾に新規`.settings-section`として再配置。新規見出し`<div class="settings-section-title" data-i18n="secDangerZone" style="color:var(--terracotta);">`を追加（既存の危険色CSS変数`--terracotta`を流用、新規CSS変数は追加していない）
- `public/app.js`: `STRINGS.ja`/`STRINGS.en`に`secDangerZone`（ja「アカウント削除」/en「Delete Account」）を追加。`_showLoggedInOptimistic()`・`refreshLoginUI()`は`document.getElementById('delete-account-section')`によるIDベース参照のため、DOM位置移動の影響を受けず無変更のまま正しく動作する
- キャッシュバスティング: `index.html` app.js?v=20260719c、`sw.js` CACHE_NAME=sg-weekend-v627（CSS変更を伴わないため`app.css?v=`は据え置き）
- `server.js`・`public/app.css`は無変更。`handleDeleteAccountClick()`本体・サーバー側`DELETE /api/auth/me`も無変更（表示位置のみの変更、機能面の回帰なし）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での新セクションの余白バランス・ダークモード時の`--terracotta`見出し色の視認性は2026-07-19時点でWeb版のみ確認済み、iOS実機は未確認

### ⚠️ アカウント削除ボタンを見出しなし・中央寄せテキストのみに変更（2026-07-19実装、設計書67）
設計書66で追加したセクション見出し「アカウント削除」（`data-i18n="secDangerZone"`）とpill形状のボタン装飾を撤去し、iOSアプリでよくある「見出しなし・赤系テキスト1行のみが中央寄せで表示される」パターンに変更した（ユーザーが実機スクリーンショットを見て要望）。
- `public/index.html`: `<div class="settings-section-title" data-i18n="secDangerZone" ...>アカウント削除</div>`の見出し行を削除。`#delete-account-btn`のインラインstyleを`display:flex;justify-content:center;align-items:center;width:100%;padding:12px 18px;border:none;background:transparent;...`に変更（`display:inline-flex`・`border-radius:50px`・`border:1.5px solid transparent`のpill装飾を撤去、paddingは既存`.settings-item`の縦padding`12px 18px`に統一）。文字色は既存`.settings-item--danger`クラス（`var(--terracotta)`）をそのまま維持、インライン色指定は追加していない
- `public/app.js`: `STRINGS.ja`/`STRINGS.en`から`secDangerZone`キーを削除（他に参照が無いことをgrepで確認済み）。`deleteAccountBtn`/`confirmDeleteAccount`は無変更
- `handleDeleteAccountClick()`本体・`onclick`属性のタッチガード・touchendデリゲーション（`#delete-account-btn`判定行）は一切変更なし
- キャッシュバスティング: `index.html` app.js?v=20260719d、`sw.js` CACHE_NAME=sg-weekend-v628（`app.css`は無変更のため`?v=`据え置き）
- `server.js`・`public/app.css`は無変更
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での中央寄せテキストの余白バランス・ダークモード時の視認性は2026-07-19時点でWeb版のみ確認済み、iOS実機は未確認

### App Store審査差し戻し対応: GoogleSignIn関連3フレームワークへのプライバシーマニフェスト注入（2026-07-19実装、設計書68）
v1.5 build 111のApp Store審査提出が、Apple自動バイナリ検証エラー「ITMS-91061: Missing privacy manifest」（`GoogleSignIn.framework`/`GTMAppAuth.framework`/`GTMSessionFetcher.framework`）により差し戻された。原因は`@codetrix-studio/capacitor-google-auth`（1年以上未更新）のPodspecが古いGoogleSignIn SDK（`~> 6.2.4`、プライバシーマニフェスト導入前）に固定していること。GoogleSignIn SDK自体のバージョン引き上げはプラグインのSwiftコード（`GIDConfiguration.init(clientID:serverClientID:)`、GoogleSignIn-iOS 7.0以降で破壊的変更）がコンパイルエラーになるリスクが高いため見送り、**Google公式が現行バージョンで配布しているプライバシーマニフェストの内容をビルド時に後付けで注入する方式**を採用した。

- **新規ファイル`ios-app/PrivacyManifests/{GoogleSignIn,GTMAppAuth,GTMSessionFetcher}-PrivacyInfo.xcprivacy`**: Google公式リポジトリ（`google/GoogleSignIn-iOS`・`google/GTMAppAuth`・`google/gtm-session-fetcher`）の現行`PrivacyInfo.xcprivacy`をそのまま保存（改変なし）。`ios-app/ios/`はgitignore対象でCIのたびに`npx cap add ios`により使い捨てで再生成されるため、静的な参照元ファイルはgit管理下の`ios-app/`直下に配置した
- **新規`scripts/ensure-privacy-manifests.py`**: `scripts/ensure-apns-bridge.py`と同じ思想（冪等・失敗時`SystemExit(1)`で明示的にビルド失敗）を踏襲した別スクリプト。CIが生成した`ios-app/ios/App/Podfile`に対し、CocoaPodsの`post_install`フック内に「対象targetのビルド成果物へPrivacyInfo.xcprivacyをコピーするRun Scriptビルドフェーズ」を追加する処理を注入する
  - 冪等性: マーカー文字列`# --- privacy manifest injection (設計書68) ---`の有無で判定
  - 既存`post_install do |installer| ... end`ブロックが既にある場合（Capacitor標準テンプレートに含まれている可能性が高い）は、Rubyキーワード（`do`/`if`/`unless`/`case`/`def`/`class`/`module`/`begin`/`end`）の深さカウントで対応する`end`を検出し、その直前に処理を挿し込む（ネストしたブロックにも対応、ローカルテスト済み）。ブロックが無い場合は新規`post_install`ブロックをPodfile末尾に追記する
  - `end`の対応関係を正規表現で検出できない場合は`SystemExit(1)`で明示的にCIを失敗させる（サイレント素通り禁止）
  - target名判定は`GoogleSignIn`/`GTMAppAuth`/`GTMSessionFetcher`の完全一致に加え、`GTMSessionFetcher`は前方一致（`start_with?('GTMSessionFetcher')`）も許容（subspec名でtargetが作られている可能性への対応）。対象targetが1つも見つからなくてもビルド自体は失敗させない（デバッグ出力`puts "POD TARGET: #{target.name}"`をCIログに残すことで原因調査可能にする設計）
- **`.github/workflows/ios-deploy.yml`変更**: `Sync Capacitor`（`npx cap sync ios`）直後に3ステップ追加: `(診断) Dump generated Podfile`（`pwd`/`ls`/`cat`/`grep`で`SRCROOT`周辺のディレクトリ構成とPodfile実体・既存`post_install`有無を出力）→`(App Store審査対応) Ensure privacy manifests`（`cd ios-app` → `python3 ../scripts/ensure-privacy-manifests.py ios/App/Podfile`、既存`ensure-apns-bridge.py`ステップと同じ相対パスパターン）→`(App Store審査対応) Re-run pod install after Podfile patch`（`cd ios-app/ios/App && pod install`、Podfile変更をXcodeプロジェクトに反映させるため）。既存の`(診断) Dump generated AppDelegate.swift`以降のステップ順序・内容は無変更
- **2026-07-19、初回CI実行で判明した相対パス階層バグと修正**: releaseブランチへのpush後の初回ビルド（run 29676379567）で、`GTMSessionFetcher`ターゲットの`Add Privacy Manifest`スクリプトフェーズが`PhaseScriptExecution`失敗（exit 65）し、`xcodebuild archive`自体が`ARCHIVE FAILED`で失敗した。原因は上記リスク欄3番目に記載していた`${SRCROOT}/../PrivacyManifests/...`の相対パス階層。Podsターゲットの`SRCROOT`は`Pods.xcodeproj`の場所である`ios-app/ios/App/Pods`を指すため、`../`1つでは`ios-app/ios/App/`にしか到達せず、実ファイル（`ios-app/PrivacyManifests/`）が置かれている`ios-app/`直下までは3階層上る必要があった。`scripts/ensure-privacy-manifests.py`の`cp`コマンドを`${SRCROOT}/../PrivacyManifests/...`→`${SRCROOT}/../../../PrivacyManifests/...`に修正し、再push（run 29676592152）でアーカイブ・TestFlightアップロードとも成功（"Deploy to App Store"まで全緑、3分57秒）。
- **上記修正により、リスク欄の項目1・2・4は実質検証済み**: CIログの`POD TARGET:`デバッグ出力で`GoogleSignIn`/`GTMAppAuth`/`GTMSessionFetcher`の3ターゲットが完全一致で見つかりビルドフェーズが正しく注入されたこと（項目1）、生成Podfileに既存`post_install do |installer| ... assertDeploymentTarget(installer) end`ブロックが実在しその内部に正規表現ベースの深さカウントで正しく挿入されたこと（項目2、ログに"Inserted privacy manifest injection into existing post_install block."を確認）、`pod install`再実行後にアーカイブ自体が成功したこと（項目4）を確認済み。**項目5（IPA内に実際に`PrivacyInfo.xcprivacy`が含まれるか）は、3ターゲットとも該当スクリプトフェーズがビルド失敗を起こさなかったことから間接的に推測できるが、IPAの中身を直接展開して確認したわけではないため依然未検証**（Apple審査の結果が最終確認になる。2026-07-19時点でReject通知はまだ来ていない）
- `server.js`・`public/`配下・`data/`配下は無変更。Web版（dosuru.app）には一切影響しない、`pm2 restart`不要
- 代替案として検討した「`@codetrix-studio/capacitor-google-auth`から別プラグインへの乗り換え」は、既存の安定化済み認証フロー（設計書20/35/36/38/44/46/48/49/50/51/52）を壊すリスクが高く、緊急対応としては不釣り合いに大きいため見送り。将来的な技術的負債解消タスクとして分離

## PWAインストール・更新バナーの廃止（2026-07-09）
- 「ホーム画面に追加」誘導バナー（`#install-banner`）とService Worker経由の「アプリが更新されました」バナー（`#update-banner`）はUIごと削除済み（iOSアプリ（App Store配信）を正式な運用形態とするため）
- 削除対象だった `handleInstall()` / `showInstallBanner()` / `dismissInstallBanner()` / SW登録処理ブロック（`navigator.serviceWorker.register()`含む）はすべて撤去済み
- `openShareModal()`（設定画面「使い方」ボタンと共用のHOWTOモーダル）・`#share-modal`・`/api/version`・`@capacitor/app`バージョン取得処理は影響なし、従来通り残置
- `public/sw.js`本体は変更なし（Web版のオフライン対応・キャッシュ機構として残置。登録処理を削除したため新規訪問者には未登録になる点に注意）
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

## iOSアプリのAPNsプッシュ通知対応（2026-07-10実装）
- Web版（VAPID/Web Push）とは完全に独立した仕組みとしてiOSネイティブPush（APNs）を追加。既存のWeb Pushエンドポイント・データ構造は無変更
- 方式: サーバーから`@parse/node-apn`経由でAPNsへ直接送信（`node-apn`本家は2022-05が最終更新のため、同API・アクティブにメンテされているforkの`@parse/node-apn`を採用）
- **環境変数未設定時のフェイルセーフ**: `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID`/`APNS_PRIVATE_KEY`のいずれかが`.env`に無い場合、`server.js`は`apnProvider = null`のまま正常起動し、警告ログを出すだけでiOS向け送信のみスキップする。Web Pushの可用性には一切影響しない
- `.env`変数: `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_BUNDLE_ID` / `APNS_PRIVATE_KEY`（.p8の中身。VAPID鍵と同じ「文字列をそのまま格納」方式、`\n`エスケープを実行時に復元） / `APNS_PRODUCTION`（`'true'`文字列でproduction接続。TestFlight/App Store配信は必ずproduction）
- データモデル: `data/push-subscriptions.json` / `data/shared-calendars/{groupId}.json`の`pushSubscriptions`に`platform`フィールド追加（`'web'`または`'ios'`）。既存データ（`platform`なし）は読み込み時に`sub.platform || 'web'`にフォールバック（`subPlatform()`関数）。ファイル自体のマイグレーションは行わない
  - web: `{ platform:'web', endpoint, keys:{p256dh, auth} }`（既存構造のまま）
  - ios: `{ platform:'ios', deviceToken, registeredAt }`
- API（既存Web Push系エンドポイントは無変更、iOS向けは完全に別エンドポイント）:
  - `POST /api/push-subscribe-ios` / `DELETE /api/push-subscribe-ios` `{ deviceToken }`
  - `POST /api/calendar/:groupId/push-subscribe-ios` / `DELETE .../push-subscribe-ios` `{ deviceToken, deviceId }`
  - `sendPushToAll(cityKey)` / `POST /api/calendar/:groupId/notify`: 内部で`platform`別に振り分けて送信（外部APIレスポンス構造は無変更）
- APNs送信失敗時の自動クリーンアップ: `result.failed[0].status === 410`または`reason === 'BadDeviceToken'/'Unregistered'`で無効トークンと判定し、Web Pushの410/404処理と同様に自動削除
- クライアント（`public/app.js`）: `_isCapacitorApp`時は`_initNativePush()`/`_toggleNativePush()`（`@capacitor/push-notifications`使用、`registerPlugin('PushNotifications')`優先→`Plugins.PushNotifications`フォールバック）。Web版の`togglePush()`（Promiseベース）とは別関数体系。`_nativeDeviceToken`をlocalStorage `app_ios_push_token`で永続化
  - **プッシュトークンの`@capacitor/preferences`永続化（2026-07-16、設計書50）**: iOS版WKWebViewはアプリ完全終了→再起動で`localStorage`が揮発することがあり（設計書49のJWTと同じ問題）、`app_ios_push_token`が消えると`_updatePushBtn()`の`on = !!_nativeDeviceToken`判定で「プッシュ通知」トグルが再起動後OFF表示に戻る不具合があった。対策として、プッシュトークンも設計書49で導入済みの`_CapPrefs`（`@capacitor/preferences`ハイブリッド方式、JWTの`_authTokenCache`とは別扱い・プッシュ専用）に載せた。`registration`リスナー保存時・`_toggleNativePush`のOFF削除時に`_CapPrefs.set`/`remove`（fire-and-forget）でPreferencesを同期し、`_initNativePush()`冒頭でPreferencesから復元→localStorageへミラー→`_updatePushBtn()`で即ON表示反映する（`if(!plugin)`早期returnより前に配置し、プラグイン未取得でもON表示を維持）。キー名`app_ios_push_token`は現行維持。起動時`register()`（perm=granted時）は従来通り維持（トークンの鮮度・サーバー再登録の最新性のため）
  - ⚠️ **TDZ注意（設計書49・50・51共通の教訓／同種バグ3回目）**: `_initNativePush()`冒頭でPreferences復元を追加した際、`_CapPrefs`が`null`の経路で`_sendDebugLog(..., !!_nativeDeviceToken)`が`initPushState()`呼び出し中の同期実行で`_nativeDeviceToken`を参照するため、`_nativeDeviceToken`の`let`宣言をPUSHセクションから`loadEventData();`直前（AUTHブロック直後、`_CapPrefs`宣言の後）へ移動してTDZ（`ReferenceError`）を回避した。設計書51では、同じ起動時経路（`initPushState()`→`_initNativePush()`→`_getCapPushPlugin()`）で参照される`_CapPush`・`_nativePushDenied`の移動を忘れており、`_getCapPushPlugin()`本体の`if (_CapPush)`でTDZ ReferenceErrorが発生し`try`より手前でクラッシュ、`push_init_start`計装が全く出ない不具合になっていたため、この2変数も同位置へ移動した。`node --check`はTDZを検出できないため、宣言行と参照行の行番号突き合わせ＋Nodeでの最小再現で検証すること
  - ⚠️⚠️ **【最重要・恒久】起動時フローから「間接参照」される変数もTDZ対象。個別変数ごとに対処すると必ず漏れる（同種バグ3回）**: TDZの真の危険は「直接参照している行」ではなく、**起動時の初期化フロー（`loadEventData();`＝現2049行付近以降でトップレベル同期実行される`loadEventData`/`initPushState`/`initSettingsProfile`/`initSettingsGenres`/`_initAuthToken` IIFE、およびそれらが最初の`await`より前の同期実行部で呼ぶ関数）が、関数呼び出しを跨いで間接的に参照する`let`/`const`モジュールスコープ変数**にある。設計書49→50→51はいずれも「変数を1つ移したら、同じ経路で参照される兄弟変数を移し忘れた」パターン。**今後この付近を触る際は、個別変数を場当たり的に移動するのではなく、起動時フローが辿る全関数の同期実行部で参照される全`let`/`const`変数を`grep -n`で洗い出し、その全宣言行が初期化フロー行（`loadEventData();`）より前にあるかを一括で総点検すること。** 判定のコツ: (a) 関数宣言（`function foo(){}`）はhoistされるので定義位置が後でも呼び出し可、(b) `let`/`const`変数は宣言行が実行位置より後だとTDZ、(c) 最初の`await`より後で参照される変数はマイクロタスクで後から実行されるためTDZ非対象（ただし判断が難しければ安全側で前方移動）
  - **一時計装（原因確定後に削除）**: `_initNativePush()`に`push_init_start`/`push_init_perm`/`push_init_register_call`/`push_init_exception`の`_sendDebugLog`を追加済み。起動時自己回復（perm=granted時のregister再登録）が実機で実際に動いているか（真因がlocalStorage揮発か否か）を`logs/debug-nav.log`で確認するための使い捨て計装。原因確定後に削除する
  - `_hasActivePushSub()`/`_shouldShowPushPrompt()`: Web版・iOS版共通のプッシュ状態判定ヘルパー。iOS版は`Notification`（Web API）がWKWebView上で信頼できないため使わず、ネイティブプラグインの許可状態（`_nativePushDenied`）を使う
  - 通知タップ時: `pushNotificationActionPerformed`リスナーで`switchNav('home')`（共有カレンダー参加ダイアログへの誘導は設計書178フェーズ3の共有カレンダー機能削除に伴い撤去済み、`public/app.js:3575`のコメント参照）
  - 新規UI文言は追加していない（既存の`pushOn`/`pushOff`/`pushDenied`/`toastPush*`キーを流用）
- iOS/CI: `ios-app/package.json`に`@capacitor/push-notifications@^6.0.0`追加。`.github/workflows/ios-deploy.yml`に以下2ステップを追加
  1. `App.entitlements`を新規生成しPlistBuddyで`aps-environment: production`を設定（Info.plist向けPlistBuddyパターンと同様の手法だが、対象ファイルが異なる新規ファイル）
  2. Ruby/Bundler設定後（`xcodeproj`gemが使える状態になった後）に`bundle exec ruby`で`xcodeproj`gemを使い、Xcodeプロジェクトの`CODE_SIGN_ENTITLEMENTS`ビルド設定を`App/App.entitlements`に紐付け。Capacitorの`ios/`はCIで`npx cap add ios`により毎回生成されるためデフォルトで`.entitlements`ファイルもビルド設定紐付けも存在しない。手順の順序（Ruby setup後に実行必須）を変えると`xcodeproj` gemが見つからず失敗する
  - ✅ **2026-07-14、フェーズ0完了に伴い上記2ステップを`ios-deploy.yml`内で復元済み（設計書34）**。2026-07-11〜07-14の間はApple Developerアカウントの個人→法人切替審査待ちのためコメントアウトして一時無効化していたが、審査完了・フェーズ0完了を受けてコメントアウトを解除し、有効なステップとして復活させた
- **フェーズ0（ユーザー手動作業、実装済みコードの動作に必須）**: 2026-07-14時点で全て完了済み
  1. Apple Developer PortalでAPNs Auth Key（.p8）発行 ✅完了
  2. App ID（`app.dosuru`）でPush Notifications capability有効化 ✅完了
  3. 配布用Provisioning Profile再生成（capability変更に伴い必須）→ GitHub Secrets `PROVISION_PROFILE_BASE64`更新 ✅完了
  4. VPSの`.env`に`.p8`の中身と`APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID`/`APNS_PRODUCTION=true`を追記（`.p8`はGit管理下に絶対に置かない） ✅完了
  5. `ios-deploy.yml`のentitlements自動生成2ステップ（上記iOS/CI 1・2）のコメントアウト解除・復元 ✅完了（2026-07-14、設計書34）
  - 次回`release`ブランチへのpushでTestFlightビルドがentitlements付きでトリガーされる（ユーザー明示指示があるまでpushしない、既存プロジェクトルール通り）。実機でのPush通知送受信確認は次回のTestFlightビルド後に実施予定
- スコープ外（設計時点で明示）: Android版対応、通知既読管理・一覧UI、ジャンル/エリア別配信パーソナライズ、FCM導入、Web版・iOS版購読者の名寄せ、サイレントプッシュ、通知文言の多言語化

### プッシュ通知トグル不発の診断＋AppDelegate.swift APNsブリッジ条件付き追記（2026-07-16、設計書48・課題1）
iOS版で「プッシュ通知」トグルをONにしても権限許可後に通知登録が完了せずトグルがOFFのまま変わらない不具合（設計書45で計装したが原因未確定）の調査を、次回TestFlightビルドで進めるためのCI仕込み。
- **仮説**: Capacitorが生成する`AppDelegate.swift`に、APNsデバイストークン登録を`@capacitor/push-notifications`プラグインへブリッジするメソッド（`didRegisterForRemoteNotificationsWithDeviceToken` → `NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, ...)`）が欠落しており、`registration`イベントが発火せず`push_registration_event`（設計書45の計装）が記録されない可能性。
- **CI（`.github/workflows/ios-deploy.yml`、`Sync Capacitor`直後の2ステップ）**:
  1. `(診断) Dump generated AppDelegate.swift`: `AppDelegate.swift`全文を`cat`し、ブリッジメソッド有無を`grep`（無ければ`!!! BRIDGE METHODS NOT FOUND !!!`を出力）。次ビルドのログで実体を確認する。
  2. `(課題1) Ensure APNs bridge methods in AppDelegate.swift`: **`scripts/ensure-apns-bridge.py`**を実行。冪等（既に`capacitorDidRegisterForRemoteNotifications`を含めばスキップ）。含まなければ`re.search(r'(class\s+AppDelegate[^\{]*\{)')`でクラス開き波括弧を探し、その直後に2メソッド（`didRegisterForRemoteNotificationsWithDeviceToken`・`didFailToRegisterForRemoteNotificationsWithError`）を挿入。**クラス開き波括弧が見つからない場合は`raise SystemExit(1)`で明示的にビルド失敗**させる（サイレント素通り禁止）。
  - ⚠️ **Pythonロジックを外部スクリプト`scripts/ensure-apns-bridge.py`に分離した理由**: 設計書48時点はCIの`run: |`ブロック内にPythonヒアドキュメント直書きの想定だったが、YAMLブロックスカラー（`|`）は最初の非空行のインデント量で内容範囲を決めるため、Swiftコードの4スペースインデント行がブロック基準インデント（10スペース）より浅くなりYAMLパースエラーになる。外部スクリプト化で回避（ロジックは設計書と等価）。同種の「CI内にインデントの浅い行を含む多言語コードをヒアドキュメントで埋め込む」場合は外部スクリプト分離を標準パターンとする。
- 設計書45の計装6ポイント（`public/app.js`の`push_registration_event`/`push_registration_error_event`/`push_toggle_start`/`push_perm_result`/`push_register_call`/`push_toggle_exception`）は削除せず残置。次ビルドの診断ダンプと`logs/debug-nav.log`を突き合わせて原因を確定する。
- **未確認（次回フォロー）**: 次回TestFlightビルドのCIログで`AppDelegate.swift`ダンプ結果とブリッジメソッド有無を確認、実機でトグル操作 → `logs/debug-nav.log`で`push_registration_event`記録を確認。

### プッシュ通知トグルの永続化（トークン: 設計書50/51、ユーザー意思: 設計書52）
- **プッシュトークンのPreferences永続化（設計書50、TDZ修正が設計書51）**: プッシュトークン（`app_ios_push_token`）はlocalStorage単独だとiOS WKWebViewのアプリ完全終了→再起動で揮発することがあり（設計書49のJWTと同型）、トグルがOFF表示に戻る不具合があった。`_CapPrefs`（`@capacitor/preferences`）へミラー保存し`_initNativePush()`冒頭で復元する方式で恒久修正。起動時permission=grantedなら`plugin.register()`でトークン再取得（自己回復）。設計書51で`_CapPush`/`_nativePushDenied`の宣言がTDZになっていた（初期化フローより後に宣言）のを`_nativeDeviceToken`/`_CapPrefs`同様に`loadEventData()`直前へ移動して修正。
- **ユーザーON/OFF意思の永続化（設計書52、2026-07-16）**: 上記の起動時自己回復が「permission=grantedなら無条件にregister()」だったため、ユーザーが明示的にトグルをOFFにしても再起動で勝手にON表示に戻る副作用があった。OS許可（granted/denied）とアプリ内トグルのユーザー意思（ON/OFF）は別軸として扱うべきだったのが原因。
  - `app_push_enabled`フラグ（`'true'`/`'false'`）を`_setPushIntent(enabled)`ヘルパーでlocalStorage＋Preferencesハイブリッド保存する。ON確定の共通合流点（`registration`リスナー内）で`_setPushIntent(true)`、`_toggleNativePush()`のOFF処理で`_setPushIntent(false)`。
  - `_initNativePush()`は起動時に`app_push_enabled`を復元（Preferences優先→localStorageフォールバック、逐次await）。OFF意思（`'false'`）ならトークン復元自体をスキップ。register判定は`const wantOn = (pushIntent === 'true') || (pushIntent === null && !!_nativeDeviceToken)`で、`granted && wantOn`のときのみregister()し、そうでなければ`_nativeDeviceToken = null`でOFF表示に統一する。
  - **後方互換**: 意思フラグ未設定（`null`）でトークンありなら「以前ON」とみなしON扱い。設計書52以前からのONユーザーが勝手にOFFにされることはない。
  - 新規モジュールスコープ変数は追加していない（`_setPushIntent`は関数宣言で巻き上げ、`pushIntent`は`_initNativePush`内ローカル変数。設計書49/50/51のTDZ教訓に従う）。`_updatePushBtn()`のON判定・Web版`togglePush()`/`_pushSubscription`系・設計書49のJWT永続化は無変更。

## ジャンル・興味機能（2026-07-02実装、2026-09-03時点でUI非表示・実質不使用）
設定画面「ジャンル・興味」セクションは`display:none`で非表示化済み（未記録の変更、`public/index.html`のコメント「ユーザー要望により非表示化。ロジック・関数は残置」参照）。ジャンルを設定する手段がないため、連動する「おすすめ」フィルターチップ（`data-cat="recommend"`、ジャンル未設定時は自動非表示）も実質常に非表示。ロジック（`GENRE_LIST`定数13種・`saveGenreList`/`getGenreList`・`genreMatch()`・`scripts/fill-genres.js`等）は削除されていないため、再開時はUI非表示を解除するだけで動く。

## イベントカードのDOM差分更新（2026-07-12実装、設計書21）
`renderEventCards()`（`public/app.js`）は、カテゴリタブ切り替え等のたびにInstagram埋め込み（`<blockquote>` → `embed.js`が`<iframe>`化）が再読み込みされる問題を解消するため、`grid.innerHTML`一括再代入をやめ、**イベントID+言語をキーにしたDOM要素キャッシュによる差分更新**方式を採用している。
- `_cardElCache`（Map、キー`e.id + '::' + lang`）に生成済みの`<article class="spot-card">`要素を保持。既存キャッシュがあれば`renderEventCard()`を呼ばずそのDOM要素をそのまま再利用し（iframeも維持される）、`insertBefore`によるノード移動のみで並び替える。新規イベントのみ`renderEventCard()`で新規生成する（`_getOrCreateCardEl()`）
- フィルタで除外されたカードは破棄せず`display:none`で保持（再度そのカテゴリに戻った際に再利用するため）
- キャッシュ無効化: `loadEventData()`（データ再フェッチ・都市切替時）冒頭で`_cardElCache.clear()`。言語切替はキャッシュキーに`lang`を含むため自動的に別要素として再生成される
- 新規生成カードのみ`fadeUp`アニメーション適用。再利用カードは`.spot-card--reused`クラス（`animation:none`、`public/app.css`）で即時表示・非アニメーション化
- **既知の制約（2026-07-12時点、未解決）**: `toggleCardTips()`はDOM要素を直接書き換える実装のため、既存カードが再利用されるとtips展開状態がタブ切り替え後もリセットされない可能性がある（意図した仕様は「閉じた状態にリセット」）。言語切替を繰り返すと旧言語ぶんのカードが`display:none`のまま`_cardElCache`とDOMに蓄積する（都市切替等でクリアされるまで）
- **今後同様の「DOM要素キャッシュで差分更新」パターンを他画面に導入する際の注意**: `grid.innerHTML`の丸ごと再代入がどこか別の分岐に残っていると、そこでキャッシュ済みノード（iframe含む）がdocumentから切り離されて破棄される。`renderEventCards()`内のおすすめモード×ジャンル未設定時の案内バナー分岐も、この理由で`grid.innerHTML`丸ごと破棄から「既存カードを`display:none`で隠すのみ・専用バナー要素を個別追加/更新」方式に変更済み

### イベントカード画像エラー時の1回自動リトライ（2026-07-21実装、設計書90）
ユーザー報告「Web版だけイベントカードの画像が絵文字フォールバックになりiOS App版では正常」の調査で判明した不具合を修正した。画像URL自体（例: `sethlui.com`上の外部ブログ画像）はcurl・Playwrightいずれでも正常に読み込め、壊れていなかった。真因は`handleImgError(el, cls, emoji)`（`public/app.js`）にリトライ機構が一切なく、`<img>`の読み込みが一度失敗（一時的なネットワーク瞬断・外部ホストの瞬間的な不調など）しただけで即座に絵文字フォールバックのdivへ**恒久的に**置き換えてしまうことだった。さらに上記「イベントカードのDOM差分更新」（設計書21、`_cardElCache`）により、一度フォールバック表示に置き換わったカードのDOM要素はタブ切り替え等でも使い回されるため、ページを再読み込みするまでフォールバックのまま固定表示され続ける。iOS App版はWeb版とは別セッション・別タイミングでの読み込みだったため、たまたま瞬断に当たらず正常表示されたと推測される。
- `handleImgError()`を、初回失敗時は`el.dataset.retried`フラグを立てて1.2秒待機し、`el.removeAttribute('src')`で明示的にクリアしてから同一URLへ`src`を再代入して1回だけ再読み込みを試みる実装に変更（`el.isConnected`チェックにより、待機中にカードがDOM から除去されていた場合は何もしない）。リトライも失敗した場合（2回目の`onerror`発火時）のみ、従来通り絵文字フォールバックに切り替える
- この関数は`public/app.js`内3箇所（メインのイベントカード・ピン詳細モーダル・ピン一覧カード）の`onerror`属性から共有で呼ばれているため、呼び出し元は無変更のまま関数1つの修正で3箇所すべてに適用される
- コース詳細画像・マイコースカード画像・スタンプ詳細画像（設計書75で`innerHTML`都度生成方式に統一済み）は`handleImgError`とは別の独立したエラーハンドリング（`imgEl.onerror = () => {...}`のインライン方式）を使っており、今回の変更の対象外
- リトライ回数の記録は`el.dataset.retried`（DOM要素自身の属性）のため、複数カード間で状態が干渉しない。リトライが最終的に失敗して絵文字フォールバックに切り替わった場合、`<img>`要素自体が`innerHTML`で破棄されるためリトライ状態も自然にクリーンアップされる
- `server.js`・データファイル・`public/index.html`・`public/app.css`は無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260721e`（`app.css`は変更なしのため据え置き）、`sw.js` CACHE_NAME=`sg-weekend-v647`
- **既知の制約**: 既にWeb版のブラウザタブで固定表示されてしまっている絵文字フォールバックはこの修正では救済されない（ページ再読み込みが必要）。1.2秒の待機時間は暫定値で、実運用で問題があれば調整の余地がある
- **未検証（次回TestFlightビルド後）**: iOS実機での動作確認（理論上同じ瞬断リスクがあるため両プラットフォーム共通コードとして適用済み）

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
- **ペルソナへの「個人の文脈」重視の視点追加（2026-07-15実装、設計書42）**: `PERSONA`定数末尾に「【投稿する上での軸】」を追加。一般論・要約・キャッチコピーめいた言い回しを避け、「自分だから気づけたこと」「長く住んでいるからこそ気づく些細な変化・違和感・懐かしさ」を大事にする視点を明記。既存の人物設定（体験・興味・トーン・NG事項）は変更なし
- **個人特定リスクの一般化（2026-07-15実装、設計書43）**: `PERSONA`定数冒頭の「シンガポール在住10年超の日本人男性」の具体的年数、および末尾「10年住んでいるからこそ」の年数表現は、開発者本人の個人特定につながるリスクを避けるためいずれも「長く」に置換済み。以降`PERSONA`定数に具体的な在住年数を書かないこと
- **X API自動投稿の停止 → 「X投稿下書きのLINE通知」への切り替え（2026-07-17実装、設計書53）**: X API（Twitter）のクレジット枯渇（`402 credits depleted`）により自動投稿を停止。ユーザー方針「X APIは今後使わない。旧Xcronと同じ1日2回のタイミングで、Xにそのまま貼れる投稿下書きをLINEに送る。投稿は手動」を反映。
  - `scripts/post-to-x.js`に`--to-line`フラグを追加。指定時は`postToX()`（X API送信）を**呼ばず**、`generateEventPost()`が返す完成形（Xペルソナ本文＋イベントURL＋ハッシュタグ）を**見出しなし・素のまま1通**で`notifyLine()`でLINE送信し、`saveHistory()`で`x-post-history.json`を更新（重複回避）。ユーザーが届いたメッセージを丸ごとコピーしてそのままXに貼れることが最重要のため本文・URL・ハッシュタグに一切手を加えない。`--dry-run`最優先（`--to-line --dry-run`併用時は文面出力のみ）。
  - **X投稿経路（`postToX()`・`buildOAuthHeader()`・`main()`のX送信ブロック）は無変更で残置**。`--to-line`を外せばX自動投稿がそのまま復活（後方互換、将来のX API復活用）。
  - システムcrontab: 旧`post-to-x.js`2エントリは`# [X API自動投稿 停止 2026-07-17]`付きコメントアウトで残置。新規に`--to-line`付きエントリを`0 1 * * *`/`0 13 * * *`（Europe/Berlin＝SGT 07:00/19:00）で追加、ランダム遅延（`sleep $(shuf ...)`）なしの固定時刻、ログは`logs/post-to-x-draft.log`。
  - `server.js`無変更＝`pm2 restart`不要。LINE通知文言は運用者本人宛のためi18n対象外。`data/x-post-history.json`をX投稿モードと下書きモードで共有（現状は下書きモードのみ運用のため実害なし）。

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
- **画面ヘッダー上部余白（2026-07-10統一、同日に縦センタリング起因のズレを再修正）**: ホーム/コース/予定表/設定の4画面すべて、上部余白は`env(safe-area-inset-top, 0px) + 20px`の1回のみの加算で統一する。
  - ホーム（`.app-header`）: `padding-top: calc(env(safe-area-inset-top, 0px) + 20px)`
  - コース（`#screen-course` + `.course-screen-header`）: コンテナに`padding-top: env(safe-area-inset-top)`、ヘッダーに`padding: 20px 20px 0; margin: 0;`（2箇所で分担、合計1回分）
  - 予定表・設定（`#screen-plan`/`#screen-settings` + `.plan-title-header`）: コンテナに`padding-top: env(safe-area-inset-top)`が既にあるため、`.plan-title-header`側は`padding: 20px 20px 0`のみ（safe-areaを重ねて加算しない）
  - ⚠️ 新しい画面を追加する際、コンテナとヘッダー要素の両方に`env(safe-area-inset-top)`を入れると二重加算になり、notch環境（safe-area-inset-top > 0）で他画面よりタイトルが大きくずれる。Web版（safe-area-inset-top=0）では気づけないため、実機での確認が必須
  - ⚠️ **`.plan-title-header`は`align-items: flex-start;`固定（2026-07-10修正）**: 以前`align-items:center`だったため、52pxの箱内でタイトルが縦センタリングされ、コース画面（`margin`方式で箱に上部paddingがない）で約9.5px、予定表画面（隣の「共有」ボタンが背高で箱が伸びる）で約10.5px、実機で余分に下にずれるバグがあった。`margin`方式もコースのみ`padding`方式に統一し、縦センタリングに依存しない決定的な位置にした。新しいヘッダーを`.plan-title-header`ベースで作る際は、内部要素の高さ差でズレが起きないことを実機で確認すること
- **画面タイトルのマークアップ**: `<span class="screen-title" data-i18n="...">`は、装飾用の親ラッパー（`.app-title`等の独自クラス）で包まない。子孫セレクタ（例: `.app-title span`）による意図しないCSS詳細度衝突で`.screen-title`本来のスタイルが上書きされる事故があったため、ヘッダーコンテナ（`.header-top`/`.plan-title-header`等）の直接の子要素として配置する
- **オーバーレイの表示切替は`classList.toggle('visible')`方式に統一する（2026-07-11追記）**: `display`/`opacity`のインラインstyle直書きによる表示制御は禁止。「表示側は4箇所でstyle操作・非表示側は1箇所だけ」のような取りこぼしパターンが発生しやすく、実際に`.plan-modal-overlay`でこの不統一が確認され、モーダル操作後にタップが効かなくなる重大バグの構造的リスク要因の一つとして`classList`方式へ統一した（`.claude/plan.md`「設計書5」参照）。新規オーバーレイ実装時も必ずCSS側に`.要素名.visible{display:block;opacity:1}`を定義し、JS側は`classList.add/remove('visible')`のみで制御する

## フィルターUI（2026-06-28刷新）
- tabs-section（いつ行く？4タブ）廃止
- `#filter-row-category` カテゴリチップ横スクロール行を header 直下に常時表示（何も選ばない = 全件）
- `#event-filter-btn` 絞り込みボタン → `#event-filter-sheet` ボトムシート（いつ行く？/誰と/エリア/キーワード）
- JS変数: `filterCats` / `filterWeek` / `filterWho` / `filterAreas` / `filterKeyword` / `filterEnding`
- プロフィールの who フィルターは廃止。filterWho（シート選択）で統一

## 都市対応状況（2026-09-03時点）
現状SG（シンガポール）のみ稼働中。BKK/SYDはイベント数が少なく一時停止中（`public/index.html`の`ACTIVE_CITIES = ['sg']`、`scripts/run-fetch-all.sh`・`scripts/run-source-analysis.sh`がSG固定）。設定画面の都市選択欄も選択肢が1つしかないため非表示化済み（設計書161、ロジック自体は残置）。再開時は`ACTIVE_CITIES`とスクリプトのcity指定を戻す作業になる。

## SGエリア区分に「Sentosa」追加（2026-07-13実装、設計書24）
SGのエリア区分がCentral/East/West/North/North-East/Island-wideの6区分から、**Sentosa追加で7区分**になった。Sentosaはケーブルカー・モノレールで渡る独立した「行き先」であり、ユニバーサル・スタジオ／S.E.A.水族館（→Singapore Oceanarium）／ビーチ等、単独でコース1本分埋まる濃さのエリアのため独立区分化。
- 変更箇所: `public/app.js`の`CITY_COURSE_AREAS.sg`（コース作成画面のエリアチップ）、`public/index.html`の`#event-filter-sheet`内`.ef-chip`（イベント絞り込みシート、こちらはHTML直書きの別実装でJS定数とは独立）、`scripts/filter-events.js`の`CITY_AREAS.sg`（取り込みパイプラインのAI分類プロンプト用列挙値）
- `data/sg/events.json`のうち、既存でSentosa関連ながら`Island-wide`/`West`に誤分類されていた5件（Sentosa GrillFest 2026 / Resorts World Sentosa / Sentosa Island / Adventure Cove Waterpark / Singapore Oceanarium - Into the Glowcean）を`area`/`location`とも`Sentosa`に遡及修正済み
- `server.js`にエリア値のホワイトリスト検証は存在せず（`conditions.area`はAIプロンプトへの自由文字列埋め込みのみ）、追加にあたりサーバー側の変更は不要だった
- BKK/SYDのエリア区分は無変更（Sentosaはシンガポール固有地名のため対象外）

## イベント取り込みパイプライン構成（2026-09-03時点、crontab・コード確認済み）

システムcrontabで動いているジョブは実質2本のみ:

| ジョブ | 内容 | 頻度 |
|---|---|---|
| `scripts/run-fetch-all.sh` | `fetch-events.js --city=sg` → `check-content-integrity.js --city=sg` → `fetch-life-info.js --city=sg` → `notify-fetch-summary.js`（イベント＋生活情報をまとめて1通のLINE通知） | 毎日 6:30 SGT |
| `scripts/run-source-analysis.sh` | `discover-sources.js --city=sg --no-notify` → `analyze-sources.js --city=sg --no-notify` | 水・日 7:30 SGT |

BKK/SYDのfetchは`run-fetch-all.sh`内でコメントアウト中（「都市対応状況」参照）。**旧`refresh-courses.js`のcronエントリはコース機能削除（設計書178）に伴い完全に削除済み**（旧CLAUDE.mdに記載があったが実態と乖離していたため訂正）。生活情報取得も当初は独立cronエントリ（毎日7:15 SGT）だったが、後日`run-fetch-all.sh`内に統合され独立エントリは廃止済み（詳細は下記「生活情報・ニュースのキュレーション機能」参照）。

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

**例外: パスフレーズ入力シート（`#backup-passphrase-sheet`/`#cal-passphrase-sheet`）はテキスト入力中に限りbottom-navを一時的に隠す（2026-07-18実装、設計書60）**
→ 上記「モーダル表示中もbottom-navを表示し続ける」方針の対象は「モーダルが開いている間」全体であり、この方針自体は変更していない。今回追加したのは、その中でもさらに粒度の細かい「テキスト入力中（キーボードが開いている間）」という一時的な例外区間のみ。
→ 背景: `.bottom-nav`と`#backup-passphrase-sheet`/`#cal-passphrase-sheet`はいずれも独立した`position:fixed;bottom:0`要素であり、モバイルSafariのキーボード表示時のfixed要素可視領域追従処理が両者で同期せず、ボタン行（キャンセル/確定）がボトムナビと重なる不具合があった（Web版Safari実機で確認、設計書59はCapacitor限定コードのみを修正しておりWeb版には無効だったため設計書60で再修正）。JS制御を伴わないモバイルSafariのネイティブ挙動由来のため、アプリ側JSのバグではなく構造的な相性の問題と判断した。
→ 実装: `public/app.js`に`document`レベルの`focusin`/`focusout`リスナーを1組追加（`_isCapacitorApp`分岐の外側、Web版・iOS版共通で有効）。`e.target`が`INPUT`/`TEXTAREA`かつ`closest('#backup-passphrase-sheet, #cal-passphrase-sheet')`が真の場合のみ、`.bottom-nav`を`visibility:hidden`（`display:none`ではない。レイアウトフロー除外によるリフロー誘発を避けるため）にし、`focusout`で即時復帰する。防御的にtry-catchで囲み、例外時も処理を止めない。保険的対策として両シートのボタン行に`margin-bottom:8px`も追加済み。
→ 対象は2シートのみに限定（設定画面の`#feedback-text`/`#nickname-input`等、他の入力欄には一切影響しない）。将来同じ症状が別シートで起きた場合は、`closest()`のセレクタ文字列に対象IDを追加するだけで横展開できる設計。
→ 新規モジュールスコープ変数は追加していない（TDZ回避、既存の`_touchCapableDetected`検出リスナーと同じ並びに配置）。

**PTR（プルトゥリフレッシュ）は2026-07-12に再実装済み（旧「永久廃止」ルールは撤回）**
→ 旧ルールの経緯: 過去（commit `4f99b9e`）にPTRを実装しWKWebViewでヘッダーずれ・白いステータスバーの問題が発生し、`9fe6bc9`で完全撤去して「永久廃止」としていた。しかしその後`git show`で実差分を確認したところ、**真因はPTRの実装方法自体ではなく「WKWebViewのネイティブオーバースクロール（ゴムバンド）防止の仕組みが当時存在しなかったこと」と「StatusBarのJS実行時設定が不安定だったこと」の2点**だったと判明（設計書19）。この2つは`9fe6bc9`で既に別対応済みで、以降のコードベースに恒久的に組み込まれている（下記「✅ iOS overscroll防止」のグローバル`touchmove`リスナー、`.github/workflows/ios-deploy.yml`のInfo.plist StatusBar設定ステップ）。この2つを一切変更せずに再実装すれば再発しないと判断し、ユーザー承認のもとイベント画面（`#home-scroll-content`）・コース画面（`#course-screen-content`）にPTRを再実装した。
→ 実装: `public/app.js`の`_initPtr(container, indicatorId, onRefresh, watchSwipeIntent)`共通ヘルパー。スクロールコンテナ内部先頭に置いた`.ptr-indicator`要素の`height`/`opacity`のみをJSで操作し、ヘッダー・スクリーンコンテナ・`html`/`body`のposition/overflow/heightには一切触れない設計。iOS版のみ有効化（`_isCapacitorApp`、Web版は対象外）。リフレッシュ確定閾値60px
→ イベント画面は既存の横スワイプ機構（カテゴリタブ切替、`_swipeIntent`変数）と衝突するため、`watchSwipeIntent=true`で`_swipeIntent`を共有（`'h'`確定時はPTR側が即座に何もしない、相乗り方式）。コース画面には横スワイプ機構が存在しないため`watchSwipeIntent=false`で単独判定
→ **今後同種の機能を追加・変更する際も、この2箇所（overscroll防止JS・StatusBar設定）を変更しないことが安全な実装の前提条件**。変更する場合はPTR・ヘッダー位置・ステータスバー色の3点を必ず実機で回帰確認すること

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

### ✅ モーダルを閉じる際は必ずフォーカスを外す（blur）（2026-07-11）

「予定を追加」モーダル（`#plan-custom-modal`）でタイトル・メモ欄に入力後✕ボタンで閉じると、直後からボトムナビだけがタップに反応しなくなり、約2分後に前触れなく復帰する重大バグが実機ログで確認された。実機ログにより`closePlanModal()`実行時点で`document.activeElement`がメモ欄の`<textarea>`のまま残っていたことが判明。モーダルを閉じる関数群（`closePlanModal`/`closeCourseSheet`/`closeCourseDetail`/`closeTitleEdit`/`closeDatePickerSheet`/`closeEventFilterSheet`等）は`.visible`クラスの除去だけではフォーカスは外れない。フォーカスが残ったまま非表示化された`<input>`/`<textarea>`が、iOS WKWebView側のタッチイベント配送（特に`position:fixed`要素であるボトムナビへのヒットテスト）を阻害している可能性が高い（対症療法であり完全な確証はない）。

**対策（横展開推奨の標準パターン）**:
- モーダル/シートを閉じる関数の先頭で、「閉じようとしている要素の内部に`document.activeElement`が含まれる場合のみ`blur()`する」ガード付きヘルパーを呼ぶ（`public/app.js`の`_blurIfFocusInside(...containers)`）。無関係な要素のフォーカスを誤って奪わないよう、必ずコンテナ内包チェックを行う
- `switchNav()`の冒頭でも、画面遷移直前にフォーカスが残っていれば無条件で`blur()`する共通対策を追加し、個別モーダルでの対応漏れを構造的に防止する
- 新しいモーダル・シートを追加する際、内部にinput/textareaを持つ場合は、close関数に同様のblur処理を入れることをチェックリスト化する
- **この対策は対症療法であり、根本原因（iOS WKWebViewのタッチイベント配送メカニズム）の完全な解明・確証には至っていない。** TestFlight実機での複数回の開閉検証で有効性を確認すること（詳細は`.claude/next.md`参照）

### ✅ onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック（2026-07-10）

ボトムナビ・FAB等は応答性向上のため`touchend`にJSハンドラ（`e.preventDefault()`で後続clickを抑制する設計）を登録しつつ、HTML側にも`onclick`属性を残す二重登録になっている箇所が多数ある（元々はネイティブclickイベントの座標がスクロール後にずれて信頼できなかったために`touchend`ハンドラが追加された経緯）。

**問題**: iOS WKWebViewでは`touchend`の`preventDefault()`によるネイティブclick抑制が確実に効かないケースがある。過去のタップに対する遅延・ゴースト状態のclickイベントが、しばらく経ってから発火し、`onclick`属性を直接トリガーしてしまう（実機ログで`switchNav@app.js:1505`ではなく`onclick@capacitor://localhost:502`から呼ばれている証拠を確認）。

**やってはいけない対処①**: `onclick`属性を全削除する。タッチ非対応のデスクトップブラウザ（マウス操作、Web版）では`touchstart`/`touchend`が発火しないため、ボタンが完全に反応しなくなる。

**やってはいけない対処②（2026-07-10に実際に踏んだ地雷）**: タッチ操作検出後は**全てのclickイベントを無条件にグローバルブロックする**方式。

```js
// ❌ この方式は撤去済み（2026-07-10）。二度と復活させないこと
document.addEventListener('click', e => {
  if (_touchCapableDetected) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true);
```

一見「ゴーストクリックだけを狙い撃ちで潰す」ように見えるが、実際には**touchendハンドラを持たずonclick属性のnative clickイベントのみに依存している全てのボタン**（イベントカード内の「予定に追加」「コース作成」等、多数）も道連れで無反応にしてしまう。ボトムナビ・FAB等の一部ボタンだけがtouchendハンドラで代替処理されていたため一見動いているように見え、リリース後にユーザー報告で発覚した重大な退行バグとなった。

**正しい対処**: ゴーストクリックが実証されている要素（現在16箇所: ボトムナビ4/FAB3〈course-fab・fab-plan・fab-top〉/シェア・フィードバック・言語切替ボタン/各種オーバーレイのclose等）の`onclick`属性**個別**に、`if(!_touchCapableDetected) 関数呼び出し(...)`のガードを埋め込む。グローバルなclickリスナーは追加しない。

```html
<!-- 例: ボトムナビ -->
<button id="nav-home" onclick="if(!_touchCapableDetected) switchNav('home')">
```

```js
// public/app.js側は検出のみ。clickのブロックは行わない
let _touchCapableDetected = false;
document.addEventListener('touchstart', () => { _touchCapableDetected = true; }, { passive: true, capture: true });
```

- タッチ操作が一度でも発生した端末では、ガード対象17箇所の`onclick`のみ無効化される（`touchend`ハンドラが既に処理済みのため実害なし）
- **ガード対象外の全てのボタン（onclick属性のみに依存する多数のボタン）は一切影響を受けず、通常のclickイベントで正常動作する**
- PCブラウザ（マウス操作）では`_touchCapableDetected`が`false`のままなので、ガード対象17箇所も含め全てのonclickが従来通り機能する

**教訓**: グローバルなイベントブロック（全clickの無条件ブロック等）は影響範囲が広すぎるリスクがある。「問題が実証されている要素」への個別適用を常に優先し、「まとめて一括対処」という安易な方式は避けること。

**オーバーレイ背景タップで閉じる系は「onclickガード」ではなく「専用touchendリスナー」で統一済み**: `install-overlay`/`pin-detail-overlay`/`pin-picker-overlay`/`emoji-picker-overlay`/`schedule-action-overlay`/`cal-popup-overlay`の6つは、`onclick="if(!_touchCapableDetected) ...")`の個別ガードに加えて、`app.js`側で配列一括登録の専用`touchend`リスナー（`e.preventDefault(); fn();`を直接呼ぶ方式）も併用している（`app.js`内`['install-overlay', () => closeInstallModal()], ...`のforEach）。

**⚠️ 未対応の類似要素あり（2026-07-10監査で判明・未修正）**: 同じ「背景タップで閉じるオーバーレイ」構造を持つ以下8箇所は、上記6箇所と異なり`onclick`属性のみでガードもtouchendも無い素の状態: `course-sheet-overlay` / `course-detail-overlay` / `date-picker-overlay` / `event-filter-overlay` / `plan-modal-overlay` / `schedule-plan-action-overlay` / `cal-sync-overlay` / `title-edit-overlay`。ゴーストクリックの実害（二重発火・無反応）が実証されたわけではないが、6箇所側と扱いが不揃いなため、次にこの系統を触る際は同じ`touchend`一括登録パターンへ揃えることを検討する。

## server.js編集時の注意（2026-07-09追記）
- `server.js`内、47〜200行目付近は無効化中のStripe決済コードが`/* ... */`で丸ごとコメントアウトされている。この範囲に新しいルートを追加すると**サイレントに一切発火しない**（エラーも出ない）ため要注意
- ルート追加時は必ず追加後に`grep -n "^/\*\|^\*/"`等でコメントブロックの範囲を確認し、対象行が有効なコード領域にあるか確認する
- 新規ルート追加後は`curl -H "Host: xxx"`等で実際にレスポンスを検証してから完了報告すること（行番号だけを頼りに配置場所を判断しない）
- **新しいHTTPメソッド（PUT/PATCH等）を使うエンドポイントを追加する際は、`/api`向けCORSミドルウェア（392行目付近、`Access-Control-Allow-Methods`）にそのメソッドが含まれているか必ず確認する（2026-07-19設計書63の教訓）**: 設計書54で`PUT /api/user-plans/me`を追加した際にこの確認が漏れ、`Access-Control-Allow-Methods`が`POST, GET, DELETE, OPTIONS`のままだったため、Capacitor環境（`capacitor://localhost`オリジン、iOS App Store版）でOPTIONSプリフライトが拒否され、iOS実機でのみ`fetch()`が`TypeError: Load failed`で即座に失敗する不具合が約2日間気づかれずに残った（Web版はSame-Originのためこのミドルウェアの影響を受けず問題が露見しなかった）。新規メソッド追加時はコード追加だけでなくCORS許可リストの見直しをセットで行い、`curl -i -X OPTIONS -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: <メソッド>" <URL>`で`Access-Control-Allow-Methods`に含まれることを確認してから完了報告すること

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
