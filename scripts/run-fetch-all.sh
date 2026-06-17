#!/bin/bash
# fetch-events（全都市）→ analyze-sources → notify-fetch-summary を直列実行

NODE=/home/masahiko/.nvm/versions/node/v22.22.3/bin/node
SCRIPTS=/home/masahiko/sg-weekend-app/scripts

echo "[$(date)] run-fetch-all.sh 開始"

$NODE $SCRIPTS/fetch-events.js --city=sg  || echo "[WARN] sg fetch failed"
$NODE $SCRIPTS/fetch-events.js --city=bkk || echo "[WARN] bkk fetch failed"
$NODE $SCRIPTS/fetch-events.js --city=syd || echo "[WARN] syd fetch failed"

$NODE $SCRIPTS/analyze-sources.js --city=all --no-notify
$NODE $SCRIPTS/notify-fetch-summary.js

echo "[$(date)] run-fetch-all.sh 完了"
