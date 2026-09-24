#!/usr/bin/env bash
# استرجاع نسخة احتياطية. تحذير: بيكتب فوق البيانات الحالية!
# الاستخدام: bash scripts/restore.sh backups/delivery-XXXX.dump.enc
set -euo pipefail
FILE="${1:?اكتب مسار ملف النسخة}"
: "${BACKUP_PASSPHRASE:?محتاج BACKUP_PASSPHRASE}"
sha256sum -c "$FILE.sha256"
read -r -p "⚠️ ده هيمسح البيانات الحالية ويرجّع النسخة. اكتب نعم للتأكيد: " ok
[ "$ok" = "نعم" ] || exit 1
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" \
  | pg_restore --clean --if-exists --no-owner --dbname="${PGDATABASE:-delivery}"
echo "✅ اتسترجعت النسخة"
