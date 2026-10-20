# Revue inscription invité — résultats (PR #12)

Date : 2026-10-20 (verrouillage final)  
Branche : `feature/inscription-invite-sans-compte`

## Migrations (à appliquer sur staging, pas en prod sans accord)

1. `supabase/migrations/20261020140000_guest_self_signup.sql`
2. `supabase/migrations/20261020153000_guest_signup_lockdown.sql`
3. Déployer Edge Function `supabase/functions/guest-signup`

## 1. IP — conclusion

| Source | Fiable ? | Usage |
|--------|----------|--------|
| Body navigateur | **Non** | Jamais |
| `X-Forwarded-For` / `X-Real-IP` / `CF-Connecting-IP` via Edge ou PostgREST | **Non garanti** par la doc Supabase Edge | Soft only (`ip_trusted=false`) |
| Header d’ingress documenté comme sanitizé | **Aucun aujourd’hui** | — |

**Protection alternative (sans IP fiable) :** tickets one-shot `guest_signup_tickets` (client_key + route, plafonds horaires), émis/consommés uniquement en `service_role` via l’Edge Function.

## 2. Contournement Edge — corrigé

- `guest_self_register` : **GRANT service_role only** + garde `auth.role() = service_role`
- Navigateur : **uniquement** `POST /functions/v1/guest-signup`
- Si Edge en erreur / indisponible → `edge_unavailable`, **aucune inscription**
- Plus de fallback RPC depuis `js/signup-participants.js`

## 3. Capacité partagée — corrigé

- `_goelo_lock_route_capacity` : `pg_advisory_xact_lock('goelo_capacity:'||id)` + `FOR UPDATE` routes
- Utilisé par `guest_self_register` **et** `toggle_signup`
- Capacité = membres `joined` + invités hors waitlist
- Overbook → bascule waitlist

## Tests réellement exécutés

### Contre une base Supabase live
**Aucun.**  
`GOELO_TEST_SUPABASE_URL` / `ANON_KEY` / `SERVICE_ROLE_KEY` absents dans cet environnement.  
Le script `guest-signup-supabase-integration.spec.js` s’est terminé en **SKIP**.

Pour les exécuter sur une base de **test** :

```bash
export GOELO_TEST_SUPABASE_URL=...
export GOELO_TEST_SUPABASE_ANON_KEY=...
export GOELO_TEST_SUPABASE_SERVICE_ROLE_KEY=...
export GOELO_TEST_ROUTE_ID=...   # sortie publique de test
node goelorides-tests/tests/guest-signup-supabase-integration.spec.js
```

Ce script vérifierait alors : blocage anon RPC, tickets, 2 inscriptions concurrentes, cancel/promote, mauvais token.

### Simulés / unitaires (exécutés ici)

```bash
node goelorides-tests/tests/guest-signup-security.spec.js   # 57 OK
node goelorides-tests/tests/guest-signup-validate.spec.js   # OK
node goelorides-tests/tests/guest-signup-supabase-integration.spec.js  # SKIP
```

Couverture simulée : sorties fermées, capacité/overbook, course dernière place, FIFO waitlist, rate-limit, confiance IP, absence fallback navigateur, présence Edge+tickets, verrou partagé toggle/guest.

## Ne pas faire sans accord

- Merger `main`
- Appliquer migrations / déployer Edge en **production**
