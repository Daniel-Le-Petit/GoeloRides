/**
 * GoëloRides — Activity dashboard admin : parcours, scénarios, funnel.
 */
(function () {
  "use strict";

  var _tickerTimer = null;
  var _tickerPaused = false;
  var _sessions = [];
  var _allEvents = [];
  var _visibleEvents = [];
  var _activeTab = "overview";
  var _selectedSessionId = null;
  var _hideOwn = true;
  var _hideBots = true;
  var _days = 30;
  var _networkFilter = '';
  var _networkCoverage = 'Mesure réseau disponible uniquement pour les nouvelles activités.';
  var _coverage = 'Chargement de l’historique…';
  var _loadPromise = null;

  function _$(id) { return document.getElementById(id); }

  function esc(s) {
    return window.GoeloActivity ? window.GoeloActivity._esc(s) : String(s == null ? "" : s);
  }

  function fmtTime(iso) {
    return window.GoeloActivity ? window.GoeloActivity.fmtTime(iso) : "—";
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return 'Date inconnue';
      return d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return fmtTime(iso);
    }
  }

  function renderStats(stats) {
    stats = stats || {};
    function set(id, val, subId, subVal) {
      var el = _$(id);
      if (el) el.textContent = val != null ? val : "—";
      if (subId) {
        var sub = _$(subId);
        if (sub) sub.textContent = subVal || "";
      }
    }
    set("act-stat-rides", stats.rides_active, "act-stat-rides-sub",
      stats.rides_created_today ? "+" + stats.rides_created_today + " créées aujourd'hui" : "");
    set("act-stat-cyclists", stats.cyclists_registered, "act-stat-cyclists-sub",
      stats.cyclists_new_today ? "dont " + stats.cyclists_new_today + " nouvelles" : "");
    set("act-stat-live", stats.events_today, "act-stat-live-sub", "événements aujourd'hui");
    var alerts = (stats.alerts || 0) + (stats.pending_demands || 0);
    set("act-stat-alerts", alerts, "act-stat-alerts-sub",
      alerts ? "à vérifier" : "rien à signaler");
  }

  function renderTicker(events) {
    var host = _$("act-ticker-list");
    var countEl = _$("act-ticker-count");
    if (!host) return;
    var alerts = (events || []).filter(function (ev) {
      return ev.severity === "alert";
    });
    var shown = alerts.slice(0, 8);
    var ticker = host.closest('.act-ticker');
    if (ticker) ticker.hidden = shown.length === 0;
    var analytics = host.closest('.act-analytics');
    if (analytics) analytics.classList.toggle('act-analytics--no-alerts', shown.length === 0);
    if (countEl) countEl.textContent = String(shown.length);
    if (!shown.length) {
      host.innerHTML = "<p class=\"act-ticker__empty\">Aucune alerte récente.</p>";
      return;
    }
    var GA = window.GoeloActivity;
    host.innerHTML = shown.map(function (ev) {
      return "<div class=\"act-ticker__row\">" +
        "<span class=\"act-ticker__time\">" + esc(GA.fmtTime(ev.created_at)) + "</span>" +
        "<span class=\"act-ticker__icon\" aria-hidden=\"true\">" + esc(ev.icon) + "</span>" +
        "<span class=\"act-ticker__text\">" + (ev.textHtml || esc(ev.label || ev.text)) + "</span>" +
        "</div>";
    }).join("");
  }

  function setLoading(on) {
    var panel = _$("act-analytics-panel");
    if (!panel || !on) return;
    panel.innerHTML =
      "<div class=\"gtr-loading\">" +
      "<div class=\"gtr-loading__dot\"></div>" +
      "<div class=\"gtr-loading__dot\"></div>" +
      "<div class=\"gtr-loading__dot\"></div>" +
      "</div>";
  }

  function sessionById(id) {
    for (var i = 0; i < _sessions.length; i++) {
      if (_sessions[i].visitor_session_id === id) return _sessions[i];
    }
    return null;
  }

  var _journeyPage = 0;
  var _journeyFilter = 'all';
  var JOURNEYS_PER_PAGE = 4;

  function observationSummary() {
    return window.GoeloJourneyInsights.summarize(_visibleEvents, window.GoeloActivity);
  }

  function coverageHtml() {
    return '<p class="act-observation-note">' + esc(_coverage) + '</p>' +
      '<p class="act-observation-note">Filtres : ' + _days + ' jours · ' + (_hideOwn ? 'mes activités masquées' : 'mes activités incluses') + ' · ' + (_hideBots ? 'robots et tests identifiables masqués' : 'robots et tests inclus') + '. Un parcours est séparé après 30 minutes d’inactivité ; ce n’est pas une personne unique. Un nettoyage peut réduire l’historique disponible.</p>';
  }

  function renderOverview() {
    var panel = _$('act-analytics-panel'), summary = observationSummary();
    if (!panel) return;
    var priorities = summary.features.filter(function (row) { return row.eligible >= 5 && (row.unseen || row.errors); })
      .sort(function (a, b) { return b.errors - a.errors || b.unseen / b.eligible - a.unseen / a.eligible; }).slice(0, 3);
    panel.innerHTML = '<h3 class="act-registration-title">Ce qui se passe sur le site</h3>' + coverageHtml() +
      registrationOverviewHtml() +
      '<h3 class="act-registration-title">Parcours à examiner</h3>' +
      '<div class="act-participation-checks">' + [
        ['viewed', 'Consultation sans clic observé'],
        ['clicked', 'Clic sans confirmation observée'],
        ['error', 'Erreur technique observée']
      ].map(function (item) {
        var count = _sessions.filter(function (session) { return journeyMatches(session, item[0]); }).length;
        return '<button type="button" data-act-review-journeys="' + item[0] + '"' + (!count ? ' disabled' : '') + '><strong>' + count + '</strong><span>' + item[1] + '</span><small>Voir les parcours →</small></button>';
      }).join('') + '</div>' +
      '<p class="act-observation-note">Ces étapes peuvent manquer dans l’historique chargé. Aucune absence de confirmation ne prouve un abandon.</p>' +
      '<h3 class="act-registration-title">À examiner en priorité</h3>' +
      (priorities.length ? '<div class="act-insight-priorities">' + priorities.map(function (row) {
        return '<article><h4>' + esc(row.label) + '</h4><p>' + (row.errors ? row.errors + ' parcours avec une erreur technique observée. Vérifier le fonctionnement sur mobile avant de changer la présentation.' : row.unseen + ' / ' + row.eligible + ' parcours où le bloc était proposé, sans visibilité ni interaction observée. Piste à tester : ' + esc(row.suggestion)) + '</p></article>';
      }).join('') + '</div>' : '<p class="act-observation-note">Pas encore assez d’observations pour faire ressortir une priorité. Les nouvelles mesures se rempliront avec les prochaines visites ; les anciennes traces ne permettent pas de savoir quels blocs étaient visibles.</p>') +
      '<h3 class="act-registration-title">Pages découvertes</h3><ul class="act-page-discovery">' + summary.navigation.map(function (row) {
        return '<li><span>' + esc(row.label) + '</span><strong>' + row.count + '</strong></li>';
      }).join('') + '</ul><p class="act-observation-note">Sur les ' + summary.tracked + ' parcours contenant le nouveau suivi. Une page ouverte n’est pas une preuve de lecture. Les pistes proposées restent des hypothèses à tester.</p>' +
      '<button type="button" class="act-visit-detail-btn" data-act-open-features>Voir les fonctionnalités découvertes</button>';
  }

  function renderNetworks() {
    var panel=_$('act-analytics-panel'),api=window.GoeloNetworkInsights;
    if(!panel||!api)return;
    var groups=api.group(_visibleEvents,window.GoeloActivity);
    panel.innerHTML='<h3 class="act-registration-title">Visites répétées depuis un même réseau</h3>'+coverageHtml()+
      '<p class="act-observation-note">'+esc(_networkCoverage)+' L’identifiant change chaque mois et expire après 30 jours. Une même IP peut être partagée ; un changement de réseau peut séparer une même personne. Ces rapprochements ne prouvent pas pourquoi une inscription n’a pas abouti.</p>'+
      (groups.length?'<div class="act-feature-list">'+groups.map(function(g){
        return '<article class="act-feature-card"><h4>Réseau '+esc(g.key.slice(0,8).toUpperCase())+' · '+esc(g.period)+'</h4>'+
        '<p>'+g.sessions+' visites observées · '+g.browsers+' identifiants de navigateur</p>'+
        '<dl><div><dt>Consultation sans clic</dt><dd>'+g.noClick+'</dd></div><div><dt>Clic sans confirmation</dt><dd>'+g.noConfirmation+'</dd></div><div><dt>Participation confirmée</dt><dd>'+g.confirmed+'</dd></div><div><dt>Erreur technique</dt><dd>'+g.errors+'</dd></div></dl>'+
        '<p>'+g.accounts+' créations de compte observées. Les compteurs décrivent des visites, sans fusionner les personnes.</p>'+
        '<button type="button" class="act-visit-detail-btn" data-act-network="'+g.key+'">Voir les parcours de ce réseau</button></article>';
      }).join('')+'</div>':'<p class="gtr-empty">Aucun réseau avec plusieurs visites rapprochables dans les activités chargées. Les anciennes activités ne peuvent pas être complétées rétroactivement.</p>');
  }
  async function attachNetworkLinks(sb) {
    _allEvents.forEach(function(e){e.metadata=Object.assign({},e.metadata);delete e.metadata.network_key;delete e.metadata.network_period;});
    try{
      var ids=_allEvents.map(function(e){return e.id}).filter(function(id){return /^[a-f0-9-]{36}$/i.test(id||'')}).slice(0,5000);
      if(!ids.length){_networkCoverage='Aucune activité avec un identifiant exploitable dans la sélection.';return;}
      var response=await sb.rpc('admin_activity_network_links',{p_event_ids:ids});
      if(response.error||!Array.isArray(response.data))throw Error('unavailable');
      if(!canExportActivity())return;
      var links=new Map(response.data.map(function(row){return [row.event_id,row]}));
      _allEvents.forEach(function(e){var link=links.get(e.id);if(link&&/^[a-f0-9]{64}$/.test(link.network_key)){e.metadata.network_key=link.network_key;e.metadata.network_period=link.period;}});
      _networkCoverage=response.data.length+' activités reliées à un identifiant réseau temporaire dans l’historique chargé.';
    }catch(_){_networkCoverage='Mesure réseau indisponible : la collecte serveur n’est pas encore accessible. Les autres analyses restent disponibles.';}
  }

  function renderFeatures() {
    var panel = _$('act-analytics-panel'), summary = observationSummary();
    if (!panel) return;
    panel.innerHTML = '<h3 class="act-registration-title">Ce qui est vu et utilisé</h3>' + coverageHtml() +
      '<p class="act-observation-note">Disponible = bloc présent et affichable sur la page, même hors écran. Visible = au moins la moitié du bloc (ou de l’écran pour un grand bloc), pendant une seconde, onglet actif. Les chiffres comptent des parcours, une seule fois par fonctionnalité. Un clic seul ne confirme pas une opération réussie.</p>' +
      '<div class="act-feature-list">' + summary.features.map(function (row) {
        return '<article class="act-feature-card"><h4>' + esc(row.label) + '</h4>' +
          (!row.eligible ? '<p>Pas encore de mesures sur les pages concernées.</p>' :
            '<dl><div><dt>Disponible sur la page</dt><dd>' + row.eligible + '</dd></div><div><dt>Visible</dt><dd>' + row.seen + '</dd></div><div><dt>Interaction</dt><dd>' + row.used + '</dd></div><div><dt>Non observé à l’écran</dt><dd>' + row.unseen + '</dd></div></dl>' +
            '<p>' + row.seenWithoutUse + ' parcours : bloc visible, sans interaction enregistrée. ' + (row.eligible < 5 ? 'Échantillon encore très faible. ' : '') + (row.errors ? row.errors + ' avec une erreur observée. ' : '') + '</p>' +
            '<details><summary>Comprendre et tester une amélioration</summary><p>' + esc(row.suggestion) + ' Comparer ensuite les observations sur une période similaire. Une absence d’interaction ne signifie pas un désintérêt ; le contenu a pu suffire ou être consulté autrement.</p><p>' + row.followed + ' parcours avec une interaction puis une inscription observée plus tard dans la même visite' + '. Cette succession ne prouve pas que la fonctionnalité a provoqué l’inscription.</p></details>') + '</article>';
      }).join('') + '</div>';
  }

  function registrationOverviewHtml(sessions) {
    var GA = window.GoeloActivity;
    var measured = sessions || _sessions;
    var progress = measured.map(GA.registrationProgress);
    var counts = [
      { label: 'Sortie consultée', count: progress.filter(function (p) { return p.viewed; }).length },
      { label: 'Clic de participation', count: progress.filter(function (p) { return p.clicked; }).length },
      { label: 'Inscription confirmée', count: progress.filter(function (p) { return p.confirmed; }).length }
    ];
    var unlinked = sessions ? 0 : _visibleEvents.filter(function (event) {
      return event.event_type === 'RIDE_JOINED' && !event.visitor_session_id && GA.registrationProgress({ items: [event] }).confirmed;
    }).length;
    return '<div class="act-registration-overview">' + counts.map(function (step) {
      return '<div><strong>' + step.count + '</strong><span>' + step.label + '</span></div>';
    }).join('') + '</div>' +
      '<p class="act-observation-note">' + measured.length + ' parcours observés · ' + esc(_coverage) + '</p><details class="act-measurement-note"><summary>Comment lire ces chiffres ?</summary><p>Chaque compteur indique les parcours où une étape a été observée. Un parcours n’est pas un visiteur unique : les passages d’un même navigateur sont séparés après 30 minutes d’inactivité. Les données peuvent être partielles. Un clic ne prouve pas une inscription, et une absence de confirmation ne prouve pas un abandon.</p></details>' +
      (unlinked ? '<p class="act-observation-note act-observation-note--warning">' + unlinked + ' confirmation' + (unlinked > 1 ? 's d’inscription ne sont pas reliées' : ' d’inscription n’est pas reliée') + ' à un parcours. ' + (unlinked > 1 ? 'Leur origine reste inconnue.' : 'Son origine reste inconnue.') + ' Ces traces peuvent concerner des inscriptions déjà visibles dans les compteurs ; ne les additionne pas.</p><button type="button" class="act-visit-detail-btn" data-act-show-signups>Voir les inscriptions des membres</button>' : '');
  }

  function renderSessionDetail(session) {
    var box = _$('act-session-detail');
    if (!box || !session || !window.GoeloActivity) return;
    var GA = window.GoeloActivity;
    var progress = GA.registrationProgress(session);
    var timeline = GA.collapseScrollDepthTimeline(session.items);
    box.hidden = false;
    box.setAttribute('tabindex', '-1');
    box.innerHTML = '<div class="act-session-detail__head"><div>' +
      '<h3 class="act-session-detail__title">Détail du parcours</h3>' +
      '<p class="act-session-detail__sub">' + esc(GA.sessionUserLabel(session)) + ' · ' + esc(fmtDateTime(session.items[0].created_at)) + '</p></div>' +
      '<button type="button" class="act-session-detail__close" data-act-close-detail aria-label="Fermer le détail">✕</button></div>' +
      '<p class="act-session-detail__summary">' + esc(progress.description) + '</p>' +
      '<ol class="act-session-detail__timeline">' + timeline.map(function (event) {
        var title = String(event.route_title || '').trim();
        return '<li class="act-session-detail__item"><span class="act-session-detail__time">' + esc(fmtTime(event.created_at)) + '</span>' +
          '<span class="act-session-detail__event">' + esc(GA.detailTimelineLabel(event)) +
          (title && !/c_[0-9a-f]+/i.test(title) ? '<small>' + esc(title) + '</small>' : '') + '</span></li>';
      }).join('') + '</ol>' +
      '<details class="act-technical"><summary>Données techniques</summary><p>Identifiant navigateur : ' + esc(session.visitor_id || session.visitor_session_id) + '</p>' +
      '<ul>' + session.items.map(function (event) { return '<li>' + esc(fmtTime(event.created_at)) + ' · ' + esc(event.event_type) + '</li>'; }).join('') + '</ul></details>';
  }

  function journeyMatches(session, filter) {
    var progress = window.GoeloActivity.registrationProgress(session);
    return filter === 'all' || (filter === 'confirmed' && progress.confirmed) ||
      (filter === 'clicked' && progress.clicked && !progress.confirmed && !progress.waiting) ||
      (filter === 'error' && progress.hasError) || (filter === 'auth' && progress.authRequested) ||
      (filter === 'viewed' && progress.viewed && !progress.clicked && !progress.confirmed && !progress.waiting);
  }

  function renderJourneys() {
    var GA = window.GoeloActivity;
    var panel = _$('act-analytics-panel');
    if (!panel || !GA) return;
    var filtered = _sessions.filter(function (session) {
      return journeyMatches(session, _journeyFilter);
    });
    var pageCount = Math.max(1, Math.ceil(filtered.length / JOURNEYS_PER_PAGE));
    _journeyPage = Math.min(_journeyPage, pageCount - 1);
    var shown = filtered.slice(_journeyPage * JOURNEYS_PER_PAGE, (_journeyPage + 1) * JOURNEYS_PER_PAGE);
    var options = [ ['all', 'Tous les parcours'], ['confirmed', 'Avec une inscription confirmée'], ['clicked', 'Clic sans confirmation observée'], ['viewed', 'Consultation sans clic observé'], ['error', 'Erreur de réponse après le clic'], ['auth', 'Connexion demandée après le clic'] ];
    if (_networkFilter) filtered=filtered.filter(function(session){return session.items.some(function(e){return window.GoeloNetworkInsights&&window.GoeloNetworkInsights.key(e)===_networkFilter;});});
    pageCount=Math.max(1,Math.ceil(filtered.length/JOURNEYS_PER_PAGE));
    _journeyPage=Math.min(_journeyPage,pageCount-1);
    shown=filtered.slice(_journeyPage*JOURNEYS_PER_PAGE,(_journeyPage+1)*JOURNEYS_PER_PAGE);
    panel.innerHTML = (_networkFilter?'<p class="act-observation-note">Parcours du réseau '+esc(_networkFilter.slice(0,8).toUpperCase())+' <button type="button" class="act-visit-detail-btn" data-act-clear-network>Voir tous les réseaux</button></p>':'') + registrationOverviewHtml(_networkFilter ? filtered : null) +
      '<label class="act-journey-filter" for="act-journey-filter">Parcours à afficher<select id="act-journey-filter">' + options.map(function (option) {
        return '<option value="' + option[0] + '"' + (_journeyFilter === option[0] ? ' selected' : '') + '>' + option[1] + '</option>';
      }).join('') + '</select></label>' +
      '<div class="act-visit-list">' + shown.map(function (session) {
        var progress = GA.registrationProgress(session);
        var first = session.items[0];
        var actions = GA.sessionActionCount(session.items);
        var isSelected = session.visitor_session_id === _selectedSessionId;
        return '<article class="act-visit-card' + (isSelected ? ' is-selected' : '') + '">' +
          '<div class="act-visit-card__head"><div><h3>' + esc(GA.sessionUserLabel(session)) + '</h3><p>' + esc(fmtDateTime(first.created_at)) + ' · ' + actions + ' action' + (actions > 1 ? 's' : '') + ' clé' + (actions > 1 ? 's' : '') + '</p></div>' +
          '<span class="act-visit-status act-visit-status--' + progress.status + '">' + progress.label + '</span></div>' +
          '<p class="act-visit-card__summary">' + esc(progress.description) + '</p>' +
          (progress.routes.length ? '<p class="act-visit-card__routes">Sortie' + (progress.routes.length > 1 ? 's' : '') + ' : ' + esc(progress.routes.slice(0, 2).join(' · ')) + (progress.routes.length > 2 ? '…' : '') + '</p>' : '') +
          (progress.steps.length ? '<ol class="act-visit-steps" aria-label="Étapes du parcours">' + progress.steps.map(function (step) { return '<li>' + esc(step) + '</li>'; }).join('') + '</ol>' : '') +
          '<button type="button" class="act-visit-detail-btn" data-act-session="' + esc(session.visitor_session_id) + '" aria-expanded="' + isSelected + '" aria-controls="act-session-detail">' + (isSelected ? 'Masquer le détail' : 'Voir le détail chronologique') + '</button></article>';
      }).join('') + '</div>' +
      (!shown.length ? '<p class="gtr-empty">Aucun parcours ne correspond à ce filtre dans les données chargées.</p>' : '') +
      '<nav class="act-visit-pagination" aria-label="Pagination des parcours"><button type="button" data-act-page="-1"' + (_journeyPage === 0 ? ' disabled' : '') + '>Précédent</button><span>' + filtered.length + ' parcours · page ' + (_journeyPage + 1) + '/' + pageCount + '</span><button type="button" data-act-page="1"' + (_journeyPage + 1 >= pageCount ? ' disabled' : '') + '>Suivant</button></nav>';
    if (_selectedSessionId) renderSessionDetail(sessionById(_selectedSessionId));
    else { var detail = _$('act-session-detail'); if (detail) detail.hidden = true; }
  }

  var _memberId = '';
  var _memberCategory = 'all';
  var _memberPage = 0;

  function memberLabel(event) {
    var name = window.GoeloActivity.sessionUserLabel({ items: [event] });
    return name === 'Visiteur anonyme' ? 'Utilisateur (nom indisponible)' : name;
  }

  function memberKey(event) {
    if (event.actor_id) return String(event.actor_id);
    var name = window.GoeloActivity.sessionUserLabel({ items: [event] });
    return name !== 'Visiteur anonyme' && name !== 'Membre (nom indisponible)' ? 'name:' + name.trim().toLowerCase() : null;
  }

  function renderMembers() {
    var GA = window.GoeloActivity;
    var panel = _$('act-analytics-panel');
    if (!panel || !GA) return;
    var events = _visibleEvents.filter(function (event) { return !!memberKey(event) || ['USER_REGISTERED', 'USER_LOGIN', 'RIDE_JOINED', 'RIDE_LEFT', 'COMMENT_CREATED', 'LIKE_ADDED', 'LIKE_REMOVED', 'RIDE_CREATED'].indexOf(event.event_type) !== -1; }).slice().sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    var members = new Map();
    events.forEach(function (event) {
      var id = memberKey(event);
      if (!id) return;
      if (!members.has(id) || members.get(id) === 'Membre (nom indisponible)') members.set(id, memberLabel(event));
    });
    if (_memberId && !members.has(_memberId)) _memberId = '';
    var categories = [
      ['all', 'Toutes les actions', []],
      ['signups', 'Inscriptions et désinscriptions', ['RIDE_JOINED', 'RIDE_LEFT']],
      ['accounts', 'Comptes et connexions', ['USER_REGISTERED', 'USER_LOGIN']],
      ['social', 'Commentaires et intérêts', ['COMMENT_CREATED', 'LIKE_ADDED', 'LIKE_REMOVED']],
      ['routes', 'Création de sorties', ['RIDE_CREATED']],
      ['features', 'Fonctionnalités et navigation', []],
      ['alerts', 'Alertes', ['ERROR_API', 'SUSPICIOUS_LOGIN']]
    ];
    var types = (categories.filter(function (category) { return category[0] === _memberCategory; })[0] || categories[0])[2];
    var filtered = events.filter(function (event) {
      return (!_memberId || memberKey(event) === _memberId) && (_memberCategory === 'all' || (_memberCategory === 'features' && window.GoeloJourneyInsights.isTracked(event)) || types.indexOf(event.event_type) !== -1 || (_memberCategory === 'alerts' && GA.participationOutcome(event) === 'error'));
    });
    var pages = Math.max(1, Math.ceil(filtered.length / 8));
    _memberPage = Math.min(_memberPage, pages - 1);
    var shown = filtered.slice(_memberPage * 8, (_memberPage + 1) * 8);
    panel.innerHTML = '<h3 class="act-registration-title">Activité des utilisateurs</h3>' +
      '<p class="act-observation-note">Cette vue inclut les actions des utilisateurs, même sans parcours de navigation associé. Le filtre « Masquer mes activités » s’applique aussi ici.</p>' + (events.some(function (event) { return !event.actor_id; }) ? '<p class="act-observation-note">Certaines anciennes traces ne contiennent qu’un nom. Ces filtres sont marqués « nom seul » et peuvent regrouper des homonymes.</p>' : '') +
      '<div class="act-member-filters"><label class="act-journey-filter" for="act-member-filter">Membre<select id="act-member-filter"><option value="">Tous les membres</option>' +
      Array.from(members).sort(function (a, b) { return a[1].localeCompare(b[1], 'fr'); }).map(function (member) {
        return '<option value="' + esc(member[0]) + '"' + (_memberId === member[0] ? ' selected' : '') + '>' + esc(member[1]) + (member[0].indexOf('name:') === 0 ? ' · nom seul' : '') + '</option>';
      }).join('') + '</select></label><label class="act-journey-filter" for="act-member-category">Type d’activité<select id="act-member-category">' +
      categories.map(function (category) { return '<option value="' + category[0] + '"' + (_memberCategory === category[0] ? ' selected' : '') + '>' + category[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="act-visit-list">' + shown.map(function (event) {
        var label = GA.detailTimelineLabel(event);
        if (label === 'Autre action enregistrée' && event.label) label = event.label;
        var title = event.route_title || '';
        return '<article class="act-visit-card act-member-card"><div class="act-visit-card__head"><div><h3>' + esc(members.get(memberKey(event)) || memberLabel(event)) + '</h3><p>' + esc(fmtDateTime(event.created_at)) + '</p></div></div>' +
          '<p class="act-visit-card__summary">' + esc(label) + '</p>' +
          (title && !/c_[0-9a-f]{8,}/i.test(title) ? '<p class="act-visit-card__routes">Sortie : ' + esc(title) + '</p>' : '') + '</article>';
      }).join('') + '</div>' + (!shown.length ? '<p class="gtr-empty">Aucune activité de membre pour cette sélection.</p>' : '') +
      '<nav class="act-visit-pagination" aria-label="Pagination des activités des membres"><button type="button" data-act-member-page="-1"' + (_memberPage === 0 ? ' disabled' : '') + '>Précédent</button><span>' + filtered.length + ' activités · page ' + (_memberPage + 1) + '/' + pages + '</span><button type="button" data-act-member-page="1"' + (_memberPage + 1 >= pages ? ' disabled' : '') + '>Suivant</button></nav>';
  }

  function renderScenarios() {
    var GA = window.GoeloActivity;
    var panel = _$("act-analytics-panel");
    if (!panel || !GA) return;

    var scenarios = GA.analyzeScenarios(_sessions);
    if (!scenarios.length) {
      panel.innerHTML = "<p class=\"gtr-empty\">Aucun scénario détecté.</p>";
      return;
    }

    panel.innerHTML =
      "<div class=\"act-journey-table-wrap\">" +
      "<table class=\"act-journey-table act-scenario-table\">" +
      "<thead><tr><th>Scénario</th><th>Occurrences</th></tr></thead><tbody>" +
      scenarios.map(function (row) {
        return "<tr><td class=\"act-scenario-table__path\">" + esc(row.scenario) + "</td>" +
          "<td class=\"act-scenario-table__count\">" + row.count + "</td></tr>";
      }).join("") +
      "</tbody></table></div>";
  }

  function renderFunnel() {
    var panel = _$('act-analytics-panel');
    if (panel) panel.innerHTML = '<h3 class="act-registration-title">Vers l’inscription à une sortie</h3>' + registrationOverviewHtml() +
      '<p class="act-observation-note">Ces compteurs indiquent les parcours où chaque étape a été observée. Ils ne constituent pas un taux de conversion : des étapes peuvent manquer et certaines inscriptions ne sont pas reliées à un parcours.</p>';
  }

  function renderActiveTab() {
    if (_activeTab === "overview") renderOverview();
    else if (_activeTab === "networks") renderNetworks();
    else if (_activeTab === "features") renderFeatures();
    else if (_activeTab === "members") renderMembers();
    else if (_activeTab === "scenarios") renderScenarios();
    else if (_activeTab === "funnel") renderFunnel();
    else renderJourneys();
  }

  function renderFilteredActivity() {
    var user = window.GOELO_USER;
    var ownId = user && user.id;
    var ownName = String(window.GOELO_DISPLAY_NAME || '').trim().toLowerCase();
    function isOwn(event) {
      var meta = event.metadata || {};
      var actor = event.actor_id || meta.actor_id || meta.user_id;
      if (actor) return !!ownId && String(actor) === String(ownId);
      var name = String(event.actor_pseudo || meta.actor_pseudo || '').trim().toLowerCase();
      return !!ownName && ownName !== '?' && name === ownName;
    }
    function sessionId(event) {
      return event.visitor_session_id || (event.metadata || {}).visitor_session_id;
    }
    var ownSessions = new Set(_allEvents.filter(isOwn).map(sessionId).filter(Boolean));
    var eligible = _allEvents.filter(function (event) {
      return new Date(event.created_at).getTime() >= Date.now() - _days * 86400000 &&
        (!_hideBots || !window.GoeloJourneyInsights.automated(event));
    });
    var events = _hideOwn ? eligible.filter(function (event) {
      return !isOwn(event) && !ownSessions.has(sessionId(event));
    }) : eligible;
    _visibleEvents = events;
    _sessions = window.GoeloActivity.buildVisitorSessions(events);
    if (_selectedSessionId && !sessionById(_selectedSessionId)) {
      _selectedSessionId = null;
      var detail = _$('act-session-detail');
      if (detail) detail.hidden = true;
    }
    var count = _$('act-visible-count');
    if (count) count.textContent = events.length + ' activités affichées' +
      (_hideOwn ? ' · ' + (_allEvents.length - events.length) + ' masquées' : '');
    renderTicker(events);
    renderActiveTab();
  }

  function setActiveTab(tab) {
    _activeTab = tab || "overview";
    _selectedSessionId = null;
    var detail = _$('act-session-detail');
    if (detail) detail.hidden = true;
    document.querySelectorAll("[data-act-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-act-tab") === _activeTab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
    });
    var panel = _$('act-analytics-panel');
    if (panel) panel.setAttribute('aria-labelledby', 'act-tab-' + _activeTab);
    renderActiveTab();
  }

  async function loadActivity() {
    if (_loadPromise) return _loadPromise;
    var sb = window.goeloGetSb ? window.goeloGetSb() : null;
    if (!sb || !window.GoeloActivity || !canExportActivity()) return;
    _loadPromise = (async function () {
      setLoading(true);
      var GA = window.GoeloActivity;
      var results = await Promise.allSettled([GA.fetchAnalyticsEvents(sb, 200), window.GoeloJourneyInsights.collect(sb)]);
      if (!canExportActivity()) { _allEvents = []; _visibleEvents = []; _sessions = []; setLoading(true); return; }
      var data = results[0].status === 'fulfilled' ? results[0].value : { events: [], stats: {}, error: 'Lecture des chiffres indisponible' };
      renderStats(data.stats);
      if (results[1].status === 'fulfilled') {
        var history = results[1].value;
        _allEvents = GA.formatEvents(history.rows);
        _coverage = history.partial ? 'Historique partiel : 5 000 activités récentes au maximum sur 30 jours.' : 'Activités accessibles des 30 derniers jours (' + _allEvents.length + ' traces).';
      } else {
        _allEvents = data.events || [];
        _coverage = 'Historique limité au flux récent : 200 événements au maximum, sans garantie de couvrir la période choisie.';
      }
      await attachNetworkLinks(sb);
      if (!canExportActivity()) { _allEvents=[]; _visibleEvents=[]; _sessions=[]; return; }
      renderFilteredActivity();
      var box = _$('act-feed-error');
      if (box) { box.hidden = !data.error; box.textContent = data.error ? 'Chiffres clés indisponibles : ' + data.error : ''; }
    })();
    try { await _loadPromise; } finally { _loadPromise = null; }
  }

  var _exportBusy = false;
  var _exportUrl = null;

  function canExportActivity() {
    var auth = window.GoeloAuthState ? window.GoeloAuthState.getState() : {
      role: window.GOELO_ROLE, user: window.GOELO_USER, pending: window.GOELO_AUTH_PENDING
    };
    return !auth.pending && auth.role === 'admin' && !!(auth.user && auth.user.id);
  }

  async function exportActivity() {
    if (_exportBusy || !canExportActivity()) return;
    var button = _$('act-export-btn');
    var status = _$('act-export-status');
    var link = _$('act-export-download');
    var sb = window.goeloGetSb ? window.goeloGetSb() : null;
    if (!sb || !window.GoeloActivityExport) {
      status.textContent = 'Export indisponible. Recharge la page puis réessaie.';
      return;
    }
    _exportBusy = true;
    button.disabled = true;
    link.hidden = true;
    if (_exportUrl) URL.revokeObjectURL(_exportUrl);
    _exportUrl = null;
    status.textContent = 'Préparation du fichier…';
    try {
      var result;
      var recentOnly = false;
      try {
        result = await window.GoeloActivityExport.collect(sb, function (count) {
          status.textContent = count + ' activités récupérées…';
        });
        if (!result.rows.length && _allEvents.length) throw new Error('Historique inaccessible.');
      } catch (error) {
        // Certaines installations autorisent seulement la RPC du Dashboard.
        // Ne jamais présenter ses 200 événements comme un historique complet.
        var fallback = await window.GoeloActivity.fetchDashboard(sb, 200);
        if (fallback.error) throw new Error('Lecture des activités refusée ou interrompue. Reconnecte-toi puis réessaie.');
        result = { rows: fallback.events || [], partial: true };
        recentOnly = true;
      }
      if (!canExportActivity()) throw new Error('Session modifiée. Reconnecte-toi pour exporter.');
      if (!result.rows.length) {
        status.textContent = 'Aucune activité disponible à exporter.';
        return;
      }
      _exportUrl = URL.createObjectURL(new Blob([window.GoeloActivityExport.toCsv(result.rows)], { type: 'text/csv;charset=utf-8' }));
      link.href = _exportUrl;
      link.download = 'goelorides-activites-' + (result.partial ? 'partiel-' : '') + new Date().toISOString().slice(0, 10) + '.csv';
      link.textContent = 'Télécharger le CSV (' + result.rows.length + ' activités)';
      link.hidden = false;
      var dates = result.rows.map(function (row) { return row.created_at; }).filter(Boolean).sort();
      status.textContent = (recentOnly ? 'Export limité au flux récent du Dashboard (200 événements au maximum). ' : result.partial ? 'Export partiel : limite de 100 000 activités atteinte. ' : 'Toutes les activités accessibles ont été récupérées. ') +
        (dates.length ? 'Du ' + fmtDateTime(dates[0]) + ' au ' + fmtDateTime(dates[dates.length - 1]) + '. ' : '') +
        'Tes propres activités sont incluses, même si elles sont masquées à l’écran. Appuie sur le lien pour enregistrer le fichier dans Fichiers.';
      link.focus();
    } catch (error) {
      status.textContent = error.message || 'Impossible de préparer le CSV. Réessaie.';
    } finally {
      _exportBusy = false;
      button.disabled = !canExportActivity();
    }
  }

  function bindControls() {
    var exportButton = _$('act-export-btn');
    if (exportButton) exportButton.addEventListener('click', exportActivity);
    var exportLink = _$('act-export-download');
    if (exportLink) exportLink.addEventListener('click', function (event) {
      if (!canExportActivity()) { event.preventDefault(); exportLink.hidden = true; }
    });
    var days = _$('act-period');
    if (days) days.addEventListener('change', function () { _days = Number(days.value) === 7 ? 7 : 30; _journeyPage = 0; _memberPage = 0; renderFilteredActivity(); });
    var hideBots = _$('act-hide-bots');
    if (hideBots) hideBots.addEventListener('change', function () { _hideBots = hideBots.checked; renderFilteredActivity(); });
    var hideOwn = _$('act-hide-own');
    if (hideOwn) hideOwn.addEventListener('change', function () {
      _hideOwn = hideOwn.checked;
      renderFilteredActivity();
    });
    var refreshBtn = _$("act-refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () { loadActivity(); });
    }

    document.querySelectorAll("[data-act-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveTab(btn.getAttribute("data-act-tab"));
      });
      btn.addEventListener('keydown', function (event) {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) === -1) return;
        event.preventDefault();
        var tabs = Array.from(document.querySelectorAll('[data-act-tab]'));
        var index = tabs.indexOf(btn);
        var next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
          (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        setActiveTab(tabs[next].getAttribute('data-act-tab'));
        tabs[next].focus();
      });
    });

    var panel = _$("act-analytics-panel");
    if (panel) {
      panel.addEventListener('change', function (e) {
        if (e.target.id === 'act-member-filter' || e.target.id === 'act-member-category') {
          if (e.target.id === 'act-member-filter') _memberId = e.target.value;
          else _memberCategory = e.target.value;
          _memberPage = 0;
          renderMembers();
          return;
        }
        if (e.target.id !== 'act-journey-filter') return;
        _journeyFilter = e.target.value;
        _journeyPage = 0;
        _selectedSessionId = null;
        renderJourneys();
      });
      panel.addEventListener("click", function (e) {
        var network=e.target.closest('[data-act-network]');
        if(network){var key=network.getAttribute('data-act-network');if(/^[a-f0-9]{64}$/.test(key)){_networkFilter=key;_journeyFilter='all';_journeyPage=0;setActiveTab('journeys');}return;}
        if(e.target.closest('[data-act-clear-network]')){_networkFilter='';_journeyPage=0;setActiveTab('networks');return;}
        var review = e.target.closest('[data-act-review-journeys]');
        if (review) {
          var filter = review.getAttribute('data-act-review-journeys');
          if (['viewed', 'clicked', 'error'].indexOf(filter) === -1 || review.disabled) return;
          _networkFilter=''; _journeyFilter = filter; _journeyPage = 0; _selectedSessionId = null;
          setActiveTab('journeys');
          var select = _$('act-journey-filter'); if (select) select.focus();
          return;
        }
        if (e.target.closest('[data-act-open-features]')) { setActiveTab('features'); return; }
        if (e.target.closest('[data-act-show-signups]')) {
          _memberCategory = 'signups';
          _memberId = '';
          _memberPage = 0;
          setActiveTab('members');
          return;
        }
        var memberPage = e.target.closest('[data-act-member-page]');
        if (memberPage) {
          _memberPage = Math.max(0, _memberPage + Number(memberPage.getAttribute('data-act-member-page')));
          renderMembers();
          return;
        }
        var pagination = e.target.closest('[data-act-page]');
        if (pagination) {
          _journeyPage = Math.max(0, _journeyPage + Number(pagination.getAttribute('data-act-page')));
          _selectedSessionId = null;
          renderJourneys();
          return;
        }
        var row = e.target.closest("[data-act-session]");
        if (!row) return;
        var sessionId = row.getAttribute("data-act-session");
        _selectedSessionId = _selectedSessionId === sessionId ? null : sessionId;
        renderJourneys();
        if (_selectedSessionId) {
          var detail = _$('act-session-detail');
          if (detail) { detail.focus({ preventScroll: true }); detail.scrollIntoView({ block: 'start' }); }
        }
      });

    }

    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-act-close-detail]")) {
        var closedSessionId = _selectedSessionId;
        _selectedSessionId = null;
        var detail = _$("act-session-detail");
        if (detail) detail.hidden = true;
        renderJourneys();
        document.querySelectorAll('[data-act-session]').forEach(function (button) {
          if (button.getAttribute('data-act-session') === closedSessionId) button.focus();
        });
        return;
      }
      var btn = e.target.closest("[data-act-verify]");
      if (!btn) return;
      e.preventDefault();
      var wrap = document.getElementById("gtr-toast-wrap");
      if (wrap) {
        var el = document.createElement("div");
        el.className = "gtr-toast";
        el.textContent = "Alerte notée — à traiter manuellement.";
        wrap.appendChild(el);
        setTimeout(function () { el.remove(); }, 3500);
      }
    });

    var pauseBtn = _$("act-ticker-pause");
    if (pauseBtn) {
      pauseBtn.addEventListener("click", function () {
        _tickerPaused = !_tickerPaused;
        pauseBtn.textContent = _tickerPaused ? "Reprendre" : "Pause";
        if (!_tickerPaused) loadActivity();
      });
    }

    var cleanupBtn = _$("act-cleanup-btn");
    if (cleanupBtn) {
      cleanupBtn.addEventListener("click", function () {
        handleCleanup();
      });
    }
  }

  async function handleCleanup() {
    var confirmed = confirm(
      "Supprimer les activités de plus de 7 jours ainsi que toutes les activités de l'utilisateur Daniel ?\n\n" +
      "Cette action est irréversible."
    );
    if (!confirmed) return;

    var btn = _$("act-cleanup-btn");
    if (btn) btn.disabled = true;

    try {
      var sb = window.goeloGetSb ? window.goeloGetSb() : null;
      if (!sb) {
        showToast("Erreur : Supabase non disponible", true);
        return;
      }

      var res = await sb.rpc("activity_admin_cleanup");
      if (res.error) {
        console.error("[ActivityCleanup] RPC error:", res.error);
        showToast("Erreur : " + (res.error.message || "Échec du nettoyage"), true);
        return;
      }

      var data = res.data || {};
      if (data.ok === false) {
        showToast("Erreur : " + (data.error || "Échec du nettoyage"), true);
        return;
      }

      var msg = "Nettoyage terminé :\n" +
        "• " + (data.deleted_old || 0) + " activités de plus de 7 jours supprimées\n" +
        "• " + (data.deleted_daniel || 0) + " activités de Daniel supprimées\n" +
        "• Total : " + (data.deleted_total || 0) + " éléments supprimés";

      showToast(msg.replace(/\n/g, " · "), false);
      console.log("[ActivityCleanup] Success:", data);

      // Rafraîchir la liste
      setTimeout(function () {
        loadActivity();
      }, 800);
    } catch (err) {
      console.error("[ActivityCleanup] Exception:", err);
      showToast("Erreur réseau : " + (err.message || "Échec du nettoyage"), true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function showToast(message, isError) {
    var wrap = document.getElementById("gtr-toast-wrap");
    if (!wrap) return;
    var el = document.createElement("div");
    el.className = "gtr-toast" + (isError ? " gtr-toast--error" : "");
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, isError ? 5000 : 4000);
  }

  function startTicker() {
    if (_tickerTimer) clearInterval(_tickerTimer);
    _tickerTimer = setInterval(function () {
      if (!_tickerPaused) loadActivity();
    }, 45000);
  }

  function init() {
    var section = _$("act-dashboard");
    if (!section) return;
    if (section.dataset.activityBound === '1') return;
    section.dataset.activityBound = '1';
    bindControls();
    window.addEventListener('goelo:role-ready', function () {
      if (canExportActivity()) { loadActivity(); return; }
      _allEvents = []; _visibleEvents = []; _sessions = [];
      var panel = _$('act-analytics-panel'); if (panel) panel.textContent = 'Accès administrateur requis.';
      var detail = _$('act-session-detail'); if (detail) { detail.hidden = true; detail.innerHTML = ''; }
    });
    loadActivity();
    startTicker();
  }

  window.GoeloAdminActivity = { init: init, refresh: loadActivity };
})();
