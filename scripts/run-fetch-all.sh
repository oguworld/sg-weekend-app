#!/bin/bash
# fetch-events（全都市）→ check-content-integrity → notify-fetch-summary を直列実行
# 毎日実行される軽量パイプライン。discover-sources/analyze-sources は
# run-source-analysis.sh（cron個別エントリ）に分離済み（設計書18）。
# コース機能は設計書178で完全削除済みのため refresh-courses.js への言及は削除済み。

NODE=/usr/bin/node
SCRIPTS=/home/masahiko/sg-weekend-app/scripts

echo "[$(date)] run-fetch-all.sh 開始"

$NODE $SCRIPTS/fetch-events.js --city=sg  || echo "[WARN] sg fetch failed"
# BKK/SYD 一時停止中（復活時は下2行のコメントを外す）
# $NODE $SCRIPTS/fetch-events.js --city=bkk || echo "[WARN] bkk fetch failed"
# $NODE $SCRIPTS/fetch-events.js --city=syd || echo "[WARN] syd fetch failed"

# コンテンツ整合性チェック（タイトルと説明の入れ替わり検出）
$NODE $SCRIPTS/check-content-integrity.js --city=sg || echo "[WARN] コンテンツ重複を検出しました。events.jsonを確認してください。"

# 生活情報・ニュースのキュレーション取得（設計書172。イベント通知とまとめて1通のLINE通知にするため
# notify-fetch-summary.js より前に実行する。旧・独立cronエントリは廃止）
# ユーザー向けプッシュ通知（notifyContentUpdated()）は6:30 SGTのこの回にのみ送る（2026-09-09、ユーザー要望により
# 19:30 SGTから朝の6:30 SGTに戻した。理由: 朝が最も通知を見る・通勤中にアプリを開くのがルーティーンのため）。
# 12:30/19:30 SGT（run-fetch-extra.sh）側は`--no-notify`を付けて通知を抑制する
# （開発者向けLINE通知=notify-fetch-summary.jsは従来通り毎回実行、影響を受けない）
$NODE $SCRIPTS/fetch-life-info.js --city=sg || echo "[WARN] life-info fetch failed"

$NODE $SCRIPTS/notify-fetch-summary.js

echo "[$(date)] run-fetch-all.sh 完了"
