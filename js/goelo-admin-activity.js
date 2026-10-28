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
  var _activeTab = "journeys";
  var _selectedSessionId = null;
  var _hideOwn = true;

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

  function registrationOverviewHtml() {
    var GA = window.GoeloActivity;
    var progress = _sessions.map(GA.registrationProgress);
    var counts = [
      { label: 'Sortie consultée', count: progress.filter(function (p) { return p.viewed; }).length },
      { label: 'Clic de participation', count: progress.filter(function (p) { return p.clicked; }).length },
      { label: 'Inscription confirmée', count: progress.filter(function (p) { return p.confirmed; }).length }
    ];
    var unlinked = _visibleEvents.filter(function (event) {
      return event.event_type === 'RIDE_JOINED' && !event.visitor_session_id && GA.registrationProgress({ items: [event] }).confirmed;
    }).length;
    return '<div class="act-registration-overview">' + counts.map(function (step) {
      return '<div><strong>' + step.count + '</strong><span>' + step.label + '</span></div>';
    }).join('') + '</div>' +
      '<p class="act-observation-note">' + _sessions.length + ' parcours observés · derniers 200 événements chargés.</p><details class="act-measurement-note"><summary>Comment lire ces chiffres ?</summary><p>Chaque compteur indique les parcours où une étape a été observée. Un parcours n’est pas un visiteur unique : les passages d’un même navigateur sont séparés après 30 minutes d’inactivité. Les données peuvent être partielles. Un clic ne prouve pas une inscription, et une absence de confirmation ne prouve pas un abandon.</p></details>' +
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

  function renderJourneys() {
    var GA = window.GoeloActivity;
    var panel = _$('act-analytics-panel');
    if (!panel || !GA) return;
    var filtered = _sessions.filter(function (session) {
      var progress = GA.registrationProgress(session);
      return _journeyFilter === 'all' || (_journeyFilter === 'confirmed' && progress.confirmed) ||
        (_journeyFilter === 'clicked' && progress.clicked && !progress.confirmed) ||
        (_journeyFilter === 'error' && progress.hasError) || (_journeyFilter === 'auth' && progress.authRequested) ||
        (_journeyFilter === 'viewed' && progress.viewed && !progress.clicked && !progress.confirmed);
    });
    var pageCount = Math.max(1, Math.ceil(filtered.length / JOURNEYS_PER_PAGE));
    _journeyPage = Math.min(_journeyPage, pageCount - 1);
    var shown = filtered.slice(_journeyPage * JOURNEYS_PER_PAGE, (_journeyPage + 1) * JOURNEYS_PER_PAGE);
    var options = [ ['all', 'Tous les parcours'], ['confirmed', 'Avec une inscription confirmée'], ['clicked', 'Clic sans confirmation observée'], ['viewed', 'Consultation sans clic observé'], ['error', 'Erreur de réponse après le clic'], ['auth', 'Connexion demandée après le clic'] ];
    panel.innerHTML = registrationOverviewHtml() +
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
      ['alerts', 'Alertes', ['ERROR_API', 'SUSPICIOUS_LOGIN']]
    ];
    var types = (categories.filter(function (category) { return category[0] === _memberCategory; })[0] || categories[0])[2];
    var filtered = events.filter(function (event) {
      return (!_memberId || memberKey(event) === _memberId) && (_memberCategory === 'all' || types.indexOf(event.event_type) !== -1 || (_memberCategory === 'alerts' && GA.participationOutcome(event) === 'error'));
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
    if (_activeTab === "members") renderMembers();
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
    var events = _hideOwn ? _allEvents.filter(function (event) {
      return !isOwn(event) && !ownSessions.has(sessionId(event));
    }) : _allEvents;
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
    _activeTab = tab || "journeys";
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
    var sb = window.goeloGetSb ? window.goeloGetSb() : null;
    if (!sb || !window.GoeloActivity) return;

    setLoading(true);
    var GA = window.GoeloActivity;
    var data = await GA.fetchAnalyticsEvents(sb, 200);

    renderStats(data.stats);
    _allEvents = data.events || [];
    renderFilteredActivity();

    if (data.error) {
      var errEl = _$("act-feed-error");
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = "Flux limité : " + data.error;
      }
    } else {
      var errBox = _$("act-feed-error");
      if (errBox) errBox.hidden = true;
    }
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
    bindControls();
    loadActivity();
    startTicker();
  }

  window.GoeloAdminActivity = { init: init, refresh: loadActivity };
})();
