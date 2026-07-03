# おでかけNavi iOS アプリ — セットアップ手順

## 概要

このディレクトリにはCapacitorを使ったiOSアプリのビルド設定が入っています。
MacInCloud（またはローカルMac）で一度だけ初期セットアップを行い、
以降は `release` ブランチへのpushだけでApp Storeに自動デプロイされます。

---

## 初回セットアップ（MacInCloud / ローカルMac で一度だけ）

### 前提条件

- Xcode 15以上がインストールされていること
- Node.js 20以上がインストールされていること
- Apple Developer Programに登録済みであること（$99/年）
- App Store ConnectでApp IDを作成済みであること（`app.dosuru.odenavi`）

### 1. リポジトリのクローン

```bash
git clone https://github.com/oguworld/sg-weekend-app.git
cd sg-weekend-app/ios-app
```

### 2. Capacitorの依存パッケージをインストール

```bash
npm install
```

### 3. iOS プロジェクトを追加

```bash
npx cap add ios
```

### 4. アイコン・スプラッシュ画像を適用

```bash
npx capacitor-assets generate --ios
```

または `resources/icon.png`（1024×1024px）と `resources/splash.png`（2732×2732px）を
Xcodeの `App/Assets.xcassets` に手動で配置してください。

### 5. Xcodeで初回確認

```bash
npx cap open ios
```

Xcodeが開いたら以下を確認してください：
- Bundle Identifier: `app.dosuru.odenavi`
- Signing & Capabilities でDeveloperアカウントを選択
- ビルドが通ることを確認（実機またはシミュレーター）

### 6. Fastlaneのセットアップ

```bash
gem install bundler
bundle install
```

### 7. App Store Connect APIキーの設定

App Store Connectで「ユーザーとアクセス」→「キー」からAPIキーを作成し、
ダウンロードした `.p8` ファイルを保存してください。

```bash
fastlane init
```

プロンプトに従ってApp Store Connect APIキーを設定します。

### 8. Match（証明書管理）の初期化

証明書を管理するためのprivate GitHubリポジトリを事前に作成してください（例: `sg-weekend-certs`）。

```bash
fastlane match init
```

GitリポジトリのURLを入力して初期化します。

```bash
fastlane match appstore
```

App Store用の証明書・プロビジョニングプロファイルを生成してGitHubに保存します。

### 9. GitHub Secretsに認証情報を登録

GitHubリポジトリの Settings → Secrets and variables → Actions に以下を登録してください：

| Secret名 | 内容 |
|---|---|
| `ASC_KEY_ID` | App Store Connect APIキーのID |
| `ASC_ISSUER_ID` | App Store Connect APIキーの発行者ID |
| `ASC_PRIVATE_KEY` | `.p8` ファイルの中身（改行含む文字列） |
| `MATCH_PASSWORD` | Match証明書リポジトリの暗号化パスワード |
| `MATCH_GIT_BASIC_AUTH` | 証明書repoへのアクセス用（`username:token` 形式） |

---

## 日常的なリリース手順

1. `main` ブランチで開発・テスト
2. リリースしたいタイミングで `release` ブランチにマージ/push
3. GitHub Actionsが自動でビルド → App Store申請
4. App Store Connectで審査に提出
5. Appleの審査通過 → ユーザーに届く

```bash
git checkout release
git merge main
git push origin release
```

---

## ローカルでFastlaneを手動実行する場合

TestFlight経由でテスト配信:

```bash
cd ios-app
bundle exec fastlane beta
```

App Storeに本番申請:

```bash
cd ios-app
bundle exec fastlane deploy
```

---

## アイコン・スプラッシュ画像について

| ファイル | サイズ | 備考 |
|---|---|---|
| `resources/icon.png` | 1024×1024px | App Storeアイコン用（生成済み） |
| `resources/splash.png` | 2732×2732px | スプラッシュ画面用（背景#FFF9F2・生成済み） |

生成スクリプト: プロジェクトルートで `node -e "..."` でsharpを使って生成済みです。
デザインを変更する場合は `public/icons/icon-512.png` を差し替えて再生成してください。

---

## トラブルシューティング

### Xcodeビルドが失敗する場合

```bash
cd ios-app
npx cap sync ios
```

を実行してから再度試してください。

### 証明書エラーが出る場合

```bash
cd ios-app
bundle exec fastlane match appstore --force
```

で証明書を再生成してください。
