/**
 * GoëloRides — Activity dashboard (admin.html patch, sans refonte UI).
 */
(function () {
  "use strict";

  var _tickerTimer = null;
  var _tickerPaused = false;
  var _lastEvents = [];
  var _groupByVisitor = false;

  function _$(id) { return document.getElementById(id); }

  function renderStats(stats) {
    stats = stats || {};
    function set(id, val, subId, subVal) {
      var el = _$(id);
      if (el) el.textContent = val != null ? val : "—";
      if (subId) {
        var sub = _$(subId);
        if (sub) sub.textContent = subVal || "";
      }
    }
    set("act-stat-rides", stats.rides_active, "act-stat-rides-sub",
      stats.rides_created_today ? "+" + stats.rides_created_today + " créées aujourd'hui" : "");
    set("act-stat-cyclists", stats.cyclists_registered, "act-stat-cyclists-sub",
      stats.cyclists_new_today ? "dont " + stats.cyclists_new_today + " nouvelles" : "");
    set("act-stat-live", stats.events_today, "act-stat-live-sub", "événements aujourd'hui");
    var alerts = (stats.alerts || 0) + (stats.pending_demands || 0);
    set("act-stat-alerts", alerts, "act-stat-alerts-sub",
      alerts ? "à vérifier" : "rien à signaler");
  }

  function feedItemHtml(ev) {
    var GA = window.GoeloActivity;
    var esc = GA ? GA._esc : function (s) { return s; };
    var cls = "act-feed__item" + (ev.severity === "alert" ? " act-feed__item--alert" : "");
    var verifyBtn = ev.severity === "alert"
      ? "<button type=\"button\" class=\"act-feed__verify\" data-act-verify=\"" + esc(ev.id) + "\">Vérifier</button>"
      : "";
    return "<li class=\"" + cls + "\">" +
      "<span class=\"act-feed__time\">" + esc(GA ? GA.fmtTime(ev.created_at) : "") + "</span>" +
      "<span class=\"act-feed__icon\" aria-hidden=\"true\">" + esc(ev.icon) + "</span>" +
      "<span class=\"act-feed__text\">" + (ev.textHtml || esc(ev.label || ev.text)) + "</span>" +
      verifyBtn +
      "</li>";
  }

  function visitorJourneyItemHtml(ev) {
    var GA = window.GoeloActivity;
    var esc = GA ? GA._esc : function (s) { return s; };
    return "<li class=\"act-visitor-journey__item\">" +
      "<span class=\"act-visitor-journey__time\">" + esc(GA ? GA.fmtTime(ev.created_at) : "") + "</span>" +
      "<span class=\"act-visitor-journey__type\">" + esc(GA ? GA.visitorJourneyLine(ev) : ev.event_type) + "</span>" +
      "</li>";
  }

  function renderFeedByVisitor(events) {
    var host = _$("act-feed-list");
    if (!host || !window.GoeloActivity) return;
    _lastEvents = events || [];
    if (!_lastEvents.length) {
      host.innerHTML = "<p class=\"gtr-empty\">Aucune activité récente.</p>";
      renderTicker([]);
      return;
    }

    var groups = window.GoeloActivity.groupByVisitorSession(_lastEvents);
    var withSession = groups.filter(function (g) { return !!g.visitor_session_id; });
    var withoutSession = groups.filter(function (g) { return !g.visitor_session_id; });

    host.innerHTML = withSession.map(function (g) {
      return "<section class=\"act-visitor-group\">" +
        "<h3 class=\"act-visitor-group__title\">Visiteur " + window.GoeloActivity._esc(g.shortId) + "</h3>" +
        "<ul class=\"act-visitor-journey\">" + g.items.map(visitorJourneyItemHtml).join("") + "</ul>" +
        "</section>";
    }).join("") + (withoutSession.length
      ? withoutSession.map(function (g) {
        return "<section class=\"act-visitor-group act-visitor-group--orphan\">" +
          "<h3 class=\"act-visitor-group__title\">Sans session visiteur</h3>" +
          "<ul class=\"act-visitor-journey\">" + g.items.map(visitorJourneyItemHtml).join("") + "</ul>" +
          "</section>";
      }).join("")
      : "");

    renderTicker(_lastEvents.slice(0, 8));
  }

  function renderFeed(events) {
    if (_groupByVisitor) {
      renderFeedByVisitor(events);
      return;
    }
    var host = _$("act-feed-list");
    if (!host || !window.GoeloActivity) return;
    _lastEvents = events || [];
    if (!_lastEvents.length) {
      host.innerHTML = "<p class=\"gtr-empty\">Aucune activité récente.</p>";
      renderTicker([]);
      return;
    }
    var groups = window.GoeloActivity.groupByDay(_lastEvents);
    host.innerHTML = groups.map(function (g) {
      return "<section class=\"act-feed__day\">" +
        "<h3 class=\"act-feed__day-title\">" + window.GoeloActivity._esc(g.label) + "</h3>" +
        "<ul class=\"act-feed__items\">" + g.items.map(feedItemHtml).join("") + "</ul>" +
        "</section>";
    }).join("");
    renderTicker(_lastEvents.slice(0, 8));
  }

  function renderTicker(events) {
    var host = _$("act-ticker-list");
    var countEl = _$("act-ticker-count");
    if (!host) return;
    if (countEl) countEl.textContent = String((events || []).length);
    if (!events || !events.length) {
      host.innerHTML = "<p class=\"act-ticker__empty\">En attente d'activité…</p>";
      return;
    }
    var GA = window.GoeloActivity;
    host.innerHTML = events.map(function (ev) {
      return "<div class=\"act-ticker__row\">" +
        "<span class=\"act-ticker__time\">" + GA._esc(GA.fmtTime(ev.created_at)) + "</span>" +
        "<span class=\"act-ticker__icon\" aria-hidden=\"true\">" + GA._esc(ev.icon) + "</span>" +
        "<span class=\"act-ticker__text\">" + (ev.textHtml || GA._esc(ev.label || ev.text)) + "</span>" +
        "</div>";
    }).join("");
  }

  function setLoading(on) {
    var feed = _$("act-feed-list");
    if (!feed || !on) return;
    feed.innerHTML =
      "<div class=\"gtr-loading\">" +
      "<div class=\"gtr-loading__dot\"></div>" +
      "<div class=\"gtr-loading__dot\"></div>" +
      "<div class=\"gtr-loading__dot\"></div>" +
      "</div>";
  }

  async function loadActivity() {
    var sb = window.goeloGetSb ? window.goeloGetSb() : null;
    if (!sb || !window.GoeloActivity) return;
    setLoading(true);
    var data = await window.GoeloActivity.fetchDashboard(sb, 60);
    renderStats(data.stats);
    renderFeed(data.events);
    if (data.feedMode === "activity_feed_human" && data.eventTypes) {
      console.info("[GoeloAdminActivity] Feed activity_feed_human", data.eventTypes);
    }
    if (data.error) {
      var errEl = _$("act-feed-error");
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = "Flux limité : " + data.error;
      }
    } else {
      var errBox = _$("act-feed-error");
      if (errBox) errBox.hidden = true;
    }
  }

  function bindControls() {
    var refreshBtn = _$("act-refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () { loadActivity(); });
    }
    var groupCb = _$("act-group-visitor");
    if (groupCb) {
      groupCb.addEventListener("change", function () {
        _groupByVisitor = !!groupCb.checked;
        renderFeed(_lastEvents);
      });
    }
    var pauseBtn = _$("act-ticker-pause");
    if (pauseBtn) {
      pauseBtn.addEventListener("click", function () {
        _tickerPaused = !_tickerPaused;
        pauseBtn.textContent = _tickerPaused ? "Reprendre" : "Pause";
        if (!_tickerPaused) loadActivity();
      });
    }
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act-verify]");
      if (!btn) return;
      e.preventDefault();
      var wrap = document.getElementById("gtr-toast-wrap");
      if (wrap) {
        var el = document.createElement("div");
        el.className = "gtr-toast";
        el.textContent = "Alerte notée — à traiter manuellement.";
        wrap.appendChild(el);
        setTimeout(function () { el.remove(); }, 3500);
      }
    });
  }

  function startTicker() {
    if (_tickerTimer) clearInterval(_tickerTimer);
    _tickerTimer = setInterval(function () {
      if (!_tickerPaused) loadActivity();
    }, 45000);
  }

  function init() {
    var section = _$("act-dashboard");
    if (!section) return;
    bindControls();
    loadActivity();
    startTicker();
  }

  window.GoeloAdminActivity = { init: init, refresh: loadActivity };
})();
