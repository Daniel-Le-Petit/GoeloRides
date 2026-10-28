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

function signupFlow(options = {}) {
  const GA = activity();
  const records = [];
  const calls = { rpc: 0, applied: 0, rollback: 0, login: 0 };
  GA.logEvent = (_, type, metadata) => {
    if (options.logThrows) throw new Error('suivi indisponible');
    if (options.logRejects) return Promise.reject(new Error('suivi indisponible'));
    records.push({ event_type: type, metadata: JSON.parse(JSON.stringify(metadata)) });
  };
  const button = {
    dataset: {}, disabled: false,
    getAttribute: name => name === 'data-auth-pending' ? (options.anonymous ? '1' : '0') : (options.cancel ? '1' : '0'),
    addEventListener: (_, handler) => { button.click = handler; }
  };
  const context = {
    window: { GoeloActivity: GA, openGoeloAuth: () => { calls.login++; } },
    console: { log() {}, warn() {}, error() {} },
    sortie: { id: 'route-demo', title: 'Boucle des falaises' },
    _joinBusy: false,
    getJoinButton: () => button,
    getUser: async () => options.expired ? null : { id: 'user-demo' },
    toggleSignup: async () => {
      calls.rpc++;
      if (options.networkError) throw new Error('connexion interrompue');
      return options.payload || { ok: true, action: 'added', joined: true, waitlist: false };
    },
    normalizeTogglePayload: value => value,
    isRpcOk: value => !!(value && [true, 'true', 1].includes(value.ok)),
    applyToggleResponseToUI: async () => { calls.applied++; if (options.uiError) throw new Error('rafraîchissement interrompu'); },
    renderJoin: async () => { calls.rollback++; }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../../js/parcours.js'), 'utf8');
  const start = source.indexOf('  function startParticipationAttempt()');
  const end = source.indexOf('\n  /* =========================================================\n     PARTICIPANTS', start);
  assert(start !== -1 && end !== -1);
  vm.runInNewContext(source.slice(start, end), context);
  context.bindJoin();
  return { GA, button, records, calls, context };
}

test('le clic et son succès serveur sont reliés, sans ajouter une seconde inscription métier', async () => {
  const flow = signupFlow();
  await flow.button.click();
  assert.equal(flow.calls.rpc, 1);
  assert.equal(flow.calls.applied, 1);
  assert.equal(flow.records.length, 2);
  assert.equal(flow.records[0].metadata.participation_attempt_id, flow.records[1].metadata.participation_attempt_id);
  assert.equal(flow.records.every(record => record.event_type === 'RIDE_PARTICIPATE_CLICKED'), true);
  assert.equal(flow.GA.registrationProgress({ items: flow.records }).confirmed, true);
  assert.equal(flow.GA.sessionActionCount(flow.records), 1);
  assert.equal(flow.GA.sessionActionCount(flow.records.slice(1)), 1);
});

test('la réponse serveur de liste d’attente ne confirme pas une place', async () => {
  const flow = signupFlow({ payload: { ok: true, action: 'added', joined: false, waitlist: true } });
  await flow.button.click();
  const progress = flow.GA.registrationProgress({ items: flow.records });
  assert.equal(progress.status, 'waiting');
  assert.equal(progress.confirmed, false);
  assert.equal(flow.calls.applied, 1);
});

test('une connexion demandée reste distincte d’une inscription, même si la session expire', async () => {
  for (const options of [{ anonymous: true }, { expired: true }]) {
    const flow = signupFlow(options);
    await flow.button.click();
    assert.equal(flow.calls.rpc, 0);
    assert.equal(flow.calls.login, 1);
    assert.equal(flow.GA.registrationProgress({ items: flow.records }).status, 'auth');
    assert.equal(flow.context._joinBusy, false);
  }
});

test('une réponse refusée ou interrompue est indiquée sans conclure à un abandon', async () => {
  for (const options of [{ payload: { ok: false, error: 'forbidden' } }, { networkError: true }]) {
    const flow = signupFlow(options);
    await flow.button.click();
    const progress = flow.GA.registrationProgress({ items: flow.records });
    assert.equal(progress.status, 'error');
    assert.equal(progress.confirmed, false);
    assert.equal(flow.calls.applied, 0);
    assert.equal(flow.calls.rollback, 1);
    assert.equal(flow.button.disabled, false);
  }
});

test('une désinscription et la réponse legacy already_registered ne deviennent pas des inscriptions', async () => {
  const cancel = signupFlow({ cancel: true, payload: { ok: true, action: 'removed', joined: false } });
  await cancel.button.click();
  assert.equal(cancel.records.length, 0);
  assert.equal(cancel.calls.applied, 1);
  const legacy = signupFlow({ payload: { ok: false, error: 'already_registered' } });
  await legacy.button.click();
  assert.equal(legacy.records[1].metadata.participation_result, 'removed');
  assert.equal(legacy.GA.registrationProgress({ items: legacy.records }).confirmed, false);
});

test('un échec de suivi ou de rafraîchissement visuel ne change pas le résultat serveur', async () => {
  for (const options of [{ logThrows: true }, { logRejects: true }]) {
    const flow = signupFlow(options);
    await flow.button.click();
    assert.equal(flow.calls.rpc, 1);
    assert.equal(flow.calls.applied, 1);
    assert.equal(flow.calls.rollback, 0);
  }
  const flow = signupFlow({ uiError: true });
  await flow.button.click();
  assert.equal(flow.records.length, 2);
  assert.equal(flow.records[1].metadata.participation_result, 'joined');
  assert.equal(flow.GA.registrationProgress({ items: flow.records }).confirmed, true);
});

test('un double appui ne déclenche qu’une tentative et un appel d’inscription', async () => {
  const flow = signupFlow();
  await Promise.all([flow.button.click(), flow.button.click()]);
  assert.equal(flow.calls.rpc, 1);
  assert.equal(flow.records.length, 2);
  assert.equal(flow.context._joinBusy, false);
});

test('les réponses incomplètes et les métadonnées non corrélées ne deviennent pas des confirmations', () => {
  const GA = activity();
  assert.equal(GA.classifyParticipationResult({ ok: true, action: 'added' }), 'unknown');
  assert.equal(GA.classifyParticipationResult({ ok: false, joined: true }), 'error');
  const uncorrelated = event('RIDE_PARTICIPATE_CLICKED', 0, 'browser-a', { metadata: { participation_phase: 'result', participation_result: 'joined' } });
  assert.equal(GA.registrationProgress({ items: [uncorrelated] }).confirmed, false);
});

test('un parcours réussi conserve la trace d’une connexion ou d’une erreur précédente', () => {
  const GA = activity();
  const outcomes = ['auth_required', 'error', 'joined'].map((result, minute) => event('RIDE_PARTICIPATE_CLICKED', minute, 'browser-a', {
    metadata: { participation_attempt_id: 'attempt-' + minute, participation_phase: 'result', participation_result: result }
  }));
  const progress = GA.registrationProgress({ items: outcomes });
  assert.equal(progress.confirmed, true);
  assert.equal(progress.status, 'confirmed');
  assert.equal(progress.hasError, true);
  assert.equal(progress.authRequested, true);
});
