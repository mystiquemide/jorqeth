#!/bin/sh
set -eu

: "${FCE_MYSQL_PASSWORD:?FCE_MYSQL_PASSWORD is required}"

awk -v password="$FCE_MYSQL_PASSWORD" \
  '{ gsub(/__FCE_MYSQL_PASSWORD__/, password); print }' \
  /app/config/config.template.toml > /app/config/config.toml

exec "$@"
