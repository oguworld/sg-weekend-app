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
- **コース詳細のスポット表示順は`spots`配列順そのまま（`time`昇順の自動ソートは行っていない）**（2026-07-13設計書26で判明）: `renderCourseDetail()`/`renderCourseResultHtml()`（`public/app.js`）はいずれも`(course.spots || []).map(...)`で配列順に描画する。そのため`community-courses.json`/`model-courses.json`のスポット時刻(`time`)を手動修正して訪問順序を変える場合、配列内の要素順序自体も`time`の昇順に合わせて並び替えないと、表示上の訪問順が時刻と矛盾する
- **コース生成プロンプトへの品質ガード追加（2026-07-13実装、設計書27）**: 設計書25・26で判明した「営業時間・見学可能時間帯との不整合」「開店時間より前の訪問」「実在しない施設名の生成（ハルシネーション）」の再発防止として、`POST /api/courses/generate`（`server.js`）の【スポット選定ルール】末尾と、`scripts/generate-model-courses.js`のSG/BKK/SYD各SYSTEM_PROMPT（都市が現在停止中のBKK/SYDも一貫性のため対応済み）に、営業時間配慮・早朝訪問回避・実在確信スポット名限定を促す注意文を追加。`POST /api/courses/candidates`（タイトル・タグライン・説明のみ生成、時刻・スポット名を含まない設計）は対象外
- **時刻重複の機械チェック（ログのみ、2026-07-13実装、設計書27）**: `POST /api/courses/generate`のレスポンス構築時、生成された`spots`配列を順に走査し、前のスポットの終了予定時刻（`time`+`duration`から算出）が次のスポットの開始時刻を超えている場合`console.warn()`で`[course-generate] time overlap detected: ...`ログを出力する。**APIレスポンス自体には一切影響しない（ログのみ、生成・保存フローを止めない）**。プロンプト側の注意文はあくまでAIへの努力目標であり強制力がないため、実際に重複が起きているかどうかを事後的に運用モニタリングできるようにする目的。`duration`のパース失敗時は例外を投げずスキップする
- **コース生成プロンプトへの「意味・文脈」重視の視点追加（2026-07-15実装、設計書42）**: ユーザーが読んだAI時代のクリエイティビティ論（速さ・量産では戦えない、価値になるのは個人の文脈からくる「意味」）に触発され、`POST /api/courses/generate`（`server.js`）の【スポット選定ルール】末尾と、`scripts/generate-model-courses.js`のSG/BKK/SYD各SYSTEM_PROMPTの【注意】直後に、単なるカテゴリ網羅ではなく一貫したテーマ・スポット同士の組み合わせの意味を意識させる【視点】文言を追加。設計書27の既存ガードレール（営業時間配慮・早朝訪問回避・実在確信スポット名限定）は削除・弱体化させず、いずれの追加文言も「この視点を優先してガードレールを緩めてはならない」旨を明記している。`POST /api/courses/candidates`は対象外（候補タイトルが凝った表現に振れることで実際に生成されるコース内容との乖離リスクが増えるため、ユーザー承認のうえ見送り）

## スタンプラリー機能（2026-07-19実装、設計書69）
既存のコース機能（AIコース生成、みんなのコース/マイコースの2タブ）とは**データ・生成ロジックとも完全に独立**した、SG実在スポットを段階的に「制覇」していくリテンション用コンテンツ。UI（コース画面の3タブ目「スタンプマップ」）のみ入口を共有する。

- **データ**: `data/sg/stamp-spots.json`（新規、人力キュレーション、`.gitignore`のままVPS直接編集方式・git管理下への例外化はしない）。現在14件（standard/local/niche各4件+special2件）。`level`（`standard|local|niche|special`）/`area`（既存`CITY_COURSE_AREAS.sg`の7値と統一）/`category`/`checkinRadiusM`/`active`等のフィールドを持つ。ユーザー進捗は`data/stamp-progress/{userId}.json`（`data/user-plans`と同じ`usr_[a-f0-9]{24}`バリデーション、gitignore対象）
- **段階ゲート**: `standard`は常時解禁。`local`/`niche`/`special`は前レベルを2件チェックインすると解禁（`server.js`の`STAMP_LEVEL_GATES`定数）。`special`レベルのスポットは未解禁ユーザーには`GET /api/stamp-spots`のレスポンス自体から除外される（フロントのフィルタだけに頼らず、ピンの存在自体をサーバー側で隠す設計）
- **API**: `GET /api/stamp-spots?city=sg`（認証不要、`verifyAppJwtOptional`で任意認証しspecial出し分け）、`GET /api/stamp-progress/me`（`requireAppAuth`必須）、`POST /api/stamp-progress/checkin`（`requireAppAuth`必須、`{spotId,lat,lng}`、`withFileLock`、冪等）。**v1時点ではサーバー側のGPS距離検証を行わずクライアント申告のlat/lngをそのまま信用する設計だったが、2026-07-21実装の設計書87でサーバー側のHaversine距離検証を追加済み（下記「スタンプチェックインのサーバー側GPS距離検証」節参照）。クライアント側GPS値自体の偽装（モック位置情報アプリ等）への対策は依然スコープ外**
- **フロントエンド**: Leaflet 1.9.4を`public/vendor/leaflet/`にローカルバンドル（CDNではなくオフライン起動時の読み込み失敗リスクを回避）、OpenStreetMapタイル使用（APIキー不要）。フォグ・オブ・ウォーは新規イラスト素材なし、`#stamp-fog-overlay`に複数の`radial-gradient`を`background`として重ねてチェックイン済みスポット周辺だけ霧を薄くする方式（`mask-image`/`mask-composite`はブラウザ間差のリスクを考慮し不採用）。GPS近接判定+手動確認ボタンの2段階チェックイン（`@capacitor/geolocation`新規導入、Web版は`navigator.geolocation`フォールバック、Haversine距離計算で`checkinRadiusM`圏内のみボタン活性化）。ログイン必須（`getAuthToken()`で判定、未ログイン時は連携案内のみ表示）、パスフレーズ暗号化は無し（既存`requireAppAuth`保護で十分という設計判断）
- z-index: `#stamp-spot-detail-overlay`3700/`#stamp-spot-detail-sheet`3701（設計書70で`#stamp-level-unlock-overlay`3702/`#stamp-level-unlock-modal`3703を追加、下記参照）
- iOS: `ios-app/package.json`に`@capacitor/geolocation@^6.0.0`追加、`.github/workflows/ios-deploy.yml`に`NSLocationWhenInUseUsageDescription`のInfo.plist追加ステップを新設
- スコープ外（v1未実装）: 位置情報プッシュ通知、既存AIコースのマップ統合、BKK/SYD対応、スポットデータの自動収集、進捗のゼロ知識暗号化バックアップ、SNSシェア・複数ユーザーランキング、Android対応
- **App Store Connect「Appプライバシー」申告フォームの位置情報利用に関する更新はコード対応不可、ユーザー側の手動作業として次回審査提出前に必要**（設計書65のアカウント削除機能時と同様の注意点）
- **未検証（次回TestFlightビルド後）**: 実機でのLeafletタッチ操作・フォグ演出の見た目とパフォーマンス・位置情報権限ダイアログの表示タイミング・実際のGPSでのチェックインフロー

### スタンプラリー体験改善（2026-07-20実装、設計書70）
設計書69実装後のユーザーフィードバック「ワクワク感・順番に制覇していく感・コンプ感がない」を受けた改善。3点実装。

- **データ**: `data/sg/stamp-spots.json`の既存14件全件に`order`フィールド（各レベル内1始まりの連番）を追加。単純な配列順ではなく、**各レベル内で地理的に回りやすい順番**（緯度経度から見て近い場所同士が近い番号）を人力で検討して割り当てた（standard: merlion-park1→marina-bay-sands2→gardens-supertree3→singapore-zoo4、local: tiong-bahru1→chinatown2→tekka3→east-coast4、niche: haw-par-villa1→rail-corridor2→kampong-glam3→pulau-ubin4、special: istana1→labrador2）。`name`/`lat`/`lng`等の既存フィールドは無変更。サーバーコード変更なしで`GET /api/stamp-spots`のレスポンスに自動反映（`loadStampSpots()`がファイルをそのままパースして返すため）
- **改善1（コレクション一覧ビュー）**: コース画面「スタンプマップ」タブ内に、地図⇄一覧の表示切り替えトグル（`#stamp-view-toggle-btn`）を新設。デフォルトは地図表示（`_stampViewMode='map'`、設計書69の「地図が主役」コンセプトを尊重）。一覧はレベルごとにグルーピングし各グループ内`order`昇順、制覇済み/未制覇/ロック中の3状態を視覚的に区別（`_renderStampCollectionList()`、新規CSS `.stamp-collection-*`）。マップ切替時はLeafletインスタンスを破棄せず`display:none`のみ、地図に戻る際は`invalidateSize()`を再呼び出し
- **改善2（「順番」の示唆）**: `_computeStampNextTarget()`が解禁済みレベルを順に見ていき、レベル内で`order`最小から未チェックのスポットを探索して「次に狙うべきスポット」を算出（クライアント側実装のみ、サーバー側の対応関数は未実装）。マップ上のピンに番号バッジ（`.stamp-marker-badge`）追加、「次はここ」スポットは脈動アニメーション（`.stamp-marker-icon--next`）。一覧ビューにも同じ番号バッジと「次はここ！」タグを表示し、マップ・一覧で一貫した視覚的手がかりを使用
- **改善3（レベル解禁演出モーダル）**: 新規`#stamp-level-unlock-overlay`(z-index 3702)/`#stamp-level-unlock-modal`(z-index 3703)。既存`.plan-modal`パターン（スライドイン、`.visible`トグル）を踏襲。`doStampCheckin()`内の`setTimeout(() => showToast(...), 1600)`を`openStampLevelUnlockModal(level)`呼び出しに置き換え（チェックイン成功トースト自体・1.6秒後のタイミングは維持）。レベル絵文字にCSSバウンスアニメーション。confetti等のライブラリは未導入
- i18n: `stampViewToggleMap`/`stampViewToggleList`/`stampCollectionLockedNote`/`stampNextTargetLabel`/`stampLevelUnlockModalTitle`/`stampLevelUnlockModalClose`の6キーをja/en同時追加。既存`toastStampLevelUnlocked`キーは呼び出し元がなくなったが死にキーとして残置
- キャッシュバスティング: `index.html` app.js?v=20260720a、app.css?v=20260720a、`sw.js` CACHE_NAME=sg-weekend-v630
- スコープ外（今回未実装）: 完全制覇時のフィナーレ演出、段階ゲート閾値変更、BKK/SYD対応、GPS偽装対策（設計書69から持ち越しの既存未解決事項）
- **未検証（次回TestFlightビルド後）**: iOS実機でのLeaflet地図上の番号バッジタップ精度・「次はここ」脈動アニメーション・レベル解禁モーダルのスライドイン滑らかさ・一覧⇄マップ切替の挙動

### スタンプラリーUI調整: ロック中スポットの情報秘匿・タブ順序変更・デフォルト表示変更（2026-07-20実装、設計書71）
設計書70実装後のユーザーフィードバック（「ロック中のスポットが見えてしまうと面白くない」「タブは一番左に」「デフォルトはリストで」）を受けた3点の調整。

- **改善1（ロック中スポットの情報秘匿）**: `server.js`に`maskLockedStampSpot(spot)`を新設。`GET /api/stamp-spots`のレスポンス構築時、未解禁の`local`/`niche`レベルスポットの`name`/`nameJa`を固定文言`'？？？'`、`description`/`imageUrl`を空文字列に置き換える。`id`/`lat`/`lng`/`level`/`area`/`category`/`order`/`checkinRadiusM`/`active`はそのまま返す（チェックイン判定・マップ描画・番号バッジ表示に必須のため）。`special`レベルは既存仕様（未解禁時はスポット自体をレスポンスから除外）を維持し対象外。レスポンスのトップレベル構造・各スポット要素のフィールド名一覧は無変更（値のみ条件付きで置換）
- **ユーザー承認済み方針（詳細シート側の作り込みは見送り）**: マップ上のロック中ピンをタップして開く詳細シート（`openStampSpotDetail()`）は、サーバーが返すマスク済みデータ（「？？？」等）をそのまま既存ロジックで描画するのみ。専用の「ロック中です」メッセージ・チェックインボタンの非表示化などの追加作り込みは行っていない（`_updateStampCheckinButton()`が既存の`unlocked`判定で「未解禁」ボタン文言〈`stampCheckinBtnLocked`〉を表示する既存ロジックがそのまま機能する）
- **⚠️ 実装時に発見・修正した既存バグ（未ログイン時の解禁レベル算出誤り）**: `GET /api/stamp-spots`の未ログイン時フェイルセーフが従来`unlockedLevels = STAMP_LEVEL_ORDER.filter(l => l !== 'special')`（`['standard','local','niche']`）となっており、コード上のコメント「未解禁とみなす」の意図に反して実際には`local`/`niche`まで解禁済み扱いになっていた。これによりログイン前ユーザーには`local`/`niche`スポットの名前が平文で見えており、今回のユーザー報告（ロック中なのに名前が見える）の直接原因だったと推測される。`unlockedLevels = computeUnlockedLevels(allSpots, [])`（`standard`のみ解禁扱いに算出し直す）に修正した。ログイン済みユーザーの`unlockedLevels`算出ロジック（`computeUnlockedLevels(allSpots, progress.checkedInSpotIds)`）自体は無変更
- **改善2（タブ順序変更＋初期表示タブの変更）**: `public/index.html`の`.course-tab-bar`内3ボタンの記述順を「スタンプマップ／みんなのコース／マイコース」に変更（`data-tab="map"`を先頭へ）。**設計書71本文は「初期表示タブは`everyone`のまま現状維持」としていたが、ユーザー承認により上書きし、初期表示タブもスタンプマップに変更した**（`class="course-tab active"`を`data-tab="map"`のボタンへ付け替え、`public/app.js`の`initCourseScreen()`が呼ぶ初期タブも`switchCourseTab('everyone')`→`switchCourseTab('map')`に変更）。「みんなのコース」「マイコース」はタブ切り替えで引き続きアクセス可能
- **改善3（デフォルト表示をリストに変更）**: `public/app.js`の`let _stampViewMode = 'map'`を`'list'`に変更（コメントも実態に合わせて更新）。`toggleStampViewMode()`/`_applyStampViewMode()`本体・`initStampMapTab()`内の初期化順序（`_applyStampViewMode()`の後に無条件で`_ensureStampLeafletMap()`を呼ぶ既存挙動）は無変更のため、デフォルトがリストになっても地図初期化のタイムラグは発生しない
- i18n新規キーなし（既存の`courseTabEveryone`/`courseTabMylist`/`courseTabStampMap`・`stampViewToggleMap`/`stampViewToggleList`をそのまま使用）
- キャッシュバスティング: `index.html` app.js?v=20260720b、`sw.js` CACHE_NAME=sg-weekend-v631（`app.css`は無変更のため据え置き）
- スコープ外（今回未実装）: `area`フィールドのマスク（暫定で「マスクしない」方針を採用、実機確認後に再検討の余地あり明記済み）、プレースホルダー文言のレベル別出し分け（「？？？」で統一）、`COURSE_TABS`定数（`['everyone','mylist']`、`map`を含まない）の整理（実装時の調査でこの定数自体がコード内で未使用〈宣言のみ〉と判明したため実害なし、今回は対応不要と判断）
- **未検証（次回TestFlightビルド後）**: iOS実機でのロック中カード「？？？」表示によるレイアウト崩れの有無、マップ上のロック中ピンタップ時の詳細シート表示の見え方、コース画面初期表示・スタンプマップタブ初期表示がそれぞれ意図通りになっていること

### スタンプラリー名称変更（ボトムナビ「制覇」・タブ「スタンプラリー」）＋一覧表示リセットバグ修正（2026-07-20実装、設計書72）
設計書71実装後のユーザー追加フィードバック2件（一覧表示に戻らないバグ・名称変更要望）への対応。

- **改善1（一覧表示リセットバグ修正）**: `public/app.js`の`initCourseScreen()`内、`await switchCourseTab('map')`の直前に`_stampViewMode = 'list';`を追加。ボトムナビ「コース」タップ経由の新規進入（`switchNav('course')`→`initCourseScreen()`）時のみリセットされる。**画面内タブ切り替え（`switchCourseTab()`本体の直接呼び出し、マイコース関連4箇所〈4866/4881/4953/5163行目〉含む）はこの代入を通らないため、地図/一覧選択が保持される**（`switchCourseTab()`本体自体には手を加えていない）
- **改善2（名称変更）**: i18nキー`navCourse`（ボトムナビラベル、ja「コース」→「制覇」/en「Courses」→「Conquer」）・`courseTabStampMap`（コース画面内タブラベル、ja「スタンプマップ」→「スタンプラリー」/en「Stamp Map」→「Stamp Rally」）の**値のみ**変更（キー名は不変）。`public/app.js` STRINGS.ja/en、`public/index.html`のデフォルト直書きテキスト（511行目・148行目）の計4箇所を変更
- `courseScreenTitle`（コース画面ヘッダータイトル「おでかけコース」）・他タブラベル（`courseTabEveryone`/`courseTabMylist`）・ナビアイコン画像は変更対象外のまま無変更
- `server.js`・データファイル（`data/sg/stamp-spots.json`等）・APIレスポンス構造は無変更。純粋にフロントエンドのみの変更のため`pm2 restart`不要
- キャッシュバスティング: `index.html` app.js?v=20260720c、`sw.js` CACHE_NAME=sg-weekend-v632
- **未検証（次回TestFlightビルド後）**: iOS実機でのボトムナビ「制覇」ラベル表示、コース画面内タブ「スタンプラリー」ラベル表示、地図表示から他画面経由でコース画面に戻った際の一覧表示リセット、画面内タブ切り替え時の地図/一覧選択保持の4点
- **既知の未解決事項**: 英語訳「Conquer」「Stamp Rally」の適切性は未検証（将来的な再検討の余地あり）

### スタンプスポット画像追加（Unsplash）＋画面タイトル変更（2026-07-20実装、設計書73）
設計書69〜72実装後のユーザー追加要望2件（スポット詳細モーダルへの写真追加・コース画面見出しの「スタンプラリー」化）への対応。

- **新規スクリプト`scripts/fill-stamp-spot-images.js`**: `data/{city}/stamp-spots.json`の`imageUrl`が空のスポットにUnsplash画像を補完する。既存`scripts/lib/unsplash.js`の`fetchUnsplashImage(query)`をそのまま再利用し、`fill-images.js`と異なりClaude APIによるキーワード生成は行わない（スポット名は既に確定した固有名詞のため）。検索クエリは`spot.name`に地名"Singapore"を付加した文字列（スポット名が既に"Singapore"を含む場合は付加しない重複回避処理あり）。`--dry-run`・インクリメンタル実行（`imageUrl`が既に設定済みのスポットはスキップ）対応。手動実行のみ、cron化なし
- **実行結果**: 2026-07-20実行、14件中12件の画像補完に成功。`tekka-market`・`labrador-secret-tunnel`の2件はUnsplash `/photos/random`検索でヒットなし（`fetchUnsplashImage()`が`null`を返す既存の失敗時挙動）のため`imageUrl`は空文字列のまま据え置き（既存`fill-images.js`と同じ「失敗時はスキップし既存値を変更しない」方針）
- **フロントエンド**: `public/index.html`の`#stamp-spot-detail-sheet`（`.plan-modal-body`内、スポット名表示の直前）に`<img id="stamp-spot-detail-image">`を新規追加（初期`display:none`、`aspect-ratio:16/9`、`object-fit:cover`、`border-radius:14px`、`onerror`で自身を`display:none`にする簡易フォールバック）。`public/app.js`の`openStampSpotDetail(spotId)`に、`spot.imageUrl`の有無で`src`セット＋表示/非表示を切り替える分岐を追加。**シートの使い回し方式（`_stampSelectedSpot`を毎回更新し同一DOM要素へ再セットする既存パターン）のため、`imageUrl`が空の場合は`src`属性ごと明示的に除去し非表示化する**（前回開いたスポットの画像が次回の詳細表示に残留しないようにするための必須分岐、既存の`#stamp-spot-detail-checked`のdisplay制御と同じ設計思想）
- **ロック中スポットとの整合性**: `server.js`の既存`maskLockedStampSpot(spot)`（設計書71で追加済み、無変更）が未解禁`local`/`niche`スポットの`imageUrl`を含む4フィールドを既にマスクしているため、データ投入・フロントエンド変更いずれの段階でもロック中スポットの画像が意図せず露出することはない。フロントエンド側に追加のロック中判定コードは書いていない（`imageUrl`が空という結果だけを見て非表示にする既存分岐がそのまま機能する）
- **`courseScreenTitle`変更**: `public/app.js` STRINGS.ja（`おでかけコース`→`スタンプラリー`）・STRINGS.en（`Outing Courses`→`Stamp Rally`）、`public/index.html`のdata-i18nデフォルト直書きテキストの計3箇所を変更（キー名は不変）。この見出しはスタンプラリー／みんなのコース／マイコースの3タブ共通ヘッダーであり、他タブ表示中も「スタンプラリー」の見出しが出続ける・設計書72で既に「スタンプラリー」に変更済みの`courseTabStampMap`（タブラベル）と文言が重複することはユーザー確認済みで許容
- `server.js`は無変更（`GET /api/stamp-spots`のレスポンス構造・マスキングロジックとも無変更、`imageUrl`フィールドへの実データ投入という値の変化のみ）。`pm2 restart`不要（`data/`配下JSONファイルの直接編集のため）
- キャッシュバスティング: `index.html` app.js?v=20260720d、`sw.js` CACHE_NAME=sg-weekend-v633（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後）**: iOS実機でのスポット詳細モーダルの画像表示（アスペクト比・角丸・読み込み時のレイアウトシフト有無）、ロック中スポット詳細シートで画像が表示されないことの実機確認、見出し文言重複による見た目の違和感有無
- **既知の未解決事項**: `tekka-market`・`labrador-secret-tunnel`の2件は画像取得失敗のまま空文字列（急ぎ対応不要、将来的な検索クエリ調整・手動URL設定の余地あり）。Unsplash URLの動的生成URLは将来失効・変更される可能性があり、既存`fill-images.js`によるイベント画像と同じ前提で運用（定期再取得の仕組みはスコープ外）

### ⚠️ スタンプスポット画像が表示されない不具合修正（aspect-ratio→固定高さ方式へ変更）＋診断ログ追加（2026-07-20実装、設計書74。上記「スタンプスポット画像追加」節の`aspect-ratio:16/9`記述は本節により実態と乖離）
設計書73実装後、実機で「スポット詳細モーダルの写真が一瞬表示されて消える（ずっと空白のまま）」不具合が報告された。状況証拠として、コードベース内で`#stamp-spot-detail-image`だけが`aspect-ratio:16/9`という書き方をしており、他の類似箇所（`public/app.js`のマイコースカード画像等）は`height:固定px + object-fit:cover`という既存の確立されたパターンで統一されていた。確実な原因究明はできていない（`aspect-ratio`が直接原因という確証はなく状況証拠からの推測）が、既存パターンへの統一を優先して修正した。

- `public/index.html` 807行目: `#stamp-spot-detail-image`のインラインstyleから`aspect-ratio:16/9`を削除し`height:200px`に変更。`width:100%`・`object-fit:cover`・`border-radius:14px`・`margin-bottom:12px`・`display:none`（初期状態）・HTML属性`onerror="this.style.display='none';"`は維持
- `public/app.js`の`openStampSpotDetail(spotId)`: 画像`src`セット時に`imgEl.onload`/`imgEl.onerror`をJSプロパティとして追加。`onload`時`_sendDebugLog('stamp_image_load_success', { spotId })`、`onerror`時は`imgEl.style.display='none'`実行後`_sendDebugLog('stamp_image_load_error', { spotId, url: spot.imageUrl })`を送信（JSプロパティ代入によりHTML属性の同名`onerror`は上書きされるため、非表示化処理をJS側ハンドラ内に統合する形で維持）。`spot.imageUrl`が空（ロック中スポット、`server.js`の`maskLockedStampSpot()`で担保・無変更）の場合は`imgEl.onload`/`imgEl.onerror`をともに`null`クリアし`src`もセットしないため、いずれのハンドラも発火しない
- **診断ログは使い捨て**（CLAUDE.mdの実機デバッグ用ログ収集機能の既存運用ルール通り）: `stamp_image_load_success`/`stamp_image_load_error`は次回TestFlightビルド後、`logs/debug-nav.log`で症状再発の有無を確認したのち削除してよい
- `server.js`・データファイル（`data/sg/stamp-spots.json`等）は無変更。キャッシュバスティング: `index.html` app.js?v=20260720e、`sw.js` CACHE_NAME=sg-weekend-v634
- **未検証（次回TestFlightビルド後）**: スポット詳細モーダルの画像が安定して表示され続けるか（症状再発の有無）、固定高さ`200px`の実機レイアウトバランス、Web版ブラウザでの見た目回帰有無

### スタンプスポット画像が引き続き読み込み失敗する不具合の恒久修正（Service Worker早期return＋innerHTML新規生成方式へ統一）（2026-07-20実装、設計書75。上記「aspect-ratio→固定高さ方式」修正は効果なく症状再発だったための追加対応。**根本原因は設計書76でユーザー環境要因〈VPN〉と判明済み、下記参照**）
設計書74の修正後も実機で画像読み込み失敗（`stamp_image_load_error`）が継続したため、investigatorが読み取り専用で原因調査を実施。単一の確定原因は特定できなかったが、(1)Service Workerがクロスオリジン画像リクエストを意味なく中継しておりfetch実装の不安定性リスクを負っていたこと、(2)スタンプスポット詳細画像だけが既存3箇所（イベントカード・コース詳細・マイコースカード）と異なり「静的`<img>`要素への`src`後代入」方式で、同一URLを連続して開いた場合にload/errorイベントが発火しない既知のブラウザ挙動リスクを抱えていたこと、の2点を修正方針として実装した（ユーザー承認済み）。**結果的にこの2つは真因ではなかったが、既存の確立されたパターンへの統一として有用なため、設計書76判明後もロールバックせず維持している。**

- **`public/sw.js`（Service Workerのクロスオリジン早期return）**: 最後のfetchハンドラ先頭に、クロスオリジンリクエスト（`url.origin !== self.location.origin`かつ`url.hostname !== 'fonts.googleapis.com'`）を一切インターセプトせずブラウザのネイティブfetchに完全に委ねる早期`return`を追加。旧実装は`caches.match`→`fetch`→（`response.ok && url.origin===self.location.origin`条件を満たさないため）そのまま返す、という**キャッシュ機構として何のメリットもない中継**になっており、SW fetch実装の不安定性リスク（WKWebView固有のno-cors+Range処理不安定性の可能性、一次情報未確認の推測）だけを負っていた。`/api/`・HTMLナビゲーション・同一オリジン静的アセットの既存3分岐は全て同一オリジンのため、この早期returnの影響を受けず無変更のまま機能する
- **`public/app.js`の`openStampSpotDetail()`（画像生成方式の統一）**: 既存3箇所（イベントカード`public/app.js`1355行目付近・コース詳細`renderCourseDetail()`4411行目付近・マイコースカード`renderCourseResultHtml()`4861行目付近）と同じ「モーダル/カードを開く・生成するたびに`<img>`要素を新規生成する」パターンに統一。`spot.imageUrl`があれば`imgContainer.innerHTML`で新規`<img>`を都度生成する。`imageUrl`が空（ロック中スポット）の場合は`imgContainer.innerHTML = ''`で何も生成しない
- **`public/index.html`（静的`<img>`要素→空コンテナへ変更）**: `#stamp-spot-detail-image`（静的`<img>`要素、初期`display:none`）を`<div id="stamp-spot-detail-image-container"></div>`（空コンテナ）に置き換え。旧要素へのHTML属性`onerror`フォールバックは、`<img>`自体が都度生成されなくなったため撤去（JS側の`onerror`ハンドラで代替）
- **`server.js`は無変更**（画像URL生成・マスキングロジックとも今回のスコープ外、`GET /api/stamp-spots`のレスポンス構造は不変）。キャッシュバスティング: `index.html` app.js?v=20260720f、`sw.js` CACHE_NAME=sg-weekend-v635
- **影響範囲の限定**: `openStampSpotDetail()`関数のみ変更、既存3箇所（イベントカード・コース詳細・マイコースカード）のUnsplash画像表示ロジックは無変更（回帰なし）。SWのクロスオリジン早期returnは`images.unsplash.com`だけでなく他の全クロスオリジンリクエスト（Instagram embed等）にも及ぶが、これらも元々SWでキャッシュされていなかったため機能的な後退はない

### スタンプスポット詳細画像が表示されない不具合の根本原因判明・解決（ユーザー環境のVPN起因、コード側の不具合ではなかった）＋診断ログ削除（2026-07-20実装、設計書76）
設計書74・75と2段階のコード側修正を試みた後も実機で画像読み込み失敗が継続していたが、investigatorの読み取り専用調査（サーバー・CDN側はcurlで一貫して200、原因不明のまま保留）を経て、メインエージェントがユーザーに直接確認したところ、**根本原因はコード側の不具合ではなく、ユーザーのiPhoneで有効になっていたVPNが、Unsplash CDN（`images.unsplash.com`）へのリクエストを妨げていたことだった**と判明した。ユーザーがVPNを切った結果、画像が正常に表示されるようになったことを確認済み。curlによるサーバー・CDN側の検証（設計書74・75）が常に成功していた理由も、curlがVPNを経由しないためと完全に説明がつく。

- 確認環境はWeb版（Safari等でdosuru.appを開いていた）。ユーザーが報告していた「コースの画像」は、設計書71〜72でボトムナビ「コース」→「制覇」に改称された「スタンプラリー」機能のスポット詳細画像を指していた（既存AIコース機能ではない）
- 設計書74（`aspect-ratio`→固定高さ）・設計書75（Service Worker早期return・`innerHTML`新規生成方式への統一）の修正自体は原因ではなかったが、既存の確立されたパターンへの統一として有用なため**ロールバックしていない**
- 役目を終えた診断ログを削除: `public/app.js`の`openStampSpotDetail()`から`_sendDebugLog('stamp_image_load_success', { spotId })`・`_sendDebugLog('stamp_image_load_error', { spotId, url })`の呼び出し2箇所を削除。**画像読み込み失敗時に画像を非表示にする`imgEl.onerror`のフォールバック処理自体は維持**（ログ送信の部分のみ削除）。`_sendDebugLog`関数自体・`POST /api/debug-log`エンドポイント自体は恒久ユーティリティのため無変更のまま残置（他機能の計装〈`auth_prefs_init`/`push_*`/`backup_*`等〉も無変更）
- `server.js`は無変更。キャッシュバスティング: `index.html` app.js?v=20260720g、`sw.js` CACHE_NAME=sg-weekend-v636
- **教訓（再発防止策として記録）**: 「サーバー側は正常なのに実機だけ失敗する」系の不具合では、ユーザー環境要因（VPN・Private Relay・広告ブロッカー・キャリアの通信最適化プロキシ等）を疑うタイミングを早めるべきだった。「サーバー・CDN側は正常」「特定の1URLだけでなく全スポットで一貫して失敗」という状況証拠が揃った時点（設計書75の時点）で、追加のコード修正より先にユーザー環境の確認を行うべきだった
- **このタスクをもってスタンプスポット詳細画像の不具合調査（設計書73〜76）は解決済み**。未検証事項なし

### エリア制覇バッジ機能＋スポットデータ拡充（2026-07-20実装、設計書77）
ユーザー要望「スタンプラリーにもっとハマる仕掛けを」を受け、既存のレベル制（定番/ローカル/ニッチ/スペシャル）とは別軸の「エリア制覇バッジ」を追加した。あわせて、既存14スポットのエリア分布の偏り（Central 8件・West 3件・North/East/North-East各1件・Island-wide/Sentosa各0件）を是正するため9件の新規スポットを追加した。

