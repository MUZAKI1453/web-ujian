#!/bin/sh
# Cadangan harian database CBT kedua sekolah. Pasang lewat cron root, misalnya:
#   15 1 * * * /opt/cbt/deploy/backup-db.sh
# Jalankan juga secara manual sebelum dan sesudah setiap sesi ujian.
set -eu
DIR=/var/backups/cbt
mkdir -p "$DIR"
chmod 700 "$DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
for DB in cbt_smp cbt_sma; do
    FILE="$DIR/$DB-$STAMP.sql.gz"
    mariadb-dump --single-transaction --quick "$DB" | gzip > "$FILE"
    echo "Cadangan tersimpan: $FILE"
done
# Gambar soal (file di luar database).
if [ -d /var/lib/cbt ]; then
    tar -czf "$DIR/cbt_gambar-$STAMP.tar.gz" -C /var/lib cbt
    echo "Cadangan tersimpan: $DIR/cbt_gambar-$STAMP.tar.gz"
fi
# Simpan 14 hari terakhir.
find "$DIR" \( -name 'cbt_*.sql.gz' -o -name 'cbt_gambar-*.tar.gz' \) -mtime +14 -delete
