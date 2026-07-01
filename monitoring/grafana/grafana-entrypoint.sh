#!/bin/sh
set -e

TMPL=/etc/grafana/provisioning/alerting/contact-points.yaml.tmpl
OUT=/etc/grafana/provisioning/alerting/contact-points.yaml

if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
  sed -e "s|\${TELEGRAM_BOT_TOKEN}|$TELEGRAM_BOT_TOKEN|g" \
      -e "s|\${TELEGRAM_CHAT_ID}|$TELEGRAM_CHAT_ID|g" \
      "$TMPL" > "$OUT"
else
  rm -f "$OUT"
fi

exec /run.sh "$@"
