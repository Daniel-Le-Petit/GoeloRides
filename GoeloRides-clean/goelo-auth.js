/* ═══════════════════════════════════════════════════════════════
   goelo-auth.js — pont de compatibilité
   La logique des modales Team Rider / Connexion vit désormais
   dans js/auth.js (styles : css/components.css).
   Ce fichier reste chargé sur toutes les pages : il injecte la
   version canonique pour ne pas devoir éditer chaque page.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__goeloAuthInit || document.querySelector('script[src$="js/auth.js"]')) return;
  var s = document.createElement("script");
  s.src = "js/auth.js";
  document.head.appendChild(s);
})();