- **`data/sg/stamp-spots.json`に9件追加（14件→23件）**: `bird-paradise`（standard/North）・`siloso-beach`（standard/Sentosa）・`sea-aquarium`（standard/Sentosa）・`katong-joo-chiat`（local/East）・`punggol-waterway-park`（local/North-East）・`sembawang-hot-spring`（niche/North）・`changi-chapel-museum`（niche/East）・`lorong-halus-wetland`（niche/North-East）・`fort-siloso`（niche/Sentosa）。追加後のレベル別内訳は`standard`7件・`local`6件・`niche`8件・`special`2件（変更なし）。追加後のエリア分布はCentral 8/West 3/North 3/East 3/North-East 3/Sentosa 3（Island-wide 0件は変更なし）。`order`は各レベル内の既存最大値の続きから採番（standard新規3件=order5-7、local新規2件=order5-6、niche新規4件=order5-8）、重複なしを確認済み。`imageUrl`は9件とも空文字列のまま（`scripts/fill-stamp-spot-images.js`の再実行は別タスク）。座標はユーザー提示の概算値をそのまま採用、実装時に既知の実在地と照合し大きなズレがないことを確認済み
- **`data/sg/stamp-spots.json`は`.gitignore`対象のためVPS上で直接編集する既存運用方針を踏襲**（設計書69〜70と同様）。`server.js`は無変更・`pm2 restart`不要（既存の`fs.readFileSync`都度読み込みアーキテクチャのため）
- **「Island-wide」エリアはバッジ対象外**: GPSチェックイン前提の1地点スポットと概念的に相性が悪いため、対象エリアはCentral/East/West/North/North-East/Sentosaの6エリアに限定。同エリアへのスポット追加も行っていない
- **新規定数`STAMP_BADGE_AREAS`**（`public/app.js`、`STAMP_LEVEL_META`直後）: 上記6エリアの`{val, label}`配列。既存`CITY_COURSE_AREAS`（AIコース生成用、Sentosa含む7区分）には依存しない独立定数として新設（スタンプラリー機能は既存コース機能と完全独立という設計書69からの方針を踏襲）
- **新規関数`_computeStampAreaProgress()`**: `_stampSpots`・`_stampProgress.checkedInSpotIds`から各エリアの`{area, label, checked, total, achieved}`をクライアント側のみで算出（サーバー側APIは無変更）。ロック中`local`/`niche`スポットも`area`フィールド自体はサーバー側`maskLockedStampSpot()`でマスク対象外のため分母に含まれる（意図通りの仕様、全スポット制覇が達成条件のため）
- **新規関数`_renderStampAreaBadges()`**: `#stamp-area-badges`（`#stamp-map-content`内、進捗サマリ行の直後・地図/一覧コンテナの手前に新設）へ`.stamp-area-badge`チップ形式で6エリア分の進捗（例: 「🏙 Central 2/8」）を描画。達成時は`.stamp-area-badge--achieved`（`background:var(--caramel);color:white`）＋チェックマーク接頭辞を付与
- **表示は常時（マップ/一覧どちらのビューでも消えない）**: `_applyStampViewMode()`の`display`切替対象（`mapEl`/`legendEl`/`listEl`）に`#stamp-area-badges`を含めていない。一覧ビュー中にエリアバッジが消える回帰を防ぐための実装上必須の対応（設計書77 §7-3で明記済みのリスク）
- **呼び出し漏れ防止**: `initStampMapTab()`・`doStampCheckin()`両方の既存描画関数呼び出し列（`_renderStampMarkers()`/`_renderStampFog()`/`_renderStampLevelLegend()`/`_renderStampProgressSummary()`/`_renderStampCollectionList()`）に`_renderStampAreaBadges()`を追加済み
- **CSS新規クラス**: `.stamp-area-badge`（`.stamp-level-chip`ベース、`public/app.css`）・`.stamp-area-badge--achieved`・`.stamp-area-badge-check`
- **i18n**: 新規キー`stampAreaBadgesTitle`（ja「エリア制覇バッジ」/en「Area Badges」）をja/en同時追加、バッジ行直上のセクション見出しとして使用。エリア名自体（`Central`/`East`等）は既存`CITY_COURSE_AREAS`と同じ絵文字付き英語表記のまま新規i18nキー化せず流用（既存パターンとの一貫性を優先）
- **APIエンドポイント（`GET /api/stamp-spots`・`GET /api/stamp-progress/me`・`POST /api/stamp-progress/checkin`）は無変更**。レスポンス構造の変更なし、後方互換性への影響なし
- **達成時の専用演出（レベル解禁演出`#stamp-level-unlock-overlay`相当のモーダル等）は今回スコープ外**。進捗表示と達成マークの視覚変化のみ
- キャッシュバスティング: `index.html` app.js?v=20260720h・app.css?v=20260720h、`sw.js` CACHE_NAME=sg-weekend-v637
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのエリアバッジの見た目・折り返しレイアウト・チェックイン後の進捗更新アニメーション、新規9スポットの座標精度（現地訪問でのチェックイン可否）は2026-07-20時点でWeb版API検証のみ完了、実機未確認。設計書69〜76自体もまだTestFlightビルド未実施のため、これらは次回一括リリース時にまとめて確認する想定

### スタンプ帳（パスポート）風デザインへの刷新（2026-07-20実装、設計書78）
設計書70（コレクション一覧ビュー）・設計書77（エリア制覇バッジ）の見た目に対するユーザーフィードバック「ダサい」を受け、「スタンプ帳（パスポート風の物理的なスタンプラリー冊子）」のメタファーで両箇所を全面刷新した。データモデル・API・集計ロジックは無変更、フロントエンドの見た目のみの変更。

- **`STAMP_BADGE_AREAS`定数の構造変更**（`public/app.js`）: `{val, label}`（絵文字+英語ラベルの結合文字列）から`{val, emoji, labelText}`（分離）に変更。円形スタンプの中身に絵文字だけを表示するための対応。参照箇所は`_computeStampAreaProgress()`のみで、この関数の戻り値にも`emoji`/`labelText`を追加済み
- **新規ヘルパー`_stampRotateDeg(str)`**: 文字列（スポットID等）から`-5〜+5`度の範囲の回転角を決定的にハッシュ算出する（`hash = hash*31 + charCode`を`|0`で32bit整数化し`Math.abs(hash) % 11 - 5`）。制覇済みスタンプの「はんこらしい」わずかな傾きを、再描画のたびに角度が変わらないよう一貫させるために使用
- **`_renderStampAreaBadges()`刷新**: 丸ピルチップ（旧`.stamp-area-badge`）から円形スタンプ（`.stamp-circle.stamp-circle--area`、40px）に変更。達成時は塗りつぶし+チェックマーク（`--checked`修飾子）、未達成時はエリア絵文字を表示。X/Y進捗はスタンプ下に小さく併記
- **`_renderStampCollectionList()`刷新**: 「レベル＝ページ（`.stamp-book-page`）、スポット＝円形スタンプグリッド（`.stamp-book-grid`内の`.stamp-stamp-cell`、56px円+スポット名2行折り返し）」に変更。**レベル別グルーピングという既存の情報構造自体は維持**（エリア別への再グルーピングは意図的に行っていない。レベル解禁ゲート表現・「次はここ」判定〈`_computeStampNextTarget()`〉がレベル軸で動作する既存ロジックのため、構造変更すると破綻するリスクがあった。設計書78 §7-1参照）。各スタンプ円の`onclick`に`if(!_touchCapableDetected)`ガードを新規付与（CLAUDE.md必須パターンへの準拠、旧実装はガードなしだった）
- **スタンプ円のCSS（`.stamp-circle`とその修飾子、`public/app.css`）**:
  - デフォルト（未制覇・解禁済み）: 点線円（`border:2px dashed var(--sand-dark)`）+ スポット番号（`order`）を薄く表示
  - `--locked`（ロック中）: より薄い点線（`var(--sand)`）+ `opacity:0.5` + 🔒アイコン
  - `--checked`（制覇済み）: レベルカラー塗りつぶし + `box-shadow`の多重指定による二重リング（内側`var(--cream)`の白縁+外側同色濃淡リング+ずれた影）+ `_stampRotateDeg()`による決定的回転（中の絵文字は逆回転させ正立表示）
  - `--next`（「次はここ」）: 実線の点線→ソリッド枠に切り替え+新規`@keyframes stampNextPulseRing`によるパルスリング（既存マップピンの`@keyframes stampNextPulse`＝拡大縮小パルスとは別の新規アニメーション、統一感のある表現として追加）
  - `--area`: 上記本体スタイルを共通化しサイズのみ40pxに縮小した併記用クラス（`.stamp-circle.stamp-circle--area`のように両クラスを併記して使用）
- **「ページ」らしい紙質感の背景**: `.stamp-book-page`（`var(--cream)`背景+`var(--sand-dark)`枠線+角丸16px）、`.stamp-area-badges-page`（`var(--sand)`背景、同様の枠線・角丸）を新規追加。`public/index.html`の`#stamp-area-badges`のインラインstyleを`class="stamp-area-badges-page"`に置き換え済み
- **ダークモード対応**: 新規クラスはすべて`var(--cream)`/`var(--sand)`/`var(--sand-dark)`/`var(--midnight)`/`var(--warm-gray)`ベースで実装し、`html[data-theme="dark"]`ブロックでの変数再定義により自動追従する設計にした。旧`.stamp-collection-card`が抱えていた`background: white`直書き（ダークモード非対応の既存の見落とし、設計書78 §3-4で指摘済み）は今回再発させていない
- **既存ロジックへの影響なし**: `_applyStampViewMode()`（マップ⇄一覧切替）・`_computeStampNextTarget()`（「次はここ」判定）・`doStampCheckin()`のチェックイン成功後の再描画呼び出し列はいずれも無変更。`#stamp-area-badges`は引き続き`_applyStampViewMode()`の`display`切替対象に含まれず、マップ/一覧どちらのビューでも常時表示される制約を維持（設計書77の実装上必須事項を踏襲）
- 旧CSS（`.stamp-area-badge`系・`.stamp-collection-group`/`.stamp-collection-card`系）は削除済み、参照残存なし
- `server.js`・`data/`配下は無変更（pm2 restart不要）。i18n新規キーなし（既存の`stampAreaBadgesTitle`/`stampCollectionLockedNote`/`stampNextTargetLabel`を再利用）
- スコープ外（今回未実装）: スポット詳細モーダル自体・マップビュー（Leafletピン）自体・レベル解禁演出モーダルのデザイン変更、新規イラスト・画像アセット追加、コレクション一覧のエリア別再グルーピング、完全制覇時の特別演出
- キャッシュバスティング: `index.html` app.css/app.js `?v=20260720i`、`sw.js` CACHE_NAME=`sg-weekend-v638`

### コレクション一覧にチェックイン日時・説明文を追加（2026-07-20実装、設計書79）
ユーザー要望「チェックインした時間や場所の簡単な説明も保存・表示したい」「コレクターを意識した作りにしたい」を受け、コレクション一覧ビュー（`_renderStampCollectionList()`）の各スタンプの下に、**制覇済みスポットのみ**チェックイン日時・説明文をコンパクト表示する機能を追加した。データモデル・API変更なし、既存の`checkinLog`（サーバー側で既に記録済み）と`spot.description`（既存フィールド）を利用するのみ。

- **`_stampProgress`の状態拡張**（`public/app.js`）: `let _stampProgress = { checkedInSpotIds: [], unlockedLevels: ['standard'] };`に`checkinLog: []`を追加。`_loadStampSpotsAndProgress()`（`GET /api/stamp-progress/me`のレスポンスを反映）・`doStampCheckin()`（`POST /api/stamp-progress/checkin`のレスポンスを反映）の代入箇所2箇所とも`checkinLog`を含めるよう修正
- **`POST /api/stamp-progress/checkin`のレスポンスに`checkinLog`は含まれない**（`GET /api/stamp-progress/me`側は既に含まれている、`server.js`実ファイルで確認済み）。そのため`doStampCheckin()`ではクライアント側で自前のチェックインエントリ（`{spotId, checkedInAt: 現在時刻のISO文字列, lat, lng}`、重複防止の`some()`チェック付き）を`_stampProgress.checkinLog`にpushする方式を採用（**`server.js`は無変更**、pm2 restart不要）
- **新規ヘルパー`_stampCheckinDateFor(spotId)`**（`_stampSpotIsChecked()`直後）: `_stampProgress.checkinLog`から該当`spotId`のエントリを検索し、`checkedInAt`（ISO文字列）を既存の日付フォーマットパターン踏襲の「M/D」形式（`${d.getMonth()+1}/${d.getDate()}`）に整形して返す。該当エントリなし・不正な日付は空文字列を返す
- **`_renderStampCollectionList()`の改修**: `checked`（制覇済み、既存変数を再利用）が真の場合のみ、スポット名（`.stamp-stamp-cell-name`）の直後に`.stamp-stamp-cell-meta`ブロック（`.stamp-stamp-cell-date`＝チェックイン日時＋`.stamp-stamp-cell-desc`＝`spot.description`）を追加。未制覇・ロック中セルは変更なし（空文字列のまま、既存の`circleCls`/`isNext`/「次はここ」タグ判定ロジックには一切変更なし）
- **CSS（`public/app.css`）**: `.stamp-stamp-cell-meta`（`display:flex;flex-direction:column;align-items:center;`）・`.stamp-stamp-cell-date`（9px、`var(--caramel)`）・`.stamp-stamp-cell-desc`（9px、`var(--warm-gray)`、`-webkit-line-clamp:2`で2行省略）を新規追加。`.stamp-stamp-cell`は`width:74px`固定のため、追加テキストもこの幅に収まる前提で実装
- i18n新規キーなし（日時は数値のみのラベルなし表記、説明文は既存`spot.description`をそのまま表示。英語モードでも日本語のまま表示される、多言語対応はスコープ外）
- スコープ外（今回未実装）: スポット詳細モーダル自体への日時表示、新規タブ・新規画面、チェックイン日時の編集・削除、`checkinLog`の`lat`/`lng`表示、データモデル・API変更、BKK/SYD対応
- `server.js`・`data/`配下は無変更（pm2 restart不要）
- キャッシュバスティング: `index.html` app.css/app.js `?v=20260720j`、`sw.js` CACHE_NAME=`sg-weekend-v639`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのグリッドセル縦方向の高さ不揃い（制覇済み/未制覇混在時、`.stamp-book-grid`はflex-wrap方式のため崩れリスクは低いと想定）、長い説明文の2行省略後の可読性、日時ラベルの視認性は2026-07-20時点でWeb版目視確認のみ、実機未確認
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での円形スタンプグリッドの表示密度・スクロール量（23件）、長い英語スポット名での2行折り返しレイアウト崩れの有無、エリアバッジ（40px）の二重リング表現が潰れて見えないか、回転角のばらつきが実機で不自然に見えないか、ダークモード切り替え時の実機での見た目、`box-shadow`多重指定によるiOS WKWebView実機でのレンダリング負荷は、いずれも2026-07-20時点でWeb版目視確認のみ完了、実機未確認

### AI生成エリアバッジイラストの統合（2026-07-20実装、設計書80）
設計書78でエリアバッジ（`.stamp-circle.stamp-circle--area`）をCSSのみの印章風デザインに刷新していたが、ユーザーから「もっとちゃんとデザインしたバッジにしたい」との要望があり、Nano Banana（Google Gemini画像生成）で生成したエナメルピン風のイラスト画像6エリア分（Central/East/West/North/North-East/Sentosa）を**達成時のみ**表示するよう統合した。データモデル・API変更なし、`public/images/stamp-badges/`配下の静的PNG（256×256px・透明背景、各15〜37KB）を`STAMP_BADGE_AREAS`定数にパスとしてハードコードする方式。

- **画像アセット**: `public/images/stamp-badges/badge-{central,east,west,north,north-east,sentosa}.png`（6枚）。**`public/images/`は`.gitignore`対象外の通常git管理対象**（`data/`配下と混同しないこと）。エリア↔画像の対応: Central=マーライオン、East=プラナカン様式ショップハウス、West=ドラゴン像＋楼門（Haw Par Villaモチーフ）、North=枝にとまる鳥（Bird Paradiseモチーフ）、North-East=水路の木造ボート（カンポン風景）、Sentosa=ヤシの木＋ケーブルカー
- **`STAMP_BADGE_AREAS`定数の拡張**（`public/app.js`）: 各要素に`img`フィールド（サイトルート相対パス、例: `/images/stamp-badges/badge-central.png`。`API_BASE`は付与しない。Capacitor環境はローカルバンドル方式のためアプリ内に同梱される）を追加。`_computeStampAreaProgress()`の分割代入・戻り値オブジェクトの両方に`img`を通した（片方だけの見落としに注意して両方確認済み）
- **`_renderStampAreaBadges()`の分岐**: `achieved`時のみ`<img src="${img}" class="stamp-area-badge-img">`を表示。**未達成（ロック中含む）時のHTML生成ロジックは設計書78実装時から完全に無変更**（点線円＋絵文字のCSS印章表現のまま）
- **CSS印章演出（塗りつぶし・二重リング・回転）とイラストは併用しない**（結論確定、理由3点）: (1) 画像自体が既に「完成した1枚絵」（金属リムの縁取り・光沢・立体感を含む）であり、CSSの二重リング`box-shadow`や塗りつぶし背景を重ねると視覚的に競合する、(2) `.stamp-circle--checked`の`background`プロパティと`<img>`要素は共存の意味がない（背後に隠れるだけ）、(3) 回転演出（`_stampRotateDeg()`）は「はんこ」メタファー由来だが、画像側は「エナメルピン」という固定形状物のメタファーのため無理に継承する必然性がない。達成時のHTML生成では`.stamp-circle--checked`クラス自体を付与せず、新規CSS修飾子`.stamp-circle--area-img`（`border:none;background:transparent;box-shadow:none`）のみ付与する
- **CSS（`public/app.css`）**: `.stamp-circle--area-img`と`.stamp-area-badge-img`（`width/height:100%;object-fit:contain`＝画像は正方形PNGのため円形コンテナ内で欠けずに収まるようcontainを採用、`filter:drop-shadow(...)`で軽い影を付与）を新規追加。`.stamp-circle--area`のコンテナサイズ（40px）はそのまま踏襲（拡大等の微調整は今回見送り）
- **ダークモード対応**: 画像自体はライト/ダーク共通の1種類のみ（専用画像は生成していない、透明背景のため背景色`var(--sand)`のダーク変種の上にそのまま乗る）。視認性は次回TestFlightビルド後の実機確認が必要
- **画像読み込み失敗時のフォールバック**: 今回は追加していない（6ファイルとも配置済み確認済みのため必須要件外と判断。将来ファイル名変更等でパスが壊れた場合は`<img>`の`onerror`で`.stamp-circle--area-img`を外す等の追加が可能）
- スコープ外（今回未実装）: レベルバッジ（`STAMP_LEVEL_META`）へのイラスト適用、コレクション一覧（`.stamp-stamp-cell`）個別スポットへのイラスト適用、未達成時のイラスト表示、画像の追加生成・差し替え、マップビュー（Leafletピン）へのイラスト適用、BKK/SYD対応
- `server.js`・`data/`配下は無変更（pm2 restart不要だが今回は実施済み）。i18n新規キーなし（`<img>`の`alt`属性には既存の非i18n対象`labelText`をそのまま使用）
- キャッシュバスティング: `index.html` app.css/app.js `?v=20260720j`→`20260720k`、`sw.js` CACHE_NAME=`sg-weekend-v639`→`v640`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのイラストバッジ表示（40pxコンテナとのフィット感）、ダークモード時の視認性、6エリアとも達成時に正しい画像が表示されること、CSS印章→イラストへの切り替えの見た目は2026-07-20時点でWeb版目視確認のみ、実機未確認

### AI生成レベルバッジイラストの統合（2026-07-20実装、設計書81）
設計書80のエリアバッジ統合と同じ方針を、別軸の「レベルバッジ」（`STAMP_LEVEL_META`、定番/ローカル/ニッチ/スペシャル）に適用した。エリアバッジと異なり「達成/未達成の二値」がそのまま当てはまらない複数箇所（凡例・演出モーダル・一覧見出し・詳細バッジ・マップピン等、計6箇所）があるため、ユーザーが**実装対象を2箇所のみに確定**（レベル解禁演出モーダル・コレクション一覧「ページ」見出し）。他4箇所は絵文字表示のまま維持。

- **画像アセット**: `public/images/stamp-badges/badge-level-{standard,local,niche,special}.png`（4枚、256×256px・透明背景）。**`public/images/`は`.gitignore`対象外の通常git管理対象**（設計書80のリスク7と同一の注意点、コミット対象に含めた）。レベル↔画像の対応: 定番=ヴィンテージカメラ、ローカル=自転車＋ショップハウス、ニッチ=虫眼鏡＋宝の地図、スペシャル=宝箱
- **`STAMP_LEVEL_META`定数の拡張**（`public/app.js`）: 各要素（4レベル）に`img`フィールド（サイトルート相対パス）を追加。**`emoji`フィールドは削除せず維持**（凡例チップ・スポット詳細バッジ・マップピン・個別スポットスタンプの4箇所が引き続き参照するため）
- **適用箇所1: レベル解禁演出モーダル**（`openStampLevelUnlockModal()`、`#stamp-level-unlock-emoji`）: `emojiEl.textContent = meta.emoji`を`emojiEl.innerHTML = '<img src="${meta.img}" class="stamp-unlock-img">'`に変更。既存の`@keyframes stampUnlockPop`ポップインアニメーション（`style.animation`の`none`→空文字リセットによる強制再生トリガー）はコンテナ要素`#stamp-level-unlock-emoji`自体に付いたまま無変更のため継続動作（テキストか画像かは`transform`/`opacity`アニメーションにとって無関係）。`public/index.html`の静的初期値`✨`は空文字列に変更（JS実行前のちらつき防止、画像はJSで都度生成）
- **適用箇所2: コレクション一覧「ページ」見出し**（`_renderStampCollectionList()`内`.stamp-book-page-title`）: `${meta.emoji}`を`<img class="stamp-level-title-img">`（20×20px、`object-fit:contain`）に置き換え。ロック中ページ（`.stamp-book-page--locked`、opacity:0.6）でも画像は変わらず表示される
- **CSS印章演出とは併用しない**（設計書80と同じ判断根拠）: `.stamp-unlock-img`（96×96px、`object-fit:contain`、`filter:drop-shadow`）・`.stamp-level-title-img`（20×20px）を新規追加
- **対象外として明示的に維持**: レベル凡例チップ（`_renderStampLevelLegend()`、`#stamp-level-legend`）・スポット詳細シートのレベルバッジ（`openStampSpotDetail()`、`#stamp-spot-detail-level-badge`、`textContent`＋インラインstyle方式のまま）・マップ上のピン（`_renderStampMarkers()`、`.stamp-marker-icon`、30px雫形ピンの回転構造とイラストの相性が悪いため技術的制約により対象外）・コレクション一覧の個別スポットスタンプ中身（`.stamp-circle-mark`、ユーザー指定スコープ外）は、いずれも`meta.emoji`のまま完全無変更
- i18n新規キーなし（`alt`属性は既存の`stampLevelStandard`等ラベルキーを流用）
- `server.js`・`data/`配下は無変更（pm2 restart不要だが今回は実施済み）
- キャッシュバスティング: `index.html` app.css/app.js `?v=20260720k`→`20260720l`、`sw.js` CACHE_NAME=`sg-weekend-v640`→`v641`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのレベル解禁演出モーダル画像サイズ（96px）・コレクション一覧見出し画像サイズ（20px）のフィット感、ダークモード時の視認性は2026-07-20時点でWeb版目視確認のみ、実機未確認
- **スコープ外（将来検討）**: レベル凡例チップ・スポット詳細シートのレベルバッジへのイラスト適用は今回見送り。将来ユーザーが希望すれば別設計書で再検討（`.claude/plan.md`「設計書81 §4-3・§4-4」に実装方針の概略あり）

### スタンプサイズの拡大（2026-07-20実装、設計書82）
設計書81で追加したコレクション一覧のレベル見出しアイコン（20px）が、ユーザーが実機スクリーンショットを確認したところ「変わっていない」と誤解するほど小さく目立たなかった。レベル見出しアイコンだけでなく、既存のエリアバッジ（設計書77/78/80）・コレクション一覧の個別スポット円（設計書69/70/78）も含めた3種類のスタンプ表現サイズをまとめて拡大した。`public/app.css`のみの変更（`public/app.js`はクラス名出力のみでサイズ数値を持たないためJS変更不要と確認済み、`server.js`・`data/`配下も無変更）。

- **個別スポット円**（`.stamp-circle`本体）: 56px→72px、font-size 20px→24px。連動して`.stamp-circle-order`/`.stamp-circle-lock`（円内番号・鍵アイコン）のfont-size 16px→20px、`.stamp-circle--checked`の二重リング`box-shadow`（`0 0 0 3px/5px`＋影`2px 3px 6px`→`0 0 0 4px/6.5px`＋影`2.5px 4px 8px`）、`.stamp-stamp-cell`（コレクション一覧の1セル分の固定幅）74px→90pxを比例調整
- **エリアバッジ**（`.stamp-circle--area`）: 40px→56px、font-size 14px→18px（設計書§7-3の案A採用、`.stamp-circle`本体とは別の「縮小オーバーライド」構造自体は維持したまま数値のみ書き換え）。連動して`.stamp-circle--area.stamp-circle--checked`の二重リング（`0 0 0 2px/3.5px`＋影`1px 2px 4px`→`0 0 0 3px/5px`＋影`2px 3px 6px`）、`.stamp-area-stamp`/`.stamp-area-stamp-label`（バッジ全体のラッパー幅・ラベル最大幅）62px→72px、`.stamp-area-badge-img`（設計書80の達成時イラスト）の`drop-shadow`オフセット`0 2px 4px`→`0 3px 5px`を調整。`.stamp-circle--area-img`自体はサイズ指定を持たずコンテナ側（`.stamp-circle--area`）の56pxにCSSカスケードで自動追従する構造のため、`-img`クラス自体の変更は不要
- **レベル見出しアイコン**（`.stamp-level-title-img`）: 20px→32px
- キャッシュバスティング: `index.html` app.css `?v=20260720l`→`20260720m`、`sw.js` CACHE_NAME=`sg-weekend-v641`→`v642`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での拡大後の表示密度・スクロール量増加、エリアバッジ拡大に伴う`.stamp-area-badges-page`の折り返しレイアウト変化、ダークモード時の見た目は2026-07-20時点でWeb版目視確認のみ、実機未確認

### スタンプラリー画面の大幅リデザイン（2026-07-21実装、設計書83）
円形スタンプグリッド（設計書78）のコレクション一覧を実機で確認したユーザーから見直し要望があり、(1)エリア制覇バッジの一時停止、(2)マップ表示の簡素化、(3)コレクション一覧の全面リデザイン、の3点をまとめて実施した。データモデル・API変更なし、`public/`配下（index.html/app.js/app.css）のみの変更。

- **エリア制覇バッジの一時停止**: `public/index.html`のエリアバッジ見出し行＋`#stamp-area-badges`を新規`<div style="display:none;">`ラッパーで包んで非表示化。**CLAUDE.mdの既存「稼働停止中」パターン（Klookアフィリエイトリンク等）を踏襲**、`_renderStampAreaBadges()`関数・`STAMP_BADGE_AREAS`定数・`initStampMapTab()`/`doStampCheckin()`からの呼び出し・関連CSS（`.stamp-area-badges-page`/`.stamp-circle--area`/`.stamp-circle--area-img`/`.stamp-area-badge-img`等）は一切削除せず残置。復活時はHTML側の`display:none`を解除するのみ
- **マップ表示の簡素化**: `_renderStampMarkers()`に`.filter(spot => _stampProgress.unlockedLevels.includes(spot.level))`を追加し、ロック中（未解禁）の`local`/`niche`スポットのピンをマップ生成ループから除外（`standard`は`STAMP_LEVEL_GATES.standard===null`により常に解禁済みのため全件表示のまま、`special`は既存仕様でAPIレスポンス自体から除外済みのため無関係）。**進捗サマリー（`#stamp-progress-summary`）・レベル凡例チップ（`#stamp-level-legend`）はHTML要素ごと削除し、`_renderStampLevelLegend()`/`_renderStampProgressSummary()`関数定義も削除**（復活を前提としない恒久的な削除として扱う、エリアバッジとは異なる方針）。`initStampMapTab()`・`doStampCheckin()`双方の呼び出し列から該当2関数の呼び出しを削除（計4行）。`_applyStampViewMode()`内の`legendEl`関連コードも削除
- **コレクション一覧の全面リデザイン（`_renderStampCollectionList()`書き換え）**: 円形スタンプグリッド（`.stamp-book-page`＋`.stamp-book-grid`）を廃止し、`STAMP_LEVEL_ORDER_CLIENT`の順でレベルごとに以下3状態のいずれかで描画する構成に変更（**`spotsInLevel.length === 0`のガードが`totalCount===0`の誤判定〈`special`未解禁時に`0/0`の全制覇バッジが出るバグ〉を防ぐ必須の防御線**、totalCount算出より前に配置）
  - **状態A（ロック中）**: `_renderStampLevelRowLocked()`。「🔒＋レベル名＋`checkedCount`/`totalCount`」のコンパクトな1行のみ、個別スポットのカードは一切表示しない（新規`.stamp-level-row`系CSS）
  - **状態B（解禁中・未全制覇）**: `_renderStampLevelRowInProgress()`。レベル見出し（`meta.img`＋ラベル、既存`.stamp-level-title-img`クラスを継続利用）の下に`order`昇順の横長カード一覧。制覇済みは塗りつぶし✓円（`meta.color`背景）＋チェックイン日時（`_stampCheckinDateFor()`）・説明文（`spot.description`、既存設計書79ロジックを流用）をカード内に配置、未制覇は番号円のみ。現在の次ターゲット（`_computeStampNextTarget()`）には「次はここ！」タグを表示（新規`.stamp-level-section`/`.stamp-card`系CSS）。このレベル内の全カードは無条件で`onclick="if(!_touchCapableDetected) openStampSpotDetail(...)"` を付与（状態Bは定義上`unlocked===true`のみのため旧実装の三項分岐は不要）
  - **状態C（解禁中・全制覇済み）**: `_renderStampLevelRowComplete()`。個別カード一覧は表示せず、`meta.img`（96px、設計書81で導入済みのレベルイラスト画像を再利用）＋「{レベル名} 制覇！」＋「{件数}/{件数} スポット達成」の大きなバッジを常時表示（新規`.stamp-level-complete-badge`系CSS）。タップ不可の純粋な表示要素（`onclick`なし）。既存のレベル解禁演出モーダル`openStampLevelUnlockModal()`（一度きりの祝いポップアップ）とは別物として無変更のまま共存
- **旧CSSクラスの削除**: `.stamp-level-chip`系（凡例チップ）・`.stamp-book-page`系・`.stamp-stamp-cell`系（旧コレクション一覧グリッド）・`.stamp-circle-order`/`.stamp-circle-lock`/`.stamp-circle--locked`/`.stamp-circle--next`＋`@keyframes stampNextPulseRing`（旧コレクション一覧専用の円修飾子）を削除。**`.stamp-circle`本体・`.stamp-circle--checked`・`.stamp-circle--area`・`.stamp-circle--area-img`・`.stamp-area-badge-img`はエリアバッジ側（`_renderStampAreaBadges()`）が引き続き共有使用するため削除せず維持**（同名クラスがコレクション一覧側とエリアバッジ側の両方から参照されていたための必須の注意点、設計書83 §10リスク1）
- **i18n**: 新規2キー（ja/en同時追加）: `stampLevelCompleteLabel`（制覇！/Complete!）・`stampLevelCompleteSpotsLabel`（スポット達成/spots collected）。死にキー化した既存`stampProgressSummary`/`stampCollectionLockedNote`は実害がないため削除せず残置
- キャッシュバスティング: `index.html` app.js/app.css `?v=20260721a`、`sw.js` CACHE_NAME=`sg-weekend-v643`
- `server.js`・`data/`配下は無変更（pm2 restart不要）。設計書69〜82自体もまだTestFlightビルド未実施のステータスのため、本リデザインも含めて次回一括リリースの想定
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での横長カード一覧（23件想定）のスクロール量・タップ精度、状態B/C切り替わり時の見た目のジャンプ、状態A/B/Cの視覚的統一感（制覇済み/未制覇混在時のカード高さ不揃い）、ダークモード時の見た目は2026-07-21時点でWeb版目視確認のみ、実機未確認

### スタンプ一覧の不具合修正（タップ不発）＋見た目調整（2026-07-21実装、設計書84）
設計書83実装直後のユーザー確認で見つかった不具合1件・見た目調整2点を修正した。データモデル・API変更なし、`public/app.js`・`public/app.css`のみの変更（`public/index.html`はキャッシュバスティングのみ）。

- **【最優先・不具合修正】`.stamp-card`タップ不発**: `_renderStampLevelRowInProgress()`（状態B、`public/app.js`）が生成する`.stamp-card`のonclick属性が`onclick="if(!_touchCapableDetected) openStampSpotDetail('${spot.id}')"`となっていたが、対応する`touchend`ハンドラが一切登録されていなかった（CLAUDE.md「onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック」節の既知アンチパターンに該当）。実機タッチ操作では一度でも画面に触れると`_touchCapableDetected`が`true`になり、以降ガードが常に偽と評価されて`openStampSpotDetail()`が呼ばれずタップ不発になっていた（PCマウス操作では`_touchCapableDetected`が`false`のままのため問題なく動いていた）。`onclick="openStampSpotDetail('${spot.id}')"`に単純化し、新規`touchend`ハンドラは追加していない（ゴーストクリックが実証されていない要素にガードを付けるべきではないという既存方針通り）
- **見出しアイコンを絵文字に戻す（状態Bのみ）**: `_renderStampLevelRowInProgress()`内`.stamp-level-section-title`の中身を、設計書81で導入した`<img src="${meta.img}" ... class="stamp-level-title-img">`（イラスト画像）から`${meta.emoji}`（絵文字）に戻した。**状態C（`_renderStampLevelRowComplete()`の`.stamp-level-complete-badge-img`）・レベル解禁演出モーダル（`openStampLevelUnlockModal()`の`.stamp-unlock-img`）・エリアバッジ画像（`.stamp-circle--area-img`/`.stamp-area-badge-img`、非表示中だがコード残置）はいずれも変更していない**（別クラス・別関数、`grep`で無変更を確認済み）。`.stamp-level-title-img`というCSSクラス自体は参照元がなくなり死にクラス化したが、実害がないため削除せず残置
- **全制覇バッジ（状態C）の拡大**: `public/app.css`の`.stamp-level-complete-badge`（padding `24px 16px`→`32px 20px`）・`.stamp-level-complete-badge-img`（`96px`→`150px`、drop-shadowオフセットも`0 3px 6px`→`0 4px 8px`に微調整）・`.stamp-level-complete-badge-title`（`15px`→`19px`）・`.stamp-level-complete-badge-count`（`12px`→`14px`）を拡大。border-radius・background（`var(--sand)`）・border・text-align・flexレイアウトは無変更のまま流用、新規の直書き色は追加していない（ダークモード自動追従を維持）
- `server.js`・データファイルは無変更（pm2 restart不要だが今回は実施済み）。キャッシュバスティング: `index.html` app.js/app.css `?v=20260721a`→`20260721b`、`sw.js` CACHE_NAME=`sg-weekend-v643`→`v644`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのタップ精度（onclickガード除去後の安定性）、絵文字見出しの見た目バランス（イラスト画像との統一感がやや失われる可能性、ユーザー明示要望に基づく意図的選択）、全制覇バッジ拡大後のコレクション一覧全体のスクロール量増加は2026-07-21時点でWeb版目視確認のみ、実機未確認

### バッジ画像の透明化修正（チェッカーボード焼き込みバグ）＋Centralエリアバッジの画像差し替え（2026-07-21実装、設計書85）
`.stamp-level-complete-badge-img`（設計書83〜84）を確認したところ、円形にくり抜かれるはずのバッジ画像が実際には四角いチェッカーボード柄ごと表示される不具合が見つかった。`public/images/stamp-badges/`配下の静的PNG10枚のピクセルデータのみを書き換える対応で、`server.js`・`public/app.js`・`public/app.css`・`public/index.html`のコード変更は一切なし。

