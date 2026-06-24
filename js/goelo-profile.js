/**
 * GoëloRides — identité affichée (display_name uniquement, résolu côté Supabase).
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
    var dn = String(item.display_name || "").trim();
    return dn || FALLBACK;
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
    var dn = global.GOELO_DISPLAY_NAME;
    if (dn && String(dn).trim()) return String(dn).trim();
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
