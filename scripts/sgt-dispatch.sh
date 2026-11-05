#!/bin/bash
# crontabのCRON_TZ指定が、このサーバーのcron(3.0pl1-137ubuntu3)では実際には
# スケジュール判定に反映されないことが実機検証で判明したため(2026-10-25、設計書253)、
# cron自体は5分おきに起動するだけにとどめ、SGT(Asia/Singapore、夏時間なし)の時刻判定は
# このスクリプトが`TZ`環境変数オーバーライド(POSIX標準、システムのタイムゾーン設定に
# 依存しない)で自前で行う方式にした。
cd "$(dirname "$0")/.." || exit 1

HM=$(TZ='Asia/Singapore' date +%H:%M)
DOW=$(TZ='Asia/Singapore' date +%u)   # 1=月 2=火 3=水 4=木 5=金 6=土 7=日

# イベント取得（毎日7:00 SGT）
if [ "$HM" = "07:00" ]; then
  ./scripts/run-fetch-all.sh >> logs/run-fetch-all.log 2>&1
fi

# ソース分析・候補探索（水・日 7:30 SGT）
if [ "$HM" = "07:30" ] && { [ "$DOW" = "3" ] || [ "$DOW" = "7" ]; }; then
  ./scripts/run-source-analysis.sh >> logs/run-source-analysis.log 2>&1
fi

# X投稿下書きのLINE通知（朝8:00・夜18:00 SGT、毎日）
if [ "$HM" = "08:00" ] || [ "$HM" = "18:00" ]; then
  /usr/bin/node ./scripts/post-to-x.js --city=sg --to-line >> logs/post-to-x-draft.log 2>&1
fi

# イベント追加取得（平日月〜金のみ 12:00・21:00 SGT）
if { [ "$HM" = "12:00" ] || [ "$HM" = "21:00" ]; } && [ "$DOW" -le 5 ]; then
  ./scripts/run-fetch-extra.sh >> logs/run-fetch-extra.log 2>&1
fi

# data/の日次バックアップ（毎日3:00 SGT）
if [ "$HM" = "03:00" ]; then
  ./scripts/backup-data.sh >> logs/backup-data.log 2>&1
fi
