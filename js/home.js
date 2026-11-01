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

  var _homeScrollTracker = null;
  var _homePageViewLogged = false;

  function logHomeActivity(eventType, metadata, extras) {
    if (!window.GoeloActivity) return;
    window.GoeloActivity.logEvent(null, eventType, metadata || {}, extras || {});
  }

  function initHomePageTracking() {
    if (_homePageViewLogged) return;
    var GA = window.GoeloActivity;
    if (!GA) {
      setTimeout(initHomePageTracking, 100);
      return;
    }

    _homePageViewLogged = true;
    logHomeActivity(GA.EVENT_TYPES.PAGE_HOME_VIEWED, {});

    _homeScrollTracker = GA.trackScrollDepth(
      null,
      GA.EVENT_TYPES.HOME_SCROLL_DEPTH,
      "home"
    );

    var footer = document.querySelector(".gr-footer");
    if (footer) {
      GA.observeFooterOnce(null, footer, GA.EVENT_TYPES.HOME_FOOTER_VIEWED);
    }
  }

  function refreshHomeScrollTracking() {
    if (_homeScrollTracker && _homeScrollTracker.refresh) {
      _homeScrollTracker.refresh();
    }
  }

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
    var data = await window.GoeloPublicData.rpc("routes_upcoming_homepage", {p_limit:3});
    if (!Array.isArray(data)) throw new Error("invalid_public_response");

    return data.map(function(row) {
      var km = row.totalKm != null ? row.totalKm : (row.km != null ? row.km : null);
      var dplus = row.elevGainM != null ? row.elevGainM : (row.dplus != null ? row.dplus : null);
      
      var dateIso = row.rideDateIso || "";
      var time = row.rideTime || "08:30";
      var date = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
        var hhmm = time.match(/^\d{2}:\d{2}$/) ? time.split(":") : ["8", "30"];
        var p = dateIso.split("-");
        date = new Date(+p[0], +p[1] - 1, +p[2], +hhmm[0], +hhmm[1]);
      }

      return {
        id: String(row.id),
        title: String(row.track_name || "Sortie"),
        group: String(row.group_label || ""),
        levelClass: String(row.levelClass || "level-bleu"),
        type: typeFromRaceType(row.raceType),
        place: String(row.meetPlace || row.meet_place || "Devant le Kasino"),
        status: String(row.sortieStatus || "open"),
        visibility: String(row.visibility || "public"),
        date: date,
        meetTime: String(row.meetTime || row.rideTime || ""),
        km: km,
        dplus: dplus,
        duration: row.estimatedDurationHm || row.estimated_duration_hm || null,
        paceKmh: parsePaceKmh(row.pace_label),
        assigned_team_rider_id: row.assigned_team_rider_id || null,
        teamRiderPseudo: teamRiderDisplayName({ pseudo: row.team_rider_pseudo }),
        imageUrl: String(row.thumbSrc || row.coverImageUrl || row.coverImageDataUrl || ""),
        participants: [],
        embeddedPoints: Array.isArray(row.embeddedPoints) ? row.embeddedPoints : null,
        meetLat: row.meetLat != null ? Number(row.meetLat) : null,
        meetLon: row.meetLon != null ? Number(row.meetLon) : null,
        weather: null
      };
    });
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
    var role = window.GOELO_ROLE;
    if (!window.GOELO_USER || !window.GOELO_USER.id) {
      upcomingState.joinedRouteIds = new Set();
      return;
    }
    if (role !== "user" && role !== "team_rider" && role !== "admin") {
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

  var participantsRefresh = null;
  var participantsRefreshAgain = false;
  async function reloadParticipants() {
    renderUpcomingSorties();
    if (participantsRefresh) { participantsRefreshAgain = true; return participantsRefresh; }
    if (!upcomingState.sorties.length) return;
    participantsRefresh = (async function () {
      do {
        participantsRefreshAgain = false;
        var jobs = [];
        var guest = window.GoeloPseudoParticipation;
        if (guest && guest.refreshLocal) {
          jobs.push(Promise.all(upcomingState.sorties.map(function (sortie) { return guest.refreshLocal(sortie.id); })));
        }
        if (window.GoeloSignupParticipants) {
          jobs.push(window.GoeloSignupParticipants.enrichCardsWithParticipants(upcomingState.sorties, getSb()));
        }
        await Promise.allSettled(jobs);
        renderUpcomingSorties();
      } while (participantsRefreshAgain);
    })();
    try { await participantsRefresh; } finally { participantsRefresh = null; }
  }

  function updateUpcomingSubtitle(count) {
    var sub = document.getElementById("gr-upcoming-sub");
    if (!sub) return;
    if (count === 0) {
      sub.textContent = "Aucune sortie programmée pour le moment";
      return;
    }
    sub.textContent = count === 1 ? "1 sortie à venir" : count + " sorties à venir";
  }

  function renderUpcomingSorties() {
    var root=document.getElementById("gr-upcoming-rides");
    if(!root)return;
    if(root.querySelector("[role=alert]")&&!upcomingState.sorties.length)return;
    updateUpcomingSubtitle(upcomingState.sorties.length);
    if (window.GoeloSortieCards && upcomingState.sorties.length) {
      var visualHost = document.createElement("div");
      window.GoeloSortieCards.renderList(upcomingState.sorties.map(sortieToCard), visualHost, {
        viewMode: "home", joinedRouteIds: upcomingState.joinedRouteIds,
        trackSource: "home", groupDots: true
      });
      root.replaceChildren(...visualHost.childNodes);
      _syncUpcomingNav();requestAnimationFrame(refreshHomeScrollTracking);
      return;
    }
    var list=document.createElement("div");list.className="home-upcoming-cards";
    upcomingState.sorties.forEach(function(ride){
      var card=document.createElement("article");card.className="home-upcoming-card";card.dataset.routeId=ride.id;
      var date=document.createElement("p");date.className="home-upcoming-card__date";
      date.textContent=ride.date&&!isNaN(ride.date.getTime())?ride.date.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):"Date à confirmer";
      var title=document.createElement("h3");title.textContent=ride.title;
      var tags=document.createElement("p");tags.className="home-upcoming-card__meta";
      tags.textContent=[ride.group,ride.km!=null?Number(ride.km).toLocaleString("fr-FR",{maximumFractionDigits:1})+" km":"",ride.dplus!=null?Math.round(ride.dplus)+" m D+":""].filter(Boolean).join(" · ");
      var meeting=document.createElement("p");meeting.textContent=[ride.meetTime?"Rendez-vous à "+ride.meetTime:"",ride.place].filter(Boolean).join(" · ");
      var actions=document.createElement("div");actions.className="home-upcoming-card__actions";
      var link=document.createElement("a");link.className="btn-primary home-upcoming-card__link";link.href="parcours.html?id="+encodeURIComponent(ride.id);link.textContent="Voir la sortie →";actions.appendChild(link);
      if(window.GoeloPseudoParticipation&&!window.GOELO_AUTH_PENDING&&!window.GOELO_USER&&!/^(cancelled|canceled|annulee|annulée)$/.test(ride.status)){
        var join=document.createElement("button");join.type="button";join.dataset.guestJoin=ride.id;join.dataset.guestTitle=ride.title;join.dataset.guestSummary=date.textContent;join.textContent=window.GoeloPseudoParticipation.hasLocal(ride.id)?"Inscrit ✓":"Rejoindre";actions.appendChild(join);
      }
      card.appendChild(date);card.appendChild(title);if(tags.textContent)card.appendChild(tags);if(meeting.textContent)card.appendChild(meeting);card.appendChild(actions);list.appendChild(card);
    });
    root.replaceChildren(list);
    _syncUpcomingNav();requestAnimationFrame(refreshHomeScrollTracking);
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

  var upcomingNavBound = false;
  function _bindUpcomingNav() {
    if (upcomingNavBound) return;
    var scroller = _getUpcomingScroller();
    var prev = document.getElementById("gr-upcoming-prev");
    var next = document.getElementById("gr-upcoming-next");
    if (!scroller) return;
    upcomingNavBound = true;

    function scrollByDir(dir) {
      var card = scroller.querySelector(".go-sc-card,.home-upcoming-card");
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

    try {
      upcomingState.sorties = await fetchUpcomingSorties();
      root.replaceChildren();
      renderUpcomingSorties();

      Promise.all([
        (async function() {
          try {
            if (window.GoeloUI && window.GoeloUI.waitForRole) {
              await Promise.race([
                window.GoeloUI.waitForRole(),
                new Promise(function (resolve) { setTimeout(resolve, 2500); })
              ]);
            }
            await fetchJoinedRouteIds();
            renderUpcomingSorties();
          } catch (e) {
            console.warn("[GoëloHome] enrichissement inscriptions:", e);
          }
        })(),
        
        (async function() {
          try {
            if (window.GoeloSignupParticipants && upcomingState.sorties.length) {
              await reloadParticipants();
            }
          } catch (e) {
            console.warn("[GoëloHome] enrichissement participants:", e);
          }
        })(),
        
        (async function() {
          try {
            if (window.GoeloWeather && upcomingState.sorties.length) {
              await window.GoeloWeather.enrichSorties(upcomingState.sorties);
              renderUpcomingSorties();
            }
          } catch (e) {
            console.warn("[GoëloHome] enrichissement météo:", e);
          }
        })()
      ]).catch(function(err) {
        console.warn("[GoëloHome] enrichissement global:", err);
      });

    } catch (err) {
      console.error("[GoëloHome] initUpcomingSorties:", err);
      var sub = document.getElementById("gr-upcoming-sub");
      if (sub) sub.textContent = "Les sorties n’ont pas pu être chargées.";
      root.innerHTML = '<p class="go-sc-empty" role="alert">Chargement indisponible pour le moment.</p>';
      var retry = document.createElement("button");retry.type="button";retry.className="go-sc-btn";retry.textContent="Réessayer";
      retry.addEventListener("click",function(){retry.disabled=true;initUpcomingSorties();});root.appendChild(retry);

    }

    _bindUpcomingNav();
    refreshHomeScrollTracking();
  }

  function _init() {
    _bindLogoutButtons();
    initHomePageTracking();
    initUpcomingSorties();

    if (window.GoeloPoll) {
      if (window.GoeloPoll.initAll) window.GoeloPoll.initAll(".gr-poll-root[data-poll-slug]:not([data-poll-multi])");
      else window.GoeloPoll.init("#gr-poll-root");
    }
    if (window.GoeloPollMulti) {
      window.GoeloPollMulti.init("#gr-poll-motivation-root");
    }

    var heroCta = document.querySelector(".gr-hero-ctas .gr-btn--ghost[data-goelo-auth-trigger]");
    if (heroCta) heroCta.setAttribute("data-goelo-tr-cta", "");

    function onAuthUi(detail) {
      if (window.GoeloUI) window.GoeloUI.syncRoleUI(detail);
      _bindLogoutButtons();
      fetchJoinedRouteIds().then(renderUpcomingSorties);
      reloadParticipants();
      if (window.GoeloPoll) {
        if (window.GoeloPoll.reloadAll) window.GoeloPoll.reloadAll(".gr-poll-root[data-poll-slug]:not([data-poll-multi])");
        else window.GoeloPoll.load(document.getElementById("gr-poll-root"));
      }
      if (window.GoeloPollMulti) {
        window.GoeloPollMulti.load(document.getElementById("gr-poll-motivation-root"));
      }
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
    window.addEventListener("pageshow", function (event) {
      if (event.persisted) reloadParticipants();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") reloadParticipants();
    });
    window.addEventListener("storage", function (event) {
      if (event.key === null || String(event.key).indexOf("goelo-guest-pseudo:") === 0) reloadParticipants();
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
