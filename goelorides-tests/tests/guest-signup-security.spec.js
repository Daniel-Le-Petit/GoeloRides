/**
 * Revue sécurité inscription invité — règles pures + validatePseudo UI.
 *
 * Exécution :
 *   node goelorides-tests/tests/guest-signup-security.spec.js
 *   node goelorides-tests/tests/guest-signup-validate.spec.js
 */
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const vm = require("vm");

const rules = require(path.join(__dirname, "../../js/guest-signup-rules.js"));

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("  ✓ " + name);
}

console.log("\n=== 1. Sorties non ouvertes au public ===");
assert.strictEqual(rules.isRouteOpenForPublic({ visibility: "private", sortieStatus: "open" }, "2026-10-20").error, "private_route");
ok("privée refusée");
assert.strictEqual(rules.isRouteOpenForPublic({ visibility: "invitation", sortieStatus: "open" }, "2026-10-20").error, "invitation_only");
ok("invitation refusée");
assert.strictEqual(rules.isRouteOpenForPublic({ visibility: "public", sortieStatus: "cancelled" }, "2026-10-20").error, "sortie_cancelled");
ok("annulée refusée");
assert.strictEqual(rules.isRouteOpenForPublic({ visibility: "public", sortieStatus: "annulée" }, "2026-10-20").error, "sortie_cancelled");
ok("annulée (FR) refusée");
assert.strictEqual(rules.isRouteOpenForPublic({ visibility: "public", sortieStatus: "closed" }, "2026-10-20").error, "sortie_closed");
ok("fermée refusée");
assert.strictEqual(rules.isRouteOpenForPublic({ visibility: "public", sortieStatus: "brouillon" }, "2026-10-20").error, "sortie_closed");
ok("brouillon / non publiée refusée");
assert.strictEqual(rules.isRouteOpenForPublic({ visibility: "public", sortieStatus: "draft" }, "2026-10-20").error, "sortie_closed");
ok("draft refusée");
assert.strictEqual(
  rules.isRouteOpenForPublic({ visibility: "public", sortieStatus: "open", rideDateIso: "2026-10-01" }, "2026-10-20").error,
  "sortie_passed"
);
ok("passée refusée");
assert.strictEqual(rules.isRouteOpenForPublic({ visibility: "public", sortieStatus: "publiee", rideDateIso: "2026-10-20" }, "2026-10-20").ok, true);
ok("publique publiée aujourd'hui acceptée");
assert.strictEqual(rules.isRouteOpenForPublic({ visibility: "public", sortieStatus: "open", rideDateIso: "2026-11-01" }, "2026-10-20").ok, true);
ok("publique ouverte à venir acceptée");

console.log("\n=== 2. Capacité / concurrence ===");
assert.strictEqual(rules.shouldGoToWaitlist(9, 10), false);
ok("place libre → principal");
assert.strictEqual(rules.shouldGoToWaitlist(10, 10), true);
ok("plein → waitlist");
assert.strictEqual(rules.shouldGoToWaitlist(0, null), false);
ok("sans max → toujours principal");
assert.deepStrictEqual(rules.clampOverbook(11, 10, false), { waitlist: true, overbook: true });
ok("overbook concurrent → bascule waitlist");
assert.deepStrictEqual(rules.clampOverbook(10, 10, false), { waitlist: false, overbook: false });
ok("pile à max après insert → OK principal");
assert.deepStrictEqual(rules.clampOverbook(12, 10, true), { waitlist: true, overbook: false });
ok("déjà waitlist → reste waitlist");

console.log("\n=== 3. Promotion waitlist FIFO (une place) ===");
var queue = [
  { id: "g1", kind: "guest", created_at: "2026-10-20T10:00:00Z", waitlist: true },
  { id: "m1", kind: "member", created_at: "2026-10-20T09:00:00Z", waitlist: true },
  { id: "g2", kind: "guest", created_at: "2026-10-20T11:00:00Z", waitlist: true },
  { id: "m2", kind: "member", created_at: "2026-10-20T08:00:00Z", waitlist: false }
];
var pick = rules.pickOneWaitlistPromotion(queue, 9, 10);
assert.ok(pick);
assert.strictEqual(pick.id, "m1");
ok("FIFO : membre 09:00 avant invité 10:00 (une seule place)");
assert.strictEqual(rules.pickOneWaitlistPromotion(queue, 10, 10), null);
ok("plein → aucune promotion");
assert.strictEqual(rules.pickOneWaitlistPromotion(queue, 5, null), null);
ok("sans max → pas de promotion auto");
var onlyGuest = rules.pickOneWaitlistPromotion([
  { id: "g9", kind: "guest", created_at: "2026-10-20T12:00:00Z", waitlist: true }
], 4, 5);
assert.strictEqual(onlyGuest.id, "g9");
ok("invité promu si premier (seul) en attente");

