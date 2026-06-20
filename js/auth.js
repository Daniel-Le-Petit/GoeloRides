/**
 * GoëloRides — /js/auth.js
 * ─────────────────────────────────────────────────────────────────
 * SOURCE UNIQUE DE VÉRITÉ pour :
 *   • Singleton Supabase (UNE SEULE instance sur toute l'application)
 *   • Détection session + fetch profiles.role
 *   • Stockage rôle : window.GOELO_ROLE / window.GOELO_USER
 *   • Événement "goelo:role-ready" + "goelo:auth-success"
 *   • Guards de pages protégées
 *   • Modale Team Rider + modale Connexion
 *   • Reset password (localhost + production)
 *
 * AUCUN autre fichier ne doit appeler supabase.createClient().
 * Utiliser window.goeloGetSb() partout ailleurs.
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  /* ══════════════════════════════════════════════════════════════
     GUARD : ne jamais s'initialiser deux fois
     ══════════════════════════════════════════════════════════════ */
  if (window.__GOELO_AUTH_BOOT__) return;
  window.__GOELO_AUTH_BOOT__ = true;

  /* ══════════════════════════════════════════════════════════════
     1. SINGLETON SUPABASE
     ══════════════════════════════════════════════════════════════
     Raison du warning "Multiple GoTrueClient instances detected" :
     chaque fichier JS qui appelait createClient() créait sa propre
     instance avec son propre état de session.
     Solution : UN SEUL createClient() ici, exposé via window.goeloGetSb().
     ══════════════════════════════════════════════════════════════ */
  var _sb = null;

  function _createSbClient() {
    var url = (window.GOELO_SUPABASE_URL  || "").trim();
    var key = (window.GOELO_SUPABASE_ANON_KEY || "").trim();

    if (!url || !key) {
      console.error("[GoëloAuth] GOELO_SUPABASE_URL ou GOELO_SUPABASE_ANON_KEY manquant");
      return null;
    }
    if (url.indexOf("xxxxxxxx") !== -1) {
      console.error("[GoëloAuth] URL Supabase non configurée (contient 'xxxxxxxx')");
      return null;
    }
    if (typeof window.supabase === "undefined" || typeof window.supabase.createClient !== "function") {
      console.error("[GoëloAuth] SDK Supabase non chargé — ajouter le CDN avant auth.js");
      return null;
    }

    /* storageKey personnalisé pour éviter les conflits entre pages
       et garantir UNE SEULE session localStorage par projet. */
    return window.supabase.createClient(url, key, {
      auth: {
        storageKey: "goelo_auth_v1",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true   // indispensable pour le flow reset password
      }
    });
  }

  /**
   * window.goeloGetSb() — point d'entrée unique dans tout le projet.
   * Appelé par sorties.js, parcours.js, team-rider.js, etc.
   * Retourne null si la config est manquante (pas de throw — évite les
   * crashes en cascade sur les pages qui n'ont pas besoin d'auth).
   */
  window.goeloGetSb = function () {
    if (_sb) return _sb;
    _sb = _createSbClient();
    return _sb;
  };

  /* ══════════════════════════════════════════════════════════════
     2. ÉTAT GLOBAL DU RÔLE
     ══════════════════════════════════════════════════════════════
     Accessible par tous les fichiers via window.GOELO_ROLE
     Valeurs : "visitor" | "user" | "teamrider" | "admin"
     ══════════════════════════════════════════════════════════════ */
  window.GOELO_ROLE = "visitor";
  window.GOELO_USER = null;
  window.GOELO_UI_STATE = "visitor";

  /* ══════════════════════════════════════════════════════════════
     3. DÉTECTION SESSION + RÔLE
     ══════════════════════════════════════════════════════════════
     Ordre :
       a. getSession() — rapide, synchrone depuis localStorage
       b. getUser()    — vérification serveur (jeton non expiré)
       c. fetch profiles.role WHERE id = user.id
     ══════════════════════════════════════════════════════════════ */
  async function resolveRole() {
    var sb = window.goeloGetSb();
    if (!sb) { _emitRole("visitor", null); return; }

    try {
      /* a. Session locale d'abord (évite un aller-réseau si déjà connue) */
      var sessionResult = await sb.auth.getSession();
      if (!sessionResult.data.session) {
        _emitRole("visitor", null);
        return;
      }

      /* b. Vérification serveur du jeton */
      var userResult = await sb.auth.getUser();
      if (userResult.error || !userResult.data.user) {
        _emitRole("visitor", null);
        return;
      }
      var user = userResult.data.user;

      /* c. Fetch profiles.role */
      var profileResult = await sb
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileResult.error) {
        /* Profil absent ou RLS bloque → rôle "user" par défaut */
        console.warn("[GoëloAuth] profiles fetch error:", profileResult.error.message);
        _emitRole("user", user);
        return;
      }

      var role = (profileResult.data && profileResult.data.role)
        ? profileResult.data.role
        : "user";

      _emitRole(role, user);

    } catch (err) {
      console.warn("[GoëloAuth] resolveRole exception:", err.message);
      _emitRole("visitor", null);
    }
  }

