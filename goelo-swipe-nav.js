/**
 * Navigation au doigt (écrans étroits) : depuis le bord gauche ou droit,
 * glisser horizontalement pour aller à la page précédente / suivante dans
 * l’ordre Accueil → Sorties → Groupes → Infos pratiques → (boucle).
 * Fiche sortie : bord gauche → retour liste sorties ; bord droit → groupes.
 * Désactive sur carte Leaflet, champs de formulaire, liens/boutons, modales.
 */
(function () {
  "use strict";

  var MAX_WIDTH = 900;
  var EDGE = 40;
  var MIN_DX = 56;
  var MIN_HORIZ = 1.12;

  var RING = ["index.html", "sorties.html", "groupes.html", "infos-pratiques.html"];

  function isMobile() {
    return window.matchMedia("(max-width: " + MAX_WIDTH + "px)").matches;
  }

  function pathBase() {
    var path = (location.pathname || "").toLowerCase();
    if (path.endsWith("sorties.html")) return "sorties.html";
    if (path.endsWith("sortie.html")) return "sortie.html";
    if (path.endsWith("groupes.html")) return "groupes.html";
    if (path.endsWith("infos-pratiques.html")) return "infos-pratiques.html";
    if (path.endsWith("index.html")) return "index.html";
    if (path === "/" || path === "") return "index.html";
    return "index.html";
  }

  function ringIndex() {
    var base = pathBase().toLowerCase();
    if (base === "sortie.html") return -1;
    var i = RING.indexOf(base);
    return i >= 0 ? i : 0;
  }

  function shouldIgnoreTarget(el) {
    if (!el || !el.closest) return true;
    return !!el.closest(
      "input, textarea, select, button, a, label, .leaflet-container, .leaflet-control-container, [data-no-swipe-nav]"
    );
  }

  function blockingModal() {
    var nm = document.getElementById("new-route-modal");
    var sm = document.getElementById("signup-modal");
    var sp = document.getElementById("sortie-signup-panel");
    if (nm && !nm.hidden) return true;
    if (sm && !sm.hidden) return true;
    if (sp && !sp.hidden) return true;
    if (document.documentElement.classList.contains("goelo-auth-modal-open")) return true;
    return false;
  }

  var sx;
  var sy;
  var edgeStart;
  var startTarget;
  var lastNav = 0;

  document.addEventListener(
    "touchstart",
    function (e) {
      edgeStart = null;
      sx = null;
      if (!isMobile() || e.touches.length !== 1) return;
      startTarget = e.target;
      if (shouldIgnoreTarget(startTarget) || blockingModal()) return;
      var t = e.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      var w = window.innerWidth || 400;
      if (sx <= EDGE) edgeStart = "left";
      else if (sx >= w - EDGE) edgeStart = "right";
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    function (e) {
      if (sx == null || sy == null) return;
      var gEdge = edgeStart;
      edgeStart = null;
      if (!isMobile() || !gEdge) {
        sx = null;
        return;
      }
      if (blockingModal()) {
        sx = null;
        return;
      }
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) {
        sx = null;
        return;
      }
      var dx = t.clientX - sx;
      var dy = t.clientY - sy;
      sx = null;
      sy = null;
      if (shouldIgnoreTarget(startTarget)) return;
      var adx = Math.abs(dx);
      var ady = Math.abs(dy);
      if (ady > adx * MIN_HORIZ) return;
      if (adx < MIN_DX) return;
      if (Date.now() - lastNav < 500) return;

      var base = pathBase().toLowerCase();
      var href = null;

      if (base === "sortie.html") {
        if (gEdge === "left" && dx > 0) href = "sorties.html";
        else if (gEdge === "right" && dx < 0) href = "groupes.html";
      } else {
        var idx = ringIndex();
        if (idx < 0) idx = 0;
        if (gEdge === "left" && dx > 0) href = RING[(idx + RING.length - 1) % RING.length];
        else if (gEdge === "right" && dx < 0) href = RING[(idx + 1) % RING.length];
      }

      if (href) {
        lastNav = Date.now();
        window.location.href = href;
      }
    },
    { passive: true }
  );

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      RING: RING,
      MAX_WIDTH: MAX_WIDTH,
      EDGE: EDGE,
      MIN_DX: MIN_DX,
      MIN_HORIZ: MIN_HORIZ,
      isMobile: isMobile,
      pathBase: pathBase,
      ringIndex: ringIndex,
      shouldIgnoreTarget: shouldIgnoreTarget,
      blockingModal: blockingModal
    };
  }
})();
