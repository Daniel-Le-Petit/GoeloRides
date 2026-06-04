#!/usr/bin/env bash
# Sert le site statique en local (même dossier que ce script).
# Usage : ./serve.sh          → http://127.0.0.1:8765/
#         PORT=8080 ./serve.sh  → autre port (pense à l’ajouter au CORS Supabase si besoin)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
PORT="${PORT:-8765}"
echo "GoëloRides — http://127.0.0.1:${PORT}/"
echo "Arrêt : Ctrl+C"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