- **不具合1（本質的なバグ）: 全10枚が透明背景になっていなかった**。設計書80・81は「256×256px・透明背景」と記録していたが、実際には全10枚ともアルファチャンネルが全ピクセル255（完全不透明）だった。Nano Bananaが「透明背景」生成時、画像編集ツールが透明領域のプレビューに使うチェッカーボード柄（白と薄灰色の格子）を本物のピクセルとしてそのまま焼き込んで出力していたことが原因。CSS側（`.stamp-level-complete-badge-img`等）は`object-fit:contain`のみで円形マスクを掛けていないため、正方形のチェッカーボードがそのまま見えていた
- **不具合2（無関係の別バグ）: `badge-central.png`が別画像に差し替わっていた**。Centralエリアバッジ（本来はマーライオンのイラスト）が、設計書80検討時にユーザーが参考画像として送ったPikmin Bloomのバッジ画面のスクリーンショットになっていた。`git log`で確認したところ設計書80のコミット時点から一貫してこの誤った画像のままで、直近の作業で壊れたものではない。他9枚は目視確認の結果いずれも正しいイラストだった
- **修正方法（自動透明化、ユーザーが3択中「自動で透明化」を選択）**: (1) 画像四辺を起点に「チェッカーボード色」（`max(R,G,B)-min(R,G,B)<=30`かつ`max(R,G,B)>=140`の無彩色・明色判定）のピクセルをアルファ0にしながらBFSフラッドフィルで伝播、(2) 残った不透明ピクセルの4近傍連結成分を求め最大の連結成分（＝バッジ本体のイラスト）以外を全て透明化する後処理、の2段階。`badge-central.png`のみ新規画像（ユーザー提供の1024×1024マーライオンイラスト）を256×256にリサイズしてから同じ処理を適用し差し替え。他9枚（East/West/North/North-East/Sentosa・レベル4種）は既存ファイルに透明化処理のみ適用し絵柄自体は無変更
- **検証**: 10枚全てで`sharp`によりアルファ値0のピクセルが存在すること（透明化ピクセル比率49〜61%、円形イラスト＋透明背景として妥当）を機械的に確認。加えてsand色背景に合成した150px相当のコンタクトシート・透明化前後の比較画像を生成し目視確認した結果、白色を含みリスクが高いとされていたEast（建物の白壁）・North（鳥の白い羽毛）を含む全画像でイラストの欠損なし。`badge-level-special.png`の外周ギザギザ模様は透明化前の元画像から存在する意図的な発光エフェクト（意匠）であり、チェッカーボードの残骸ではないことも比較確認済み
- **教訓（再発防止、CLAUDE.md記録）**: (1) AI画像生成ツール（Nano Banana等）で「透明背景」を指定しても、実際には編集ツールのチェッカーボードプレビュー柄がそのまま焼き込まれて出力される場合がある。今後新規バッジ画像等の透明背景アセットを追加する際は、生成直後に`sharp`でアルファ値のヒストグラム確認（全ピクセル255=不透明になっていないか）を行う習慣を持つこと。(2) 参考画像として会話に送付した画像と、実際に採用すべき生成画像を取り違えて配置してしまうミスが1年近く（設計書80のコミット以降）気づかれずに残っていた実例があるため、新規画像アセットをコミットする際は行数の少ない差分でも一度は目視でサムネイル確認する価値がある
- `server.js`・データファイル・APIレスポンス構造は無変更（`pm2 restart`不要）。iOS版はCapacitorのローカルバンドル方式のため次回TestFlightビルドでの反映が必要
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのバッジ表示（設計書69〜84自体がまだTestFlightビルド未実施のため、本修正も次回一括リリース時に確認）

### スタンプ詳細モーダルを閉じた後、画面上部（ステータスバー付近）がグレーアウトされたまま残る不具合の修正（2026-07-21実装、設計書86）
Web版（iPhone Safari）でスタンプラリーのスポット詳細モーダル（`#stamp-spot-detail-sheet`）を開いて閉じると、画面最上部（iOSステータスバー付近）がグレーアウトされたまま残る不具合が報告された。メインエージェントが実機スクリーンショット2枚（不具合再現時・正常時）の比較とPlaywrightでの状態検証を実施し原因を特定した。

- **原因**: `#stamp-spot-detail-overlay`が使う共有クラス`.chat-overlay`は`opacity`のみで表示/非表示を切り替えており（`display`は常に`block`のまま）、`opacity:0`になった後も要素はレイアウト・コンポジットツリーに残り続ける実装だった。`.chat-overlay`の背景色`rgba(44,36,32,0.45)`をクリーム色（`#FFF9F2`）にアルファブレンド計算すると`rgb(160,153,148)`相当となり、ユーザーのスクリーンショットで確認されたグレーの帯の色味とほぼ一致した。Playwrightでの検証では`opacity:0`・`pointer-events:none`ともJS/CSSの論理的な状態は正しく更新されていることを確認済みで、iOS Safariが`position:fixed`かつ半透明の要素をopacityがゼロになった後もステータスバー付近（safe-area-inset-top付近）の再描画で「古いペイントとして」焼き付かせる既知のWebKit挙動が最有力仮説（一次情報による確証はなく、色の一致・症状の再現条件から導いた推測）
- **影響範囲**: `.chat-overlay`クラスは`#stamp-spot-detail-overlay`以外に7箇所で共有されている（`#title-edit-overlay`/`#backup-passphrase-overlay`/`#cal-passphrase-overlay`/`#stamp-level-unlock-overlay`/`#pin-picker-overlay`/`#emoji-picker-overlay`/`#schedule-action-overlay`）。いずれも同一構造（`opacity`のみのトグル、`display`は常に`block`のまま）のため同種の不具合を潜在的に抱えている可能性が高く、8箇所全てに横展開して修正した
- **修正1（CSS）**: `public/app.css`の`.chat-overlay.visible`ルールに`display: block !important;`を追加
- **修正2（JS）**: `public/app.js`（`_touchCapableDetected`検出リスナー直後、ページ初期化時に一度だけ実行）に、`.chat-overlay`要素全てへ一括で`transitionend`リスナーを登録。`opacity`のトランジション完了時に`.visible`クラスが無ければ`el.style.display = 'none'`を設定し、フェードアウト完了後にDOM上から実質的に除去する。再度開く際はCSS側の`display:block !important`がJSの残留インラインスタイルを確実に上書きするため、開く側の8箇所の`open〜()`関数は一切変更不要（CSSカスケードで解決）
- **`#schedule-action-overlay`との相互作用確認済み**: この要素のみ他7箇所と異なり`classList.add/remove('visible')`ではなく`overlay.style.display='block'/'none'`を直接操作する独自実装（`background:transparent`のインタラクションブロック専用オーバーレイ、`opacity`は常に`.chat-overlay`既定の`0`のまま変化しない）。新規`transitionend`リスナーは`opacity`の値が変化しないため発火せず、既存の`closeScheduleActionSheet()`内`display='none'`設定と衝突しないことを確認済み
- **診断ログ（使い捨て、原因仮説が外れていた場合の保険）**: `closeStampSpotDetail()`に、閉じた直後と400ms後（`transitionend`発火想定後）の2時点で`_sendDebugLog('stamp_detail_close_state', {...})`を追加し、`#stamp-spot-detail-overlay`の`getComputedStyle()`（`opacity`/`display`/`pointerEvents`）を記録する。**実装直後の実機検証で`immediate`時点`{opacity:"1",display:"block"}`→`after_400ms`時点`{opacity:"0",display:"none"}`という想定通りの遷移を`logs/debug-nav.log`で確認済み**。CLAUDE.md既存運用ルール上は原因確定後に削除してよい使い捨てログだが、**今回は削除せず残置した**（次回症状再発の有無を継続確認するため）
- スコープ外（今回未実装）: `.chat-overlay`以外の別カテゴリのオーバーレイ（`.plan-modal-overlay`・`.cal-popup-overlay`・`.pin-detail-overlay`等）への同種修正の横展開、WebKit側の根本原因の完全な特定
- `server.js`・`data/`配下・`public/index.html`のマークアップは無変更（`?v=`キャッシュバスティングのみ）。`pm2 restart`不要
- キャッシュバスティング: `index.html` app.css/app.js `?v=20260721c`、`sw.js` CACHE_NAME=`sg-weekend-v645`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS App Store版（Capacitor/WKWebView）での同種のグレーアウト残留有無（今回はWeb版報告に基づく修正）。フェードイン（開く動作）が引き続き正常にアニメーションすること・8箇所全ての開閉が壊れていないことはWeb版で確認済みだが、iOS実機は未確認

### スタンプチェックインのサーバー側GPS距離検証（不正対策）（2026-07-21実装、設計書87）
`POST /api/stamp-progress/checkin`は設計書69以来「v1はサーバー側の距離検証を行わず、クライアント申告のlat/lngをそのまま信用する」暫定方針だった（クライアント側`_haversineDistanceM()`によるボタンdisabled制御はUIの制御でしかなく、APIを直接叩けば任意の座標で無条件にチェックイン実績を記録できる状態だった）。ユーザーへの「位置情報以外の追加入力で不正対策をしたい」という相談に対し、メインエージェントが「まずサーバー側の既存の穴（距離検証の欠如）を塞ぐのが最優先」と提案し合意、実装した。

- **`server.js`にHaversine距離計算ヘルパー`haversineDistanceM(lat1, lng1, lat2, lng2)`を新規追加**（STAMP RALLYセクション冒頭、`STAMP_PROGRESS_DIR`定義直後）。`public/app.js`の`_haversineDistanceM()`と同一の計算式（地球半径6371000m、標準的なHaversine公式）をサーバー側に移植したもの
- **`POST /api/stamp-progress/checkin`の新規チェックイン分岐（`else`側、`alreadyCheckedIn`でない場合）にのみ距離検証を追加**。`lat`/`lng`がともに`number`型でなければ距離を`Infinity`扱いにし、`spot.checkinRadiusM || 200`（クライアント側と同じフォールバック値200m）を超える場合は`tooFar`フラグを立てて`return`し、`withFileLock`内の書き込み（`checkedInSpotIds`・`checkinLog`・`updatedAt`いずれも）を一切行わない。ロック解放後、`tooFar`なら`403 { error: 'too far from spot' }`を返す
- **既にチェックイン済みスポットへの再リクエスト（`alreadyCheckedIn`分岐）は距離検証の対象外のまま**、既存の冪等動作（`updatedAt`更新・再書き込みして200 OKを返す）を変更していない（設計判断: 状態が変化しない冪等リプレイに距離検証を課す必要はないため）
- **クライアント側（`public/app.js`/`public/index.html`/`public/app.css`）は無変更**。`doStampCheckin()`は既に`if (!res.ok) throw new Error('checkin failed')`で非2xxレスポンスを捕捉し既存の汎用エラートースト（`toastStampCheckinError`）を表示する実装のため、新規i18nキーの追加・専用エラーメッセージの出し分けは行っていない。正規のフロー（クライアントが既に距離チェック済みでボタンを押した場合）ではサーバー側検証で弾かれることは基本的に想定されない
- **リクエスト・成功時レスポンス形式は無変更**（`{ok, alreadyCheckedIn, checkedInSpotIds, unlockedLevels}`のまま）。新規追加は「距離検証失敗時の403エラー」のみ。データモデル（`data/stamp-progress/{userId}.json`のスキーマ、`data/sg/stamp-spots.json`の`lat`/`lng`/`checkinRadiusM`）はいずれも無変更
- 検証済み（curl）: (1)遠い座標での新規チェックイン試行→403、進捗ファイル未作成 (2)スポット実座標での正規チェックイン→200成功 (3)既チェックイン済みスポットへ遠い座標で再送信→距離検証スキップで200（冪等動作維持）
- **既知の未解決事項（スコープ外として明記）**: クライアント側GPS値自体の偽装（モック位置情報アプリ等）への対策は依然残る。今回はサーバーがスポット実座標との距離を検証するのみで、送信されたlat/lng自体が本物かどうかまでは検証しない。拒否時のログ・監視（不正チェックインの試行ログ等）も今回は追加していない
- `server.js`のみの変更のため`pm2 restart`実施済み。`public/`配下は無変更のためTestFlightビルド不要（Web版・iOS版とも次回`pm2 restart`時点でサーバー側の防御が即座に有効）

### スタンプ一覧カードの見た目刷新（写真サムネイル＋レベル進捗バー＋制覇スタンプ印）（2026-07-21実装、設計書88）
設計書83で実装したコレクション一覧の状態B（解禁中・未全制覇レベルの横長カード一覧）が「文字とダッシュ円だけで味気ない」というユーザー指摘を受け、モックアップ2回（v2/v3）のレビューを経て見た目を刷新した。データモデル・API変更なし、`public/app.js`・`public/app.css`のみの変更。

- **写真サムネイル**: `_renderStampLevelRowInProgress()`の`circleHtml`生成部（旧36pxダッシュ円+番号/チェックマーク）を、56px角丸正方形の写真サムネイル（`.stamp-card-thumb`）に置き換え。`spot.imageUrl`があれば`<img class="stamp-card-thumb-img">`（`object-fit:cover`）、空文字列（2026-07-21時点`tekka-market`・`labrador-secret-tunnel`の2件が該当）ならsand背景+📍アイコンのプレースホルダー（`.stamp-card-thumb-placeholder`）を表示
- **番号バッジの廃止**: 未制覇スポットは番号を一切表示しない（写真/プレースホルダーのみ）。「次はここ！」タグ（`.stamp-card-next-tag`）は現状維持
- **制覇済みスタンプ印**: 制覇済みスポットは、サムネイル右下角に30px円形の「済」スタンプ印（`.stamp-card-done-mark`）を重ねて表示。背景色は`meta.color`（レベルカラー）、白い縁取り（`border:2px solid var(--cream)`）、`transform:rotate(-12deg)`で手押し感を演出。ラベルは新規i18nキー`stampCardDoneMark`（ja「済」/en「✓」、円のサイズに収めるため英語は記号表記）
- **レベルごとの進捗バー**: `.stamp-level-section-title`の直後に、`checkedCount/totalCount`の割合を塗りつぶした横長バー（`.stamp-level-progress-row`、`var(--caramel-light)`〜`var(--caramel)`グラデーション。`--caramel-dark`はCSS変数として未定義だったため`--caramel-light`起点に変更）＋「X/Y」ラベル（`.stamp-level-progress-label`）を追加。`_renderStampCollectionList()`側で既に算出済みの`checkedCount`/`totalCount`を`_renderStampLevelRowInProgress(meta, spotsInLevel, nextTarget, lang, checkedCount, totalCount)`の第5・6引数として渡す形に変更（呼び出し元1箇所のみ変更）
- **旧CSS削除**: `.stamp-card-circle`・`.stamp-card-circle--checked`は他に参照箇所がないことを確認の上削除し、新規クラス（`.stamp-card-thumb`系・`.stamp-card-done-mark`・`.stamp-level-progress-*`）に置き換えた
- スコープ外（今回未実装）: 状態A（ロック中1行表示）・状態C（全制覇バッジ）の見た目変更、マップビュー（Leafletピン）・エリアバッジ（非表示中）への写真サムネイル適用、`tekka-market`・`labrador-secret-tunnel`の画像再取得
- `server.js`・`data/`配下は無変更（pm2 restart不要）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのサムネイル拡大（36px→56px相当）に伴うカード高さ増加・スクロール量、画像なしプレースホルダーの実機表示、制覇済みスタンプ印の視認性・回転演出の見た目は2026-07-21時点でWeb版のみ確認、実機未確認

### ボトムナビ「制覇」→「探検」・コース画面共通見出し「スタンプラリー」→「シンガポール探訪」への名称変更（2026-07-21実装、設計書89）
ユーザーから、ボトムナビ「制覇」（設計書72で命名）とコース画面共通見出し「スタンプラリー」（設計書73で命名）の組み合わせが「しっくりこない」との指摘があり、ネーミングブレスト（探検/冒険/攻略/探訪/探究/巡礼等を比較検討）を経て「ナビは短く衝動性のある言葉、見出しは深みのある言葉」という役割分担方針で確定した。

- `navCourse`キーの値のみ変更（キー名不変）: ja「制覇」→「探検」、en「Conquer」→「Explore」
- `courseScreenTitle`キーの値のみ変更（キー名不変）: ja「スタンプラリー」→「シンガポール探訪」、en「Stamp Rally」→「Explore Singapore」
- `public/index.html`のデフォルト直書きテキスト2箇所（`data-i18n="courseScreenTitle"`・`data-i18n="navCourse"`）も同時変更
- **`courseTabStampMap`（コース画面内のタブラベル、「スタンプラリー」/「Stamp Rally」）は変更していない**。3タブ共通見出し（`courseScreenTitle`）とは別物で、スタンプラリー機能そのものの呼称としては引き続き「スタンプラリー」を使う。`courseTabEveryone`（みんなのコース）・`courseTabMylist`（マイコース）も無変更
- 見出しをタブごとに動的切り替える案も検討したが、ユーザーは全タブ共通で「シンガポール探訪」に固定する現状のアーキテクチャ維持を選択（AskUserQuestionで確認済み）。そのため「コース閲覧中も無関係な見出しが出続ける」という設計書73時点の既知の妥協点は、名称が変わっただけで構造的には残る
- コード内の関数名・変数名・CSSクラス名（`stamp*`プレフィックス等）は無変更、表示文言（i18n値）のみの変更
- `server.js`・`data/`配下は無変更（pm2 restart不要）
- **既知の未解決事項**: 英語訳「Explore」「Explore Singapore」の適切性は未検証（既存の「Conquer」「Stamp Rally」も設計書72で同様の注記あり）

設計書88・89は同一のcommitでまとめて実装。キャッシュバスティング: `index.html` app.css/app.js `?v=20260721c`→`20260721d`、`sw.js` CACHE_NAME=`sg-weekend-v645`→`v646`

### ボトムナビラベルを「探検」→「探訪」に修正（見出しと表記統一）（2026-07-21実装、設計書91）
設計書89でボトムナビ「制覇」→「探検」、コース画面共通見出し「スタンプラリー」→「シンガポール探訪」に変更した直後、ユーザーから「ボトムメニューも探訪でいいよ」との追加要望があり、ナビと見出しの表記を「探訪」に統一した。
- `navCourse`キーの値のみ変更（キー名不変）: ja「探検」→「探訪」。en「Explore」は変更なし（据え置き）
- `public/index.html`の`data-i18n="navCourse"`デフォルト直書きテキストも同時変更
- `courseScreenTitle`（「シンガポール探訪」）・`courseTabStampMap`（「スタンプラリー」）は変更していない
- `server.js`・`data/`配下は無変更（pm2 restart不要）
- キャッシュバスティング: `index.html` app.js `?v=20260721e`→`20260721f`（`app.css`は無変更のため据え置き）、`sw.js` CACHE_NAME=`sg-weekend-v647`→`v648`

### スタンプラリー地図の見た目改善（セピア調フィルター）＋一覧カードから地図ピンへのフォーカス導線（2026-07-21実装、設計書92）
ユーザーから「地図の見せ方が微妙」との指摘を受け、地図タイルにCSSフィルターをかけてアプリの世界観（クリーム×キャラメル系）と馴染ませた。あわせて「一覧のカードと上手く紐付けられる？」との要望を受け、コレクション一覧のカードから地図上の該当ピンへジャンプできる導線を追加した。

- **地図タイルのセピア調フィルター**: `public/app.css`の`.leaflet-tile-pane`に`filter: sepia(0.9) saturate(0.55) hue-rotate(-5deg) brightness(1.12) contrast(0.9)`を追加（羊皮紙調、ユーザーがPlaywrightモックアップのB案〈強めセピア〉を選択）。Leafletのペイン分離構造により、タイルペインのみに適用されマーカーアイコン（`.stamp-marker-icon`）・ズームコントロール（`.leaflet-control-zoom`）には影響しない
- **マーカー参照の保持**: `public/app.js`に新規モジュールスコープ変数`_stampMarkerRefs`（`spotId→Leafletマーカー`のマップ、`_stampViewMode`と同じ並び）を追加。`_renderStampMarkers()`は従来`clearLayers()`で生成した`L.marker`をどこにも保持していなかったが、冒頭で`_stampMarkerRefs={}`にリセットしたうえで各マーカー生成時に`_stampMarkerRefs[spot.id]=marker`で保持するよう変更
- **新規関数`focusStampSpotOnMap(spotId)`**: (1)`_stampViewMode`を`'map'`に切り替え`_applyStampViewMode()`で地図ビューを表示（既存`toggleStampViewMode()`と同じパターン）、(2)60ms後に`invalidateSize()`＋`flyTo([spot.lat,spot.lng],16,{animate:true,duration:0.8})`でパン&ズーム、(3)さらに850ms後に該当ピンへ`.stamp-marker-icon--focus-pulse`クラスを付与し1800ms後に除去（一度きりのパルス演出）。`flyTo()`アニメーション完了の待機は`moveend`イベントではなく固定`setTimeout`によるシンプルな実装（低スペック端末でズレる可能性は既知の未解決事項として許容）
- **一度きりのフォーカスパルスCSS**: `.stamp-marker-icon--focus-pulse::after`＋`@keyframes stampFocusPulseRing`を新規追加。既存の「次はここ」ピンの継続的パルス（`.stamp-marker-icon--next`・`@keyframes stampNextPulse`、拡大縮小）とは別物で混同しないこと。マーカーdiv自体が既にインラインstyleで`position:relative`を持つため、`::after`の`position:absolute`が正しく基準化される
- **カードへの「地図で見る」ボタン追加**: `_renderStampLevelRowInProgress()`が生成する各`.stamp-card`の右端に、新規`.spot-map-link`ボタン（📍、34px円形、`var(--sand)`背景。「次はここ」カードは`.spot-map-link--next`修飾子で`var(--caramel)`背景+白アイコンに強調）を追加。`onclick="event.stopPropagation(); focusStampSpotOnMap('${spot.id}')"`でカード全体のクリックハンドラ（`openStampSpotDetail`）との二重発火を防止
- i18n新規キーなし（ボタンはアイコン〈📍〉のみ、既存の✕閉じるボタン等と同様のアイコンオンリーパターン）
- `server.js`・`data/`配下・`public/index.html`の静的マークアップは無変更（新規ボタンはJS側`innerHTML`生成に含まれる）。キャッシュバスティング: `index.html` app.css `?v=20260721d`→`20260721e`、app.js `?v=20260721f`→`20260721g`、`sw.js` CACHE_NAME=`sg-weekend-v648`→`v649`
- スコープ外（今回未実装）: ピンのクラスタリング（繁華街エリアでのピン密集解消）、地図からカードへの逆方向リンク（ピンタップ時に一覧側の該当カードへスクロール等）、タイル自体の別プロバイダ（Stamen/CARTO等）への差し替え
- **未検証（次回TestFlightビルド後）**: セピアフィルターのiOS実機（WKWebView）での見え方、`flyTo()`アニメーション完了を固定`setTimeout`で待つ実装のタイミングずれ有無は2026-07-21時点でWeb版目視確認のみ、実機未確認

### 「地図で見る」アイコンの色を全カード共通化（2026-07-21実装、設計書93）
設計書92で追加した`.spot-map-link`ボタンは「次はここ」カードのみ`.spot-map-link--next`修飾子で`var(--caramel)`背景+白アイコンに強調していたが、ユーザーが実機スクリーンショットで色差に違和感を報告したため統一した。`public/app.css`の`.spot-map-link--next`ブロックを削除、`public/app.js`側の条件付きクラス付与も`class="spot-map-link"`のみに簡略化（対応CSSが無くなり無意味なため）。「次はここ」タグ（`.stamp-card-next-tag`）自体は無変更。`server.js`・`data/`配下は無変更。キャッシュバスティング: `index.html` app.css `?v=20260721e`→`20260721f`、app.js `?v=20260721g`→`20260721h`、`sw.js` CACHE_NAME=`sg-weekend-v649`→`v650`。

### マイコースタブの非表示化＋コース作成FABを地図/一覧切り替えボタンに転用（2026-07-21実装、設計書94）
ユーザーから「地図で見る／一覧を見る」ボタン（`#stamp-view-toggle-btn`、タブ下に単独表示）の見せ方変更相談から、「まだ誰にも使われていないマイコース機能をタブごと非表示にし、浮いていたコース作成FAB（`#course-fab`）を地図/一覧切り替えボタンとして転用する」統合案に発展、確定した。

- **マイコースタブの非表示化**: `public/index.html`の`data-tab="mylist"`ボタンに`style="display:none;"`を追加（削除ではなく非表示化、既存パターン踏襲）。`switchCourseTab('mylist')`のロジック・`data-i18n="courseTabMylist"`は無変更のまま残置
- **`#course-fab`の転用**: `onclick`を`openCourseSheet()`→`toggleStampViewMode()`に変更、固定「＋」テキストを動的アイコン（リスト表示中は🗺️、地図表示中は📖。既存i18nキー`stampViewToggleMap`/`stampViewToggleList`の絵文字を流用）に変更。`public/app.js`のtouchendデリゲーション登録（`{id:'course-fab', fn:...}`）もonclickと同じ関数に変更（対応関係を崩さない）。`_applyStampViewMode()`に`#course-fab`のアイコン更新処理を追加
- **表示条件の反転**: `switchCourseTab()`内、`courseFabEl.style.display`の条件を反転（旧: mapタブで非表示・それ以外で表示 → 新: mapタブで表示・それ以外で非表示）。地図/一覧切り替えはスタンプラリータブでのみ意味を持つため
- **旧・上部トグルボタンの非表示化**: `#stamp-view-toggle-btn`を包む行に`display:none`を追加（削除ではない、`toggleStampViewMode()`本体・要素自体は残置）
- `server.js`・データファイル・`public/app.css`は無変更（フロントエンドの表示制御のみ）、`pm2 restart`不要
- **スコープ外・既知の残課題（設計書94 §4で明示）**: イベントカードの「🗺 コース作成」ボタン（`openCourseSheetFromEvent()`）は今回変更していない。マイコースタブ非表示後もこのボタンは動作し生成コースは`localStorage`の`{city}_my_courses`に保存され続けるが、閲覧するタブが無いため「作っても見れない」状態になる。ユーザーから今回言及がなかったため未対応、再度指摘があれば別途対応
- キャッシュバスティング: `index.html` app.js `?v=20260721h`→`20260721i`、`sw.js` CACHE_NAME=`sg-weekend-v650`→`v651`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのFABアイコン切り替えの見た目・タップ精度、マイコースタブが完全に見えなくなっていること、みんなのコースタブでFABが正しく非表示になっていることは2026-07-21時点でWeb版のみ確認済み、実機未確認

### イベントカードの「コース作成」ボタンを非表示化（2026-07-21実装、設計書95）
設計書94の残課題（マイコースタブ非表示後もイベントカードの「🗺 コース作成」ボタンからコースが作成できてしまい、閲覧するタブが無いため実質使えない状態）に対し、ユーザーから「気になります。こちらも非表示にして。等幅を使わず、予定表に登録・ピン留めのボタンを今と同じサイズにして残してください」と明示指示があり対応した。

- `renderEventCard()`（`public/app.js`、`.card-action-row`内）の3つ目のボタン（🗺 コース作成、`onclick="openCourseSheetFromEvent('${e.id}')"`）を削除
- 残る2ボタン（📌ピン留め／📅予定に追加）に、既存の確立済みパターン（マイコースカード等で使用済み、`public/app.js` 4658行目・6395〜6399行目）と同じインラインstyle`style="flex:none;width:calc(33% - 4px);"`を追加。`.card-action-btn`共有CSSクラス自体（`flex:1`で等幅に伸びる、`public/app.css`）は変更していないため、他画面（`#schedule-plan-action-add-btn`等）への影響はない。3つ目のボタンが消えた分は右側の空きスペースとして残り、2ボタンが引き伸ばされて等幅になることはない
- `openCourseSheetFromEvent()`関数自体は削除していない（ピン詳細モーダル`public/app.js` 2561行目・予定詳細画面6053行目の2箇所から引き続き呼ばれている現役の関数）
- **スコープ外・既知の残課題（設計書95 §4で明示、設計書94から持ち越し）**: ピン詳細モーダル（2561行目）・予定詳細画面（6053行目）の「コース作成」ボタンは今回のスコープ外で無変更のまま残っている。ユーザーの指示がイベントカードに限定されていたため。これらも同様に「作成はできるが閲覧するタブが無い」という同種の問題を抱えたまま残る。次回ユーザーから同様の指摘があれば別途対応
- `server.js`・データファイル・`public/index.html`本体・`public/app.css`は無変更（フロントエンドJSの表示制御のみ）、`pm2 restart`は今回念のため実施したが本来不要な変更
- キャッシュバスティング: `index.html` app.js `?v=20260721i`→`20260721j`、`sw.js` CACHE_NAME=`sg-weekend-v651`→`v652`（`app.css`は今回変更していないため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのボタン2つの見た目（等幅に伸びずサイズ維持されているか）・右側空きスペースのバランスは2026-07-21時点でWeb版のみ確認済み、実機未確認

### ボトムナビ切り替え時にスタンプ関連モーダルが閉じ残るバグの修正（2026-07-21実装、設計書96）
探訪（スタンプラリー）タブでスポット詳細モーダル（`#stamp-spot-detail-sheet`）を開いたままボトムナビで他画面に切り替えると、モーダルが閉じずに残る不具合をユーザーが報告。原因は`closeAllPopups()`（`public/app.js`、`switchNav()`冒頭で呼ばれる画面遷移時の一括クローズ関数）に、スタンプラリー機能（設計書69・70）のモーダルクローズ関数2つが未登録だったこと。
- `closeAllPopups()`に`closeStampSpotDetail()`（スポット詳細シート）・`closeStampLevelUnlockModal()`（レベル解禁演出モーダル）の呼び出しを追加。後者はユーザー報告の直接対象ではないが同一原因構造のため再発防止であわせて対応
- いずれも既に閉じている状態で呼んでも安全な既存関数のため副作用なし
- `server.js`・データファイルは無変更（pm2 restart不要）
- キャッシュバスティング: `index.html` app.js `?v=20260721j`→`20260721k`、`sw.js` CACHE_NAME=`sg-weekend-v652`→`v653`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での動作確認は2026-07-21時点でWeb版のみ確認済み、実機未確認

### 「地図で見る」ボタンをカードからスポット詳細モーダルへ移動（2026-07-21実装、設計書97）
設計書92・93で一覧カード（`.stamp-card`）右端に追加した「地図で見る」ボタン（`.spot-map-link`）について、ユーザーから「カードじゃなくて、スポットを表示したときのモーダルの中にしようかな」と方針転換の申し出があり移設した。
- `_renderStampLevelRowInProgress()`（`public/app.js`）が生成する`.stamp-card`から`.spot-map-link`ボタンを削除（設計書88時点のカード構成に戻った）
- `#stamp-spot-detail-sheet`（`public/index.html`）の`#stamp-spot-detail-area`直後に、控えめなテキストリンク（`.card-detail-link`スタイル踏襲）「📍 地図で見る」を追加。タップで`focusStampSpotOnMap(_stampSelectedSpot.id)`を呼ぶ
- `focusStampSpotOnMap(spotId)`（設計書92で実装済み）の冒頭に`closeStampSpotDetail();`を追加し、モーダル内から呼ばれた場合に地図へ切り替える前に確実にモーダルを閉じるようにした（`closeStampSpotDetail()`は既に閉じている状態で呼んでも安全、設計書96で確認済みの性質を再利用）
- i18n新規キー`stampDetailMapLink`（ja「📍 地図で見る」/en「📍 View on map」）をja/en同時追加
- `server.js`・データファイルは無変更（pm2 restart不要）
- キャッシュバスティング: `index.html` app.css `?v=20260721f`→`20260721g`、app.js `?v=20260721k`→`20260721l`、`sw.js` CACHE_NAME=`sg-weekend-v653`→`v654`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのモーダル内リンクの見た目・タップ後の地図遷移の挙動は2026-07-21時点でWeb版のみ確認済み、実機未確認

### レベル名・タブ名の文言変更／「地図で見る」不具合修正＋ピルボタン化／スペシャルレベルの「？？？」表示／イベントカードボタン中央寄せ（2026-07-21実装、設計書98〜101）
4件の小粒改善をまとめて実装した。

- **設計書98（在住歴ベースの命名への文言変更）**: アプリ全体のテーマ（限られた在住期間でどれだけ深くシンガポールを知れるか）に合わせ、スタンプラリーのレベル名を既存のイベントプロフィールバッジ語彙（`styleLabels`）と統一感のあるパターンに変更。`stampLevelStandard`（定番→移住したて/Standard→Newcomer）・`stampLevelLocal`（ローカル→定住/Local→Settled）・`stampLevelNiche`（ニッチ→シンガポール通/Niche→Singapore Expert）・`courseTabEveryone`（みんなのコース→モデルコース/Explore→Model Courses）の**値のみ変更**（キー名は不変）。`stampLevelSpecial`・`courseTabStampMap`・`courseTabMylist`は変更していない
- **設計書99（「地図で見る」不具合修正＋ピルボタン化）**: 設計書97で追加した「地図で見る」リンクが押せない不具合を修正。原因はCLAUDE.md「onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック」節の既知アンチパターン（設計書84の`.stamp-card`と同型）で、対応する`touchend`ハンドラが未登録のまま`onclick="if(!_touchCapableDetected) ..."`ガードだけが付いていたため。ガードを除去し単純な`onclick="focusStampSpotOnMap(...)"`に変更（新規touchendハンドラの追加はしない、CLAUDE.md既存ルールに従いゴーストクリックが実証されていない要素への個別ガードは付けない方針）。あわせて地味なテキストリンク（`.card-detail-link`）から、旧`#stamp-view-toggle-btn`で使っていたピル型ボタンスタイル（`.sort-btn`）に変更（「もう少し目立たせたい」というユーザー要望）。`.card-detail-link`自体・他の使用箇所（イベントカードの「🔗 元記事を見る」）は無変更
- **設計書100（スペシャルレベルの「？？？」表示）**: `special`レベルは未解禁ユーザーには`GET /api/stamp-spots`のレスポンス自体から除外される既存サーバー仕様（設計書69）のため、コレクション一覧では該当スポットが0件となり`if (spotsInLevel.length === 0) return '';`ガード（設計書83 §10リスク3）により「スペシャル」の行自体が全く描画されない状態だった。`_renderStampCollectionList()`の当該分岐に、`special`かつ未解禁の場合のみ`_renderStampLevelRowLocked(STAMP_LEVEL_META['special'], null, null)`を返す特別処理を追加。`_renderStampLevelRowLocked(meta, checkedCount, totalCount)`は`checkedCount`/`totalCount`が`null`の場合、件数表示を実件数の代わりに「？？？」にする（**実件数〈2件〉は表示しない**、サーバーが件数も含めて存在を隠す設計と整合させるため）。local/niche等、実件数を渡す既存呼び出しは無影響。サーバー側（`GET /api/stamp-spots`）は無変更、あくまでフロント側の表示ロジックのみで完結。新規i18nキーは追加していない（「？？？」は既存サーバー側マスキング文言`maskLockedStampSpot()`と同じ文字列をハードコードで流用、他の「？？？」表示箇所も非i18n対応のため整合的）
- **設計書101（イベントカードボタン中央寄せ）**: 設計書95でイベントカードの「コース作成」ボタンを削除し残る2ボタン（ピン留め・予定に追加）に`flex:none;width:calc(33% - 4px);`を指定して元のサイズを維持したが、`.card-action-row`自体に`justify-content`指定が無く既定値（`flex-start`）で左寄せになっていたのをユーザーが指摘。`.card-action-row`（`public/app.css`）に`justify-content: center;`を追加。同クラスは`public/app.js`内1箇所（イベントカード）のみで使用されているため、他画面への影響なし
- `server.js`・データファイルは無変更（pm2 restart不要）。キャッシュバスティング: `index.html` app.css `?v=20260721g`→`20260721h`、app.js `?v=20260721l`→`20260721m`、`sw.js` CACHE_NAME=`sg-weekend-v654`→`v655`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での「地図で見る」ピルボタンのタップ動作・見た目、レベル名変更後の表示崩れ有無、スペシャル「？？？」行の見た目、イベントカードボタン中央寄せの見た目は2026-07-21時点でWeb版のみ確認済み、実機未確認

