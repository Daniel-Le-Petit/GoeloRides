/**
 * GoëloRides — inscrits signups (RPC signup_list_*) + invités guest_participants
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
    var api = profileApi();
    if (api && api.getParticipantLabel) return api.getParticipantLabel(p);
    if (api) return api.getDisplayName(p);
    return "?";
  }

  function normalizeParticipant(x) {
    if (x == null) return null;
    if (typeof x === "string") {
      var s = x.trim();
      if (!s || (profileApi() && profileApi().isPlaceholderIdentity(s))) return null;
      return { pseudo: s };
    }
    if (typeof x === "object") {
      var pseudo = x.pseudo || x.display_name || null;
      if (pseudo && profileApi() && profileApi().isPlaceholderIdentity(pseudo)) pseudo = null;
      var first = x.first_name || x.firstName || null;
      var last = x.last_name || x.lastName || null;
      if (first) first = String(first).trim() || null;
      if (last) last = String(last).trim() || null;
      if (!pseudo && !first && !(x.username || x.user_name)) return null;
      return {
        id: x.id || null,
        pseudo: pseudo,
        username: x.username || x.user_name || null,
        user_name: x.user_name || x.username || null,
        first_name: first,
        last_name: last,
        cyclist_level: x.cyclist_level || null,
        city: x.city || null,
        is_guest: !!(x.is_guest || x.source === "guest"),
        source: x.source || (x.is_guest ? "guest" : "signup")
      };
    }
    return null;
  }

  function normalizeList(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeParticipant).filter(Boolean);
  }

  function mergeParticipants(signups, guests) {
    return normalizeList(signups || []).concat(normalizeList(guests || []));
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

  async function fetchGuestsForRoute(routeId, sb) {
    sb = sb || (global.goeloGetSb ? global.goeloGetSb() : null);
    var key = routeKey(routeId);
    if (!sb || !key) return [];

    var rpc = await sb.rpc("guest_participants_list_for_route", { p_route_id: key });
    if (rpc.error) {
      if (rpc.error.code !== "PGRST202") {
        console.warn("[signup-participants] guest_participants_list_for_route:", rpc.error.message);
      }
      return [];
    }
    var payload = rpc.data || {};
    return normalizeList(payload.participants || []);
  }

  async function fetchForRoute(routeId, sb) {
    sb = sb || (global.goeloGetSb ? global.goeloGetSb() : null);
    var key = routeKey(routeId);
    if (!sb || !key) return { participants: [], count: 0 };

    var signups = [];
    var routeRpc = await sb.rpc("signup_list_for_route", { p_route_id: key });
    if (!routeRpc.error && routeRpc.data) {
      var payload = routeRpc.data;
      signups = normalizeList(payload.participants || payload);
    } else {
      if (routeRpc.error && routeRpc.error.code !== "PGRST202") {
        console.warn("[signup-participants] signup_list_for_route:", routeRpc.error.message);
      }

      var allRpc = await sb.rpc("signup_list_all_names", {});
      if (!allRpc.error && allRpc.data != null) {
        var bucket = bucketFromAllNames(allRpc.data, key);
        if (bucket) signups = normalizeList(bucket.participants);
      } else if (allRpc.error) {
        console.warn("[signup-participants] signup_list_all_names:", allRpc.error.message);
      }
    }

    var guests = await fetchGuestsForRoute(key, sb);
    var participants = mergeParticipants(signups, guests);
    return { participants: participants, count: participants.length };
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
    var ids = Object.keys(data);
    await Promise.all(ids.map(function (id) {
      var bucket = data[id];
      var arr = Array.isArray(bucket) ? bucket : (bucket && bucket.participants) || [];
      var key = routeKey(id);
      return fetchGuestsForRoute(key, sb).then(function (guests) {
        out[key] = mergeParticipants(arr, guests);
      });
    }));
    return out;
  }

  async function addGuestParticipant(routeId, fields, sb) {
    sb = sb || (global.goeloGetSb ? global.goeloGetSb() : null);
    var key = routeKey(routeId);
    fields = fields || {};
    if (!sb || !key) return { ok: false, error: "missing_client" };

    var first = String(fields.first_name || fields.firstName || "").trim();
    var last = String(fields.last_name || fields.lastName || "").trim();
    var phone = String(fields.phone || "").trim();
    if (!first) return { ok: false, error: "first_name_required" };

    var rpc = await sb.rpc("guest_participant_add", {
      p_route_id: key,
      p_first_name: first,
      p_last_name: last || null,
      p_phone: phone || null
    });

    if (rpc.error) {
      console.warn("[signup-participants] guest_participant_add:", rpc.error.message);
      return { ok: false, error: rpc.error.message };
    }

    var payload = rpc.data || {};
    if (payload.ok === false) {
      return { ok: false, error: payload.error || "add_failed" };
    }
    return {
      ok: true,
      participant: normalizeParticipant(payload.participant || null)
    };
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderParticipantRow(p, i, tag) {
    tag = tag || "li";
    var api = profileApi();
    var label = displayName(p);
    var color = api ? api.avatarColor(p, i) : "#7DD3FC";
    var inits = api && api.getParticipantInitials
      ? api.getParticipantInitials(p)
      : (api ? api.initials(p) : label.slice(0, 2).toUpperCase());
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
        '<div class="go-sc-participants go-sc-participants--empty">' +
        '<span class="go-sc-participants__empty">Aucun participant pour l\'instant</span>' +
        "</div>"
      );
    }

    var stack = renderAvatarStackHtml(list, {
      max: opts.max || 3,
      avatarClass: "go-sc-avatar"
    });
    var countLabel = count + " participant" + (count > 1 ? "s" : "");

    return (
      '<div class="go-sc-participants" aria-label="' + escapeHtml(countLabel) + '">' +
      '<div class="go-sc-participants__stack">' + stack + "</div>" +
      '<span class="go-sc-participants__label">' + escapeHtml(countLabel) + "</span>" +
      "</div>"
    );
  }

  function renderAvatarStackHtml(list, opts) {
    opts = opts || {};
    var max = opts.max || 5;
    var avatarClass = opts.avatarClass || "so-avatar";
    var items = normalizeList(list || []);
    if (!items.length) return "";
    var shown = items.slice(0, max);
    var html = shown.map(function (p, i) {
      var label = displayName(p);
      var color = profileApi() ? profileApi().avatarColor(p, i) : "#7DD3FC";
      var inits = profileApi() && profileApi().getParticipantInitials
        ? profileApi().getParticipantInitials(p)
        : (profileApi() ? profileApi().initials(p) : label.slice(0, 2).toUpperCase());
      return (
        '<span class="' + avatarClass + '" style="background:' + color + '" title="' +
        escapeHtml(label) + '">' + escapeHtml(inits) + "</span>"
      );
    }).join("");
    var more = items.length - shown.length;
    if (more > 0) {
      html += '<span class="' + avatarClass + ' ' + avatarClass + '--more">+' + more + "</span>";
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

  function renderRouteParticipantsUi(cfg) {
    cfg = cfg || {};
    var list = normalizeList(cfg.participants || []);
    var count = list.length;
    var avatarMax = cfg.avatarMax || 5;

    var badge = cfg.countEl ? document.getElementById(cfg.countEl) : null;
    if (badge) badge.textContent = count > 0 ? "(" + count + ")" : "";

    var joinCount = cfg.joinCountEl ? document.getElementById(cfg.joinCountEl) : null;
    if (joinCount) {
      joinCount.textContent = count > 0
        ? count + " participant" + (count > 1 ? "s" : "")
        : "";
    }

    var wrap = cfg.heroWrapEl ? document.getElementById(cfg.heroWrapEl) : null;
    var av = cfg.heroAvatarsEl ? document.getElementById(cfg.heroAvatarsEl) : null;
    var text = cfg.heroTextEl ? document.getElementById(cfg.heroTextEl) : null;
    if (wrap && av && text) {
      if (!count) {
        wrap.hidden = true;
      } else {
        wrap.hidden = false;
        av.innerHTML = renderAvatarStackHtml(list, { max: avatarMax });
        var more = count - Math.min(count, avatarMax);
        text.textContent = count + " participant" + (count > 1 ? "s" : "") +
          (more > 0 ? " (+" + more + " autres)" : "");
      }
    }

    var host = cfg.listEl ? document.getElementById(cfg.listEl) : null;
    if (host) {
      host.innerHTML = renderParticipantsListHtml(list, {
        emptyMsg: cfg.emptyMsg || "Aucun participant pour l'instant."
      });
    }

    if (cfg.blockEl) {
      var block = document.getElementById(cfg.blockEl);
      if (block) block.hidden = cfg.hideWhenEmpty === true && !count;
    }

    return count;
  }

  global.GoeloSignupParticipants = {
    routeKey: routeKey,
    displayName: displayName,
    normalizeParticipant: normalizeParticipant,
    normalizeList: normalizeList,
    mergeParticipants: mergeParticipants,
    fetchGuestsForRoute: fetchGuestsForRoute,
    fetchForRoute: fetchForRoute,
    fetchAllByRoute: fetchAllByRoute,
    addGuestParticipant: addGuestParticipant,
    enrichCardsWithParticipants: enrichCardsWithParticipants,
    renderParticipantRow: renderParticipantRow,
    renderParticipantsListHtml: renderParticipantsListHtml,
    renderParticipantsPreview: renderParticipantsPreview,
    renderAvatarStackHtml: renderAvatarStackHtml,
    renderRouteParticipantsUi: renderRouteParticipantsUi,
    emitChanged: emitChanged
  };
})(typeof window !== "undefined" ? window : globalThis);
