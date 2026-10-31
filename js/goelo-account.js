/** Chargement borné de l’espace personnel, indépendant de la résolution du rôle. */
(function (global) {
  'use strict';
  function request(work, milliseconds) {
    var timer;
    return Promise.race([
      Promise.resolve(work),
      new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error('account_timeout')); }, milliseconds || 12000); })
    ]).finally(function () { clearTimeout(timer); });
  }
  function watch(onUser, onError) {
    var revision = 0;
    function consume(state) {
      if (!state || state.pending) return;
      revision++;
      onUser(state);
    }
    if (global.GoeloAuthState) global.GoeloAuthState.subscribe(consume);
    async function retry() {
      var ticket = ++revision;
      var state = global.GoeloAuthState && global.GoeloAuthState.getState();
      if (state && !state.pending) { onUser(state); return; }
      try {
        var sb = typeof global.goeloGetSb === 'function' && global.goeloGetSb();
        if (!sb || !sb.auth || !sb.auth.getSession) throw new Error('account_unavailable');
        var result = await request(sb.auth.getSession());
        if (ticket !== revision) return;
        if (result.error) throw result.error;
        var user = result.data && result.data.session && result.data.session.user;
        onUser({ pending: false, user: user || null });
      } catch (error) {
        if (ticket === revision) onError(error);
      }
    }
    retry();
    return retry;
  }
  global.GoeloAccount = { request: request, watch: watch };
})(window);
