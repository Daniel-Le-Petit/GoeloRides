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
    SUSPICIOUS_LOGIN: "SUSPICIOUS_LOGIN",
    PAGE_HOME_VIEWED: "PAGE_HOME_VIEWED",
    HOME_SCROLL_DEPTH: "HOME_SCROLL_DEPTH",
    HOME_FOOTER_VIEWED: "HOME_FOOTER_VIEWED",
    UPCOMING_RIDE_CARD_CLICKED: "UPCOMING_RIDE_CARD_CLICKED",
    UPCOMING_RIDE_VIEW_CLICKED: "UPCOMING_RIDE_VIEW_CLICKED",
    UPCOMING_RIDE_JOIN_CLICKED: "UPCOMING_RIDE_JOIN_CLICKED",
    TEAM_RIDER_JOIN_CLICKED: "TEAM_RIDER_JOIN_CLICKED",
    PAGE_SORTIES_VIEWED: "PAGE_SORTIES_VIEWED",
    SORTIES_SCROLL_DEPTH: "SORTIES_SCROLL_DEPTH",
    SORTIES_FOOTER_VIEWED: "SORTIES_FOOTER_VIEWED",
    RIDE_PARTICIPATE_CLICKED: "RIDE_PARTICIPATE_CLICKED",
    PAGE_PARCOURS_VIEWED: "PAGE_PARCOURS_VIEWED",
    NAVIGATE_TO_SORTIES_CLICKED: "NAVIGATE_TO_SORTIES_CLICKED",
    RIDE_INFO_OPENED: "RIDE_INFO_OPENED"
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
    SUSPICIOUS_LOGIN: "🛡",
    PAGE_HOME_VIEWED: "🏠",
    HOME_SCROLL_DEPTH: "📜",
    HOME_FOOTER_VIEWED: "⬇",
    UPCOMING_RIDE_CARD_CLICKED: "🚴",
    UPCOMING_RIDE_VIEW_CLICKED: "👁",
    UPCOMING_RIDE_JOIN_CLICKED: "✅",
    TEAM_RIDER_JOIN_CLICKED: "🚴",
    PAGE_SORTIES_VIEWED: "📋",
    SORTIES_SCROLL_DEPTH: "📜",
    SORTIES_FOOTER_VIEWED: "⬇",
    RIDE_PARTICIPATE_CLICKED: "🙋",
    RIDE_INFO_OPENED: "ℹ"
  };

  var SCROLL_DEPTHS = [25, 50, 75, 100];

  function getVisitorSessionId() {
    var key = "visitor_session_id";
    var existing = localStorage.getItem(key);

    if (existing) return existing;

    var id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  }

  function detectCurrentPage() {
    var path = String(global.location && global.location.pathname || "").toLowerCase();
    var file = path.split("/").pop() || "index.html";
    if (!file || file === "/" || file === "index.html") return "home";
    if (file === "sorties.html") return "sorties";
    if (file === "parcours.html") return "parcours";
    if (file === "groupes.html") return "groupes";
    if (file === "infos-pratiques.html") return "infos";
    if (file === "admin.html") return "admin";
    return file.replace(/\.html$/i, "") || "unknown";
  }

  function enrichSessionMetadata(metadata) {
    var meta = Object.assign({}, metadata || {});
    if (!meta.page) meta.page = detectCurrentPage();
    if (meta.referrer === undefined) {
      meta.referrer = (global.document && global.document.referrer) ? global.document.referrer : "";
    }
    if (!meta.user_agent) {
      meta.user_agent = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : "";
    }
    return meta;
  }

  function visitorSessionShortId(sessionId) {
    if (!sessionId) return "—";
    return String(sessionId).replace(/-/g, "").slice(0, 8).toUpperCase();
  }

  function visitorJourneyLine(ev) {
    if (!ev) return "";
    var type = ev.event_type || "UNKNOWN";
    var meta = ev.metadata || {};
    if (/_SCROLL_DEPTH$/.test(type) && meta.depth != null) {
      return type + " " + meta.depth + "%";
    }
    if (type === "RIDE_INFO_OPENED" && meta.section) {
      return type + " " + meta.section;
    }
    return type;
  }

  function groupByVisitorSession(events) {
    var map = {};
    var order = [];
    (events || []).forEach(function (ev) {
      var sid = ev.visitor_session_id || "";
      if (!map[sid]) {
        map[sid] = [];
        order.push(sid);
      }
      map[sid].push(ev);
    });
    return order.map(function (sid) {
      var items = map[sid].slice().sort(function (a, b) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      return {
        visitor_session_id: sid || null,
        shortId: visitorSessionShortId(sid),
        items: items
      };
    }).sort(function (a, b) {
      var ta = a.items.length
        ? new Date(a.items[a.items.length - 1].created_at).getTime()
        : 0;
      var tb = b.items.length
        ? new Date(b.items[b.items.length - 1].created_at).getTime()
        : 0;
      return tb - ta;
    });
  }

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
    var meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    return {
      id: row.id,
      event_type: type,
      icon: ICONS[type] || "•",
      label: label,
      text: label,
      textHtml: labelHtml(label, who),
      severity: severity(type),
      actor_pseudo: who,
      created_at: row.created_at,
      metadata: meta,
      visitor_session_id: meta.visitor_session_id || row.visitor_session_id || null,
      route_title: row.route_title || meta.route_title || null
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

  function resolveSb() {
    if (typeof global.goeloGetSb === "function") {
      var fromAuth = global.goeloGetSb();
      if (fromAuth) return fromAuth;
    }
    if (global._goeloSbClient) return global._goeloSbClient;
    if (global.supabaseClient) return global.supabaseClient;
    return null;
  }

  function _clientLabel(sb) {
    if (!sb) return "null";
    if (sb === global._goeloSbClient) return "_goeloSbClient";
    if (sb === global.supabaseClient) return "supabaseClient";
    return "unknown";
  }

  function _debugLog(msg, detail) {
    if (global.GOELO_DEBUG !== true) return;
    if (detail !== undefined) console.debug("[GoeloActivity]", msg, detail);
    else console.debug("[GoeloActivity]", msg);
  }

  function observeFooterOnce(sb, footerEl, eventType) {
    if (!footerEl || !eventType) return;
    if (footerEl.dataset.goeloFooterTracked === "1") return;
    if (typeof IntersectionObserver === "undefined") return;

    var fired = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || fired) return;
        fired = true;
        footerEl.dataset.goeloFooterTracked = "1";
        logEvent(sb, eventType, {});
        io.disconnect();
      });
    }, { threshold: 0.05 });
    io.observe(footerEl);
  }

  function trackScrollDepth(sb, eventType, pageName, depths) {
    if (!eventType || !pageName) return { refresh: function () {} };
    depths = depths || SCROLL_DEPTHS;

    var fired = {};
    var markers = [];
    var observer = null;

    function cleanup() {
      markers.forEach(function (m) {
        if (m.parentNode) m.parentNode.removeChild(m);
      });
      markers = [];
      if (observer) observer.disconnect();
      observer = null;
    }

    function refresh() {
      cleanup();
      if (typeof IntersectionObserver === "undefined") return;

      var scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      var viewport = window.innerHeight || document.documentElement.clientHeight;

      if (scrollHeight <= viewport + 2) {
        if (!fired[100]) {
          fired[100] = true;
          logEvent(sb, eventType, { page: pageName, depth: 100 });
        }
        return;
      }

      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var d = parseInt(entry.target.getAttribute("data-depth"), 10);
          if (!d || fired[d]) return;
          fired[d] = true;
          logEvent(sb, eventType, { page: pageName, depth: d });
          observer.unobserve(entry.target);
        });
      }, { root: null, threshold: 0 });

      depths.forEach(function (depth) {
        if (fired[depth]) return;
        var marker = document.createElement("div");
        marker.setAttribute("data-depth", String(depth));
        marker.setAttribute("aria-hidden", "true");
        marker.style.cssText =
          "position:absolute;width:1px;height:1px;pointer-events:none;visibility:hidden;left:0;";
        marker.style.top = Math.max(0, (scrollHeight - viewport) * depth / 100) + "px";
        document.body.appendChild(marker);
        markers.push(marker);
        observer.observe(marker);
      });
    }

    refresh();
    return { refresh: refresh };
  }

  async function logEvent(sb, eventType, metadata, extras) {
    sb = sb || resolveSb();
    if (!eventType) return null;
    if (!sb) {
      _debugLog("logEvent ignoré — client Supabase indisponible", {
        eventType: eventType,
        hasGoeloGetSb: typeof global.goeloGetSb === "function",
        hasSupabaseClient: !!global.supabaseClient,
        hasGoeloSbClient: !!global._goeloSbClient
      });
      return null;
    }

    extras = extras || {};
    var payload = {
      p_event_type: eventType,
      p_metadata: null,
      p_actor_id: extras.actor_id || null,
      p_entity_type: extras.entity_type || (extras.route_id ? "route" : null),
      p_entity_id: extras.entity_id || extras.route_id || null
    };

    try {
      var meta = Object.assign({}, metadata || {});
      try {
        meta.visitor_session_id = getVisitorSessionId();
      } catch (e) { void e; }
      meta = enrichSessionMetadata(meta);
      if (extras.route_id && !meta.route_id) meta.route_id = extras.route_id;
      if (extras.route_title && !meta.route_title) meta.route_title = extras.route_title;
      if (extras.actor_pseudo && !meta.actor_pseudo) meta.actor_pseudo = extras.actor_pseudo;
      payload.p_metadata = meta;

      _debugLog("activity_event_log →", {
        client: _clientLabel(sb),
        eventType: eventType,
        metadata: meta
      });

      var result = await sb.rpc("activity_event_log", payload);

      _debugLog("activity_event_log ←", {
        eventType: eventType,
        data: result.data,
        error: result.error
      });

      if (result.error) throw result.error;
      return result.data;
    } catch (err) {
      console.warn("[GoeloActivity] log:", eventType, err.message || err, {
        client: _clientLabel(sb),
        code: err.code,
        details: err.details,
        hint: err.hint
      });
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
    SCROLL_DEPTHS: SCROLL_DEPTHS,
    actorName: actorName,
    eventLabel: eventLabel,
    labelHtml: labelHtml,
    formatEvent: formatEvent,
    formatEvents: formatEvents,
    groupByDay: groupByDay,
    groupByVisitorSession: groupByVisitorSession,
    visitorSessionShortId: visitorSessionShortId,
    visitorJourneyLine: visitorJourneyLine,
    getVisitorSessionId: getVisitorSessionId,
    detectCurrentPage: detectCurrentPage,
    fmtTime: fmtTime,
    fmtDayLabel: fmtDayLabel,
    logEvent: logEvent,
    resolveSb: resolveSb,
    observeFooterOnce: observeFooterOnce,
    trackScrollDepth: trackScrollDepth,
    fetchDashboard: fetchDashboard,
    _esc: _esc
  };
})(typeof window !== "undefined" ? window : globalThis);
