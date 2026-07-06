#!/bin/bash
# iOS App Store リリーススクリプト
# 使い方: ./scripts/release-ios.sh [minor|patch]
# 省略時は minor (1.0 → 1.1)

set -e

BUMP=${1:-minor}
PKG="ios-app/package.json"

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
echo "例: AIコース作成機能の改善・予定表UIのリニューアル"
read -r NOTES
if [ -z "$NOTES" ]; then
  NOTES="バグ修正とパフォーマンス改善"
fi
echo "リリースノート: ${NOTES}"

# package.json のバージョンを更新
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('${PKG}', 'utf8'));
pkg.version = '${NEW_VERSION}';
pkg.releaseNotes = '${NOTES}';
fs.writeFileSync('${PKG}', JSON.stringify(pkg, null, 2) + '\n');
"

# main にコミット
git add "${PKG}"
git commit -m "chore: iOS v${NEW_VERSION} リリース準備

${NOTES}"

echo ""
echo "✅ バージョンを ${CURRENT} → ${NEW_VERSION} に更新しました"
echo "✅ リリースノート: ${NOTES}"
echo ""
echo "push してよければ以下を実行:"
echo "  git push origin main && git push origin main:release"
