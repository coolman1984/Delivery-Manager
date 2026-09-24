#!/usr/bin/env bash
# بيعمل نسخة احتياطية كل يوم الساعة ٣ الفجر بتوقيت القاهرة (وقت الطلبات فيه قليلة)
set -euo pipefail
export TZ=Africa/Cairo
until pg_isready -q; do sleep 5; done
while true; do
  now=$(date +%s)
  next=$(date -d 'tomorrow 03:00' +%s)
  [ "$(date +%H)" -lt 3 ] && next=$(date -d 'today 03:00' +%s)
  sleep $((next - now))
  bash /scripts/backup.sh || echo "❌ فشل النسخ الاحتياطي $(date)"
done
