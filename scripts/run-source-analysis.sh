#!/bin/bash
# discover-sources → analyze-sources を直列実行
# 週2回（水・日）のみ実行される、ソース候補探索・採用率分析の重い処理をfetchから分離したもの（設計書18）。

NODE=/usr/bin/node
SCRIPTS=/home/masahiko/sg-weekend-app/scripts

echo "[$(date)] run-source-analysis.sh 開始"

$NODE $SCRIPTS/discover-sources.js --city=sg --no-notify || echo "[WARN] discover-sources failed"
$NODE $SCRIPTS/analyze-sources.js --city=sg --no-notify || echo "[WARN] analyze-sources failed"

echo "[$(date)] run-source-analysis.sh 完了"
