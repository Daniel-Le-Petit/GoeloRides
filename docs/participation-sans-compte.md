# Participation sans compte — préparation, non activée

La version actuelle du site reste inchangée : `GUEST_PARTICIPATION_ENABLED` est faux.
Ne pas annoncer cette fonctionnalité comme disponible avant la migration, le déploiement du service et un essai réel.

## Parcours préparé

- Le visiteur voit « Je participe ! » et « Sans compte : pseudo + e-mail privé ».
- Le dialogue demande un pseudo public et un e-mail privé. Aucun utilisateur Auth ni profil n’est créé.
- Un e-mail contient un lien privé ; la page demande un clic explicite pour confirmer. L’ouverture seule du lien ne réserve pas de place.
- Le même lien permet d’annuler avec confirmation. Le pseudo est ajouté à la liste des invités existante ; l’e-mail reste dans une table privée.
- La confirmation est possible 24 heures, selon la capacité réelle. Le système ne réserve pas de place pendant cette attente et ne place pas les invités en liste d’attente.
- Les inscriptions membres continuent à utiliser leur parcours actuel. La capacité compte aussi les invités ; un verrou commun protège les appels de participation membres, invités et ajout manuel.
- Les événements d’inscription ne sont émis qu’après confirmation serveur. Ouverture du formulaire, e-mail envoyé, erreurs et réponses facultatives aux hésitations restent des observations distinctes.

## Mise en service indispensable

1. Vérifier la migration `supabase/migrations/20261028180000_guest_self_participation.sql` sur une base isolée correspondant à la production, notamment les fonctions existantes `toggle_signup`, `guest_participant_add`, `_signup_route_capacity` et `_signup_promote_waitlist`.
2. Appliquer cette migration via le mécanisme de déploiement Supabase habituel. Elle crée les tables privées, les quotas et les fonctions service-only ; elle modifie la capacité commune et enveloppe les fonctions existantes dans un verrou. Ne pas la réexécuter manuellement après succès : suivre le registre des migrations.
3. Configurer dans les secrets de l’Edge Function, sans les mettre dans Git :
   - `RESEND_API_KEY` : service Resend avec expéditeur vérifié ; adapter l’envoi si le service existant est différent.
   - `GUEST_MAIL_FROM` : expéditeur vérifié.
   - `GUEST_RATE_LIMIT_SECRET` : secret aléatoire pour hacher les identifiants utilisés par les quotas.
   - `GUEST_SITE_ORIGIN=https://goelorides.onrender.com`.
   - `GUEST_PARTICIPATION_ENABLED=true` côté Edge seulement après vérification de la configuration.
   Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` restent exclusivement côté Edge et sont fournies par Supabase.
4. Déployer `supabase functions deploy guest-participation` avec son `config.toml`. La fonction est publique car elle ne nécessite pas de compte ; les opérations privées exigent un jeton aléatoire de 256 bits dont seul le haché est stocké.
5. Déployer les fichiers statiques, d’abord avec le drapeau du site faux. Vérifier une demande, la réception du mail, la confirmation, l’affichage du pseudo, la confidentialité de l’e-mail et l’annulation sur une sortie dédiée de test.
6. Passer `GUEST_PARTICIPATION_ENABLED` à vrai dans `js/goelo-config.js`, puis redéployer le site. Vérifier aussi Safari et le navigateur intégré à Facebook.

## Validation avant activation

- Tests Node `guest-participation-edge.test.cjs` : service et e-mails simulés ; aucun e-mail réel envoyé.
- Régression existante `activity-registration.test.cjs` : le parcours membre reste inchangé si la fonctionnalité est désactivée.
- Syntaxe JS vérifiée. La migration SQL, la concurrence PostgreSQL réelle, le déploiement Edge et la délivrabilité ne sont pas validés dans cet environnement : pas de connexion de déploiement, ni de service d’e-mail configuré.
- Tester deux confirmations simultanées pour la dernière place, une confirmation membre en parallèle, une annulation qui promeut la liste d’attente, un lien expiré, un lien invalide, les doublons et les quotas.
- Vérifier que les tables privées sont illisibles par `anon` et `authenticated`, et que seules les fonctions de liste d’invités existantes exposent des pseudos, jamais les e-mails ou les hachés.
- Vérifier qu’un clic de scanner de messagerie ne confirme ni n’annule une place.
- Le client n’utilise pas l’e-mail ni le jeton dans le suivi d’activité. Ne pas ajouter d’analytics sur la page de gestion du lien privé.

## Exploitation

Les quotas limitent les demandes à 3 par adresse et 10 par IP sur une heure. Un échec d’envoi est affiché comme un échec et ne produit aucune inscription confirmée. Les liens de gestion durent 400 jours, pour couvrir les sorties planifiées loin à l’avance ; une nouvelle demande ne révoque pas un ancien lien encore valide.

Prévoir une tâche serveur quotidienne pour supprimer les lignes de quota de plus de 48 heures, les liens expirés et les demandes expirées sans invité actif. Fixer et documenter la durée de conservation des adresses après une sortie avant l’ouverture publique. Les e-mails de changement de sortie, d’annulation par l’organisateur ou les campagnes ne sont pas inclus dans cette première version.

Pour fermer les nouvelles demandes, remettre le drapeau du site à faux et celui de l’Edge à `false`. Les actions de lecture et d’annulation des liens existants restent possibles ; ne pas supprimer la fonction ni les secrets Supabase tant qu’il existe des participations actives.
