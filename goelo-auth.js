/**
 * Compte cycliste (Supabase Auth) : icône dans la barre latérale, inscription / connexion,
 * session persistée (localStorage) + rafraîchissement du jeton au chargement.
 *
 * Prérequis : window.GOELO_SUPABASE_URL et window.GOELO_SUPABASE_ANON_KEY (voir supabase/SUPABASE.md).
 * Dans Supabase → Authentication : activer le fournisseur E-mail ; autoriser les inscriptions si besoin.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "goelo_user_auth_v1";
  var LAST_EMAIL_KEY = "goeloRides_last_email";

  /** Après inscription sans session immédiate (confirmation e-mail côté Supabase). */
  var SIGNUP_NEED_CONFIRM_MSG =
    "Compte créé.\n\n" +
    "Pas d’e-mail ? Vérifie courrier indésirable / spam et l’orthographe de l’adresse. Attends quelques minutes. " +
    "Si toujours rien, l’administrateur doit vérifier l’envoi dans Supabase (fournisseur mail, SMTP personnalisé, journaux / rate limits).\n\n" +
    "Lien dans le mail qui ne mène nulle part ou erreur ? Dans Supabase → Authentication → URL configuration : " +
    "« Site URL » et la liste « Redirect URLs » doivent inclure l’URL exacte du site (ex. https://goelorides.onrender.com). " +
    "Si le mail contient encore localhost alors que tu es sur le site en ligne, corrige la Site URL puis renvoie une confirmation (ou supprime l’utilisateur test et réinscris-toi).\n\n" +
    "Une fois l’e-mail confirmé, utilise l’onglet Connexion avec le même e-mail et mot de passe.";

  /**
   * GET /auth/v1/user : une tentative par jeton (succès ou échec HTTP),
   * sans bloquer définitivement si la 1ʳᵉ requête a échoué (réseau / 401).
   */
  var pseudoUserFetch = { inFlight: false, completedForToken: null };

  function resetPseudoUserFetchState() {
    pseudoUserFetch.inFlight = false;
    pseudoUserFetch.completedForToken = null;
  }

  /** Icône « tête » dessinée (traits simples). */
  var GOELO_AUTH_HEAD_SVG =
    '<svg class="goelo-auth-head-svg" viewBox="0 0 32 32" width="26" height="26" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M7 15.5c1-6.5 17-6.5 18.5 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<ellipse cx="16" cy="18.5" rx="8.5" ry="9.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<circle cx="12.5" cy="17.5" r="1.4" fill="currentColor"/>' +
    '<circle cx="19.5" cy="17.5" r="1.4" fill="currentColor"/>' +
    '<path d="M12.5 23c1.6 1.4 5.4 1.4 7 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    "</svg>";

  function normalizeApiKey(raw) {
    var k = raw == null ? "" : String(raw).trim().replace(/\s/g, "");
    if (k.indexOf("sb_publishedable_") === 0) {
      console.warn("Goëlo : préfixe de clé Supabase à corriger (publishable).");
    }
    return k;
  }

  function getSupabaseConfig() {
    var url =
      typeof window !== "undefined"
        ? String(window.GOELO_SUPABASE_URL || "")
            .trim()
            .replace(/\s/g, "")
        : "";
    var anonKey =
      typeof window !== "undefined" ? normalizeApiKey(window.GOELO_SUPABASE_ANON_KEY) : "";
    return { url: url, anonKey: anonKey };
  }

  function isConfigured() {
    var c = getSupabaseConfig();
    return !!(c.url && c.anonKey && c.url.indexOf("xxxxxxxx.supabase.co") === -1);
  }

  function readSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o !== "object") return null;
      return o;
    } catch (e) {
      void e;
      return null;
    }
  }

  function writeSession(o) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
    } catch (e) {
      void e;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      void e;
    }
    resetPseudoUserFetchState();
  }

  function parseJwtPayload(token) {
    try {
      var p = String(token).split(".")[1];
      if (!p) return null;
      var b = p.replace(/-/g, "+").replace(/_/g, "/");
      var pad = b.length % 4;
      if (pad) b += new Array(5 - pad).join("=");
      var json = decodeURIComponent(
        atob(b)
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      return JSON.parse(json);
    } catch (e) {
      void e;
      return null;
    }
  }

  /** Métadonnées profil Auth (objet ou chaîne JSON). */
  function normalizeUserMetadata(raw) {
    if (raw == null) return {};
    if (typeof raw === "object" && !Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        var o = JSON.parse(raw);
        return o && typeof o === "object" && !Array.isArray(o) ? o : {};
      } catch (e) {
        void e;
        return {};
      }
    }
    return {};
  }

  /** Pseudo / prénom affichable depuis user_metadata (Supabase + variantes). */
  function extractPseudoFromMetadata(um) {
    var m = normalizeUserMetadata(um);
    return String(
      m.pseudo ||
        m.preferred_username ||
        m.username ||
        m.user_name ||
        m.nickname ||
        m.name ||
        m.full_name ||
        m.display_name ||
        m.given_name ||
        ""
    ).trim();
  }

  /** Réponse Auth plate ou enveloppée `{ user: … }`. */
  function unwrapAuthUser(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (payload.user && typeof payload.user === "object") return payload.user;
    return payload;
  }

  function pseudoFromSupabaseUser(user) {
    user = unwrapAuthUser(user);
    if (!user || typeof user !== "object") return "";
    var um = normalizeUserMetadata(user.user_metadata);
    var raw = normalizeUserMetadata(user.raw_user_meta_data);
    var p = extractPseudoFromMetadata(um) || extractPseudoFromMetadata(raw);
    if (p) return p;
    var ids = user.identities;
    if (!Array.isArray(ids)) return "";
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!id || typeof id !== "object") continue;
      var idd = extractPseudoFromMetadata(id.identity_data);
      if (idd) return idd;
    }
    return "";
  }

  /**
   * GoTrue renvoie soit des jetons à la racine, soit { user, session: { access_token, ... } }.
   */
  function normalizeTokenResponse(b) {
    if (!b || typeof b !== "object") return null;
    if (typeof b.access_token === "string" && b.access_token.length > 0) return b;
    var s = b.session;
    if (s && typeof s === "object" && typeof s.access_token === "string" && s.access_token.length > 0) {
      return {
        access_token: s.access_token,
        refresh_token: s.refresh_token != null ? String(s.refresh_token) : "",
        expires_in: typeof s.expires_in === "number" ? s.expires_in : 3600,
        user: b.user != null ? b.user : s.user
      };
    }
    return null;
  }

  function persistFromAuthResponse(body) {
    var norm = normalizeTokenResponse(body);
    if (!norm) norm = body;
    if (!norm || !norm.access_token) return false;
    var prev = readSession() || {};
    var expSec = typeof norm.expires_in === "number" ? norm.expires_in : 3600;
    var expMs = Date.now() + expSec * 1000;
    var email = "";
    var pseudo = "";
    if (norm.user && typeof norm.user === "object") {
      email = String(norm.user.email || "").trim().toLowerCase();
      pseudo = pseudoFromSupabaseUser(norm.user);
    }
    if (!email) {
      var pl = parseJwtPayload(norm.access_token);
      if (pl) {
        email = String(pl.email || "").trim().toLowerCase();
        pseudo = pseudo || extractPseudoFromMetadata(pl.user_metadata);
      }
    }
    if (!email) email = String(prev.email || "").trim().toLowerCase();
    if (!pseudo) pseudo = String(prev.pseudo || "").trim();
    var rt =
      norm.refresh_token != null && String(norm.refresh_token).trim()
        ? String(norm.refresh_token)
        : String(prev.refresh_token || "");
    writeSession({
      access_token: String(norm.access_token),
      refresh_token: rt,
      expires_at_ms: expMs,
      email: email,
      pseudo: pseudo
    });
    if (email) {
      try {
        localStorage.setItem(LAST_EMAIL_KEY, JSON.stringify(email));
      } catch (e) {
        void e;
      }
    }
    try {
      window.dispatchEvent(new CustomEvent("goelo-user-session-updated"));
    } catch (e) {
      void e;
    }
    /* Pseudo souvent absent du corps de session juste après login ; complément via GET /user. */
    if (!String(pseudo || "").trim()) {
      void refreshSessionPseudoFromUserEndpoint();
    }
    return true;
  }

  /** Complète la session stockée si le JWT contient un pseudo absent du cache (anciennes sessions). */
  function enrichSessionPseudoFromJwt() {
    var s = readSession();
    if (!s || !s.access_token) return;
    if (String(s.pseudo || "").trim()) return;
    var pl = parseJwtPayload(s.access_token);
    if (!pl) return;
    var p =
      extractPseudoFromMetadata(pl.user_metadata) || extractPseudoFromMetadata(pl.app_metadata);
    if (!p) return;
    s.pseudo = p;
    writeSession(s);
    try {
      window.dispatchEvent(new CustomEvent("goelo-user-session-updated"));
    } catch (e) {
      void e;
    }
  }

  /** Récupère user_metadata complet (pseudo) quand le JWT / la session locale ne l’ont pas. */
  async function refreshSessionPseudoFromUserEndpoint() {
    var s = readSession();
    if (!s || !s.access_token || String(s.pseudo || "").trim()) return;
    if (pseudoUserFetch.completedForToken === s.access_token) return;
    if (pseudoUserFetch.inFlight) return;
    var c = getSupabaseConfig();
    if (!isConfigured()) return;

    var token = s.access_token;
    pseudoUserFetch.inFlight = true;
    try {
      var res = await fetch(c.url.replace(/\/?$/, "") + "/auth/v1/user", {
        method: "GET",
        headers: {
          apikey: c.anonKey,
          Authorization: "Bearer " + token,
          Accept: "application/json"
        }
      });
      if (!res.ok) return;
      var body = await res.json();
      var user = unwrapAuthUser(body);
      var p = pseudoFromSupabaseUser(user);
      if (!p) return;
      s = readSession();
      if (!s || s.access_token !== token) return;
      s.pseudo = p;
      writeSession(s);
      try {
        window.dispatchEvent(new CustomEvent("goelo-user-session-updated"));
      } catch (e) {
        void e;
      }
    } catch (err) {
      void err;
    } finally {
      pseudoUserFetch.inFlight = false;
      pseudoUserFetch.completedForToken = token;
    }
  }

  /** Messages GoTrue / Supabase en français + pistes utiles. */
  function humanizeAuthError(raw, authPath) {
    var s = String(raw || "").trim();
    var low = s.toLowerCase();
    var isSignup = authPath && String(authPath).indexOf("signup") !== -1;

    if (low.indexOf("redirect") !== -1 && low.indexOf("allow") !== -1) {
      return (
        "L’adresse de retour après confirmation n’est pas autorisée par le projet. " +
        "Dans Supabase → Authentication → URL configuration, ajoute l’URL du site (ex. https://ton-site.onrender.com et http://127.0.0.1:8765 pour les tests locaux) dans « Redirect URLs »."
      );
    }
    if (low.indexOf("invalid login credentials") !== -1) {
      return (
        "Connexion refusée : e-mail ou mot de passe incorrect, ou aucun compte avec cette adresse. " +
        "Si tu viens de t’inscrire, ouvre d’abord le lien de confirmation dans ton e-mail (y compris courrier indésirable), puis réessaie. " +
        "Sinon vérifie le mot de passe ou utilise l’onglet « Inscription » pour créer un compte."
      );
    }
    if (low === "invalid_grant") {
      return (
        "Connexion refusée. Vérifie l’e-mail et le mot de passe. " +
        "Après une inscription, confirme souvent ton adresse via le lien reçu par mail avant la première connexion."
      );
    }
    if (
      low.indexOf("email not confirmed") !== -1 ||
      low.indexOf("email_not_confirmed") !== -1 ||
      low.indexOf("not confirmed") !== -1
    ) {
      return (
        "Ton adresse e-mail n’est pas encore confirmée. Ouvre le lien reçu lors de l’inscription (vérifie les spams), " +
        "puis reconnecte-toi avec le même mot de passe."
      );
    }
    if (
      low.indexOf("user already registered") !== -1 ||
      low.indexOf("already been registered") !== -1 ||
      low.indexOf("already registered") !== -1
    ) {
      return "Cette adresse e-mail est déjà utilisée. Utilise l’onglet « Connexion » avec ton mot de passe, ou la réinitialisation de mot de passe si ton projet l’active.";
    }
    if (low.indexOf("password") !== -1 && (low.indexOf("weak") !== -1 || low.indexOf("short") !== -1)) {
      return "Mot de passe trop court ou trop faible : au moins 6 caractères (voir les règles du projet Supabase).";
    }
    if (isSignup && low.indexOf("invalid") !== -1 && s.length < 80) {
      return s + " — Vérifie que les inscriptions sont autorisées (Supabase → Authentication → Providers → Email).";
    }
    return s || "Demande refusée.";
  }

  async function authFetch(path, bodyObj) {
    var c = getSupabaseConfig();
    if (!isConfigured()) return { ok: false, message: "Supabase non configuré (URL + clé dans la page)." };
    var base = c.url.replace(/\/?$/, "");
    var res;
    try {
      res = await fetch(base + path, {
        method: "POST",
        headers: {
          apikey: c.anonKey,
          Authorization: "Bearer " + c.anonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bodyObj || {})
      });
    } catch (err) {
      void err;
      return { ok: false, message: "Réseau indisponible ou CORS bloqué." };
    }
    var j;
    try {
      j = await res.json();
    } catch (e) {
      void e;
      return { ok: false, message: "Réponse illisible (HTTP " + res.status + ")." };
    }
    if (!res.ok) {
      var raw =
        (j && (j.error_description || j.msg || j.message)) ||
        (j && j.error ? String(j.error) : "") ||
        "HTTP " + res.status;
      return { ok: false, message: humanizeAuthError(String(raw).trim() || "Demande refusée.", path) };
    }
    return { ok: true, body: j };
  }

  async function signInWithPassword(email, password) {
    var r = await authFetch("/auth/v1/token?grant_type=password", {
      email: String(email).trim().toLowerCase(),
      password: password
    });
    if (!r.ok) return r;
    var flat = normalizeTokenResponse(r.body);
    if (!flat || !flat.access_token) {
      return { ok: false, message: "Réponse sans jeton de session." };
    }
    persistFromAuthResponse(r.body);
    return { ok: true };
  }

  async function signUp(email, password, pseudo) {
    var p = String(pseudo || "").trim();
    if (!p) return { ok: false, message: "Indique un pseudo." };
    var signupBody = {
      email: String(email).trim().toLowerCase(),
      password: password,
      data: { pseudo: p }
    };
    try {
      if (typeof window !== "undefined" && window.location && window.location.origin) {
        var o = String(window.location.origin).replace(/\/$/, "");
        if (o && (o.indexOf("http:") === 0 || o.indexOf("https:") === 0)) {
          signupBody.redirect_to = o + "/";
        }
      }
    } catch (e) {
      void e;
    }
    var r = await authFetch("/auth/v1/signup", signupBody);
    if (!r.ok) return r;
    var b = r.body;
    var flat = normalizeTokenResponse(b);
    if (flat && flat.access_token) {
      persistFromAuthResponse(b);
      return { ok: true, needConfirm: false };
    }
    if (b && b.user && !(flat && flat.access_token)) {
      return {
        ok: true,
        needConfirm: true,
        message: SIGNUP_NEED_CONFIRM_MSG
      };
    }
    if (b && typeof b.email === "string" && b.id && !flat) {
      return {
        ok: true,
        needConfirm: true,
        message: SIGNUP_NEED_CONFIRM_MSG
      };
    }
    return {
      ok: false,
      message:
        "Réponse inattendue du serveur. Vérifie Authentication → Sign up dans Supabase, ou réessaie dans un instant."
    };
  }

  async function tryRefreshSession() {
    var s = readSession();
    if (!s || !s.refresh_token) return;
    if (s.expires_at_ms && Date.now() < s.expires_at_ms - 120000) return;
    var c = getSupabaseConfig();
    if (!isConfigured()) return;
    var base = c.url.replace(/\/?$/, "");
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer =
      ctrl &&
      setTimeout(function () {
        try {
          ctrl.abort();
        } catch (e) {
          void e;
        }
      }, 10000);
    var res;
    try {
      res = await fetch(base + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: {
          apikey: c.anonKey,
          Authorization: "Bearer " + c.anonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (err) {
      void err;
      if (timer) clearTimeout(timer);
      return;
    }
    if (timer) clearTimeout(timer);
    var body;
    try {
      body = await res.json();
    } catch (e) {
      void e;
      clearSession();
      return;
    }
    if (!res.ok || !body.access_token) {
      clearSession();
      return;
    }
    persistFromAuthResponse(body);
  }

  function getDisplayLabel() {
    enrichSessionPseudoFromJwt();
    var s = readSession();
    if (!s || !s.access_token) return "Se connecter";
    if (s.pseudo) return s.pseudo.length > 14 ? s.pseudo.slice(0, 13) + "…" : s.pseudo;
    if (s.email) {
      var part = s.email.split("@")[0];
      return part.length > 14 ? part.slice(0, 13) + "…" : part;
    }
    return "Connecté";
  }

  /** Pseudo pour le message d’accueil (jamais la partie locale de l’e-mail). */
  function getConnectedGreetingName() {
    enrichSessionPseudoFromJwt();
    var s = readSession();
    if (!s || !s.access_token) return "";
    if (s.pseudo) return s.pseudo.length > 22 ? s.pseudo.slice(0, 21) + "…" : s.pseudo;
    return "";
  }

  function applyAuthTriggerLabel() {
    enrichSessionPseudoFromJwt();
    var btn = document.getElementById("goelo-auth-open-btn");
    if (!btn) return;
    var text = getDisplayLabel();
    var tl = document.getElementById("goelo-auth-trigger-label");
    if (tl) tl.textContent = text;
    var s = readSession();
    var inSession = !!(s && s.access_token);
    btn.setAttribute(
      "aria-label",
      inSession ? "Compte " + text + " — ouvrir le menu" : "Se connecter ou créer un compte"
    );
    var greet = document.getElementById("goelo-auth-home-greeting");
    if (greet) {
      var nm = getConnectedGreetingName();
      if (nm) {
        greet.textContent = "Bonjour ! " + nm;
        greet.hidden = false;
      } else if (inSession) {
        greet.textContent = "Bonjour !";
        greet.hidden = false;
        void refreshSessionPseudoFromUserEndpoint().then(function () {
          if (getConnectedGreetingName()) applyAuthTriggerLabel();
        });
      } else {
        greet.textContent = "";
        greet.hidden = true;
      }
    }
  }

  function mountUi() {
    if (document.getElementById("goelo-auth-dialog")) return;

    var modalHtml =
      '<div class="goelo-auth-modal" id="goelo-auth-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="goelo-auth-title">' +
      '  <div class="goelo-auth-modal-backdrop" data-goelo-auth-close tabindex="-1" aria-hidden="true"></div>' +
      '  <div class="goelo-auth-modal-panel" role="document">' +
      '    <button type="button" class="goelo-auth-modal-close" data-goelo-auth-close aria-label="Fermer">×</button>' +
      '    <h2 id="goelo-auth-title" class="goelo-auth-modal-title">Mon compte</h2>' +
      '    <p class="goelo-auth-modal-lead" id="goelo-auth-lead"></p>' +
      '    <div class="goelo-auth-tabs" role="tablist">' +
      '      <button type="button" class="goelo-auth-tab is-active" data-tab="in" role="tab" aria-selected="true">Connexion</button>' +
      '      <button type="button" class="goelo-auth-tab" data-tab="up" role="tab" aria-selected="false">Inscription</button>' +
      "    </div>" +
      '    <form class="goelo-auth-form" id="goelo-auth-form-in" autocomplete="on">' +
      '      <label class="goelo-auth-field"><span>E-mail</span><input type="email" name="email" required autocomplete="username" maxlength="120"></label>' +
      '      <label class="goelo-auth-field"><span>Mot de passe</span><input type="password" name="password" required autocomplete="current-password" minlength="6" maxlength="128"></label>' +
      '      <p class="goelo-auth-error" id="goelo-auth-err-in" hidden></p>' +
      '      <button type="submit" class="goelo-auth-submit">Se connecter</button>' +
      "    </form>" +
      '    <form class="goelo-auth-form" id="goelo-auth-form-up" hidden autocomplete="on">' +
      '      <label class="goelo-auth-field"><span>Pseudo</span><input type="text" name="pseudo" required autocomplete="nickname" maxlength="40" pattern="[\\S].*"></label>' +
      '      <label class="goelo-auth-field"><span>E-mail</span><input type="email" name="email" required autocomplete="email" maxlength="120"></label>' +
      '      <label class="goelo-auth-field"><span>Mot de passe</span><input type="password" name="password" required autocomplete="new-password" minlength="6" maxlength="128"></label>' +
      '      <p class="goelo-auth-hint">Au moins 6 caractères. Tu te reconnecteras avec ton e-mail et ce mot de passe.</p>' +
      '      <p class="goelo-auth-error" id="goelo-auth-err-up" hidden></p>' +
      '      <button type="submit" class="goelo-auth-submit">Créer mon compte</button>' +
      "    </form>" +
      '    <div class="goelo-auth-logged" id="goelo-auth-logged" hidden>' +
      '      <p class="goelo-auth-logged-line" id="goelo-auth-logged-text"></p>' +
      '      <button type="button" class="goelo-auth-submit goelo-auth-submit--ghost" id="goelo-auth-logout">Se déconnecter</button>' +
      "    </div>" +
      "  </div>" +
      "</div>";

    document.body.insertAdjacentHTML("beforeend", modalHtml);

    var sidebars = document.querySelectorAll(".app-sidebar");
    var btnSlotSidebar =
      '<div class="goelo-auth-slot">' +
      '  <button type="button" class="goelo-auth-trigger" id="goelo-auth-open-btn" aria-haspopup="dialog" aria-controls="goelo-auth-dialog">' +
      '    <span class="goelo-auth-trigger-icon goelo-auth-trigger-icon--head" aria-hidden="true">' +
      GOELO_AUTH_HEAD_SVG +
      "</span>" +
      '    <span class="goelo-auth-trigger-label" id="goelo-auth-trigger-label">Se connecter</span>' +
      "  </button>" +
      "</div>";

    var btnSlotHome =
      '<div class="goelo-auth-slot goelo-auth-slot--hero">' +
      '  <span id="goelo-auth-home-greeting" class="goelo-auth-home-greeting" hidden aria-live="polite"></span>' +
      '  <button type="button" class="goelo-auth-trigger goelo-auth-trigger--hero" id="goelo-auth-open-btn" aria-haspopup="dialog" aria-controls="goelo-auth-dialog">' +
      '    <span class="goelo-auth-trigger-icon goelo-auth-trigger-icon--head" aria-hidden="true">' +
      GOELO_AUTH_HEAD_SVG +
      "</span>" +
      '    <span class="goelo-auth-trigger-label goelo-auth-trigger-label--hero" id="goelo-auth-trigger-label">Connexion</span>' +
      "  </button>" +
      "</div>";

    var homeMount = document.querySelector("[data-goelo-auth-home]");
    if (homeMount && !homeMount.querySelector(".goelo-auth-slot")) {
      homeMount.insertAdjacentHTML("beforeend", btnSlotHome);
    } else {
      sidebars.forEach(function (aside) {
        if (aside.querySelector(".goelo-auth-slot")) return;
        /* Pages listées (ex. sorties, groupes) : pas de bouton « Se connecter » dans la barre. */
        if (aside.hasAttribute("data-goelo-auth-no-sidebar")) return;
        aside.insertAdjacentHTML("beforeend", btnSlotSidebar);
      });
    }

    var dialog = document.getElementById("goelo-auth-dialog");
    var openBtn = document.getElementById("goelo-auth-open-btn");
    var lead = document.getElementById("goelo-auth-lead");
    var formIn = document.getElementById("goelo-auth-form-in");
    var formUp = document.getElementById("goelo-auth-form-up");
    var errIn = document.getElementById("goelo-auth-err-in");
    var errUp = document.getElementById("goelo-auth-err-up");
    var logged = document.getElementById("goelo-auth-logged");
    var loggedText = document.getElementById("goelo-auth-logged-text");
    var tablist = dialog.querySelector(".goelo-auth-tabs");
    var tabs = dialog.querySelectorAll(".goelo-auth-tab");

    function setErr(el, msg) {
      if (!msg) {
        el.hidden = true;
        el.textContent = "";
        return;
      }
      el.hidden = false;
      el.textContent = msg;
    }

    function inputByName(form, name) {
      return form.querySelector('input[name="' + name + '"]');
    }

    /** Recopie e-mail / mot de passe pour éviter de resaisir en changeant d’onglet. */
    function syncFormsForTab(tabId) {
      var emIn = inputByName(formIn, "email");
      var pwIn = inputByName(formIn, "password");
      var emUp = inputByName(formUp, "email");
      var pwUp = inputByName(formUp, "password");
      if (tabId === "in") {
        if (emUp && emUp.value) emIn.value = emUp.value;
        if (pwUp && pwUp.value) pwIn.value = pwUp.value;
      } else {
        if (emIn && emIn.value) emUp.value = emIn.value;
        if (pwIn && pwIn.value) pwUp.value = pwIn.value;
      }
    }

    function updateTrigger() {
      applyAuthTriggerLabel();
    }

    function showLoggedState() {
      enrichSessionPseudoFromJwt();
      var s = readSession();
      var has = !!(s && s.access_token);
      if (has) {
        formIn.hidden = true;
        formUp.hidden = true;
        formIn.setAttribute("aria-hidden", "true");
        formUp.setAttribute("aria-hidden", "true");
        tablist.hidden = true;
        logged.hidden = false;
        var bits = [];
        if (s.pseudo) bits.push("Pseudo : " + s.pseudo);
        if (s.email) bits.push("E-mail : " + s.email);
        loggedText.textContent = bits.join(" · ") || "Session active.";
        lead.textContent =
          "Tu es connecté·e. Les prochaines visites sur ce navigateur te gardent connecté·e tant que la session est valide.";
      } else {
        formIn.hidden = false;
        formUp.hidden = true;
        formIn.setAttribute("aria-hidden", "false");
        formUp.setAttribute("aria-hidden", "true");
        tablist.hidden = false;
        logged.hidden = true;
        if (!isConfigured()) {
          lead.textContent =
            "Configure GOELO_SUPABASE_URL et GOELO_SUPABASE_ANON_KEY sur cette page pour activer le compte (voir supabase/SUPABASE.md).";
        } else {
          lead.textContent =
            "Connexion avec ton e-mail et ton mot de passe. À l’inscription, ton pseudo est enregistré sur ton profil.";
        }
      }
    }

    function openModal() {
      if (!isConfigured() && !readSession()) {
        lead.textContent =
          "Configure GOELO_SUPABASE_URL et GOELO_SUPABASE_ANON_KEY sur cette page pour activer le compte (voir supabase/SUPABASE.md).";
      }
      showLoggedState();
      dialog.hidden = false;
      document.documentElement.classList.add("goelo-auth-modal-open");
      if (!readSession()) {
        var activeForm = formIn.hidden ? formUp : formIn;
        var first =
          activeForm.querySelector('input[type="email"]') || activeForm.querySelector("input");
        if (first) first.focus();
      }
    }

    function closeModal() {
      dialog.hidden = true;
      document.documentElement.classList.remove("goelo-auth-modal-open");
      setErr(errIn, "");
      setErr(errUp, "");
    }

    document.querySelectorAll("[data-goelo-auth-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });

    if (openBtn) {
      openBtn.addEventListener("click", openModal);
    }

    dialog.addEventListener("click", function (ev) {
      if (ev.target === dialog) closeModal();
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !dialog.hidden) closeModal();
    });

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var id = tab.getAttribute("data-tab");
        syncFormsForTab(id);
        tabs.forEach(function (t) {
          t.classList.toggle("is-active", t === tab);
          t.setAttribute("aria-selected", t === tab ? "true" : "false");
        });
        formIn.hidden = id !== "in";
        formUp.hidden = id !== "up";
        formIn.setAttribute("aria-hidden", id === "in" ? "false" : "true");
        formUp.setAttribute("aria-hidden", id === "up" ? "false" : "true");
        setErr(errIn, "");
        setErr(errUp, "");
      });
    });

    formIn.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      setErr(errIn, "");
      var fd = new FormData(formIn);
      var email = fd.get("email");
      var password = fd.get("password");
      var r = await signInWithPassword(email, password);
      if (!r.ok) {
        setErr(errIn, r.message);
        return;
      }
      updateTrigger();
      showLoggedState();
    });

    formUp.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      setErr(errUp, "");
      var fd = new FormData(formUp);
      var email = fd.get("email");
      var password = fd.get("password");
      var pseudo = fd.get("pseudo");
      var r = await signUp(email, password, pseudo);
      if (!r.ok) {
        setErr(errUp, r.message);
        return;
      }
      if (r.needConfirm) {
        window.alert(r.message || "Vérifie ta boîte mail si besoin.");
        closeModal();
        return;
      }
      updateTrigger();
      showLoggedState();
    });

    document.getElementById("goelo-auth-logout").addEventListener("click", function () {
      clearSession();
      updateTrigger();
      showLoggedState();
      try {
        window.dispatchEvent(new CustomEvent("goelo-user-session-updated"));
      } catch (e) {
        void e;
      }
      closeModal();
    });

    updateTrigger();
  }

  function init() {
    mountUi();
    applyAuthTriggerLabel();
    void tryRefreshSession().then(applyAuthTriggerLabel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.GoeloAuth = {
    readSession: readSession,
    getAccessToken: function () {
      var s = readSession();
      return s && s.access_token ? s.access_token : null;
    }
  };
})();
