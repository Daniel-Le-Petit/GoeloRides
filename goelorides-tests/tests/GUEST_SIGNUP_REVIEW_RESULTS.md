# Revue inscription invité — résultats (PR #12)

Date : 2026-10-20  
Branche : `feature/inscription-invite-sans-compte`  
Migration : `supabase/migrations/20261020140000_guest_self_signup.sql` (**non appliquée en production**)

## Corrections apportées

| # | Point | Correction |
|---|--------|------------|
| 1 | Anti-abus | IP (headers PostgREST) + client_key + plafonds route ; rafale 2s ; sans IP plafond route plus strict |
| 2 | Concurrence | `pg_advisory_xact_lock` par sortie + recomptage + bascule waitlist si overbook |
| 3 | Waitlist | File FIFO unifiée membres+invités ; `_signup_promote_waitlist` promeut une place à la fois jusqu’à capacité |
| 4 | Sorties fermées | Liste blanche statut (`open`/`publiee`/`published`) + visibilité `public` + date non passée |
| 5 | Membres / compteurs | `toggle_signup` inchangé côté UI ; `confirmed_count` vs `waitlist_count` ; listes séparées |
| 6 | Tests | Voir ci-dessous |

## Commandes exécutées

```bash
node goelorides-tests/tests/guest-signup-security.spec.js
node goelorides-tests/tests/guest-signup-validate.spec.js
node --check js/guest-signup.js js/guest-signup-rules.js js/signup-participants.js js/parcours.js
```

## Résultats

- `guest-signup-security.spec.js` : **39 assertions OK**
- `guest-signup-validate.spec.js` : **OK**
- Syntaxe JS : **OK**

## Non couvert ici (nécessite migration appliquée sur staging)

1. Visiteur non connecté : inscription réel RPC  
2. Affichage immédiat dans la liste  
3. Pseudo vide / invalide (RPC)  
4. Double inscription (même client / IP)  
5. Annulation par jeton vs sans jeton  
6. Sortie complète / annulée / passée / fermée (RPC live)  
7. Membre connecté `toggle_signup`  
8. Affichage combiné membres + invités  
9. iPhone (UI)

## Limite résiduelle

Le parcours membre (`toggle_signup`) conserve sa logique historique ; la capacité partagée compte désormais les invités. La sérialisation advisory lock est appliquée sur `guest_self_register` / promotion waitlist. Une course check-then-act reste possible entre deux `toggle_signup` membres simultanés (préexistante).
