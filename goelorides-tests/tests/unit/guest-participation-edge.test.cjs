const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../../supabase/functions/guest-participation/index.ts'), 'utf8').replace(/^import .*;\n/, '');
function setup(overrides = {}) {
  const calls = [], mails = [];
  const env = { GUEST_PARTICIPATION_ENABLED: 'true', RESEND_API_KEY: 'test-key', GUEST_MAIL_FROM: 'test@example.test', GUEST_RATE_LIMIT_SECRET: 'test-pepper', ...overrides.env };
  const context = { Request, Response, AbortSignal, TextEncoder, crypto: globalThis.crypto,
    Deno: { env: { get: name => env[name] }, serve: handler => context.handler = handler },
    createClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return overrides.rpc ? overrides.rpc(name, args) : { data: { ok: true, title: 'Boucle Goëlo', status: 'pending' } }; } }),
    fetch: async (url, options) => { mails.push({ url, body: JSON.parse(options.body) }); return { ok: overrides.mailOk !== false }; }
  };
  vm.createContext(context); vm.runInContext(source, context);
  return { calls, mails, async request(body, options = {}) { const response = await context.handler(new Request('https://edge.example.test', { method: options.method || 'POST', headers: { origin: options.origin || 'https://goelorides.onrender.com', 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.1' }, body: options.method === 'GET' ? undefined : JSON.stringify(body) })); return { status: response.status, data: await response.json() }; } };
}
test('demande sans compte : secret aléatoire haché, mail privé et absence de fausse confirmation', async () => {
  const app = setup(); const result = await app.request({ action: 'request', route_id: 'r1', pseudo: 'Camille', email: 'CAM@example.test', visitor_session_id: 'visitor-1' });
  assert.equal(result.data.status, 'email_sent');
  assert.equal(app.calls[0].name, 'guest_signup_prepare');
  assert.equal(app.calls[0].args.p_email, 'cam@example.test');
  assert.match(app.calls[0].args.p_token_hash, /^[a-f0-9]{64}$/);
  assert(!JSON.stringify(app.calls).includes('192.0.2.1'));
  assert.match(app.mails[0].body.text, /participation-invite.html#token=[a-f0-9]{64}/);
  assert(!app.mails[0].body.text.includes(app.calls[0].args.p_token_hash));
  assert(!JSON.stringify(result.data).includes('cam@example.test'));
});
test('un échec d’envoi ne devient jamais une inscription réussie', async () => {
  const app = setup({ mailOk: false }); const result = await app.request({ action: 'request', route_id: 'r1', pseudo: 'Cam', email: 'cam@example.test' });
  assert.equal(result.status, 502); assert.equal(result.data.error, 'mail_failed');
  assert(app.calls.every(call => call.name !== 'guest_signup_manage'));
});
test('configuration, origine, entrée invalide et piège antispam bloquent avant écriture', async () => {
  for (const [app, body, options, code] of [
    [setup({ env: { GUEST_PARTICIPATION_ENABLED: 'false' } }), { action: 'request' }, {}, 'not_ready'],
    [setup(), {}, { origin: 'https://elsewhere.test' }, 'forbidden_origin'],
    [setup(), { action: 'request', pseudo: 'Cam', route_id: 'r1', email: 'invalide' }, {}, 'invalid_input'],
    [setup(), { action: 'request', pseudo: 'Cam', route_id: 'r1', email: 'cam@example.test', website: 'spam' }, {}, 'invalid_input']
  ]) { const result = await app.request(body, options); assert.equal(result.data.error, code); assert.equal(app.calls.length, 0); assert.equal(app.mails.length, 0); }
});
test('quota serveur : pas d’e-mail envoyé', async () => {
  const app = setup({ rpc: () => ({ data: { ok: false, error: 'rate_limited' } }) });
  const result = await app.request({ action: 'request', route_id: 'r1', pseudo: 'Cam', email: 'cam@example.test' });
  assert.equal(result.status, 429); assert.equal(app.mails.length, 0);
});
test('lecture et gestion par jeton haché ; GET ne peut pas confirmer', async () => {
  const app = setup(); const secret = 'a'.repeat(64);
  await app.request({ action: 'status', token: secret });
  assert.equal(app.calls[0].args.p_action, 'status'); assert.notEqual(app.calls[0].args.p_token_hash, secret);
  assert.equal(app.mails.length, 0);
  const result = await app.request({}, { method: 'GET' }); assert.equal(result.status, 405);
  await app.request({ action: 'cancel', token: secret }); assert.equal(app.calls[1].args.p_action, 'cancel');
});

test('la fermeture des nouvelles demandes ne bloque pas les annulations existantes', async () => {
  const app = setup({ env: { GUEST_PARTICIPATION_ENABLED: 'false', RESEND_API_KEY: null } });
  const result = await app.request({ action: 'cancel', token: 'a'.repeat(64) });
  assert.equal(result.status, 200); assert.equal(app.calls[0].args.p_action, 'cancel');
});
