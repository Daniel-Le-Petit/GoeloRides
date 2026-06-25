/**
 * GoëloRides — affichage utilisateur via pseudo (schéma signups / profiles actuel).
 */
(function (global) {
  "use strict";

  var FALLBACK = "User";
  var AVATAR_COLORS = ["#7DD3FC", "#C4B5FD", "#FCA5A5", "#FCD34D", "#86EFAC", "#C8F135"];

  function displayName(item) {
    if (!item) return FALLBACK;
    if (typeof item === "string") {
      var s = item.trim();
      return s || FALLBACK;
    }
    var pseudo = String(item.pseudo || "").trim();
    return pseudo || FALLBACK;
  }

  function initials(item) {
    return displayName(item).slice(0, 2).toUpperCase();
  }

  function avatarColor(item, i) {
    var name = displayName(item);
    var idx = i == null ? 0 : i;
    return AVATAR_COLORS[(name.length + idx) % AVATAR_COLORS.length];
  }

  function sessionDisplayName() {
    var p = global.GOELO_DISPLAY_NAME;
    if (p && String(p).trim()) return String(p).trim();
    return FALLBACK;
  }

  global.GoeloProfile = {
    FALLBACK: FALLBACK,
    displayName: displayName,
    initials: initials,
    avatarColor: avatarColor,
    sessionDisplayName: sessionDisplayName
  };
})(typeof window !== "undefined" ? window : globalThis);