### 予定表「空き日タップ→コースを作る」ボタンを非表示化（2026-07-21実装、設計書102）
マイコースタブ非表示化（設計書94）・イベントカードのコース作成ボタン削除（設計書95）に続く流れで、予定表画面の「空き週末日タップ→予定を追加/コースを作る」の2ボタン行にも同様の要望があり対応した。

- `public/app.js`の`schedule-plan-actions-${dateKey}`ブロック内、「🗺 コースを作る」ボタン（`onclick="event.stopPropagation();_openCourseFromSchedule('${dateKey}')"`）を削除。コンテナ（`<div id="schedule-plan-actions-${dateKey}" style="...justify-content:center;...">`）は元々`justify-content:center`が設定済みだったため、ボタンを1つ削除するだけで残る「📅 予定を追加」ボタンが自動的に中央寄せになる。追加のCSS変更は不要だった（設計書101のような`.card-action-row`への`justify-content`追加は今回発生していない）
- `_openCourseFromSchedule(dateKey)`関数自体は削除していない（呼び出し元が無くなり事実上呼ばれなくなるが、「機能は残しつつ表示だけ止める」既存パターンを踏襲し関数定義は残置）
- **スコープ外（今回未対応の残課題）**: ピン留めイベント一覧の「コース作成」ボタン（`.plan-to-plan-btn`、`onclick="openCourseSheetFromEvent('${p.id}')"`、`.plan-card-actions`内）は縦並びレイアウトのため今回の「中央寄せ」要望と構造的に対応しない別箇所であり対象外。マイコース非表示化に伴う「作っても見れない」問題は依然残っている
- **調査で判明した事実**: `#schedule-plan-action-sheet`/`#schedule-plan-action-course-btn`（`public/index.html`）は現在どこからも開かれない不使用（デッド）マークアップと判明。今回の変更対象とは無関係のため一切変更していない
- `server.js`・データファイルは無変更（pm2 restart不要、実施済み）。キャッシュバスティング: `index.html` app.js `?v=20260721m`→`20260721n`、`sw.js` CACHE_NAME=`sg-weekend-v655`→`v656`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での「予定を追加」ボタン単独時の中央寄せの見た目は2026-07-21時点でWeb版のみ確認済み、実機未確認

### レベルラベルの文言再修正（「移住したて」→「新参者」、「定住」→「定住レベル」）（2026-07-21実装、設計書103）
設計書98実装直後、ユーザーが「駐在の場合は移住とはいわない」と再検討。`public/app.js` `STRINGS.ja`の**値のみ**変更（キー名は不変）: `stampLevelStandard`（移住したて→新参者）・`stampLevelLocal`（定住→定住レベル）。英語値（`Newcomer`/`Settled`）・`stampLevelNiche`（シンガポール通）・`stampLevelSpecial`（スペシャル）は無変更。`public/index.html`にこれらキーのデフォルト直書きテキストは無いことを確認済み（変更不要）。
- `server.js`・データファイルは無変更（pm2 restart不要）。キャッシュバスティング: `index.html` app.js `?v=20260721n`→`20260721o`、`sw.js` CACHE_NAME=`sg-weekend-v656`→`v657`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での新レベル名表示・文字数増加（「定住」→「定住レベル」）によるバッジ等のレイアウト崩れ有無は2026-07-21時点でWeb版のみ確認済み、実機未確認

### スペシャルレベルのラベルを「極めし者」に変更（2026-07-21実装、設計書104）
設計書98・103で「新参者→定住レベル→シンガポール通」と在住歴ベースの命名に統一した流れで、最上位の`special`レベルにも「極めし者」案が採用された。他3段階の落ち着いたトーンに対し最後だけドラマチックな響きにすることで、隠し要素（該当2スポットのみ・条件も厳しい`special`）にふさわしい特別感を演出する狙い。`public/app.js` `STRINGS.ja`/`STRINGS.en`の`stampLevelSpecial`（設計書98・103では変更対象外だった箇所）の**値のみ**変更: ja「スペシャル」→「極めし者」、en「Special」→「Grandmaster」。設計書100で追加した「🔒 スペシャル ？？？」表示（`_renderStampLevelRowLocked()`経由、`t(meta.labelKey)`参照）もロジック変更不要で自動的に「🔒 極めし者 ？？？」に切り替わる。`public/index.html`にデフォルト直書きテキストは無いことを確認済み（変更不要）。
- `server.js`・データファイルは無変更（pm2 restart不要）。キャッシュバスティング: `index.html` app.js `?v=20260721o`→`20260721p`、`sw.js` CACHE_NAME=`sg-weekend-v657`→`v658`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での「極めし者」表示・ロック中「🔒 極めし者 ？？？」表示は2026-07-21時点でWeb版のみ確認済み、実機未確認

### スペシャルレベル未解禁時、ラベル名自体も「？？？」でマスク（2026-07-21実装、設計書105）
設計書100で「🔒 極めし者 ？？？」（レベル名は表示・件数のみ伏せ字）を実装していたが、ユーザーから「レベル名自体もロック中は？？？にしてほしい」との追加要望。`special`レベルは存在自体を隠す（設計書69以来の一貫方針、サーバー側でAPIレスポンスからスポット自体を除外）という設計思想に合わせ、レベル名も含めて完全に伏せる。`_renderStampLevelRowLocked(meta, checkedCount, totalCount, hideLabel)`に第4引数`hideLabel`（boolean、デフォルト`false`）を追加し、`true`時はレベル名表示も`t(meta.labelKey)`の代わりに「？？？」にする。`special`用の呼び出し箇所（`public/app.js` 4023行目付近）のみ第4引数に`true`を渡す。既存のローカル/ニッチ用の呼び出し箇所（4043行目付近）は第4引数を渡さず（`undefined`→falsy）レベル名は従来通り表示、無変更のまま動作する。
- ローカル/ニッチのロック中表示・個別スポット名のマスキング（サーバー側`maskLockedStampSpot()`）は変更しない。新規i18nキーなし（既存の「？？？」文字列を流用）
- `server.js`・データファイルは無変更（pm2 restart不要）。キャッシュバスティング: `index.html` app.js `?v=20260721p`→`20260721q`、`sw.js` CACHE_NAME=`sg-weekend-v658`→`v659`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのロック中「🔒 ？？？ ？？？」表示（レベル名・件数とも伏せ字）は2026-07-21時点でWeb版のみ確認済み、実機未確認

### レベル絵文字の変更（2026-07-21実装、設計書106）
設計書98・103・104でレベルラベルを「新参者→定住レベル→シンガポール通→極めし者」に変更した流れで、各レベルの絵文字（`STAMP_LEVEL_META`の`emoji`フィールド）も変更した。`public/app.js`の`STAMP_LEVEL_META`定数の`emoji`フィールドのみ変更: standard `📍`→`🔰`、local `🏘`→`🏠`、niche `🔎`→`🦁`。special（極めし者）は`✨`のまま変更なし。`color`・`img`（設計書81のイラストバッジ画像）も変更なし。
- `emoji`フィールドはマップピン（`_renderStampMarkers()`）・スポット詳細モーダルのレベルバッジ（`openStampSpotDetail()`）・レベル解禁演出モーダル（`openStampLevelUnlockModal()`）・コレクション一覧の状態Bレベル見出し（`_renderStampLevelRowInProgress()`）等、複数箇所から参照されるが、値の変更のみで全参照箇所に自動反映されるため個別コード変更は不要
- `server.js`・データファイルは無変更（pm2 restart不要）。キャッシュバスティング: `index.html` app.js `?v=20260721q`→`20260721r`、`sw.js` CACHE_NAME=`sg-weekend-v659`→`v660`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での新絵文字表示は2026-07-21時点でWeb版のみ確認済み、実機未確認

### レベル解禁演出モーダルの刷新（獲得スタンプ表示＋紙吹雪演出）＋全制覇バッジのスポット一覧展開機能（2026-07-21実装、設計書107・108）
設計書107: 既存のレベル解禁演出モーダル（設計書70・81）は「新しく解禁されたレベル」のバッジを表示していたが、ユーザーから「スタンプは獲得したレベル（チェックインした側）を主役にすべき」との提案があり、モックアップ（紙吹雪演出込み）を経て承認。設計書108: 設計書83の状態C（全制覇済み）は大きなバッジのみでスポット一覧が見えなかったが、ユーザー要望を受け開閉トグル式のコンパクトカード一覧を追加。両設計書とも1回のbuilder実行でまとめて実装した。

- **`openStampLevelUnlockModal(level)`→`(completedLevel, unlockedLevel)`にシグネチャ変更**: メインバッジ画像・レベル名表示（`${meta.emoji} ${t(meta.labelKey)}`）は`completedLevel`（チェックインしたスポット自身のレベル）のものを使用。新規`#stamp-level-unlock-subtext`要素（`public/index.html`、`#stamp-level-unlock-name`の直後）に、新しく解禁された`unlockedLevel`の情報を新規i18nキー`stampLevelUnlockSubtext`（「🔓 {level}のロックが解除されました」、`{level}`プレースホルダーを`.replace()`する既存パターン踏襲）で表示。呼び出し元`doStampCheckin()`は`openStampLevelUnlockModal(newlyUnlockedLevel)`→`openStampLevelUnlockModal(spot.level, newlyUnlockedLevel)`に変更（従来通りレベルが新しく解禁された場合のみモーダルを開く既存条件は無変更）
- **新規関数`_burstStampConfetti(originEl)`**: バッジ画像`<img>`要素を中心に50個の色つき紙片（6色、円形/四角形ランダム、`.stamp-confetti`要素をJS動的生成）を四方に飛び散らせ、CSS `@keyframes stampConfettiFly`で1.1秒かけてフェードアウトさせる軽量演出。外部ライブラリ不使用。前回分の残骸は毎回`querySelectorAll('.stamp-confetti')`で除去、生成した各要素は1400ms後に個別`remove()`（DOM蓄積防止）。`openStampLevelUnlockModal()`内、バッジ画像`<img>`生成直後に呼び出す
- **タイトルi18nキー値変更（`stampLevelUnlockModalTitle`）**: ja「新しいレベルが解禁されました！」→「スタンプ獲得！」、en「New level unlocked!」→「Stamp acquired!」（キー名は不変）
- **`_renderStampLevelRowComplete(meta, totalCount)`→`(meta, spotsInLevel, totalCount, level, lang)`にシグネチャ変更**（状態C、全制覇済みレベルの描画）: 呼び出し元`_renderStampCollectionList()`も対応する引数を渡すよう変更。バッジタイトルに`meta.emoji`を追加（例: 「🔰 新参者 制覇！」）。バッジ下に開閉トグルボタン（新規関数`_toggleStampCompleteList(listId)`、文言は新規i18nキー`stampCompleteListShow`「スポット一覧を見る ▾」⇔`stampCompleteListHide`「閉じる ▴」を`textContent`で動的差し替え）を追加し、タップで当該レベルの全スポット（すべて制覇済み）をコンパクトカード形式で一覧表示。**デフォルトは閉じた状態**（`style="display:none;"`、既存の「バッジのみ」の見た目を維持）
  - コンパクトカードは新規CSSクラス`.stamp-complete-card`系（状態Bの`.stamp-card`〈56pxサムネイル〉とは別クラス）で実装。サムネイル40px、説明文（`spot.description`）は表示せず名前・エリア・チェックイン日時のみ。「サムネイル左・テキスト右」のレイアウトは状態Bと共通。チェックイン日時取得は既存`_stampCheckinDateFor(spotId)`（設計書79）をそのまま再利用
  - 複数レベルが同時に全制覇済みになるケース（例: 新参者と定住レベルが同時に制覇済み）を考慮し、開閉状態の管理・コンテナID（`stamp-complete-list-${level}`）はレベルごとに一意。各レベルの開閉トグルは独立して動作する
- **`_renderStampMarkers()`は無変更**（地図上のピン表示は設計書108のスコープ外、状態Cになったスポットも含め解禁済みレベルのスポットは引き続き全て地図上にピン表示され続ける設計書83確立済みの既存挙動をそのまま維持）
- **i18n新規キー3個・既存キー値変更1個（いずれもja/en同時）**: `stampLevelUnlockModalTitle`（値変更、上記）・`stampLevelUnlockSubtext`（新規）・`stampCompleteListShow`（新規）・`stampCompleteListHide`（新規）
- `server.js`・データファイルは無変更（pm2 restart不要）。キャッシュバスティング: `index.html` app.css `?v=20260721h`→`20260721i`、app.js `?v=20260721r`→`20260721s`、`sw.js` CACHE_NAME=`sg-weekend-v660`→`v661`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機でのレベル解禁演出モーダル（紙吹雪含む）の見た目・アニメーション滑らかさ、全制覇バッジの開閉トグル動作・複数レベル同時全制覇時の独立開閉は2026-07-21時点でロジック単体検証のみ完了（本タスク実施環境のサンドボックス制約によりPlaywrightでの実ブラウザ確認ができなかったため）、実ブラウザ・実機とも未確認

### 全制覇バッジを横並びレイアウトに変更＋地図/一覧切り替えFABのアイコンを記号に変更（2026-07-21実装、設計書109）
設計書108で実装した全制覇バッジ（縦積み中央寄せ）について、ユーザーから「スタンプは左、タイトルは右の横並びにしたい」との要望。あわせて設計書94のFAB（地図/一覧切り替え）アイコンが「絵文字（🗺️/📖）だと＋ボタン時と統一感がない」との指摘を受け、記号（⇄）に統一した。

- **`.stamp-level-complete-badge`のレイアウト変更**（`public/app.css`）: `flex-direction:column;align-items:center;text-align:center;padding:32px 20px`から`display:flex;flex-wrap:wrap;align-items:center;gap:16px;text-align:left;padding:16px 18px`に変更。バッジ画像（`.stamp-level-complete-badge-img`）は**150px×150pxのサイズ据え置き**（ユーザー明示指示）、`flex-shrink:0`を追加し左側に固定配置
- **新規ラッパー`.stamp-level-complete-badge-body`**（`flex:1;min-width:0`）: タイトル・件数・トグルボタンの3要素をこのラッパーで包み右側に配置（`public/app.js`の`_renderStampLevelRowComplete()`のマークアップを対応するよう変更）。展開時のスポット一覧（`.stamp-complete-card-list`）はラッパーの外・バッジ全体の直接の子のまま`width:100%`を維持し、親`.stamp-level-complete-badge`が`flex-wrap:wrap`になったことで自動的にimg+bodyの行の下に折り返される（`margin-top`は`14px`→`0`に調整、バッジのgap/paddingで既に間隔が確保されるため）
- **FABアイコンの固定化**: `_applyStampViewMode()`（`public/app.js`）の`fabEl.textContent = isMap ? '📖' : '🗺️'`を`fabEl.textContent = '⇄'`に変更（状態に応じた出し分け自体を廃止）。`public/index.html`の`#course-fab`初期テキスト（設計書94で設定）も`🗺️`→`⇄`に変更
- スコープ外（今回未実装）: FABの表示/非表示ロジック（スタンプラリータブのみ表示、設計書94で確立済み）・全制覇バッジの開閉トグル機能自体のロジック（設計書108）はレイアウトのみの変更のため無変更
- `server.js`・データファイルは無変更（pm2 restart不要）。キャッシュバスティング: `index.html` app.css `?v=20260721i`→`20260721j`、app.js `?v=20260721s`→`20260721t`、`sw.js` CACHE_NAME=`sg-weekend-v661`→`v662`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機での横並びレイアウトの見た目バランス（バッジ画像150px＋テキストの折り返し具合）、FAB記号（⇄）の視認性・タップ精度は2026-07-21時点でロジック単体検証・配信ファイルの目視確認のみ完了、実ブラウザ・実機とも未確認

### レベルラベルに在住年数の目安を追記（極めし者はロック中マスク維持）（2026-07-21実装、設計書110）
各レベルラベル（新参者／定住レベル／シンガポール通／極めし者）に在住年数の目安を「レベル名（年数目安）」形式で併記した。`public/app.js`のみの変更。
- **`STAMP_LEVEL_META`に`yearRange`（ja）・`yearRangeEn`（en）フィールドを追加**: standard=`1〜2年`/`1-2 years`、local=`3〜4年`/`3-4 years`、niche=`5年以上`/`5+ years`、special=`10年以上`/`10+ years`。新規ヘルパー`_stampLevelYearRange(meta)`（`getLang()`で現在言語のフィールドを返す）を追加
- **併記した4箇所**: `_renderStampLevelRowInProgress()`（状態B、レベル見出し）・`_renderStampLevelRowComplete()`（状態C、全制覇バッジタイトル）・`openStampLevelUnlockModal()`（レベル解禁演出モーダルのレベル名）は無条件で年数を併記。`_renderStampLevelRowLocked()`（状態A、ロック中1行表示）は`hideLabel`引数が偽（ローカル/ニッチのロック中）のときのみ年数を併記し、`hideLabel`が真（**極めし者のロック中**、設計書105のマスキング方針）のときはレベル名同様に年数目安も一切表示せず「？？？」のみ表示する
- **変更していない箇所（スコープ外、設計書で明記済み）**: スポット詳細モーダルのレベルバッジ（`openStampSpotDetail()`）はUIスペースの制約上、年数を追加していない
- `server.js`・データファイル・`public/index.html`（キャッシュバスティング以外）・`public/app.css`は無変更（pm2 restart不要）。キャッシュバスティング: `index.html` app.js `?v=20260721t`→`20260721u`、`sw.js` CACHE_NAME=`sg-weekend-v662`→`v663`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機での「レベル名（年数目安）」表記の見た目（文字数増加によるレイアウト崩れの有無）、極めし者ロック中の「？？？」表示に年数が一切混入していないことの実機確認は2026-07-21時点でロジック単体検証のみ完了、実ブラウザ・実機とも未確認

### レベル進捗バーの視認性強化（2026-07-21実装、設計書111）
状態B（解禁中・未全制覇）のレベル見出し下に表示される進捗バー（`.stamp-level-progress-row`系）が地味という指摘を受け、`public/app.css`のみを変更した。
- `.stamp-level-progress-track`: 高さ6px→12px、`border:1px solid var(--sand-dark)`を追加
- `.stamp-level-progress-fill`: グラデーション終端色を`var(--caramel-light)`→`var(--caramel)`に変更（設計書は`--caramel-dark`という未定義変数を指定していたため、既存の色変数体系に存在する`--caramel`〈濃色側〉に置き換えた。`--caramel-light`〈明色〉/`--caramel`〈濃色〉のペアのみが定義されており`--caramel-dark`は存在しない）、`box-shadow: inset 0 1px 2px rgba(255,255,255,0.3)`を追加
- `.stamp-level-progress-label`: `font-size`11px→13px、`font-weight`700→900、`color`を`var(--warm-gray)`→`var(--caramel)`に変更（同上の理由で`--caramel-dark`から置き換え）
- `public/app.js`・`server.js`・データファイルは無変更（HTML生成ロジック無変更、pm2 restart不要）
- キャッシュバスティング: `index.html` app.css `?v=20260721j`→`20260721k`、`sw.js` CACHE_NAME=`sg-weekend-v663`→`v664`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機での太さ・色・枠線変更後の視認性向上効果、ダークモード時の見た目は2026-07-21時点でコード確認のみ完了、実ブラウザ・実機とも未確認

### 年数ラベルに「目安」の接頭辞を追加（2026-07-21実装、設計書112）
設計書110で追加したレベルラベルの年数表示（例:「新参者（1〜2年）」）が厳密な必須条件のように読めてしまう懸念があったため、「目安」（英語は"approx."）を接頭辞として追加した。
- `_stampLevelYearRange(meta)`ヘルパー関数（`public/app.js`）の戻り値のみ変更: `getLang()==='ja'`のとき`目安${meta.yearRange}`、それ以外は`approx. ${meta.yearRangeEn}`を返す。表示は「新参者（目安1〜2年）」のようになる
- この関数を呼ぶ4箇所（`_renderStampLevelRowLocked()`・`_renderStampLevelRowInProgress()`・`_renderStampLevelRowComplete()`・`openStampLevelUnlockModal()`）は無変更（関数1つを直すだけで全箇所に自動反映される設計）
- `yearRange`/`yearRangeEn`の値自体（1〜2年等）は変更なし。`server.js`・データファイル・`public/app.css`は無変更（pm2 restart不要）
- キャッシュバスティング: `index.html` app.js `?v=20260721u`→`20260721v`、`sw.js` CACHE_NAME=`sg-weekend-v664`→`v665`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機での「目安」接頭辞追加後の見た目・文字数増加によるレイアウト崩れの有無は2026-07-21時点でコード確認・curlでの本番配信反映確認のみ完了、実ブラウザ・実機とも未確認

### 「新参者」を「見習い」に変更＋年数表記に「在住」を追加（2026-07-22実装、設計書113）
「新参者」がバカにしている感じに聞こえるとの指摘を受け、「見習い」（職人の世界の「見習い→一人前」という伝統的な対の言葉）に変更した。定住レベル等は変更なし。あわせて年数目安の表記に「在住」を追加した。
- `stampLevelStandard`（`public/app.js` STRINGS.ja/en）: ja「新参者」→「見習い」、en「Newcomer」→「Apprentice」。`stampLevelLocal`・`stampLevelNiche`・`stampLevelSpecial`は変更なし
- `_stampLevelYearRange(meta)`ヘルパー関数の戻り値を`目安${meta.yearRange}`→`目安：在住${meta.yearRange}`、`approx. ${meta.yearRangeEn}`→`approx. ${meta.yearRangeEn} in Singapore`に変更。表示は「見習い（目安：在住1〜2年）」のようになる。呼び出し元4箇所は無変更（関数1つの変更で全箇所に自動反映）
- `public/index.html`にデフォルト直書きテキストは存在せず対応不要（grep確認済み）。`yearRange`/`yearRangeEn`の値自体は変更なし。`server.js`・データファイル・`public/app.css`は無変更（pm2 restart不要）
- キャッシュバスティング: `index.html` app.js `?v=20260721v`→`20260722a`、`sw.js` CACHE_NAME=`sg-weekend-v665`→`v666`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機での「見習い」「在住」表記追加後の見た目・文字数増加によるレイアウト崩れの有無は2026-07-22時点でコード確認・curlでのローカル配信反映確認のみ完了、実ブラウザ・実機とも未確認

### タブラベル「スタンプラリー」を「探訪スタンプ帳」に変更（2026-07-22実装、設計書115）
ネーミングブレストで「探訪＝証、スタンプ＝集める行為、帳＝冊子」を全部乗せした「探訪スタンプ帳」に確定。既存のナビラベル「探訪」（`navCourse`、設計書89・91）・画面共通見出し「シンガポール探訪」（`courseScreenTitle`、設計書89）とトーンを合わせつつ、タブ単体としての「スタンプ」の具体性も残す狙い。
- `public/app.js`の`STRINGS.ja`/`STRINGS.en`内`courseTabStampMap`の値のみ変更: ja「スタンプラリー」→「探訪スタンプ帳」、en「Stamp Rally」→「Discovery Stamp Book」
- `stampMapLoginRequired`の値のみ変更（文中の呼称を置換）: ja「スタンプラリーの進捗を記録するには、アカウント連携が必要です。設定画面から連携してください。」→「探訪スタンプ帳の進捗を記録するには、アカウント連携が必要です。設定画面から連携してください。」、en「To save your stamp rally progress, please link your account from Settings.」→「To save your progress in the Discovery Stamp Book, please link your account from Settings.」
- `public/index.html`のデフォルト直書きテキスト2箇所（148行目`data-i18n="courseTabStampMap"`・165行目`data-i18n="stampMapLoginRequired"`）も同時変更。いずれもキー名は不変
- コード内コメント（「スタンプラリー機能」等の開発者向け注記）・変数名・関数名・CSSクラス名（`stamp*`プレフィックス等）・データファイルは対象外、無変更。`courseScreenTitle`（「シンガポール探訪」）・`navCourse`（「探訪」）・`courseTabEveryone`（「モデルコース」）・`courseTabMylist`（非表示中）も対象外
- `server.js`・データファイルは無変更（pm2 restart不要）
- キャッシュバスティング: `index.html` app.js `?v=20260722b`→`20260722c`、`sw.js` CACHE_NAME=`sg-weekend-v667`→`v668`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機での新タブラベル・案内文の見た目、文字数増加によるレイアウト崩れの有無は2026-07-22時点でコード確認・`node --check`のみ完了、実ブラウザ・実機とも未確認

## 広告表示機能フェーズ1: Klookアフィリエイトリンク（2026-07-13実装 → 同日設計書32でバックエンド埋め込み処理を一時停止）
- コースのスポットに、Klookアフィリエイトプログラム（AID: 127020、サイト名 "Odekake Navi"）経由の予約リンクを条件付きで表示する機能。フェーズ2（PRカード）は下記セクション参照（2026-07-13実装済み）
- ⚠️ **2026-07-13時点、稼働停止中（設計書32）**: ユーザー最終指示「裏側のロジックは消さなくていいけど止めてください」により、`GET /api/courses`（community/popularタブ）が`embedAffiliateLinks()`を呼ぶ処理・`loadAffiliateLinks(city)`を呼ぶ処理を停止した。レスポンスに`affiliateLink`フィールドが含まれなくなり、`public/app.js`側の既存の条件分岐（`s.affiliateLink ? ... : ''`）が自然に「リンクなし」側を通るため、フロントエンド無変更のままUI上「チケット情報」リンクは表示されなくなっている
- **データモデル**: `data/sg/affiliate-links.json`（スポット名をキーにしたマッピング。`{provider, url, title, updatedAt, confirmedBy}`）。**削除していない**。コースJSON本体（`model-courses.json`/`community-courses.json`）は無変更、疎結合の別ファイル方式のためコース再生成後も同名スポットならリンクが維持される
- **紐付けスクリプト**: `node scripts/match-affiliate-links.js [--dry-run]`。**削除していない**、実行自体は今も可能（`data/sg/affiliate-links.json`を更新するだけで、レスポンスへの反映は停止中のため実害なし）。全コースのユニークスポット名と`data/klook-catalog-sg.csv`（Klookアフィリエイトダッシュボードからエクスポートした商品カタログ、238件）を突き合わせる半自動フロー。マッチングはCSVの`Affiliate Link`列内`k_site`パラメータをデコードして得た英語スラッグとスポット名を単語単位でスコアリングする方式（日本語`Product Name`は確認表示用のみ）。**インクリメンタル実行**: 既存`affiliate-links.json`に登録済みのスポットは対象外。対話形式（番号選択で確定/Enterでスキップ/qで中断）で人力確認したもののみ書き込む。全自動マッチングは行わない（誤紐付けリスクのため）
- **サーバー**: `loadAffiliateLinks(city)`/`embedAffiliateLinks()`（server.js 1650行目付近）は**関数定義として残置**しているが、`GET /api/courses`（community/popularタブ）からの呼び出しはコメントアウトして停止中（設計書32）。復活させる場合は、この2箇所の呼び出しコメントアウトを解除するだけでよい。新規`POST /api/affiliate-click`（`{spotName,provider,courseId,city}`、`withFileLock`で`data/affiliate-clicks.json`へ追記、認証なしfire-and-forget）は**エンドポイントとして引き続き稼働中**（呼び出し元のUIが無くなっただけでAPI自体は生きている）
- **UI**: ボタンではなく、`course-timeline-meta`（住所表示）に地味なテキストリンク「チケット情報」（`affiliateInfoLink`キー）として住所と同じ行に併記する設計だった。目立つカラーボタン・アイコン・購入を煽る文言は不使用（「広告と結びつけたくない・さりげなく見せたい」というユーザー方針）。`renderCourseDetail()`と`renderCourseResultHtml()`（生成直後プレビュー）の両方に同じロジックが残っている（**コード自体は無変更・削除していない**、バックエンドが`affiliateLink`を返さなくなったことで自然に表示されなくなっているだけ）
- `openAffiliateLink(url, provider, spotName)`: **関数定義は残置**（呼び出し元のリンクが表示されなくなったため実質未使用だが削除していない）。Capacitor環境は`Browser.open()`、Web環境は`window.open()`。開いた後`POST /api/affiliate-click`をfire-and-forget送信。既存の`_touchCapableDetected`ガードパターンを踏襲
- コース生成AI（`generate-model-courses.js`・`POST /api/courses/generate`・`POST /api/courses/candidates`）には広告目的の変更は一切加えていない（設計書27〈営業時間・実在性の品質改善〉による変更は別件、無関係）。広告要素とコース生成ロジックは意図的に分離（ユーザー明確な方針）
- 運用: `data/sg/affiliate-links.json`は2026-07-13時点で2件のみ登録（Gardens by the Bay – Supertree Grove、National Orchid Garden）。停止中のため今後`match-affiliate-links.js`を実行してデータを拡充してもUIには反映されない（復活時に備えたデータ蓄積は可能）
- `data/affiliate-clicks.json`はサイズ上限・ローテーションなし（`_sendDebugLog`と同様の既知の注意点、定期確認が必要）。エンドポイント自体は稼働中のため、直接叩かれれば引き続き追記され得る

### スタンプスポット詳細モーダルへのKlookチケットリンク追加（2026-07-22実装、設計書114）
上記フェーズ1（コース機能向け）のアフィリエイトリンク基盤（`data/sg/affiliate-links.json`・`loadAffiliateLinks()`・`openAffiliateLink()`）は現状コース機能側の埋め込み呼び出しのみ停止中（設計書32）だが、これとは独立してスタンプラリー機能のスポット詳細モーダルに新規にチケットリンクを追加した。コース側の停止状態には一切触れていない。
- **サーバー**: `GET /api/stamp-spots`のレスポンス構築時、`loadAffiliateLinks(city)`（既存関数、無変更で再利用）を呼び出し、`visibleSpots`計算の`map`内で**解禁済み（マスクされていない）スポットのみ**に対し`spot.name`をキーに検索、ヒットすれば`affiliateLink`フィールド（URLのみ）を追加する。ロック中スポットは`maskLockedStampSpot()`で`name`が「？？？」に置換済みのため検索してもヒットせず、追加の判定なしで自然に除外される。コース機能向けの`embedAffiliateLinks()`（配列ネスト構造向け）は今回のフラットなスポット配列には構造が合わないため使い回さず、`map`内で個別にシンプルな分岐を実装した（`embedAffiliateLinks()`自体は無変更のまま残置）
- **フロントエンド**: `public/index.html`の`#stamp-spot-detail-sheet`、`#stamp-spot-detail-desc`（説明文）の直後・`#stamp-spot-detail-checked`（制覇済みバッジ）の手前に新規`#stamp-spot-detail-ticket-link`を追加。見た目は既存のコース機能「チケット情報」リンク（`course-timeline-meta`内の`<a>`）と統一（`color:var(--caramel);text-decoration:underline;cursor:pointer;font-size:12px`程度、ボタン・バッジ・アイコン装飾なし）。i18nキーは既存の`affiliateInfoLink`（ja「チケット情報」/en「Ticket info」）をそのまま再利用、新規キーは追加していない
- `public/app.js`の`openStampSpotDetail(spotId)`内、imgContainer処理の直後に、`spot.affiliateLink`の有無で表示切替＋`.onclick`プロパティ代入（`() => openAffiliateLink(spot.affiliateLink, 'klook', spot.name)`）を追加。URLに含まれる可能性のある特殊文字のエスケープ問題を避けるため、コース機能のようなHTML文字列内`onclick`属性埋め込みではなく`.onclick`プロパティ代入方式を採用。**`_touchCapableDetected`ガードは付与していない**（このプロジェクトで複数回発生した「ガードのみ付与しtouchendハンドラ追加を忘れてタップ不能になる」既知アンチパターン〈設計書84・99〉を踏まえ、コース機能の既存パターンに倣いガードなしのシンプルなonclickにした）。`openAffiliateLink(url, provider, spotName)`は既存関数を無変更で再利用（Capacitor/Web分岐・`POST /api/affiliate-click`計測込み）
- **データ拡充スクリプト**: `scripts/match-affiliate-links.js`に`STAMP_SPOTS_PATH`定数（`data/sg/stamp-spots.json`）を追加し、`loadUniqueSpotNames()`の名前収集対象にスタンプスポットの`name`も含めるよう1箇所拡張した（既存の対話フロー・書き込み形式・コース側ロジックは無変更）。既存3件の登録済みリンクのうち`Bedok Reservoir Park`は今回追加済みの定住レベル（local）スタンプスポットと同名のため、コード実装のみで即座にマッチ対象になる（ただし`local`は未解禁時はマスクされ`affiliateLink`は付与されない、解禁済みユーザーにのみ表示）
- `data/sg/affiliate-links.json`への実データ追記（`match-affiliate-links.js`の対話実行によるKlookカタログとの半自動マッチング）は本タスクのスコープ外。ユーザーが別途直接実行する運用
- スコープ外: コース機能側の`embedAffiliateLinks()`呼び出し停止状態（設計書32）の解除、ロック中スポットへのチケットリンク表示（サーバー側で自然に除外される設計のためフロント側の追加判定は不要）、クリック計測ロジックの変更（既存`POST /api/affiliate-click`をそのまま再利用）
- `server.js`の変更を伴うため`pm2 restart`実施済み。curlでの動作確認済み: 解禁済み`standard`レベルの`Gardens by the Bay – Supertree Grove`は`affiliateLink`付与、未解禁`local`レベルの`Bedok Reservoir Park`（`unlockedLevels: ['standard']`の状態）はマスクされ`affiliateLink`なしを確認
- キャッシュバスティング: `index.html` app.js `?v=20260722a`→`20260722b`（`app.css`は無変更のため据え置き）、`sw.js` CACHE_NAME=`sg-weekend-v666`→`v667`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機でのチケットリンクの見た目・タップ後のリンク遷移・クリック計測の実際の動作は2026-07-22時点でcurlによるAPI疎通確認のみ完了、実ブラウザ・実機とも未確認。設計書69〜113自体もまだTestFlightビルド未実施のため、本追加も含めて次回一括リリースの想定

