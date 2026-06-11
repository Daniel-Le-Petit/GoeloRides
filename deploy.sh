#!/bin/bash

echo "🚴 Déploiement GoëloRides (MAIN ONLY MODE)"

# 1. Toujours basculer sur main
echo "🔀 Switching to main..."
git checkout main

# 2. Synchroniser avec GitHub
echo "⬇️ Pull latest main..."
git pull origin main

# 3. Ajouter les changements
echo "📦 Adding files..."
git add .

# 4. Vérifier s’il y a quelque chose à commit
if git diff --cached --quiet; then
  echo "⚠️ Rien à déployer sur main"
  exit 0
fi

# 5. Commit
echo "💾 Committing..."
git commit -m "deploy"

# 6. Push strict sur main
echo "🚀 Pushing to main..."
git push origin main

echo "✅ Deploy terminé sur main"
