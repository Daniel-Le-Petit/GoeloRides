#!/bin/bash

echo "🚴 Déploiement GoëloRides (MAIN ONLY MODE)"

# 1. Toujours rester sur branche actuelle pour commit
echo "📦 Staging changes..."
git add .

if git diff --cached --quiet; then
  echo "⚠️ Rien à déployer"
  exit 0
fi

echo "💾 Commit sur branche courante..."
git commit -m "deploy"

# 2. Sauvegarde sécurité (rebase simple vers main)
echo "🔀 Switching to main..."
git checkout main

echo "⬇️ Sync main..."
git pull origin main

echo "🚀 Merge changes..."
git merge test-good-version

echo "🚀 Push main..."
git push origin main

echo "✅ Deploy terminé"
