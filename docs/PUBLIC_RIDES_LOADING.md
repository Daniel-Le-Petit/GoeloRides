# Chargement des sorties publiques — 1er novembre 2026

Les lectures en production ont confirmé que `routes_list`, `routes_upcoming_homepage` et `home_priority_alerts` répondent avec succès. Le problème reproduit concerne le couplage à la session Supabase : la liste attendait la résolution du rôle puis les inscriptions et participants ; la lecture de l’accueil utilisait aussi le client connecté, qui peut attendre un renouvellement de session.

`js/goelo-public-data.js` lit uniquement les fonctions publiques avec la clé publique déjà utilisée par le site, sans session ni cookie, avec un délai limite de 12 secondes. Les informations privées d’administration continuent de passer par le client authentifié et ses permissions habituelles.

L’accueil et la page Sorties affichent leurs cartes dès réception des données publiques. Les inscriptions, participants et informations météo arrivent ensuite. Une déconnexion retire immédiatement les données privées avant tout rechargement. Une erreur réseau reste distincte d’une véritable liste vide et permet de réessayer.

Validation : lectures des trois fonctions en production ; tests navigateur du vrai rendu des deux pages avec session et enrichissements volontairement bloqués, contrôles de l’état admin puis de la déconnexion, panne réseau, nouvelle tentative et mobile. Les tests ne modifient aucune sortie réelle.


## Démarrage intégré avant les autres scripts

Le maintien du message initial malgré le délai de reprise montre que le démarrage du module ne peut pas être présumé. La configuration publique est désormais chargée dans l’en-tête. Une première lecture via XMLHttpRequest est intégrée directement après le conteneur des sorties, avant les bibliothèques externes et les autres modules. Elle peut afficher des cartes simples, un état vide ou une erreur avec reprise, sans aucun SDK ni module annexe. Les cartes enrichies prennent ensuite le relais lorsque leurs scripts sont prêts. Le module de lecture réutilise la première réponse pour éviter une seconde requête inutile.

`js/goelo-rides-early.js` est la source intégrée dans les deux pages HTML. Le test `early-rides-browser.cjs` bloque volontairement tous les autres scripts et vérifie l’affichage, le filtrage des données privées, l’erreur et la reprise. Le test `public-rides-loading-browser.cjs` vérifie aussi le relais vers les cartes enrichies.

Le premier texte devient « Recherche des sorties… ». Le maintien de l’ancien « Chargement… » après publication doit conduire à vérifier la version réellement déployée sur Render, et non à supposer qu’un nouveau correctif est déjà exécuté sur le téléphone.
