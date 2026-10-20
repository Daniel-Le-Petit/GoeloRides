/**
 * GoëloRides — Inscription invité sans compte (pseudo + jeton d'annulation).
 * UI mobile : modale légère, mémorisation locale du pseudo (pas une identité).
 */
(function (global) {
  "use strict";

  var PSEUDO_KEY = "goelo_guest_pseudo_v1";
  var TOKENS_KEY = "goelo_guest_tokens_v1";
  var CLIENT_KEY = "goelo_guest_client_key_v1";

  var modalEl = null;
  var _busy = false;
  var _ctx = null;

  function getSb() {
    return global.goeloGetSb ? global.goeloGetSb() : null;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readLocal(key, fallback) {
    try {
      var raw = global.localStorage && global.localStorage.getItem(key);
      return raw == null ? fallback : raw;
    } catch (e) {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    try {
      if (global.localStorage) global.localStorage.setItem(key, value);
    } catch (e) { void e; }
  }

  function readTokens() {
    try {
      var raw = readLocal(TOKENS_KEY, "{}");
      var obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function writeTokens(map) {
    try {
      writeLocal(TOKENS_KEY, JSON.stringify(map || {}));
    } catch (e) { void e; }
  }

  function getManageToken(routeId) {
    var id = String(routeId || "").trim();
    if (!id) return "";
    var map = readTokens();
    return String(map[id] || "").trim();
  }

  function setManageToken(routeId, token) {
    var id = String(routeId || "").trim();
    if (!id) return;
    var map = readTokens();
    if (token) map[id] = String(token);
    else delete map[id];
    writeTokens(map);
  }

  function getSavedPseudo() {
    return String(readLocal(PSEUDO_KEY, "") || "").trim();
  }

  function savePseudo(pseudo) {
    var p = String(pseudo || "").trim();
    if (p) writeLocal(PSEUDO_KEY, p.slice(0, 40));
  }

  function getClientKey() {
    var existing = String(readLocal(CLIENT_KEY, "") || "").trim();
    if (existing && existing.length >= 16) return existing;

    var fromActivity = "";
    try {
      if (global.GoeloActivity && typeof global.GoeloActivity.getVisitorSessionId === "function") {
        fromActivity = String(global.GoeloActivity.getVisitorSessionId() || "").trim();
      } else {
        fromActivity = String(readLocal("visitor_session_id", "") || "").trim();
      }
    } catch (e) { void e; }

    var key = fromActivity;
    if (!key || key.length < 16) {
      try {
        key = (global.crypto && global.crypto.randomUUID)
          ? global.crypto.randomUUID()
          : ("g" + Date.now().toString(36) + Math.random().toString(36).slice(2));
      } catch (e2) {
        key = "g" + Date.now().toString(36) + Math.random().toString(36).slice(2);
      }
    }
    writeLocal(CLIENT_KEY, key);
    return key;
  }

  function validatePseudo(raw) {
    var p = String(raw || "").trim().replace(/\s+/g, " ");
    if (p.length < 2) return { ok: false, error: "pseudo_too_short", message: "Indique au moins 2 caractères." };
    if (p.length > 40) return { ok: false, error: "pseudo_too_long", message: "40 caractères maximum." };
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9 ''’\-_.]+$/.test(p)) {
      return { ok: false, error: "pseudo_invalid", message: "Pseudo invalide (lettres, chiffres, tirets…)." };
    }
    return { ok: true, pseudo: p };
  }

  function errorMessage(code) {
    var map = {
      pseudo_too_short: "Indique au moins 2 caractères.",
      pseudo_too_long: "40 caractères maximum.",
      pseudo_invalid: "Pseudo invalide.",
      already_registered: "Tu es déjà inscrit·e à cette sortie.",
      rate_limited: "Trop d'inscriptions pour le moment. Réessaie plus tard.",
      sortie_cancelled: "Cette sortie est annulée.",
      sortie_closed: "Les inscriptions sont fermées.",
      sortie_passed: "Cette sortie est déjà passée.",
      private_route: "Cette sortie n'est pas ouverte au public.",
      invitation_only: "Cette sortie est sur invitation.",
      route_not_found: "Sortie introuvable.",
      invalid_route: "Sortie invalide.",
      client_key_required: "Impossible d'inscrire (navigateur restreint).",
      invalid_token: "Lien d'annulation invalide.",
      not_found: "Inscription introuvable ou déjà annulée.",
      missing_client: "Connexion au serveur indisponible."
    };
    return map[code] || "Impossible d'enregistrer la participation.";
  }

  function shareUrls(ctx) {
    var title = (ctx && ctx.title) || "sortie GoëloRides";
    var url = (ctx && ctx.shareUrl) || (global.location && global.location.href) || "";
    var text = "Je participe à " + title + " avec GoëloRides 🚴 " + url;
    return {
      whatsapp: "https://wa.me/?text=" + encodeURIComponent(text),
      messenger: "https://www.facebook.com/dialog/send?link=" + encodeURIComponent(url) +
        "&app_id=966242223397117&redirect_uri=" + encodeURIComponent(url)
    };
  }

  function ensureModal() {
    if (modalEl) return modalEl;

    modalEl = global.document.createElement("div");
    modalEl.className = "go-guest-modal gr-lockmodal";
    modalEl.id = "go-guest-signup-modal";
    modalEl.hidden = true;
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-labelledby", "go-guest-signup-title");

    modalEl.innerHTML =
      '<div class="gr-lockmodal__backdrop" data-guest-close></div>' +
      '<div class="gr-lockmodal__panel go-guest-modal__panel">' +
        '<button type="button" class="gr-lockmodal__close" data-guest-close aria-label="Fermer">✕</button>' +
        '<div class="go-guest-modal__form-view" data-guest-view="form">' +
          '<h2 class="go-guest-modal__title" id="go-guest-signup-title">Je participe</h2>' +
          '<p class="go-guest-modal__route" data-guest-route></p>' +
          '<p class="go-guest-modal__hint">Sans compte, sans e-mail, sans mot de passe</p>' +
          '<form class="go-guest-modal__form" data-guest-form novalidate>' +
            '<label class="go-guest-modal__label" for="go-guest-pseudo">' +
              'Ton prénom ou pseudo <span aria-hidden="true">*</span>' +
            '</label>' +
            '<input type="text" id="go-guest-pseudo" name="pseudo" class="go-guest-modal__input" ' +
              'required maxlength="40" minlength="2" autocomplete="nickname" ' +
              'autocapitalize="words" enterkeyhint="done" ' +
              'placeholder="Ex. Léa, Marco, GoéloRider">' +
            '<input type="text" name="website" class="go-guest-modal__hp" tabindex="-1" ' +
              'autocomplete="off" aria-hidden="true">' +
            '<p class="go-guest-modal__error" data-guest-error role="alert" hidden></p>' +
            '<button type="submit" class="go-guest-modal__submit">Confirmer</button>' +
          '</form>' +
          '<p class="go-guest-modal__alt">' +
            'Déjà un compte ? ' +
            '<button type="button" class="go-guest-modal__link" data-guest-auth>Se connecter</button>' +
          '</p>' +
        '</div>' +
        '<div class="go-guest-modal__done-view" data-guest-view="done" hidden>' +
          '<p class="go-guest-modal__check" aria-hidden="true">✓</p>' +
          '<h2 class="go-guest-modal__title" data-guest-done-title>Tu es inscrit·e !</h2>' +
          '<p class="go-guest-modal__done-text" data-guest-done-text></p>' +
          '<div class="go-guest-modal__share" data-guest-share>' +
            '<a class="go-guest-modal__share-btn go-guest-modal__share-btn--wa" data-guest-wa target="_blank" rel="noopener noreferrer">Partager sur WhatsApp</a>' +
            '<a class="go-guest-modal__share-btn go-guest-modal__share-btn--msg" data-guest-msg target="_blank" rel="noopener noreferrer">Messenger</a>' +
          '</div>' +
          '<button type="button" class="go-guest-modal__cancel" data-guest-cancel>Annuler ma participation</button>' +
          '<button type="button" class="go-guest-modal__close-done" data-guest-close>Fermer</button>' +
        '</div>' +
      '</div>';

    modalEl.addEventListener("click", function (e) {
      if (e.target.closest("[data-guest-close]")) {
        e.preventDefault();
        close();
        return;
      }
      if (e.target.closest("[data-guest-auth]")) {
        e.preventDefault();
        close();
        if (typeof global.openGoeloAuth === "function") global.openGoeloAuth();
        return;
      }
      if (e.target.closest("[data-guest-cancel]")) {
        e.preventDefault();
        void cancelFromModal();
      }
    });

    var form = modalEl.querySelector("[data-guest-form]");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        void submitForm();
      });
    }

    global.document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modalEl && !modalEl.hidden) close();
    });

    global.document.body.appendChild(modalEl);
    return modalEl;
  }

  function setError(msg) {
    var el = modalEl && modalEl.querySelector("[data-guest-error]");
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  function showView(name) {
    if (!modalEl) return;
    modalEl.querySelectorAll("[data-guest-view]").forEach(function (el) {
      el.hidden = el.getAttribute("data-guest-view") !== name;
    });
  }

  function open(opts) {
    opts = opts || {};
    var routeId = String(opts.routeId || "").trim();
    if (!routeId) return;

    _ctx = {
      routeId: routeId,
      title: String(opts.title || "").trim(),
      shareUrl: String(opts.shareUrl || "").trim() || absoluteParcoursUrl(routeId)
    };

    var modal = ensureModal();
    var routeEl = modal.querySelector("[data-guest-route]");
    if (routeEl) {
      routeEl.textContent = _ctx.title
        ? _ctx.title
        : "Participer à cette sortie";
    }

    var existing = getManageToken(routeId);
    if (existing) {
      paintDone({
        waitlist: false,
        pseudo: getSavedPseudo() || "toi",
        restored: true
      });
    } else {
      showView("form");
      setError("");
      var input = modal.querySelector("#go-guest-pseudo");
      if (input) {
        input.value = getSavedPseudo();
        input.disabled = false;
      }
      var submit = modal.querySelector(".go-guest-modal__submit");
      if (submit) submit.disabled = false;
    }

    modal.hidden = false;
    global.document.documentElement.classList.add("goelo-modal-open");

    if (!existing) {
      var focusEl = modal.querySelector("#go-guest-pseudo");
      if (focusEl && focusEl.focus) {
        setTimeout(function () { focusEl.focus(); }, 30);
      }
    }
  }

  function absoluteParcoursUrl(routeId) {
    try {
      var base = global.location.origin + global.location.pathname.replace(/[^/]*$/, "");
      return base + "parcours.html?id=" + encodeURIComponent(routeId);
    } catch (e) {
      return "parcours.html?id=" + encodeURIComponent(routeId);
    }
  }

  function paintDone(info) {
    ensureModal();
    showView("done");
    var titleEl = modalEl.querySelector("[data-guest-done-title]");
    var textEl = modalEl.querySelector("[data-guest-done-text]");
    var waitlist = !!(info && info.waitlist);
    var pseudo = (info && info.pseudo) || getSavedPseudo() || "";

    if (titleEl) {
      titleEl.textContent = waitlist
        ? "Tu es en liste d'attente"
        : (info && info.restored ? "Tu es déjà inscrit·e" : "Tu es inscrit·e !");
    }
    if (textEl) {
      textEl.textContent = waitlist
        ? (pseudo ? pseudo + " — places principales complètes." : "Places principales complètes.")
        : (pseudo ? "À bientôt, " + pseudo + " !" : "À bientôt sur la route !");
    }

    var shares = shareUrls(_ctx || {});
    var wa = modalEl.querySelector("[data-guest-wa]");
    var msg = modalEl.querySelector("[data-guest-msg]");
    if (wa) wa.href = shares.whatsapp;
    if (msg) msg.href = shares.messenger;

    var cancelBtn = modalEl.querySelector("[data-guest-cancel]");
    if (cancelBtn) {
      cancelBtn.hidden = !getManageToken(_ctx && _ctx.routeId);
    }
  }

  function close() {
    if (!modalEl) return;
    modalEl.hidden = true;
    global.document.documentElement.classList.remove("goelo-modal-open");
    _busy = false;
  }

  async function selfRegister(routeId, pseudo, hp) {
    var sb = getSb();
    var SP = global.GoeloSignupParticipants;
    if (SP && SP.selfRegisterGuest) {
      return SP.selfRegisterGuest(routeId, {
        pseudo: pseudo,
        clientKey: getClientKey(),
        hp: hp || ""
      }, sb);
    }

    if (!sb) return { ok: false, error: "missing_client" };
    var rpc = await sb.rpc("guest_self_register", {
      p_route_id: String(routeId || "").trim(),
      p_pseudo: pseudo,
      p_client_key: getClientKey(),
      p_hp: hp || null
    });
    if (rpc.error) {
      return { ok: false, error: rpc.error.message || "rpc_error" };
    }
    var data = rpc.data || {};
    if (data.ok === false) return { ok: false, error: data.error || "add_failed" };
    return data;
  }

  async function selfCancel(token) {
    var sb = getSb();
    var SP = global.GoeloSignupParticipants;
    if (SP && SP.selfCancelGuest) {
      return SP.selfCancelGuest(token, sb);
    }
    if (!sb) return { ok: false, error: "missing_client" };
    var rpc = await sb.rpc("guest_self_cancel", { p_manage_token: token });
    if (rpc.error) return { ok: false, error: rpc.error.message || "rpc_error" };
    var data = rpc.data || {};
    if (data.ok === false) return { ok: false, error: data.error || "cancel_failed" };
    return data;
  }

  async function submitForm() {
    if (_busy || !_ctx) return;
    var modal = ensureModal();
    var input = modal.querySelector("#go-guest-pseudo");
    var hpEl = modal.querySelector(".go-guest-modal__hp");
    var submit = modal.querySelector(".go-guest-modal__submit");
    var check = validatePseudo(input ? input.value : "");
    if (!check.ok) {
      setError(check.message);
      if (input) input.focus();
      return;
    }

    _busy = true;
    setError("");
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Inscription…";
    }

    try {
      if (global.GoeloActivity && _ctx.routeId) {
        global.GoeloActivity.logEvent(
          null,
          global.GoeloActivity.EVENT_TYPES.RIDE_PARTICIPATE_CLICKED,
          { route_id: _ctx.routeId, route_title: _ctx.title, guest: true },
          { route_id: _ctx.routeId, route_title: _ctx.title }
        );
      }

      var result = await selfRegister(
        _ctx.routeId,
        check.pseudo,
        hpEl ? hpEl.value : ""
      );

      if (!result || result.ok === false) {
        setError(errorMessage(result && result.error));
        return;
      }

      savePseudo(check.pseudo);
      if (result.manage_token) {
        setManageToken(_ctx.routeId, result.manage_token);
      }

      paintDone({
        waitlist: !!result.waitlist,
        pseudo: check.pseudo
      });

      var confirmed = typeof result.confirmed_count === "number"
        ? result.confirmed_count
        : result.count;
      if (global.GoeloSignupParticipants && global.GoeloSignupParticipants.emitChanged) {
        global.GoeloSignupParticipants.emitChanged(_ctx.routeId, confirmed);
      }
      global.dispatchEvent(new CustomEvent("goelo:guest-signup", {
        detail: {
          routeId: _ctx.routeId,
          count: confirmed,
          confirmed_count: confirmed,
          waitlist_count: result.waitlist_count,
          waitlist: !!result.waitlist,
          participant: result.participant || null
        }
      }));
    } catch (err) {
      console.warn("[guest-signup]", err);
      setError("Erreur inattendue. Réessaie.");
    } finally {
      _busy = false;
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Confirmer";
      }
    }
  }

  async function cancelFromModal() {
    if (_busy || !_ctx) return;
    var token = getManageToken(_ctx.routeId);
    if (!token) {
      setError(errorMessage("invalid_token"));
      showView("form");
      return;
    }
    if (!global.confirm("Annuler ta participation à cette sortie ?")) return;

    _busy = true;
    try {
      var result = await selfCancel(token);
      if (!result || result.ok === false) {
        global.alert(errorMessage(result && result.error));
        return;
      }
      setManageToken(_ctx.routeId, null);
      var confirmedCancel = typeof result.confirmed_count === "number"
        ? result.confirmed_count
        : result.count;
      if (global.GoeloSignupParticipants && global.GoeloSignupParticipants.emitChanged) {
        global.GoeloSignupParticipants.emitChanged(_ctx.routeId, confirmedCancel);
      }
      global.dispatchEvent(new CustomEvent("goelo:guest-cancel", {
        detail: {
          routeId: _ctx.routeId,
          count: confirmedCancel,
          confirmed_count: confirmedCancel,
          waitlist_count: result.waitlist_count
        }
      }));
      close();
    } catch (err) {
      console.warn("[guest-signup] cancel:", err);
      global.alert("Impossible d'annuler pour le moment.");
    } finally {
      _busy = false;
    }
  }

  async function cancelForRoute(routeId) {
    var token = getManageToken(routeId);
    if (!token) return { ok: false, error: "invalid_token" };
    var result = await selfCancel(token);
    if (result && result.ok) {
      setManageToken(routeId, null);
      var confirmed = typeof result.confirmed_count === "number"
        ? result.confirmed_count
        : result.count;
      if (global.GoeloSignupParticipants && global.GoeloSignupParticipants.emitChanged) {
        global.GoeloSignupParticipants.emitChanged(routeId, confirmed);
      }
      global.dispatchEvent(new CustomEvent("goelo:guest-cancel", {
        detail: {
          routeId: String(routeId),
          count: confirmed,
          confirmed_count: confirmed,
          waitlist_count: result.waitlist_count
        }
      }));
    }
    return result;
  }

  function isRegistered(routeId) {
    return !!getManageToken(routeId);
  }

  function bindCardTriggers() {
    if (global.document.documentElement.dataset.goGuestCardsBound === "1") return;
    global.document.documentElement.dataset.goGuestCardsBound = "1";

    global.document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-guest-join]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var routeId = btn.getAttribute("data-guest-join") || btn.getAttribute("data-route-id");
      var title = btn.getAttribute("data-guest-title") || "";
      if (global.GoeloActivity && routeId) {
        global.GoeloActivity.logEvent(
          null,
          global.GoeloActivity.EVENT_TYPES.UPCOMING_RIDE_JOIN_CLICKED ||
            global.GoeloActivity.EVENT_TYPES.RIDE_PARTICIPATE_CLICKED,
          { route_id: routeId, route_title: title, guest: true, source: "card" },
          { route_id: routeId, route_title: title }
        );
      }
      open({
        routeId: routeId,
        title: title,
        shareUrl: btn.getAttribute("data-guest-url") || ""
      });
    }, true);
  }

  function init() {
    bindCardTriggers();
  }

  global.GoeloGuestSignup = {
    open: open,
    close: close,
    isRegistered: isRegistered,
    getManageToken: getManageToken,
    getSavedPseudo: getSavedPseudo,
    getClientKey: getClientKey,
    validatePseudo: validatePseudo,
    selfRegister: selfRegister,
    cancelForRoute: cancelForRoute,
    errorMessage: errorMessage
  };

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
