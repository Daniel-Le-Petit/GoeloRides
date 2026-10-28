/** Accès rapide de l’accueil, réservé au rôle admin confirmé. */
(function () {
  'use strict';

  function init() {
    var actions = document.querySelector('[data-home-admin-actions]');
    var auth = window.GoeloAuthState;
    if (!actions || !auth) return;

    function sync(state) {
      actions.hidden = !state || state.pending || !state.user || state.role !== 'admin';
    }

    auth.subscribe(sync);
    sync(auth.getState());
    window.addEventListener('pageshow', function () { sync(auth.getState()); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
