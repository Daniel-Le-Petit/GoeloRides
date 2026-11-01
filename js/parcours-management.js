/** Actions de gestion de la sortie, séparées des cartes publiques. */
(function () {
  'use strict';
  function init() {
    var host = document.getElementById('pd-management');
    var routeId = new URLSearchParams(location.search).get('id');
    if (!host || !routeId) return;
    var row = null, loading = false, busy = false, errorMessage = '';
    function auth() {
      return window.GoeloAuthState ? window.GoeloAuthState.getState() : {
        role: window.GOELO_ROLE, user: window.GOELO_USER, pending: window.GOELO_AUTH_PENDING
      };
    }
    function isAdmin() { var state = auth(); return !state.pending && state.user && state.role === 'admin'; }
    function eligible() { var state = auth(); return !state.pending && state.user && ['admin', 'team_rider'].indexOf(state.role) !== -1; }
    function canEdit() {
      var state = auth();
      return !!(row && eligible() && (isAdmin() || String(row.assigned_team_rider_id || '') === String(state.user.id)));
    }
    function config(value) {
      if (typeof value === 'string') { try { value = JSON.parse(value); } catch (_) { throw new Error('Les informations de la sortie sont invalides.'); } }
      if (value && (typeof value !== 'object' || Array.isArray(value))) throw new Error('Les informations de la sortie sont invalides.');
      return value || {};
    }
    function isCancelled() { return row && ['cancelled','canceled','annulee','annulée'].indexOf(config(row.front_config).sortieStatus) !== -1; }
    function link(text, mode) {
      var element = document.createElement('a');
      element.className = 'pd-manage-btn' + (mode === 'edit' ? ' pd-manage-btn--edit' : '');
      element.href = 'gestion-sorties.html?mode=' + mode + '&id=' + encodeURIComponent(routeId);
      element.textContent = text;
      return element;
    }
    function render() {
      host.hidden = !canEdit();
      if (host.hidden) { host.replaceChildren(); return; }
      var title = document.createElement('h2'); title.textContent = 'Gestion de la sortie';
      var actions = document.createElement('div'); actions.className = 'pd-management-actions';
      if (isAdmin()) actions.appendChild(link('Dupliquer', 'duplicate'));
      actions.appendChild(link('Modifier', 'edit'));
      if (isAdmin()) {
        var cancel = document.createElement('button'); cancel.type = 'button';
        cancel.className = 'pd-manage-btn pd-manage-btn--cancel';
        cancel.textContent = busy ? 'Annulation…' : 'Annuler la sortie';
        cancel.disabled = busy || isCancelled();
        cancel.addEventListener('click', cancelRide);
        actions.appendChild(cancel);
      }
      var status = document.createElement('p'); status.className = 'pd-management-status';
      status.setAttribute('role', errorMessage ? 'alert' : 'status');
      status.textContent = errorMessage || (isCancelled() ? 'Cette sortie est annulée.' : 'Actions réservées à la gestion de cette sortie.');
      host.replaceChildren(title, actions, status);
    }
    async function cancelRide() {
      if (busy || !isAdmin() || !canEdit() || isCancelled()) return;
      if (!window.confirm('Annuler la sortie « ' + (row.track_name || 'sans titre') + ' » ?')) return;
      busy = true; errorMessage = ''; render();
      try {
        var sb = window.goeloGetSb && window.goeloGetSb();
        if (!sb) throw new Error('Connexion au serveur indisponible.');
        var fresh = await sb.from('routes').select('*').eq('id', routeId).single();
        if (fresh.error || !fresh.data) throw fresh.error || new Error('Sortie introuvable.');
        if (!isAdmin()) throw new Error('Session modifiée. Reconnecte-toi.');
        var fc = Object.assign({}, config(fresh.data.front_config), { sortieStatus: 'cancelled' });
        var result = await sb.from('routes').update({ front_config: fc }).eq('id', routeId).select('id').single();
        if (result.error) throw result.error;
        if (!result.data || String(result.data.id) !== String(routeId)) throw new Error('Le serveur n’a pas confirmé l’annulation.');
        row = Object.assign({}, fresh.data, { front_config: fc });
      } catch (error) { errorMessage = 'Impossible d’annuler la sortie. ' + (error.message || 'Réessaie dans un instant.'); }
      finally { busy = false; render(); }
    }
    async function sync() {
      render();
      if (!eligible() || row || loading) return;
      var sb = window.goeloGetSb && window.goeloGetSb();
      if (!sb) return;
      loading = true;
      try {
        var result = await sb.from('routes').select('*').eq('id', routeId).single();
        if (result.error || !result.data) return;
        config(result.data.front_config);
        row = result.data;
      } catch (_) { /* La lecture du détail principal reste indépendante. */ }
      finally { loading = false; render(); }
    }
    if (window.GoeloAuthState) window.GoeloAuthState.subscribe(sync);
    window.addEventListener('goelo:role-ready', sync);
    window.addEventListener('pageshow', sync);
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
