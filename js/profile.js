/**
 * GoëloRides — page profil
 */
(function () {
  "use strict";

  var ROLE_LABELS = {
    visitor: "Visiteur",
    user: "Cycliste",
    team_rider: "Ride Leader",
    admin: "Admin"
  };

  function $(id) { return document.getElementById(id); }

  function getSb() {
    return typeof window.goeloGetSb === "function" ? window.goeloGetSb() : null;
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value || "—";
  }

  function hide(id) {
    var el = $(id);
    if (el) el.hidden = true;
  }

  function show(id) {
    var el = $(id);
    if (el) el.hidden = false;
  }

  /* ── États de page ──────────────────────────────────────────── */
  function showGate() {
    show("profile-gate");
    hide("profile-loading");
    hide("profile-content");
    hide("profile-fatal");
  }

  function showLoading() {
    hide("profile-gate");
    show("profile-loading");
    hide("profile-content");
    hide("profile-fatal");
  }

  function showProfile() {
    hide("profile-gate");
    hide("profile-loading");
    show("profile-content");
    hide("profile-fatal");
  }

  function showFatal(msg) {
    hide("profile-gate");
    hide("profile-loading");
    hide("profile-content");
    var box = $("profile-fatal");
    if (box) {
      box.textContent = msg;
      box.hidden = false;
    }
  }

  function showBanner(msg) {
    var box = $("profile-banner");
    if (box) {
      box.textContent = msg;
      box.hidden = false;
    }
  }

  function hideBanner() {
    var box = $("profile-banner");
    if (box) box.hidden = true;
  }

  /* ── Chargement des données ─────────────────────────────────── */
  async function loadProfile(user) {
    var sb = getSb();
    if (!sb) {
      showFatal("Service indisponible pour le moment. Réessaie plus tard.");
      return;
    }
    if (!user) {
      showGate();
      return;
    }

    showLoading();

    var profile = {};
    var fetchError = null;

    try {
      var result = await sb
        .from("profiles")
        .select("pseudo, cyclist_level, city, role")
        .eq("id", user.id)
        .maybeSingle();
      if (result.error) {
        fetchError = result.error;
        console.warn("[profile] profiles fetch:", result.error.message);
      } else {
        profile = result.data || {};
      }
    } catch (err) {
      fetchError = err;
      console.warn("[profile] profiles fetch (exception):", err && err.message);
    }

    var pseudo =
      profile.pseudo ||
      (window.GoeloProfile && window.GoeloProfile.getDisplayName(
        window.GoeloProfile.profileFromUser(user)
      )) ||
      (user.user_metadata && (user.user_metadata.pseudo || user.user_metadata.name)) ||
      (window.GoeloProfile ? window.GoeloProfile.getParticipantInitials(
        window.GoeloProfile.profileFromUser(user)
      ) : "?");

    var role = profile.role || window.GOELO_ROLE || "user";

    var avatar = $("profile-avatar");
    if (avatar) {
      if (window.GoeloProfile) {
        avatar.textContent = window.GoeloProfile.initials({ pseudo: pseudo });
        avatar.style.background = window.GoeloProfile.avatarColor({ pseudo: pseudo });
      } else {
        avatar.textContent = String(pseudo).slice(0, 2).toUpperCase();
      }
    }

    setText("profile-name", pseudo);
    setText("profile-role", ROLE_LABELS[role] || role);
    setText("profile-email", user.email || "—");
    setText("profile-pseudo", pseudo);
    setText("profile-level", profile.cyclist_level || "—");
    setText("profile-city", profile.city || "—");

    if (fetchError) {
      showBanner("Certaines informations de profil n'ont pas pu être chargées.");
    } else {
      hideBanner();
    }

    showProfile();
  }

  /* ── Auth events ─────────────────────────────────────────────── */
  function onAuth(detail) {
    var user = detail && detail.user;
    if (!user && window.GoeloAuthState) user = window.GoeloAuthState.getState().user;
    if (!user) {
      showGate();
      return;
    }
    loadProfile(user);
  }

  function init() {
    if (window.GoeloAuthState && !window.GoeloAuthState.getState().pending) {
      onAuth(window.GoeloAuthState.getState());
    } else {
      showLoading();
    }
    window.addEventListener("goelo:role-ready", function (e) { onAuth(e.detail); });
    window.addEventListener("goelo:auth-success", function (e) { onAuth(e.detail); });
    window.addEventListener("goelo:auth-state", function (e) { onAuth(e.detail); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
