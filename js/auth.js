/* ═══════════════════════════════════════════════════════════════
   js/auth.js — Modales Team Rider GoëloRides
   Modale 1 : « Passez en mode Team Rider » (#modal-teamrider)
   Modale 2 : « Connexion » Supabase        (#modal-login)
   Styles   : css/components.css
   Flux     : clic « Se connecter » (hero / bannière / header)
              → Modale 1 → « Se connecter » → Modale 2
              → supabase.auth.signInWithPassword
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  if (window.__goeloAuthInit) return;
  window.__goeloAuthInit = true;

  var ACCESS_MAILTO =
    "mailto:goelo.rides@gmail.com" +
    "?subject=Demande%20acc%C3%A8s%20Team%20Rider" +
    "&body=Bonjour%2C%0A%0AJe%20souhaite%20demander%20l%27acc%C3%A8s%20Team%20Rider.%0A%0A";

  var lastFocus = null;

  /* ── Helpers modales ───────────────────────────────────────── */

  function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    lastFocus = document.activeElement;
    m.hidden = false;
    requestAnimationFrame(function () {
      m.classList.add("is-open");
      var target =
        m.querySelector("[data-autofocus]") || m.querySelector(".goelo-modal__close");
      if (target) target.focus();
    });
    document.documentElement.classList.add("goelo-modal-open");
  }

  function closeModal(id) {
    var m = document.getElementById(id);
    if (!m || m.hidden) return;
    m.classList.remove("is-open");
    setTimeout(function () {
      m.hidden = true;
      unlockScrollIfNoneOpen();
    }, 250);
  }

  function closeAllModals() {
    document.querySelectorAll(".goelo-modal.is-open").forEach(function (m) {
      m.classList.remove("is-open");
      setTimeout(function () {
        m.hidden = true;
      }, 250);
    });
    setTimeout(unlockScrollIfNoneOpen, 260);
  }

  function unlockScrollIfNoneOpen() {
    if (!document.querySelector(".goelo-modal.is-open")) {
      document.documentElement.classList.remove("goelo-modal-open");
      if (lastFocus && typeof lastFocus.focus === "function") {
        try {
          lastFocus.focus();
        } catch (e) {
          void e;
        }
        lastFocus = null;
      }
    }
  }

  /* ── Injection du markup ───────────────────────────────────── */

  function injectModals() {
    if (document.getElementById("modal-teamrider")) return;

    var html =
      /* ══ MODALE 1 : MODE TEAM RIDER ══ */
      '<div id="modal-teamrider" class="goelo-modal" hidden role="dialog" aria-modal="true" aria-labelledby="mtr-title">' +
      '  <div class="goelo-modal__backdrop" data-close-modal="modal-teamrider"></div>' +
      '  <div class="goelo-modal__box goelo-modal__box--teamrider">' +
      '    <div class="mtr-visual" aria-hidden="true">' +
      '      <img src="assets/hero-accueil.png" alt="" loading="lazy" decoding="async">' +
      '      <div class="mtr-visual__overlay"></div>' +
      '      <span class="mtr-visual__label">TEAM<br>RIDER</span>' +
      "    </div>" +
      '    <div class="mtr-content">' +
      '      <button type="button" class="goelo-modal__close" data-close-modal="modal-teamrider" aria-label="Fermer">✕</button>' +
      '      <span class="mtr-badge">Mode Team Rider</span>' +
      '      <h2 id="mtr-title" class="mtr-title">Passez en mode<br><span class="mtr-title--accent">Team Rider</span></h2>' +
      '      <p class="mtr-desc">Publier, modifier ou organiser une sortie, gérer votre club ou vos groupes… Le mode Team Rider est fait pour vous&nbsp;!</p>' +
      '      <div class="mtr-actions">' +
      '        <button type="button" class="mtr-btn mtr-btn--primary" id="mtr-go-login" data-autofocus>Se connecter</button>' +
      '        <a class="mtr-btn mtr-btn--outline" id="mtr-go-access" href="' + ACCESS_MAILTO + '">Demander l\'accès</a>' +
      "      </div>" +
      '      <p class="mtr-lock-note"><span aria-hidden="true">🔒</span> Accès réservé aux Team Riders</p>' +
      "    </div>" +
      "  </div>" +
      "</div>" +
      /* ══ MODALE 2 : CONNEXION ══ */
      '<div id="modal-login" class="goelo-modal" hidden role="dialog" aria-modal="true" aria-labelledby="ml-title">' +
      '  <div class="goelo-modal__backdrop" data-close-modal="modal-login"></div>' +
      '  <div class="goelo-modal__box goelo-modal__box--login">' +
      '    <button type="button" class="goelo-modal__close" data-close-modal="modal-login" aria-label="Fermer">✕</button>' +
      '    <span class="ml-badge"><span aria-hidden="true">🔒</span> Espace Team Rider</span>' +
      '    <h2 id="ml-title" class="ml-title">Connexion</h2>' +
      '    <p class="ml-sub">Accède aux sorties réservées et aux fonctionnalités Team Rider.</p>' +
      '    <div id="ml-error" class="ml-error" role="alert" hidden></div>' +
      '    <form id="ml-form" novalidate>' +
      '      <label class="ml-label" for="ml-email">E-mail</label>' +
      '      <input id="ml-email" class="ml-input" type="email" placeholder="ton@email.com" autocomplete="username" required data-autofocus>' +
      '      <label class="ml-label" for="ml-password">Mot de passe</label>' +
      '      <div class="ml-pw-wrap">' +
      '        <input id="ml-password" class="ml-input" type="password" placeholder="••••••••" autocomplete="current-password" required>' +
      '        <button type="button" class="ml-eye" id="ml-eye-btn" aria-label="Afficher ou masquer le mot de passe" aria-pressed="false">' +
      '          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' +
      "          </svg>" +
      "        </button>" +
      "      </div>" +
      '      <a href="#" class="ml-forgot" id="ml-forgot">Mot de passe oublié ?</a>' +
      '      <button type="submit" class="ml-btn-primary" id="ml-submit">' +
      '        <span id="ml-btn-label">→ Se connecter</span>' +
      '        <span id="ml-btn-spinner" hidden>⏳ Connexion…</span>' +
      "      </button>" +
      "    </form>" +
      '    <div class="ml-separator"><span>ou</span></div>' +
      '    <a class="ml-btn-outline" id="ml-go-access" href="' + ACCESS_MAILTO + '">Demander l\'accès Team Rider</a>' +
      '    <p class="ml-join">Pas encore de compte ? <a href="' + ACCESS_MAILTO + '" class="ml-join-link">Rejoindre l\'équipe →</a></p>' +
      "  </div>" +
      "</div>";

    document.body.insertAdjacentHTML("beforeend", html);
  }

  /* ── Événements ────────────────────────────────────────────── */

  function bindEvents() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAllModals();
    });

    document.addEventListener("click", function (e) {
      /* Fermeture (croix + backdrop) */
      var closer = e.target.closest("[data-close-modal]");
      if (closer) {
        closeModal(closer.getAttribute("data-close-modal"));
        return;
      }

      /* « Se connecter » partout (hero, bannière sticky, header) → Modale 1 */
      if (e.target.closest("[data-goelo-auth-trigger]")) {
        e.preventDefault();
        openModal("modal-teamrider");
        return;
      }

      /* Modale 1 « Se connecter » → Modale 2 */
      if (e.target.closest("#mtr-go-login")) {
        closeModal("modal-teamrider");
        setTimeout(function () {
          openModal("modal-login");
        }, 200);
        return;
      }

      /* « Demander l'accès » (liens mailto) : fermer les modales, laisser le mailto partir */
      if (e.target.closest("#mtr-go-access") || e.target.closest("#ml-go-access")) {
        closeAllModals();
        return;
      }

      /* Œil mot de passe */
      if (e.target.closest("#ml-eye-btn")) {
        var input = document.getElementById("ml-password");
        var btn = document.getElementById("ml-eye-btn");
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-pressed", show ? "true" : "false");
        return;
      }

      /* Mot de passe oublié */
      if (e.target.closest("#ml-forgot")) {
        e.preventDefault();
        sendPasswordReset();
      }
    });

    var form = document.getElementById("ml-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        submitLogin();
      });
    }
  }

  /* ── Connexion Supabase ────────────────────────────────────── */

  async function submitLogin() {
    var email = (document.getElementById("ml-email").value || "").trim();
    var password = document.getElementById("ml-password").value || "";
    var label = document.getElementById("ml-btn-label");
    var spinner = document.getElementById("ml-btn-spinner");
    var submitBtn = document.getElementById("ml-submit");

    hideError();
    if (!email || !password) {
      showError("Remplis l'e-mail et le mot de passe.");
      return;
    }

    label.hidden = true;
    spinner.hidden = false;
    submitBtn.disabled = true;

    try {
      var sb = await getSupabase();
      var res = await sb.auth.signInWithPassword({ email: email, password: password });
      if (res.error) {
        showError(getFriendlyError(res.error.message));
        return;
      }
      closeAllModals();
      try {
        window.dispatchEvent(new CustomEvent("goelo:auth-success", { detail: res.data.user }));
      } catch (e) {
        void e;
      }
      setTimeout(function () {
        window.location.reload();
      }, 200);
    } catch (err) {
      console.error(err);
      showError("Erreur inattendue. Réessaie.");
    } finally {
      label.hidden = false;
      spinner.hidden = true;
      submitBtn.disabled = false;
    }
  }

  async function sendPasswordReset() {
    var email = (document.getElementById("ml-email").value || "").trim();
    if (!email) {
      showError("Indique d'abord ton e-mail, puis reclique « Mot de passe oublié ? ».");
      return;
    }
    try {
      var sb = await getSupabase();
      var res = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (res.error) {
        showError("Envoi impossible. Vérifie l'adresse e-mail.");
        return;
      }
      showError("E-mail de réinitialisation envoyé — vérifie ta boîte mail.", true);
    } catch (err) {
      void err;
      showError("Envoi impossible pour le moment. Réessaie plus tard.");
    }
  }

  function showError(msg, isInfo) {
    var box = document.getElementById("ml-error");
    if (!box) return;
    box.textContent = msg;
    box.classList.toggle("ml-error--info", !!isInfo);
    box.hidden = false;
  }

  function hideError() {
    var box = document.getElementById("ml-error");
    if (box) box.hidden = true;
  }

  function getFriendlyError(msg) {
    msg = String(msg || "");
    if (msg.indexOf("Invalid login") !== -1) return "E-mail ou mot de passe incorrect.";
    if (msg.indexOf("Email not confirmed") !== -1) return "Confirme ton e-mail d'abord (lien reçu par mail).";
    if (msg.indexOf("Too many requests") !== -1) return "Trop de tentatives. Attends un moment.";
    return "Connexion impossible. Vérifie tes identifiants.";
  }

  /* Client Supabase : charge la lib UMD au premier besoin. */
  function getSupabase() {
    return new Promise(function (resolve, reject) {
      if (window._goeloSb) {
        resolve(window._goeloSb);
        return;
      }
      var url = window.GOELO_SUPABASE_URL;
      var key = window.GOELO_SUPABASE_ANON_KEY;
      if (!url || !key) {
        reject(new Error("Supabase non configuré (GOELO_SUPABASE_URL / ANON_KEY)."));
        return;
      }
      if (window.supabase && window.supabase.createClient) {
        window._goeloSb = window.supabase.createClient(url, key);
        resolve(window._goeloSb);
        return;
      }
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      s.onload = function () {
        window._goeloSb = window.supabase.createClient(url, key);
        resolve(window._goeloSb);
      };
      s.onerror = function () {
        reject(new Error("Impossible de charger la librairie Supabase."));
      };
      document.head.appendChild(s);
    });
  }

  /* ── Init ──────────────────────────────────────────────────── */

  function init() {
    injectModals();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* API publique (compatibilité ancien code) */
  window.openGoeloAuth = function () {
    openModal("modal-teamrider");
  };
  window.closeGoeloAuth = closeAllModals;
})();
