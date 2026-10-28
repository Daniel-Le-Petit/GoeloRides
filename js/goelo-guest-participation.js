(function (global) {
  'use strict';
  var busy = false;
  var route = null;
  var dialog = null;
  var messages = {
    not_ready: 'La participation sans compte n’est pas encore disponible. Réessaie plus tard ou utilise ton compte.',
    invalid_input: 'Vérifie ton pseudo et ton adresse e-mail.',
    rate_limited: 'Trop de demandes. Vérifie tes e-mails, puis réessaie dans une heure si nécessaire.',
    unavailable: 'Cette sortie n’est pas ouverte aux inscriptions.',
    full: 'La sortie est complète. Ta participation n’a pas été confirmée.',
    invalid_link: 'Ce lien n’est plus valide. Demande un nouveau lien depuis la sortie.',
    expired_link: 'Le délai de confirmation est dépassé. Demande un nouveau lien depuis la sortie.',
    mail_failed: 'L’e-mail n’a pas pu être envoyé. Ta participation n’est pas confirmée. Réessaie plus tard.'
  };
  function enabled() { return !!(global.GOELO_CONFIG && global.GOELO_CONFIG.GUEST_PARTICIPATION_ENABLED === true); }
  function message(code) { return messages[code] || 'La demande n’a pas pu aboutir. Réessaie ; aucune confirmation ne peut être déduite de cet écran.'; }
  function sb() {
    var client = global.goeloGetSb && global.goeloGetSb();
    if (client) return client;
    if (!global.supabase || !global.GOELO_CONFIG) throw new Error('not_ready');
    return global.supabase.createClient(global.GOELO_CONFIG.SUPABASE_URL, global.GOELO_CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  async function invoke(body) {
    var response = await sb().functions.invoke('guest-participation', { body: body });
    if (response.error) {
      var details;
      try { details = await response.error.context.json(); } catch (_) { /* Réponse réseau absente. */ }
      throw new Error(details && details.error || 'request_failed');
    }
    if (!response.data || response.data.ok !== true) throw new Error(response.data && response.data.error || 'request_failed');
    return response.data;
  }
  function track(phase, extra) {
    try {
      var GA = global.GoeloActivity;
      if (!GA || !route) return;
      Promise.resolve(GA.logEvent(null, 'RIDE_INFO_OPENED', Object.assign({ page: 'parcours', section: 'participation_sans_compte', guest_phase: phase }, extra || {}), { route_id: route.id, route_title: route.title })).catch(function () {});
    } catch (_) { /* Le suivi ne doit jamais empêcher la participation. */ }
  }
  function visitorId() {
    try { return localStorage.getItem('visitor_session_id'); } catch (_) { return null; }
  }
  function decorate(selectedRoute) {
    if (!enabled()) return;
    route = selectedRoute;
    var button = document.getElementById('pd-join-btn');
    if (!button) return;
    button.textContent = 'Je participe !';
    if (!document.getElementById('pd-guest-hint')) {
      var hint = document.createElement('p');
      hint.id = 'pd-guest-hint';
      hint.className = 'pd-guest-hint';
      hint.textContent = 'Sans compte : pseudo + e-mail privé. Confirmation par un lien reçu par e-mail.';
      button.after(hint);
    }
    if (!document.getElementById('pd-hesitation')) {
      var details = document.createElement('details');
      details.id = 'pd-hesitation';
      details.className = 'pd-guest-hint';
      details.innerHTML = '<summary>Qu’est-ce qui te manque pour participer ? (facultatif)</summary><div class="pd-guest-reasons"></div><p role="status"></p>';
      var choices = [['date','La date ne me convient pas'],['level','Je ne suis pas sûr de mon niveau'],['information','Il me manque des informations'],['account','Je ne veux pas créer de compte'],['other','Autre raison']];
      choices.forEach(function (choice) {
        var answer = document.createElement('button');
        answer.type = 'button'; answer.textContent = choice[1];
        answer.addEventListener('click', function () {
          track('hesitation', { reason: choice[0] });
          details.querySelectorAll('button').forEach(function (item) { item.disabled = true; });
          details.querySelector('[role="status"]').textContent = 'Merci pour ton retour.';
        });
        details.querySelector('div').appendChild(answer);
      });
      document.getElementById('pd-guest-hint').after(details);
    }
  }
  function open(selectedRoute) {
    if (!enabled() || !selectedRoute || !selectedRoute.id) return false;
    route = selectedRoute;
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.className = 'pd-guest-dialog';
      dialog.setAttribute('aria-labelledby', 'pd-guest-title');
      dialog.innerHTML = '<form id="pd-guest-form"><h2 id="pd-guest-title">Participer sans compte</h2><p id="pd-guest-route"></p><p>Aucun compte ni mot de passe. Tu recevras un lien pour confirmer ta place puis, si besoin, annuler.</p><label>Pseudo public<input name="pseudo" required maxlength="60" autocomplete="nickname"></label><label>E-mail privé<input name="email" type="email" required maxlength="254" autocomplete="email" inputmode="email" autocapitalize="none"></label><p>Seul ton pseudo sera affiché parmi les participants. Ton e-mail sert à gérer cette participation ; il n’est pas affiché publiquement.</p><div class="pd-guest-trap" aria-hidden="true"><label>Site web<input name="website" tabindex="-1" autocomplete="off"></label></div><p id="pd-guest-result" role="status" aria-live="polite"></p><button type="submit">Recevoir mon lien de confirmation</button><button type="button" data-guest-close>Fermer</button><button type="button" data-guest-account>J’ai déjà un compte</button></form>';
      document.body.appendChild(dialog);
      dialog.addEventListener('cancel', function (event) { if (busy) event.preventDefault(); });
      dialog.querySelector('[data-guest-close]').addEventListener('click', function () { if (!busy) dialog.close(); });
      dialog.querySelector('[data-guest-account]').addEventListener('click', function () {
        if (busy) return;
        dialog.close();
        if (typeof global.openGoeloAuth === 'function') global.openGoeloAuth();
      });
      dialog.querySelector('form').addEventListener('submit', async function (event) {
        event.preventDefault();
        if (busy || !dialog.querySelector('form').reportValidity()) return;
        busy = true;
        dialog.querySelectorAll('button').forEach(function (button) { button.disabled = true; });
        var result = document.getElementById('pd-guest-result');
        result.textContent = 'Envoi du lien…';
        try {
          await invoke({ action: 'request', route_id: route.id, pseudo: dialog.querySelector('[name="pseudo"]').value.trim(), email: dialog.querySelector('[name="email"]').value.trim(), website: dialog.querySelector('[name="website"]').value, visitor_session_id: visitorId() });
          result.textContent = 'Lien envoyé ! Ouvre ton e-mail et confirme ta participation. Vérifie aussi les indésirables. Aucune place n’est réservée avant confirmation.';
          dialog.querySelector('[name="email"]').value = '';
          track('email_sent');
        } catch (error) { result.textContent = message(error.message); track('error', { error_code: messages[error.message] ? error.message : 'request_failed' }); }
        finally { busy = false; dialog.querySelectorAll('button').forEach(function (button) { button.disabled = false; }); }
      });
    }
    document.getElementById('pd-guest-route').textContent = route.title || 'Sortie GoëloRides';
    document.getElementById('pd-guest-result').textContent = '';
    dialog.showModal();
    track('form_opened');
    return true;
  }
  global.GoeloGuestParticipation = { enabled: enabled, open: open, decorate: decorate, invoke: invoke, message: message };
})(window);
