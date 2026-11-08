# SG在住Navi (dosuru.app) - CLAUDE.md

本ファイルは毎ターン自動で読み込まれるため、**現在の仕様と守るべきルールだけ**を書く。変更の経緯・過去の不具合の詳細・数値調整の履歴は載せない。「なぜ今の実装か」を知りたい時は`CLAUDE_HISTORY.md`をキーワードでgrepするか、詳細版(コミット`fe1be0e`時点の`CLAUDE.md`、`git show fe1be0e:CLAUDE.md`)を参照すること。

## プロジェクト概要
シンガポール在住日本人向け週末おでかけ情報アプリ(PWA+iOS/Android)。ブランド: Willoa / アプリ名: SG在住Navi。ターゲット: SG在住の日本人駐在員・家族(30〜40代)。日本語UI固定・スマホファースト。

## サーバー・運用
- VPS: Contabo(194.233.82.43)、ユーザー`masahiko`、パス`/home/masahiko/sg-weekend-app/`。ドメイン`dosuru.app`(アプリ)/`about.dosuru.app`(紹介LP)。nginx+PM2+Let's Encrypt(Cloudflare DNS)
- 再起動: `pm2 restart sg-weekend`(`server.js`を変えたら必須。`data/`のJSONだけの編集は不要=毎回読み直す)。ログ: `pm2 logs sg-weekend`
- スタック: Node.js/Express、Vanilla JS、PWA。**DBなし**(`data/`のJSONファイル)
- **cron**: システムcrontabは`*/5 * * * *`で`scripts/sgt-dispatch.sh`だけを起動する(このサーバーのcronは`CRON_TZ`が効かないため、SGT判定はスクリプト内で`TZ=Asia/Singapore`により行う)。ジョブ: 毎日7:00 `run-fetch-all.sh`(イベント取得→整合性チェック→くらし取得(ユーザー向けプッシュのトリガー)→開発者向けLINE通知)/平日12:00・21:00 `run-fetch-extra.sh`/水日7:30 `run-source-analysis.sh`/毎日8:00・18:00 X投稿下書きのLINE通知/**毎日3:00 `backup-data.sh`**。PM2のcronは使わない
- **バックアップ**: `scripts/backup-data.sh`が`data/`・`content/`・`.env`を`~/backups/daily/`へ日次退避(14日保持)。VPS自体が失われた場合は守れない(オフサイト退避は未実施)。Androidの署名鍵`~/android-keystore/`は別途オフラインの控えが必要
- **デバッグログ**: クライアントの`_sendDebugLog(event,data)`→`POST /api/debug-log`→`logs/debug-nav.log`(5MB超で`.1`に切替、1世代のみ)。この基盤は削除しない。個別の呼び出し箇所は使い捨て

## フォルダ構成
```
server.js / scripts/ (fetch-events, filter-events, fetch-life-info, backup-data, sgt-dispatch, validate-fare-seasons ほか)
data/sg/ (events.json, life-info.json, calendar-events.json, school-calendar.json, likes.json ... gitignore)
content/ (fare-seasons.json, whats-new.json, whats-new/images/ ... git管理)
public/ (index.html, app.js, app.css, sw.js, about.html ...)
ios-app/ (Capacitor + Fastlane) / android-app/ (Capacitor、VPS上でCLIビルド)
.github/workflows/ (ios-deploy.yml ほか) / .claude/{plan.md, next.md}
```

## アプリ構成
ボトムナビ4タブ(アイコン+`data-i18n`ラベル): **くらし**(`#screen-news`)/**おでかけ**(`#screen-home`)/**カレンダー**(`#screen-calendar`)/**設定**(`#screen-settings`)。
- くらし: 日本人向けニュースのキュレーション。カテゴリ=新着/SG政府/交通/医療・健康/天候・災害/コミュニティ/教育・子育て。最上部に指標ウィジェット(為替・PM2.5・2時間予報)
- おでかけ: イベントキュレーション。カテゴリ=新着/限定イベント/展示・公演/グルメ・フェア/プロモ・お得/新規オープン/旅行。最上部に指標ウィジェット(気温・UV指数・デング熱)
- 設定: ダークモード・**アプリ通知**(プッシュ)・サポート・情報(チュートリアル、公式サイト・SNS、About Willoa、シェア、バージョン)・フィードバック
- ピン留め: くらし/おでかけのみに出るクリップ型FAB(`#fab-pin`)のボトムシート。0件の時はFAB非表示
- 公開いいね: 各カードに❤️件数。ログイン不要の双方向トグル、重複防止は端末`localStorage`のみ、サーバーは1リクエスト±1固定。`data/sg/likes.json`、API `GET/POST /api/likes`
- 削除済み(復活させない限り触らない): 探訪・コース・予定表・共有カレンダー・コメント・Google/Apple Sign-In・バックアップ・アカウント削除。ジャンル・興味はUI非表示でロジック残置。広告(PRカード/Klook)は停止中。X自動投稿はAPI停止(`post-to-x.js --to-line`で下書きをLINE通知)
- 都市はSGのみ稼働(`ACTIVE_CITIES=['sg']`)。BKK/SYDは停止中
- i18n: 日本語固定。**新しいUI文字列は`data-i18n`属性+`STRINGS.ja`へのキー追加のみ**

## UI規約
- 色は必ず`:root`のCSS変数(`var(--caramel)`等)。インラインに生の色値を書かない
- 閉じる✕: `background:var(--sand); border-radius:50%; 32×32px; font-size:16px`
- CSSクラスの二重定義禁止(再定義時は古い定義を削除)。カードタイトル16px/700。border-radius: カード16〜18px、ボタン`var(--radius-btn)`
- 空状態の文言は見出し15px/700+説明14px(くらし・カレンダーと揃える)
- z-index: ボトムナビ9999。モーダル・オーバーレイは原則3000番台。**ただし`bottom:0`まで届く新規fixed要素(ピン留め・チュートリアル・旅行シーズンのシート等)は10000番台**にしないとボトムナビがタップを奪う
- オーバーレイの開閉は`classList.toggle('visible')`のみ(インラインstyle直書き禁止)
- 画面ヘッダー上部の`env(safe-area-inset-top)`は1回だけ(コンテナとヘッダーの両方に入れると二重加算。実機でのみ発覚)
- **タッチ対応の3点セット**: ボトムナビ・チップ・FAB等を変える時は、(1)`switchNav()`等の画面配列 (2)touchend委譲の配列/リスナー (3)HTMLの`onclick`を全部揃える。タッチ端末でガード付きonclickはスキップされ、touchendだけが唯一の経路になる。HTMLの`onclick`には`if(!_touchCapableDetected) 関数()`のガードを入れる(全clickを無条件ブロックするのは禁止)
- **モーダル/シートを閉じる時は先にフォーカスをblur**(`_blurIfFocusInside`)。残ると iOS でボトムナビが無反応になる
- **キャッシュバスティング(必須セット)**: `app.js`/`app.css`を変えたら、`index.html`の`?v=`と`public/sw.js`の`CACHE_NAME`を同時に上げる
- 画面本体のスクロールは内部コンテナ(`.screen-scroll-content`)。FABのスクロール監視もそのコンテナに対して行う
- **PCブラウザ向け中央寄せ(設計書229)**: `app.css`末尾の`@media (min-width: 900px)`ブロックのみがPC表示を担う(900px未満=モバイル/Capacitorアプリは対象外、無変更)。最大幅480pxで`.main`/`.screen.visible`/`.bottom-nav`等を中央寄せ。`fixed`要素に新しいtransformアニメーションを追加する時は、既存の`translateY(...)`と`@media`内の`translateX(-50%)`を漏れなく合成すること(片方だけ更新すると900px以上でズレる)。最大幅を変える時は`.fab`/`.fab-pin`の`calc(50vw - 240px + 20px)`内の240px(480の半分)も一緒に直す

## iOS/Capacitor・WKWebViewの禁止事項
- `html, body { overflow:hidden; height:100% }`禁止(ボトムナビが浮く)。スクリーンコンテナに`position:fixed`禁止(ナビのタップが効かなくなる)。画面は`height: calc(100dvh - 60px - env(safe-area-inset-bottom,0px))`の通常フロー+`flex:1; min-height:0; overflow-y:auto`
- iOSのoverscroll防止JSとStatusBarのInfo.plist設定は、プルリフレッシュの前提のため変更したら実機で回帰確認
- `Keyboard: { resize: 'none' }`+`@capacitor/keyboard`のインストール必須。`contentInset`は`'never'`(`'always'`は画面ズレの真因だった)。プラグインは`registerPlugin()`優先で取得
- キーボードが閉じた直後はfixed要素の子へのタッチが親に飛ぶことがある(`elementFromPoint`は正しいのに実イベントがずれる)。「見た目は正常なのにタップが効かない」ときは疑う
- z-indexを変えたら、同じクラスの他要素と、その内側から開く子シートも確認する
- Web版とiOS/Android版は同一コード。`_isCapacitorApp`で分岐(GA4スキップ、外部リンクは`Browser.open()`、SW登録・インストールバナーなし、`API_BASE`は`https://dosuru.app`)。**全fetchに`API_BASE`必須**
- GA4・Instagram埋め込みは`<head>`先頭のスクリプトがホスト名`dosuru.app`の時だけ読み込む

## Web版=テスト環境、アプリ=本番(データ共有)
`data/`と`/api/*`は両環境で共有。Web版のテストでイベントデータの大量削除・破壊的更新をしない。**APIは後方互換を保つ**(旧バージョンのアプリが動き続けること)。破壊的変更はアプリのリリースと同時に。一時的なテストデータ変更は戻してからコミット。

## PWA・Service Worker
- SW登録は`app.js`の初期化内。既存訪問者のSW更新時だけ`controllerchange`で1回`location.reload()`。タブ復帰時(`visibilitychange`)に`reg.update()`で更新確認
- `sw.js`は`/api/`をネットワーク専用。アイコンは`icons/icon-192.png`/`icon-512.png`(`STATIC_ASSETS`と`showNotification()`のパスを変えたら実在確認)
- `public/index.html`の`#install-modal`は到達不能の残骸(害なし)

## アイコン・スプラッシュ
`dosuru-icon.png`(1024)→`node generate-icons.js`でWebアイコン一式生成(差し替えは必ずマスター→スクリプト)。iOS: `ios-app/resources/icon.png`(RGB・アルファ無し)・`splash*.png`(2732²)。iOS通知アイコン(20pt)は`ios-deploy.yml`内で`sharp`によりAppIconセット一式を生成して置換する方式(`@capacitor/assets`では出ない)。新ビルド後も端末側キャッシュで旧アイコンが残るので、確認は完全アンインストール→再インストール。Androidは`android-app/resources/`から`capacitor-assets`+`scripts/apply-native-overrides.sh`(起動画面は`native-overrides/`)。

## iOSアプリ
- appId `app.dosuru`、`webDir: '../public'`のローカルバンドル(UI/JSの変更はアプリ更新が必要、イベントデータはAPI経由で更新不要)
- CI: `release`ブランチpush→`ios-deploy.yml`(macOS)→Fastlane→TestFlight(社内のみ)。証明書はMatch不使用、`.p12`/プロファイルをbase64でGitHub Secretsに登録。`release`は`main`と同内容のトリガー専用ブランチ(`git push origin main:release`)
- **本番審査提出**: `ios-release-production.yml`(`workflow_dispatch`、`confirm=SUBMIT`必須、`release_notes`任意)。ビルド済みドラフトをそのまま出す`ios-submit-existing-draft.yml`、審査の列の確認用(読み取りのみ)`ios-asc-status.yml`
- **リリース前に必ず`ios-asc-status.yml`を実行**し、審査待ち/審査中の版が無いことを確認する(あるまま始めると、Fastlaneがその版を書き換えて失敗する事故が過去にあった)
- **リリースノート**: `release_notes`には毎回その版の変更点を書く。**`ios-app/package.json`の`releaseNotes`は古い文面が残るので使わない**(新機能欄が空だと`whatsNew`必須エラーになる)
- **Appleの年齢制限の質問(`socialMedia`)**: 2026-11に新たに必須化。未回答だと提出が`socialMedia`エラーで失敗する。App Store Connectの アプリ情報>年齢制限 で人間が回答する(回答済み)
- プッシュ(APNs): `@parse/node-apn`でサーバーから直送、購読は`platform`(`web`/`ios`)で区別。`APNS_*`未設定ならiOS向け送信のみスキップ。`POST/DELETE /api/push-subscribe-ios`。ユーザーのON/OFF意思(`app_push_enabled`)とOS許可は別軸。`App.entitlements`の`aps-environment`と、CIの`scripts/ensure-apns-bridge.py`(AppDelegateへブリッジ注入、無ければCI失敗)に依存

## Androidアプリ(Capacitor 8、VPS上で手動ビルド)
- `android-app/`、appId`app.dosuru`。Google Sign-In・Apple Sign-In・APNsプッシュは含めない(設定のプッシュ通知トグルは`platform==='android'`で非表示)
- **CORS**: AndroidのオリジンはHTTPSの`https://localhost`。`server.js`の`ALLOWED_ORIGINS`に含めないと全APIが失敗する
- **ビルド環境**(Node22/JDK21/SDK36、システムのNode20・JDK17とは別置き)。毎回:
  `export PATH=$HOME/toolchains/node22/bin:$HOME/toolchains/jdk21/bin:$PATH JAVA_HOME=$HOME/toolchains/jdk21 ANDROID_HOME=$HOME/android-sdk ANDROID_SDK_ROOT=$HOME/android-sdk`
- 手順: `cd android-app && npx cap sync android` → **`./scripts/apply-native-overrides.sh`(毎回必須。versionCode/Name、署名、起動画面を`package.json`から反映する。忘れると古いversionCodeでPlayに拒否される)** → `cd android && ./gradlew bundleRelease`(AAB)。`android/`を`cap add`で作り直した後は`capacitor-assets generate --android`も実行
- 署名: アップロード鍵`~/android-keystore/dosuru-upload.jks`(リポジトリ外・コミット禁止)。**更新のたびに`androidVersionCode`を必ず+1**
- **本番公開**: `node android-app/scripts/publish-android.js`(対話確認で`production`と入力。`--non-interactive`はリリース自動化エージェント専用)。審査通過後は自動で公開される。公開中versionCode以下なら事前チェックで中断。鍵は`~/android-keystore/play-publisher-service-account.json`
- 起動画面はAndroid 12以降OS標準(中央アイコン+背景色のみ、ダーク追従)。アプリ名はアイコン画像に描き込み済み(`scripts/make-splash-icon.js`)
- `android-app/android/`(生成物)はgitignore

## リリース手順(iOS/Android同時、バージョンは揃える)
1. `ios-asc-status.yml`で審査の列が空か確認 → 2. `ios-app/package.json`と`android-app/package.json`のversionを上げ、`androidVersionCode`を+1してコミット → 3. `git push origin main && git push origin main:release`(iOSビルド起動、約6分) → 4. Androidを上記手順でビルド→`publish-android.js` → 5. iOSは`ios-release-production.yml`を`confirm=SUBMIT`+`release_notes`付きで実行。
- 紹介カードを出したい版は、**リリースの前**に`content/whats-new.json`にその版のキーを足す(下記)
- 一連の自動実行用に、ユーザーレベルのエージェント`releaser`(`~/.claude/agents/releaser.md`)がある。起動に失敗した場合(2026-11に2回、APIエラーで開始前に停止)は、この手順を直接実行すればよい

## 新機能の紹介(What's New)とチュートリアル(アプリ内案内)
- **紹介カード**: アプリ更新後の初回起動で1回出す。内容は`content/whats-new.json`の`entries["<アプリの版>"]`(サーバー主導、`GET /api/whats-new?version=`、無ければ`entry:null`、1日キャッシュ)。バグ修正だけの版にはキーを足さない。新規インストールには出さず見た版として記録(`sg_theme`未設定で判定)。`app_whatsnew_seen`(localStorage)で重複防止。画像は`content/whats-new/images/`(`public/`に置かない)、**差し替えは別名で作り`image`を書き換える**(Cloudflareが最大1日キャッシュする)。Web版の確認は`/?whatsnew=<版>`
- **ツアー(スポットライト案内)**: 紹介カードの`cta`(「使ってみる」)と`tours`、設定の「チュートリアル」、新規インストール向けウェルカムツアー(`welcome-1`、`app_welcome_pending`)、旅行シーズン画面の初回案内で使う。実装は`app.js`の`startTour()`/`_tourShow()`、アンカーは要素の`data-tour`+`_TOUR_ANCHORS`/`_tourAnchorEl()`、ステップ直前の動作は許可リスト`_TOUR_BEFORE`(ポップアップを自動で開く等)。見終わりは`localStorage`の`app_tour_done_<ID>`。設定のチュートリアル一覧は`TUTORIALS`配列(新しい案内は、ステップ関数+`TUTORIALS`に1件+`STRINGS.ja`の名前/説明)
- **文言の2か所一致**: サーバー(`content/whats-new.json`)とアプリ内`STRINGS.ja`の両方に同じ文言があるツアー(`calendar-1`等)は、変える時に両方直す。文言は専門用語を避け40字程度まで、色はカタカナ(グリーン等)
- `_tourVisible()`は幅高さに加え`opacity<=0`/`visibility:hidden`も「見えない」とする。非表示アンカーはステップごと飛ばし、1つも表示できなければ記録しない
- 動的に出るシート(`.pin-sheet`系)は0.25秒でせり上がるため、`before`で開いた後は完了を待ってから位置を測る
- 実機確認用: 設定のバージョン表示を3秒以内に5回タップすると、紹介・ツアーの記録を消して再読み込みする(開発者向け)

## 指標ウィジェット(`GET /api/widget-stats?city=sg`)
- おでかけ: 気温(OpenWeatherMap)・UV指数(data.gov.sg、0-2低い/3-7高い/8+非常に高い)・デング熱(クラスター数。`dengueLevel()`)
- くらし: 為替SGD→JPY(`open.er-api.com`、`fxRates`に12通貨)・PM2.5(中心部の1時間値、NEA公式の帯: 0-55通常/56-150やや高い/151-250高い/251+非常に高い。`pm25`が無ければ旧`psi`にフォールバック)・2時間予報(NEAナウキャスト、最も深刻な区分)
- タップで詳細ポップアップ: 為替=100 SGDの早見表、PM2.5=エリア別タイル+PM2.5⇄PSI切替(`GET /api/psi-detail`)、2時間予報=雨量観測マップ(`GET /api/rainfall-detail`、10分間隔・最大7コマの自動ループ、ヒートグロー方式のSVG、右上に進捗バー)、UV・デング熱=凡例。おでかけ用ポップアップは`#stat-criteria-popover-home`(くらし用`#stat-criteria-popover`とは別要素)
- 色は緑=安全・黄=ちょっと危険・赤=危険の3色(文字色のみ、塗りつぶさない)。**区分のしきい値は`server.js`の`psiLevel()`/`pm25Level()`/`dengueLevel()`/`uvLevel()`と`app.js`側(`STAT_CRITERIA`、`_PM25_BANDS`等)を必ず一致させる**
- キャッシュはフィールド別TTL(為替30分/天気20分/PSI・ナウキャスト10分/デング60分)。フロントは画面遷移時に5分経過で再取得。取得失敗時は古い値を保持
- 2時間予報の文言がはみ出す時だけ`.stat-val-sm`(12px)に縮小(`_fitStatNowcastText()`)

## カレンダー(`#screen-calendar`)
- データ: `data/sg/calendar-events.json`(手動キュレーション、**年1回、年末までに翌年分を追記**。**過去年のデータは消さず、同じ`items`に追記**)+`school-calendar.json`(日本人学校、毎年4月更新)→`GET /api/calendar?city=sg&year=`。アプリは**今年と来年の2年分を取得して続けて表示**し、1月の見出しだけ「2027年1月」のように年を付ける。不確実な日付は`confirmed:false`か`note`に明記。日程が未発表のイベントは載せず、発表後に追記
- カテゴリ: `holiday-sg`(塗りつぶしの赤ラベル)/`holiday-jp`/`festival`(文化・催し)/`school-vacation`(学校行事)/`procedure`(手続き・締切。IRAS所得税の申告など、日付が固定で在住者に当てはまるものだけ。2027年分は仮の日付で`confirmed:false`、公式で要確認)。「すべて」では日本の祝日を除く。SG祝日は日付の列も赤。SG祝日名は現地通用名のカタカナ
- 予定の説明は画面ヘッダーの「説明」スイッチで全月まとめて開閉(`localStorage`の`sg_cal_notes`)。`holiday-jp`はnoteを出さない
- 月見出し右に季節アイコン(`MONTH_SEASONAL_TAGS`)と旅行シーズン情報の入口(✈️)。開くと今月までスクロール(「すべて」のみ)
- 説明文の折り返しは`_noBreakJa()`(数字+単位・英単語・文末4文字を崩さない)+`line-break:strict`

### 旅行シーズン情報(専用の全高画面`#fare-sheet`)
- SG発の航空券が高い/安い月を行き先別に示す**静的な目安**(実運賃は扱わない)。20都市。データは`content/fare-seasons.json`(git管理)、編集後は`node scripts/validate-fare-seasons.js`で検証。`GET /api/fare-seasons`が`schoolHolidays`(MOE休暇の月)を動的に付加(1日キャッシュ。即反映したい時は`loadFareSeasonsData()`の`&v=`を上げる)
- 色は**価格レベル(`levels`)のみ**で決め、色が付くのは実運賃の出典がある月(`priceBasis:'fare'`)だけ。推定の月は普通の色+「〜の可能性」コメント。出典が逆の月はグレー「要確認」。**色(`levels`)を変える時は`priceReason`/`priceBasis`/`priceSource`/`estLevel`も一緒に更新**。一覧は`node scripts/list-fare-reasons.js`
- 年が替わると変わる情報(動く行事・学校休暇・直行便の便数)と価格レベルは、**ユーザーが更新する前提。頼まれない限りClaudeは変えない**。画面の色の文言はカタカナ。ドバイの全月の`local`にある外務省海外安全情報の確認の一文は、ユーザー判断で残している
- 都市ピルは国の固定順(`FARE_PILL_COUNTRY_ORDER`)。都市や国を足したらそこに国を足す。開くたびに東京が選ばれた状態で始まる

## イベント取り込み・くらし情報
- イベント: `fetch-events.js`(ハイウォーターマーク方式`data/source-fetch-state.json`)→`filter-events.js`(Haikuで採否・`scoreThreshold=6`、採用分はSonnetで日本語記事生成)→重複削除(タイトル類似度75%)。`data/sources.json`の`status`は`active`/`paused`/`rejected`のみが取得可否を決める。不良ソースは`analyze-sources.js`が`rejected`にする(新規ソースは手動で追加)
- くらし: `fetch-life-info.js`がRSSを取得(ソースはスクリプト内`CITY_CONFIG.sg.feeds`。KAMO(`kamobs.com/feed`)は他国の記事が混ざるため`titleIncludes:'【シンガポール'`で絞り、説明文が短いため`useFullContent:true`で本文の先頭350字を要約の材料にする。Haikuで関連性判定+カテゴリ、Sonnetで150〜180字の日本語要約(実際は約125字。指示の文字数を変えるとKAMO以外のソースも全部変わるので注意)、`data/sg/life-info.json`、リテンション7日)。カテゴリ6種(admin/weather/transport/community/health/education)。新着は`fetched_at`降順。Expat LivingはWAFで403(正常にスキップ)。**くらし側には採用ゼロの自動検知が無い**ので手動で見る。おでかけとの重複排除は無い
- **ユーザー向けプッシュ**: イベント側は停止。くらし側(7:00 SGT)が`POST /api/notify-events-updated`を呼び、**その日がカレンダーの`holiday-sg`/`festival`(`confirmed`≠false)の開始日の時だけ**「今日は〇〇です」を送る(該当しない日は送らない)。**緊急停止**: `touch data/push-paused`(再開は`rm`、再起動不要)
- 開発者向けLINE通知(`notify-fetch-summary.js`)は`broadcast`、承認依頼等は管理者宛`push`のまま
- イベントカードは`_cardElCache`によるDOM差分更新(iframeの再読込防止)。`grid.innerHTML`の一括再代入を別分岐に残さない。`renderEventCards()`ではキャッシュヒット時も`.like-btn`を最新値に同期する

## アプリ共有・その他機能
- 設定の「シェア」は、まずQRコードシート(紹介LP`https://about.dosuru.app`のQR、`qrcode-generator.js`、背景`#fff`固定)→「リンクを共有」で`doShare()`
- `/api/version`は`ios-app/package.json`の版を毎回読んで返す(Web版の設定のバージョン表示用)

## 紹介LP(`public/about.html`、`about.dosuru.app`)
App Store: `https://apps.apple.com/sg/app/sg%E5%9C%A8%E4%BD%8Fnavi/id6787159354`、Google Play: `https://play.google.com/store/apps/details?id=app.dosuru`。Express route `GET /about`と、Hostが`about.dosuru.app`の`GET /`。`privacy.html`/`contact.html`は`css/about-shared.css`を共有(柳グリーン配色)。構成は、くらし/おでかけ/カレンダー/旅行シーズン情報の4つの`.feature-block`(サブ機能は横スクロールの`.sub-feature-row`)。画像は`public/screenshots/`。**レイアウト微調整(角丸・余白・クロップ)は過去に非常に多くの反復があったので、触る時はブラウザの実機で確認しながら調整**。プライバシーポリシーは`https://willoa.net/privacy-policy`(日英。ソースは`~/willoa-site/src/app/privacy-policy/`、SGBusNaviとの共通ページ。変更後は`npm run build && pm2 restart willoa --update-env`)を使用。**収集する情報や外部サービスを変えたら、このページのSG在住Naviの節も同時に更新する**(2026-11-05に現行機能へ更新済み)

## ダークモード
`localStorage`の`sg_theme`(`auto`/`light`/`dark`、既定`light`)。`getTheme()`/`applyTheme()`/`cycleTheme()`/`updateThemeUI()`。`<head>`内スクリプトが初期のちらつきを防ぐ。配色は柳グリーン基調。ボトムナビアイコンはSVG+`currentColor`で自動追従。

## server.js編集時の注意
- ルート追加時はコメントアウトブロックの中に入っていないか確認(過去にサイレントに発火しない事故)。追加後は`curl`で実レスポンスを確認(未知のパスはSPAフォールバックで200+HTMLが返るので、ステータスだけで判断しない)
- 新しいHTTPメソッド(PUT/PATCH等)を使うなら、`/api`向けCORSの`Access-Control-Allow-Methods`に含めること(Web版は気づけず、CapacitorのiOS実機だけ失敗する)。`curl -i -X OPTIONS -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: <メソッド>"`で確認
- **`require()`でJSONを読むとサーバー起動時の内容で固定される**。変わりうるファイルは`fs.readFileSync`で毎回読む

## やってはいけないこと
cronはシステムcrontabのみ(PM2 cron不可)/APIキー・秘密情報をログに出さない/DBを勝手に導入しない/force pushしない/`.env`・署名鍵をコミットしない

## 開発フロー
- 新機能・仕様変更・複数ファイルに跨る修正・`server.js`/データ構造/認証/CI設定に触れる修正は、planner→orchestrator(builder→checker→closer)の順
- **軽微な修正はメインエージェントが直接実施してよい**(1ファイル内の定数・文言・表示値・CSS微調整・ドキュメントで、API/データ構造/認証/CIに触れず影響範囲が自明なもの。迷ったら通常フロー)。直接でも省略しないこと: (1)`app.js`/`app.css`を変えたらキャッシュバスティングのセット (2)`node --check`で構文検証 (3)`server.js`を変えたら`pm2 restart`+`curl`検証 (4)ローカルコミットし`.claude/next.md`に1行記録
- `.claude/plan.md`はgit管理。**必ず末尾に追記し、既存の設計書を削除・上書きしない**(「設計書N」の連番)
- ユーザーから明示的に頼まれるまで`git push`しない(リリース手順の中で指示された場合を除く)
