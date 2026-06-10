#!/usr/bin/env bash
set -euo pipefail

PROJECT="/media/daniel/HDD/AIFB/GoeloRides"
PORT="${PORT:-8765}"

echo "🧪 GoëloRides DEVIN TEST MODE"
echo "================================"

cd "$PROJECT"

echo ""
echo "💾 Sauvegarde état actuel..."
git stash -u || true

echo ""
echo "📡 Fetch branches Devin..."
git fetch origin

echo ""
echo "🌿 Branches disponibles :"
git branch -r | grep devin || true

echo ""
read -p "👉 Branche Devin à tester : " BRANCH

echo ""
echo "🔀 Switch sur $BRANCH"

git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"

echo ""
echo "🧹 Vérification port $PORT..."

if lsof -i :$PORT > /dev/null 2>&1; then
  echo "⚠️ Port $PORT occupé → arrêt du process"
  lsof -ti :$PORT | xargs kill -9 || true
fi

echo ""
echo "🚀 Lancement serveur"
echo "👉 http://127.0.0.1:$PORT"
echo ""

exec ./serve.sh
