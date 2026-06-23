/**
 * GoëloRides — Participants signups (signup_list_for_route / signup_list_all_names)
 */
(function (global) {
  "use strict";

  function routeKey(id) {
    return String(id == null ? "" : id).trim();
  }

  function cleanPseudo(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    if (s.indexOf("@") !== -1) return s.split("@")[0];
    return s;
  }

  /** Pseudo affiché — jamais d'e-mail complet (@ interdit dans le rendu). */
  function displayPseudo(p) {
    if (!p) return "?";
    if (typeof p === "string") return cleanPseudo(p) || "?";
    var pseudo = cleanPseudo(p.pseudo);
    if (pseudo) return pseudo;
    var email = String(p.email || "").trim();
    if (email && email.indexOf("@") !== -1) return email.split("@")[0];
    return "?";
  }

  /** @deprecated utiliser displayPseudo */
  function displayName(p) {
    return displayPseudo(p);
  }

  function normalizeParticipant(x) {
    if (x == null) return null;
    if (typeof x === "string") {
      var s = cleanPseudo(x);
      return s ? { pseudo: s } : null;
    }
    if (typeof x === "object") {
      var pseudo = displayPseudo(x);
      return {
        pseudo: pseudo,
        cyclist_level: x.cyclist_level || null,
        city: x.city || null
      };
    }
    return null;
  }

  function normalizeList(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeParticipant).filter(Boolean);
  }

  function bucketFromAllNames(data, routeId) {
    if (!data || typeof data !== "object") return null;
    if (Array.isArray(data) && data.length) data = data[0];
    var key = routeKey(routeId);
    var bucket = data[key] || data[routeId];
    if (!bucket) return null;
    if (Array.isArray(bucket)) return { participants: bucket, count: bucket.length };
    return {
      participants: bucket.participants || [],
      waitlist: bucket.waitlist || [],
      count: Array.isArray(bucket.participants) ? bucket.participants.length : 0
    };
  }

  async function fetchForRoute(routeId, sb) {
    sb = sb || (global.goeloGetSb ? global.goeloGetSb() : null);
    var key = routeKey(routeId);
    if (!sb || !key) return { participants: [], count: 0 };

    var routeRpc = await sb.rpc("signup_list_for_route", { p_route_id: key });
    if (!routeRpc.error && routeRpc.data) {
      var payload = routeRpc.data;
      var list = normalizeList(payload.participants || payload);
      var count = typeof payload.count === "number" ? payload.count : list.length;
      return { participants: list, count: count };
    }

    if (routeRpc.error && routeRpc.error.code !== "PGRST202") {
      console.warn("[signup-participants] signup_list_for_route:", routeRpc.error.message);
    }

    var allRpc = await sb.rpc("signup_list_all_names", {});
    if (allRpc.error || allRpc.data == null) {
      console.warn("[signup-participants] signup_list_all_names:", allRpc.error && allRpc.error.message);
      return { participants: [], count: 0 };
    }

    var bucket = bucketFromAllNames(allRpc.data, key);
    if (!bucket) return { participants: [], count: 0 };
    var participants = normalizeList(bucket.participants);
    return {
      participants: participants,
      count: typeof bucket.count === "number" ? bucket.count : participants.length
    };
  }

  async function fetchAllByRoute(sb) {
    sb = sb || (global.goeloGetSb ? global.goeloGetSb() : null);
    if (!sb) return {};

    var allRpc = await sb.rpc("signup_list_all_names", {});
    if (allRpc.error || allRpc.data == null) {
      console.warn("[signup-participants] signup_list_all_names:", allRpc.error && allRpc.error.message);
      return {};
    }

    var data = allRpc.data;
    if (Array.isArray(data) && data.length) data = data[0];
    if (!data || typeof data !== "object") return {};

    var out = {};
    Object.keys(data).forEach(function (id) {
      var bucket = data[id];
      var arr = Array.isArray(bucket) ? bucket : (bucket && bucket.participants) || [];
      out[routeKey(id)] = normalizeList(arr);
    });
    return out;
  }

  var AVATAR_COLORS = ["#7DD3FC", "#C4B5FD", "#FCA5A5", "#FCD34D", "#86EFAC", "#C8F135"];

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function initialsFromName(name) {
    return String(name || "?").split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase();
  }

  function avatarColorFor(p, i) {
    var pseudo = displayPseudo(p);
    return AVATAR_COLORS[(pseudo.length + i) % AVATAR_COLORS.length];
  }

  function renderParticipantRow(p, i, tag) {
    tag = tag || "li";
    var pseudo = displayPseudo(p);
    var color = avatarColorFor(p, i);
    return (
      "<" + tag + ' class="go-participant-row">' +
      '<span class="go-participant-row__avatar" style="background:' + color + '" title="' +
      escapeHtml(pseudo) + '">' + escapeHtml(initialsFromName(pseudo)) + "</span>" +
      '<span class="go-participant-row__pseudo" title="' + escapeHtml(pseudo) + '">' +
      escapeHtml(pseudo) + "</span>" +
      "</" + tag + ">"
    );
  }

  function renderParticipantsListHtml(list, opts) {
    opts = opts || {};
    var items = normalizeList(list || []);
    if (!items.length) {
      return '<li class="pd-participants__empty">' +
        escapeHtml(opts.emptyMsg || "Aucun participant pour l'instant.") + "</li>";
    }
    return items.map(function (p, i) {
      return renderParticipantRow(p, i, "li");
    }).join("");
  }

  /**
   * Aperçu participants pour cartes (sorties.html + team-rider.html).
   * Liste complète scrollable (max-height CSS).
   */
  function renderParticipantsPreview(participants, opts) {
    opts = opts || {};
    var list = normalizeList(participants || []);
    var count = list.length;

    if (!count) {
      return (
        '<div class="go-participants-preview go-participants-preview--empty">' +
        '<span class="go-participants-preview__empty">Aucun participant pour l\'instant</span>' +
        "</div>"
      );
    }

    var rows = list.map(function (p, i) {
      return renderParticipantRow(p, i, "li");
    }).join("");

    var countLabel = count + " participant" + (count > 1 ? "s" : "");

    return (
      '<div class="go-participants-preview" aria-label="' + escapeHtml(countLabel) + '">' +
      '<p class="go-participants-preview__count">' + escapeHtml(countLabel) + "</p>" +
      '<ul class="go-participants-preview__list">' + rows + "</ul>" +
      "</div>"
    );
  }

  function renderAvatarStackHtml(list, opts) {
    opts = opts || {};
    var max = opts.max || 5;
    var items = normalizeList(list || []);
    if (!items.length) return "";
    var shown = items.slice(0, max);
    var html = shown.map(function (p, i) {
      var pseudo = displayPseudo(p);
      var color = avatarColorFor(p, i);
      return (
        '<span class="so-avatar" style="background:' + color + '" title="' +
        escapeHtml(pseudo) + '">' + escapeHtml(initialsFromName(pseudo)) + "</span>"
      );
    }).join("");
    var more = items.length - shown.length;
    if (more > 0) {
      html += '<span class="so-avatar" style="background:var(--surface-2,#242424);color:var(--muted,#888);font-size:0.55rem">+' +
        more + "</span>";
    }
    return html;
  }

  /** Associe les participants Supabase (signups actifs) à chaque carte/route. */
  async function enrichCardsWithParticipants(items, sb) {
    if (!items || !items.length) return items;
    sb = sb || (global.goeloGetSb ? global.goeloGetSb() : null);
    if (!sb) return items;

    /* Même source que parcours.js : fetchForRoute (signup_list_for_route + fallback). */
    await Promise.all(items.map(function (item) {
      return fetchForRoute(item.id, sb).then(function (r) {
        item.participants = (r && r.participants) ? r.participants : [];
      });
    }));

    return items;
  }

  function emitChanged(routeId, count) {
    global.dispatchEvent(new CustomEvent("goelo:signup-changed", {
      detail: { routeId: routeKey(routeId), count: count }
    }));
  }

  global.GoeloSignupParticipants = {
    routeKey: routeKey,
    displayPseudo: displayPseudo,
    displayName: displayName,
    normalizeParticipant: normalizeParticipant,
    normalizeList: normalizeList,
    fetchForRoute: fetchForRoute,
    fetchAllByRoute: fetchAllByRoute,
    enrichCardsWithParticipants: enrichCardsWithParticipants,
    renderParticipantRow: renderParticipantRow,
    renderParticipantsListHtml: renderParticipantsListHtml,
    renderParticipantsPreview: renderParticipantsPreview,
    renderAvatarStackHtml: renderAvatarStackHtml,
    emitChanged: emitChanged
  };
})(typeof window !== "undefined" ? window : globalThis);
