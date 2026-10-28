const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function activity() {
  const context = { console };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../../js/goelo-activity.js'), 'utf8'), context);
  return context.GoeloActivity;
}

function event(type, minute, sid = 'browser-a', extra = {}) {
  return {
    event_type: type,
    created_at: new Date(Date.UTC(2026, 9, 26, 19, 38) + minute * 60000).toISOString(),
    visitor_session_id: sid,
    metadata: {},
    ...extra
  };
}

test('le parcours fourni distingue le clic Rejoindre d’une inscription', () => {
  const GA = activity();
  const events = [
    event('HOME_FOOTER_VIEWED', 0), event('PAGE_HOME_VIEWED', 1),
    event('PAGE_SORTIES_VIEWED', 2), event('HOME_FOOTER_VIEWED', 3),
    event('PAGE_HOME_VIEWED', 4), event('UPCOMING_RIDE_JOIN_CLICKED', 5)
  ];
  const progress = GA.registrationProgress(GA.buildVisitorSessions(events)[0]);
  assert.equal(progress.clicked, true);
  assert.equal(progress.confirmed, false);
  assert.deepEqual(Array.from(progress.steps), ['Accueil', 'Liste des sorties', 'Accueil', 'Clic sur « Rejoindre »']);
  assert.equal(GA.sessionActionCount(events), 4);
});

test('le défilement reste dans le détail et n’est pas assimilé à une lecture', () => {
  const GA = activity();
  const events = [event('PAGE_SORTIES_VIEWED', 0), event('SORTIES_SCROLL_DEPTH', 1, 'browser-a', { metadata: { depth: 75 } }), event('RIDE_INFO_OPENED', 2)];
  assert.equal(GA.registrationProgress({ items: events }).viewed, true);
  assert.doesNotMatch(GA.buildJourneySummary(events), /Scroll|Footer|Lecture/);
  const detail = GA.collapseScrollDepthTimeline(events).map(GA.detailTimelineLabel).join(' ');
  assert.match(detail, /Défilement.*75%/);
  assert.doesNotMatch(detail, /Lecture/);
});

test('un compte créé et une liste d’attente ne confirment pas une place à une sortie', () => {
  const GA = activity();
  assert.equal(GA.registrationProgress({ items: [event('USER_REGISTERED', 0)] }).confirmed, false);
  const waiting = GA.registrationProgress({ items: [event('RIDE_JOINED', 0, 'browser-a', { metadata: { status: 'waiting' } })] });
  assert.equal(waiting.confirmed, false);
  assert.equal(waiting.status, 'waiting');
  assert.equal(GA.registrationProgress({ items: [event('RIDE_JOINED', 0)] }).confirmed, true);
});

test('une inscription suivie d’une désinscription n’est pas présentée comme un statut actuel', () => {
  const GA = activity();
  const progress = GA.registrationProgress({ items: [event('RIDE_JOINED', 0), event('RIDE_LEFT', 1)] });
  assert.equal(progress.confirmed, true);
  assert.match(progress.description, /désinscription/);
});

test('un même navigateur est séparé en parcours après 30 minutes d’inactivité', () => {
  const GA = activity();
  const events = [event('PAGE_HOME_VIEWED', 0), event('PAGE_SORTIES_VIEWED', 29), event('RIDE_VIEWED', 59)];
  const original = JSON.stringify(events);
  const visits = GA.buildVisitorSessions(events);
  assert.equal(visits.length, 2);
  assert.equal(visits[0].items.length, 1);
  assert.equal(visits[1].items.length, 2);
  assert.notEqual(visits[0].visitor_session_id, visits[1].visitor_session_id);
  assert.equal(visits[0].visitor_id, visits[1].visitor_id);
  assert.equal(JSON.stringify(events), original);
});

test('une inscription sans identifiant navigateur n’est pas attribuée arbitrairement', () => {
  const GA = activity();
  const visits = GA.buildVisitorSessions([event('RIDE_PARTICIPATE_CLICKED', 0), event('RIDE_JOINED', 1, null)]);
  assert.equal(visits.length, 1);
  assert.equal(GA.registrationProgress(visits[0]).confirmed, false);
});

test('les identités absentes deviennent Visiteur anonyme, un vrai nom reste disponible', () => {
  const GA = activity();
  assert.equal(GA.sessionUserLabel({ items: [{ actor_pseudo: '?' }] }), 'Visiteur anonyme');
  assert.equal(GA.sessionUserLabel({ items: [{ actor_pseudo: 'Quelqu’un' }] }), 'Visiteur anonyme');
  assert.equal(GA.sessionUserLabel({ items: [{ actor_pseudo: '?' }, { actor_pseudo: 'Camille' }] }), 'Camille');
  assert.equal(GA.sessionUserLabel({ items: [{ actor_id: 'member-id', actor_pseudo: '?' }] }), 'Membre (nom indisponible)');
});

test('les titres de sorties utiles sont conservés sans identifiant de route technique', () => {
  const GA = activity();
  const progress = GA.registrationProgress({ items: [event('RIDE_VIEWED', 0, 'browser-a', { route_title: 'Boucle des falaises' }), event('RIDE_VIEWED', 1, 'browser-a', { route_title: 'c_aabbccddeeff0011' })] });
  assert.deepEqual(Array.from(progress.routes), ['Boucle des falaises']);
});

test('les étapes partielles ne produisent pas un faux taux de conversion', () => {
  const GA = activity();
  const visits = GA.buildVisitorSessions([event('RIDE_PARTICIPATE_CLICKED', 0), event('RIDE_JOINED', 1, 'browser-b', { metadata: { status: 'waiting' } })]);
  const stages = GA.analyzeFunnel(visits);
  assert.equal(stages.find(stage => stage.key === 'participate').count, 1);
  assert.equal(stages.find(stage => stage.key === 'joined').count, 0);
  assert.equal(stages.every(stage => stage.conversionRate === null), true);
});

test('l’identité des anciens événements est conservée quand le serveur la fournit', () => {
  const GA = activity();
  const formatted = GA.formatEvent(event('USER_LOGIN', 0, null, { actor_user_id: 'member-id', actor_pseudo: 'Camille' }));
  assert.equal(formatted.actor_id, 'member-id');
  assert.equal(GA.sessionUserLabel({ items: [formatted] }), 'Camille');
});