### 「探訪」「予定表」画面をアカウント連携必須にする（ぼかし＋設定誘導オーバーレイ）（2026-07-22実装、設計書116）
ユーザーから「探訪と予定表の機能を使うにはまるっとアカウント連携が必要、という作りにしようかな。画面をぼかして、設定のアカウント連携に誘導する」との提案があり、AskUserQuestionで範囲を確認（探訪は2タブとも全ブロック、予定表も全ブロック・既存の匿名ローカルデータが見えなくなることも許容）した上でユーザー承認済み。

- **実装方式**: コンテンツ側に直接blurを掛けず、`.screen`内に新規オーバーレイ要素（`position:absolute;inset:0`）を1枚重ね、そのオーバーレイ自体に`backdrop-filter:blur(8px)`＋半透明背景（`rgba(255,253,249,0.55)`）を適用する方式。ヘッダー・タブバー・コンテンツを問わず画面全体が一括でぼける（個々のコンテンツ要素〈Leaflet地図等〉の内部状態に触れない低リスクな実装）
- **HTML**（`public/index.html`）: `#screen-course`内`.screen-content`直後（`#course-fab`の手前）に`#course-auth-gate`、`#screen-plan`内`.screen-scroll-content`直後に`#plan-auth-gate`を追加。両方とも`class="screen-auth-gate"`・初期`display:none`、中身は共通構造（アイコン🔒＋メッセージ〈新規i18nキー`authGateMessage`〉＋ボタン〈新規i18nキー`authGateBtn`、`onclick="goToAccountLinking()"`〉）
- **CSS**（`public/app.css`）: `.screen-auth-gate`（`position:absolute;inset:0;z-index:250`＝FAB(200)より上・bottom-nav(9999)や各種モーダル(3000番台)より下、`backdrop-filter:blur(8px)`＋`rgba(255,253,249,0.55)`背景）・`.screen-auth-gate-card`/`-icon`/`-msg`/`-btn`の新規クラスと、`#screen-course, #screen-plan { position: relative; }`（オーバーレイの`absolute`配置の基準にするため）を追加。ダークモードは既存CSS変数（`--midnight`/`--caramel`）の自動追従に依存。**背景色の`rgba`値自体はライト固定で追加時はダーク時未対応だったが、2026-07-22設計書117で`html[data-theme="dark"] .screen-auth-gate { background: rgba(23, 17, 13, 0.6); }`（`--warm-white`のダークモード値`#17110D`相当の固定rgba）を追加し対応済み（下記参照）**
- **JS**（`public/app.js`）: 新規関数`_applyScreenAuthGate(screenKey)`（`document.getElementById('${screenKey}-auth-gate')`の表示切替、`getAuthToken()`が無ければ`display:flex`にしtrueを返す）・`goToAccountLinking()`（`switchNav('settings')`後、`setTimeout`100ms遅延で`#login-section-logged-out`〈既存の未ログイン時表示ブロック、設計書64のアカウントセクション内〉へ`scrollIntoView({behavior:'smooth', block:'center'})`）を追加。`switchNav()`の`screen==='plan'`・`screen==='course'`各分岐末尾に呼び出しを追記し、gated（未ログイン）時はplan画面の`fab-plan-group`・course画面の`#course-fab`（設計書94で地図/一覧切り替えに転用済み）も追加で非表示にする
- **既存ロジックには一切手を加えていない**: `initCourseScreen()`・`renderScheduleTab()`・`#stamp-map-login-required`（探訪スタンプ帳タブ単体の従来ログイン誘導、設計書69）はいずれも無変更のまま裏側で動き続ける。ゲート判定は画面全体に後乗せするオーバーレイのみで、既存のデータ読み込み・タブ切り替えロジックの複雑な内部状態（Leaflet地図初期化タイミング等）には触れない安全側の実装判断
- i18n新規キー（ja/en同時）: `authGateMessage`（この機能を使うにはアカウント連携が必要です/Please link your account to use this feature）・`authGateBtn`（設定で連携する/Link Account in Settings）
- スコープ外: ホーム画面・設定画面（無変更）、予定表画面の共有カレンダー機能（パスフレーズ方式）も「予定表全体」の指示のためまとめてブロック対象に含む（個別除外なし）、ログイン状態のリアルタイム反映（同一画面滞在中に裏で連携完了した場合の即時解除。画面遷移〈`switchNav`〉のたびに再評価される設計のため、設定画面から連携後にナビで戻れば解除される）
- `server.js`・データファイルは無変更のため`pm2 restart`不要（未実施）。キャッシュバスティング: `index.html` app.css `?v=20260721k`→`20260722a`、app.js `?v=20260722c`→`20260722d`、`sw.js` CACHE_NAME=`sg-weekend-v668`→`v669`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機でのぼかし演出の見た目・タップ後のスクロール挙動・ダークモード時の背景色視認性は2026-07-22時点でcurl＋コード読解による整合性確認のみ完了、実ブラウザ・実機とも未確認

### アカウント連携ゲートオーバーレイのダークモード背景色を修正（2026-07-22実装、設計書117）
設計書116で追加した`.screen-auth-gate`の背景色`rgba(255, 253, 249, 0.55)`がCSS変数を使わないハードコード値になっており、ダークモード時にもライトモードの明るいクリーム色の半透明背景がそのまま使われ、`.screen-auth-gate-msg`（`color:var(--midnight)`でダークモード自動追従）と見た目が不整合になっていた問題をメインエージェントがセルフレビューで発見・修正。
- `public/app.css`の`html[data-theme="dark"]`ブロック内（`color-scheme: dark;`直後）に`html[data-theme="dark"] .screen-auth-gate { background: rgba(23, 17, 13, 0.6); }`を追加。`--warm-white`のダークモード値`#17110D`に相当する固定rgbaを直接指定、既存の要素別上書きパターン（`html[data-theme="dark"] .spot-card, ...`等）に倣った
- `.screen-auth-gate-card`/`-icon`/`-msg`/`-btn`・JS・HTML・i18nはスコープ外で無変更
- `server.js`・データファイルは無変更のため`pm2 restart`不要（未実施）。キャッシュバスティング: `index.html` app.css `?v=20260722a`→`20260722b`（app.jsは無変更のため据え置き）、`sw.js` CACHE_NAME=`sg-weekend-v669`→`v670`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機でのダークモード時の見た目は2026-07-22時点でcurlによる配信内容確認のみ完了、実ブラウザ・実機とも未確認

## 広告表示機能フェーズ2: PRカード（スポンサー広告枠）（2026-07-13実装、設計書29 → 2026-07-16設計書47でテストデータ削除・非表示化）
- イベント一覧に、Klookアフィリエイトとは別枠のスポンサー広告カード（PRカード）を条件付きで1件差し込む機能。設計書23フェーズ2の元設計を、plannerが現在の行番号ベースで再検証・確定した内容
- ⚠️ **2026-07-16時点、非表示（テストデータ削除済み・設計書47）**: 広告掲載準備が整うまでの一時停止として、`data/sg/sponsored-cards.json`のテスト用ダミー2件（`sponsor_test_001`・`sponsor_test_002`）を削除し**空配列`[]`**にした。`_pickSponsoredCardForToday([])`が`null`を返すため`splice`されず、DOM分岐も通らずPRカードは表示されない。**コード（`_pickSponsoredCardForToday()`/`renderSponsoredCard()`/`__sponsored`分岐/`GET /api/sponsored-cards`）は一切無変更・残置**。再開は`sponsored-cards.json`に本番掲載データ（`active:true`・有効期間内）を追記するだけ（`pm2 restart`不要、`data/`は都度readFileSync）
- **データモデル**: `data/{city}/sponsored-cards.json`（配列。`data/`はgitignore対象）。各要素: `id`/`sponsorName`/`title`/`content`/`imageUrl`/`url`/`category`（`event/show/gourmet/opening/sale`のいずれか、または`null`=全カテゴリ共通枠）/`startDate`/`endDate`/`priority`（現状未使用、将来の重み付け抽選用に温存）/`active`。**本番運用時は空配列`[]`が正常状態**（2026-07-13実装完了時点でテストデータは削除済み、掲載する広告主が決まり次第人力で追記する運用）
- **サーバー**: `GET /api/sponsored-cards?city=sg`（`server.js`、`GET /api/events`の直後）。ファイル不存在時は空配列を返す（エラーにしない）。既存`GET /api/events`は無変更
- **選択ロジック**（`public/app.js`）: `_pickSponsoredCardForToday(cards)`が、有効期間（`startDate`/`endDate`）・`active`・`_matchesCurrentCategory()`（`category`がnullなら常時対象、値ありなら`filterCats`一致時のみ対象）で候補を絞り込み、当日日付をシードにした`候補配列[seed % length]`で日替わり固定選択する（リロードのたびに変わらない）
- **表示**: `renderEventCards()`内、フィルタ・ソート確定後に、選ばれたPRカードを`filtered`配列の4番目あたり（0-indexed 3）に`{__sponsored:true, card}`マーカーとして挿入し、DOM構築ループ内で`renderSponsoredCard()`から生成した専用DOM要素（`_sponsoredCardTmpContainer`使い回し）を差し込む。`renderEventCard()`本体・`GET /api/events`・設計書21の`_cardElCache`（イベントIDベースのDOM差分キャッシュ）とは完全に別系統・無関係のデータソースとして分離実装（意図的に混在させない設計）
- **おすすめモード中は非表示**（ユーザー承認済み方針）: `_recommendModeActive`が`true`の間は`_pickSponsoredCardForToday()`の呼び出し自体をスキップする
- **見た目**: `spot-card`ベース、左上に半透明黒背景の「PR」バッジ（`prBadgeLabel`キー、ja/en共に"PR"）。タップでスポンサー先`url`を開く（`openSponsoredCardLink()`、フェーズ1の`openAffiliateLink()`と同じ`_isCapacitorApp`分岐: Capacitor環境は`Browser.open()`、Web環境は`window.open()`）
- コース生成AI・アフィリエイトリンク機能（フェーズ1）には一切手を加えていない。両フェーズとも広告要素とコース/イベント生成ロジックは意図的に分離
- スコープ外（今回未実装）: PRカードのクリック計測（フェーズ1の`POST /api/affiliate-click`相当の仕組み）、`priority`フィールドを使った複数カード同時掲載・重み付け抽選、広告主向け管理画面・入稿フロー（`sponsored-cards.json`の直接編集が現状唯一の運用手段）

## 広告表示機能: Klookアフィリエイトウィジェット試験導入（2026-07-13実装、設計書30 → 同日設計書31で表示改善 → 2026-07-16設計書47で一時非表示化）
- フェーズ1（アフィリエイトリンク）・フェーズ2（自前PRカード、`sponsored-cards.json`）とは別に、ユーザーが「Klookアフィリエイトダッシュボードで生成した公式アクティビティバナーウィジェットをそのまま埋め込みたい」と方針転換したことを受けて追加した軽量な試験導入。複数スポンサーのローテーション・カテゴリ一致判定・クリック計測などのフル実装は行っていない
- ⚠️ **2026-07-16時点、非表示（マーカー挿入停止・設計書47）**: 広告掲載準備が整うまでの一時停止として、`renderEventCards()`内のKlookマーカー挿入`splice`（`if (!_recommendModeActive && filtered.length > 0) { ... filtered.splice(klookInsertAt, 0, { __klookWidget: true }); }`、1672-1675行付近）を**コメントアウト**した。`__klookWidget`が`filtered`に入らずDOM構築ループの`if (e && e.__klookWidget)`分岐が通らないため表示されない。**`_createKlookWidgetEl()`関数定義・DOM構築ループ側の分岐・`loadEventData()`のリセット処理（`_klookWidgetInserted`/`_klookWidgetEl`）は一切無変更・残置**。再開は該当コメントアウトを解除するだけ（Web版は配信＋キャッシュバスティング、iOS版は再ビルドが必要）
- **実装**: `public/app.js`の`_createKlookWidgetEl()`関数が、Klook公式ダッシュボードが発行した埋め込みコード（`<ins class="klk-aff-widget" data-wid="127020" data-adid="1337601" data-actids="117,127,119" data-prod="mul_act" data-price="true" data-width="336" data-height="280" data-currency="SGD">` + `https://affiliate.klook.com/widget/fetch-iframe-init.js`を読み込む`<script>`）をそのまま`document.createElement`で動的生成し、`.klook-widget-card`（他のイベントカードと揃えた角丸・背景白・影のラッパー、`public/app.css`）の中に「PR」ラベル（`.klook-widget-card__label`、既存i18nキー`prBadgeLabel`を再利用）と共に格納する（設計書31、2026-07-13）
- **見た目の方針（設計書31）**: `.spot-card`クラス自体は付与しない独立クラス（`fadeUp`アニメーション・`:active`時の`transform`等、iframeを含む要素に適用したくない既存ルールが多数付いているため）。目立つカラーボタン等は使わず、「PR」ラベルは11px・warm-gray色の控えめな表示に留める
- **挿入位置・再利用方式（設計書31で最下部固定から変更）**: 設計書29のPRカード（自前PRカード）と同じ`filtered`配列への`splice`挿入パターンを転用し、新規マーカーキー`__klookWidget`を`Math.min(7, filtered.length)`（8番目あたり、カードの間）に差し込む。「1回だけ生成し使い回す」方式（`_klookWidgetEl`にDOM要素を保持し、以降は`insertBefore`で位置移動のみ、再生成しない）でiframeの意図しない再読み込みを防止。おすすめモード中（`_recommendModeActive`）はマーカー挿入自体をスキップし非表示（PRカードと同じ方針）。表示されない回は`display:none`にするのみでDOM/iframeは破棄しない
- `loadEventData()`（都市切替・再フェッチ時の`grid.innerHTML`再代入）で`_klookWidgetInserted`フラグ・`_klookWidgetEl`変数を`_cardElCache.clear()`と同じ箇所でリセットする（リセットしないと都市切替後にウィジェットが二度と表示されなくなるバグがあったため設計書31で修正済み）
- **フェーズ2との共存**: フェーズ2の`renderSponsoredCard()`/`_matchesCurrentCategory()`/`_pickSponsoredCardForToday()`/`openSponsoredCardLink()`は無変更のまま共存。`data/sg/sponsored-cards.json`が空配列のままなら実害なし。今回は両方式（自前PRカード＋Klook公式ウィジェット）が同時に有効な状態。両者の同時表示時の間隔調整は2026-07-13時点で未実施（ユーザー判断により、`sponsored-cards.json`に実データが入る段階で改めて調整する方針）
- `_isCapacitorApp`による分岐は実装していない（ウィジェット自体のリンク処理はKlook側のiframe内で完結する想定のため独自クリックハンドラは追加せず）。**iOS版（Capacitor/TestFlight）でのカード風の見た目・PRラベル・カード間差し込み位置・iframe内リンクタップの挙動は2026-07-13時点で未検証**
- スコープ外（今回未実装）: 複数スポンサーのローテーション、日替わり選択ロジック、カテゴリ一致判定、クリック計測、ウィジェット表示位置の詳細カスタマイズ（Klook側テンプレートの見た目自体はダッシュボード側の設定に依存）

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
- **iOS版（Capacitor）**: `ios-app/package.json`に`@codetrix-studio/capacitor-google-auth@^3.4.0-rc.4`を追加（**注意**: 同パッケージの安定版3.3.6系はpeerDependencyが`@capacitor/core@^5.0.0`でCapacitor 6非対応。Capacitor 6に正式対応しているのは`3.4.0-rc.1`以降のプレリリース版のみで、`latest`npmタグも`3.4.0-rc.4`を指している。今後関連パッケージのバージョンを見直す際は必ず`npm view <pkg> peerDependencies`でCapacitorバージョンとの整合を確認すること）。`ios-app/capacitor.config.js`に`GoogleAuth`プラグイン設定（`scopes:['openid']`、`iosClientId`は2026-07-15にGoogle Cloud Console発行の実値`928776929755-ne2tlcmg60esqkgfb1uiuujgh7k13bh4.apps.googleusercontent.com`へ設定済み）を追加。**この`scopes:['openid']`設定コメント「email/profileは要求しない」は事実と異なる可能性がある（2026-07-15設計書39）**: ネイティブGoogle Sign-In SDKもWeb版と同根の「サインインスコープはバンドル」制約が及ぶ可能性が高いと推測されるが、iOS実機での同意画面表示内容は2026-07-15時点で未検証。次回TestFlightビルド時に実機確認が必要
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
  - Google Cloud ConsoleでのOAuthクライアントID（Web用・iOS用の両方）実発行はユーザーが完了済み（iOS用: `928776929755-ne2tlcmg60esqkgfb1uiuujgh7k13bh4.apps.googleusercontent.com`）。`.env`のWeb用クライアントIDの実値設定状況は要確認。実際のGoogleログインのエンドツーエンド動作（特にiOS版）は次回TestFlightビルドでの実機確認が必要
- **2026-07-15修正（設計書38）**: 「Googleでログイン」「ログアウト」ボタンがタッチ操作（スマホ・タブレット）で反応しない不具合を修正。CLAUDE.md下記「onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック」節のパターンのうち、touchend側の登録が新規ボタン`#google-login-btn`/`#logout-btn`にのみ漏れていたのが原因。既存の設定画面touchendハンドラ（`public/app.js`）に2行追加して解消済み
- **2026-07-15訂正（設計書39、コード変更なし・ドキュメント訂正のみ）**: 実機でGoogleの同意画面を確認した結果、「scopeは`openid`のみ要求し`email`・`profile`スコープは要求しない」という当初記述（上記「認証情報最小化方針」節）が誤りだったと判明。Google Identity Servicesの仕様上、「Sign In With Google」機能を使う限り同意画面への`email`・`profile`スコープのアクセス許可表示は技術的に回避不可能（`google.accounts.id.initialize()`に`scope`パラメータ自体が存在せず、より低レベルのAPIに切り替えても「サインインスコープ（openid, email, profile）はバンドル」という仕様上の制約が及ぶため）。ユーザーに説明したところ「しょうがないね。個人情報は当面持ちたくないです」との回答を得て、方針を「（Googleに）取得させない」から「（サーバー側で）保存・利用しない」に転換した（サーバー側は`sub`のみ保存する実装を維持、コード変更は不要）。Apple Sign-In（未実装）はGoogleと異なり`email`・`fullName`スコープを個別に許可/拒否でき、`email`は実アドレス共有かAppleプライベートリレーかを選択できる、という認識があるが、これは一次情報（Apple公式ドキュメント）で確認済みの事実ではなく、Apple Sign-In実装着手時に必ず再確認が必要な未検証事項。詳細は`.claude/plan.md`「設計書39」参照
- **2026-07-15修正（設計書40）: Web版GoogleログインボタンをrenderButton方式に変更（One Tap再表示不可問題の修正）**。「一度ログイン→ログアウトすると、リロードせずに再度ボタンを押しても反応しなくなる」不具合を修正。原因はGoogle One Tap（`google.accounts.id.prompt()`）の仕様で、一度サインインに成功するとページリロードまで内部的に抑制状態が残り、再度`prompt()`を呼んでも表示されなくなるため（Google公式ドキュメント記載の意図的な仕様）。Google公式の推奨解決策である`google.accounts.id.renderButton()`（クリックのたびに確実にポップアップが起動する恒久的なボタン）に切り替えた
  - `public/index.html`: 自前デザインの`<button id="google-login-btn">`を空のコンテナ`<div id="google-login-btn-container">`に置き換え。ボタンの見た目・ラベルはGoogle側が描画するため、既存デザインへの完全一致は不可（許容済み）。`data-i18n="loginWithGoogle"`キー・翻訳文字列自体は死にキーとして残置（削除しない）
  - `public/app.js`: `_handleGoogleLoginWeb()`（`prompt()`呼び出し）を`_initGoogleButtonWeb()`（`renderButton()`呼び出し、`container.dataset.rendered`で多重描画防止）に置き換え。アプリ起動時の初期化フロー内で、GIS SDK（`<script async>`）のロード完了を最大20回×300msリトライで待ってから一度だけ呼ぶ。`handleGoogleLoginClick()`はiOS版分岐（`_handleGoogleLoginIOS()`）のみが残り、Web版では何もしない（ボタンクリック自体をGoogleが処理するため）
  - 設定画面のtouchendガード一覧（`public/app.js`、「onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック」節参照）から`#google-login-btn`の行を削除（IDごとDOM上から消えたため）。`#logout-btn`側は変更なし
  - **`disableAutoSelect()`追加**: `handleLogoutClick()`に`window.google?.accounts?.id?.disableAutoSelect?.()`を追加。GIS未ロード時・iOS環境実行時もオプショナルチェイニングでエラーにならない
  - `renderButton()`オプション: `type:'standard'` `theme:'outline'` `size:'large'` `text:'signin_with'` `shape:'pill'` `logo_alignment:'left'` `width:280`。ダークモード・言語切替への自動追従はしない（初回描画時に固定、スコープ外として許容）
  - iOS版（`_handleGoogleLoginIOS()`）は無変更
  - **未検証事項（次回フォロー）**: 実機（TestFlight）でのログイン→ログアウト→再ログインの動作確認は2026-07-15時点で未実施。詳細は`.claude/next.md`参照
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
  - **未検証（次回フォロー）**: iOS版ボタンの公式ロゴ表示・ダークモード時のAppleボタン（黒背景）の視認性・タップ挙動は次回TestFlightビルドでの実機確認が必要
- **2026-07-16修正（設計書48・課題2/3）: 連携維持のトークン破棄条件緩和＋連携解除の確認ダイアログ**
  - **課題2（再起動で連携が切れる不具合の対策）**: `refreshLoginUI()`（`public/app.js`）は従来`GET /api/auth/me`が`!res.ok`またはfetch例外のとき無条件で`clearAuthToken()`していた。iOS版は起動直後にネットワーク未確立・サーバー一時エラー（500系）・タイムアウトが起きやすく、有効なトークンでも「連携が切れた」ように見えて破棄していた（実質ログアウト）。**`res.status === 401`（明確な失効）のときのみ`clearAuthToken()`**し、それ以外（500系など`!res.ok`）と`catch`（通信エラー）ではトークンを保持して`_showLoggedInOptimistic(loggedInEl, loggedOutEl, labelEl)`で「連携中」の楽観的表示を維持する。楽観的表示ではproviderが不明なためラベルは既存の`loginStatusGoogle`を汎用流用（新規i18nキーは追加せず）。provider確定は正常時（`res.ok`）経路のみ`data.provider`から正確に更新。**`@capacitor/preferences`へのトークン移行はスコープ外**（設計書48・課題2-2、まずcatch/status修正のみで様子見。localStorage方式のまま）
  - **課題3（連携解除の確認ダイアログ）**: `handleLogoutClick()`先頭に`if (!confirm(t('confirmLogout'))) return;`を追加。誤タップでの即解除を防止。i18n新規キー`confirmLogout`をja（`アカウント連携を解除しますか？`）/en（`Disconnect your linked account?`）に同時追加
  - **未検証（次回フォロー）**: 実機（TestFlight）で「連携後にアプリ再起動して連携が維持されるか」「連携解除の確認ダイアログが出るか」の確認が必要
- **2026-07-16修正（設計書49）: JWT保存を`@capacitor/preferences`ハイブリッド方式に変更（再起動で連携が切れる根本解決）**
  - 設計書48の課題2は「有効なトークンを一時通信エラーで破棄しない」対策だったが、**トークン自体がiOS版WKWebViewの再起動でlocalStorageから消える**ケースには効かなかった。そのためJWTの保存先を`@capacitor/preferences`（iOSネイティブの`UserDefaults`にマップされる永続領域）をソースオブトゥルースとする**ハイブリッド方式**に変更した（`public/app.js`のトークン操作4関数＋起動時初期化のみ。`server.js`無変更＝pm2再起動不要）
  - 3層構造: `_authTokenCache`（JSモジュールスコープ変数、`getAuthToken()`を**同期のまま維持**するための同期読み取り元）／ `localStorage`（ミラー・Web版の主保存先）／ `@capacitor/preferences`（iOS版のソースオブトゥルース、非同期API）。`getAuthToken()`はキャッシュ優先→localStorageフォールバックの同期関数（`authedFetch()`の既存シグネチャを壊さない）。`setAuthToken`/`clearAuthToken`はキャッシュ・localStorageを即時更新し、Preferences書き込みはfire-and-forget（`.catch(()=>{})`、awaitしない）
  - プラグイン取得は`registerPlugin('Preferences')`優先→`window.Capacitor.Plugins.Preferences`フォールバックの防御的実装（Keyboard/PushNotifications既存パターン踏襲）。`_CapPrefs`は`_isCapacitorApp`時のみ非null。Web版は`_CapPrefs===null`で従来通りlocalStorage単独動作（挙動不変）
  - 起動時初期化 `_initAuthToken`（非同期IIFE、旧同期`refreshLoginUI()`呼び出しを置換）: iOS版は`await _CapPrefs.get({key})`でトークン読み出し→`_authTokenCache`セット＋localStorageミラー。Preferencesに無くlocalStorageにあれば（旧バージョン移行）Preferencesへ書き込む。**Preferences読み出し完了「後」に`refreshLoginUI()`を呼ぶことが必須**（非同期のため同期で先に呼ぶとキャッシュ未初期化で匿名表示になる）。`ios-app/package.json`に`@capacitor/preferences@^6.0.0`追加
  - 一時計装`_sendDebugLog('auth_prefs_init', { hasPrefs, hasToken })`を`_initAuthToken`末尾に埋め込み済み。**原因確定後に削除する使い捨て**（`.claude/next.md`参照）
  - **未検証（次回フォロー）**: 実機（TestFlight）で「連携→アプリ完全終了→再起動して連携が維持されるか」、`logs/debug-nav.log`の`auth_prefs_init`で`hasPrefs:true`かつ再起動後も`hasToken:true`（Preferences永続化が機能しているか）の確認が必要
- **2026-07-19実装（設計書65）: アカウント削除機能を追加（App Store Review Guideline 5.1.1(v)対応）**
  - **サーバー**: 新規`DELETE /api/auth/me`（`requireAppAuth`必須、`server.js`の`GET /api/auth/me`直後）。(1)`data/users.json`から該当`userId`のレコードを`withFileLock`で削除、(2)`data/user-plans/{userId}.json`が存在すれば`withFileLock`で削除（`getUserPlansFilePath()`の既存バリデーション使用）、(3)全都市（sg/bkk/syd）の`data/{city}/community-courses.json`を走査し該当`authorId`を`null`に匿名化（**コース自体・`spots`・`likes`・`isPublic`は変更しない**。公開コースは他ユーザーが既に閲覧・いいねしている可能性がある公開データのため、削除ではなく作成者情報のみ匿名化する設計。`authorId`は権限判定にのみ使われ画面表示には使われないため`null`化による表示崩れなし）。冪等（対象レコードが既に無くても200 `{ok:true}`を返す）。プッシュ通知トークン（`data/push-subscriptions.json`）・共有カレンダー参加情報（userIdと紐づく仕組みが存在しない）は対象外
  - **クライアント**: `public/app.js`の`handleDeleteAccountClick()`（`handleLogoutClick()`直後）が`confirm(t('confirmDeleteAccount'))`→`authedFetch(DELETE /api/auth/me)`→成功時`_clearAllAccountLocalState()`（JWT・バックアップ鍵material・saltの3点セットを一括クリア）→`refreshLoginUI()`/`renderBackupSection()`で未ログイン表示に戻す、という流れ。**500系エラー時はローカル状態を一切クリアしない**（サーバー側削除が確認できてから消す設計、`handleLogoutClick()`とは逆の慎重さ）。401時（トークン失効）はローカルクリアのみで完了トースト表示
  - **UI配置（2026-07-19設計書66で「アカウント」セクションから分離・設定画面最下部の独立セクションへ移動 → 同日設計書67で見出し廃止・中央寄せテキストのみに変更済み。以下は歴史的経緯）**: 当初は設定画面「アカウント」セクション、`#login-section-logged-in`（ログイン中表示ブロック）の直後に`#delete-account-section`を新設していたが、破壊的・不可逆操作を日常操作から視覚的に切り離すため、設計書66で「フィードバック」セクションの後、新規見出し`secDangerZone`（ja「アカウント削除」/en「Delete Account」、`color:var(--terracotta)`）を持つ独立`.settings-section`として最下部に移動した。さらに設計書67でiOSアプリの一般的なパターンに合わせ、見出し自体を廃止し「アカウントを削除」テキストのみを中央寄せ・pill装飾なしで表示する形に変更した（詳細は下記「アカウント削除ボタンを見出しなし・中央寄せテキストのみに変更」節参照）。**未ログイン時は非表示**（`refreshLoginUI()`/`_showLoggedInOptimistic()`の全分岐で`#login-section-logged-in`と表示/非表示を同期、`document.getElementById('delete-account-section')`によるIDベース参照のためDOM位置移動の影響を受けない）。`.settings-item--danger`（`var(--terracotta)`色、`public/app.css`）で視覚的に区別
  - **touchendハンドラ追加漏れ対策**: 設定画面の`touchend`デリゲーション一覧（`public/app.js`、`#logout-btn`判定行の直後）に`#delete-account-btn`を追加済み。設計書46（iOS版Googleボタン表示漏れ）と同型のミスを踏まないための必須対応として実施
  - **i18n**: `deleteAccountBtn`（アカウントを削除/Delete account）・`confirmDeleteAccount`（取り消せない旨の強い警告文言）・`toastDeleteAccountSuccess`・`toastDeleteAccountError`の4キーをja/en同時追加
  - **リスク・スコープ外（設計書65 §11・§4に明記）**: 部分失敗リスク（3つの独立した`withFileLock`操作のため、途中クラッシュで一部だけ完了する可能性。既存の他マルチステップ処理と同水準のリスクとして許容）。「猶予期間」「復元（アンドゥ）」機能は実装せず即時削除のみ。Google/Appleサーバー側のOAuth連携解除（各プラットフォームの設定画面で行う操作）は範囲外。共有カレンダー参加情報の削除連動は、そもそも紐づけ機能自体が未実装（設計書37 §3・設計書54 §4）のためスコープ外
  - **App Store Connect側「Appプライバシー」申告フォームの更新はコード変更では対応不可、ユーザーが審査提出前に手動対応が必要**（本タスクのスコープ外として明記）
  - **未検証（次回フォロー）**: 削除ボタンのUIはクライアント側コードに依存するため、iOS版でこの機能を使えるようにするには次回TestFlightビルドが必須。実機でのタップ動作・削除フローのエンドツーエンド確認は未実施（Web版はcurl・目視で先行検証済み）

## プライバシーポリシー更新（2026-07-19実装、設計書65）
`public/privacy.html`第1章「収集する情報」に「Google/Appleアカウントの識別子（sub のみ保存、email/氏名/画像は保存しない。同意画面表示は各社仕様上回避不可能である旨も明記）」「予定表・マイコース等のバックアップデータ（ゼロ知識暗号化、パスフレーズはサーバー未送信）」「共有カレンダーのデータ（パスフレーズ暗号化）」の3項目を追記。第6章「情報の保管と削除」に「アカウントの削除」（設定画面からいつでも削除可能、公開コースは匿名化されるのみで削除されない旨）を追記。**章番号は変更せず既存章の拡張のみ**（第1〜8章の構成は維持）。最終更新日を2026年7月19日に更新。文言はCLAUDE.mdに記録された技術的事実の範囲でのみ記述（誇大な安全性主張はしない方針）。

## データバックアップ（端末移行用、ゼロ知識暗号化）＋共有カレンダーのパスフレーズ方式化（2026-07-17実装 設計書54・55 → 2026-07-18 設計書58で全データ対応に拡張）

設計書37のフェーズ1.5-Aを確定させ、ユーザー新要件「個人予定のサーバーバックアップもパスフレーズでゼロ知識暗号化したい」（設計書54）・「共有カレンダーの鍵配布をランダム鍵のURLフラグメント方式からパスフレーズ方式に変更したい」（設計書55）を実装した。両方とも**サーバーはパスフレーズ自体を一切保存しない**（PBKDF2用の非秘密saltと暗号文のみ保持）ゼロ知識設計。2026-07-18の設計書58で、対象を「予定表のみ」から「マイコース・ジャンル設定・プロフィール・いいね・アバターを含む全データ」に拡張し、あわせてボタンのタッチ不発バグを修正した（下記「全データバックアップへの拡張＋タッチ不発バグ修正」節参照）。

### 共通鍵導出ヘルパー（`public/app.js`）
`_deriveKeyFromPassphrase(passphrase, saltB64)`: PBKDF2（iterations:100000, SHA-256）→AES-256-GCM鍵（`CryptoKey`）を導出。個人データバックアップ・共有カレンダーの両方から呼ばれる**唯一の共通実装**。ただし**パスフレーズ自体・保存先キー・保存値は完全に分離**（同じパスフレーズを使い回さない設計）。付随ヘルパー: `_genSaltB64()`（salt生成）・`_exportKeyMaterial()`/`_importKeyMaterial()`（鍵material⇔Base64url変換、案X-B用）・`_encryptWithKey()`/`_decryptWithKey()`（`CryptoKey`を直接受け取る汎用暗号化・復号、IV12バイト先頭付与）。