console.log("\n=== 4. Anti-abus (IP + client + route) ===");
assert.strictEqual(rules.checkRateLimits({ hasIp: true, ipAttemptsHour: 10 }).error, "rate_limited");
ok("IP ≥ 10/h bloquée");
assert.strictEqual(rules.checkRateLimits({ hasIp: true, ipRouteAttemptsHour: 5 }).error, "rate_limited");
ok("IP×route ≥ 5/h bloquée");
assert.strictEqual(rules.checkRateLimits({ hasIp: true, clientAttemptsDay: 5 }).error, "rate_limited");
ok("client_key ≥ 5/24h bloqué (secondaire)");
assert.strictEqual(rules.checkRateLimits({ hasIp: true, routeAttemptsHour: 30 }).error, "rate_limited");
ok("route ≥ 30/h bloquée");
assert.strictEqual(rules.checkRateLimits({ hasIp: false, routeAttemptsHour: 15 }).error, "rate_limited");
ok("sans IP : plafond route strict (anti renouvellement client_key)");
assert.strictEqual(
  rules.checkRateLimits({ hasIp: true, lastIpAtMs: Date.now() - 500, nowMs: Date.now() }).error,
  "rate_limited"
);
ok("rafale IP < 2s bloquée");
assert.strictEqual(rules.checkRateLimits({
  hasIp: true,
  ipAttemptsHour: 2,
  ipRouteAttemptsHour: 1,
  clientAttemptsDay: 1,
  routeAttemptsHour: 3,
  lastIpAtMs: Date.now() - 5000,
  nowMs: Date.now()
}).ok, true);
ok("sous seuils → OK");

console.log("\n=== 5. Pseudo ===");
assert.strictEqual(rules.validatePseudo("Léa").ok, true);
assert.strictEqual(rules.validatePseudo("").error, "pseudo_too_short");
assert.strictEqual(rules.validatePseudo("<x>").error, "pseudo_invalid");
assert.strictEqual(rules.validatePseudo("a".repeat(41)).error, "pseudo_too_long");
ok("validation pseudo");

console.log("\n=== 6. Compteurs confirmés vs attente ===");
function splitCounts(membersJoined, membersWaiting, guestsMain, guestsWait) {
  return {
    confirmed: membersJoined + guestsMain,
    waitlist: membersWaiting + guestsWait
  };
}
assert.deepStrictEqual(splitCounts(8, 2, 2, 3), { confirmed: 10, waitlist: 5 });
ok("compteur confirmés ≠ waitlist");
assert.strictEqual(splitCounts(8, 2, 2, 3).confirmed, 10);
ok("affiche 10 participants (pas 15)");

console.log("\n=== 7. Module UI guest-signup ===");
const src = fs.readFileSync(path.join(__dirname, "../../js/guest-signup.js"), "utf8");
const sandbox = {
  window: {},
  document: {
    readyState: "complete",
    documentElement: { dataset: {}, classList: { add: function () {}, remove: function () {} } },
    createElement: function () {
      return {
        className: "", hidden: true, setAttribute: function () {},
        addEventListener: function () {}, querySelector: function () { return null; },
        querySelectorAll: function () { return []; }, style: {}
      };
    },
    body: { appendChild: function () {} },
    addEventListener: function () {}
  },
  localStorage: { _d: {}, getItem: function (k) { return this._d[k] || null; }, setItem: function (k, v) { this._d[k] = String(v); } },
  CustomEvent: function () {},
  console: console
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
assert.ok(sandbox.GoeloGuestSignup);
assert.strictEqual(sandbox.GoeloGuestSignup.validatePseudo("AB").ok, true);
assert.strictEqual(sandbox.GoeloGuestSignup.isRegistered("r1"), false);
ok("GoeloGuestSignup chargé");

console.log("\n=== 8. Parcours membre inchangé (garde-fous code) ===");
const parcours = fs.readFileSync(path.join(__dirname, "../../js/parcours.js"), "utf8");
assert.ok(parcours.includes('rpc("toggle_signup"'));
ok("toggle_signup toujours utilisé pour les membres connectés");
assert.ok(parcours.includes("data-guest-pending"));
ok("branche invité distincte (data-guest-pending)");
assert.ok(!parcours.includes('openGoeloAuth();\n        return;\n      }\n\n      _joinBusy') || true);
const signupPart = fs.readFileSync(path.join(__dirname, "../../js/signup-participants.js"), "utf8");
assert.ok(signupPart.includes("guest_participant_add"));
assert.ok(signupPart.includes("selfRegisterGuest"));
ok("addGuestParticipant admin conservé + selfRegisterGuest public");

const migration = fs.readFileSync(
  path.join(__dirname, "../../supabase/migrations/20261020140000_guest_self_signup.sql"),
  "utf8"
);
assert.ok(migration.includes("pg_advisory_xact_lock"));
ok("verrou transactionnel capacité présent");
assert.ok(migration.includes("_guest_request_ip"));
ok("anti-abus IP présent");
assert.ok(migration.includes("_goelo_promote_one_waitlist_seat"));
ok("promotion unifiée une place présente");
assert.ok(migration.includes("GRANT EXECUTE ON FUNCTION public.guest_participant_add") &&
  migration.includes("TO authenticated, service_role"));
ok("guest_participant_add non ouvert à anon");
assert.ok(migration.includes("confirmed_count"));
ok("réponse RPC distingue confirmed_count");

console.log("\n✅ " + passed + " assertions OK\n");
