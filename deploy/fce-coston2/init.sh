#!/bin/sh
set -eu

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"

mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --execute="CREATE DATABASE IF NOT EXISTS indexer; CREATE USER IF NOT EXISTS 'jorqeth'@'%' IDENTIFIED BY '${DB_PASSWORD}'; GRANT ALL PRIVILEGES ON indexer.* TO 'jorqeth'@'%'; FLUSH PRIVILEGES;"
