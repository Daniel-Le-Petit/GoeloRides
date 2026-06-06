/**
 * Apparition au scroll (scrollytelling léger) pour .goelo-scrolly → .goelo-scrolly--in
 * Utilisé sur l’accueil et Infos pratiques. Respecte prefers-reduced-motion.
 */
(function () {
  "use strict";

  var nodes = document.querySelectorAll(".goelo-scrolly");
  if (!nodes.length) return;

  function revealAll() {
    nodes.forEach(function (el) {
      el.classList.add("goelo-scrolly--in");
    });
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    revealAll();
    return;
  }

  if (!("IntersectionObserver" in window)) {
    revealAll();
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("goelo-scrolly--in");
          io.unobserve(entry.target);
        }
      });
    },
    { root: null, rootMargin: "0px 0px 18% 0px", threshold: 0.04 }
  );

  function start() {
    nodes.forEach(function (el) {
      io.observe(el);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
