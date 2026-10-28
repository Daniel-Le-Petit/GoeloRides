const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'js/parcours-management.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(role, owner = false) {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.handlers = {}; this.hidden = true; }
    appendChild(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(event, handler) { this.handlers[event] = handler; }
    setAttribute(key, value) { this[key] = value; }
  }
  const host = new Element('section');
  const fixture = { id: 'route-1', track_name: 'Boucle', assigned_team_rider_id: owner ? 'self' : 'other', front_config: { title: 'Boucle', distance: 20 } };
  let state = { role, user: role === 'visitor' ? null : { id: 'self' }, pending: false };
  let onChange, mode = 'success', confirm = true; const updates = [];
  const sb = { from: () => ({ select() { return this; }, eq() { return this; }, update(payload) { this.payload = payload; return this; }, async single() { if (!this.payload) return { data: fixture }; updates.push(this.payload); return mode === 'denied' ? { error: { message: 'refusé' } } : mode === 'zero' ? { data: null } : { data: { id: 'route-1' } }; } }) };
  const window = { GoeloAuthState: { getState: () => state, subscribe: callback => { onChange = callback; } }, goeloGetSb: () => sb, addEventListener() {}, confirm: () => confirm };
  const context = { window, document: { readyState: 'complete', getElementById: () => host, createElement: tag => new Element(tag) }, location: { search: '?id=route-1' }, URLSearchParams };
  vm.createContext(context); vm.runInContext(source, context);
  return { host, updates, buttons: () => host.children[1]?.children || [], setMode: value => mode = value, setConfirm: value => confirm = value, changeRole: value => { state = { role: value, user: { id: 'self' }, pending: false }; onChange(); } };
}
test('gestion masquée aux visiteurs, membres et Ride Leaders non responsables', async () => {
  for (const role of ['visitor', 'user', 'team_rider']) { const app = setup(role); await tick(); assert.equal(app.host.hidden, true); }
});
test('admin : liens de duplication et modification ; propriétaire : modification seulement', async () => {
  const admin = setup('admin'); await tick(); assert.deepEqual(admin.buttons().map(b => b.textContent), ['Dupliquer','Modifier','Annuler la sortie']);
  assert.match(admin.buttons()[0].href, /mode=duplicate&id=route-1$/);
  const owner = setup('team_rider', true); await tick(); assert.deepEqual(owner.buttons().map(b => b.textContent), ['Modifier']);
  admin.changeRole('user'); assert.equal(admin.host.hidden, true); assert.equal(admin.host.children.length, 0);
});
test('annulation : confirmation obligatoire, données préservées et résultat serveur vérifié', async () => {
  const app = setup('admin'); await tick(); app.setConfirm(false); await app.buttons()[2].handlers.click(); assert.equal(app.updates.length, 0);
  app.setConfirm(true); await app.buttons()[2].handlers.click(); assert.equal(app.updates[0].front_config.distance, 20); assert.equal(app.updates[0].front_config.sortieStatus, 'cancelled'); assert.equal(app.buttons()[2].disabled, true); assert.match(app.host.children[2].textContent, /est annulée/);
});
test('un refus ou une absence de confirmation conserve le bouton et affiche une erreur', async () => {
  for (const mode of ['denied','zero']) { const app = setup('admin'); await tick(); app.setMode(mode); await app.buttons()[2].handlers.click(); assert.match(app.host.children[2].textContent, /Impossible/); assert.equal(app.buttons()[2].disabled, false); }
});
test('les cartes publiques ne contiennent plus les actions de gestion ; espace Ride Leader conservé', () => {
  const context = { GOELO_ROLE: 'admin', GOELO_USER: { id: 'self' } }; vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(root, 'js/sortie-cards.js'), 'utf8'), context);
  const card = { id: 'route-1', title: 'Boucle', participants: [] };
  const html = context.GoeloSortieCards.buildCardHtml(card, { viewMode: 'sorties' });
  assert(!/Dupliquer|Modifier|data-go-sc-cancel/.test(html)); assert(html.includes('Voir'));
  const adminHtml = context.GoeloSortieCards.buildCardHtml(card, { viewMode: 'team-rider' }); assert(adminHtml.includes('Dupliquer')); assert(adminHtml.includes('Modifier'));
});
