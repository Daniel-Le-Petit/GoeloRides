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
    window._goeloSbClient = window.supabase.createClient(url, key, {
      auth: { detectSessionInUrl: true }
    });
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
  var _resolveRolePromise = null;

  function _isTruthyMetaFlag(value) {
    return value === true || value === "true" || value === "t" || value === "1" || value === 1;
  }

  function _roleFromUserAndProfile(user, profile) {
    if (window.GoeloAuthState && window.GoeloAuthState.resolveRoleFromUserAndProfile) {
      return window.GoeloAuthState.resolveRoleFromUserAndProfile(user, profile);
    }
    if (!user) return "visitor";
    var pr = profile && profile.role ? String(profile.role).trim() : "";
    if (pr === "admin" || pr === "team_rider" || pr === "user") return pr;
    var meta = user.app_metadata || {};
    if (_isTruthyMetaFlag(meta.goelo_super_admin)) return "admin";
    if (_isTruthyMetaFlag(meta.goelo_admin)) return "team_rider";
    return "user";
  }

  async function resolveRole() {
    if (_recoveryInProgress || _isRecoveryUrl()) return;
    if (_resolveRolePromise) return _resolveRolePromise;

    _resolveRolePromise = (async function () {
      var sb = window.goeloGetSb();
      if (!sb) {
        _emitRole("visitor", null);
        return;
      }

      try {
        var sessionResult = await sb.auth.getSession();
        var session = sessionResult.data && sessionResult.data.session;
        if (!session || !session.user) {
          _emitRole("visitor", null);
          return;
        }

        var user = session.user;
        try {
          var userResult = await sb.auth.getUser();
          if (userResult.data && userResult.data.user) user = userResult.data.user;
        } catch (refreshErr) {
          console.warn("[GoëloAuth] getUser:", refreshErr.message || refreshErr);
        }

        var profileResult = await sb
          .from("profiles")
          .select("role, pseudo")
          .eq("id", user.id)
          .maybeSingle();

        if (profileResult.error) {
          console.warn("[GoëloAuth] profiles:", profileResult.error.message);
        }

        var resolvedRole = _roleFromUserAndProfile(user, profileResult.data || null);
        _emitRole(
          resolvedRole,
          user,
          _pseudoFromUser(user, profileResult.error ? null : profileResult.data)
        );
      } catch (err) {
        console.warn("[GoëloAuth] resolveRole:", err.message || err);
        if (window.GOELO_USER) return;
        _emitRole("visitor", null);
      }
    })();

    try {
      await _resolveRolePromise;
    } finally {
      _resolveRolePromise = null;
    }
  }

  /* ════════════════════════════════════════════════════════════
     4. ÉMISSION DU RÔLE — UNE SEULE DÉCLARATION
     ════════════════════════════════════════════════════════════ */
  function _pseudoFromUser(user, profile) {
    if (profile && profile.pseudo && String(profile.pseudo).trim()) {
      return String(profile.pseudo).trim();
    }
    if (!user) return null;
    var um = user.user_metadata || {};
    if (um.pseudo && String(um.pseudo).trim()) return String(um.pseudo).trim();
    if (um.name && String(um.name).trim()) return String(um.name).trim();
    return null;
  }

  function _emitRole(role, user, pseudo) {
    var cleanRole = user ? (role || "user") : "visitor";
    if (cleanRole !== "admin" && cleanRole !== "team_rider" && cleanRole !== "user") {
      cleanRole = user ? "user" : "visitor";
    }
    var cleanPseudo = pseudo && String(pseudo).trim() ? String(pseudo).trim() : null;

    if (window.GoeloAuthState) {
      window.GoeloAuthState.setState({
        pending: false,
        role: cleanRole,
        user: user || null,
        pseudo: cleanPseudo
      });
    } else {
      window.GOELO_ROLE = cleanRole;
      window.GOELO_USER = user || null;
      window.GOELO_DISPLAY_NAME = cleanPseudo;
      window.GOELO_AUTH_PENDING = false;
    }

    console.log("[GoëloAuth] rôle résolu :", cleanRole);
    window.dispatchEvent(new CustomEvent("goelo:role-ready", {
      detail: {
        role: cleanRole,
        user: user || null,
        pseudo: cleanPseudo
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
  var _recoveryInProgress = false;

  function _isRecoveryUrl() {
    var h = String(window.location.hash || "");
    return h.indexOf("type=recovery") !== -1;
  }

  function _clearRecoveryHash() {
    if (!window.history.replaceState) return;
    var path = window.location.pathname + window.location.search;
    if (window.location.hash) {
      window.history.replaceState(null, "", path);
    }
  }

  function _bindAuthStateChange() {
    if (_authListenerBound) return;
    _authListenerBound = true;
    var sb = window.goeloGetSb();
    if (!sb) return;
    sb.auth.onAuthStateChange(function (event, session) {
      if (event === "PASSWORD_RECOVERY") {
        _recoveryInProgress = true;
        window.dispatchEvent(new CustomEvent("goelo:password-recovery", {
          detail: { session: session }
        }));
        return;
      }
      if (_recoveryInProgress && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        return;
      }
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED"
      ) {
        resolveRole();
      } else if (event === "SIGNED_OUT") {
        _lastResolvedRole = null;
        _recoveryInProgress = false;
        _emitRole("visitor", null);
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
        detail: {
          user: loginResult.data.user,
          role: window.GOELO_ROLE,
          pseudo: window.GOELO_DISPLAY_NAME
        }
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
    var pseudoEl  = document.getElementById("su-pseudo");
    var submitBtn = document.getElementById("su-submit");
    var label     = document.getElementById("su-btn-label");
    var spinner   = document.getElementById("su-btn-spinner");
    if (!emailEl || !pwEl) return;

    var email    = emailEl.value.trim().toLowerCase();
    var password = pwEl.value;
    var pseudo   = pseudoEl ? pseudoEl.value.trim() : "";
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
        options: pseudo ? { data: { pseudo: pseudo } } : undefined
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
        if (pseudo) profileRow.pseudo = pseudo;
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

  function _showResetPasswordModal(session) {
    _recoveryInProgress = true;
    document.querySelectorAll(".goelo-modal.is-open").forEach(function (m) {
      if (m.id === "modal-reset-password") return;
      m.classList.remove("is-open");
      m.hidden = true;
    });

    _hideResetError();
    _hideResetSuccess();
    var form = document.getElementById("rp-form");
    if (form) {
      form.hidden = false;
      form.reset();
    }
    var pwEl = document.getElementById("rp-password");
    var pw2El = document.getElementById("rp-password-confirm");
    if (pwEl) pwEl.value = "";
    if (pw2El) pw2El.value = "";

    var emailHint = document.getElementById("rp-email-hint");
    if (emailHint) {
      var email = session && session.user && session.user.email
        ? String(session.user.email)
        : "";
      emailHint.textContent = email
        ? "Compte : " + email
        : "Choisis un nouveau mot de passe sécurisé.";
    }

    _openModal("modal-reset-password");
  }

  async function _submitPasswordReset() {
    var pwEl    = document.getElementById("rp-password");
    var pw2El   = document.getElementById("rp-password-confirm");
    var form    = document.getElementById("rp-form");
    var label   = document.getElementById("rp-btn-label");
    var spinner = document.getElementById("rp-btn-spinner");
    var submit  = document.getElementById("rp-submit");
    if (!pwEl || !pw2El) return;

    var password = pwEl.value;
    var confirm  = pw2El.value;
    _hideResetError();
    _hideResetSuccess();

    if (!password || !confirm) {
      _showResetError("Remplis les deux champs mot de passe.");
      return;
    }
    if (password.length < 8) {
      _showResetError("Mot de passe trop court (8 caractères minimum).");
      return;
    }
    if (password !== confirm) {
      _showResetError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (label)   label.hidden   = true;
    if (spinner) spinner.hidden = false;
    if (submit)  submit.disabled = true;

    try {
      var sb = window.goeloGetSb();
      if (!sb) {
        _showResetError("Service temporairement indisponible.");
        return;
      }

      var updateResult = await sb.auth.updateUser({ password: password });
      if (updateResult.error) {
        _showResetError(_friendlyResetError(updateResult.error.message));
        return;
      }

      _recoveryInProgress = false;
      _clearRecoveryHash();

      if (form) form.hidden = true;
      _showResetSuccess("Mot de passe mis à jour. Tu peux continuer sur le site.");

      await resolveRole();

      setTimeout(function () {
        _closeModal("modal-reset-password");
      }, 2200);
    } catch (err) {
      console.error("[GoëloAuth] password reset:", err);
      _showResetError("Erreur inattendue. Réessaie.");
    } finally {
      if (label)   label.hidden   = false;
      if (spinner) spinner.hidden = true;
      if (submit)  submit.disabled = false;
    }
  }

  function _friendlyResetError(msg) {
    msg = String(msg || "").toLowerCase();
    if (msg.includes("same password"))
      return "Le nouveau mot de passe doit être différent de l'ancien.";
    if (msg.includes("weak") || msg.includes("password should be"))
      return "Mot de passe trop faible (8 caractères minimum).";
    if (msg.includes("session") || msg.includes("jwt") || msg.includes("expired"))
      return "Lien expiré ou invalide. Redemande un e-mail de réinitialisation.";
    return "Impossible de mettre à jour le mot de passe. Réessaie.";
  }

  async function _cancelPasswordRecovery() {
    _recoveryInProgress = false;
    _clearRecoveryHash();
    var sb = window.goeloGetSb();
    if (sb) {
      try { await sb.auth.signOut(); } catch (e) { void e; }
    }
    _emitRole("visitor", null);
  }

  function _showResetError(msg) {
    var box = document.getElementById("rp-error");
    if (box) {
      box.textContent = msg;
      box.classList.remove("ml-error--info");
      box.hidden = false;
    }
  }
  function _hideResetError() {
    var box = document.getElementById("rp-error");
    if (box) box.hidden = true;
  }
  function _showResetSuccess(msg) {
    var box = document.getElementById("rp-success");
    if (box) {
      box.textContent = msg;
      box.hidden = false;
    }
  }
  function _hideResetSuccess() {
    var box = document.getElementById("rp-success");
    if (box) box.hidden = true;
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
            '<label class="ml-label" for="su-pseudo">Pseudo (optionnel)</label>' +
            '<input id="su-pseudo" class="ml-input" type="text" placeholder="Ton pr\u00e9nom ou pseudo" autocomplete="nickname">' +
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
      '</div>' +
      '<div id="modal-reset-password" class="goelo-modal" hidden role="dialog" aria-modal="true" aria-labelledby="rp-title">' +
        '<div class="goelo-modal__backdrop" aria-hidden="true"></div>' +
        '<div class="goelo-modal__box goelo-modal__box--login">' +
          '<button type="button" class="goelo-modal__close" data-close-modal="modal-reset-password" aria-label="Fermer">\u2715</button>' +
          '<span class="ml-badge"><span aria-hidden="true">\uD83D\uDD11</span> R\u00e9initialisation</span>' +
          '<h2 id="rp-title" class="ml-title">Nouveau mot de passe</h2>' +
          '<p class="ml-sub" id="rp-email-hint">Choisis un nouveau mot de passe s\u00e9curis\u00e9.</p>' +
          '<div id="rp-error" class="ml-error" role="alert" hidden></div>' +
          '<div id="rp-success" class="ml-error ml-error--info" role="status" hidden></div>' +
          '<form id="rp-form" novalidate>' +
            '<label class="ml-label" for="rp-password">Nouveau mot de passe</label>' +
            '<input id="rp-password" class="ml-input" type="password" placeholder="8 caract\u00e8res minimum" autocomplete="new-password" required data-autofocus>' +
            '<label class="ml-label" for="rp-password-confirm">Confirmation</label>' +
            '<input id="rp-password-confirm" class="ml-input" type="password" placeholder="Confirme le mot de passe" autocomplete="new-password" required>' +
            '<button type="submit" class="ml-btn-primary" id="rp-submit">' +
              '<span id="rp-btn-label">Enregistrer le mot de passe</span>' +
              '<span id="rp-btn-spinner" hidden>\u23f3 Mise \u00e0 jour\u2026</span>' +
            '</button>' +
          '</form>' +
        '</div>' +
      '</div>';
    document.body.insertAdjacentHTML("beforeend", html);
  }

  /* Bindings événements ─────────────────────────────────────── */
  function _bindEvents() {
    window.addEventListener("goelo:password-recovery", function (e) {
      _showResetPasswordModal(e.detail && e.detail.session);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (_recoveryInProgress) {
        var resetOpen = document.getElementById("modal-reset-password");
        if (resetOpen && resetOpen.classList.contains("is-open")) {
          _cancelPasswordRecovery();
          _closeModal("modal-reset-password");
          return;
        }
      }
      _closeAllModals();
    });
    document.addEventListener("click", function (e) {
      var closer = e.target.closest("[data-close-modal]");
      if (closer) {
        var modalId = closer.getAttribute("data-close-modal");
        if (modalId === "modal-reset-password" && _recoveryInProgress) {
          _cancelPasswordRecovery();
        }
        _closeModal(modalId);
        return;
      }
      if (e.target.closest("[data-goelo-auth-trigger]")) {
        e.preventDefault();
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
      if (e.target.closest("#ml-go-access")) {
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
      if (e.target.id === "rp-form") { e.preventDefault(); _submitPasswordReset(); }
    });
  }

  /* ════════════════════════════════════════════════════════════
     11. API PUBLIQUE
     ════════════════════════════════════════════════════════════ */
  window.openGoeloAuth  = function () {
    if (_recoveryInProgress) return;
    _openModal("modal-teamrider");
  };
  window.closeGoeloAuth = _closeAllModals;
  window.showResetPasswordModal = _showResetPasswordModal;
  function _clearAccessibleCookies() {
    var cookies = document.cookie ? document.cookie.split(";") : [];
    var host = window.location.hostname;
    var baseDomain = host.indexOf(".") !== -1
      ? "." + host.split(".").slice(-2).join(".")
      : host;
    cookies.forEach(function (chunk) {
      var eq = chunk.indexOf("=");
      var name = (eq > -1 ? chunk.substr(0, eq) : chunk).trim();
      if (!name) return;
      var paths = ["/", window.location.pathname];
      var domains = ["", host, baseDomain];
      paths.forEach(function (path) {
        domains.forEach(function (domain) {
          var base = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=" + path;
          document.cookie = domain ? base + ";domain=" + domain : base;
        });
      });
    });
  }

  async function _clearCacheStorage() {
    if (!window.caches || typeof window.caches.keys !== "function") return;
    var keys = await window.caches.keys();
    await Promise.all(keys.map(function (key) {
      return window.caches.delete(key);
    }));
  }

  function _resetGlobalAuthState() {
    _lastResolvedRole = null;
    _recoveryInProgress = false;
    window._goeloSbClient = null;
    _emitRole("visitor", null);
  }

  window.goeloSignOut = async function (opts) {
    opts = opts || {};
    var redirectTo = opts.redirect != null ? opts.redirect : null;

    async function runStep(label, fn) {
      console.log("[GoëloAuth] déconnexion — " + label + "…");
      try {
        await fn();
        console.log("[GoëloAuth] déconnexion — " + label + " ✔");
      } catch (err) {
        console.warn("[GoëloAuth] déconnexion — " + label + " ✗", err);
      }
    }

    await runStep("signOut Supabase", async function () {
      var sb = window.goeloGetSb();
      if (sb) await sb.auth.signOut();
    });

    await runStep("localStorage", function () {
      localStorage.clear();
    });

    await runStep("sessionStorage", function () {
      sessionStorage.clear();
    });

    await runStep("cookies accessibles", function () {
      _clearAccessibleCookies();
    });

    await runStep("Cache Storage", function () {
      return _clearCacheStorage();
    });

    await runStep("états globaux", function () {
      _resetGlobalAuthState();
    });

    if (redirectTo) {
      console.log("[GoëloAuth] déconnexion — redirection vers " + redirectTo);
      window.location.href = redirectTo;
    }
  };

  /* ════════════════════════════════════════════════════════════
     12. INIT
     ════════════════════════════════════════════════════════════ */
  function _init() {
    _injectModals();
    _bindEvents();
    _bindAuthStateChange();
    if (_isRecoveryUrl()) {
      _recoveryInProgress = true;
    } else {
      resolveRole();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})();
