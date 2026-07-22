/**
 * GoëloRides — affichage utilisateur (pseudo → prénom/nom → initiales).
 * Aucun e-mail ne doit apparaître dans l'UI : pas de fallback sur l'e-mail.
 * Dans les listes de participants : pseudo, sinon initiales (ex. DL), jamais « Utilisateur ».
 */
(function (global) {
  "use strict";

  var FALLBACK = "?";
  var PLACEHOLDER_IDENTITIES = ["utilisateur", "user"];
  var AVATAR_COLORS = ["#7DD3FC", "#C4B5FD", "#FCA5A5", "#FCD34D", "#86EFAC", "#C8F135"];

  function isPlaceholderIdentity(value) {
    var t = String(value == null ? "" : value).trim().toLowerCase();
    return !t || PLACEHOLDER_IDENTITIES.indexOf(t) !== -1;
  }

  function asProfileObject(profiles) {
    if (!profiles) return null;
    if (typeof profiles === "string") {
      var s = profiles.trim();
      return isPlaceholderIdentity(s) ? null : { pseudo: s };
    }
    return profiles;
  }

  function parseNameParts(p) {
    p = asProfileObject(p) || {};
    var first = String(p.first_name || p.firstName || "").trim();
    var last = String(p.last_name || p.lastName || "").trim();
    if (first || last) return { first: first, last: last };

    var full = String(p.username || p.user_name || "").trim();
    if (isPlaceholderIdentity(full)) full = "";
    if (!full) return { first: "", last: "" };

    var parts = full.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { first: parts[0], last: "" };
    return { first: parts[0], last: parts.slice(1).join(" ") };
  }

  function initialsFromNameParts(parts) {
    if (parts.first && parts.last) {
      return (parts.first.charAt(0) + parts.last.charAt(0)).toUpperCase();
    }
    if (parts.first) {
      var w = parts.first;
      return w.length >= 2
        ? w.substring(0, 2).toUpperCase()
        : (w.charAt(0) + w.charAt(0)).toUpperCase();
    }
    return FALLBACK;
  }

  function hasRealPseudo(p) {
    p = asProfileObject(p);
    if (!p) return false;
    var pseudo = String(p.pseudo || "").trim();
    if (!pseudo || isPlaceholderIdentity(pseudo)) return false;
    var username = String(p.username || p.user_name || "").trim();
    if (username && pseudo.toLowerCase() === username.toLowerCase()) return false;
    return true;
  }

  function getParticipantInitials(p) {
    p = asProfileObject(p) || {};
    if (p.initials && String(p.initials).trim()) {
      return String(p.initials).trim().toUpperCase().slice(0, 2);
    }
    /* Priorité avatar : username (ex. "Daniel Le Petit" → "DL") */
    var fromUsername = initialsFromNameParts(parseNameParts({
      username: p.username || p.user_name || ""
    }));
    if (fromUsername && fromUsername !== FALLBACK) return fromUsername;
    if (hasRealPseudo(p)) {
      var ps = String(p.pseudo).trim();
      return ps.length >= 2
        ? ps.substring(0, 2).toUpperCase()
        : (ps.charAt(0) + ps.charAt(0)).toUpperCase();
    }
    return initialsFromNameParts(parseNameParts(p));
  }

  /** Label : pseudo → username → display_name (email prefix côté RPC) → initiales. */
  function getParticipantLabel(p) {
    if (hasRealPseudo(p)) return String(p.pseudo).trim();
    var parts = parseNameParts(p);
    if (parts.first || parts.last) {
      return [parts.first, parts.last].filter(Boolean).join(" ");
    }
    p = asProfileObject(p) || {};
    var dn = p.display_name && String(p.display_name).trim();
    if (dn && !isPlaceholderIdentity(dn) && dn.indexOf("@") === -1) return dn;
    var prefix = p.email_prefix && String(p.email_prefix).trim();
    if (prefix && !isPlaceholderIdentity(prefix)) return prefix;
    return getParticipantInitials(p);
  }

  function getDisplayName(profiles) {
    var p = asProfileObject(profiles);
    if (!p) return FALLBACK;

    if (hasRealPseudo(p)) return String(p.pseudo).trim();

    var parts = parseNameParts(p);
    if (parts.first || parts.last) {
      return [parts.first, parts.last].filter(Boolean).join(" ");
    }

    var userName = p.user_name && String(p.user_name).trim();
    if (userName && !isPlaceholderIdentity(userName)) return userName;

    var username = p.username && String(p.username).trim();
    if (username && !isPlaceholderIdentity(username)) return username;

    var label = getParticipantInitials(p);
    return label === FALLBACK ? FALLBACK : label;
  }

  function profileFromUser(user) {
    if (!user) return null;
    var um = user.user_metadata || {};
    return {
      pseudo: um.pseudo || global.GOELO_DISPLAY_NAME || "",
      user_name: um.user_name || um.name || um.display_name || "",
      username: um.username || um.name || um.display_name || "",
      first_name: um.first_name || um.given_name || "",
      last_name: um.last_name || um.family_name || ""
    };
  }

  function displayName(item) {
    return getDisplayName(item);
  }

  function initials(item) {
    return getParticipantInitials(item);
  }

  function avatarColor(item, i) {
    var name = getParticipantLabel(item);
    var idx = i == null ? 0 : i;
    return AVATAR_COLORS[(name.length + idx) % AVATAR_COLORS.length];
  }

  function sessionDisplayName() {
    if (global.GOELO_USER) {
      return getDisplayName(profileFromUser(global.GOELO_USER));
    }
    if (global.GOELO_DISPLAY_NAME && String(global.GOELO_DISPLAY_NAME).trim()) {
      var pseudo = String(global.GOELO_DISPLAY_NAME).trim();
      return isPlaceholderIdentity(pseudo) ? FALLBACK : pseudo;
    }
    return FALLBACK;
  }

  global.GoeloProfile = {
    FALLBACK: FALLBACK,
    isPlaceholderIdentity: isPlaceholderIdentity,
    hasRealPseudo: hasRealPseudo,
    parseNameParts: parseNameParts,
    getParticipantLabel: getParticipantLabel,
    getParticipantInitials: getParticipantInitials,
    getDisplayName: getDisplayName,
    profileFromUser: profileFromUser,
    displayName: displayName,
    initials: initials,
    avatarColor: avatarColor,
    sessionDisplayName: sessionDisplayName
  };

  global.getDisplayName = getDisplayName;
  global.getParticipantLabel = getParticipantLabel;
})(typeof window !== "undefined" ? window : globalThis);
