/** Participation invitée : un pseudo, aucun compte, aucun e-mail. */
(function (global) {
  'use strict';
  var dialog, current, opener, busy = false, own = null;
  var memory = {};
  var currentAttempt = null;
  function beginAttempt() {
    try { return global.GoeloActivity && global.GoeloActivity.beginParticipationAttempt ? global.GoeloActivity.beginParticipationAttempt(current) : null; } catch (_) { return null; }
  }
  function finishAttempt(attempt, result) { try { if (attempt) attempt.finish(result); } catch (_) {} }
  var errors = {
    invalid_pseudo: 'Choisis un pseudo de 2 à 60 caractères.',
    pseudo_taken: 'Ce pseudo est déjà utilisé sur cette sortie. Choisis-en un autre.',
    full: 'La sortie est complète. Tu n’as pas été inscrit·e.',
    unavailable: 'Cette sortie n’est pas ouverte aux inscriptions.',
    past: 'Cette sortie est passée.',
    rate_limited: 'Trop de demandes rapprochées. Réessaie dans quelques minutes.',
    invalid_input: 'La demande est invalide. Ferme la fenêtre puis réessaie.'
  };
  function key(id) { return 'goelo-guest-pseudo:' + encodeURIComponent(id); }
  function saved(id) {
    try { var value = JSON.parse(localStorage.getItem(key(id)) || 'null'); if (value && /^[a-f0-9]{64}$/.test(value.token || '')) return value; } catch (_) { /* Stockage indisponible. */ }
    return memory[id] || null;
  }
  function tokenRecord(id) {
    var existing = saved(id);
    if (existing) return existing;
    var bytes = new Uint8Array(32); global.crypto.getRandomValues(bytes);
    var record = { token: Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join(''), joined: false };
    remember(id, record); return record;
  }
  function remember(id, record) {
    memory[id] = record;
    try { localStorage.setItem(key(id), JSON.stringify(record)); return true; } catch (_) { return false; }
  }
  function hasLocal(id) { var record = saved(id); return !!(record && record.joined); }
  async function refreshLocal(id) {
    var record = saved(id);
    var sb = global.goeloGetSb && global.goeloGetSb();
    if (!record || !sb) return hasLocal(id);
    try {
      var response = await sb.rpc('guest_pseudo_participation', {
        p_action: 'status', p_route_id: String(id), p_token: record.token, p_pseudo: null, p_visitor_session_id: null
      });
      if (response.error || !response.data || response.data.ok !== true || typeof response.data.joined !== 'boolean') return hasLocal(id);
      remember(id, { token: record.token, joined: response.data.joined, pseudo: response.data.pseudo || '' });
    } catch (_) { /* Conserver l’état local si la connexion est interrompue. */ }
    return hasLocal(id);
  }

  function errorText(error) {
    if (error && (error.code === 'PGRST202' || /guest_pseudo_participation.*(not find|schema|exist)/i.test(error.message || ''))) return 'La participation par pseudo n’est pas encore activée sur le serveur. Réessaie plus tard.';
    return errors[error && error.message] || 'La demande n’a pas pu être confirmée. Vérifie ta connexion puis réessaie.';
  }
  async function rpc(action, pseudo) {
    var sb = global.goeloGetSb && global.goeloGetSb();
    if (!sb) throw new Error('server_unavailable');
    var record = tokenRecord(current.id);
    var visitor = null;
    try { visitor = localStorage.getItem('visitor_session_id'); } catch (_) {}
    var response = await sb.rpc('guest_pseudo_participation', { p_action: action, p_route_id: current.id, p_token: record.token, p_pseudo: pseudo || null, p_visitor_session_id: visitor });
    if (response.error) throw response.error;
    if (!response.data || response.data.ok !== true) throw new Error(response.data && response.data.error || 'server_error');
    if (typeof response.data.joined !== 'boolean') throw new Error('server_error');
    return response.data;
  }
  function field(selector) { return dialog.querySelector(selector); }
  function notify() { global.dispatchEvent(new CustomEvent('goelo:signup-changed', { detail: { route_id: current.id, source: 'guest_pseudo' } })); }
  function showState(data, confirmed) {
    own = data;
    var record = tokenRecord(current.id);
    var persistent = remember(current.id, { token: record.token, joined: data.joined, pseudo: data.pseudo || '' });
    field('[data-pseudo-fields]').hidden = data.joined;
    field('[data-pseudo-cancel]').hidden = !data.joined;
    field('[data-pseudo-submit]').hidden = data.joined;
    field('[data-pseudo-title]').textContent = data.joined ? 'Ma participation' : 'Je participe à cette sortie';
    field('[data-pseudo-message]').textContent = data.joined
      ? (confirmed ? 'Tu es inscrit·e, ' : 'Tu participes à cette sortie, ') + data.pseudo + ' !'
      : confirmed ? 'Ta participation est annulée.' : 'Ton pseudo sera affiché parmi les participants.';
    field('[data-pseudo-storage]').textContent = data.joined
      ? persistent ? 'Tu peux retrouver et annuler ta participation sur cet appareil. Si tu effaces ses données, contacte l’organisateur pour annuler.' : 'Cet appareil ne peut pas mémoriser ta participation. Contacte l’organisateur si tu souhaites annuler après avoir quitté la page.'
      : 'Sans compte, sans mot de passe, sans e-mail.';
  }
  function lock(value) {
    busy = value;
    dialog.setAttribute('aria-busy', String(value));
    dialog.querySelectorAll('button').forEach(function (button) { button.disabled = value; });
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'go-pseudo-dialog';
    dialog.setAttribute('aria-labelledby', 'go-pseudo-title');
    dialog.innerHTML = '<form><h2 id="go-pseudo-title" data-pseudo-title>Je participe à cette sortie</h2><p class="go-pseudo-route" data-pseudo-route></p><div data-pseudo-fields><label for="go-pseudo-input">Ton pseudo</label><input id="go-pseudo-input" name="pseudo" autocomplete="nickname" placeholder="Ex. : Camille" minlength="2" maxlength="60" required></div><p data-pseudo-message role="status" aria-live="polite"></p><p class="go-pseudo-note" data-pseudo-storage>Sans compte, sans mot de passe, sans e-mail.</p><button type="submit" data-pseudo-submit>Confirmer ma participation</button><button type="button" data-pseudo-cancel hidden>Annuler ma participation</button><button type="button" class="go-pseudo-close" data-pseudo-close>Fermer</button></form>';
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', function (event) { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', function () {
      finishAttempt(currentAttempt, 'unknown'); currentAttempt = null;
      if (opener && opener.isConnected) opener.focus();
    });
    field('[data-pseudo-close]').addEventListener('click', function () { if (!busy) dialog.close(); });
    field('form').addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || own && own.joined || !field('form').reportValidity()) return;
      lock(true);
      var attempt = currentAttempt || beginAttempt();
      currentAttempt = null;
      try {
        var result = await rpc('join', field('input').value.trim());
        if (!result.joined || !result.pseudo) throw new Error('server_error');
        finishAttempt(attempt, result);
        showState(result, true); notify();
      } catch (error) {
        finishAttempt(attempt, 'error');
        field('[data-pseudo-message]').textContent = errorText(error);
      } finally { lock(false); }
    });
    field('[data-pseudo-cancel]').addEventListener('click', async function () {
      if (busy || !own || !own.joined || !global.confirm('Annuler ta participation à cette sortie ?')) return;
      lock(true);
      try {
        var result = await rpc('cancel');
        if (result.joined) throw new Error('server_error');
        showState(result, true); notify();
      } catch (error) { field('[data-pseudo-message]').textContent = errorText(error); }
      finally { lock(false); }
    });
  }
  async function open(route, source) {
    if (!route || !route.id || busy || dialog && dialog.open) return;
    current = route; opener = source || document.activeElement; own = null;
    ensureDialog();
    field('form').reset();
    field('[data-pseudo-title]').textContent = 'Je participe à cette sortie';
    var summary = route.summary || '';
    if (!summary && route.date && !isNaN(new Date(route.date).getTime())) {
      summary = new Date(route.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      if (route.meetTime) summary += ' · ' + String(route.meetTime).replace(':', 'h');
    }
    field('[data-pseudo-route]').textContent = [route.title || 'Sortie GoëloRides', summary].filter(Boolean).join(' · ');
    field('[data-pseudo-fields]').hidden = false;
    field('[data-pseudo-submit]').hidden = false;
    field('[data-pseudo-cancel]').hidden = true;
    field('[data-pseudo-message]').textContent = 'Vérification de ta participation…';
    field('[data-pseudo-storage]').textContent = 'Sans compte, sans mot de passe, sans e-mail.';
    dialog.showModal(); lock(true);
    currentAttempt = hasLocal(current.id) ? null : beginAttempt();
    try {
      var data = await rpc('status');
      showState(data, false);
      if (data.joined) { finishAttempt(currentAttempt, 'unknown'); currentAttempt = null; }
    }
    catch (error) {
      finishAttempt(currentAttempt, 'error'); currentAttempt = null;
      field('[data-pseudo-message]').textContent = errorText(error);
    }
    finally { lock(false); if (!own || !own.joined) field('input').focus(); }
  }
  function init() {
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-guest-join]');
      if (!button) return;
      event.preventDefault(); event.stopImmediatePropagation();
      open({ id: button.getAttribute('data-guest-join'), title: button.getAttribute('data-guest-title'), summary: button.getAttribute('data-guest-summary') }, button);
    }, true);
  }
  global.GoeloPseudoParticipation = { open: open, hasLocal: hasLocal, refreshLocal: refreshLocal };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
