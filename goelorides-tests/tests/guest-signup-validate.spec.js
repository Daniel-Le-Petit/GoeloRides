/**
 * Tests unitaires légers — validation pseudo inscription invité.
 * Exécution : node goelorides-tests/tests/guest-signup-validate.spec.js
 * (sans Playwright / sans Supabase)
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(
  path.join(__dirname, "../../js/guest-signup.js"),
  "utf8"
);

const sandbox = {
  window: {},
  document: {
    readyState: "complete",
    documentElement: { dataset: {}, classList: { add: function () {}, remove: function () {} } },
    createElement: function () {
      return {
        className: "",
        hidden: true,
        setAttribute: function () {},
        addEventListener: function () {},
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
        style: {}
      };
    },
    body: { appendChild: function () {} },
    addEventListener: function () {}
  },
  localStorage: {
    _d: {},
    getItem: function (k) { return this._d[k] || null; },
    setItem: function (k, v) { this._d[k] = String(v); }
  },
  CustomEvent: function () {},
  console: console
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(src, sandbox);

const GS = sandbox.GoeloGuestSignup;
assert.ok(GS, "GoeloGuestSignup exposé");
assert.ok(typeof GS.validatePseudo === "function");

assert.strictEqual(GS.validatePseudo("").ok, false);
assert.strictEqual(GS.validatePseudo(" ").ok, false);
assert.strictEqual(GS.validatePseudo("A").ok, false);
assert.strictEqual(GS.validatePseudo("A").error, "pseudo_too_short");

assert.strictEqual(GS.validatePseudo("Léa").ok, true);
assert.strictEqual(GS.validatePseudo("GoéloRider").ok, true);
assert.strictEqual(GS.validatePseudo("Jean-Pierre").ok, true);
assert.strictEqual(GS.validatePseudo("Marco_42").ok, true);

assert.strictEqual(GS.validatePseudo("<script>").ok, false);
assert.strictEqual(GS.validatePseudo("a".repeat(41)).ok, false);
assert.strictEqual(GS.validatePseudo("a".repeat(41)).error, "pseudo_too_long");

assert.strictEqual(GS.isRegistered("route-x"), false);
assert.strictEqual(typeof GS.getClientKey(), "string");
assert.ok(GS.getClientKey().length >= 16);

console.log("OK — guest-signup validatePseudo / local helpers");