function _emitRole(role, user) {
  window.GOELO_ROLE = role;
  window.GOELO_USER = user;
  window.GOELO_UI_STATE = computeUIState(role);

  window.dispatchEvent(new CustomEvent("goelo:role-ready", {
    detail: { role, user, uiState: window.GOELO_UI_STATE }
  }));
}

function computeUIState(role) {
  if (!window.GOELO_USER) return "visitor";
  if (role === "admin") return "admin";
  if (role === "teamrider") return "teamrider";
  return "user";
}

  /* ══════════════════════════════════════════════════════════════
     4. ÉCOUTE DES CHANGEMENTS DE SESSION
     ══════════════════════════════════════════════════════════════
     onAuthStateChange intercepte :
       - SIGNED_IN  → re-résoudre le rôle
       - SIGNED_OUT → passer en "visitor"
       - PASSWORD_RECOVERY → gérer le flow reset
     ══════════════════════════════════════════════════════════════ */
  function bindAuthStateChange() {
    var sb = window.goeloGetSb();
    if (!sb) return;

    sb.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        resolveRole();
      } else if (event === "SIGNED_OUT") {
        _emitRole("visitor", null);
      } else if (event === "PASSWORD_RECOVERY") {
        /* Le lien de reset a été cliqué — afficher le formulaire
           de nouveau mot de passe si la page le prévoit */
        window.dispatchEvent(new CustomEvent("goelo:password-recovery", {
          detail: { session: session }
        }));
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     5. GUARDS DE PAGES
     ══════════════════════════════════════════════════════════════ */
  /**
   * window.goeloGuard(requiredRole)
   * Retourne true si le rôle courant >= rôle requis.
   * Utilisé par team-rider.js, admin pages, etc.
   */
  var ROLE_ORDER = { visitor: 0, user: 1, teamrider: 2, admin: 3 };

  window.goeloGuard = function (requiredRole) {
    var current  = ROLE_ORDER[window.GOELO_ROLE]  || 0;
    var required = ROLE_ORDER[requiredRole] || 0;
    return current >= required;
  };

  /**
   * Redirige automatiquement selon le rôle.
   * Appelé après un login réussi.
   */
  function _redirectAfterLogin() {
    var role = window.GOELO_ROLE;
    var path = window.location.pathname;

    if (role === "admin") {
      if (!path.endsWith("admin.html")) window.location.href = "admin.html";
      return;
    }
    if (role === "teamrider") {
      if (!path.endsWith("team-rider.html")) window.location.href = "team-rider.html";
      return;
    }
    /* user → reste sur la page, home.js adapte l'UI */
  }

  /* ══════════════════════════════════════════════════════════════
     6. RESET PASSWORD — FIX STABLE
     ══════════════════════════════════════════════════════════════
     Problème actuel :
       • redirectTo pointait sur localhost en prod (ou l'inverse)
       • otp_expired car le lien était mal formé ou cliqué tardivement
       • detectSessionInUrl:true non activé → Supabase ne lisait pas
         le token dans le hash #access_token=...
     Solution :
       • redirectTo = window.location.origin + /reset-password (ou index)
       • detectSessionInUrl:true (déjà activé dans createClient ci-dessus)
       • EMAIL : configurer dans Supabase Dashboard →
         Authentication → Email Templates → "Redirect URL" = ton domaine
     ══════════════════════════════════════════════════════════════ */
  async function sendPasswordReset(email) {
    var sb = window.goeloGetSb();
    if (!sb) { _showError("Client Supabase non disponible."); return; }

    /* redirectTo = origine courante → fonctionne en local ET en prod
       sans hardcoder l'URL. Supabase redirige vers cette URL avec
       le token dans le hash, que detectSessionInUrl:true lit automatiquement. */
    var redirectTo = window.location.origin + "/index.html";

    var res = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectTo
    });

    if (res.error) {
      _showError("Envoi impossible. V\u00e9rifie l'adresse e-mail.");
      return;
    }
    _showError(
      "E-mail envoy\u00e9 \u2014 v\u00e9rifie ta bo\u00eete (et le dossier spam). " +
      "Le lien est valide 1 heure.",
      true /* isInfo */
    );
  }

  /* ══════════════════════════════════════════════════════════════
     7. LOGIN
     ══════════════════════════════════════════════════════════════
     Cause du "Invalid login credentials" instable :
       • Plusieurs instances GoTrueClient → sessions en conflit
       • Fix : singleton + storageKey unique (fait ci-dessus)
     ══════════════════════════════════════════════════════════════ */
  async function submitLogin() {
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
      var sb  = window.goeloGetSb();
      if (!sb) { _showError("Service temporairement indisponible."); return; }

      var res = await sb.auth.signInWithPassword({ email: email, password: password });

      if (res.error) {
        _showError(_friendlyError(res.error.message));
        return;
      }

      /* Résoudre le rôle AVANT de rediriger */
      await resolveRole();

      /* ADMIN */
      if (window.GOELO_ROLE === "admin") {
        window.location.href = "admin.html";
        return;
      }

      /* TEAM RIDER */
      if (window.GOELO_ROLE === "teamrider") {
        window.location.href = "team-rider.html";
        return;
      }

      /* USER NORMAL */
      _closeAllModals();

      window.dispatchEvent(new CustomEvent("goelo:auth-success", {
        detail: {
          user: window.GOELO_USER,
          role: window.GOELO_ROLE
        }
      }));
      /* Notifier les autres scripts */
      try {
        window.dispatchEvent(new CustomEvent("goelo:auth-success", {
          detail: { user: res.data.user, role: window.GOELO_ROLE }
        }));
      } catch (e) { void e; }

      _redirectAfterLogin();

    } catch (err) {
      console.error("[GoëloAuth] submitLogin:", err);
      _showError("Erreur inattendue. R\u00e9essaie.");
    } finally {
      if (label)     label.hidden     = false;
      if (spinner)   spinner.hidden   = true;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

async function submitSignup(email, password) {
  const sb = window.goeloGetSb();

  if (!sb) {
    console.error("Supabase non initialisé");
    return;
  }

  const { data, error } = await sb.auth.signUp({
    email: email.trim().toLowerCase(),
    password: password
  });

  if (error) {
    console.error("SIGNUP ERROR:", error.message);
    _showError("Erreur création compte : " + error.message);
    return;
  }

  console.log("SIGNUP OK:", data);

  // ⚠️ IMPORTANT : création profil auto
  if (data?.user?.id) {
    const { error: profileError } = await sb.from("profiles").insert({
      id: data.user.id,
      role: "user"
    });

    if (profileError) {
      console.warn("Profile insert error:", profileError.message);
    }
  }

  _showError(
    "Compte créé ! Vérifie ton email pour confirmer.",
    true
  );
}

window.goeloSetRole = async function (userId, role) {
  const sb = window.goeloGetSb();

  const { error } = await sb
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) {
    console.error("Role update error:", error);
  } else {
    console.log("Role updated:", role);
    await resolveRole(); // refresh UI
  }
};
function updateLoginModalUI() {
  const state = window.GOELO_UI_STATE;

  const accessBtn = document.getElementById("ml-go-access");
  const subtitle = document.querySelector(".ml-sub");
  const title = document.querySelector(".ml-title");

  if (!accessBtn || !subtitle || !title) return;

  if (state === "visitor") {
    title.textContent = "Connexion / Inscription";
    subtitle.textContent = "Crée ton compte ou connecte-toi pour commencer.";
    accessBtn.textContent = "Créer un compte Team Rider";
  }

  if (state === "user") {
    title.textContent = "Devenir Team Rider";
    subtitle.textContent = "Tu es connecté mais pas encore membre Team Rider.";
    accessBtn.textContent = "Demander accès Team Rider";
  }

  if (state === "teamrider") {
    title.textContent = "Espace Team Rider";
    subtitle.textContent = "Accès à tes sorties et outils.";
    accessBtn.textContent = "Accéder Team Rider";
  }
}
  function _friendlyError(msg) {
    msg = String(msg || "");
    if (msg.indexOf("Invalid login") !== -1 || msg.indexOf("invalid_grant") !== -1)
      return "E-mail ou mot de passe incorrect.";
    if (msg.indexOf("Email not confirmed") !== -1)
      return "Confirme ton e-mail d'abord (lien re\u00e7u par mail).";
    if (msg.indexOf("Too many requests") !== -1)
      return "Trop de tentatives. Attends quelques minutes.";
    if (msg.indexOf("User not found") !== -1)
      return "Aucun compte trouv\u00e9 pour cet e-mail.";
    return "Connexion impossible. V\u00e9rifie tes identifiants.";
  }

  /* ══════════════════════════════════════════════════════════════
     8. MODALES (design inchangé, logique nettoyée)
     ══════════════════════════════════════════════════════════════ */
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
    setTimeout(function () {
      m.hidden = true;
      _unlockScroll();
    }, 250);
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

  /* Injection HTML des modales (identique à avant — design inchangé) */
  function _injectModals() {
    if (document.getElementById("modal-teamrider")) return;
    var html =
      /* ══ MODALE 1 : MODE TEAM RIDER ══ */
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
      '</div></div></div>' +
      /* ══ MODALE 2 : CONNEXION ══ */
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
      '<button type="button" class="ml-eye" id="ml-eye-btn" aria-label="Afficher ou masquer le mot de passe" aria-pressed="false">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
      '</button></div>' +
      '<a href="#" class="ml-forgot" id="ml-forgot">Mot de passe oubli\u00e9\u00a0?</a>' +
      '<button type="submit" class="ml-btn-primary" id="ml-submit">' +
      '<span id="ml-btn-label">\u2192 Se connecter</span>' +
      '<span id="ml-btn-spinner" hidden>\u23f3 Connexion\u2026</span>' +
      '</button></form>' +
      '<div class="ml-separator"><span>ou</span></div>' +
      '<a class="ml-btn-outline" id="ml-go-access" href="gestion-team-rider.html">Demander l\'acc\u00e8s Team Rider</a>' +
      '<a href="gestion-team-rider.html" class="ml-join-link">Rejoindre l\'équipe \u2192</a>' +
      '</div></div>';

    document.body.insertAdjacentHTML("beforeend", html);
  }

  function _bindEvents() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") _closeAllModals();
    });

    document.addEventListener("click", function (e) {
      /* Fermeture backdrop / croix */
      var closer = e.target.closest("[data-close-modal]");
      if (closer) { _closeModal(closer.getAttribute("data-close-modal")); return; }

      /* Trigger partout → Modale 1 */
      if (e.target.closest("[data-goelo-auth-trigger]")) {
        e.preventDefault();
        _openModal("modal-teamrider");
        return;
      }

      /* Modale 1 → Modale 2 */
      if (e.target.closest("#mtr-go-login")) {
        _closeModal("modal-teamrider");
        setTimeout(function () { _openModal("modal-login"); }, 200);
        return;
      }

      /* Liens demande d'accès */
      if (e.target.closest("#mtr-go-access") || e.target.closest("#ml-go-access")) {
        _closeAllModals();
        return;
      }

      /* Œil mot de passe */
      if (e.target.closest("#ml-eye-btn")) {
        var inp  = document.getElementById("ml-password");
        var btn  = document.getElementById("ml-eye-btn");
        var show = inp.type === "password";
        inp.type = show ? "text" : "password";
        btn.setAttribute("aria-pressed", show ? "true" : "false");
        return;
      }

      /* Mot de passe oublié */
      if (e.target.closest("#ml-forgot")) {
        e.preventDefault();
        var emailVal = (document.getElementById("ml-email") || {}).value || "";
        if (!emailVal.trim()) {
          _showError("Indique d'abord ton e-mail, puis clique « Mot de passe oubli\u00e9 ? ».");
          return;
        }
        sendPasswordReset(emailVal);
      }
    });

    /* Submit formulaire connexion */
    document.addEventListener("submit", function (e) {
      if (e.target && e.target.id === "ml-form") {
        e.preventDefault();

        document.addEventListener("submit", function (e) {
          if (e.target && e.target.id === "ml-form") {
            e.preventDefault();

            const email = document.getElementById("ml-email").value;
            const password = document.getElementById("ml-password").value;

            if (window.GOELO_UI_STATE === "visitor") {
              submitSignup(email, password);
            } else {
              submitLogin();
            }
          }
        });

      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     9. API PUBLIQUE
     ══════════════════════════════════════════════════════════════ */
  /** Ouvre la modale Team Rider (ex. depuis un lien externe) */
  window.openGoeloAuth  = function () { _openModal("modal-teamrider"); };
  window.closeGoeloAuth = _closeAllModals;

  /* ══════════════════════════════════════════════════════════════
     10. INIT
     ══════════════════════════════════════════════════════════════ */
  function _init() {
    _injectModals();
    _bindEvents();

    window.addEventListener("goelo:role-ready", updateLoginModalUI);
    window.addEventListener("goelo:auth-success", updateLoginModalUI);

    /* Résoudre le rôle dès le chargement */
    resolveRole();

    /* Écouter les changements de session */
    bindAuthStateChange();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})();
