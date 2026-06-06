/**
 * Marqueur .goelo-scrolly--in pour compatibilité (le dévoilement au scroll a été retiré :
 * il laissait le contenu invisible sur une partie des mobiles / Safari).
 */
(function () {
  "use strict";

  function markAll() {
    document.querySelectorAll(".goelo-scrolly").forEach(function (el) {
      el.classList.add("goelo-scrolly--in");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", markAll);
  } else {
    markAll();
  }
})();
