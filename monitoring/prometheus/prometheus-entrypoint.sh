#!/bin/sh
set -e

TMPL=/etc/prometheus/web.yml.tmpl
OUT=/etc/prometheus/web.yml

sed -e "s|\${PROMETHEUS_BASIC_AUTH_USER}|$PROMETHEUS_BASIC_AUTH_USER|g" \
    -e "s|\${PROMETHEUS_BASIC_AUTH_HASH}|$PROMETHEUS_BASIC_AUTH_HASH|g" \
    "$TMPL" > "$OUT"

exec /bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --web.console.libraries=/usr/share/prometheus/console_libraries \
  --web.console.templates=/usr/share/prometheus/consoles \
  --web.config.file="$OUT"
