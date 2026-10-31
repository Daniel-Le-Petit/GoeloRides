# Alertes prioritaires de l’accueil

Les annulations et changements de date, d’heure de départ ou d’heure de rendez-vous des sorties publiques sont enregistrés côté serveur. Une première visite suffit pour les voir : aucun historique local ni connexion n’est nécessaire.

Le bloc s’affiche avant la navigation et le hero, en rouge pour une annulation et en orange pour un changement de programme. Il n’a pas de fermeture mémorisée : l’information réapparaît à chaque ouverture tant qu’elle est pertinente.

## Périmètre

- Sorties des sept prochains jours, calculées en Europe/Paris ; un report d’une sortie imminente reste annoncé même si sa nouvelle date est plus éloignée.
- Ancien et nouvel horaire présentés ensemble, avec le titre, le groupe, le lieu et un lien vers la fiche.
- Actualisation toutes les 60 secondes, au retour sur l’onglet et au rétablissement de la connexion.
- Les annonces déjà connues restent affichées avec un avertissement si l’actualisation échoue.
- Aucune annonce issue d’une sortie privée, sur invitation, d’un brouillon ou d’une sortie inactive. Une sortie annulée ayant été publique peut garder son annonce lorsque son statut la fait passer en brouillon.
- Une réouverture retire l’annonce d’annulation.

Les annulations publiques déjà présentes sont reprises lors de la migration. Les anciens changements d’horaire ne peuvent pas être reconstitués : la capture commence à l’installation du déclencheur.

## Installation et validation

Migration : `supabase/migrations/20261031150000_home_priority_alerts.sql`.
Appliquée via GitHub Actions, run `41233612902`, après réussite des tests PostgreSQL isolés. La table est inaccessible directement aux visiteurs ; seule une fonction publique ne retournant que les informations nécessaires est exposée.

Vérifications : PostgreSQL (capture, permissions, expiration, réouverture, report, visibilité) ; navigateur (première visite, position avant le hero, mobile/ordinateur, horaires, échappement, actualisation, panne réseau) ; annulation dans l’éditeur (enregistrement réel et absence de faux succès).

Le bouton « Confirmer l’annulation » dans l’éditeur enregistre désormais le statut en base avant d’annoncer le succès. Il conserve les autres paramètres et la visibilité de la sortie.

Les tests n’annulent aucune sortie réelle ; ils utilisent une base isolée ou des réponses simulées. La présence des annonces sur le site Render dépend de son déploiement du dernier code de la branche main.

## Pilotage par l’administrateur

Dans **Admin → Alertes accueil** (`admin.html#admin-home-alerts`), chaque sortie publique pertinente dispose d’un état, d’un message facultatif limité à 400 caractères et des commandes **Afficher sur l’accueil / Actualiser le message** et **Retirer**. Un lien ouvre aussi l’éditeur de la sortie.

Le retrait masque l’alerte pour tous les visiteurs et reste mémorisé en base ; il ne change pas la sortie. Une nouvelle annulation ou modification de date/horaires réactive l’alerte automatique et efface le message devenu potentiellement obsolète. Une réactivation manuelle préserve la nature et les anciens horaires de l’alerte automatique. Une nouvelle alerte manuelle sur une sortie non annulée est présentée comme une « Information importante », sans prétendre qu’un horaire a changé.

La migration `20261031170000_admin_home_alerts.sql` a été appliquée via le run GitHub Actions `41234254407`, après réussite des tests PostgreSQL isolés. Chaque commande vérifie le rôle admin côté serveur ; les Ride Leaders, utilisateurs ordinaires et visiteurs ne peuvent pas activer ou retirer une alerte. La liste exclut aussi les sorties privées et les brouillons.

Les visiteurs voient la publication ou le retrait au prochain chargement de l’accueil ou lors de son actualisation automatique (au maximum 60 secondes pendant que l’onglet reste ouvert). Les essais navigateur utilisent des réponses simulées ; aucune alerte réelle n’a été déclenchée pour tester l’interface.
