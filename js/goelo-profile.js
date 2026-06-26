/**
 * GoëloRides — affichage utilisateur (pseudo → user_name → fallback).
 * Aucun e-mail ne doit apparaître dans l'UI : pas de fallback sur l'e-mail.
 */
(function (global) {
  "use strict";

  var FALLBACK = "User";
  var AVATAR_COLORS = ["#7DD3FC", "#C4B5FD", "#FCA5A5", "#FCD34D", "#86EFAC", "#C8F135"];

  function getDisplayName(profiles) {
    if (!profiles) return FALLBACK;
    if (typeof profiles === "string") {
      var s = profiles.trim();
      return s || FALLBACK;
    }
    var pseudo = profiles.pseudo && String(profiles.pseudo).trim();
    if (pseudo) return pseudo;
    var userName = profiles.user_name && String(profiles.user_name).trim();
    if (userName) return userName;
    return FALLBACK;
  }

  function profileFromUser(user) {
    if (!user) return null;
    var um = user.user_metadata || {};
    return {
      pseudo: um.pseudo || global.GOELO_DISPLAY_NAME || "",
      user_name: um.user_name || um.name || um.display_name || ""
    };
  }

  function displayName(item) {
    return getDisplayName(item);
  }

  function initials(item) {
    return getDisplayName(item).slice(0, 2).toUpperCase();
  }

  function avatarColor(item, i) {
    var name = getDisplayName(item);
    var idx = i == null ? 0 : i;
    return AVATAR_COLORS[(name.length + idx) % AVATAR_COLORS.length];
  }

  function sessionDisplayName() {
    if (global.GOELO_USER) {
      return getDisplayName(profileFromUser(global.GOELO_USER));
    }
    if (global.GOELO_DISPLAY_NAME && String(global.GOELO_DISPLAY_NAME).trim()) {
      return String(global.GOELO_DISPLAY_NAME).trim();
    }
    return FALLBACK;
  }

  global.GoeloProfile = {
    FALLBACK: FALLBACK,
    getDisplayName: getDisplayName,
    profileFromUser: profileFromUser,
    displayName: displayName,
    initials: initials,
    avatarColor: avatarColor,
    sessionDisplayName: sessionDisplayName
  };

  global.getDisplayName = getDisplayName;
})(typeof window !== "undefined" ? window : globalThis);
