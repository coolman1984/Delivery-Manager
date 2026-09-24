#!/usr/bin/env bash
# نسخة احتياطية مشفّرة من قاعدة البيانات. محتاج: PGHOST PGUSER PGPASSWORD PGDATABASE BACKUP_PASSPHRASE
set -euo pipefail
: "${BACKUP_PASSPHRASE:?محتاج BACKUP_PASSPHRASE}"
DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="$DIR/delivery-$STAMP.dump.enc"

pg_dump --format=custom --no-owner \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
sha256sum "$FILE" > "$FILE.sha256"
echo "✅ نسخة احتياطية: $FILE ($(du -h "$FILE" | cut -f1))"

# مسح النسخ الأقدم من المدة المحددة
find "$DIR" -name 'delivery-*.dump.enc*' -mtime "+$KEEP" -delete
