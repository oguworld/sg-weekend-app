#!/bin/bash
# data/(いいね・イベント・くらし情報等、gitに入らないデータ)と.env(秘密情報)を日次でローカル退避する。14日分を保持。
# 退避先はホーム配下の~/backups/daily(権限700)。VPS自体が失われた場合は守れないため、オフサイト退避は別途。
cd "$(dirname "$0")/.." || exit 1
DEST="$HOME/backups/daily"
mkdir -p "$DEST" && chmod 700 "$DEST"
STAMP=$(TZ='Asia/Singapore' date +%Y%m%d)
OUT="$DEST/sg-weekend-data-$STAMP.tar.gz"
tar -czf "$OUT.tmp" data content .env 2>/dev/null && mv "$OUT.tmp" "$OUT" && chmod 600 "$OUT"
ls -1t "$DEST"/sg-weekend-data-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "$(date -Is) backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