### データバックアップ（端末移行用）（設計書54 → 設計書58で全データ対応に拡張）
- **データモデル**: `data/user-plans/{userId}.json`（新規、gitignore対象）。`{userId, salt, encryptedData, updatedAt}`のみ。平文フィールドは一切持たない（`encryptedData`はAES-256-GCM暗号化されたJSON文字列）。サーバーは暗号文を不透明なBlobとして保存・返却するのみで中身に一切関知しないため、下記のペイロード構造変更は`server.js`無変更で完結する
- **暗号化ペイロード構造（`_collectBackupPayload()`、設計書58で`version:2`に刷新）**: `{version:2, customPlans, eventPlansByCity:{sg,bkk,syd}, myCoursesByCity:{sg,bkk,syd}, genres, who, ageList, likedCourses, avatar}`。`eventPlansByCity`/`myCoursesByCity`は`ACTIVE_CITIES`（現状`['sg']`のみ）ではなく固定`BACKUP_CITIES=['sg','bkk','syd']`で全都市分を対象にする（BKK/SYD再開時のデータ取りこぼし防止、停止中でも過去データが`localStorage`に残っていれば拾う）。共有カレンダー参加情報（`{city}_shared_cal_key`等）・`app_ios_push_token`・`cal_device_id`・`app_auth_token`・バックアップ機構自身の鍵material/saltは意図的にスコープ外（設計書58 §3-1・3-2）
- **後方互換（`_applyRestoredBackup()`）**: 復号したJSONに`version`フィールドが無い場合は旧構造（`{customPlans, eventPlans}`のみ）とみなし、`eventPlans`を現在の都市の`eventPlansByCity[city]`に読み替える。マイコース等の新規フィールドは存在しないため空扱い（エラーにはならない）。復元後の次回同期で自動的に新構造（`version:2`）に上書きされる
- **API**: `GET/PUT /api/user-plans/me`（`requireAppAuth`必須）。`getUserPlansFilePath(userId)`が`usr_[a-f0-9]{24}`形式のみ許可（パストラバーサル対策）。`PUT`は`salt`/`encryptedData`欠如時400、`withFileLock`で排他制御
- **オプトイン方式**: ログインしただけでは自動的にバックアップは開始されない。設定画面「データバックアップ」セクション（設計書58でセクション名を「予定表のバックアップ」から変更）で明示的にパスフレーズを設定した場合のみ有効化される（`isBackupEnabled()`は`localStorage`の鍵material有無で判定）
- **同期フロー**: `saveCustomPlans`/`saveEventPlans`に加え、設計書58でマイコース保存箇所（タイトル編集・削除・公開・非公開・新規保存）、ジャンル設定（`saveGenreList`）、プロフィール（`toggleSettingsWho`/`selectSettingsAge`）、いいね（`toggleLike`）、アバター（`selectAvatar`）の各保存箇所からも`_syncBackupToServer()`が呼ばれるようになった（未ログイン・バックアップ未設定なら即return、実害なし）。設計書22パターン（5秒タイムアウト、失敗しても静かに諦めてUIをハングさせない）を踏襲
- **鍵の保持方式（案X-B、2026-07-17ユーザー承認）**: 導出済み鍵material（`CryptoKey`をraw export→Base64url化した文字列）を`localStorage`（キー`app_backup_key_material`）＋`_CapPrefs`（iOS版、設計書49と同じハイブリッド方式）に保存し、次回起動時は自動復元。パスフレーズ自体は保存しない。端末が盗まれた場合のリスクは既存の共有カレンダー鍵保存方式と同じトレードオフとして許容（ユーザー確認済み）
- **UI**: `renderBackupSection()`（未ログイン/未設定/設定済みの3状態を出し分け）。パスフレーズ入力シート（`#backup-passphrase-sheet`、`.plan-modal`パターン、z-index:3601/3602）は`setup`（初回、確認欄あり）/`change`（変更、確認欄あり）/`restore`（別端末での復元、確認欄なし）の3モードを1つのマークアップで共有。別端末での既存バックアップ検知は`checkExistingBackupOnOpen()`（設定画面を開いたタイミングで`GET /api/user-plans/me`を叩き、`salt`/`encryptedData`があれば復元導線を表示）
- **失敗時の挙動**: 誤ったパスフレーズはAES-GCMタグ検証エラーとして捕捉し、ローカルデータを一切変更せずエラートースト表示のみ（`_doBackupRestore()`）
- **既知の未解決事項（設計書54 §8に明記済み、設計書58時点も未解決のまま）**: パスフレーズを忘れた場合はサーバー側の救済手段なし（ゼロ知識設計の必然）。ログアウト時に鍵material・端末ローカルデータをクリアするかは未解決のまま「クリアしない」保守的挙動を採用（次回要検討）。バックアップ無効化時にサーバー側ファイルを削除するかも未設計

### 全データバックアップへの拡張＋タッチ不発バグ修正（2026-07-18実装、設計書58）
- **バグの原因**: `renderBackupSection()`/`checkExistingBackupOnOpen()`が生成するボタンは`onclick="if(!_touchCapableDetected) 関数呼び出し(...)"`パターンだったが、設定画面のタッチデリゲーション側（`#backup-section-content button`分岐）が`btn.click()`でDOM合成clickイベントを発火させる実装になっていた。`touchend`発火時点では`_touchCapableDetected`が既に`true`のため、`.click()`によって呼ばれた`onclick`属性内のガードが常に偽と評価され、実際の関数が一切呼ばれず「自分自身のガードで自分をブロックする」状態になっていた（このセクションのボタン全てが影響を受けていた）
- **修正**: `renderBackupSection()`/`checkExistingBackupOnOpen()`が生成するボタンの`onclick`属性を`data-backup-action`属性（`setup`/`change`/`restore`/`disable`）に置き換え、`ontouchend=""`の無害だが不統一な残骸も削除。タッチデリゲーション側は`btn.click()`ではなく新設の`_runBackupAction(action)`を直接呼ぶよう変更。PC/マウス操作環境向けに、`#backup-section-content`への専用`click`イベントリスナーを新規追加し、`_touchCapableDetected`が`true`の場合は何もしない（タッチ環境ではtouchend側で処理済みのため二重発火しない）という要素スコープの対応に留めた（CLAUDE.md「onclick属性＋touchendハンドラの二重登録とゴーストクリック」節の確立パターンを踏襲、グローバルなclickブロックは追加していない）
- **バックアップ対象の拡張**: 上記「データバックアップ（端末移行用）」節に統合済み（`version:2`ペイロード構造・`BACKUP_CITIES`・同期呼び出し追加箇所）
- **i18n**: `secBackup`（「予定表のバックアップ」→「データバックアップ」）・`backupDisabledDesc`/`backupEnabledDesc`の文言を「予定表」から「予定表・マイコースなどのデータ」に変更（既存キーの値変更のみ、キー追加なし）。新規キー`backupExcludesCalendarNote`（「共有カレンダーへの参加状態は引き継がれません」の注意書き）をja/en同時追加、`renderBackupSection()`の未設定時の説明文の直後に表示
- **スコープ外（設計書58 §3-9で明示）**: 共有カレンダー参加情報のバックアップ対応、ログイン確定直後の自動バックアップ有無チェック、`sg_lang`/`sg_theme`/`app_city`の同期対象化、パスフレーズ強度チェック、複数デバイス間のリアルタイム同期
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのタッチ操作によるボタン反応確認、全データバックアップ→別端末での復元（マイコース・ジャンル設定等が正しく復元されるか）は2026-07-18時点でWeb版での単体ロジック検証のみ完了、実機確認は未実施

### 共有カレンダーのパスフレーズ方式化（設計書55）
- **データモデル変更**: `data/shared-calendars/{groupId}.json`に`salt`フィールドを追加（既存フィールドの削除・型変更なし、追加のみ）。`salt`ありグループ=新方式（パスフレーズ由来の鍵）、`salt`なしグループ=旧方式（ランダム鍵をURLフラグメントに埋め込み）として共存する
- **サーバー**: `POST /api/calendar/create`が`salt`を追加受信・保存するのみ（既存`city`/`encryptedData`受信ロジックに1フィールド追加）。`GET /api/calendar/:groupId`は無変更で`salt`を含めてレスポンス（既存コードがオブジェクト全体を返すため自動対応）。`POST`/`PUT`両エンドポイントに`withFileLock`を新規適用（旧実装は素の`fs.writeFileSync`だった）
- **クライアント（`public/app.js`）**: `getCalSalt()`/`setCalSalt()`新規（`{city}_shared_cal_salt`）。既存`getCalKey()`/`setCalKey()`は新方式では「パスフレーズから導出した鍵materialのBase64url」を保存する用途に変更（`setCalKey`にも`_CapPrefs`ミラーを追加）
  - `doCreateGroup()`: 「グループを作成する」ボタン押下で即座にグループ作成せず、まずパスフレーズ設定シート（`openCalPassphraseSheet('create')`）を開く。実処理は`_doCalCreateGroup(passphrase)`に分離
  - `loadCalQR()`/`copyJoinLink()`/`shareViaLine()`: `getCalSalt()`の有無で新方式（フラグメントなしURL）/旧方式（フラグメント付きURL、従来通り）に分岐
  - `doJoinGroup()`: `_pendingJoinKey`（URLフラグメント由来）があれば旧方式として即座に`_doJoinGroupWithKey()`へ。フラグメントが無い場合はサーバーから該当グループの`salt`有無を確認し、`salt`ありなら新方式としてパスフレーズ入力シート（`openCalPassphraseSheet('join')`）へ誘導、`salt`なし（無暗号化グループ）ならそのまま`_doJoinGroupWithKey(gid, null)`。新規`_doJoinGroupWithPassphrase(gid, passphrase)`が新方式の復号・マージ・再暗号化・アップロードを担う
  - `handleScannedQR()`/`checkJoinParam()`は無変更（既存の「URLに`join`パラメータ＋`#`フラグメント」抽出ロジックがそのまま新旧判定の入口として機能する）
  - パスフレーズはQR・招待リンク・LINE共有メッセージのいずれにも含めない（設計書55 §2-7、鍵とグループIDを意図的に分離したままにする）。招待相手には別チャネル（口頭・LINE本文とは別）でパスフレーズを伝える運用を前提とする
- **UI**: パスフレーズ入力シート（`#cal-passphrase-sheet`、z-index:3603/3604）は作成用（確認欄あり）・参加用（確認欄なし）を`_calPassphraseMode`で出し分け、個人予定表バックアップ側と同じマークアップパターンだが別要素・別変数で完全に分離
- **⚠️ 後方互換性の重要な制約（2026-07-17ユーザー承認済みで受け入れ済みのリスク）**: 既存（デプロイ前作成済み）の`salt`なしグループは引き続き従来通りURLフラグメント鍵方式でアクセス可能。**しかし新方式（`salt`あり）で作られたグループには、旧バージョンApp（またはこの変更が未反映のWeb版/iOS版）から参加できない**（旧バージョンはパスフレーズ入力UIを持たず、フラグメントなしURLから鍵を取得する手段がないため）。Web版・iOS版のリリースタイミングがずれる期間は、新方式グループへの参加が片方のプラットフォームでのみ機能する状態が一時的に発生し得る
- **2026-07-19訂正（ソースコード確認により判明）**: 設計書55 §9は「`doManualJoin()`（6桁グループID手入力）への新方式パスフレーズ対応はスコープ外」としていたが、実際のコードを確認したところ既に対応済みだった。`doManualJoin()`は`handleScannedQR(id)`を経由し、フラグメント鍵（`joinKey`）が無い6桁ID単体入力では`_pendingJoinKey`が`null`になるため、QRスキャン（フラグメントなし）と全く同じ`doJoinGroup()`の分岐（サーバーの`salt`有無を見て新方式ならパスフレーズ入力シートへ誘導）を通る。手入力専用の分岐は存在せず、既存ロジックの副産物として新方式に対応している。**ただしこの経路の実機での動作確認（手入力→パスフレーズシート表示→参加成功）は未実施**、次回TestFlightビルド後に確認が必要
- **既知の未解決事項**: PBKDF2のiterations値（100000固定）のモバイル実機でのパフォーマンスは次回TestFlightビルドでの実機確認が必要

### パスフレーズ入力シートのレイアウト修正（2026-07-18実装、設計書59）
実機バグ報告: `#backup-passphrase-sheet`でパスフレーズ入力欄→確認用入力欄とフォーカス移動すると、キャンセル/確定ボタン行がボトムナビとわずかに重なって表示される不具合（setup直後は正常）。原因は2点: (1) `#backup-passphrase-sheet`・`#cal-passphrase-sheet`が他の`.plan-modal`インスタンスと異なり`.plan-modal-body`ラッパーを持たず、ボトムナビ分の余白確保を`.plan-modal`自身のインラインpaddingのみに依存していた、(2) 下記`_scrollFocusedIntoViewOnKb()`の`scrollIntoView`フォールバックが、`overflow-y:auto`祖先を持たないこの2シートで必ず発火し、iOS WKWebViewの`position:fixed`要素の位置ズレを誘発していた可能性（一次情報による確証はなく理論的推測）。
- **案A（構造統一）**: `#backup-passphrase-sheet`・`#cal-passphrase-sheet`両方に、他の`.plan-modal`インスタンス（`#date-picker-modal`等）と同じ`.plan-modal-body`ラッパーを追加。タイトル行は`.plan-modal`直下に残し、警告文・入力欄2つ・ボタン行を`.plan-modal-body`（インラインstyleで`padding:0 0 calc(84px + safe-area)`、左右0は`.plan-modal`側の既存20px paddingとの二重加算を避けるため）で包む。既存id（`backup-passphrase-warn`/`-confirm-row`/`-input`/`-confirm-input`/`-submit-btn`、`cal-`側同様）はラッパー内に移動するのみで変更なし
- **案C（副作用の除去）**: `_scrollFocusedIntoViewOnKb()`（下記）の`if (!foundContainer) { focused.scrollIntoView(...) }`フォールバック分岐を削除。`overflow-y:auto`祖先が見つからない場合は何もしない
- **未検証（次回TestFlightビルド後にフォロー）**: `scrollIntoView`削除の効果は理論的推測であり実機確認必須。`#backup-passphrase-sheet`の`change`モードでフィールド間フォーカス移動してもボタン行がボトムナビと重ならないこと、`#feedback-text`/`#nickname-input`が引き続きキーボードに隠れないこと（`.screen-scroll-content`という`overflow-y:auto`祖先を持つため`foundContainer`が見つかり影響を受けないはず）、`course-sheet`（`#course-note`）等の既存`.plan-modal-body`持ちシートに回帰がないことの3点を確認する

### 両機能共通
- **TDZ回避**: 新規モジュールスコープ変数（`_backupKeyCache`/`_backupSyncInFlight`/`_backupSheetMode`/`_calPassphraseMode`/`BACKUP_CITIES`）はいずれもオプトイン機能（ユーザーが設定画面を開いて明示的に操作するまで一切呼ばれない）のため、起動時同期フロー（`loadEventData()`/`initPushState()`等）から参照されず、TDZ対象外
- **キャッシュバスティング**: `index.html` app.js?v=20260718b、`sw.js` CACHE_NAME=sg-weekend-v621（設計書59時点）
- **未検証事項（次回TestFlightビルド後にフォロー）**: パスフレーズ設定→サーバーバックアップ→別端末での復元、共有カレンダーのQR読み取り→パスフレーズ入力での参加、の両フローとも実機での動作確認が未実施（Web版でのAPI疎通・暗号化ロジックの単体検証のみ完了）。設計書58のタッチ不発バグ修正・全データバックアップ拡張、設計書59のレイアウト修正も同様に実機未検証

### アカウント連携時にバックアップパスフレーズ入力を必須化（2026-07-22実装、設計書118）
上記のデータバックアップは元々「アカウント連携」とは独立したオプトイン機能で、連携後に設定画面から別途パスフレーズを設定しないとバックアップは有効にならなかった。ユーザー要望「アカウント連携する時に必ずパスフレーズの入力をしてもらって、基本バックアップはそれでオンになる。ただしアカウント連携した後もパスフレーズを変えられる作りにしてほしい」を受け、「アカウント連携している以上バックアップをしない状態はない」という不変条件を持たせた。

- **フック箇所**: Google/Apple連携の完了経路は4パターン（Web Google=`renderButton`+`_submitGoogleIdToken`、iOS Google=`_handleGoogleLoginIOS`+`_submitGoogleIdToken`、iOS Apple=`_handleAppleLoginIOS`+`_submitAppleIdentityToken`、Web Apple=`_consumeAppleAuthTokenFromHash`のリダイレクト受信）あるが、いずれも最終的に`refreshLoginUI()`に収束する（Web Appleのみ`_initAuthToken`起動時IIFE経由で間接的に）。`refreshLoginUI()`のトークン検証成功パス末尾（`catch`直前）に、新規関数`_checkMandatoryBackupSetup()`のfire-and-forget呼び出しを追加し、この1箇所で全経路をカバーする
- **`_checkMandatoryBackupSetup()`**: この端末にバックアップ鍵materialが無ければ（`isBackupEnabled()`が偽）、`GET /api/user-plans/me`でサーバーの既存バックアップ有無を確認し、`salt`/`encryptedData`があれば`restore`モード、無ければ`setup`モードで必須パスフレーズシートを開く。新規連携（サーバーに未設定→setup）・別端末での再連携（サーバーに設定済み→restore）・フロー中断からの再試行（次回`refreshLoginUI()`実行時に鍵materialが無ければ再度開く）が同じロジックで自然にカバーされる
- **必須モードのシート**: `openBackupPassphraseSheet(mode, mandatory=false)`に第2引数`mandatory`を追加。`true`時は✕ボタン（`#backup-passphrase-close-btn`）・キャンセルボタン（`#backup-passphrase-cancel-btn`）を`display:none`にする。`closeBackupPassphraseSheet()`先頭の`if (_backupSheetMandatory) return;`ガードが、オーバーレイタップ・✕・キャンセルの3経路全てを一括で防ぐ（3経路がいずれもこの1関数を通る既存構造を利用）。`_doBackupSetup`/`_doBackupChange`/`_doBackupRestore`の各成功パスは`closeBackupPassphraseSheet()`呼び出し直前に`_backupSheetMandatory = false`を設定してから閉じる（成功時に必須モードのまま閉じられなくなる事故を防ぐための実装上必須の対応、設計書に明示コードはなかったがbuilderが追加）
- **既存呼び出し元は全て`mandatory`省略（=false）のまま無変更**: `_runBackupAction()`内のsetup/change/restore 3箇所、`checkExistingBackupOnOpen()`が生成する動的ボタン（`_runBackupAction()`経由）。設定画面から任意にパスフレーズ変更する既存フローは今回のロジックに一切影響を受けない
- **「パスフレーズを忘れた場合」のリセット導線**: `restore`かつ`mandatory`時のみ、送信ボタンの下に`#backup-passphrase-reset-link`を表示。タップで`_resetBackupAndSetupFresh()`（`confirm()`で「既存バックアップは復元できなくなり新しいパスフレーズで作り直される」旨を警告後、シートを閉じずに`setup`モードへその場で切り替え）。サーバー上の暗号化データは`_doBackupSetup`が新しいsalt+暗号文で無条件PUT上書きするため、この関数自体はUI切り替えのみでよい
- **設定画面「無効にする」ボタンの削除**: `renderBackupSection()`のログイン済み・バックアップ有効時の分岐から「🚫 無効にする」ボタン（`data-backup-action="disable"`）を削除（「連携している以上バックアップをしない状態はない」という不変条件のため、ユーザーが自発的に無効化する導線を無くした）。「🔑 パスフレーズを変更」ボタンのみ残る。`disableBackup()`関数自体・`_runBackupAction()`内`'disable'`ディスパッチは削除せず残置（既存の「使わなくなった導線は残置」方針を踏襲、ボタンが無くなるため実質到達不能になるだけ）
- **i18n**: `backupForgotPassphraseLink`（パスフレーズを忘れた場合はこちら/Forgot your passphrase?）・`confirmBackupReset`（既存バックアップの復元不可＋再作成の警告文）をja/en同時追加
- **スコープ外**: ログアウト時の鍵material・端末ローカルデータのクリア可否（設計書54 §8-5で既に「クリアしない」を採用、未解決事項として明示済み。今回変更なし）、複数アカウントの切り替え時の鍵material整合性（既存の未検討事項のまま）、スタンプ進捗のバックアップ対応（サーバー側直接保存＋ログイン必須化済みのため調査の結果対応不要と判明）
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260722d`→`20260722e`、`sw.js` CACHE_NAME=`sg-weekend-v670`→`v671`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機での必須パスフレーズシート表示・✕/キャンセル非表示・リセット導線の動作は2026-07-22時点でcurl・コード読解による整合性確認のみ完了、実ブラウザ・実機とも未確認

### バックアップパスフレーズ入力欄が反応しない不具合の診断ログ追加（2026-07-22実装、設計書119）
設計書118を含むTestFlightビルドで、ユーザーが実機スクリーンショットとともに「このモーダル入力できません」と報告（`#backup-passphrase-sheet`のrestoreモード）。メインエージェントがサンドボックス内Playwright（iPhoneタッチエミュレーション含む）で再現を試みたが再現せず原因未確定だったため、CLAUDE.md既定の実機デバッグ用ログ収集機能（`_sendDebugLog()`/`POST /api/debug-log`/`logs/debug-nav.log`）を使った診断ログのみを仕込んだ（機能ロジック変更なし）。
- `openBackupPassphraseSheet(mode, mandatory=false)`冒頭（`getAuthToken()`ガード直後）に`_sendDebugLog('backup_passphrase_sheet_open', { mode, mandatory, isCapacitor, ua })`を追加
- 新規IIFE`_initBackupPassphraseInputDiag()`（`closeBackupPassphraseSheet()`直後に配置）で`#backup-passphrase-input`要素に`touchstart`/`touchend`/`focus`/`blur`/`input`の5イベントリスナーを登録し、`_sendDebugLog('backup_passphrase_input_event', { evt, valueLength, activeElementIsInput, isCapacitor })`を送信。**入力内容（パスフレーズ本文）自体は一切ログに含めない**（`input.value`そのものは送信せず`valueLength`のみ記録）
- 診断方針: 次回TestFlightビルド配信後、実機再現時に`logs/debug-nav.log`で「シート自体が開いているか」「タップで`touchstart`/`touchend`/`focus`が記録されるか（記録なければCSS/z-index/pointer-events問題を疑う）」「`focus`はあるが`input`が記録されないか（IME/キーボード問題を疑う）」「`input`は記録されるが`valueLength`が0のまま変化しないか（多重初期化を疑う）」を切り分ける
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260722e`→`20260722f`、`sw.js` CACHE_NAME=`sg-weekend-v671`→`v672`
- この診断ログ自体は原因確定後に削除してよい使い捨てコード（CLAUDE.md既定の運用ルール通り）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での再現・ログ収集による原因特定は2026-07-22時点で未実施（本タスクは診断ログの仕込みのみ）

### 探訪マップに現在地マーカーを表示（2026-07-22実装、設計書120）
ユーザー要望「探訪スタンプ帳のマップに現在地も出せる？」を受け、Leaflet地図（`initStampMapTab()`）に現在地マーカーを追加した。既存のチェックイン距離判定用に取得済みの`_stampCurrentPos`（`_getCurrentPositionOnce()`、`initStampMapTab()`/`openStampSpotDetail()`から呼ばれる）をそのまま再利用するため、追加の位置情報許可プロンプトは発生しない。
- **新規モジュールスコープ変数`_stampUserLocationMarker`**（`public/app.js`、`_stampLeafletMap`等の宣言と同じ並び）
- **新規関数`_renderStampUserLocation()`**: 現在地マーカーを描画・更新する。マーカーが既に存在すれば`setLatLng()`で位置更新のみ（スポットピン層のような`clearLayers()`による再生成はしない、ちらつき防止）。`L.marker(latlng, { icon, zIndexOffset: 1000, interactive: false })`と`interactive:false`を指定し、スポットピンのタップ判定に影響しない
- **呼び出し箇所**: `initStampMapTab()`の`_ensureStampLeafletMap()`/`_renderStampMarkers()`直後（既に位置情報があれば即反映）、および`_getCurrentPositionOnce().then(...)`コールバック内（取得完了後に反映）。`openStampSpotDetail()`の位置情報再取得コールバックにも追加
- **CSS新規クラス**（`public/app.css`）: `.stamp-user-location-dot`（Googleマップ等でおなじみの「青い点」`#4285F4`を踏襲、アプリのブランドカラー〈caramel系〉ではなく地図アプリの共通言語として認識されやすい青系を採用）・`@keyframes stampUserLocationPulse`（box-shadowによる波紋パルスアニメーション）
- スコープ外（今回未実装）: 「現在地に戻る」ボタン等のマップ操作UI（表示のみ）、位置情報の継続監視（`watchPosition`導入なし、既存の一回取得方式`_getCurrentPositionOnce()`をそのまま踏襲）
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.css `?v=20260722b`→`20260722c`、app.js `?v=20260722f`→`20260722g`、`sw.js` CACHE_NAME=`sg-weekend-v672`→`v673`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機での現在地マーカー表示・パルスアニメーションの見た目は2026-07-22時点でcurl・コード読解による整合性確認のみ完了、実ブラウザ・実機とも未確認

### 探訪チェックイン時の「思い出」機能（写真ローカル保存＋メモ）＋思い出フレーム（Cパターン）（2026-07-22実装、設計書121）
ユーザーとの会話で「シンガポールでの限られた生活は振り返らないとすぐ忘れる」という課題意識から、探訪チェックイン時に写真・一言メモを残せる機能を追加した。**写真は一切サーバーに送信せず端末内のみに保存**、メモ（テキスト）は既存のゼロ知識暗号化バックアップ（設計書54/118）に統合し複数端末対応させる方針。既存のコース機能・レベル制・エリアバッジとは独立した追加レイヤーで、既存の探訪機能（設計書69〜120）のデータ・API構造には一切手を加えていない。

- **データモデル（写真、ローカルのみ）**: 新規IndexedDBデータベース`dosuru_stamp_memories`（オブジェクトストア`photos`、keyPath: `spotId`）にリサイズ済みJPEG Blobを保存。**サーバーへのアップロード経路は一切実装しない**（`fetch`/`authedFetch`のいずれの呼び出しにも写真データは含まれない設計）。1スポットにつき1枚のみ（上書き保存）、複数枚対応・訪問ごとの個別記録はスコープ外
- **データモデル（メモ、既存バックアップに統合）**: `localStorage`新規キー`sg_stamp_memos`（`{[spotId]:{text,updatedAt}}`）。`_collectBackupPayload()`（設計書58）に新規フィールド`stampMemos`を追加（`version:2`のまま据え置き）。`_applyRestoredBackup()`に`updatedAt`比較によるマージロジックを追加（ローカルに同じspotIdが無い、またはリモート側が新しい場合のみ採用）
- **新規ヘルパー（`public/app.js`）**: `_openStampMemoryDB()`/`_saveStampMemoryPhotoBlob()`/`_getStampMemoryPhotoBlob()`/`_getAllStampMemoryPhotoBlobs()`（IndexedDB操作、いずれも純粋にローカルのみでネットワーク呼び出しを含まない）・`_resizeImageBlob()`（canvas経由、最大辺1080px・quality0.8のJPEG圧縮、iOS/Web両方の取得結果に適用）・`_getStampMemos()`/`_setStampMemoText()`（メモのlocalStorage操作）・`_getCapCameraPlugin()`（`@capacitor/camera`、`_getCapGeoPlugin()`と同じ`registerPlugin`優先→`Plugins`フォールバックの防御的パターン）・`_pickStampMemoryPhotoBlob()`（iOS: `getPhoto({resultType:'dataUrl', source:'PROMPT', quality:80})`、Web: 動的`<input type=file accept="image/*" capture="environment">`）
- **チェックイン後「思い出を残す」ミニシート**: 新規`#stamp-memory-overlay`/`#stamp-memory-sheet`（z-index 3704/3705、既存`.chat-overlay`/`.plan-modal`パターン踏襲）。`_openStampMemorySheet(spot, newlyUnlockedLevel)`/`_closeStampMemorySheetInternal()`/`_skipStampMemory()`/`_pickStampMemoryPhoto()`/`_resetStampMemoryPhotoBox()`/`_saveStampMemory()`を新規実装。写真プレビュー・メモ入力（`maxlength=300`）・「🔒 写真は端末内にのみ保存されます」の明示表示・スキップ/保存の2ボタン
- **`doStampCheckin()`の変更**: 旧「新規解禁レベルがあれば1600ms後にレベル解禁演出モーダルを直接開く」実装を、「常に900ms後に思い出シートを開く（`newlyUnlockedLevel`はnullの場合あり）。レベル解禁演出は、思い出シートを閉じた後に`_closeStampMemorySheetInternal()`内で500ms後にチェーンして開かれる」実装に置き換えた。**`openStampLevelUnlockModal()`本体のロジックは無変更**（呼び出しタイミング・呼び出し元のみ変更）
- **一覧・詳細シートでの見返し表示**: `_renderStampLevelRowInProgress()`/`_renderStampLevelRowComplete()`のサムネイル生成部分で、個人の思い出写真（`_stampMemoryPhotoUrlCache[spot.id]`、インメモリキャッシュ）があればスポット画像（`spot.imageUrl`）より優先して使用。InProgressカードの説明文表示は、個人メモがあれば「📝 」プレフィックス付きで優先表示、無ければ既存通り`spot.description`を表示。新規関数`_renderStampDetailMemorySection(spot)`（`openStampSpotDetail()`から呼び出し）が、未チェックインならセクション非表示、チェックイン済みで記録なしなら「📷 思い出を追加」ボタン（`stampMemoryAddRetroactiveBtn`）、記録ありなら「あなたの記録」セクションに表示する
- **思い出フレーム（Cパターン、ポラロイド風）**: スポット詳細シート「あなたの記録」セクションの個人写真表示**のみ**に適用（`.stamp-detail-memory-photo-frame`、白台紙固定・`transform:rotate(-4deg)`・box-shadow、キャプションはスポット名ではなくチェックイン日付〈`_stampCheckinDateFor()`再利用〉）。**ミニシート内の写真プレビュー・コレクション一覧のサムネイルには意図的に適用しない**（編集操作〈✕削除ボタン〉との相性・小サイズでの表現の潰れを考慮した設計判断、設計書で明示的に切り分け済み）。ダークモードでも白台紙（`background:#fff`固定）を意図的に維持（ポラロイド＝物理的な白い台紙という比喩を保つため、他要素と異なりCSS変数へ追従させない）
- **インメモリキャッシュ**: `_stampMemoryPhotoUrlCache`（`{spotId: objectURL}`、IndexedDB非同期読み込み結果）。`initStampMapTab()`で`_getAllStampMemoryPhotoBlobs()`を一括fire-and-forget実行しキャッシュ構築後`_renderStampCollectionList()`を再実行。`_saveStampMemory()`成功時は`_refreshStampMemoryCacheForSpot()`で該当spotIdのみ個別更新（全件再取得はしない）
- **`closeAllPopups()`に`_closeStampMemorySheetForNav()`を追加**（設計書96と同型の対策）: ボトムナビでの画面遷移時に思い出シートが開き残らないようにする。`_closeStampMemorySheetInternal()`と異なり、保留中のレベル解禁演出チェーン（`_stampMemoryPendingUnlock`）は画面遷移時には発火させず破棄する設計判断（別画面で突然モーダルが開く体験を避けるため）
- **iOS**: `ios-app/package.json`に`@capacitor/camera@^6.0.0`追加。`.github/workflows/ios-deploy.yml`の既存`NSCameraUsageDescription`ステップの説明文を更新（QRコード読み取り用途に加え「探訪スタンプ帳での思い出の写真撮影」を追記）＋新規`NSPhotoLibraryUsageDescription`ステップを追加（既存PlistBuddyパターン踏襲）。**⚠️ この時点では「`saveToGallery`オプションは使用しないため`NSPhotoLibraryAddUsageDescription`は不要」と判断していたが誤りだった。`@capacitor/camera`の`getPhoto()`は`saveToGallery`未使用でもこのキーの存在を起動時に検査する仕様であり、欠落しているとカメラピッカー自体が一切起動しない不具合を引き起こしていた。2026-07-23設計書137で`NSPhotoLibraryAddUsageDescription`をCIに追加し修正済み（詳細は下記「カメラピッカー起動不能の根本原因判明・修正」節参照）**
- **i18n新規キー10個**（ja/en同時）: `stampMemorySheetTitle`/`stampMemoryPhotoAddLabel`/`stampMemoryPhotoLocalNote`/`stampMemoryTextPlaceholder`/`stampMemorySkipBtn`/`stampMemorySaveBtn`/`stampDetailMemoryLabel`/`stampMemoryAddRetroactiveBtn`/`toastStampMemorySaved`/`toastStampMemoryError`
- スコープ外（設計時点で明示）: 写真の複数枚対応（1スポットにつき1枚のみ、上書き保存）、訪問ごとの個別記録、写真のトリミング・編集機能、年間振り返り・帰国前アルバム等のまとめ閲覧専用画面、BKK/SYD対応、IndexedDB非対応環境への特別なフォールバックUI（`window.indexedDB`が無い場合は写真機能を静かにスキップしメモ機能のみ動作）
- `server.js`は無変更（`data/user-plans/{userId}.json`はサーバー側では暗号化Blobとして扱うのみのため対応不要）。`pm2 restart`不要。キャッシュバスティング: `index.html` app.css `?v=20260722c`→`20260722d`、app.js `?v=20260722g`→`20260722h`、`sw.js` CACHE_NAME=`sg-weekend-v673`→`v674`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのカメラ/フォトライブラリ権限ダイアログ表示、撮影/選択→リサイズ→IndexedDB保存のフロー、思い出シート→レベル解禁演出のチェーン表示タイミング、詳細シートのポラロイド風フレーム表示、コレクション一覧のサムネイル・メモ優先表示は2026-07-22時点でWeb版のロジック・配線確認のみ完了、実機未確認

