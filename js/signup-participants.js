/**
 * GoëloRides — Participants signups (signup_list_for_route / signup_list_all_names)
 */
(function (global) {
  "use strict";

  function routeKey(id) {
    return String(id == null ? "" : id).trim();
  }

  function displayName(p) {
    if (!p) return "?";
    if (typeof p === "string") return p.trim() || "?";
    var pseudo = (p.pseudo || "").trim();
    if (pseudo) return pseudo;
    var email = (p.email || "").trim();
    if (email) return email.split("@")[0];
    return "?";
  }

  function normalizeParticipant(x) {
    if (x == null) return null;
    if (typeof x === "string") {
      var s = x.trim();
      return s ? { pseudo: s } : null;
    }
    if (typeof x === "object") {
      var pseudo = displayName(x);
      return {
        pseudo: pseudo,
        email: x.email || "",
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

  /**
   * Aperçu participants pour cartes sorties (sorties.html + team-rider.html).
   * @param {Array} participants — objets { pseudo, email } ou strings
   * @param {object} opts — maxAvatars (5), maxNames (4)
   */
  function renderParticipantsPreview(participants, opts) {
    opts = opts || {};
    var maxAvatars = opts.maxAvatars || 5;
    var maxNames = opts.maxNames || 4;
    var list = normalizeList(participants || []);
    var count = list.length;

    if (!count) {
      return (
        '<div class="go-participants-preview go-participants-preview--empty">' +
        '<span class="go-participants-preview__empty">Aucun participant pour l\'instant</span>' +
        "</div>"
      );
    }

    var shownAv = list.slice(0, maxAvatars);
    var avatarsHtml = shownAv.map(function (p, i) {
      var name = displayName(p);
      var color = AVATAR_COLORS[(name.length + i) % AVATAR_COLORS.length];
      return (
        '<span class="go-participants-preview__avatar" style="background:' + color + '" title="' +
        escapeHtml(name) + '">' + escapeHtml(initialsFromName(name)) + "</span>"
      );
    }).join("");

    var hiddenAv = count - shownAv.length;
    if (hiddenAv > 0) {
      avatarsHtml += '<span class="go-participants-preview__avatar go-participants-preview__avatar--more">+' +
        hiddenAv + "</span>";
    }

    var names = list.slice(0, maxNames).map(displayName);
    var hiddenNames = count - names.length;
    var namesHtml = escapeHtml(names.join(" · "));
    if (hiddenNames > 0) {
      namesHtml += ' <span class="go-participants-preview__more-label">+' + hiddenNames +
        " participant" + (hiddenNames > 1 ? "s" : "") + "</span>";
    }

    var countLabel = count + " participant" + (count > 1 ? "s" : "");

    return (
      '<div class="go-participants-preview" aria-label="' + escapeHtml(countLabel) + '">' +
      '<p class="go-participants-preview__count">' + escapeHtml(countLabel) + "</p>" +
      '<div class="go-participants-preview__avatars">' + avatarsHtml + "</div>" +
      '<p class="go-participants-preview__names">' + namesHtml + "</p>" +
      "</div>"
    );
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
    displayName: displayName,
    normalizeParticipant: normalizeParticipant,
    normalizeList: normalizeList,
    fetchForRoute: fetchForRoute,
    fetchAllByRoute: fetchAllByRoute,
    enrichCardsWithParticipants: enrichCardsWithParticipants,
    renderParticipantsPreview: renderParticipantsPreview,
    emitChanged: emitChanged
  };
})(typeof window !== "undefined" ? window : globalThis);
