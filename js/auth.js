/**
 * GoëloRides — js/auth.js
 * Responsabilités :
 *   1. Singleton Supabase lazy (getSb)
 *   2. Détection session + fetch profiles.role
 *   3. Stockage rôle sur window.GOELO_ROLE
 *   4. Événement "goelo:role-ready" dispatché quand le rôle est connu
 *   5. Guards de page (team-rider.html, admin.html)
 *   6. Injection modale auth (inchangée)
 *
 * Rôles : visitor | user | teamrider | admin
 */
(function () {
  "use strict";
  if (window.__goeloAuthInit) return;
  window.__goeloAuthInit = true;

  /* ── Singleton Supabase ────────────────────────────────────── */
  let _sb = null;
  function getSb() {
    if (_sb) return _sb;
    const url = (window.GOELO_SUPABASE_URL  || "").trim();
    const key = (window.GOELO_SUPABASE_ANON_KEY || "").trim();
    if (!url || !key) throw new Error("Config Supabase manquante");
    if (typeof window.supabase?.createClient !== "function") {
      throw new Error("Supabase SDK non chargé");
    }
    _sb = window.supabase.createClient(url, key);
    return _sb;
  }

  /* ── Stockage du rôle courant ──────────────────────────────── */
  // window.GOELO_ROLE  : "visitor" | "user" | "teamrider" | "admin"
  // window.GOELO_USER  : objet Supabase user ou null
  window.GOELO_ROLE = "visitor";
  window.GOELO_USER = null;

  /* ── Résolution du rôle ────────────────────────────────────────
     1. Récupère la session Supabase
     2. Si connecté → fetch profiles.role
     3. Dispatch goelo:role-ready avec { role, user }
     ─────────────────────────────────────────────────────────── */
  async function resolveRole() {
    try {
      const sb = getSb();

      // Session en cours
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        _dispatchRole("visitor", null);
        return;
      }

      const user = session.user;
      window.GOELO_USER = user;

      // Fetch profile dans la table `profiles`
      const { data: profile, error } = await sb
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.warn("auth.js: erreur fetch profile", error.message);
        // Fallback : user connecté sans profil → rôle "user"
        _dispatchRole("user", user);
        return;
      }

      const role = profile?.role || "user";
      _dispatchRole(role, user);

    } catch (err) {
      console.warn("auth.js: resolveRole error", err.message);
      _dispatchRole("visitor", null);
    }
  }

  function _dispatchRole(role, user) {
    window.GOELO_ROLE = role;
    window.GOELO_USER = user;
    window.dispatchEvent(new CustomEvent("goelo:role-ready", {
      detail: { role, user }
    }));
  }

  /* ── Guards de page ────────────────────────────────────────────
     Appelé par home.js et les pages protégées.
     ─────────────────────────────────────────────────────────── */
  window.goeloGuard = function (requiredRole) {
    const order = { visitor: 0, user: 1, teamrider: 2, admin: 3 };
    const current = order[window.GOELO_ROLE] ?? 0;
    const required = order[requiredRole] ?? 0;
    return current >= required;
  };

  /* ── Écoute des changements de session Supabase ────────────── */
  function bindAuthStateChange() {
    try {
      const sb = getSb();
      sb.auth.onAuthStateChange(function (event) {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          resolveRole();
        } else if (event === "SIGNED_OUT") {
          _dispatchRole("visitor", null);
        }
      });
    } catch (err) {
      // SDK pas encore dispo — pas critique, resolveRole() a déjà tourné
    }
  }

  /* ── Modales Team Rider / Connexion ───────────────────────────
     Injectées dans le DOM comme avant, sans changement de design.
     ─────────────────────────────────────────────────────────── */
  var lastFocus = null;

  function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    lastFocus = document.activeElement;
    m.hidden = false;
    requestAnimationFrame(function () {
      m.classList.add("is-open");
      var target = m.querySelector("[data-autofocus]") || m.querySelector(".goelo-modal__close");
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
      setTimeout(function () { m.hidden = true; }, 250);
    });
    setTimeout(unlockScrollIfNoneOpen, 260);
  }

  function unlockScrollIfNoneOpen() {
    if (!document.querySelector(".goelo-modal.is-open")) {
      document.documentElement.classList.remove("goelo-modal-open");
      if (lastFocus && typeof lastFocus.focus === "function") {
        try { lastFocus.focus(); } catch (e) { void e; }
        lastFocus = null;
      }
    }
  }

  function injectModals() {
    if (document.getElementById("modal-teamrider")) return;
    var html =
      '<div id="modal-teamrider" class="goelo-modal" hidden role="dialog" aria-modal="true" aria-labelledby="mtr-title">' +
      '  <div class="goelo-modal__backdrop" data-close-modal="modal-teamrider"></div>' +
      '  <div class="goelo-modal__box goelo-modal__box--teamrider">' +
      '    <div class="mtr-visual" aria-hidden="true">' +
      '      <img src="assets/hero-accueil.png" alt="" loading="lazy" decoding="async">' +
      '      <div class="mtr-visual__overlay"></div>' +
      '      <span class="mtr-visual__label">TEAM<br>RIDER</span>' +
      '    </div>' +
      '    <div class="mtr-content">' +
      '      <button type="button" class="goelo-modal__close" data-close-modal="modal-teamrider" aria-label="Fermer">\u2715</button>' +
      '      <span class="mtr-badge">Mode Team Rider</span>' +
      '      <h2 id="mtr-title" class="mtr-title">Passez en mode<br><span class="mtr-title--accent">Team Rider</span></h2>' +
      '      <p class="mtr-desc">Publier, modifier ou organiser une sortie\u2026 Le mode Team Rider est fait pour vous\u00a0!</p>' +
      '      <div class="mtr-actions">' +
      '        <button type="button" class="mtr-btn mtr-btn--primary" id="mtr-go-login" data-autofocus>Se connecter</button>' +
      '        <a class="mtr-btn mtr-btn--outline" id="mtr-go-access" href="gestion-team-rider.html">Demander l\'acc\u00e8s</a>' +
      '      </div>' +
      '      <p class="mtr-lock-note"><span aria-hidden="true">\uD83D\uDD12</span> Acc\u00e8s r\u00e9serv\u00e9 aux Team Riders</p>' +
      '    </div>' +
      '  </div>' +
      '</div>' +
      '<div id="modal-login" class="goelo-modal" hidden role="dialog" aria-modal="true" aria-labelledby="ml-title">' +
      '  <div class="goelo-modal__backdrop" data-close-modal="modal-login"></div>' +
      '  <div class="goelo-modal__box goelo-modal__box--login">' +
      '    <button type="button" class="goelo-modal__close" data-close-modal="modal-login" aria-label="Fermer">\u2715</button>' +
      '    <span class="ml-badge"><span aria-hidden="true">\uD83D\uDD12</span> Espace Team Rider</span>' +
      '    <h2 id="ml-title" class="ml-title">Connexion</h2>' +
      '    <p class="ml-sub">Acc\u00e8de aux sorties r\u00e9serv\u00e9es et aux fonctionnalit\u00e9s Team Rider.</p>' +
      '    <div id="ml-error" class="ml-error" role="alert" hidden></div>' +
      '    <form id="ml-form" novalidate>' +
      '      <label class="ml-label" for="ml-email">E-mail</label>' +
      '      <input id="ml-email" class="ml-input" type="email" placeholder="ton@email.com" autocomplete="username" required data-autofocus>' +
      '      <label class="ml-label" for="ml-password">Mot de passe</label>' +
      '      <div class="ml-pw-wrap">' +
      '        <input id="ml-password" class="ml-input" type="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="current-password" required>' +
      '        <button type="button" class="ml-eye" id="ml-eye-btn" aria-label="Afficher ou masquer le mot de passe" aria-pressed="false">' +
      '          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' +
      '          </svg>' +
      '        </button>' +
      '      </div>' +
      '      <a href="#" class="ml-forgot" id="ml-forgot">Mot de passe oubli\u00e9\u00a0?</a>' +
      '      <button type="submit" class="ml-btn-primary" id="ml-submit">' +
      '        <span id="ml-btn-label">\u2192 Se connecter</span>' +
      '        <span id="ml-btn-spinner" hidden>\u23f3 Connexion\u2026</span>' +
      '      </button>' +
      '    </form>' +
      '    <div class="ml-separator"><span>ou</span></div>' +
      '    <a class="ml-btn-outline" id="ml-go-access" href="gestion-team-rider.html">Demander l\'acc\u00e8s Team Rider</a>' +
      '    <a href="gestion-team-rider.html" class="ml-join-link">Rejoindre l\'équipe \u2192</a>' +
      '  </div>' +
      '</div>';
    document.body.insertAdjacentHTML("beforeend", html);
  }

  function bindEvents() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAllModals();
    });

    document.addEventListener("click", function (e) {
      var closer = e.target.closest("[data-close-modal]");
      if (closer) { closeModal(closer.getAttribute("data-close-modal")); return; }

      if (e.target.closest("[data-goelo-auth-trigger]")) {
        e.preventDefault();
        openModal("modal-teamrider");
        return;
      }

      if (e.target.closest("#mtr-go-login")) {
        closeModal("modal-teamrider");
        setTimeout(function () { openModal("modal-login"); }, 200);
        return;
      }

      if (e.target.closest("#mtr-go-access") || e.target.closest("#ml-go-access")) {
        closeAllModals();
        return;
      }

      if (e.target.closest("#ml-eye-btn")) {
        var input = document.getElementById("ml-password");
        var btn   = document.getElementById("ml-eye-btn");
        var show  = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-pressed", show ? "true" : "false");
        return;
      }

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

function getSupabase() {
  if (window._goeloSb) return Promise.resolve(window._goeloSb);

  if (window.supabaseClient) {
    return Promise.resolve(window.supabaseClient);
  }

  if (window.supabase && window.supabase.createClient) {
    window._goeloSb = window.supabase.createClient(
      window.GOELO_SUPABASE_URL,
      window.GOELO_SUPABASE_ANON_KEY
    );
    return Promise.resolve(window._goeloSb);
  }

  return Promise.reject(new Error("Supabase non initialisé"));
}

  /* ── Connexion ─────────────────────────────────────────────── */
async function submitLogin() {
  var email = (document.getElementById("ml-email").value || "").trim();
  var password = (document.getElementById("ml-password").value || "");
  var label = document.getElementById("ml-btn-label");
  var spinner = document.getElementById("ml-btn-spinner");
  var submitBtn = document.getElementById("ml-submit");

  hideError();

  console.log("🔥 submitLogin TRIGGERED");
  console.log("email:", email);
  console.log("password ok:", !!password);

  if (!email || !password) {
    showError("Remplis l'e-mail et le mot de passe.");
    return;
  }

  label.hidden = true;
  spinner.hidden = false;
  submitBtn.disabled = true;

  try {
    var sb = await getSupabase();

    console.log("LOGIN CALL START");

    var res = await sb.auth.signInWithPassword({
      email: email,
      password: password
    });

    console.log("LOGIN RESPONSE:", res);

    if (res.error) {
      showError(getFriendlyError(res.error.message));
      return;
    }

    closeAllModals();

    await resolveRole(); // OK si tu l'as vraiment

    window.dispatchEvent(
      new CustomEvent("goelo:auth-success", {
        detail: res.data.user
      })
    );

    // REDIRECTION ICI (PAS AVANT)
    window.location.href = "team-rider.html";

  } catch (err) {
    console.error("LOGIN ERROR FULL:", err);
    showError(err?.message || "Erreur inattendue");
  } finally {
    label.hidden = false;
    spinner.hidden = true;
    submitBtn.disabled = false;
  }
}

  function _redirectAfterLogin() {
    const role = window.GOELO_ROLE;
    if (role === "admin") {
      window.location.href = "admin.html";
    } else if (role === "teamrider") {
      // Seulement si on n'est pas déjà sur team-rider.html
      if (!window.location.pathname.includes("team-rider")) {
        console.log("REDIRECT OK");
        alert("LOGIN OK");
        window.location.href = "team-rider.html";
      }
    }
    // user → reste sur la page, home.js adapte l'UI
  }

  async function sendPasswordReset() {
    var email = (document.getElementById("ml-email").value || "").trim();
    if (!email) { showError("Indique d'abord ton e-mail."); return; }
    try {
      var sb  = getSb();
      var res = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (res.error) { showError("Envoi impossible. V\u00e9rifie l'adresse e-mail."); return; }
      showError("E-mail de r\u00e9initialisation envoy\u00e9 \u2014 v\u00e9rifie ta bo\u00eete mail.", true);
    } catch (err) {
      void err;
      showError("Envoi impossible pour le moment.");
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
    if (msg.includes("Invalid login"))       return "E-mail ou mot de passe incorrect.";
    if (msg.includes("Email not confirmed")) return "Confirme ton e-mail d'abord.";
    if (msg.includes("Too many requests"))   return "Trop de tentatives. Attends un moment.";
    return "Connexion impossible. V\u00e9rifie tes identifiants.";
  }

  /* ── API publique ──────────────────────────────────────────── */
  window.openGoeloAuth  = function () { openModal("modal-teamrider"); };
  window.closeGoeloAuth = closeAllModals;
  window.goeloGetSb     = getSb; // réutilisé par home.js / team-rider.js

  /* ── Init ──────────────────────────────────────────────────── */
  function init() {
    injectModals();
    bindEvents();
    resolveRole();      // détermine le rôle dès le chargement
    bindAuthStateChange();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
