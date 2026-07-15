/**
 * GoëloRides — Groupe Messenger : popup intermédiaire avant ouverture du lien.
 * URL : window.GOELO_CONFIG.GOELO_MESSENGER_GROUP_URL
 */
(function (global) {
  "use strict";

  function messengerGroupUrl() {
    var cfg = global.GOELO_CONFIG || {};
    return String(
      cfg.GOELO_MESSENGER_GROUP_URL ||
      cfg.MESSENGER_GROUP_URL ||
      ""
    ).trim();
  }

  var modalEl = null;

  function ensureModal() {
    if (modalEl) return modalEl;

    modalEl = global.document.createElement("div");
    modalEl.className = "go-messenger-modal gr-lockmodal";
    modalEl.id = "go-messenger-modal";
    modalEl.hidden = true;
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-labelledby", "go-messenger-modal-title");

    modalEl.innerHTML =
      "<div class=\"gr-lockmodal__backdrop\" data-go-messenger-close></div>" +
      "<div class=\"gr-lockmodal__panel go-messenger-modal__panel\">" +
        "<button type=\"button\" class=\"gr-lockmodal__close\" data-go-messenger-close aria-label=\"Fermer\">✕</button>" +
        "<h2 class=\"go-messenger-modal__title\" id=\"go-messenger-modal-title\">" +
          "Rejoindre le groupe Messenger GoëloRides 🚴" +
        "</h2>" +
        "<p class=\"go-messenger-modal__intro\">Le groupe Messenger permet de :</p>" +
        "<ul class=\"go-messenger-modal__list\">" +
          "<li>recevoir les annonces des prochaines sorties ;</li>" +
          "<li>être informé des changements de dernière minute ;</li>" +
          "<li>échanger avec les autres Riders.</li>" +
        "</ul>" +
        "<a class=\"go-messenger-modal__open gr-popover__btn\" " +
          "id=\"go-messenger-open-link\" href=\"#\" target=\"_blank\" rel=\"noopener noreferrer\">" +
          "👉 Ouvrir Messenger" +
        "</a>" +
        "<p class=\"go-messenger-modal__note\">Les demandes d'accès sont validées par un administrateur.</p>" +
      "</div>";

    modalEl.addEventListener("click", function (e) {
      if (e.target.closest("[data-go-messenger-close]")) {
        e.preventDefault();
        closeModal();
      }
    });

    global.document.body.appendChild(modalEl);
    return modalEl;
  }

  function openModal() {
    var url = messengerGroupUrl();
    if (!url) return;

    var modal = ensureModal();
    var link = modal.querySelector("#go-messenger-open-link");
    if (link) link.href = url;

    modal.hidden = false;
    global.document.documentElement.classList.add("goelo-modal-open");

    var focusTarget = link || modal.querySelector(".gr-lockmodal__close");
    if (focusTarget && focusTarget.focus) {
      setTimeout(function () { focusTarget.focus(); }, 0);
    }
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.hidden = true;
    global.document.documentElement.classList.remove("goelo-modal-open");
  }

  function revealBlocks() {
    if (!messengerGroupUrl()) return;
    global.document.querySelectorAll("#go-messenger-block, #go-messenger-compact").forEach(function (el) {
      el.hidden = false;
      el.removeAttribute("hidden");
    });
  }

  function bindTriggers() {
    global.document.addEventListener("click", function (e) {
      var trigger = e.target.closest("[data-goelo-messenger-open]");
      if (!trigger) return;
      e.preventDefault();
      openModal();
    });

    global.document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modalEl && !modalEl.hidden) {
        closeModal();
      }
    });
  }

  function init() {
    revealBlocks();
    bindTriggers();
  }

  global.GoeloMessenger = {
    url: messengerGroupUrl,
    open: openModal,
    close: closeModal
  };

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
