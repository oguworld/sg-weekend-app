#!/bin/bash
# イベント取得＋生活情報取得を行う追加ジョブ（1日複数回実行、開発者向けLINE通知なし）
# 目的: フィードの窓が狭く投稿頻度が高いソース（Goody Feed/The Smart Local/Eatbook等）で、
# 1日1回の取得（run-fetch-all.sh、6:30 SGT）だけでは記事がフィードから流れ落ちて
# 取りこぼされるリスクを減らすため、追加で取得のみ行う。
# 開発者向けLINE通知（notify-fetch-summary.js）は含まない（本ジョブの目的はevents.json/
# life-info.jsonへの取りこぼし防止のみ。LINE通知は6:30 SGTの本実行のみで行う）。
#
# fetch-life-info.js（くらし情報、設計書183で追加）は12:30/19:30 SGTの両方で呼ぶが、
# ユーザー向けプッシュ通知（notifyContentUpdated()）は19:30 SGTの回にのみ送る。
# このスクリプト自体は12:30/19:30の両方で同一コマンドとしてcron起動されるため、
# 実行時点のSGT時刻から19:30側かどうかを判定する（19時台なら19:30側とみなす）。

NODE=/usr/bin/node
SCRIPTS=/home/masahiko/sg-weekend-app/scripts

echo "[$(date)] run-fetch-extra.sh 開始"

$NODE $SCRIPTS/fetch-events.js --city=sg || echo "[WARN] sg fetch failed"

# コンテンツ整合性チェック（タイトルと説明の入れ替わり検出）
$NODE $SCRIPTS/check-content-integrity.js --city=sg || echo "[WARN] コンテンツ重複を検出しました。events.jsonを確認してください。"

# くらし情報取得（設計書183）: SGT 19時台の実行時のみユーザー向けプッシュ通知を送る
SGT_HOUR=$(TZ=Asia/Singapore date +%H)
if [ "$SGT_HOUR" = "19" ]; then
  echo "[$(date)] SGT ${SGT_HOUR}時台のため通知ありで実行"
  $NODE $SCRIPTS/fetch-life-info.js --city=sg || echo "[WARN] life-info fetch failed"
else
  echo "[$(date)] SGT ${SGT_HOUR}時台のため通知なしで実行"
  $NODE $SCRIPTS/fetch-life-info.js --city=sg --no-notify || echo "[WARN] life-info fetch failed"
fi

echo "[$(date)] run-fetch-extra.sh 完了"
