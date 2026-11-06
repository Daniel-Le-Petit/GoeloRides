/** Observations limitées aux fonctionnalités publiques, sans valeurs saisies ni URL privée. */
(function (global) {
  'use strict';
  var doc = global.document, page, pageId, enabled = false, fired = new Set(), targets = new Map(), observer, mutation, timer;
  var pageNames = { 'index.html': 'home', 'sorties.html': 'sorties', 'parcours.html': 'parcours', 'groupes.html': 'groupes', 'infos-pratiques.html': 'infos', 'dans-la-roue.html': 'album' };
  var rules = [
    ['upcoming', '#gr-upcoming-rides .go-sc-card__title, .so-main .go-sc-card__title'],
    ['participation', '#pd-join-btn, .go-sc-btn--join'], ['polls', '.gr-poll-root h2, .gr-poll-root h3, [data-poll-multi] h2, [data-poll-multi] h3'],
    ['level', '[data-section="niveau_sortie"] .pd-acc__head'], ['gpx', '#pd-gpx-btn'], ['map', '#pd-map'],
    ['messenger', '[data-goelo-messenger-open]'], ['participants', '#pd-participants-title'],
    ['groups', '.gr-page-header h1'], ['practical', 'main h1'], ['album', '#gallery .cover, #gr-home-album [data-home-album-photo]'], ['album_to_rides', '.cta a[href="sorties.html"], #gr-home-album [data-home-album-rides]']
  ];
  function identify() { return pageNames[(location.pathname.split('/').pop() || 'index.html').toLowerCase()]; }
  function client() {
    var sb = global.goeloGetSb && global.goeloGetSb();
    if (sb) return sb;
    // La galerie publique n'initialise pas Auth ; on garde un journal anonyme via la RPC existante.
    var c = global.GOELO_CONFIG;
    if (!c || !global.fetch) return null;
    return { rpc: async function (name, args) {
      var response = await global.fetch(c.SUPABASE_URL + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: c.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + c.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args), keepalive: true });
      return response.ok ? { data: await response.json() } : { error: { message: 'Suivi indisponible' } };
    } };
  }
  function emit(action, feature, outcome, extra) {
    if (!enabled || !page || doc.visibilityState === 'hidden') return;
    var signature = [action, feature, outcome, extra && extra.target_page, extra && extra.surface].join(':');
    if (extra && extra.album_id) signature += ':' + extra.album_id + ':' + (extra.album_action || '') + ':' + (extra.photo_index || '');
    if (fired.has(signature)) return;
    try {
      var GA = global.GoeloActivity, sb = client();
      if (!GA || !sb) return;
      fired.add(signature);
      var referrer = '';
      try { var u = new URL(doc.referrer); referrer = u.origin + u.pathname; } catch (_) {}
      var meta = Object.assign({ analytics_version: 1, analytics_action: action, feature: feature || null, outcome: outcome || null, page: page, page_view_id: pageId, referrer: referrer }, extra || {});
      if (page === 'parcours') meta.route_id = new URLSearchParams(location.search).get('id');
      // Enveloppe déjà autorisée en production. Les lecteurs distinguent analytics_action des anciennes ouvertures d'infos.
      Promise.resolve(GA.logEvent(sb, GA.EVENT_TYPES.RIDE_INFO_OPENED, meta)).catch(function () {});
    } catch (_) { /* Une mesure ne doit jamais empêcher une action. */ }
  }
  function albumDetails(data) {
    if (!data || !/^[a-z0-9_-]{1,128}$/i.test(String(data.album_id || ''))) return null;
    var details = { album_id: String(data.album_id), album_title: String(data.album_title || 'Album').replace(/[\u0000-\u001f\u007f]/g, '').slice(0,160) };
    var count = Number(data.photo_count), index = Number(data.photo_index);
    if (Number.isInteger(count) && count > 0 && count <= 10000) details.photo_count = count;
    if (Number.isInteger(index) && index > 0 && details.photo_count && index <= count) details.photo_index = index;
    return details;
  }
  function albumContext(el) {
    if (page !== 'album') return null;
    var card = el.closest('[data-gallery-album]');
    return card && albumDetails({ album_id: card.getAttribute('data-gallery-album'), album_title: card.getAttribute('data-album-title'), photo_count: card.getAttribute('data-photo-count') });
  }
  function visible(el) {
    if (!el.isConnected || el.closest('[hidden]') || doc.visibilityState === 'hidden') return false;
    if (page === 'album' && doc.querySelector && doc.querySelector('#photo-viewer[open]')) return false;
    var style = global.getComputedStyle(el), r = el.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    return r.width > 0 && r.height > 0 && Math.min(r.bottom, global.innerHeight) - Math.max(r.top, 0) >= Math.min(r.height, global.innerHeight) * 0.5;
  }
  function clearTimers() { targets.forEach(function (state) { clearTimeout(state.timer); state.timer = null; }); }
  function observe() {
    if (!observer) return;
    rules.forEach(function (rule) {
      var definition = global.GoeloJourneyInsights && global.GoeloJourneyInsights.features.find(function (f) { return f.key === rule[0]; });
      if (!definition || definition.pages.indexOf(page) === -1) return;
      doc.querySelectorAll(rule[1]).forEach(function (el) {
        if (el.closest('[hidden]')) return;
        var style = global.getComputedStyle(el), rect = el.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || rect.width <= 0 || rect.height <= 0) return;
        emit('available', rule[0]);
        if (targets.has(el) || fired.has('exposed:' + rule[0] + ':::')) return;
        targets.set(el, { feature: rule[0], timer: null, extra: rule[0] === 'album' ? albumContext(el) : null }); observer.observe(el);
      });
    });
    targets.forEach(function (state, el) {
      if (!el.isConnected) { clearTimeout(state.timer); observer.unobserve(el); targets.delete(el); }
    });
  }
  function click(event) {
    var el = event.target.closest('a,button');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    var feature = el.closest('[data-goelo-messenger-open]') ? 'messenger' :
      el.closest('#pd-map, #pd-map-fit') ? 'map' : el.closest('[data-section="niveau_sortie"]') ? 'level' :
      el.closest('[data-poll-option], [data-multi-submit], [data-multi-opt]') ? 'polls' :
      el.closest('#gr-upcoming-rides, .so-main .go-sc-card') ? 'upcoming' :
      el.closest('#gallery button, #gr-home-album [data-home-album-photo], #gr-home-album [data-home-album-gallery]') ? 'album' : (el.closest('.cta a[href="sorties.html"]') && page === 'album' || el.closest('#gr-home-album [data-home-album-rides]')) ? 'album_to_rides' : null;
    if (feature && !(page === 'album' && el.closest('#gallery button'))) emit('used', feature, 'clicked');
    if (el.tagName !== 'A') return;
    var url;
    try { url = new URL(el.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin) return;
    var target = pageNames[url.pathname.split('/').pop() || 'index.html'];
    if (!target || url.pathname === location.pathname && url.search === location.search) return;
    var surface = el.closest('.goelo-mobile-tabbar, .mobile-nav') ? 'bottom' : el.closest('nav, .gr-mobile-drawer') ? 'top' : 'content';
    emit('navigation', null, 'clicked', { target_page: target, surface: surface });
  }
  function init() {
    page = identify();
    if (!page || /bot\b|crawler|spider|HeadlessChrome|Playwright/i.test(navigator.userAgent || '') || navigator.webdriver || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    enabled = true;
    pageId = global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : String(Date.now());
    emit('page');
    if (global.IntersectionObserver) {
      observer = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var state = targets.get(entry.target);
          if (!state) return;
          clearTimeout(state.timer); state.timer = null;
          if (entry.isIntersecting && visible(entry.target)) state.timer = setTimeout(function () {
            state.timer = null;
            if (visible(entry.target)) emit('exposed', state.feature, null, state.extra);
          }, 1000);
        });
      }, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
      observe();
      mutation = new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(observe, 150); });
      mutation.observe(doc.body, { childList: true, subtree: true });
    }
    doc.addEventListener('click', click, true);
    doc.addEventListener('visibilitychange', function () { clearTimers(); if (doc.visibilityState === 'visible') { emit('page'); observe(); if (observer) targets.forEach(function (_, el) { observer.unobserve(el); observer.observe(el); }); } });
    global.addEventListener('goelo:gallery-visibility-changed', function () { clearTimers(); observe(); if (observer) targets.forEach(function (_, el) { observer.unobserve(el); observer.observe(el); }); });
    global.addEventListener('pagehide', clearTimers);
    global.addEventListener('pageshow', function (event) { if (!event.persisted) return; fired.clear(); pageId = String(Date.now()); emit('page'); observe(); if (observer) targets.forEach(function (_, el) { observer.unobserve(el); observer.observe(el); }); });
  }
  global.GoeloFeatureTracking = { recordAlbum: function (action, data) {
    if (page !== 'album' || ['album_opened','photo_opened'].indexOf(action) === -1) return;
    var details = albumDetails(data);
    if (!details || action === 'photo_opened' && !details.photo_index) return;
    if (action === 'album_opened') delete details.photo_index;
    details.album_action = action;
    emit('used', 'album', 'opened', details);
  }, record: function (feature, outcome) { if (!global.GoeloJourneyInsights || !global.GoeloJourneyInsights.features.some(function (f) { return f.key === feature; })) return; emit('used', feature, outcome); } };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
