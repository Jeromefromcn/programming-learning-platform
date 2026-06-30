#!/bin/bash
set -euo pipefail

# cron jobs run in a sanitized environment and don't inherit the
# docker-compose env vars injected into PID 1. Persist them to a file
# that backup.sh sources, so the nightly cron-triggered dump has
# MYSQL_HOST/USER/PASSWORD/DATABASE available.
: > /etc/backup.env
for var in MYSQL_HOST MYSQL_USER MYSQL_PASSWORD MYSQL_DATABASE; do
    echo "${var}=${!var}" >> /etc/backup.env
done
chmod 600 /etc/backup.env

exec "$@"
