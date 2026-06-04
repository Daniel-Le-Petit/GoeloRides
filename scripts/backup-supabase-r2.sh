#!/usr/bin/env bash
# Dump Postgres (Supabase) → fichier custom → upload Cloudflare R2 (API S3).
# Utilisation : définir les variables (fichier .env.backup ou secrets GitHub Actions), puis :
#   bash scripts/backup-supabase-r2.sh
#
# Prérequis : postgresql-client (pg_dump), aws-cli v2.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env.backup" ]]; then
  # shellcheck source=/dev/null
  set -a && source "$ROOT/.env.backup" && set +a
fi

: "${SUPABASE_DATABASE_URL:?Définir SUPABASE_DATABASE_URL (URI Postgres Supabase, port 5432 recommandé)}"
: "${R2_ACCOUNT_ID:?Définir R2_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?Définir R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?Définir R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET_NAME:?Définir R2_BUCKET_NAME}"

R2_PREFIX="${R2_PREFIX:-backups/goelorides-}"
DAY="$(date -u +%Y-%m-%d)"
KEY="${R2_PREFIX}${DAY}.dump"
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
TMP="$(mktemp -t goelorides-pgdump.XXXXXX.dump)"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

echo "→ pg_dump (format custom, sans owner/acl)…"
pg_dump "$SUPABASE_DATABASE_URL" \
  -Fc \
  --no-owner \
  --no-acl \
  -f "$TMP"

echo "→ Upload s3://${R2_BUCKET_NAME}/${KEY}"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"

aws s3 cp "$TMP" "s3://${R2_BUCKET_NAME}/${KEY}" \
  --endpoint-url "$ENDPOINT" \
  --no-progress

echo "OK — ${KEY}"