### 来星日登録＋探訪画面での在住日数カウンター表示（2026-07-23実装、設計書122）
ゲーミフィケーション拡張ブレスト（デイリーストリーク議論）の中で出た案の一つ「在住日数カウンター常時表示」を実装。ユーザー要望「来星日を登録して、今日で何日！という表示をどこかにしたい」を受け、探訪画面ヘッダーに「在住 2年3か月（xx日）」の形式で表示することで確定。

- **データモデル**: 新規`localStorage`キー`app_arrival_date`（ISO日付文字列`"YYYY-MM-DD"`）。既存バックアップ機構に統合: `_collectBackupPayload()`に`arrivalDate`フィールドを追加、`_applyRestoredBackup()`に`who`/`avatar`と同じ「ローカル未設定時のみ採用」パターンでマージロジックを追加（単一スカラー値のプロフィール項目のため`updatedAt`比較マージは不要）
- **設定画面での入力**: プロフィールセクション「都市」選択行の直後にネイティブ`<input type="date" id="arrival-date-input">`を新規追加。既存`openDatePickerSheet()`（週末プランニング用の近未来週チップ）は過去の任意日付選択に不向きなため再利用せず、Web・iOS Capacitorとも標準サポートのネイティブ`<input type=date>`を新規採用。`initSettingsProfile()`に初期値セット処理と、`max`属性（当日日付を動的セット、未来日付選択をUI側でも防止）を追加。新規関数`_saveArrivalDate(value)`（`localStorage`書き込み→`_renderResidencyCounter()`再描画→`_syncBackupToServer()`同期の3ステップ、未入力への変更＝クリアはネイティブ日付入力のクリア操作にそのまま委ね専用ボタンは追加していない）
- **探訪画面ヘッダーでのカウンター表示**: `.course-screen-header`内`.course-tab-bar`の直後に`#stamp-residency-counter`（初期`display:none`、未設定時はそのまま非表示。設定を促す誘導文言は今回追加せずスコープ外）を新規追加。新規関数`_formatResidencyYM(years, months, lang)`（ja「{年}年{月}か月」〈0年時は年を省略〉/en「{年}yr(s) {月}mo」）・`_renderResidencyCounter()`（`_getStampMemos()`/`_setStampMemoText()`の直後に配置）。`initCourseScreen()`の`await switchCourseTab('map');`直後に`_renderResidencyCounter();`を追加し、画面に入るたびに最新の日数へ再計算（日付またぎにも自然に対応）
- **日付計算ロジック**: 経過日数（`Math.round((todayMid - arrivalMid) / 86400000)`、実日数差）と年月表記（`getFullYear()`/`getMonth()`/`getDate()`ベースのカレンダー境界計算、`today.getDate() < arrival.getDate()`のとき`months--`、`months<0`のとき`years--; months+=12`という繰り下げロジック）を独立して算出。未来日付（`days<0`）はフェイルセーフとして非表示扱い
- **i18n新規キー2個**（ja/en同時）: `labelArrivalDate`（来星日/Arrival Date）・`residencyCounterLabel`（在住 {ym}（{days}日）/{ym} in Singapore ({days} days)）。`{ym}`は`_formatResidencyYM()`内でJS側で組み立てた複合文字列を`.replace()`する設計（`{y}`/`{m}`個別キーは作らない、既存`stampLevelUnlockSubtext`と同様の前例踏襲）
- **既存の探訪レベル解禁条件（チェックイン数ベースの`STAMP_LEVEL_GATES`）への影響なし**（本カウンターは表示専用）。ホーム画面など他画面への表示・未設定時の入力誘導バナー・年間振り返り機能はスコープ外
- `server.js`・データファイルは無変更（フロントエンドのみ、`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260722h`→`20260723a`、`sw.js` CACHE_NAME=`sg-weekend-v674`→`v675`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での来星日入力欄・在住日数カウンター表示・日付計算結果の実機表示は2026-07-23時点でWeb版のロジック検証（8ケースの手計算照合含む）のみ完了、実機未確認

### 来星日入力欄の表示崩れ修正（カスタムフォーマット表示への切り替え）（2026-07-23実装、設計書123）
設計書122実装後、実機（TestFlight）で来星日入力欄が「1/10/15」のような判読しづらい圧縮表示になる不具合が確認された。保存データ自体（`app_arrival_date`）・在住日数カウンターの計算結果は正常だったため、ネイティブ`<input type="date">`の「閉じた状態」表示がWKWebView上でカスタムCSS（`border:none`/`text-align:right`等）と干渉し、OS標準のロケール依存フォーマットが圧縮された形で表示されていたのが原因と推測される（ネイティブdate input表示のブラウザ内部レンダリングでテキストコンテンツとして直接制御できないため確証はないが、CSS競合の可能性が高いと判断）。

- **方針**: ネイティブ`<input type="date">`表示のフォーマットに依存せず、アプリ側で完全にフォーマットを制御するカスタム表示ラベルに切り替え。`<input type="date">`自体は透明化（`position:absolute;inset:0;opacity:0`）して「タップで日付ピッカーを開く」ためだけの機能レイヤーとして残す（既存の`.city-select-wrapper::after`と同系統の「ネイティブ要素を透明化し独自表示を重ねる」パターン）
- **マークアップ変更**: `public/index.html`の来星日入力行を、`position:relative`ラッパーの中に`<span id="arrival-date-display">`（表示用、`pointer-events:none`）＋透明化した`<input id="arrival-date-input" type="date">`（タップ領域）を重ねる2層構成に変更
- **新規関数`_formatArrivalDateDisplay(value, lang)`**（`public/app.js`）: ja「2015年10月1日」形式、en「Oct 1, 2015」形式で整形。未設定・不正値（`isNaN`判定）は既存`genreStatusUnset`（「未設定」/「Not set」）キーを再利用（新規i18nキー追加なし）
- **反映箇所**: `initSettingsProfile()`の来星日初期値セット処理（`max`属性のセットも既存`fmtDateKey(new Date())`ヘルパーを使う形に統一）・`_saveArrivalDate(value)`の両方から`#arrival-date-display`のテキストを更新
- **`_renderResidencyCounter()`本体は無変更**（既に正しく動作していたため対象外）。バックアップpayload・復元ロジックも無変更（保存データ自体は最初から正しかったため）
- `server.js`・データファイルは無変更（フロントエンドのみ、`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723a`→`20260723b`、`sw.js` CACHE_NAME=`sg-weekend-v675`→`v676`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: 来星日入力欄のカスタム表示が正しいフォーマットで表示されること、タップで日付ピッカーが開くこと、選択後に表示が正しく更新されることは2026-07-23時点でWeb版の配信確認のみ完了、実機未確認

### ⚠️ 来星日を未設定に戻すリセットボタンを追加（2026-07-23実装、設計書124 → 同日設計書126で削除済み。本節は歴史的経緯として残置）
設計書123で来星日入力欄を「透明化した`<input type="date">` + カスタム表示span」構成に変更した結果、ネイティブdate inputの「閉じる（クリア）」操作の見た目（ブラウザ標準の✕アイコン等）も透明化されて見えなくなり、一度設定した来星日をクリアする手段が事実上失われた。ユーザーから「設定でも未設定に戻せるようにしたい」との要望を受け対応した。

- `public/index.html`: 来星日表示の隣に、値が設定されている時のみ表示される✕リセットボタン（`#arrival-date-reset-btn`、初期`display:none`）を追加。既存の`position:relative`ラッパー（`#arrival-date-display`＋`#arrival-date-input`）を`display:flex;align-items:center;gap:8px;`の外側コンテナで包み直した
- `public/app.js`: 新規関数`_resetArrivalDate()`（`#arrival-date-input`の値をクリアし`_saveArrivalDate('')`を呼ぶ）を追加。`initSettingsProfile()`の来星日初期化箇所・`_saveArrivalDate(value)`の両方にリセットボタンの表示切り替え（`value ? 'flex' : 'none'`）を追加
- **設定画面のtouchendデリゲーション一覧（`public/app.js`、`#delete-account-btn`等と同じ並び）に`#arrival-date-reset-btn`の判定行を追加済み**（CLAUDE.md「onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック」節の既知アンチパターン——ガードのみ付与しtouchendハンドラ登録を忘れると実機タップが機能しなくなる——を踏まえた必須対応）
- リセット時の確認ダイアログ（`confirm()`）は付けない設計判断（バックアップ無効化等と異なりデータ喪失の重大性が低い単一プロフィール項目のため）。「未設定」表示ロジック自体（`_formatArrivalDateDisplay('')`）は設計書123で実装済みのため変更なし。新規i18nキー追加なし
- `server.js`・データファイルは無変更（フロントエンドのみ、`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723b`→`20260723c`、`sw.js` CACHE_NAME=`sg-weekend-v676`→`v677`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での✕ボタンのタップ精度・表示/非表示切り替えの見た目は2026-07-23時点でWeb版の配信確認のみ完了、実機未確認

### 来星日表示を他のプロフィール項目と同じピルボタン風に統一（2026-07-23実装、設計書125）
「都市」（`.city-select`）・「一緒に行く人」（`#settings-who-summary`）・「ジャンル・興味」は全て縁取りのある丸ボタン風の見た目で統一されているが、「来星日」（設計書123・124）は素のテキスト＋透明化した`<input type="date">`という構成のため見た目だけ浮いていた。ユーザーが実機スクリーンショットで「他と揃えられないか、ボタンみたいな感じで」と指摘し対応した。

- `public/index.html`: `#arrival-date-display`に`#settings-who-summary`と同じピルスタイル（`display:inline-flex;align-items:center;gap:4px;padding:8px 14px;border-radius:50px;border:1.5px solid var(--sand-dark);background:var(--warm-white);font-family:'Noto Sans JP',sans-serif;font-size:14px;font-weight:600;color:var(--midnight);pointer-events:none;`）のインラインスタイルを追加。`<input type="date">`（透明化してタップ領域として重ねる構成、設計書123）・✕リセットボタン（設計書124）の構造・機能はいずれも無変更、見た目のみの調整
- `public/app.js`: `_formatArrivalDateDisplay(value, lang)`を、末尾に「▼」インジケーター（`<span style="font-size:11px;color:var(--warm-gray);">▼</span>`、`#settings-who-summary`内`#settings-who-arrow`相当の装飾）を付加したHTML文字列を返すよう変更。来星日はタップで直接ネイティブピッカーが開く一段構成のため、`#settings-who-arrow`のような開閉トグルに応じた`transform`回転アニメーションは追加していない（固定表示のみ）。既存の日付フォーマットロジック自体（ja「2015年10月1日」/en「Oct 1, 2015」/未設定は`genreStatusUnset`キー再利用）は無変更、IIFEで包む形に再構成のみ
- 戻り値にHTMLタグが含まれるようになったため、呼び出し元2箇所（`initSettingsProfile()`の来星日初期値セット処理・`_saveArrivalDate()`）の代入方法を`textContent`から`innerHTML`に変更。`value`はネイティブ`<input type="date">`が返す値のためユーザー自由入力ではなくXSSリスクはない
- 新規i18nキー追加なし（「▼」は既存`#settings-who-arrow`と同様シンボル表示のためi18n対象外）
- `server.js`・データファイルは無変更（フロントエンドのみ、`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723c`→`20260723d`、`sw.js` CACHE_NAME=`sg-weekend-v677`→`v678`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのピルスタイル表示・▼インジケーターの見た目バランスは2026-07-23時点でWeb版の配信確認のみ完了、実機未確認

### 来星日の✕リセットボタンを削除（2026-07-23実装、設計書126）
設計書124で追加した✕リセットボタンについて、ユーザーが実機で確認した結果「要らない、リセットあるので」と判断（ピル自体をタップして日付を選び直せば事実上の変更・リセット手段になるため、専用の✕ボタンは不要という判断）。

- `public/index.html`から`#arrival-date-reset-btn`要素（設計書124で追加）を削除
- `public/app.js`から`_resetArrivalDate()`関数、`initSettingsProfile()`・`_saveArrivalDate()`内のリセットボタン表示切り替え処理、設定画面touchendデリゲーション一覧内の`#arrival-date-reset-btn`判定行を削除
- ピルボタンのスタイル（設計書125）・「未設定」表示ロジック（設計書123）・透明化した`<input type="date">`は無変更のまま維持
- `server.js`・データファイルは無変更（フロントエンドのみ、`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723d`→`20260723e`、`sw.js` CACHE_NAME=`sg-weekend-v678`→`v679`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での削除後のレイアウトバランスは2026-07-23時点でWeb版の配信確認のみ完了、実機未確認

### 在住日数カウンターをタイトル行右上のバッジに変更（2026-07-23実装、設計書127）
設計書122で追加した在住日数カウンター（`#stamp-residency-counter`）は探訪画面タブバーの下に全幅1行で表示される構成だったが、ユーザーから「変」との指摘があり、モック4案（A: 小ピルチップ／B: 年月+日数2段ピル／C: アイコン付きスタットバッジ／D: テキストのみ控えめ）を提示。**D案（タイトル行右上、控えめなテキスト2行）**を選択・実装した。

- `public/index.html`: `#screen-course .course-screen-header`内、`.screen-title`を新規の横並びラッパー（`display:flex;align-items:flex-start;justify-content:space-between;`）で包み直し、その中に`#stamp-residency-counter`をタブバー直後の全幅1行版から移動。スタイルを`font-size:11px;color:var(--warm-gray);font-weight:600;text-align:right;line-height:1.5;margin-top:4px;flex-shrink:0;`に変更（初期`display:none`は維持）。`.course-screen-header`自体が`flex-direction:column`（`public/app.css`）のため、タイトル行の右側にバッジを配置するには`.screen-title`を包む新規ラッパーが必須だった
- `public/app.js`: `residencyCounterLabel`のja/en値を、太字強調＋改行を含むHTML形式に変更（ja: `在住 <b>{ym}</b><br>（{days}日）`、en: `<b>{ym}</b> in Singapore<br>({days} days)`）。`_renderResidencyCounter()`末尾の描画行を`el.textContent = ...`から`el.innerHTML = ...`に変更（設計書123の`_formatArrivalDateDisplay`と同様のHTML化パターン）
- **日数・年月の計算ロジック自体（`_formatResidencyYM()`含む）・`initCourseScreen()`からの呼び出しタイミングは無変更**（設計書122で実装済み、正しく動作確認済みのため）
- `server.js`・データファイルは無変更（見た目のみの調整、`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723e`→`20260723f`、`sw.js` CACHE_NAME=`sg-weekend-v679`→`v680`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での2行バッジ表示・タイトル行右上の見た目バランスは2026-07-23時点でWeb版のロジック・マークアップ照合のみ完了、実機未確認

### 来星記念日のローカル通知（毎年繰り返し、iOS版のみ）（2026-07-23実装、設計書128）
ユーザー要望「一年の記念日に通知を送りたい」への対応。来星日（設計書122）はローカル（`localStorage`）にのみ保存されサーバー側は暗号文経由でしか間接保持しない設計のため、サーバー起点でのプッシュ配信は不可。代替として端末内で完結する`@capacitor/local-notifications`を新規採用した。**技術的にiOS版（Capacitor）のみの対応、Web版は対象外**（ブラウザの永続的なローカル通知スケジューリングは実用的でないため）。AskUserQuestionで頻度を確認し「毎年繰り返し」を選択・承認済み。

- **スケジューリング方式**: `repeats:true, every:'year'`の単一繰り返し通知では「在住◯年目」という年数入りの動的文言をOS側の固定テキストで表現できないため、**向こう10年分の個別`schedule.at`通知をまとめて事前スケジュール**する方式を採用（10年超過時の自動延長はv1スコープ外、既知の制約として許容）
- `public/app.js`: 新規`_getCapLocalNotifPlugin()`（`_getCapGeoPlugin()`/`_getCapCameraPlugin()`と同じ`registerPlugin('LocalNotifications')`優先→`Plugins.LocalNotifications`フォールバックの防御的パターン）、新規定数`ARRIVAL_ANNIVERSARY_NOTIF_BASE_ID`(90100、既存通知IDと衝突しない予約帯)/`ARRIVAL_ANNIVERSARY_YEARS_AHEAD`(10)、新規`async function _scheduleArrivalAnniversaryNotifications(arrivalStr)`を追加。処理内容: Web版は即return→既存10年分の予約IDを`plugin.cancel()`で全キャンセル→`arrivalStr`が空ならキャンセルのみで終了→`requestPermissions()`で許可確認→向こう10年分ループし、既に過ぎた年はスキップして`plugin.schedule()`で一括予約（IDが固定のため再実行は冪等）
- **呼び出し箇所**: `_saveArrivalDate(value)`末尾に`_scheduleArrivalAnniversaryNotifications(value);`を追加（来星日の保存・変更・クリアのたびに再スケジュール）。`initSettingsProfile()`の来星日初期化箇所に`if (savedArrival) _scheduleArrivalAnniversaryNotifications(savedArrival);`を追加（アプリ再インストール等でOS側の予約が失われているケースへの自己修復、設定画面を開くたびに`schedule()`を呼び直すコストは無視できるレベルと判断しフラグ管理等の複雑化はしていない）
- **TDZ対応（設計書50/51と同一パターン）**: `_CapLocalNotif`（`let`）・`ARRIVAL_ANNIVERSARY_NOTIF_BASE_ID`/`ARRIVAL_ANNIVERSARY_YEARS_AHEAD`（`const`）は、起動時同期フロー（`initSettingsProfile()`が`loadEventData();`直後に同期呼び出しされ、`_scheduleArrivalAnniversaryNotifications()`経由でこれらを間接参照する）より前に宣言する必要があるため、関数定義自体は`_getCapCameraPlugin()`直後（既存の「思い出」機能セクション付近）に置いたまま、変数宣言のみ`loadEventData();`直前（`_CapPush`宣言の直後）へ移動した
- i18n新規キー2個（ja/en同時追加）: `arrivalAnniversaryNotifTitle`（ja「🎉 来星記念日です！」/en「🎉 Happy Arrival Anniversary!」）・`arrivalAnniversaryNotifBody`（ja「シンガポール生活{n}年目に突入しました。探訪の記録を振り返ってみませんか？」/en「You've reached {n} year(s) in Singapore! Take a look back at your journey.」、`{n}`は`.replace('{n}', n)`で年数を埋め込む既存パターン踏襲）
- `ios-app/package.json`に`@capacitor/local-notifications@^6.0.0`を追加
- **Info.plist追加設定は不要（npm packageの実ソース確認により裏付け済み）**: `@capacitor/local-notifications@6.1.3`のnpm tarballを直接取得しREADME・Podspec・iOS Swiftソース（`LocalNotificationsPlugin.swift`/`LocalNotificationsHandler.swift`）を確認。READMEはAndroid向け権限記述（`SCHEDULE_EXACT_ALARM`等）のみでiOS向けInfo.plistキーの言及なし、Podspecにも該当記述なし、Swiftソース内に`Info.plist`/`Bundle.main.infoDictionary`等への参照は0件（grep確認）。権限リクエストは標準の`UNUserNotificationCenter.current().requestAuthorization(options:[.badge,.alert,.sound])`のみで、これは既存の`@capacitor/push-notifications`と同じ`UserNotifications`フレームワーク系統のランタイム許可ダイアログ（Info.plist記述キー自体がAppleの仕様として存在しない）。そのため`.github/workflows/ios-deploy.yml`は無変更
- `server.js`・データファイルは無変更（サーバーは一切関与しない設計、`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723f`→`20260723g`、`sw.js` CACHE_NAME=`sg-weekend-v680`→`v681`（`app.css`は無変更のため据え置き）
- スコープ外（今回未実装）: Web版でのプッシュ通知連動（サーバー側に暗号化されていない来星日を持つ設計への転換を要する大きな変更のため別途検討）、10年を超えた在住者への自動延長スケジューリング、通知タップ時の遷移先制御（探訪画面への誘導等、OS標準のアプリ起動のみ）、記念日通知のオン/オフを来星日設定と切り離した専用トグル
- **未検証（次回TestFlightビルド後にフォロー）**: 技術的にiOS版のみの機能のためTestFlightビルドが必須。実機での通知許可ダイアログ表示・実際の通知スケジューリング・発火確認（1年後のため即時確認は困難）は2026-07-23時点で未検証。設計書69〜127自体もまだTestFlightビルド未実施のため、本追加も含めて次回一括リリースの想定

### ⚠️ 記念日通知の実機テスト用ボタン（使い捨て）（2026-07-23実装、設計書129）
設計書128（来星記念日のローカル通知）は年単位で待たないと本物の記念日通知は発火せず、ユーザーはSafari Web Inspectorでのリアルタイムデバッグ手段も持たないため、動作確認用に「10秒後に発火するテスト通知」を即座に送れるボタンを設定画面に一時的に追加した。
- `public/index.html`: 来星日入力行の直後に`#arrival-notif-test-row`（テキストリンク「🔔 テスト通知を送る（10秒後）」）を追加
- `public/app.js`: 新規`async function _sendTestArrivalNotification()`を追加。設計書128の`_getCapLocalNotifPlugin()`をそのまま再利用し、専用固定ID（90099、`ARRIVAL_ANNIVERSARY_NOTIF_BASE_ID=90100`と非衝突）・即時（10秒後）の`schedule.at`でローカル通知を1件スケジュールする。既存`arrivalAnniversaryNotifTitle`/`arrivalAnniversaryNotifBody`キーを流用（`{n}`に「テスト」という文字列を埋め込む）、トースト文言は日本語ハードコード、新規i18nキーなし
- touchendデリゲーション追加なし（onclickガードのみ、既存の同種テキストリンクパターン踏襲）
- **⚠️ これは使い捨てコード。ユーザーが次回TestFlightビルドで実機テストを行い記念日通知が正常にスケジュール・発火することを確認できたら、`#arrival-notif-test-row`・`_sendTestArrivalNotification()`一式を削除する**（削除は別途指示があった際に対応、CLAUDE.md既定の「実機デバッグ用」使い捨てコード運用ルールに従う）
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723g`→`20260723h`、`sw.js` CACHE_NAME=`sg-weekend-v681`→`v682`

### 思い出機能・記念日テストボタンのタップ不発を修正（onclick属性ガード未対応touchend、7箇所）（2026-07-23実装、設計書130）
ユーザーが実機で「テスト通知ボタンが押せない」「写真を追加ボタンも押せない」と報告。設計書121（思い出機能）・設計書129（記念日テストボタン）で追加した7箇所のonclick属性が、いずれも`if(!_touchCapableDetected) fn()`ガードのみを持ち、対応する`touchend`ハンドラの登録を伴っていなかった。CLAUDE.md「onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック」節の既知アンチパターン（設計書38・84・99と同型）の再発。
- 確立済みの修正パターン（新規touchendハンドラを追加するのではなく、ガード自体を撤去する）に倣い、以下7箇所全てから`if(!_touchCapableDetected) `部分のみを削除（関数呼び出し自体・`event.stopPropagation();`は維持）: `public/index.html`側5箇所（`#arrival-notif-test-row`のテキストリンク→`_sendTestArrivalNotification()`、`#stamp-memory-overlay`背景タップ→`_skipStampMemory()`、`#stamp-memory-photo-box`→`_pickStampMemoryPhoto()`、「スキップ」ボタン→`_skipStampMemory()`、「保存する」ボタン→`_saveStampMemory()`）、`public/app.js`側2箇所（動的生成の写真削除✕ボタン→`_resetStampMemoryPhotoBox()`、スポット詳細シート内「思い出を追加」ボタン→`_openStampMemorySheet(_stampSelectedSpot, null)`）
- `_stampMemoryPickedBlob`関連ロジック・IndexedDB周りのコード・記念日通知のスケジューリングロジック自体は無変更
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723h`→`20260723i`、`sw.js` CACHE_NAME=`sg-weekend-v682`→`v683`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのタップ動作確認は2026-07-23時点でコード修正・grep/git diffによる静的検証のみ完了、実機未確認。設計書121・129自体もTestFlightビルド未実施のため、本修正も含めて次回一括リリースの想定

### ⚠️ 思い出写真ピッカーの実機診断ログ追加＋既存の思い出を編集可能にする（2026-07-23実装、設計書131）
設計書130（タップ不発修正）適用後もユーザーが実機で「カメラが押せない」と再報告。原因調査の結果、`_pickStampMemoryPhotoBlob()`が`catch (_) { return null; }`で全エラーを握りつぶし呼び出し元も無言で終了する実装のため、タップ自体は成功していても`@capacitor/camera`のプラグイン取得失敗・権限拒否・API呼び出しエラーのいずれが起きてもユーザーからは「何も起きない」ように見える状態だった。あわせてユーザーから「思い出情報は後からでも編集できるようにしたい」との要望があった。

- **診断ログ追加（`_pickStampMemoryPhotoBlob()`、使い捨て）**: Capacitor分岐に`_sendDebugLog('stamp_memory_photo_pick_start', { hasPlugin, hasGetPhoto })`（プラグイン取得直後）・`_sendDebugLog('stamp_memory_photo_pick_result', { hasDataUrl })`（`getPhoto()`呼び出し直後）の2箇所、外枠のcatchブロックに`_sendDebugLog('stamp_memory_photo_pick_error', { errorName, errorMessage })`を追加。Web版の`<input type=file>`分岐は無変更
- **既存の思い出を編集できるようにする**: 新規関数`_showStampMemoryPhotoPreview(blob)`に写真プレビュー表示ロジック（`URL.createObjectURL`→背景画像セット→✕ボタンHTML生成）を切り出し、`_pickStampMemoryPhoto()`・`_openStampMemorySheet()`の編集時プリロード両方から共用する。`_openStampMemorySheet(spot, newlyUnlockedLevel)`を`async`化し、シート表示直後にメモ欄へ既存メモ（`_getStampMemos()[spot.id]?.text`）を事前入力、`_getStampMemoryPhotoBlob(spot.id)`で既存写真（IndexedDB）を非同期取得できれば`_showStampMemoryPhotoPreview()`でプレビュー表示する（新規チェックイン時はIndexedDBに何もないため何も起きない。読み込み中に別スポット用にシートが開き直されていないか`_stampMemorySpotId === spot.id`で確認するガード付き）
- **既存呼び出し元は変更不要**: `_openStampMemorySheet()`の呼び出し元2箇所（`doStampCheckin()`の`setTimeout`コールバック内、`_renderStampDetailMemorySection()`内の`onclick`属性）はいずれも`await`せず呼んでいるだけのため、`async`化しても変更不要（checkerで確認済み）
- **スポット詳細シートに「編集」ボタンを追加**: `_renderStampDetailMemorySection()`の既存思い出ありの分岐末尾に`<button class="stamp-memory-edit-btn" onclick="_openStampMemorySheet(_stampSelectedSpot, null)">${t('stampMemoryEditBtn')}</button>`を追加。新規CSSクラス`.stamp-memory-edit-btn`（`public/app.css`）は既存の`.stamp-memory-add-retroactive-btn`と似た控えめなテキストリンク調（`background:transparent;border:none;color:var(--caramel)`）で統一
- i18n新規キー1個（ja/en同時追加）: `stampMemoryEditBtn`（ja「✏️ 編集」/en「✏️ Edit」）
- スコープ外（今回未実装）: 写真の「完全削除」（既存写真がある状態で編集シートを開き✕で消して「保存」しても、IndexedDB上の既存写真は上書きされないまま残る。写真の差し替えは可能だが完全削除は今回スコープ外、既存の「写真は1件のみ・上書き保存」というモデルの延長として許容）
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723i`→`20260723j`、app.css `?v=20260722d`→`20260723a`、`sw.js` CACHE_NAME=`sg-weekend-v683`→`v684`
- **未検証（次回TestFlightビルド後にフォロー）**: 実機での新規カメラピッカー診断ログ確認によるタップ不発の真因特定（原因確定後は使い捨てログとして削除する）、既存思い出の編集フロー（メモ・写真の事前入力、上書き保存）の実機動作確認は2026-07-23時点でコード修正・`node --check`・curlによる配信反映確認のみ完了、実機未確認。設計書69〜130自体もまだTestFlightビルド未実施のため、本修正も含めて次回一括リリースの想定

### 記念日通知テストボタンの削除＋思い出メモ欄のiOS自動ズーム修正（2026-07-23実装、設計書132）
ユーザーが実機で記念日通知（設計書128）の動作確認完了（「完璧です」）。設計書129で明記していた通り、テスト専用の使い捨てボタンを削除した。あわせて、思い出を残すミニシート（設計書121）のメモ入力欄（`#stamp-memory-text`）にフォーカスすると画面がズームされる不具合が判明・修正した。
- **⚠️ 上記「記念日通知の実機テスト用ボタン（使い捨て）」節（設計書129）は本節により役目を終え、コードは既に削除済み**: `public/index.html`から`#arrival-notif-test-row`要素を削除、`public/app.js`から`_sendTestArrivalNotification()`関数を削除。設計書130で行った同ボタンのtouchendガード修正も、要素ごと削除されたことで無関係になった（履歴として`plan.md`/`session-log.md`には残る）
- **思い出メモ欄のフォントサイズ修正**: `public/app.css`の`.stamp-memory-textarea`の`font-size`を`14px`→`16px`に変更。iOS Safari/WKWebViewには、フォーカスされた`<input>`/`<textarea>`の`font-size`が16px未満だと自動的にズームインする既知の仕様があり、これに該当していた
- **記念日通知本体のロジック（`_scheduleArrivalAnniversaryNotifications()`等、設計書128）・design 131で追加した思い出写真ピッカーの診断ログ（`stamp_memory_photo_pick_*`）は無変更のまま維持**
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723j`→`20260723k`、app.css `?v=20260723a`→`20260723b`、`sw.js` CACHE_NAME=`sg-weekend-v684`→`v685`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での思い出メモ欄フォーカス時にズームが発生しないことの確認、design 131の診断ログ（`stamp_memory_photo_pick_*`）が今回のビルドで初めて実機に反映されるため`logs/debug-nav.log`での確認は2026-07-23時点で未実施。設計書69〜131自体もまだTestFlightビルド未実施のため、本修正も含めて次回一括リリースの想定

### 「制覇済み」表示の重複解消・文言変更＋Web版フォトライブラリ選択対応（2026-07-23実装、設計書133）
ユーザーが実機スクリーンショットで、スポット詳細シートに「✓ 制覇済み」が2箇所（独立バッジ`#stamp-spot-detail-checked`＋チェックインボタン無効化時テキスト）重複表示されていることを指摘（design 121で「あなたの記録」セクションが追加され画面が縦に伸びたことで初めて両方が同時に視認されやすくなったと推測）。あわせて「制覇済み」という文言が大げさ・不自然との指摘、Web版の写真選択が`capture="environment"`指定によりカメラ起動に固定されフォトライブラリから選べない点も指摘された。
- `#stamp-spot-detail-checked`（`public/index.html`、独立した「✓ 制覇済み」パネル）を削除。チェックイン状態の表示はチェックインボタン自体の無効化＋テキスト変化（`_updateStampCheckinButton()`）のみに一本化した。`public/app.js`の`openStampSpotDetail()`・`doStampCheckin()`双方から`checkedEl`の取得・`display`切替処理を削除（`_stampSpotIsChecked()`関数自体は他の多数箇所で継続使用のため無変更）
- `stampCheckedInBadge`のja/en値を変更（キー名は不変）: ja「✓ 制覇済み」→「✓ 訪問済み」、en「✓ Collected」→「✓ Visited」
- `_pickStampMemoryPhotoBlob()`のWeb版`<input type="file">`生成部分から`input.setAttribute('capture', 'environment');`を削除。`accept="image/*"`のみ残し、OS標準の「写真を撮る／ライブラリから選ぶ」選択肢が出るようにした。iOS版（Capacitor Camera、`source:'PROMPT'`）は元々両方の選択肢を提示する設計のため変更不要（design 131の診断ログで調査中のiOS起動不具合の根本解決は今回のスコープ外）
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723k`→`20260723l`、`sw.js` CACHE_NAME=`sg-weekend-v685`→`v686`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機での重複バッジ解消・新文言「訪問済み」表示の確認。design 131のiOS起動不具合が解消していれば、フォトライブラリ選択自体はWeb版のみが対象のためiOS版への影響なし。設計書69〜132自体もまだTestFlightビルド未実施のため、本修正も含めて次回一括リリースの想定

### コレクション一覧カードのメモ・説明文プレビューを削除、チェックイン日付のみ表示（2026-07-23実装、設計書134）
design 121で訪問済みカードにメモ全文（無ければスポット説明文）をプレビュー表示するようにしたところ、カードごとに高さがバラつく問題が発覚。ユーザーがモック3案（現状=全文／案1=メモ1行省略／案2=済マークのみ）に対し「チェックイン日付だけ出そうかな」という第4の折衷案を選択した。
- `_renderStampLevelRowInProgress()`（`public/app.js`）内のカード生成部分から、メモ・スポット説明文のプレビュー行（`memoText`/`descHtml`）を削除し、`metaHtml`は`checkinDate`（チェックイン日付）のみを表示する構成に変更。写真サムネイル（56px、個人の思い出写真を優先して使う`memoryPhotoUrl`/`thumbSrc`ロジック）は無変更のまま一覧に残る
- `_renderStampLevelRowComplete()`（全制覇バッジの展開カード一覧、design 108）は元々チェックイン日付のみの表示だったため無変更。今回の変更により状態B（未全制覇時の横長カード）・状態C（全制覇時の展開カード）の表示ロジックが統一された
- `.stamp-card-desc`CSSクラス（`public/app.css`）は参照元がこの変更で無くなり死にクラス化したが、実害がないため削除していない（既存の「使わなくなった導線は残置」方針を踏襲）
- メモ全文・詳細な情報は既存のスポット詳細シート「あなたの記録」セクション（design 121・127、ポラロイド演出）に一本化する設計思想
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723l`→`20260723m`、`sw.js` CACHE_NAME=`sg-weekend-v686`→`v687`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのカード高さの安定化確認、チェックイン日付のみ表示時の視認性は2026-07-23時点でコード修正・`node --check`のみ完了、実機未確認。設計書69〜133自体もまだTestFlightビルド未実施のため、本修正も含めて次回一括リリースの想定

