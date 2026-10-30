/** Navigation de retour partagée, sans dépendance à Supabase. */
(function () {
  'use strict';

  function mount() {
    document.querySelectorAll('.goelo-back-navigation').forEach(function (old) { old.remove(); });
    var header = document.querySelector('#goelo-navbar, .gr-nav, .nav, header');
    if (!header) return;

    var logo = header.querySelector('.gr-nav__logo, .nav__logo, .topbar-logo, .gr-header-logo, a[href="index.html"]');
    if (!logo) return;
    var existing = document.querySelector('.goelo-back-navigation__back');
    if (existing) { logo.insertAdjacentElement('afterend', existing); return; }

    var page = window.location.pathname.split('/').pop();
    var fallbacks = {
      'parcours.html': 'sorties.html',
      'gestion-sorties.html': 'team-rider.html',
      'new-gestion-sorties.html': 'team-rider.html',
      'team-rider-info.html': 'team-rider.html',
      'admin-cyclistes.html': 'admin.html',
      'admin-approbations.html': 'admin.html',
      'admin-sondages.html': 'admin.html',
      'community-manager.html': 'admin.html',
      'cyclistes.html': 'admin.html',
      'allrides.html': 'sorties.html'
    };
    var fallback = fallbacks[page] || 'index.html';
    var canGoBack = false;
    try {
      var previous = new URL(document.referrer);
      canGoBack = previous.origin === window.location.origin && window.history.length > 1;
    } catch (e) { /* Ouverture directe : utiliser le lien de repli. */ }

    var back = document.createElement('a');
    back.href = fallback;
    back.className = 'goelo-back-navigation__back';
    back.textContent = '← Retour';
    back.setAttribute('aria-label', canGoBack ? 'Revenir à la page précédente' :
      (fallback === 'sorties.html' ? 'Revenir aux sorties' :
        fallback === 'team-rider.html' ? 'Revenir à l’espace Ride Leader' :
          fallback === 'admin.html' ? 'Revenir à l’administration' : 'Revenir à l’accueil'));
    back.addEventListener('click', function (event) {
      if (canGoBack && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
        event.preventDefault();
        window.history.back();
      }
    });
    logo.insertAdjacentElement('afterend', back);
  }

  window.addEventListener('goelo:navbar-ready', mount);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
