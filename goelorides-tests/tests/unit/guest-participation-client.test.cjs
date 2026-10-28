const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const moduleSource = fs.readFileSync(path.join(root, 'js/goelo-guest-participation.js'), 'utf8');
test('désactivation : aucun formulaire ni texte sans compte n’est affiché', () => {
  const context = { window: { GOELO_CONFIG: { GUEST_PARTICIPATION_ENABLED: false } } };
  vm.createContext(context); vm.runInContext(moduleSource, context);
  assert.equal(context.window.GoeloGuestParticipation.open({ id: 'r1' }), false);
  context.window.GoeloGuestParticipation.decorate({ id: 'r1' });
});
test('le refus et le résultat métier négatif ne deviennent pas un succès', async () => {
  for (const response of [{ error: { context: { json: async () => ({ error: 'full' }) } } }, { data: { ok: false, error: 'not_ready' } }]) {
    const context = { window: { goeloGetSb: () => ({ functions: { invoke: async () => response } }) } };
    vm.createContext(context); vm.runInContext(moduleSource, context);
    await assert.rejects(context.window.GoeloGuestParticipation.invoke({ action: 'confirm' }), /full|not_ready/);
  }
});
test('le lien privé ne confirme pas à l’ouverture ; confirmation et annulation sont explicites', async () => {
  const elements = {};
  const element = id => elements[id] || (elements[id] = { hidden: true, listeners: {}, addEventListener(type, listener) { this.listeners[type] = listener; } });
  const calls = [];
  let currentStatus = 'pending';
  const context = { URLSearchParams, location: { hash: '#token=' + 'a'.repeat(64) }, document: { getElementById: element }, window: { confirm: () => false, GoeloGuestParticipation: { message: code => code, invoke: async body => { calls.push(body); return { ok: true, status: currentStatus, route_id: 'route-1', title: '<img src=x>', pseudo: 'Cam' }; } } } };
  vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(root, 'js/guest-participation-manage.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1); assert.equal(calls[0].action, 'status');
  assert.equal(element('guest-confirm').hidden, false); assert.equal(element('guest-cancel').hidden, true);
  assert.equal(element('guest-manage-title').textContent, '<img src=x>');
  currentStatus = 'joined'; element('guest-confirm').listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[1].action, 'confirm'); assert.equal(element('guest-cancel').hidden, false);
  element('guest-cancel').listeners.click(); assert.equal(calls.length, 2);
  context.window.confirm = () => true; currentStatus = 'cancelled'; element('guest-cancel').listeners.click();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls[2].action, 'cancel');
});
