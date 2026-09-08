#!/bin/bash
# イベント取得＋生活情報取得を行う追加ジョブ（1日複数回実行）
# 目的: フィードの窓が狭く投稿頻度が高いソース（Goody Feed/The Smart Local/Eatbook等）で、
# 1日1回の取得（run-fetch-all.sh、6:30 SGT）だけでは記事がフィードから流れ落ちて
# 取りこぼされるリスクを減らすため、追加で取得を行う。
#
# 開発者向けLINE通知（notify-fetch-summary.js）: 設計書187で12:30/19:30の両方に追加し、
# 1日3回（6:30/12:30/19:30）その都度その回だけの件数を通知する方式に変更した
# （2026-09-07時点では「通知は6:30のみ、過去24時間分を合算」だったが、ユーザー要望により
# 1日3通に増えることを許容の上で「毎回・その回だけの件数」方式に戻した）。
#
# fetch-life-info.js（くらし情報、設計書183で追加）は12:30/19:30 SGTの両方で呼ぶが、
# ユーザー向けプッシュ通知（notifyContentUpdated()）はrun-fetch-all.sh（6:30 SGT）側にのみ送るため、
# このスクリプトの12:30/19:30両方とも`--no-notify`を付けて通知を抑制する（2026-09-09、ユーザー要望により
# 19:30固定から6:30固定に変更）。
# この--no-notify制御（ユーザー向けプッシュ通知）は開発者向けLINE通知とは完全に独立しており、
# 設計書187では変更していない。

NODE=/usr/bin/node
SCRIPTS=/home/masahiko/sg-weekend-app/scripts

echo "[$(date)] run-fetch-extra.sh 開始"

$NODE $SCRIPTS/fetch-events.js --city=sg || echo "[WARN] sg fetch failed"

# コンテンツ整合性チェック（タイトルと説明の入れ替わり検出）
$NODE $SCRIPTS/check-content-integrity.js --city=sg || echo "[WARN] コンテンツ重複を検出しました。events.jsonを確認してください。"

# くらし情報取得（設計書183）: ユーザー向けプッシュ通知は6:30 SGT（run-fetch-all.sh）側にのみ送るため、
# このスクリプト（12:30/19:30 SGT）は常に--no-notifyで実行する（2026-09-09変更）
SGT_HOUR=$(TZ=Asia/Singapore date +%H)
echo "[$(date)] SGT ${SGT_HOUR}時台のため通知なしで実行"
$NODE $SCRIPTS/fetch-life-info.js --city=sg --no-notify || echo "[WARN] life-info fetch failed"

# 開発者向けLINE通知（設計書187: 1日3回、その回だけの件数を通知する）
$NODE $SCRIPTS/notify-fetch-summary.js

echo "[$(date)] run-fetch-extra.sh 完了"
