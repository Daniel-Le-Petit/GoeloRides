#!/usr/bin/env bash
# Télécharge un .dump depuis R2 et lance pg_restore vers une base cible.
# Usage :
#   bash scripts/restore-supabase-from-r2.sh 2026-06-04
#   bash scripts/restore-supabase-from-r2.sh backups/goelorides-2026-06-04.dump
#
# ⚠️  Restaurer sur la PROD peut écraser des données. Utilise une base de staging / projet Supabase de test.
# Prérequis : aws-cli v2, postgresql-client (pg_restore).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env.backup" ]]; then
  # shellcheck source=/dev/null
  set -a && source "$ROOT/.env.backup" && set +a
fi

: "${R2_ACCOUNT_ID:?Définir R2_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?Définir R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?Définir R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET_NAME:?Définir R2_BUCKET_NAME}"
: "${TARGET_DATABASE_URL:?Définir TARGET_DATABASE_URL (base où restaurer — pas la prod sans réflexion)}"

R2_PREFIX="${R2_PREFIX:-backups/goelorides-}"
ARG="${1:?Usage : $0 YYYY-MM-DD   ou   $0 clé/suffixe complète (ex. backups/goelorides-2026-06-04.dump)}"

if [[ "$ARG" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  KEY="${R2_PREFIX}${ARG}.dump"
else
  KEY="$ARG"
fi

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
TMP="$(mktemp -t goelorides-restore.XXXXXX.dump)"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"

echo "→ Téléchargement s3://${R2_BUCKET_NAME}/${KEY}"
aws s3 cp "s3://${R2_BUCKET_NAME}/${KEY}" "$TMP" \
  --endpoint-url "$ENDPOINT" \
  --no-progress

echo "→ pg_restore (sans owner ; --clean supprime objets existants avant recréation — DANGEREUX)"
read -r -p "Taper OUI pour lancer pg_restore sur la cible : " confirm
if [[ "$confirm" != "OUI" ]]; then
  echo "Annulé."
  exit 1
fi

pg_restore \
  --dbname="$TARGET_DATABASE_URL" \
  --no-owner \
  --clean \
  --if-exists \
  --verbose \
  "$TMP"

echo "OK — restore terminé."
