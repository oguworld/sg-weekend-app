#!/bin/bash
# イベント取得のみを行う軽量な追加ジョブ（1日複数回実行、LINE通知なし）
# 目的: フィードの窓が狭く投稿頻度が高いソース（Goody Feed/The Smart Local/Eatbook等）で、
# 1日1回の取得（run-fetch-all.sh、6:30 SGT）だけでは記事がフィードから流れ落ちて
# 取りこぼされるリスクを減らすため、追加で取得のみ行う。
# 生活情報取得（fetch-life-info.js）・LINE通知（notify-fetch-summary.js）は含まない
# （本ジョブの目的はevents.jsonへの取りこぼし防止のみ。通知は6:30 SGTの本実行のみで行う）

NODE=/usr/bin/node
SCRIPTS=/home/masahiko/sg-weekend-app/scripts

echo "[$(date)] run-fetch-extra.sh 開始"

$NODE $SCRIPTS/fetch-events.js --city=sg || echo "[WARN] sg fetch failed"

# コンテンツ整合性チェック（タイトルと説明の入れ替わり検出）
$NODE $SCRIPTS/check-content-integrity.js --city=sg || echo "[WARN] コンテンツ重複を検出しました。events.jsonを確認してください。"

echo "[$(date)] run-fetch-extra.sh 完了"
