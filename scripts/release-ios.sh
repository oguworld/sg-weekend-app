#!/bin/bash
# iOS App Store リリーススクリプト
# 使い方: ./scripts/release-ios.sh [minor|patch]
# 省略時は minor (1.0 → 1.1)

set -e

BUMP=${1:-minor}
PKG="ios-app/package.json"

# main ブランチ上にいることを確認
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "❌ main ブランチで実行してください（現在: ${BRANCH}）"
  exit 1
fi

# 未コミットの変更がないことを確認
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ 未コミットの変更があります。先にコミットしてください。"
  git status --short
  exit 1
fi

# 現在のバージョン取得
CURRENT=$(node -p "require('./${PKG}').version")
echo "現在のバージョン: ${CURRENT}"

# バージョンを上げる
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
if [ "$BUMP" = "major" ]; then
  MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0
elif [ "$BUMP" = "minor" ]; then
  MINOR=$((MINOR + 1)); PATCH=0
else
  PATCH=$((PATCH + 1))
fi
NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
echo "新しいバージョン: ${NEW_VERSION}"

# リリースノートを入力
echo ""
echo "リリースノートを入力してください（空のままEnterでデフォルト文）:"
echo "例: AIコース機能の改善・予定表UIのリニューアル"
read -r NOTES
if [ -z "$NOTES" ]; then
  NOTES="バグ修正とパフォーマンス改善"
fi
echo "リリースノート: ${NOTES}"

# package.json のバージョンとリリースノートを更新
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('${PKG}', 'utf8'));
pkg.version = '${NEW_VERSION}';
pkg.releaseNotes = '${NOTES}';
fs.writeFileSync('${PKG}', JSON.stringify(pkg, null, 2) + '\n');
"

# コミット
git add "${PKG}"
git commit -m "chore: iOS v${NEW_VERSION}

${NOTES}

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011UMzPgrJqFHvFc6SJDqiuJ"

echo ""
echo "✅ バージョンを ${CURRENT} → ${NEW_VERSION} に更新しました"
echo "✅ リリースノート: ${NOTES}"
echo ""
echo "⚠️  プライバシーポリシーURLを確認しましたか？"
echo "   App Store Connect → アプリ情報 → プライバシーポリシーURL"
echo "   現在の推奨値: https://dosuru.app/privacy"
echo ""
echo "問題なければ以下を実行:"
echo "  git push origin main && git push origin main:release --force"
