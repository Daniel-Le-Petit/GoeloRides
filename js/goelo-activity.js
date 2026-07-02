/**
 * GoëloRides — Activity feed : labels depuis activity_feed_human (Supabase).
 *
 * Le texte affiché vient exclusivement du champ `label` (vue SQL).
 * event_type sert uniquement à l'icône et à la sévérité.
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

  function containsTechnicalRouteId(text) {
    return /c_[0-9a-f]{8,}/i.test(String(text || ""));
  }

  function eventLabel(row) {
    var label = row.label && String(row.label).trim();
    var title = row.route_title && String(row.route_title).trim();
    if (label && containsTechnicalRouteId(label)) {
      if (title && !containsTechnicalRouteId(title)) {
        label = label.replace(/c_[0-9a-f]+/gi, title);
      } else {
        label = label.replace(/\s*c_[0-9a-f]+/gi, " une sortie");
      }
    }
    if (label) return label;
    return actorName(row) + " a effectué une action";
  }

  function labelHtml(label, actorPseudo) {
    var safeLabel = _esc(label);
    var pseudo = actorPseudo && String(actorPseudo).trim();
    if (!pseudo) return safeLabel;
    var idx = label.indexOf(pseudo);
    if (idx === -1) return safeLabel;
    return _esc(label.slice(0, idx))
      + "<strong class=\"act-feed__actor\">" + _esc(pseudo) + "</strong>"
      + _esc(label.slice(idx + pseudo.length));
  }

  function severity(eventType) {
    if (eventType === "ERROR_API" || eventType === "SUSPICIOUS_LOGIN") return "alert";
    if (eventType === "RIDE_LEFT" || eventType === "LIKE_REMOVED") return "muted";
    return "normal";
  }

  function formatEvent(row) {
    if (!row) return null;
    var type = row.event_type || row.type || "UNKNOWN";
    var who = actorName(row);
    var label = eventLabel(row);
    return {
      id: row.id,
      event_type: type,
      icon: ICONS[type] || "•",
      label: label,
      text: label,
      textHtml: labelHtml(label, who),
      severity: severity(type),
      actor_pseudo: who,
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
      var meta = Object.assign({}, metadata || {});
      if (extras.route_id && !meta.route_id) meta.route_id = extras.route_id;
      if (extras.route_title && !meta.route_title) meta.route_title = extras.route_title;
      if (extras.actor_pseudo && !meta.actor_pseudo) meta.actor_pseudo = extras.actor_pseudo;

      var result = await sb.rpc("activity_event_log", {
        p_event_type: eventType,
        p_metadata: meta,
        p_actor_id: extras.actor_id || null,
        p_entity_type: extras.entity_type || (extras.route_id ? "route" : null),
        p_entity_id: extras.entity_id || extras.route_id || null
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
        events: formatEvents(payload.events || []),
        feedMode: (payload.stats && payload.stats.feed_mode) || "activity_feed_human",
        eventTypes: (payload.stats && payload.stats.event_types) || null
      };
    } catch (err) {
      console.warn("[GoeloActivity] fetchDashboard:", err.message || err);
      return { stats: {}, events: [], error: err.message || String(err) };
    }
  }

  global.GoeloActivity = {
    EVENT_TYPES: EVENT_TYPES,
    actorName: actorName,
    eventLabel: eventLabel,
    labelHtml: labelHtml,
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
