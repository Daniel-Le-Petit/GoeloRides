/**
 * GoëloRides — Activity events : formatage humain + enrichissement metadata.
 * UI-agnostic : consommable par admin, logs, futures vues sans refonte.
 */
(function (global) {
  "use strict";

  var EVENT_TYPES = {
    USER_REGISTERED: "USER_REGISTERED",
    USER_LOGIN: "USER_LOGIN",
    RIDE_CREATED: "RIDE_CREATED",
    RIDE_JOINED: "RIDE_JOINED",
    RIDE_LEFT: "RIDE_LEFT",
    RIDE_VIEWED: "RIDE_VIEWED",
    COMMENT_CREATED: "COMMENT_CREATED",
    LIKE_ADDED: "LIKE_ADDED",
    LIKE_REMOVED: "LIKE_REMOVED",
    ERROR_API: "ERROR_API",
    SUSPICIOUS_LOGIN: "SUSPICIOUS_LOGIN"
  };

  var ICONS = {
    USER_REGISTERED: "👤",
    USER_LOGIN: "🔑",
    RIDE_CREATED: "🚴",
    RIDE_JOINED: "✅",
    RIDE_LEFT: "↩",
    RIDE_VIEWED: "👁",
    COMMENT_CREATED: "💬",
    LIKE_ADDED: "♥",
    LIKE_REMOVED: "♡",
    ERROR_API: "⚠",
    SUSPICIOUS_LOGIN: "🛡"
  };

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function actorName(row) {
    var m = row.metadata || {};
    return (row.actor_pseudo && String(row.actor_pseudo).trim())
      || (m.pseudo && String(m.pseudo).trim())
      || (m.actor && String(m.actor).trim())
      || "Quelqu'un";
  }

  function rideTitle(row) {
    var m = row.metadata || {};
    return (row.route_title && String(row.route_title).trim())
      || (m.title && String(m.title).trim())
      || (row.route_id && String(row.route_id))
      || "une sortie";
  }

  function enrichMetadata(eventType, metadata, row) {
    var m = Object.assign({}, metadata || {});
    row = row || {};

    if (row.route_id && !m.route_id) m.route_id = row.route_id;
    if (row.route_title && !m.route_title) m.route_title = row.route_title;
    if (row.actor_pseudo && !m.actor_pseudo) m.actor_pseudo = row.actor_pseudo;

    if (eventType === "RIDE_CREATED" && m.km != null && m.km !== "") {
      m.distance_label = String(m.km) + " km";
    }
    if (eventType === "COMMENT_CREATED" && m.preview && !m.excerpt) {
      m.excerpt = String(m.preview);
    }
    if (eventType === "SUSPICIOUS_LOGIN" && m.ip && !m.location_hint) {
      m.location_hint = String(m.ip);
    }
    if (eventType === "ERROR_API" && m.endpoint && !m.source) {
      m.source = String(m.endpoint);
    }

    return m;
  }

  function humanText(eventType, row) {
    var m = enrichMetadata(eventType, row.metadata || {}, row);
    var who = actorName(row);
    var ride = rideTitle(row);

    switch (eventType) {
      case EVENT_TYPES.USER_REGISTERED:
        return who + " a créé un compte";
      case EVENT_TYPES.USER_LOGIN:
        return who + " s'est connecté";
      case EVENT_TYPES.RIDE_CREATED:
        return who + " a créé la sortie « " + ride + " »"
          + (m.distance_label ? " (" + m.distance_label + ")" : "");
      case EVENT_TYPES.RIDE_JOINED:
        return who + " s'est inscrit·e à « " + ride + " »";
      case EVENT_TYPES.RIDE_LEFT:
        return who + " s'est désinscrit·e de « " + ride + " »";
      case EVENT_TYPES.RIDE_VIEWED:
        return who + " a consulté « " + ride + " »";
      case EVENT_TYPES.COMMENT_CREATED:
        return who + " a commenté sur « " + ride + " »"
          + (m.excerpt ? " : « " + m.excerpt + " »" : "");
      case EVENT_TYPES.LIKE_ADDED:
        return who + " a aimé « " + ride + " »";
      case EVENT_TYPES.LIKE_REMOVED:
        return who + " a retiré son like sur « " + ride + " »";
      case EVENT_TYPES.ERROR_API:
        return "Erreur API"
          + (m.source ? " (" + m.source + ")" : "")
          + (m.message ? " : " + m.message : "");
      case EVENT_TYPES.SUSPICIOUS_LOGIN:
        return "Connexion suspecte"
          + (m.location_hint ? " depuis " + m.location_hint : "")
          + (who !== "Quelqu'un" ? " — " + who : "");
      default:
        return eventType + (who !== "Quelqu'un" ? " — " + who : "");
    }
  }

  function severity(eventType) {
    if (eventType === "ERROR_API" || eventType === "SUSPICIOUS_LOGIN") return "alert";
    if (eventType === "RIDE_LEFT" || eventType === "LIKE_REMOVED") return "muted";
    return "normal";
  }

  function formatEvent(row) {
    if (!row) return null;
    var type = row.event_type || row.type || "UNKNOWN";
    var meta = enrichMetadata(type, row.metadata || {}, row);
    return {
      id: row.id,
      event_type: type,
      icon: ICONS[type] || "•",
      text: humanText(type, row),
      severity: severity(type),
      actor_pseudo: actorName(row),
      route_id: row.route_id || null,
      route_title: row.route_title || null,
      metadata: meta,
      created_at: row.created_at
    };
  }

  function formatEvents(rows) {
    return (rows || []).map(formatEvent).filter(Boolean);
  }

  function fmtTime(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      var pad = function (n) { return String(n).padStart(2, "0"); };
      return pad(d.getHours()) + ":" + pad(d.getMinutes());
    } catch (e) {
      return "—";
    }
  }

  function fmtDayLabel(iso) {
    if (!iso) return "Activité";
    try {
      var d = new Date(iso);
      var now = new Date();
      var sameDay = d.toDateString() === now.toDateString();
      var yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (sameDay) return "Aujourd'hui";
      if (d.toDateString() === yesterday.toDateString()) return "Hier";
      var days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
      var months = ["janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
      return days[d.getDay()] + " " + d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
    } catch (e2) {
      return "Activité";
    }
  }

  function groupByDay(events) {
    var groups = [];
    var map = {};
    events.forEach(function (ev) {
      var key = ev.created_at ? new Date(ev.created_at).toDateString() : "unknown";
      if (!map[key]) {
        map[key] = { label: fmtDayLabel(ev.created_at), items: [] };
        groups.push(map[key]);
      }
      map[key].items.push(ev);
    });
    return groups;
  }

  async function logEvent(sb, eventType, metadata, extras) {
    if (!sb || !eventType) return null;
    extras = extras || {};
    try {
      var result = await sb.rpc("activity_event_log", {
        p_event_type: eventType,
        p_metadata: metadata || {},
        p_route_id: extras.route_id || null,
        p_route_title: extras.route_title || null,
        p_actor_pseudo: extras.actor_pseudo || null
      });
      if (result.error) throw result.error;
      return result.data;
    } catch (err) {
      console.warn("[GoeloActivity] log:", err.message || err);
      return null;
    }
  }

  async function fetchDashboard(sb, limit) {
    if (!sb) return { stats: {}, events: [] };
    try {
      var result = await sb.rpc("activity_admin_dashboard", {
        p_limit: limit || 60
      });
      if (result.error) throw result.error;
      var payload = result.data || {};
      return {
        stats: payload.stats || {},
        events: formatEvents(payload.events || [])
      };
    } catch (err) {
      console.warn("[GoeloActivity] fetchDashboard:", err.message || err);
      return { stats: {}, events: [], error: err.message || String(err) };
    }
  }

  global.GoeloActivity = {
    EVENT_TYPES: EVENT_TYPES,
    enrichMetadata: enrichMetadata,
    humanText: humanText,
    formatEvent: formatEvent,
    formatEvents: formatEvents,
    groupByDay: groupByDay,
    fmtTime: fmtTime,
    fmtDayLabel: fmtDayLabel,
    logEvent: logEvent,
    fetchDashboard: fetchDashboard,
    _esc: _esc
  };
})(typeof window !== "undefined" ? window : globalThis);