### 訪問済みバッジ・チェックイン日付を拡大（2026-07-23実装、設計書135）
design 134のモック4案（A背景タイント/B左アクセントバー/C太ボーダー+大バッジ/Dチェックリボン）からC案をベースに、ユーザーが「太いボーダー等の装飾追加は不要、済バッジとチェックイン日付を大きくするだけでいい」とスコープを絞った。
- `public/app.css`の`.stamp-card-done-mark`（訪問済みカードのサムネイル右下に重ねる円形「済」マーク）: `width/height 30px→38px`、`font-size 12px→15px`、`border 2px→2.5px solid var(--cream)`、位置オフセット`bottom/right -6px→-7px`、`box-shadow`をわずかに強化（`0 2px 4px rgba(44,36,32,0.25)`→`0 2px 5px rgba(44,36,32,0.3)`）
- `public/app.css`の`.stamp-card-date`（チェックイン日付表示、design 134で追加）: `font-size 10px→13px`
- 色・回転角（`rotate(-12deg)`）・配置ロジック・カード全体レイアウト・サムネイルサイズはいずれも無変更。太いボーダー・背景タイント等の追加装飾は行っていない
- `public/app.js`・`server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.css `?v=20260723b`→`20260723c`、`sw.js` CACHE_NAME=`sg-weekend-v687`→`v688`（`app.js`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのバッジ・日付表示拡大後のレイアウトバランス（カード内の他要素との干渉有無）は2026-07-23時点でcurl確認のみ、実機未確認。設計書69〜134自体もまだTestFlightビルド未実施のため、本修正も含めて次回一括リリースの想定

### 思い出写真のクロップ比率統一・一覧サムネイルを公式写真に固定・チェックイン日付にラベル追加してエリア行に統合（2026-07-23実装、設計書136）
ユーザーが実機スクリーンショット2枚で3点を指摘。(1) 思い出を残すミニシートの写真プレビュー（`.stamp-memory-photo-box`）と保存後のポラロイド風フレーム（`.stamp-detail-memory-photo-frame img`、幅最大240px×高さ200px）とでクロップ比率が大きく異なり同じ写真なのに選択時と保存後で見た目が変わる、(2) design 121で導入した「個人の思い出写真があればスポット公式画像より優先」というコレクション一覧サムネイルの挙動を常にスポット公式写真を使う仕様に戻す（個人写真は詳細シート「あなたの記録」のみで見せる）、(3) チェックイン日付は独立行ではなくエリア表示と同じ行にまとめラベル（「訪問日: 」等）を付ける。
- `public/app.css`の`.stamp-memory-photo-box`の`height`を160px→220pxに変更（ポラロイドフレーム側の比率1.2:1に近づける。コンテナ幅の違い〈ミニシート100%幅・ポラロイド最大240px〉によりピクセル単位の完全一致はできないが体感的なクロップ範囲のズレを縮める）
- `public/app.js`の`_renderStampLevelRowInProgress()`（状態B、design 108）内、サムネイル選定ロジックを`const thumbSrc = spot.imageUrl || '';`のみに変更し、`memoryPhotoUrl`（design 121で導入した個人写真優先ロジック）を削除
- 同関数内、`metaHtml`変数・`.stamp-card-meta`ブロック（design 134でメモ/説明文を削除しチェックイン日付のみに縮小済みだった）を削除し、新規`.stamp-card-area-row`（flexラッパー）で`.stamp-card-area`とチェックイン日付（`${t('stampCardVisitDateLabel')}${checkinDate}`）を同じ行にまとめた
- `public/app.css`に新規クラス`.stamp-card-area-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }`を追加。既存`.stamp-card-area`（`margin-top:2px`のみ）はflexラッパーと衝突しないことを確認済み
- i18nキー`stampCardVisitDateLabel`をja（訪問日: ）/en（Visited: ）同時追加
- **`_stampMemoryPhotoUrlCache`・`_refreshStampMemoryCacheForSpot()`は削除していない**（スポット詳細シート「あなたの記録」表示で個人写真の取得に引き続き使用）。**`_renderStampLevelRowComplete()`（全制覇バッジの展開カード一覧、design 108）は設計書スコープ外のため無変更**（元々公式写真のみ・日付のみのシンプルな表示で個人写真優先ロジック自体を持っていなかったため）
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.css `?v=20260723c`→`20260723d`、app.js `?v=20260723m`→`20260723n`、`sw.js` CACHE_NAME=`sg-weekend-v688`→`v689`
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機でのクロップ比率統一の見た目・エリア行レイアウトの崩れ有無は2026-07-23時点でcurl確認のみ、実機未確認。設計書69〜135自体もまだTestFlightビルド未実施のため、本修正も含めて次回一括リリースの想定

### カメラピッカー起動不能の根本原因判明・修正（Info.plistに`NSPhotoLibraryAddUsageDescription`追加）（2026-07-23実装、設計書137）
design 131で仕込んだ診断ログ（`stamp_memory_photo_pick_error`）を実機で確認したところ、`You are missing NSPhotoLibraryAddUsageDescription in your Info.plist file. Camera will not function without it.`というエラーが記録されていた。design 121実装時、`NSPhotoLibraryUsageDescription`（フォトライブラリの**読み取り**許可）はCIに追加済みだったが、`NSPhotoLibraryAddUsageDescription`（フォトライブラリへの**書き込み**許可、読み取りとは別のInfo.plistキー）が抜けていたことが根本原因と判明した。`@capacitor/camera`の`getPhoto()`は、`saveToGallery`オプションを使っていなくても内部実装上このキーの存在を起動時に検査しており、欠落しているとエラーを投げてピッカー自体が一切起動しない（撮影前もライブラリ選択前もいずれも失敗する）仕様だった。design 121完了報告時のchecker確認は「読み取り」用のキーのみを確認しており、「書き込み」用キーの必要性を見落としていた（上記「探訪チェックイン時の『思い出』機能」節の該当記述も訂正済み）。
- `.github/workflows/ios-deploy.yml`の既存「Set photo library usage description in Info.plist」ステップに、`NSPhotoLibraryAddUsageDescription`のPlistBuddy設定（既存`NSPhotoLibraryUsageDescription`と同じAdd/Setフォールバックパターン）を同一ステップ内に追記
- design 131の診断ログ（`stamp_memory_photo_pick_start`/`_result`/`_error`、`public/app.js`の`_pickStampMemoryPhotoBlob()`）は削除せず残置（次回実機確認で正常動作を確認できたら削除する）
- `server.js`・`public/`配下・データファイルは無変更。CI設定ファイルのみの変更のため`pm2 restart`不要
- **未検証（次回TestFlightビルド後にフォロー）**: カメラピッカーが正常起動しフォトライブラリから写真選択できるかの実機確認が必須。確認できたらdesign 131の診断ログを削除する。設計書69〜136自体もまだTestFlightビルド未実施のため、本修正も含めて次回一括リリースの想定

### 思い出写真ピッカーの診断ログを削除（design 131の後始末）（2026-07-24実装、設計書138）
design 131で追加した診断ログ（`stamp_memory_photo_pick_start`/`_result`/`_error`）により、design 137でカメラピッカー起動不能の根本原因（`NSPhotoLibraryAddUsageDescription`欠落）を特定・修正できた。ユーザーが実機でカメラ/フォトライブラリ選択の正常動作を確認済みのため、CLAUDE.md既定の運用ルール通り役目を終えた使い捨て診断ログを削除した。
- `public/app.js`の`_pickStampMemoryPhotoBlob()`から3箇所の`_sendDebugLog()`呼び出しを削除。関数本体のロジック（プラグイン取得・`getPhoto()`呼び出し・Web版`<input type=file>`分岐）は無変更のまま維持
- `_sendDebugLog`関数自体・`POST /api/debug-log`エンドポイント自体は恒久ユーティリティのため削除していない（他機能の計装で引き続き使用）
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260723n`→`20260724a`、`sw.js` CACHE_NAME=`sg-weekend-v689`→`v690`（`app.css`は無変更のため据え置き）
- **このタスクをもってdesign 131〜138（思い出写真ピッカー実機診断）は解決済み**。設計書69〜137自体もまだTestFlightビルド未実施のため、本修正も含めて次回一括リリースの想定

### 探訪ティアの年数目安ラベルを変更（見習い0〜1年、定住レベル2〜4年）（2026-07-24実装、設計書139）
ユーザー要望により、探訪ティアの年数目安表示を再調整した。シンガポール通・極めし者は変更なし。
- `public/app.js`の`STAMP_LEVEL_META`定数、`standard`と`local`の`yearRange`/`yearRangeEn`の値のみ変更（キー名・構造は不変）: standard「1〜2年」→「0〜1年」/「1-2 years」→「0-1 years」、local「3〜4年」→「2〜4年」/「3-4 years」→「2-4 years」。`niche`（5年以上/5+ years）・`special`（10年以上/10+ years）は無変更
- レベル名（見習い/定住レベル/シンガポール通/極めし者）・絵文字・色・画像・`_stampLevelYearRange(meta)`ヘルパー本体は無変更
- `server.js`・データファイルは無変更（`pm2 restart`不要）。キャッシュバスティング: `index.html` app.js `?v=20260724a`→`20260724b`、`sw.js` CACHE_NAME=`sg-weekend-v690`→`v691`（`app.css`は無変更のため据え置き）
- **未検証（次回TestFlightビルド後にフォロー）**: iOS実機・Web版実機での新しい年数目安表示は2026-07-24時点でコード確認・ローカル配信反映確認のみ完了、実ブラウザ・実機とも未確認

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
- appId: `app.dosuru`（2026-07-10訂正: 以前`app.dosuru.odenavi`と誤記していたが、実際にApple Developer Portalに登録され署名・TestFlight配信に使われている値は`ios-app/capacitor.config.js`の`app.dosuru`） / appName: `おでかけNavi`
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
  - 通知タップ時: `pushNotificationActionPerformed`リスナーで共有カレンダー参加ダイアログ表示 or `switchNav('home')`
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

## ジャンル・興味機能（2026-07-02実装、おすすめモード周りは2026-07-11刷新）
- ジャンルマスター: GENRE_LIST 定数（13種）。id / emoji / label を持つ
- ユーザー設定: localStorage `app_genres`（選択ジャンルIDの配列）
- 設定場所: 設定画面「ジャンル・興味」セクション（`#genre-chips-container`）
- おすすめモード: 「すべて」チップとは別の独立した「おすすめ」チップ（`data-cat="recommend"`）を`toggleCatFilter('recommend')`でトグルして`_recommendModeActive`をON/OFFする。ジャンルマッチのイベントのみ表示（`genreMatch()`）
  - 「おすすめ」チップはジャンル未設定時（`getGenreList().length === 0`）は`display:none`で非表示（`_syncRecommendChip()`が制御）。ジャンルを1つ以上設定すると表示される
  - ジャンル未設定時のおすすめモード誘導は`#recommend-setup-banner`（5秒バナー）ではなく、`renderEventCards()`内のグリッド内インライン案内（⭐+説明文+「ジャンルを設定する」ボタン）。旧記載の5秒バナーは実態と乖離していたため訂正（2026-07-11）
  - `toggleCatFilter('recommend')`はジャンル未設定時、そもそも`_recommendModeActive`をONにせず入口で早期`return`する（2026-07-11、下記バグ修正で導入）
- 「すべて」チップは`filterCats.clear(); _recommendModeActive=false`する純粋な全件表示リセット専用ボタン。「おすすめ」チップとラベルが連動して変化する仕様ではない（旧記載「おすすめモードON時は⭐おすすめに変化」は誤り。訂正済み）
- イベントデータ: `genres` フィールド（文字列配列）。filter-events.js の filterBatch() で付与
- 遡及タグ付け: `node scripts/fill-genres.js --city=sg [--dry-run]`（Haiku、バッチ20件）

### ⚠️ チップ・タブの表示/非表示制御と、固定配列でのインデックス操作の相互作用に注意（2026-07-11教訓）
「おすすめ」チップをジャンル未設定時に`display:none`で非表示化した際、同じUI要素を対象にした**別の機構**（ホーム画面のカード領域スワイプでカテゴリを前後に切り替える機能、`public/app.js`）が、表示/非表示を考慮しない固定配列`CAT_ORDER`でインデックス計算していたため、「すべて」から右スワイプしても非表示の`recommend`が経路上に居座り続けて先のカテゴリへ進めなくなるバグが発生した（さらに`toggleCatFilter('recommend')`を一度ONにしてから`_syncRecommendChip()`が事後的にOFFへ戻す「二段構え」実装だったため、非表示チップに`.active`が誤って付与される副次的リスクもあった）。

**再発防止策**:
- チップ・タブ等のUI要素を`display:none`で動的に出し分ける変更を行う際は、その要素を対象にした「固定配列でのインデックス操作」「`querySelectorAll`での一覧取得」が他に無いか、変更前に`grep`等でコードベース全体を横断確認する
- 「非表示化」と「状態を強制的に戻すガード」を同じcommitで同時に導入する場合、両者の呼び出し順序・再入（同一関数呼び出しの流れの中で状態が書き換わって戻る）が無いか、変更後にシミュレーションする
- 上記スワイプ機構は2026-07-11に修正済み: `CAT_ORDER`固定配列を廃止し、`_visibleCatOrder()`（`#filter-row-category .filter-chip`をDOM順・`offsetParent !== null`でフィルタして動的算出）に置き換え。`toggleCatFilter('recommend')`もジャンル未設定時は入口で早期returnする方式に変更し、「一度ONにしてから戻す」二段構えを廃止

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

## 都市対応状況（2026-06-28更新、2026-07-12パイプライン構成変更に伴い記述更新）
- **SG（シンガポール）**: 稼働中
- **BKK（バンコク）**: 一時停止中（イベント数少ないため）
- **SYD（シドニー）**: 一時停止中（イベント数少ないため）

BKK/SYD 停止箇所:
1. `scripts/run-fetch-all.sh` — BKK/SYD fetchをコメントアウト済み
2. `scripts/run-source-analysis.sh` — discover/analyzeは `--city=sg` 固定
3. crontabの `refresh-courses.js --city=sg` 呼び出し（都市別）
4. `public/index.html` — `ACTIVE_CITIES = ['sg']` 定数で都市セレクトを制御

**復活手順:**
1. `index.html` の `ACTIVE_CITIES = ['sg']` → `['sg', 'bkk', 'syd']`
2. `run-fetch-all.sh` のコメントアウトを外し `--city=all` に戻す
3. `run-source-analysis.sh` の `--city=sg` を `--city=all` に戻す
4. crontabの `refresh-courses.js --city=sg` を `--city=all` に戻す

## SGエリア区分に「Sentosa」追加（2026-07-13実装、設計書24）
SGのエリア区分がCentral/East/West/North/North-East/Island-wideの6区分から、**Sentosa追加で7区分**になった。Sentosaはケーブルカー・モノレールで渡る独立した「行き先」であり、ユニバーサル・スタジオ／S.E.A.水族館（→Singapore Oceanarium）／ビーチ等、単独でコース1本分埋まる濃さのエリアのため独立区分化。
- 変更箇所: `public/app.js`の`CITY_COURSE_AREAS.sg`（コース作成画面のエリアチップ）、`public/index.html`の`#event-filter-sheet`内`.ef-chip`（イベント絞り込みシート、こちらはHTML直書きの別実装でJS定数とは独立）、`scripts/filter-events.js`の`CITY_AREAS.sg`（取り込みパイプラインのAI分類プロンプト用列挙値）
- `data/sg/events.json`のうち、既存でSentosa関連ながら`Island-wide`/`West`に誤分類されていた5件（Sentosa GrillFest 2026 / Resorts World Sentosa / Sentosa Island / Adventure Cove Waterpark / Singapore Oceanarium - Into the Glowcean）を`area`/`location`とも`Sentosa`に遡及修正済み
- `server.js`にエリア値のホワイトリスト検証は存在せず（`conditions.area`はAIプロンプトへの自由文字列埋め込みのみ）、追加にあたりサーバー側の変更は不要だった
- BKK/SYDのエリア区分は無変更（Sentosaはシンガポール固有地名のため対象外）

## イベント取り込みパイプライン構成（2026-07-12改訂・設計書18）

RSS/Instagram取得から`events.json`保存までのバッチ処理は、実行頻度の異なる3つのジョブに分離してcron管理している（旧: `run-fetch-all.sh`1本に全処理が同居していたが、フィード取得の取りこぼし対策として毎日実行化する際、頻度を変えるべきでない処理を分離した）。

| ジョブ | 内容 | 頻度（システムcrontab） | ログ |
|---|---|---|---|
| `scripts/run-fetch-all.sh` | `fetch-events.js --city=sg` → `check-content-integrity.js --city=sg` → `notify-fetch-summary.js`（LINE通知のみ） | 毎日 6:30 SGT | `logs/run-fetch-all.log` |
| `scripts/run-source-analysis.sh`（新規） | `discover-sources.js --city=sg --no-notify` → `analyze-sources.js --city=sg --no-notify` | 水・日 7:30 SGT | `logs/run-source-analysis.log` |
| `refresh-courses.js --city=sg`（cronから直接node実行） | システムコース2件削除→3件新規生成 | 水・日 8:00 SGT | `logs/refresh-courses.log` |

- **ハイウォーターマーク方式**（`scripts/fetch-events.js` `fetchRssItems()`）: 新規`data/source-fetch-state.json`（gitignore対象、コミットしない）にソースごとの`lastSeenGuids`（`item.guid`優先、無ければ`item.link`）と`lastFetchedAt`を保存し、前回取得時に見た記事を新着として再送しない。初回（該当ソースの状態未保存）は既存の`daysBack=7`カットオフにフォールバック。フィード取得自体が失敗したソースは状態を更新しない（次回また試行される）
- **Haiku採否基準**: `scripts/filter-events.js`の`scoreThreshold`は6（2026-07-12に5→6へ引き上げ）。カテゴリ補完の緩和基準は5（4→5に引き上げ、新閾値に対する相対的な緩和幅は維持）
- **ユーザー向けWebプッシュ通知は完全停止済み**（2026-07-12）: `notify-fetch-summary.js`は開発者向けLINE通知のみ送信し、`sendPushToAll()`を呼ぶ`/api/notify-events-updated`へのfetch呼び出しは削除済み。`server.js`側の同エンドポイント・`sendPushToAll()`関数自体は将来の手動再送信用に残置（呼び出し元がなくなっただけ）
- 上記変更の経緯・実測データ（8ソースの投稿ペース等）は`.claude/plan.md`「設計書18」参照

### `data/sources.json`の`status`フィールド運用（2026-07-14確定、設計書33）
`scripts/fetch-events.js`の`loadActiveSources()`は`status === 'active'`の1フィールドのみで取得可否を判定する（`feeds`・`instagramAccounts`共通）。`pausedAt`/`pausedReason`/`rejectedAt`/`rejectedReason`は記録用メタデータのみで、`fetch-events.js`からは一切参照されない（設定しても`status`自体を変えなければ取得は止まらない）。
- 正規サポート値は3つ: `"active"`（取得対象）/ `"paused"`（一時停止、将来の復活余地あり）/ `"rejected"`（永久除外）。`analyze-sources.js`側の命名慣習と統一されている
- `analyze-sources.js`の自動停止ロジックは`status`と`pausedAt`/`pausedReason`を**同時に**セットする実装になっている。`data/sources.json`を人力編集する際も、この3値+付随メタデータのセット漏れがないよう必ず両方同時に更新すること（過去に`pausedAt`のみ追記され`status`が`active`のまま残り、実際には停止していなかった不整合が発生した実例あり。`pinned:true`のソースは`analyze-sources.js`の自動停止対象外のため、この種の人力編集漏れが特に起きやすい）
- IGアカウント運用（2026-07-14時点）: `uniqlosg`は累計採用率4%のため`status:"rejected"`で永久除外。`mujisg`は`status:"paused"`（既存`pausedAt`/`pausedReason`はそのまま活用、値の再設定は不要だった）。`singaporezoo`→`mandaiwildlifereserve`、`nationalgallerysg`→`nationalgallerysingapore`、`TheProjectorSG`→`theprojectorsg`はユーザー名の誤り（実際の公式ハンドルと不一致）と判明し訂正。`artscience_museum`・`birdparadise_sg`は正しいユーザー名が特定できず配列から削除済み

### `scripts/filter-events.js` Sonnet記事生成失敗時のリトライ・除外ロジック（2026-07-14実装、設計書33）
`enrichBatch()`呼び出しループ（Sonnetでのバッチ記事生成）が失敗した場合、同じバッチで1回だけリトライする。リトライも失敗した場合、そのバッチに含まれるイベントは`enriched` Mapに登録しない。
- 結合ループ側は`enriched.get(f._enrichPos) || {}`（空オブジェクトへの無条件フォールバック）ではなく`enriched.has(f._enrichPos)`で判定し、登録されていない（＝記事生成に最終的に失敗した）イベントは`newItems`に追加せず`events.json`へ保存しない。バッチ丸ごと失敗・一部indexだけの部分的欠落のどちらのケースも同じ経路で除外される
- 除外件数は`⚠️ 記事生成に失敗したため${n}件のイベントを除外しました`としてログ出力する
- 既知の副次効果: `notify-fetch-summary.js`のLINE通知「◯件採用」の合計値はHaikuフィルタ通過数（`totalAccepted`）ベースのままで、この除外分は反映されない（通知ロジック自体は今回変更対象外）。ソース別内訳（`accepted/sent`）の方はSonnet失敗分がカウントされなくなり、より正確になった

### `scripts/filter-events.js` 画像URL疎通確認（2026-07-17実装、設計書57）
Alvinology（RSSソース）由来のイベントで、CDNオフロードプラグインのサブドメイン（`media.alvinology.com`）が記事公開直後の伝播遅延により403を返し、壊れた画像URLがそのまま`events.json`に保存される不具合が発生したため対策を追加した。
- 新規関数`isImageUrlReachable(url)`（HTTP HEAD優先、405/501ならGETにフォールバック、3秒タイムアウト、AbortControllerで打ち切り、例外はtry/catchで握りつぶし`false`を返す）を追加
- 既存のOGP画像フォールバック発火条件（`item.image === null` または Instagram CDN URL）に「疎通確認に失敗した場合」を追加。疎通確認・OGP取得の両方が失敗した場合は`item.image = null`にし、既存のUnsplash補完ロジックに委ねる
- RSS/Instagram問わず全ソースの新規イベントに汎用的に適用（Alvinology固有の特殊対応ではない）。Instagram由来の署名付きURL（有効期限切れが主リスク）は取得直後のバッチ内で疎通確認するため通常は問題を検知しない点に留意（詳細は`.claude/plan.md`「設計書57」参照）
- データパッチ: 2026-07-17時点で既に`events.json`へ保存されていたAlvinology由来2件（`im-qalb-by-pun-im.png`・`Fujifilm-quicksnap-kv.jpg`）の`image`を、CDNサブドメインではなくオリジンサーバー（`alvinology.com/wp-content/uploads/...`）のURLへ手動書き換え済み
- 同種の「URLはあるが実際には壊れている」既存イベントの全件スキャン・一括修復は今回のスコープ外（今後発覚した個別ケースごとに対応）

### `discover-sources.js`がAPIエラーを「投稿0件」として握りつぶす不具合の修正＋SGソース棚卸し（2026-07-19実施）
`data/source-history.json`（`fetch-events.js`が日次で蓄積する採用率データ、上表`run-fetch-all.sh`が毎日6:30 SGTに実行）をもとにSGソースを採用率順に確認したところ、`Alvinology`が送信数173件に対し採用率9%と効率が低かったため`status:"paused"`に変更した。

その過程で`data/source-candidates.json`（`discover-sources.js`が水・日7:30 SGTに生成する新規ソース候補）が長期間`potentialYield:0, avgScore:0`ばかりだったため実際にInstagram Graph APIで1件ずつ検証したところ、候補プール（`data/source-pool.json`）のユーザー名7件（`mandaiorchid`/`singartmuseum`/`futureworld.sg`/`fortcanningpark`/`singaporemuseums`/`sentosadevelopmentcorp`/`orchardroad`）が実際には存在しないアカウント名だったと判明。うち3件は実際の正しいハンドル（`singaporeartmuseum`/`nhb_sg`/`artsciencemuseumsg`、いずれも美術館・博物館系で`show`カテゴリ）を特定できたため`data/sources.json`に`active`で追加し、残り4件は正しいハンドルが特定できず`source-pool.json`から削除した。
- **根本原因**: `scripts/discover-sources.js`の`probeInstagram()`が、Graph APIが返すエラー（`data.error`、例:「ユーザーが見つかりません」）を無視し`data.business_discovery?.media?.data`が無い場合は無条件で投稿0件として扱っていたため、「存在しないアカウント」と「実在するが最近投稿が無いアカウント」が区別できず、壊れた候補がログにもLINE通知にも一切現れないまま候補プールに残り続けていた。同様に`probeRss()`もフィード取得失敗時に`[]`を返すのみで、呼び出し元（`buildCandidates()`/`buildReport()`）からは正常時の「投稿0件」と区別がつかなかった（フィード側は`catch`節で`log()`自体は出していたため、まだ発見しやすい方だった）
- **修正**: `probeInstagram()`/`probeRss()`の戻り値を`{ posts/items, apiError }`に変更し、APIエラー・フィード取得失敗時は`❌`ログで明示的に警告。`probeCity()`は`apiError`があれば`account.apiError`/`feed.apiError`として`source-pool.json`に永続化しスコアリングをスキップ。`buildCandidates()`は`apiError`ありの候補を「有望な候補」一覧から除外し新設の`_invalid`に分離、`buildReport()`（LINE通知本文）・`notify-fetch-summary.js`（日次summaryの候補探索セクション）双方に無効候補の件数・詳細を表示するようにした。これにより次回以降、壊れたユーザー名/URLが混入しても自動でLINE通知に出るようになり、今回のような手動API検証が不要になる
- **cron頻度の訂正（口頭説明の誤りの記録）**: 上表の通り実イベントの`fetch-events.js`自体は**毎日**6:30 SGT実行であり、新規追加した3ソースの採用実績（`source-history.json`）は翌日の日次fetchから貯まり始める。水・日7:30 SGTの`discover-sources.js`/`analyze-sources.js`（本節で扱った候補探索・不良ソース自動判定）はこれとは別サイクルで、新規候補の発掘・既存ソースの自動停止判定のみを担当する
- `server.js`・`public/`配下は無変更。`data/sources.json`/`data/source-pool.json`はgitignore対象のためgit管理外（`pm2 restart`不要）。`scripts/discover-sources.js`/`scripts/notify-fetch-summary.js`の変更はコミット・push済み（`main`のみ、cron専用スクリプトのためiOS/Web版への影響なし）

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

### ✅ 全画面共通キーボード被り対策（2026-07-09実装 → 同日Web版無効化 → 同日「縮小+移動」方式に刷新）

> ⚠️ **【2026-07-11 設計書15で撤去済み・以下の記述は実態と乖離しています】** ビューポート固着バグの真因が`ios-app/capacitor.config.js`の`contentInset:'always'`（→`'never'`に変更）と判明し、下記の`_adjustSheetForKb`/`_liftVisibleSheetForKeyboard`等のシート縮小・移動JS一式は**無害な被害者として全撤去した**。現在`public/app.js`に残るキーボード対策は「設定画面直下の入力欄（`#feedback-text`/`#nickname-input`）を逃がす軽量関数`_scrollFocusedIntoViewOnKb()`」のみで、`.plan-modal`/`.plan-sheet`系は内部スクロール（`.plan-modal-body{overflow-y:auto}`）とネイティブ挙動に委ねている。**このセクション本文（縮小+移動方式・冪等化・オーバーシュート経緯等）はTestFlight実機で対策の効果を確認でき次第、全面書き換える予定**（`.claude/next.md`参照）。それまでは歴史的経緯としてのみ残置。
>
> **【2026-07-11 設計書16追記】** `_scrollFocusedIntoViewOnKb()`は当初「シート内の入力欄は対象外（`focused.closest('.plan-modal, .plan-sheet')`で早期return）」だったが、この早期リターンを削除。既存の祖先スクロールロジック（`overflow-y:auto`コンテナの`scrollTop`を`overflow`分加算）が、コース作成シート（`#course-sheet`の`#course-note`）等のシート内入力欄にも適用されるようになった。合わせて、設計書14フェーズ1で暫定導入していた「予定作成モーダル新規時のメモ欄非表示化」（`#plan-custom-memo-section`のdisplay制御）も、根本対策（設計書15）成功により不要と判明し撤回。メモ欄は新規・編集どちらでも常時表示。
>
> **【2026-07-18 設計書59追記】** `_scrollFocusedIntoViewOnKb()`の`if (!foundContainer) { focused.scrollIntoView(...) }`フォールバック分岐を削除した（`#backup-passphrase-sheet`/`#cal-passphrase-sheet`が`.plan-modal-body`を持たずこのフォールバックに必ず入っていたことが、フィールド間フォーカス移動後にボタン行がボトムナビと重なる不具合の一因と推測されたため）。`overflow-y:auto`祖先が見つからない場合は現在は何もしない。合わせて`#backup-passphrase-sheet`・`#cal-passphrase-sheet`にも他シートと同じ`.plan-modal-body`ラッパーを追加し、`overflow-y:auto`祖先を持つ構造に統一した（詳細は上記「パスフレーズ入力シートのレイアウト修正」節参照）。

`.plan-modal` / `.plan-sheet`（`#title-edit-sheet`は`.plan-modal`クラスを持つため自動的に含まれる）を対象に、**シートを縮小しながら移動する方式**（シート上端の位置は変えず、下端側だけキーボード分削る）。**JSによる制御はCapacitor環境限定**。Web環境はネイティブ挙動に完全に委ねてJS制御なし。

- `_adjustSheetForKb(sheet, kbH)`: 表示中シートの`max-height`（またはheight）を`kbH`分縮小 + `bottom`を`kbH`に設定。`origH <= kbH + 80`の場合は縮小をスキップ（小さいシートで縮めすぎて表示崩れするのを防ぐガード）。どちらのプロパティを縮小したかは`sheet.dataset.kbIsMaxH`に記録。**2026-07-11に冪等化**: 初回適用時のみ「縮小前の元の高さ」を`sheet.dataset.kbOrigHeight`に保存し、2回目以降の呼び出しは必ずこの保存値を基準に`元の高さ - SAFE_GAP`を計算する（`getComputedStyle`の現在値からの相対計算はしない）。詳細は下記「フィールド間フォーカス移動時の多重縮小」参照
- `_resetSheetAfterKb(sheet)`: `dataset.kbIsMaxH`を見て`maxHeight`または`height`のうち縮小した方だけを元に戻し、`bottom`もリセット。`dataset.kbOrigHeight`も同時に削除する
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

### ⚠️ ボトムシートの縮小・移動処理は「現在値からの相対計算」ではなく「初期値基準の絶対計算」で冪等にする（フィールド間フォーカス移動時の多重縮小、2026-07-11発見・修正）

**症状**: 「予定を追加」モーダルでタイトル欄→メモ欄など、同一シート内でフィールド間のフォーカスを移動すると、モーダルの高さが極端に潰れてヘッダーだけが画面下部にごく小さく表示される状態になった。

**原因**: iOSネイティブの一般的挙動として、同一フォーム内でテキストフィールド間のフォーカスが移動する場合（キーボードは表示されたまま消えない）、`keyboardWillHide`は発火せず`keyboardWillShow`のみがフォーカス変更のたびに再送される。旧`_adjustSheetForKb`は**呼ばれるたびに`getComputedStyle`の「現在の」`max-height`を読み、そこからさらに`SAFE_GAP`分を差し引く**相対計算だった。縮めすぎ防止ガード（`curH <= SAFE_GAP + 80`）は「初期状態からの1回の縮小」しか安全性を保証できない設計だったため、`keyboardWillShow`が複数回再発火すると縮小が際限なく積み重なった。

**修正**: 「縮小前の元の高さ」を初回適用時のみ`sheet.dataset.kbOrigHeight`に保存し、2回目以降は必ずこの保存値を基準に絶対値で再計算する（同じ`kbH`が何度来ても同じ最終状態に収束する）。`_resetSheetAfterKb`実行時に保存値もクリアする。

**再発防止の教訓**: ボトムシートの「縮小・移動」系の状態変更処理に限らず、**同一イベント（`keyboardWillShow`等）が1シーケンス中に複数回発火しうるケース**（フィールド間移動・画面回転・外部キーボード着脱など）を実装時に必ず想定し、「N回呼ばれても同じ最終状態に収束するか」をレビュー観点に加えること。`getComputedStyle`の相対値を基準に差分計算する方式ではなく、初期値を保存しておいてそこから絶対値で再計算する冪等な方式を標準パターンとする。2026-07-09の「シート上端が画面外に出る」オーバーシュート問題と根は同じ（「イベント再発火を想定していない一回限りの計算」）だが、今回は下端側の縮小が多重適用されて全体が潰れる新パターン。

### ⚠️ 「スクロールで押し上げる」対策は対象コンテナの伸びしろが要求量を上回っているか確認する（設定画面フィードバック欄、2026-07-11修正）

**症状**: 設定画面「改善要望」欄・ニックネーム欄にフォーカスしても、キーボードに隠れたまま送信ボタンが見えない状態が解消しなかった。

**原因**: `.screen-scroll-content`の`padding-bottom:80px`が、実機ログで確認された実際に必要なスクロール量（146〜239px）に対して不足していた。JS側の祖先探索・`scrollTop`加算ロジック自体は正しく動作していたが、`scrollTop`は`scrollHeight - clientHeight`で物理的に頭打ちになるため、既存paddingの範囲を超えて動かすことができなかった（「命令は出したが動かせる余地が無かった」）。

**修正**: キーボード表示中のみ`.screen-scroll-content`に一時的な`padding-bottom`（`kbHeight + 80`px）を動的付与してスクロールの伸びしろを確保してから`scrollTop`を加算するようにした。元のpadding値は`dataset`に保存し、`_resetSheetKeyboardOffset()`実行時（キーボードが閉じたタイミング）に必ず元へ戻す（戻し忘れると閉じた後も余分な余白が残る新規バグになるため要注意）。

**再発防止の教訓**: 「スクロールで押し上げる」系の対策を実装する際は、対象コンテナが物理的にスクロール可能な量（`scrollHeight - clientHeight`、既存paddingに依存）が要求量を上回っているか必ず考慮する。対象がスクロールコンテナの末尾に近い要素であるほど、既存paddingだけでは不足しがちなので、キーボード表示中は動的に伸びしろを確保する設計を標準パターンにする。診断ログは「要求値」だけでなく「適用後の実測値」も併記すると原因切り分けが早い。

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
