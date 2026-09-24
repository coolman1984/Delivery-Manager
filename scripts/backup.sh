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

# نسخة من الصور المرفوعة (لوجوهات وصور المنتجات)
if [ -d /media ] && [ -n "$(ls -A /media 2>/dev/null)" ]; then
  MEDIA_FILE="$DIR/media-$STAMP.tar.gz.enc"
  tar czf - -C /media . \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$MEDIA_FILE"
  echo "✅ نسخة الصور: $MEDIA_FILE"
fi

# مسح النسخ الأقدم من المدة المحددة
find "$DIR" \( -name 'delivery-*.dump.enc*' -o -name 'media-*.tar.gz.enc' \) -mtime "+$KEEP" -delete
