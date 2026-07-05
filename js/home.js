/**
 * GoëloRides — /js/home.js
 * Hero · prochaines sorties (Supabase) · auth UI homepage.
 */
(function () {
  "use strict";

  var FR_MONTHS = {
    janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12
  };

  var upcomingState = {
    sorties: [],
    joinedRouteIds: new Set()
  };

  function getSb() {
    return window.goeloGetSb ? window.goeloGetSb() : null;
  }

  function _setLogoutLoading(isLoading) {
    document.querySelectorAll("[data-goelo-logout-btn]").forEach(function (btn) {
      btn.disabled = !!isLoading;
      btn.classList.toggle("is-logging-out", !!isLoading);
      var label = btn.querySelector("[data-goelo-logout-label]");
      var spinner = btn.querySelector("[data-goelo-logout-spinner]");
      if (label) label.hidden = !!isLoading;
      if (spinner) spinner.hidden = !isLoading;
    });
  }

  function _handleLogoutClick() {
    if (document.querySelector("[data-goelo-logout-btn]:disabled")) return;

    if (typeof closeMobileMenu === "function") {
      try { closeMobileMenu(); } catch (e) { void e; }
    }

    _setLogoutLoading(true);

    var signOut = window.goeloSignOut;
    if (typeof signOut !== "function") {
      console.warn("[GoëloHome] goeloSignOut indisponible — redirection directe");
      window.location.href = "/";
      return;
    }

    signOut({ redirect: "/" }).catch(function (err) {
      console.warn("[GoëloHome] déconnexion — erreur finale, redirection forcée", err);
      window.location.href = "/";
    });
  }

  function _bindLogoutButtons() {
    document.querySelectorAll("[data-goelo-logout-btn]").forEach(function (btn) {
      if (btn.dataset.goeloLogoutBound === "1") return;
      btn.dataset.goeloLogoutBound = "1";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        _handleLogoutClick();
      });
    });
  }

  function parseFrontConfig(raw) {
    if (raw == null) return {};
    if (typeof raw === "string") {
      try {
        var p = JSON.parse(raw);
        return p && typeof p === "object" && !Array.isArray(p) ? p : {};
      } catch (err) { void err; return {}; }
    }
    return typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  function normMonthName(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function rideDateFromFc(fc) {
    var iso = typeof fc.rideDateIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fc.rideDateIso.trim())
      ? fc.rideDateIso.trim() : "";
    var time = typeof fc.rideTime === "string" && /^\d{2}:\d{2}$/.test(fc.rideTime.trim())
      ? fc.rideTime.trim() : "";
    if (iso) {
      var hhmm = time ? time.split(":") : ["8", "30"];
      var p = iso.split("-");
      return new Date(+p[0], +p[1] - 1, +p[2], +hhmm[0], +hhmm[1]);
    }
    var d = fc.depart && typeof fc.depart === "object" ? fc.depart : {};
    var label = String((d.dateLabel || fc.dateLabel || "")).trim();
    var year = parseInt(String(d.year || "").trim(), 10);
    var monthNum = FR_MONTHS[normMonthName(d.month)] || 0;
    var day = parseInt(String(d.day || "").replace(/\D/g, ""), 10);
    if (!year || !monthNum || !day) {
      var m = label.match(/(\d{1,2})(?:er)?\s+([a-zA-Z\u00C0-\u017F]+)\s+(\d{4})/);
      if (m) {
        day = day || parseInt(m[1], 10);
        monthNum = monthNum || FR_MONTHS[normMonthName(m[2])] || 0;
        year = year || parseInt(m[3], 10);
      }
    }
    if (!year || !monthNum || !day) return null;
    var tm = label.match(/(\d{1,2})h(\d{2})/);
    return new Date(year, monthNum - 1, day, tm ? +tm[1] : 8, tm ? +tm[2] : 30);
  }

  function typeFromRaceType(raceType) {
    var rt = String(raceType || "").toLowerCase();
    if (rt === "gravel") return "gravel";
    if (rt === "vtt" || rt === "rtt") return "vtt";
    return "route";
  }

  function parsePaceKmh(paceLabel) {
    var m = String(paceLabel || "").match(/(\d+)\s*[–-]\s*(\d+)/);
    if (m) return (parseInt(m[1], 10) + parseInt(m[2], 10)) / 2;
    return 20;
  }

  function teamRiderDisplayName(tr) {
    if (!tr) return "";
    if (window.GoeloProfile) return window.GoeloProfile.getDisplayName(tr);
    return "User";
  }

  function dbRowToSortie(row) {
    var fc = parseFrontConfig(row.front_config);
    var stats = fc.stats || {};
    var km = stats.totalKm != null ? stats.totalKm : (fc.km != null ? fc.km : null);
    var dplus = stats.elevGainM != null ? stats.elevGainM : (fc.dplus != null ? fc.dplus : null);
    return {
      id: String(row.id),
      title: String(row.track_name || row.group_label || "Sortie"),
      group: String(row.group_label || ""),
      levelClass: String(fc.levelClass || "level-bleu"),
      type: typeFromRaceType(fc.raceType),
      place: String(fc.meetPlace || fc.meet_place || "Devant le Kasino"),
      status: String(fc.sortieStatus || "open"),
      visibility: String(fc.visibility || "public"),
      date: rideDateFromFc(fc),
      meetTime: String(fc.meetTime || fc.rideTime || ""),
      km: km,
      dplus: dplus,
      duration: fc.estimatedDurationHm || fc.estimated_duration_hm || null,
      paceKmh: parsePaceKmh(row.pace_label),
      assigned_team_rider_id: row.assigned_team_rider_id || null,
      teamRiderPseudo: teamRiderDisplayName(row.team_rider),
      imageUrl: String(fc.thumbSrc || fc.coverImageUrl || fc.coverImageDataUrl || ""),
      participants: [],
      embeddedPoints: Array.isArray(fc.embeddedPoints) ? fc.embeddedPoints : null,
      meetLat: fc.meetLat != null ? Number(fc.meetLat) : (fc.meet_lat != null ? Number(fc.meet_lat) : null),
      meetLon: fc.meetLon != null ? Number(fc.meetLon) : (fc.meet_lon != null ? Number(fc.meet_lon) : null),
      weather: null
    };
  }

  async function fetchUpcomingSorties() {
    var sb = getSb();
    if (!sb) {
      console.warn("[GoëloHome] Supabase non disponible");
      return [];
    }

    var res = await sb
      .from("routes")
      .select("id, track_name, group_label, pace_label, is_active, front_config, created_at, assigned_team_rider_id, team_rider:profiles!assigned_team_rider_id(pseudo)")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (res.error) {
      console.error("[GoëloHome] fetch sorties:", res.error);
      return [];
    }

    var now = Date.now();
    return (res.data || [])
      .map(dbRowToSortie)
      .filter(function (s) {
        if (s.status === "cancelled") return false;
        if (s.visibility && s.visibility !== "public") return false;
        if (!s.date || s.date.getTime() < now) return false;
        return true;
      })
      .sort(function (a, b) {
        return a.date.getTime() - b.date.getTime();
      })
      .slice(0, 3);
  }

  function sortieToCard(s) {
    var SC = window.GoeloSortieCards;
    return {
      id: s.id,
      title: s.title,
      group: s.group,
      groupKey: SC ? SC.groupKeyFromLabel(s.group) : "vert",
      type: s.type,
      place: s.place,
      date: s.date,
      meetTime: s.meetTime,
      km: s.km,
      dplus: s.dplus,
      duration: s.duration,
      paceKmh: s.paceKmh,
      captain: s.captain,
      assigned_team_rider_id: s.assigned_team_rider_id || null,
      teamRiderPseudo: s.teamRiderPseudo || "",
      status: s.status,
      imageUrl: s.imageUrl,
      participants: s.participants || [],
      embeddedPoints: s.embeddedPoints || null,
      meetLat: s.meetLat,
      meetLon: s.meetLon,
      weather: s.weather || null
    };
  }

  async function fetchJoinedRouteIds() {
    var role = window.GoeloSortieCards
      ? window.GoeloSortieCards.getUserRole()
      : (window.GOELO_ROLE === "user" ? "user" : "visitor");
    if (role !== "user" || !window.GOELO_USER || !window.GOELO_USER.id) {
      upcomingState.joinedRouteIds = new Set();
      return;
    }
    var sb = getSb();
    if (!sb) return;
    var r = await sb.rpc("signup_list_registered_routes", {});
    if (r.error) {
      console.warn("[GoëloHome] signup_list_registered_routes:", r.error.message);
      upcomingState.joinedRouteIds = new Set();
      return;
    }
    var routes = r.data && (r.data.routes || r.data);
    upcomingState.joinedRouteIds = new Set(Array.isArray(routes) ? routes.map(String) : []);
  }

  async function reloadParticipants() {
    if (!upcomingState.sorties.length || !window.GoeloSignupParticipants) return;
    await window.GoeloSignupParticipants.enrichCardsWithParticipants(upcomingState.sorties, getSb());
    renderUpcomingSorties();
  }

  function updateUpcomingSubtitle(count) {
    var sub = document.getElementById("gr-upcoming-sub");
    if (!sub) return;
    if (count === 0) {
      sub.textContent = "Aucune sortie à venir pour le moment";
      return;
    }
    sub.textContent = count === 1 ? "1 sortie à venir" : count + " sorties à venir";
  }

  function renderUpcomingSorties() {
    var root = document.getElementById("gr-upcoming-rides");
    if (!root || !window.GoeloSortieCards) return;

    var cards = upcomingState.sorties.map(sortieToCard);
    updateUpcomingSubtitle(cards.length);

    if (!cards.length) {
      root.innerHTML = "";
      _syncUpcomingNav();
      return;
    }

    window.GoeloSortieCards.renderList(cards, root, {
      viewMode: "sorties",
      joinedRouteIds: upcomingState.joinedRouteIds,
      asList: true,
      emptyHtml: ""
    });

    requestAnimationFrame(function () { _syncUpcomingNav(); });
  }

  function _getUpcomingScroller() {
    return document.getElementById("gr-upcoming-rides");
  }

  function _syncUpcomingNav() {
    var nav = document.getElementById("gr-upcoming-nav");
    var scroller = _getUpcomingScroller();
    if (!nav || !scroller) return;
    var hasMany = upcomingState.sorties.length > 1;
    var canScroll = scroller.scrollWidth > scroller.clientWidth + 4;
    nav.hidden = !(hasMany && canScroll);
  }

  function _bindUpcomingNav() {
    var scroller = _getUpcomingScroller();
    var prev = document.getElementById("gr-upcoming-prev");
    var next = document.getElementById("gr-upcoming-next");
    if (!scroller) return;

    function scrollByDir(dir) {
      var card = scroller.querySelector(".go-sc-list > li");
      var step = card ? card.offsetWidth + 14 : scroller.clientWidth * 0.85;
      scroller.scrollBy({ left: dir * step, behavior: "smooth" });
    }

    if (prev) {
      prev.addEventListener("click", function () { scrollByDir(-1); });
    }
    if (next) {
      next.addEventListener("click", function () { scrollByDir(1); });
    }

    scroller.addEventListener("scroll", function () { _syncUpcomingNav(); }, { passive: true });
    window.addEventListener("resize", function () { _syncUpcomingNav(); });
  }

  async function initUpcomingSorties() {
    var root = document.getElementById("gr-upcoming-rides");
    if (!root) return;

    if (window.GoeloUI && window.GoeloUI.waitForRole) {
      try { await window.GoeloUI.waitForRole(); } catch (e) { void e; }
    }

    upcomingState.sorties = await fetchUpcomingSorties();
    await fetchJoinedRouteIds();

    if (window.GoeloSignupParticipants && upcomingState.sorties.length) {
      await window.GoeloSignupParticipants.enrichCardsWithParticipants(upcomingState.sorties, getSb());
    }

    renderUpcomingSorties();

    if (window.GoeloWeather && upcomingState.sorties.length) {
      try {
        await window.GoeloWeather.enrichSorties(upcomingState.sorties);
        renderUpcomingSorties();
      } catch (err) {
        console.warn("[GoëloHome] enrichWeather:", err.message || err);
      }
    }

    _bindUpcomingNav();
  }

  function _init() {
    _bindLogoutButtons();
    initUpcomingSorties();

    var heroCta = document.querySelector(".gr-hero-ctas .gr-btn--ghost[data-goelo-auth-trigger]");
    if (heroCta) heroCta.setAttribute("data-goelo-tr-cta", "");

    function onAuthUi(detail) {
      if (window.GoeloUI) window.GoeloUI.syncRoleUI(detail);
      _bindLogoutButtons();
      fetchJoinedRouteIds().then(renderUpcomingSorties);
    }

    window.addEventListener("goelo:role-ready", function (e) {
      onAuthUi(e.detail);
    });
    window.addEventListener("goelo:auth-success", function (e) {
      onAuthUi(e.detail);
    });
    window.addEventListener("goelo:auth-state", function (e) {
      onAuthUi(e.detail);
    });
    window.addEventListener("goelo:signup-changed", function () {
      reloadParticipants();
    });

    if (window.GoeloUI) {
      if (window.GoeloUI.catchUpRoleUI) window.GoeloUI.catchUpRoleUI();
      else if (!window.GOELO_AUTH_PENDING) {
        window.GoeloUI.syncRoleUI({
          role: window.GOELO_ROLE,
          user: window.GOELO_USER,
          pseudo: window.GOELO_DISPLAY_NAME
        });
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }
})();
