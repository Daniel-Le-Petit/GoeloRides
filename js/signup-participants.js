/**
 * GoëloRides — Participants (display_name via RPC signup_list_*)
 */
(function (global) {
  "use strict";

  function profileApi() {
    return global.GoeloProfile || null;
  }

  function routeKey(id) {
    return String(id == null ? "" : id).trim();
  }

  function displayName(p) {
    if (profileApi()) return profileApi().displayName(p);
    if (!p) return "User";
    if (typeof p === "string") return p.trim() || "User";
    var dn = String(p.display_name || "").trim();
    return dn || "User";
  }

  function normalizeParticipant(x) {
    if (x == null) return null;
    if (typeof x === "string") {
      var s = x.trim();
      return s ? { display_name: s } : null;
    }
    if (typeof x === "object") {
      return {
        display_name: displayName(x),
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

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderParticipantRow(p, i, tag) {
    tag = tag || "li";
    var label = displayName(p);
    var color = profileApi() ? profileApi().avatarColor(p, i) : "#7DD3FC";
    var inits = profileApi() ? profileApi().initials(p) : label.slice(0, 2).toUpperCase();
    return (
      "<" + tag + ' class="go-participant-row">' +
      '<span class="go-participant-row__avatar" style="background:' + color + '" title="' +
      escapeHtml(label) + '">' + escapeHtml(inits) + "</span>" +
      '<span class="go-participant-row__name" title="' + escapeHtml(label) + '">' +
      escapeHtml(label) + "</span>" +
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
      var label = displayName(p);
      var color = profileApi() ? profileApi().avatarColor(p, i) : "#7DD3FC";
      var inits = profileApi() ? profileApi().initials(p) : label.slice(0, 2).toUpperCase();
      return (
        '<span class="so-avatar" style="background:' + color + '" title="' +
        escapeHtml(label) + '">' + escapeHtml(inits) + "</span>"
      );
    }).join("");
    var more = items.length - shown.length;
    if (more > 0) {
      html += '<span class="so-avatar" style="background:var(--surface-2,#242424);color:var(--muted,#888);font-size:0.55rem">+' +
        more + "</span>";
    }
    return html;
  }

  async function enrichCardsWithParticipants(items, sb) {
    if (!items || !items.length) return items;
    sb = sb || (global.goeloGetSb ? global.goeloGetSb() : null);
    if (!sb) return items;

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
    renderParticipantRow: renderParticipantRow,
    renderParticipantsListHtml: renderParticipantsListHtml,
    renderParticipantsPreview: renderParticipantsPreview,
    renderAvatarStackHtml: renderAvatarStackHtml,
    emitChanged: emitChanged
  };
})(typeof window !== "undefined" ? window : globalThis);
