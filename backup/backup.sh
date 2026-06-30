#!/bin/bash
set -euo pipefail

# cron invokes this script with a sanitized environment, so pick up
# the docker-compose env vars persisted by docker-entrypoint.sh.
if [ -f /etc/backup.env ]; then
    source /etc/backup.env
fi

TIMESTAMP=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR="/backups"
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"

echo "[$(date -Iseconds)] Starting backup: ${BACKUP_FILE}"
mysqldump \
    -h "${MYSQL_HOST}" \
    -u "${MYSQL_USER}" \
    -p"${MYSQL_PASSWORD}" \
    --no-tablespaces \
    "${MYSQL_DATABASE}" \
    | gzip > "${BACKUP_FILE}"

echo "[$(date -Iseconds)] Backup complete. Removing files older than 30 days."
find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +30 -delete
echo "[$(date -Iseconds)] Done."
