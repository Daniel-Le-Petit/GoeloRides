#!/usr/bin/env bash
pg_dump "postgresql://postgres:Oriane64?!@db.iqxyiwnjwcepfgngkzsm.supabase.co:5432/postgres" -s > schema.sql


SUPABASE_DATABASE_URL=https://iqxyiwnjwcepfgngkzsm.supabase.co

set -euo pipefail

: "${SUPABASE_DATABASE_URL:?Définir SUPABASE_DATABASE_URL}"

OUTFILE="goelorides-schema-$(date +%Y%m%d-%H%M%S).sql"

echo "Export du schéma vers $OUTFILE ..."

pg_dump "$SUPABASE_DATABASE_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --file="$OUTFILE"

echo
echo "Schema exporté : $OUTFILE"
