/* ── Guard double-init ──────────────────────────────────────── */
if (window.__GOELO_AUTH_V2__) {
  throw new Error("[GoëloAuth] déjà chargé — vérifier que auth.js n'est inclus qu'une fois");
}
window.__GOELO_AUTH_V2__ = true;

(function () {
  "use strict";

  /* ════════════════════════════════════════════════════════════
     1. SINGLETON SUPABASE
     ════════════════════════════════════════════════════════════ */
window.goeloGetSb = function () {
  if (window._goeloSbClient) return window._goeloSbClient;

  var cfg = window.GOELO_CONFIG || {};
  var url = (cfg.SUPABASE_URL || "").trim();
  var key = (cfg.SUPABASE_ANON_KEY || "").trim();

  if (!url || !key) {
    console.error("[GoëloAuth] ❌ Config Supabase manquante", cfg);
    return null;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error("[GoëloAuth] ❌ SDK Supabase non chargé");
    return null;
  }

  try {
    window._goeloSbClient = window.supabase.createClient(url, key);
    console.log("[GoëloAuth] Supabase client initialisé ✔");
    return window._goeloSbClient;
  } catch (e) {
    console.error("[GoëloAuth] ❌ Erreur createClient :", e);
    return null;
  }
};

  /* ════════════════════════════════════════════════════════════
     2. ÉTAT GLOBAL DU RÔLE
     ════════════════════════════════════════════════════════════ */
  window.GOELO_ROLE = "visitor";
  window.GOELO_USER = null;
  window.GOELO_DISPLAY_NAME = null;
  window.GOELO_AUTH_PENDING = true;

  var ROLE_ORDER = { visitor: 0, user: 1, team_rider: 2, admin: 3 };

  window.goeloGuard = function (required) {
    return (ROLE_ORDER[window.GOELO_ROLE] || 0) >= (ROLE_ORDER[required] || 0);
  };

  /* ════════════════════════════════════════════════════════════
     3. RÉSOLUTION DU RÔLE
     ════════════════════════════════════════════════════════════ */
  async function resolveRole() {
    var sb = window.goeloGetSb();
    if (!sb) { _emitRole("visitor", null); return; }
    try {
      var sessionResult = await sb.auth.getSession();
      var session = sessionResult.data && sessionResult.data.session;
      if (!session) { _emitRole("visitor", null); return; }

      var userResult = await sb.auth.getUser();
      if (userResult.error || !userResult.data || !userResult.data.user) {
        _emitRole("visitor", null);
        return;
      }
      var user = userResult.data.user;

      var profileResult = await sb
        .from("profiles")
        .select("role, display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileResult.error) {
        console.warn("[GoëloAuth] profiles:", profileResult.error.message);
        _emitRole("user", user, null);
        return;
      }

      var role = (profileResult.data && profileResult.data.role)
        ? profileResult.data.role
        : "user";

      var displayName = profileResult.data && profileResult.data.display_name
        ? String(profileResult.data.display_name).trim()
        : "";

      _emitRole(role, user, displayName || null);
    } catch (err) {
      console.warn("[GoëloAuth] resolveRole:", err.message);
      _emitRole("visitor", null);
    }
  }

  /* ════════════════════════════════════════════════════════════
     4. ÉMISSION DU RÔLE — UNE SEULE DÉCLARATION
     ════════════════════════════════════════════════════════════ */
  function _emitRole(role, user, displayName) {
    var cleanRole = role || "visitor";
    window.GOELO_ROLE = cleanRole;
    window.GOELO_USER = user;
    window.GOELO_DISPLAY_NAME = displayName && String(displayName).trim()
      ? String(displayName).trim()
      : null;
    window.GOELO_AUTH_PENDING = false;
    console.log("[GoëloAuth] rôle résolu :", cleanRole);
    window.dispatchEvent(new CustomEvent("goelo:role-ready", {
      detail: {
        role: cleanRole,
        user: user,
        display_name: window.GOELO_DISPLAY_NAME
      }
    }));
  }

  /* ════════════════════════════════════════════════════════════
     5. REDIRECTION SELON RÔLE
     ════════════════════════════════════════════════════════════ */
  function _redirectForRole(role) {
    /* Pas de redirection forcée : l'UI s'adapte sur la page courante (goelo-ui.js). */
    void role;
  }

  /* ════════════════════════════════════════════════════════════
     6. AUTH STATE LISTENER (une seule souscription)
     ════════════════════════════════════════════════════════════ */
  var _authListenerBound = false;
  var _lastResolvedRole  = null;  /* guard anti-doublon */

  function _bindAuthStateChange() {
    if (_authListenerBound) return;
    _authListenerBound = true;
    var sb = window.goeloGetSb();
    if (!sb) return;
    sb.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        /* Éviter une double résolution si resolveRole() vient d'être appelé */
        resolveRole();
      } else if (event === "SIGNED_OUT") {
        _lastResolvedRole = null;
        _emitRole("visitor", null);
      } else if (event === "PASSWORD_RECOVERY") {
        window.dispatchEvent(new CustomEvent("goelo:password-recovery", {
          detail: { session: session }
        }));
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     7. LOGIN
     ════════════════════════════════════════════════════════════ */
  async function _submitLogin() {
    var emailEl   = document.getElementById("ml-email");
    var pwEl      = document.getElementById("ml-password");
    var label     = document.getElementById("ml-btn-label");
    var spinner   = document.getElementById("ml-btn-spinner");
    var submitBtn = document.getElementById("ml-submit");
    if (!emailEl || !pwEl) return;

    var email    = emailEl.value.trim().toLowerCase();
    var password = pwEl.value;
    _hideError();

    if (!email || !password) {
      _showError("Remplis l'e-mail et le mot de passe.");
      return;
    }
    if (label)     label.hidden     = true;
    if (spinner)   spinner.hidden   = false;
    if (submitBtn) submitBtn.disabled = true;

    try {
      var sb = window.goeloGetSb();
      if (!sb) { _showError("Service temporairement indisponible."); return; }

      var loginResult = await sb.auth.signInWithPassword({ email: email, password: password });
      if (loginResult.error) {
        _showError(_friendlyLoginError(loginResult.error.message));
        return;
      }

      await resolveRole();
      _closeAllModals();

      window.dispatchEvent(new CustomEvent("goelo:auth-success", {
        detail: { user: loginResult.data.user, role: window.GOELO_ROLE }
      }));

      _redirectForRole(window.GOELO_ROLE);
    } catch (err) {
      console.error("[GoëloAuth] login:", err);
      _showError("Erreur inattendue. Réessaie.");
    } finally {
      if (label)     label.hidden     = false;
      if (spinner)   spinner.hidden   = true;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function _friendlyLoginError(msg) {
    msg = String(msg || "").toLowerCase();
    if (msg.includes("invalid login") || msg.includes("invalid_grant") || msg.includes("invalid credentials"))
      return "E-mail ou mot de passe incorrect.";
    if (msg.includes("email not confirmed"))
      return "Confirme ton e-mail d'abord (lien reçu par mail).";
    if (msg.includes("too many requests") || msg.includes("rate limit"))
      return "Trop de tentatives. Attends quelques minutes.";
    if (msg.includes("user not found"))
      return "Aucun compte trouvé pour cet e-mail.";
    return "Connexion impossible. Vérifie tes identifiants.";
  }

  /* ════════════════════════════════════════════════════════════
     8. SIGNUP
     ════════════════════════════════════════════════════════════ */
  async function _submitSignup() {
    var emailEl   = document.getElementById("su-email");
    var pwEl      = document.getElementById("su-password");
    var displayNameEl = document.getElementById("su-display-name");
    var submitBtn = document.getElementById("su-submit");
    var label     = document.getElementById("su-btn-label");
    var spinner   = document.getElementById("su-btn-spinner");
    if (!emailEl || !pwEl) return;

    var email       = emailEl.value.trim().toLowerCase();
    var password    = pwEl.value;
    var displayName = displayNameEl ? displayNameEl.value.trim() : "";
    _hideSignupError();

    if (!email || !password) {
      _showSignupError("Remplis l'e-mail et le mot de passe.");
      return;
    }
    if (password.length < 8) {
      _showSignupError("Mot de passe trop court (8 caractères minimum).");
      return;
    }
    if (label)     label.hidden     = true;
    if (spinner)   spinner.hidden   = false;
    if (submitBtn) submitBtn.disabled = true;

    try {
      var sb = window.goeloGetSb();
      if (!sb) { _showSignupError("Service temporairement indisponible."); return; }

      var signupResult = await sb.auth.signUp({
        email: email,
        password: password,
        options: displayName ? { data: { display_name: displayName } } : undefined
      });
      if (signupResult.error) {
        _showSignupError(_friendlySignupError(signupResult.error.message));
        return;
      }

      if (signupResult.data && signupResult.data.user) {
        var profileRow = {
          id: signupResult.data.user.id,
          role: "user"
        };
        if (displayName) profileRow.display_name = displayName;
        var profileResult = await sb
          .from("profiles")
          .upsert(profileRow, { onConflict: "id" });
        if (profileResult.error) {
          console.warn("[GoëloAuth] profile upsert:", profileResult.error.message);
        }
      }

      if (signupResult.data.user && !signupResult.data.session) {
        _showSignupSuccess("Compte créé — vérifie ta boîte mail pour confirmer ton e-mail.");
        return;
      }

      await resolveRole();
      _closeAllModals();
      window.dispatchEvent(new CustomEvent("goelo:auth-success", {
        detail: { user: signupResult.data.user, role: window.GOELO_ROLE }
      }));
      _redirectForRole(window.GOELO_ROLE);
    } catch (err) {
      console.error("[GoëloAuth] signup:", err);
      _showSignupError("Erreur inattendue. Réessaie.");
    } finally {
      if (label)     label.hidden     = false;
      if (spinner)   spinner.hidden   = true;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function _friendlySignupError(msg) {
    msg = String(msg || "").toLowerCase();
    if (msg.includes("already registered") || msg.includes("user already exists"))
      return "Un compte existe déjà avec cet e-mail. Connecte-toi.";
    if (msg.includes("password should be"))
      return "Mot de passe trop court (8 caractères minimum).";
    if (msg.includes("invalid email"))
      return "Adresse e-mail invalide.";
    return "Inscription impossible. Réessaie.";
  }

  /* ════════════════════════════════════════════════════════════
     9. RESET PASSWORD
     ════════════════════════════════════════════════════════════ */
  async function _sendPasswordReset(email) {
    var sb = window.goeloGetSb();
    if (!sb) { _showError("Service temporairement indisponible."); return; }
    var redirectTo = window.location.origin + "/index.html";
    var resetResult = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: redirectTo
    });
    if (resetResult.error) {
      _showError("Envoi impossible. Vérifie l'adresse e-mail.");
      return;
    }
    _showError(
      "E-mail envoyé — vérifie ta boîte (et le dossier spam). Le lien est valide 1 heure.",
      true
    );
  }

  /* ════════════════════════════════════════════════════════════
     10. MODALES
     ════════════════════════════════════════════════════════════ */
  var _lastFocus = null;

  function _openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    _lastFocus = document.activeElement;
    m.hidden = false;
    requestAnimationFrame(function () {
      m.classList.add("is-open");
      var target = m.querySelector("[data-autofocus]") || m.querySelector(".goelo-modal__close");
      if (target) target.focus();
    });
    document.documentElement.classList.add("goelo-modal-open");
  }

  function _closeModal(id) {
    var m = document.getElementById(id);
    if (!m || m.hidden) return;
    m.classList.remove("is-open");
    setTimeout(function () { m.hidden = true; _unlockScroll(); }, 250);
  }

  function _closeAllModals() {
    document.querySelectorAll(".goelo-modal.is-open").forEach(function (m) {
      m.classList.remove("is-open");
      setTimeout(function () { m.hidden = true; }, 250);
    });
    setTimeout(_unlockScroll, 260);
  }

  function _unlockScroll() {
    if (!document.querySelector(".goelo-modal.is-open")) {
      document.documentElement.classList.remove("goelo-modal-open");
      if (_lastFocus && typeof _lastFocus.focus === "function") {
        try { _lastFocus.focus(); } catch (e) { void e; }
        _lastFocus = null;
      }
    }
  }

  function _showError(msg, isInfo) {
    var box = document.getElementById("ml-error");
    if (!box) return;
    box.textContent = msg;
    box.classList.toggle("ml-error--info", !!isInfo);
    box.hidden = false;
  }
  function _hideError() {
    var box = document.getElementById("ml-error");
    if (box) box.hidden = true;
  }
  function _showSignupError(msg) {
    var box = document.getElementById("su-error");
    if (box) { box.textContent = msg; box.hidden = false; }
  }
  function _hideSignupError() {
    var box = document.getElementById("su-error");
    if (box) box.hidden = true;
  }
  function _showSignupSuccess(msg) {
    var box = document.getElementById("su-success");
    if (box) { box.textContent = msg; box.hidden = false; }
    var form = document.getElementById("su-form");
    if (form) form.hidden = true;
  }

  /* Injection HTML ──────────────────────────────────────────── */
  function _injectModals() {
    if (document.getElementById("modal-teamrider")) return;
    var html =
      '<div id="modal-teamrider" class="goelo-modal" hidden role="dialog" aria-modal="true" aria-labelledby="mtr-title">' +
        '<div class="goelo-modal__backdrop" data-close-modal="modal-teamrider"></div>' +
        '<div class="goelo-modal__box goelo-modal__box--teamrider">' +
          '<div class="mtr-visual" aria-hidden="true">' +
            '<img src="assets/hero-accueil.png" alt="" loading="lazy" decoding="async">' +
            '<div class="mtr-visual__overlay"></div>' +
            '<span class="mtr-visual__label">TEAM<br>RIDER</span>' +
          '</div>' +
          '<div class="mtr-content">' +
            '<button type="button" class="goelo-modal__close" data-close-modal="modal-teamrider" aria-label="Fermer">\u2715</button>' +
            '<span class="mtr-badge">Mode Team Rider</span>' +
            '<h2 id="mtr-title" class="mtr-title">Passez en mode<br><span class="mtr-title--accent">Team Rider</span></h2>' +
            '<p class="mtr-desc">Publier, modifier ou organiser une sortie\u2026 Le mode Team Rider est fait pour vous\u00a0!</p>' +
            '<div class="mtr-actions">' +
              '<button type="button" class="mtr-btn mtr-btn--primary" id="mtr-go-login" data-autofocus>Se connecter</button>' +
              '<a class="mtr-btn mtr-btn--outline" id="mtr-go-access" href="gestion-team-rider.html">Demander l\'acc\u00e8s</a>' +
            '</div>' +
            '<p class="mtr-lock-note"><span aria-hidden="true">\uD83D\uDD12</span> Acc\u00e8s r\u00e9serv\u00e9 aux Team Riders</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="modal-login" class="goelo-modal" hidden role="dialog" aria-modal="true" aria-labelledby="ml-title">' +
        '<div class="goelo-modal__backdrop" data-close-modal="modal-login"></div>' +
        '<div class="goelo-modal__box goelo-modal__box--login">' +
          '<button type="button" class="goelo-modal__close" data-close-modal="modal-login" aria-label="Fermer">\u2715</button>' +
          '<span class="ml-badge"><span aria-hidden="true">\uD83D\uDD12</span> Espace Team Rider</span>' +
          '<h2 id="ml-title" class="ml-title">Connexion</h2>' +
          '<p class="ml-sub">Acc\u00e8de aux sorties r\u00e9serv\u00e9es et aux fonctionnalit\u00e9s Team Rider.</p>' +
          '<div id="ml-error" class="ml-error" role="alert" hidden></div>' +
          '<form id="ml-form" novalidate>' +
            '<label class="ml-label" for="ml-email">E-mail</label>' +
            '<input id="ml-email" class="ml-input" type="email" placeholder="ton@email.com" autocomplete="username" required data-autofocus>' +
            '<label class="ml-label" for="ml-password">Mot de passe</label>' +
            '<div class="ml-pw-wrap">' +
              '<input id="ml-password" class="ml-input" type="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="current-password" required>' +
              '<button type="button" class="ml-eye" id="ml-eye-btn" aria-label="Afficher le mot de passe" aria-pressed="false">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' +
                '</svg>' +
              '</button>' +
            '</div>' +
            '<a href="#" class="ml-forgot" id="ml-forgot">Mot de passe oubli\u00e9\u00a0?</a>' +
            '<button type="submit" class="ml-btn-primary" id="ml-submit">' +
              '<span id="ml-btn-label">\u2192 Se connecter</span>' +
              '<span id="ml-btn-spinner" hidden>\u23f3 Connexion\u2026</span>' +
            '</button>' +
          '</form>' +
          '<div class="ml-separator"><span>ou</span></div>' +
          '<button type="button" class="ml-btn-outline" id="ml-go-signup">Cr\u00e9er un compte</button>' +
          '<a class="ml-btn-outline" id="ml-go-access" href="gestion-team-rider.html">Demander l\'acc\u00e8s Team Rider</a>' +
        '</div>' +
      '</div>' +
      '<div id="modal-signup" class="goelo-modal" hidden role="dialog" aria-modal="true" aria-labelledby="su-title">' +
        '<div class="goelo-modal__backdrop" data-close-modal="modal-signup"></div>' +
        '<div class="goelo-modal__box goelo-modal__box--login">' +
          '<button type="button" class="goelo-modal__close" data-close-modal="modal-signup" aria-label="Fermer">\u2715</button>' +
          '<h2 id="su-title" class="ml-title">Cr\u00e9er un compte</h2>' +
          '<div id="su-error" class="ml-error" role="alert" hidden></div>' +
          '<div id="su-success" class="ml-error ml-error--info" role="status" hidden></div>' +
          '<form id="su-form" novalidate>' +
            '<label class="ml-label" for="su-display-name">Nom affiché (optionnel)</label>' +
            '<input id="su-display-name" class="ml-input" type="text" placeholder="Ton pr\u00e9nom ou surnom" autocomplete="nickname">' +
            '<label class="ml-label" for="su-email">E-mail</label>' +
            '<input id="su-email" class="ml-input" type="email" placeholder="ton@email.com" autocomplete="email" required data-autofocus>' +
            '<label class="ml-label" for="su-password">Mot de passe</label>' +
            '<input id="su-password" class="ml-input" type="password" placeholder="8 caract\u00e8res minimum" autocomplete="new-password" required>' +
            '<button type="submit" class="ml-btn-primary" id="su-submit">' +
              '<span id="su-btn-label">Cr\u00e9er mon compte</span>' +
              '<span id="su-btn-spinner" hidden>\u23f3 Inscription\u2026</span>' +
            '</button>' +
          '</form>' +
          '<div class="ml-separator"><span>ou</span></div>' +
          '<button type="button" class="ml-btn-outline" id="su-go-login">J\'ai d\u00e9j\u00e0 un compte</button>' +
        '</div>' +
      '</div>';
    document.body.insertAdjacentHTML("beforeend", html);
  }

  /* Bindings événements ─────────────────────────────────────── */
  function _bindEvents() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") _closeAllModals();
    });
    document.addEventListener("click", function (e) {
      var closer = e.target.closest("[data-close-modal]");
      if (closer) { _closeModal(closer.getAttribute("data-close-modal")); return; }
      if (e.target.closest("[data-goelo-auth-trigger]")) {
        e.preventDefault();
        if (window.GoeloUI) window.GoeloUI.syncRoleUI();
        _openModal("modal-teamrider");
        return;
      }
      if (e.target.closest("#mtr-go-login")) {
        _closeModal("modal-teamrider");
        setTimeout(function () { _openModal("modal-login"); }, 200);
        return;
      }
      if (e.target.closest("#ml-go-signup")) {
        _closeModal("modal-login");
        setTimeout(function () { _openModal("modal-signup"); }, 200);
        return;
      }
      if (e.target.closest("#su-go-login")) {
        _closeModal("modal-signup");
        setTimeout(function () { _openModal("modal-login"); }, 200);
        return;
      }
      if (e.target.closest("#mtr-go-access") || e.target.closest("#ml-go-access")) {
        _closeAllModals();
        return;
      }
      if (e.target.closest("#ml-eye-btn")) {
        var inp  = document.getElementById("ml-password");
        var btn  = document.getElementById("ml-eye-btn");
        var show = inp.type === "password";
        inp.type = show ? "text" : "password";
        btn.setAttribute("aria-pressed", show ? "true" : "false");
        return;
      }
      if (e.target.closest("#ml-forgot")) {
        e.preventDefault();
        var emailVal = (document.getElementById("ml-email") || {}).value || "";
        if (!emailVal.trim()) {
          _showError("Indique d'abord ton e-mail, puis clique « Mot de passe oublié ? ».");
          return;
        }
        _sendPasswordReset(emailVal);
      }
    });
    document.addEventListener("submit", function (e) {
      if (!e.target) return;
      if (e.target.id === "ml-form") { e.preventDefault(); _submitLogin();  }
      if (e.target.id === "su-form") { e.preventDefault(); _submitSignup(); }
    });
  }

  /* ════════════════════════════════════════════════════════════
     11. API PUBLIQUE
     ════════════════════════════════════════════════════════════ */
  window.openGoeloAuth  = function () { _openModal("modal-teamrider"); };
  window.closeGoeloAuth = _closeAllModals;
  window.goeloSignOut   = async function () {
    var sb = window.goeloGetSb();
    if (sb) await sb.auth.signOut();
    _emitRole("visitor", null);
  };

  /* ════════════════════════════════════════════════════════════
     12. INIT
     ════════════════════════════════════════════════════════════ */
  function _init() {
    _injectModals();
    _bindEvents();
    _bindAuthStateChange();
    resolveRole();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})();
