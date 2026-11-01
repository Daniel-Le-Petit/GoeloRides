# Chargement des sorties publiques — 1er novembre 2026

Les lectures en production ont confirmé que `routes_list`, `routes_upcoming_homepage` et `home_priority_alerts` répondent avec succès. Le problème reproduit concerne le couplage à la session Supabase : la liste attendait la résolution du rôle puis les inscriptions et participants ; la lecture de l’accueil utilisait aussi le client connecté, qui peut attendre un renouvellement de session.

`js/goelo-public-data.js` lit uniquement les fonctions publiques avec la clé publique déjà utilisée par le site, sans session ni cookie, avec un délai limite de 12 secondes. Les informations privées d’administration continuent de passer par le client authentifié et ses permissions habituelles.

L’accueil et la page Sorties affichent leurs cartes dès réception des données publiques. Les inscriptions, participants et informations météo arrivent ensuite. Une déconnexion retire immédiatement les données privées avant tout rechargement. Une erreur réseau reste distincte d’une véritable liste vide et permet de réessayer.

Validation : lectures des trois fonctions en production ; tests navigateur du vrai rendu des deux pages avec session et enrichissements volontairement bloqués, contrôles de l’état admin puis de la déconnexion, panne réseau, nouvelle tentative et mobile. Les tests ne modifient aucune sortie réelle.
