#!/bin/bash
set -e

REPO=/home/masahiko/sg-weekend-app
LOG=$REPO/logs/github-backup.log

echo "[$(date '+%Y-%m-%d %H:%M:%S SGT')] Starting backup" >> "$LOG"

cd "$REPO"

# .env から LINE 認証情報を取得
LINE_TOKEN=$(grep '^LINE_CHANNEL_ACCESS_TOKEN=' "$REPO/.env" 2>/dev/null | cut -d'=' -f2-)
LINE_USER=$(grep '^LINE_USER_ID=' "$REPO/.env" 2>/dev/null | cut -d'=' -f2-)

notify_line() {
  local msg="$1"
  if [ -n "$LINE_TOKEN" ] && [ -n "$LINE_USER" ]; then
    curl -s -X POST https://api.line.me/v2/bot/message/push \
      -H "Authorization: Bearer $LINE_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"to\":\"$LINE_USER\",\"messages\":[{\"type\":\"text\",\"text\":\"$msg\"}]}" \
      >> "$LOG" 2>&1 || true
  fi
}

# CLAUDE.md をソースコードの変更内容に合わせて更新
/home/masahiko/.nvm/versions/node/v22.22.3/bin/node "$REPO/scripts/update-claude-md.js" >> "$LOG" 2>&1

/usr/bin/git add .

if /usr/bin/git diff --cached --quiet; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S SGT')] No changes to commit" >> "$LOG"
  notify_line "💾 GitHub バックアップ\n━━━━━━━━━━━━━━\n変更なし（スキップ）\n実行: $(date '+%Y-%m-%d %H:%M') SGT"
  exit 0
fi

CHANGED_FILES=$(/usr/bin/git diff --cached --name-only | wc -l | tr -d ' ')

/usr/bin/git commit -m "Weekly backup $(date '+%Y-%m-%d')"
/usr/bin/git push origin main

echo "[$(date '+%Y-%m-%d %H:%M:%S SGT')] Backup completed" >> "$LOG"

notify_line "💾 GitHub バックアップ完了\n━━━━━━━━━━━━━━\n変更ファイル: ${CHANGED_FILES}件\nコミット: Weekly backup $(date '+%Y-%m-%d')\n実行: $(date '+%Y-%m-%d %H:%M') SGT"
