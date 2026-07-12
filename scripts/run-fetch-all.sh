#!/bin/bash
# fetch-events（全都市）→ check-content-integrity → notify-fetch-summary を直列実行
# 毎日実行される軽量パイプライン。discover-sources/analyze-sources/refresh-courses は
# run-source-analysis.sh / refresh-courses.js（cron個別エントリ）に分離済み（設計書18）。

NODE=/usr/bin/node
SCRIPTS=/home/masahiko/sg-weekend-app/scripts

echo "[$(date)] run-fetch-all.sh 開始"

$NODE $SCRIPTS/fetch-events.js --city=sg  || echo "[WARN] sg fetch failed"
# BKK/SYD 一時停止中（復活時は下2行のコメントを外す）
# $NODE $SCRIPTS/fetch-events.js --city=bkk || echo "[WARN] bkk fetch failed"
# $NODE $SCRIPTS/fetch-events.js --city=syd || echo "[WARN] syd fetch failed"

# コンテンツ整合性チェック（タイトルと説明の入れ替わり検出）
$NODE $SCRIPTS/check-content-integrity.js --city=sg || echo "[WARN] コンテンツ重複を検出しました。events.jsonを確認してください。"

$NODE $SCRIPTS/notify-fetch-summary.js

echo "[$(date)] run-fetch-all.sh 完了"
