# Observations des parcours utilisateurs

Le suivi public couvre Accueil, Sorties, Fiche sortie, Groupes, Infos pratiques et Album. Il réutilise la RPC `activity_event_log` et l'enveloppe déjà disponible `RIDE_INFO_OPENED`, avec `metadata.analytics_version = 1`. Aucune nouvelle table, permission de lecture publique ou migration n'est nécessaire. Les anciens événements sans ce marqueur conservent leur sens.

`analytics_action` distingue `page` (page ouverte), `available` (bloc présent et affichable), `exposed` (au moins 50 % du bloc ou de la hauteur de l'écran pendant une seconde continue), `used` (interaction/résultat) et `navigation` (destination et emplacement du lien). Une exposition n'est pas une preuve de lecture. Les événements sont dédupliqués par fonctionnalité, action et résultat pour chaque affichage de page. Le retour BFCache démarre un nouvel affichage.

Les résultats GPX distinguent un fichier préparé d'un simple lien ouvert. Les votes réussis exigent une réponse serveur ; leurs valeurs, textes libres et identifiants de vote ne sont pas journalisés ici. Le comparateur de niveau journalise son utilisation sans les valeurs saisies. Les tentatives et confirmations de participation existantes restent la source des étapes d'inscription : aucune modification de cette fonctionnalité.

Les métadonnées ajoutées contiennent des clés de fonctionnalités connues, la page, l'identifiant aléatoire d'affichage, éventuellement l'identifiant de sortie, et une provenance sans paramètres d'URL. Aucun contenu de formulaire ou jeton de participation n'est ajouté. Les robots déclarés, navigateurs automatisés et visites localhost ne produisent pas ce nouveau suivi. Cela ne détecte pas tous les robots.

Le Dashboard lit au plus 5 000 événements accessibles sur 30 jours, avec pagination et borne temporelle fixe. Si la vue est inaccessible, la RPC existante fournit au plus 200 traces ; cette couverture limitée est annoncée. Le filtre 7/30 jours ne garantit pas qu'une période soit complète : un nettoyage ou une suppression peut réduire l'historique.

Les parcours d'un même identifiant navigateur sont séparés après 30 minutes d'inactivité. Les compteurs ne sont pas des visiteurs uniques. Le dénominateur de visibilité utilise les blocs réellement proposés, pas la seule visite d'une page. Les données historiques sans nouveau suivi ne permettent pas de calculer une absence d'exposition. Les suggestions de visibilité n'apparaissent qu'à partir de cinq parcours concernés ; elles sont des pistes, pas des diagnostics. Une interaction précédant une inscription ne démontre pas un lien causal.

Tests : `node --test goelorides-tests/tests/unit/*insights.test.cjs goelorides-tests/tests/unit/feature-tracking.test.cjs goelorides-tests/tests/unit/activity-registration.test.cjs goelorides-tests/tests/unit/guest-pseudo*.test.cjs`.
