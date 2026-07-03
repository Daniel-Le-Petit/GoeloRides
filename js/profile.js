/**
 * GoëloRides — page profil
 */
(function () {
  "use strict";

  var ROLE_LABELS = {
    visitor: "Visiteur",
    user: "Cycliste",
    team_rider: "Team Rider",
    admin: "Admin"
  };

  function $(id) { return document.getElementById(id); }

  function getSb() {
    return typeof window.goeloGetSb === "function" ? window.goeloGetSb() : null;
  }

  function showGate() {
    $("profile-gate").hidden = false;
    $("profile-content").hidden = true;
  }

  function showProfile() {
    $("profile-gate").hidden = true;
    $("profile-content").hidden = false;
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value || "—";
  }

  async function loadProfile(user) {
    var sb = getSb();
    if (!sb || !user) {
      showGate();
      return;
    }

    var result = await sb
      .from("profiles")
      .select("pseudo, cyclist_level, city, role")
      .eq("id", user.id)
      .maybeSingle();

    var profile = result.data || {};
    var pseudo = profile.pseudo || (window.GoeloProfile && window.GoeloProfile.getDisplayName(
      window.GoeloProfile.profileFromUser(user)
    )) || "Utilisateur";

    var role = profile.role || window.GOELO_ROLE || "user";
    var avatar = $("profile-avatar");
    if (avatar && window.GoeloProfile) {
      avatar.textContent = window.GoeloProfile.initials({ pseudo: pseudo });
      avatar.style.background = window.GoeloProfile.avatarColor({ pseudo: pseudo });
    }

    setText("profile-name", pseudo);
    setText("profile-role", ROLE_LABELS[role] || role);
    setText("profile-pseudo", pseudo);
    setText("profile-level", profile.cyclist_level || "—");
    setText("profile-city", profile.city || "—");
    showProfile();
  }

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
