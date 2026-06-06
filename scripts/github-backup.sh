#!/bin/bash
set -e

REPO=/home/masahiko/sg-weekend-app
LOG=$REPO/logs/github-backup.log

echo "[$(date '+%Y-%m-%d %H:%M:%S SGT')] Starting backup" >> "$LOG"

cd "$REPO"
/usr/bin/git add .

if /usr/bin/git diff --cached --quiet; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S SGT')] No changes to commit" >> "$LOG"
  exit 0
fi

/usr/bin/git commit -m "Weekly backup $(date '+%Y-%m-%d')"
/usr/bin/git push origin main

echo "[$(date '+%Y-%m-%d %H:%M:%S SGT')] Backup completed" >> "$LOG"
