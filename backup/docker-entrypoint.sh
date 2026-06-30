#!/bin/bash
set -euo pipefail

# crond runs jobs with a sanitized environment, so docker-compose's
# `environment:` vars (visible here, in PID 1) never reach backup.sh
# when cron triggers it. Persist them to a file backup.sh can source.
printenv | grep -E '^(MYSQL_HOST|MYSQL_USER|MYSQL_PASSWORD|MYSQL_DATABASE)=' > /etc/backup.env
chmod 600 /etc/backup.env

exec crond -n
