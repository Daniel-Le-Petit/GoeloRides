# Espace personnel — mise en service

Les pages `profile.html` et `my-bookings.html` partagent la palette marine, la navigation de compte et des styles adaptés au mobile.

Le profil enregistre pseudo, niveau et ville dans `profiles` sous les politiques RLS existantes. Les metadata Auth sont également mises à jour pour rester cohérentes avec la synchronisation effectuée à la connexion. Le rôle et l’e-mail ne sont pas modifiables par ce formulaire.

## Migration

La migration `supabase/migrations/20261031120000_account_bookings.sql` a été appliquée le 31 octobre 2026 via le workflow GitHub Actions « Espace personnel — migration Supabase » (run 41229827748), avant la publication des pages. Elle ajoute :

- `account_my_bookings()` : dernières inscriptions actives de l’utilisateur connecté, avec les parcours associés ;
- `account_cancel_booking(p_route_id)` : annulation idempotente sous le même verrou que les inscriptions, avec promotion de la liste d’attente.

Ces fonctions sont réservées aux utilisateurs authentifiés et utilisent `auth.uid()`. L’annulation refuse les sorties fermées/annulées et les départs passés lorsque la date structurée est disponible. Les anciennes dates non structurées sont filtrées côté interface via le helper partagé.

L’onglet « Passées » présente les inscriptions actives aux sorties passées ; il ne constitue pas une preuve de participation ni un historique des annulations.

## Vérification

Avec un compte de test : modifier et recharger le profil, annuler des modifications, vérifier les inscriptions confirmées/en attente, annuler une inscription puis recharger la page et contrôler la promotion éventuelle d’une personne en attente. Vérifier aussi les pages sur mobile et après déconnexion.

Vérifications réalisées :

- PostgreSQL 17 isolé : migration répétable, identité et permissions, dernière action, dates, annulation idempotente, promotion de la file ;
- navigateur Chromium : édition, sauvegarde simulée, annulation des modifications, tri, heure de Paris, historique, confirmation de retrait, déconnexion, affichage mobile et ordinateur ;
- production : application transactionnelle réussie et vérification de la présence des fonctions et du refus d’accès anonyme.

Les tests navigateur utilisent une simulation de Supabase : aucune inscription réelle ni aucun profil existant n’a été modifié pour les essais. La sauvegarde complète avec une session utilisateur réelle reste à vérifier.

Pour relancer les tests navigateur après installation des dépendances de `goelorides-tests` :

```sh
node goelorides-tests/tests/integration/account-pages-browser.cjs
```

La variable facultative `CHROMIUM_PATH` sélectionne un navigateur système ; `QA_OUTPUT_DIR` active les captures dans un dossier existant.
