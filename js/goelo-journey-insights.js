/** Lecture des observations, sans déduire une intention d'une absence d'action. */
(function (global) {
  'use strict';
  var pages = { home: 'Accueil', sorties: 'Sorties', parcours: 'Fiche sortie', groupes: 'Groupes', infos: 'Infos pratiques', album: 'Album' };
  var features = [
    ['upcoming', 'Cartes des prochaines sorties', ['home', 'sorties'], 'Mettre une prochaine sortie et son bouton Voir plus haut dans la page.'],
    ['participation', 'Bouton de participation', ['home', 'sorties', 'parcours'], 'Rendre le bouton de participation plus visible près des informations essentielles.'],
    ['polls', 'Sondages', ['home'], 'Remonter un sondage et raccourcir sa question.'],
    ['level', 'Cette sortie est-elle pour moi ?', ['parcours'], 'Placer le lien vers le guide de niveau près du groupe et de la distance.'],
    ['gpx', 'Trace GPX', ['parcours'], 'Ajouter un accès à la trace près du résumé de la sortie.'],
    ['map', 'Carte du parcours', ['parcours'], 'Proposer un lien Carte depuis le résumé de la sortie.'],
    ['messenger', 'Groupe Messenger', ['parcours', 'sorties'], 'Présenter Messenger après les informations utiles pour participer.'],
    ['participants', 'Liste des participants', ['parcours'], 'Rappeler les participants près du bouton de participation.'],
    ['groups', 'Présentation des groupes', ['groupes'], 'Rendre le choix du groupe accessible depuis les cartes de sorties.'],
    ['practical', 'Informations pratiques', ['infos'], 'Ajouter un lien vers les informations essentielles sur la fiche sortie.'],
    ['album', 'Photos des albums', ['home', 'album'], 'Mettre une photo et un accès Album près des prochaines sorties.'],
    ['album_to_rides', 'De l’album vers les sorties', ['home', 'album'], 'Placer Voir les prochaines sorties juste après les photos.']
  ].map(function (row) { return { key: row[0], label: row[1], pages: row[2], suggestion: row[3] }; });
  function metadata(event) { return event && event.metadata || {}; }
  function isTracked(event) { return metadata(event).analytics_version === 1; }
  function feature(key) { return features.find(function (f) { return f.key === key; }); }
  function automated(event) {
    var m = metadata(event);
    return /bot\b|crawler|spider|HeadlessChrome|Playwright/i.test(m.user_agent || '') ||
      /https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(m.referrer || '') || m.automation === true;
  }
  function eventLabel(event) {
    if (!isTracked(event)) return '';
    var m = metadata(event), f = feature(m.feature), label = f ? f.label : 'Fonctionnalité';
    if (m.analytics_action === 'page') return 'Page ouverte : ' + (pages[m.page] || 'Autre page');
    if (m.analytics_action === 'navigation') return 'Navigation vers ' + (pages[m.target_page] || 'une page') + ' · ' + ({ bottom: 'menu du bas', top: 'menu principal', content: 'contenu' }[m.surface] || 'contenu');
    if (m.analytics_action === 'available') return 'Proposé sur la page : ' + label;
    if (m.analytics_action === 'exposed') return 'Visible à l’écran : ' + label;
    if (m.analytics_action === 'used' && m.feature === 'gpx' && m.outcome === 'success') return 'GPX : fichier préparé pour le navigateur';
    if (m.analytics_action === 'used') return label + ' : ' + ({ clicked: 'clic', success: 'action réussie', error: 'erreur technique', requested: 'demande', opened: 'ouverture' }[m.outcome] || 'interaction');
    return 'Observation de navigation';
  }
  function summarize(events, GA) {
    var sessions = GA.buildVisitorSessions(events), rows = features.map(function (f) {
      var eligible = 0, seen = 0, used = 0, unseen = 0, seenWithoutUse = 0, errors = 0, followed = 0;
      sessions.forEach(function (s) {
        var items = s.items, hasNewTracking = items.some(isTracked), relevant = items.filter(function (e) {
          return isTracked(e) && metadata(e).feature === f.key || (hasNewTracking && f.key === 'participation' && e.event_type === 'RIDE_PARTICIPATE_CLICKED');
        });
        if (!relevant.length) return;
        eligible++;
        var exposed = relevant.some(function (e) { return metadata(e).analytics_action === 'exposed'; });
        var interactions = relevant.filter(function (e) { return metadata(e).analytics_action === 'used' || e.event_type === 'RIDE_PARTICIPATE_CLICKED'; });
        var interacted = interactions.length > 0;
        if (exposed) seen++;
        if (interacted) used++;
        if (!exposed && !interacted) unseen++;
        if (exposed && !interacted) seenWithoutUse++;
        if (interactions.some(function (e) { return metadata(e).outcome === 'error' || GA.participationOutcome(e) === 'error'; })) errors++;
        if (interactions.some(function (action) {
          return items.some(function (e) {
            var m = metadata(e), am = metadata(action);
            return (e.event_type === 'RIDE_JOINED' || GA.participationOutcome(e) === 'joined') &&
              ['waiting', 'waitlist'].indexOf(m.status) === -1 && new Date(e.created_at) > new Date(action.created_at) &&
              (!am.route_id || am.route_id === m.route_id);
          });
        })) followed++;
      });
      return Object.assign({}, f, { eligible: eligible, seen: seen, used: used, unseen: unseen, seenWithoutUse: seenWithoutUse, errors: errors, followed: followed });
    });
    var tracked = sessions.filter(function (s) { return s.items.some(isTracked); });
    var progress = sessions.map(GA.registrationProgress);
    return {
      sessions: sessions, tracked: tracked.length, features: rows,
      clicked: progress.filter(function (p) { return p.clicked; }).length,
      confirmed: progress.filter(function (p) { return p.confirmed; }).length,
      noConfirmation: progress.filter(function (p) { return p.clicked && !p.confirmed && !p.waiting; }).length,
      navigation: Object.keys(pages).map(function (key) { return { page: key, label: pages[key], count: tracked.filter(function (s) {
        return s.items.some(function (e) { var m = metadata(e); return isTracked(e) && m.analytics_action === 'page' && m.page === key; });
      }).length }; }).sort(function (a, b) { return b.count - a.count; })
    };
  }
  // L'historique détaillé est borné et sa couverture reste explicite.
  async function collect(sb, now) {
    var cutoff = new Date(now || Date.now()), since = new Date(cutoff.getTime() - 30 * 86400000), rows = [];
    for (var offset = 0; offset < 5000; offset += 500) {
      var r = await sb.from('activity_feed_human').select('*').gte('created_at', since.toISOString())
        .lte('created_at', cutoff.toISOString()).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
      if (r.error) throw r.error;
      if (!Array.isArray(r.data)) throw new Error('Historique indisponible');
      rows = rows.concat(r.data);
      if (r.data.length < 500) return { rows: rows, partial: false, since: since.toISOString() };
    }
    return { rows: rows, partial: true, since: since.toISOString() };
  }
  global.GoeloJourneyInsights = { features: features, pages: pages, isTracked: isTracked, automated: automated, eventLabel: eventLabel, summarize: summarize, collect: collect };
})(typeof window !== 'undefined' ? window : globalThis);
