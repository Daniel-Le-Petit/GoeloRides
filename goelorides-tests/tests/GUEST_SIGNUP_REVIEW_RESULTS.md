# Revue inscription invité — résultats (PR #12)

Date : 2026-10-20 (revue renforcée)  
Branche : `feature/inscription-invite-sans-compte`  
Migration : `supabase/migrations/20261020140000_guest_self_signup.sql` (**non appliquée en production**)  
Edge Function : `supabase/functions/guest-signup/` (**non déployée sans accord**)

## 1. Anti-abus / IP

| Question | Conclusion |
|----------|------------|
| IP fiable via RPC PostgREST seule ? | **Partielle**. `request.headers` → `x-forwarded-for` / `cf-connecting-ip` est documenté par Supabase, mais le **premier hop XFF peut être spoofable**. |
| IP fournie par le navigateur ? | **Jamais utilisée** (ni body JSON, ni `p_edge_ip_hash` hors `service_role`). |
| Solution retenue | **Edge Function `guest-signup`** : lit l’IP d’entrée plateforme, SHA-256, appelle la RPC en `service_role` avec `p_edge_ip_hash`. UX inchangée pour le visiteur. |
| Secours | RPC directe possible si Edge absente ; plafonds route plus stricts ; hash Edge spoofé par `anon` **ignoré**. |

## 2. Capacité atomique

- `pg_advisory_xact_lock('goelo_guest_reg:' \|\| route_id)`
- `SELECT … FROM routes FOR UPDATE`
- Recomptage sous verrou + bascule waitlist si overbook
- Capacité partagée : membres `joined` + invités hors waitlist
- Test simulé : 2 inscriptions sur la dernière place → 1 confirmé + 1 waitlist (max respecté)

## 3. Waitlist unifiée

- `_goelo_promote_one_waitlist_seat` : FIFO membres + invités
- `_signup_promote_waitlist` : une place à la fois jusqu’à capacité
- Annulation confirmée → promotion auto (sans nouvelle inscription)

## 4. Compteurs

- RPC liste : `participants` (confirmés) vs `waitlist`
- Réponses register/cancel : `confirmed_count` / `waitlist_count`
- Accueil / cartes / détail : comptent les confirmés uniquement

## 5. Sécurité / compat

- Membres : `toggle_signup` inchangé
- Ride Leaders : `guest_participant_add` toujours `authenticated` only
- Privé / brouillon / annulé / fermé / passé → refus public
- Annulation : jeton personnel uniquement
- Pas de téléphone dans les RPC publiques ; pas de `service_role` dans le navigateur

## Commandes

```bash
node goelorides-tests/tests/guest-signup-security.spec.js
node goelorides-tests/tests/guest-signup-validate.spec.js
```

## Résultats (local)

- Security / concurrence / waitlist / IP / edge : **assertions OK**
- Validate pseudo : **OK**

## À faire avant prod (accord explicite requis)

1. Appliquer la migration SQL (staging)
2. Déployer l’Edge Function `guest-signup`
3. Smoke E2E : 2 onglets dernière place, cancel→promote, iPhone

## Limites résiduelles

- Sans Edge déployée, le secours RPC s’appuie sur headers PostgREST (soft) + plafonds stricts.
- Course check-then-act historique possible entre deux `toggle_signup` membres (hors chemin invité sérialisé).
