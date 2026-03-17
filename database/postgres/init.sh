#!/bin/bash
set -e

echo "=== RKS-Transports: Running schema.sql ==="
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/01-schema.sql

echo "=== RKS-Transports: Running seed.sql ==="
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/02-seed.sql

echo "=== RKS-Transports: Database initialized successfully ==="
