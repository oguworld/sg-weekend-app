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

## コース機能（2026-06-22実装）
- ナビ: 探す / コース / 予定表 / 設定 の4タブ
- AIプリセットコース: `data/{city}/model-courses.json`
- ユーザー公開コース: `data/{city}/community-courses.json`
- マイコース: localStorage `{city}_my_courses`
- API: GET /api/courses, POST /api/courses/generate, POST /api/courses/publish, POST /api/courses/:id/like
- 初期データ生成: `node scripts/generate-model-courses.js --city=sg`
- 画像補完: `node scripts/fill-images.js --city=sg`

## アーキテクチャルール
- ビジネスロジックはサーバーサイドに置く
- フロントエンドはAPI経由でデータを取得する
- DBは使わない、JSONファイルで管理する

## UIルール
- 日本語UI
- スマホファースト
- Tailwind CSSを使う
- 既存のデザインパターンを踏襲する

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
