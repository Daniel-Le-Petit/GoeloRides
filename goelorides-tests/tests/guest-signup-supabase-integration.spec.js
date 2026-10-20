/**
 * Tests d'intégration Supabase (base de TEST uniquement).
 *
 * Requis (ne jamais pointer la prod sans accord) :
 *   GOELO_TEST_SUPABASE_URL
 *   GOELO_TEST_SUPABASE_ANON_KEY
 *   GOELO_TEST_SUPABASE_SERVICE_ROLE_KEY
 * Optionnel :
 *   GOELO_TEST_ROUTE_ID  (sortie publique de test avec capacité)
 *
 * Exécution :
 *   node goelorides-tests/tests/guest-signup-supabase-integration.spec.js
 *
 * Sans variables : SKIP (exit 0) — les tests ne sont PAS exécutés contre Supabase.
 */
const assert = require("assert");

const URL = process.env.GOELO_TEST_SUPABASE_URL || "";
const ANON = process.env.GOELO_TEST_SUPABASE_ANON_KEY || "";
const SERVICE = process.env.GOELO_TEST_SUPABASE_SERVICE_ROLE_KEY || "";
const ROUTE = process.env.GOELO_TEST_ROUTE_ID || "";

function log(msg) {
  console.log(msg);
}

async function rpc(key, name, args) {
  const res = await fetch(URL.replace(/\/$/, "") + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: "Bearer " + key
    },
    body: JSON.stringify(args || {})
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  if (!URL || !ANON || !SERVICE) {
    log("SKIP — variables GOELO_TEST_SUPABASE_* absentes.");
    log("Aucun test d'intégration n'a été exécuté contre Supabase.");
    log("Couverture locale : guest-signup-security.spec.js (simulé).");
    process.exit(0);
  }

  log("=== Intégration Supabase TEST ===");
  log("URL: " + URL);

  // 1) anon ne peut pas appeler guest_self_register
  const anonReg = await rpc(ANON, "guest_self_register", {
    p_route_id: ROUTE || "test_route",
    p_pseudo: "TestAnon",
    p_client_key: "integration-client-key-anon-01",
    p_hp: null
  });
  assert.ok(
    anonReg.status === 401 || anonReg.status === 403 || anonReg.status === 404 ||
    (anonReg.data && anonReg.data.ok === false && anonReg.data.error === "forbidden"),
    "anon ne doit pas pouvoir s'inscrire via RPC"
  );
  log("  ✓ anon bloqué sur guest_self_register (HTTP " + anonReg.status + ")");

  // 2) anon ne peut pas émettre de ticket
  const anonTicket = await rpc(ANON, "guest_signup_ticket_issue", {
    p_client_key: "integration-client-key-anon-01",
    p_route_id: ROUTE || "test_route",
    p_ip_hash: null,
    p_ip_trusted: false
  });
  assert.ok(
    anonTicket.status === 401 || anonTicket.status === 403 || anonTicket.status === 404,
    "anon ne doit pas émettre de ticket"
  );
  log("  ✓ anon bloqué sur guest_signup_ticket_issue (HTTP " + anonTicket.status + ")");

  if (!ROUTE) {
    log("SKIP partiel — GOELO_TEST_ROUTE_ID manquant : pas de test concurrence live.");
    log("Sécurité anon vérifiée contre la base de test.");
    process.exit(0);
  }

  const ckA = "integration-client-A-" + Date.now();
  const ckB = "integration-client-B-" + Date.now();

  async function registerGuest(clientKey, pseudo) {
    const t = await rpc(SERVICE, "guest_signup_ticket_issue", {
      p_client_key: clientKey,
      p_route_id: ROUTE,
      p_ip_hash: null,
      p_ip_trusted: false
    });
    assert.ok(t.ok && t.data && t.data.ok !== false, "ticket issue failed: " + JSON.stringify(t.data));
    return rpc(SERVICE, "guest_self_register", {
      p_route_id: ROUTE,
      p_pseudo: pseudo,
      p_client_key: clientKey,
      p_hp: null,
      p_edge_ip_hash: null,
      p_ticket_id: t.data.ticket_id
    });
  }

  // 3) Deux inscriptions quasi simultanées
  const [r1, r2] = await Promise.all([
    registerGuest(ckA, "ConcurrentA"),
    registerGuest(ckB, "ConcurrentB")
  ]);
  assert.ok(r1.ok && r1.data && r1.data.ok !== false, "reg A: " + JSON.stringify(r1.data));
  assert.ok(r2.ok && r2.data && r2.data.ok !== false, "reg B: " + JSON.stringify(r2.data));

  const confirmedFlags = [!r1.data.waitlist, !r2.data.waitlist];
  const confirmedCount = confirmedFlags.filter(Boolean).length;
  log("  → waitlist A=" + !!r1.data.waitlist + " B=" + !!r2.data.waitlist);
  log("  → confirmed_count A=" + r1.data.confirmed_count + " B=" + r2.data.confirmed_count);

  // Si max=1 et main était 0, exactement un confirmé ; sinon au pire les compteurs ne dépassent pas max
  if (typeof r1.data.confirmed_count === "number" && typeof r2.data.confirmed_count === "number") {
    const finalMain = Math.max(r1.data.confirmed_count, r2.data.confirmed_count);
    log("  → final main observé ≈ " + finalMain);
  }
  log("  ✓ inscriptions concurrentes exécutées (vérifier max côté config route)");

  // 4) Annulation + promotion
  const token = r1.data.manage_token || r2.data.manage_token;
  if (token) {
    const cancel = await rpc(ANON, "guest_self_cancel", { p_manage_token: token });
    assert.ok(cancel.ok && cancel.data && cancel.data.ok !== false, "cancel: " + JSON.stringify(cancel.data));
    log("  ✓ annulation par jeton (anon OK — secret = token)");
  } else {
    log("  · pas de manage_token dans la réponse (honeypot?)");
  }

  // 5) Cancel sans token / mauvais token
  const bad = await rpc(ANON, "guest_self_cancel", { p_manage_token: "not-a-valid-token" });
  assert.ok(
    bad.data && (bad.data.ok === false || bad.status >= 400),
    "mauvais token doit échouer"
  );
  log("  ✓ annulation refusée sans jeton valide");

  log("\n✅ Tests d'intégration Supabase terminés.");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
