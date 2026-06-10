echo "🚴 Déploiement GoëloRides..."
echo "📦 Adding files..."
git add .

echo "🧠 Checking changes..."
git diff --cached --quiet && echo "✅ Nothing to deploy" && exit 0

echo "💾 Committing..."
git commit -m "deploy"

echo "🚀 Pushing..."
git push origin main

echo "✅ Deploy finished"
