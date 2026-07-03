#!/bin/bash
# fetch-events（全都市）→ discover-sources → analyze-sources → notify-fetch-summary を直列実行

NODE=/home/masahiko/.nvm/versions/node/v22.22.3/bin/node
SCRIPTS=/home/masahiko/sg-weekend-app/scripts

echo "[$(date)] run-fetch-all.sh 開始"

$NODE $SCRIPTS/fetch-events.js --city=sg  || echo "[WARN] sg fetch failed"
# BKK/SYD 一時停止中（復活時は下2行のコメントを外す）
# $NODE $SCRIPTS/fetch-events.js --city=bkk || echo "[WARN] bkk fetch failed"
# $NODE $SCRIPTS/fetch-events.js --city=syd || echo "[WARN] syd fetch failed"

$NODE $SCRIPTS/discover-sources.js --city=sg --no-notify || echo "[WARN] discover-sources failed"
$NODE $SCRIPTS/analyze-sources.js --city=sg --no-notify
$NODE $SCRIPTS/notify-fetch-summary.js

# コンテンツ整合性チェック（タイトルと説明の入れ替わり検出）
$NODE $SCRIPTS/check-content-integrity.js --city=sg || echo "[WARN] コンテンツ重複を検出しました。events.jsonを確認してください。"

# コースリフレッシュ: システムコース2件削除 → 3件新規生成（都市別）
echo "[$(date)] コースリフレッシュ開始"
$NODE $SCRIPTS/refresh-courses.js --city=sg >> /home/masahiko/sg-weekend-app/logs/refresh-courses.log 2>&1 || echo "[WARN] refresh-courses failed"
# BKK/SYD 一時停止中（復活時: --city=sg を --city=all に戻す）

echo "[$(date)] run-fetch-all.sh 完了"
