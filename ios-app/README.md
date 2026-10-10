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
- App Store ConnectでApp IDを作成済みであること（`app.dosuru`）

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
- Bundle Identifier: `app.dosuru`
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

**注意**: 現行の`Fastfile`（`deploy`/`release_production`レーン）はFastlane Match（証明書の自動管理）を
使用していません。配布証明書（`.p12`、`DIST_CERT_BASE64`/`DIST_CERT_PASSWORD`）とプロビジョニング
プロファイル（`.mobileprovision`、`PROVISION_PROFILE_BASE64`）は、事前に手動で作成しbase64化して
GitHub Secretsに登録する運用です。`fastlane match init`は本プロジェクトでは不要です。

### 8. GitHub Secretsに認証情報を登録

GitHubリポジトリの Settings → Secrets and variables → Actions に以下を登録してください：

| Secret名 | 内容 |
|---|---|
| `ASC_KEY_ID` | App Store Connect APIキーのID |
| `ASC_ISSUER_ID` | App Store Connect APIキーの発行者ID |
| `ASC_PRIVATE_KEY` | `.p8` ファイルの中身（改行含む文字列） |
| `DIST_CERT_BASE64` | 配布用証明書（`.p12`）をbase64化した文字列 |
| `DIST_CERT_PASSWORD` | 上記`.p12`のパスワード |
| `PROVISION_PROFILE_BASE64` | App Store配布用プロビジョニングプロファイル（`.mobileprovision`）をbase64化した文字列 |
| `APPLE_TEAM_ID` | Apple Developer Team ID（`4P3SWV4X5U`） |

※ `release_production`レーン（本番審査提出）も上記と同じSecretsをそのまま使います。追加のSecret登録は不要です。

---

## 日常的なリリース手順（TestFlight配信）

1. `main` ブランチで開発・テスト
2. リリースしたいタイミングで `release` ブランチにマージ/push
3. GitHub Actions（`ios-deploy.yml`）が自動でビルド → TestFlightへアップロード（社内テストのみ、`distribute_external: false`）
4. TestFlightで動作確認

```bash
git checkout release
git merge main
git push origin release
```

---

## App Store本番審査提出（`release_production`、設計書223）

既存のTestFlight配信フロー（`release`ブランチpush→`ios-deploy.yml`）とは完全に分離した、
**手動実行専用**のワークフローです。`push`では絶対に起動しません。

- ワークフローファイル: `.github/workflows/ios-release-production.yml`
- 起動方法: GitHubリポジトリの Actions タブ →「iOS Release to App Store (Production Review Submission)」→
  「Run workflow」→ `confirm`入力欄に**厳密に`SUBMIT`**と入力して実行（大文字小文字・前後の空白も含めて完全一致が必要。
  一致しない場合はジョブの最初のステップで`exit 1`し、以降の処理は一切実行されません）
- 実行内容: 証明書インポート・ビルドまでは`deploy`レーンと同一。最後に`fastlane release_production`を実行し、
  `deliver`アクションで以下を行う:
  - `skip_metadata: true` / `skip_screenshots: true`（説明文・スクリーンショット等は変更せず、
    App Store Connect上に既に設定済みのメタデータをそのまま使う）
  - `submit_for_review: true`（審査に提出）
  - `automatic_release: true`（**審査通過後、人間の追加操作なしで即座に一般公開**）
  - `force: true`（CI非対話実行のため確認プロンプトをスキップ）

### 実行前に必ず確認すること

1. **App Store Connect APIキーの権限確認**: 既存の`ASC_KEY_ID`/`ASC_ISSUER_ID`/`ASC_PRIVATE_KEY`は
   TestFlightアップロード用に発行されたものであり、`deliver`（審査提出）に必要な権限（App Manager以上）を
   持っているかは未確認です。権限不足の場合はワークフロー実行時にエラーになります（ビルド自体は成功して
   いるため、既存のTestFlight配信には影響しません）。権限不足の場合は、App Store Connect
   （ユーザー: WILLOA PTE. LTD.、Team ID: `4P3SWV4X5U`）で新しいAPIキーをApp Manager以上のロールで発行し、
   GitHub Secretsの該当3つを更新してください。
2. **初回実行は何か軽微な変更を含むビルドで試すことを推奨**: `automatic_release: true`により審査通過後は
   即座に一般公開されるため、まずは文言修正等の軽微な変更を一度TestFlightにアップロードした上で、この
   ワークフローを手動実行して一連の動作（ビルド→審査提出→可能であれば権限確認）を確かめてから本格運用に
   入ることを推奨します。

---

## ローカルでFastlaneを手動実行する場合

TestFlight経由でテスト配信:

```bash
cd ios-app
bundle exec fastlane deploy
```

App Store本番審査提出（`automatic_release: true`、実行注意は上記参照）:

```bash
cd ios-app
bundle exec fastlane release_production
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

本プロジェクトはFastlane Matchを使用していません。`DIST_CERT_BASE64`/`DIST_CERT_PASSWORD`/
`PROVISION_PROFILE_BASE64`（GitHub Secrets）の配布証明書・プロビジョニングプロファイルが
有効期限切れ・失効していないか、Apple Developerサイトで確認してください。失効している場合は
新しい証明書・プロビジョニングプロファイルを作成し、base64化してSecretsを更新してください。
