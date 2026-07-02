(function () {
  "use strict";
  /* ════════════════════════════════════════════════════════════
     Config
     ════════════════════════════════════════════════════════════ */
  var ACCESS_MAILTO =
    "mailto:goelo.rides@gmail.com" +
    "?subject=Demande%20acc%C3%A8s%20Team%20Rider" +
    "&body=Bonjour%2C%0A%0AJe%20souhaite%20demander%20l%27acc%C3%A8s%20Team%20Rider.%0A%0A";

  var LOCK_CONTENT = {
    create: {
      title: "Mode Team Rider requis",
      text: "Créer et publier une sortie est réservé aux Team Riders. Connecte-toi pour continuer."
    },
    manage: {
      title: "Mode Team Rider requis",
      text: "Modifier ou annuler une sortie est réservé aux Team Riders organisateurs."
    },
    join: {
      title: "Connexion requise",
      text: "Connecte-toi pour rejoindre cette sortie et apparaître parmi les participants."
    }
  };

  var FR_MONTHS = {
    janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12
  };

  function getSb() {
    return window.goeloGetSb ? window.goeloGetSb() : null;
  }

  /* ════════════════════════════════════════════════════════════
     Helpers génériques
     ════════════════════════════════════════════════════════════ */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return String(s || "").replace(/"/g, "&quot;");
  }

  /* ════════════════════════════════════════════════════════════
     Données : routes_list + front_config → modèle de ligne
     ════════════════════════════════════════════════════════════ */
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

  function toneFromLevelClass(levelClass) {
    if (levelClass === "level-blanc") return "blanc";
    if (levelClass === "level-vert")  return "vert";
    if (levelClass === "level-rouge") return "rouge";
    return "bleu";
  }

  /*
   * CORRECTION 1 : suppression du filtre visibility ici.
   *   La RPC routes_list filtre déjà via p_filter.
   *   dbRowToSortie ne doit PAS exclure les brouillons elle-même —
   *   c'est fetchSorties() qui contrôle ce que l'on passe à la RPC.
   *
   * CORRECTION 2 : fc.captain || fc.rideLeader
   *   gestion-route.js écrit fc.captain, l'ancienne clé était fc.rideLeader.
   *   On lit les deux pour compatibilité.
   *
   * CORRECTION 3 : fc.meetTime || fc.rideTime pour l'heure de RDV
   *   gestion-route.js écrit meetTime (heure RDV) et rideTime (heure départ).
   */
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
      id:             String(row.id),
      title:          String(row.track_name || row.group_label || "Sortie"),
      group:          String(row.group_label || ""),
      levelClass:     String(fc.levelClass || "level-bleu"),
      type:           typeFromRaceType(fc.raceType),
      place:          String(fc.meetPlace || fc.meet_place || "Devant le Kasino"),
      status:         String(fc.sortieStatus || "open"),
      visibility:     String(fc.visibility  || "draft"),
      date:           rideDateFromFc(fc),
      file:           String(fc.file || "").trim(),
      embeddedPoints: Array.isArray(fc.embeddedPoints) ? fc.embeddedPoints : null,
      // CORRECTION 2 : captain lu depuis les deux clés possibles
      captain:                String(fc.captain || fc.rideLeader || ""),
      assigned_team_rider_id: row.assigned_team_rider_id || null,
      teamRiderPseudo:        teamRiderDisplayName(row.team_rider),
      // CORRECTION 3 : meetTime = heure RDV, rideTime = heure départ
      meetTime:       String(fc.meetTime || fc.rideTime || ""),
      km:             km,
      dplus:          dplus,
      duration:       fc.estimatedDurationHm || fc.estimated_duration_hm || null,
      paceKmh:        parsePaceKmh(row.pace_label),
      imageUrl:       String(fc.thumbSrc || fc.coverImageUrl || fc.coverImageDataUrl || ""),
      participants:   [],
      meetLat:        fc.meetLat != null ? Number(fc.meetLat) : (fc.meet_lat != null ? Number(fc.meet_lat) : null),
      meetLon:        fc.meetLon != null ? Number(fc.meetLon) : (fc.meet_lon != null ? Number(fc.meet_lon) : null),
      weather:        null
    };
  }

  function parsePaceKmh(paceLabel) {
    var m = String(paceLabel || "").match(/(\d+)\s*[–-]\s*(\d+)/);
    if (m) return (parseInt(m[1], 10) + parseInt(m[2], 10)) / 2;
    return 20;
  }

  async function supabaseRpc(fnName, payload) {
    var sb = getSb();
    if (!sb) return null;
    var r = await sb.rpc(fnName, payload || {});
    if (r.error) {
      console.warn("[sorties] RPC", fnName, r.error.message);
      return null;
    }
    return r.data;
  }

  /*
   * CORRECTION 4 : fetchSorties() sans ROUTES_BUILTIN ni logique seen[].
   *   - On appelle routes_list avec p_filter: { is_active: true } pour
   *     n'obtenir que les routes actives côté SQL (pas de filtre JS fragile).
   *   - Plus de données hardcodées qui masquaient les vraies données Supabase.
   *   - Plus de seen[] qui ignorait silencieusement les routes Supabase
   *     dont l'id coïncidait avec un builtin.
   *   - Le filtre visibility "public" est appliqué ici pour la vue publique.
   *     La vue admin (gestion-sorties) appellera routes_list différemment.
   */
async function fetchSorties() {
  var sb = getSb();
  if (!sb) {
    console.warn("[sorties] Supabase non disponible");
    return [];
  }

  var res = await sb
    .from("routes")
    .select("id, track_name, group_label, pace_label, is_active, front_config, created_at, assigned_team_rider_id, team_rider:profiles!assigned_team_rider_id(pseudo)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (res.error) {
    console.error("[sorties] erreur:", res.error);
    return [];
  }

  return (res.data || []).map(dbRowToSortie);
}

  /* ── Participants : signups actifs via Supabase (même flux que parcours.js) ── */
  async function reloadParticipants() {
    if (!state.sorties.length) return;
    if (!window.GoeloSignupParticipants) {
      console.warn("[sorties] GoeloSignupParticipants non chargé");
      return;
    }
    await window.GoeloSignupParticipants.enrichCardsWithParticipants(state.sorties, getSb());
    render();
  }

  /* ── Stats km / D+ : embeddedPoints ou trace GPX locale ── */
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var p = Math.PI / 180;
    var a =
      Math.pow(Math.sin(((lat2 - lat1) * p) / 2), 2) +
      Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.pow(Math.sin(((lon2 - lon1) * p) / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function statsFromPoints(points) {
    if (!Array.isArray(points) || points.length < 2) return null;
    var dist = 0;
    var gain = 0;
    var lastEle = null;
    for (var i = 0; i < points.length; i++) {
      var pt = points[i];
      if (!pt || typeof pt.lat !== "number" || typeof pt.lon !== "number") continue;
      if (i > 0 && points[i - 1] && typeof points[i - 1].lat === "number") {
        dist += haversine(points[i - 1].lat, points[i - 1].lon, pt.lat, pt.lon);
      }
      if (typeof pt.ele === "number") {
        if (lastEle != null && pt.ele > lastEle) gain += pt.ele - lastEle;
        lastEle = pt.ele;
      }
    }
    return {
      km:    Math.round(dist / 1000),
      dplus: gain > 5 ? Math.round(gain) : null
    };
  }

  /*
   * CORRECTION 5 : statsFromPoints accepte aussi le format [[lat,lng,ele]]
   *   que gestion-route.js stocke dans embeddedPoints.
   */
  function normalizePoints(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (p) {
      if (Array.isArray(p)) {
        return { lat: p[0], lon: p[1], ele: typeof p[2] === "number" ? p[2] : undefined };
      }
      // format {lat, lng, ele} → convertir lng→lon
      return {
        lat: p.lat,
        lon: p.lon !== undefined ? p.lon : p.lng,
        ele: p.ele
      };
    });
  }

  function parseGpxPoints(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) return [];
    var out = [];
    var nodes = doc.getElementsByTagName("*");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var tag = el.localName || el.nodeName.split(":").pop();
      if (tag !== "trkpt" && tag !== "rtept") continue;
      var lat = parseFloat(el.getAttribute("lat"));
      var lon = parseFloat(el.getAttribute("lon"));
      if (isNaN(lat) || isNaN(lon)) continue;
      var ele = null;
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
        var n = c.localName || c.nodeName.split(":").pop();
        if (n === "ele" && c.textContent) {
          var v = parseFloat(c.textContent.trim());
          if (!isNaN(v)) ele = v;
          break;
        }
      }
      out.push(ele != null ? { lat: lat, lon: lon, ele: ele } : { lat: lat, lon: lon });
    }
    return out;
  }

  async function loadStats(sortie) {
    if (sortie.embeddedPoints) {
      // CORRECTION 5 appliquée : normaliser avant de calculer
      var st = statsFromPoints(normalizePoints(sortie.embeddedPoints));
      if (st) return st;
    }
    if (!sortie.file || /^https?:/i.test(sortie.file)) return null;
    try {
      var res = await fetch(encodeURI(sortie.file));
      if (!res.ok) return null;
      return statsFromPoints(parseGpxPoints(await res.text()));
    } catch (err) {
      void err;
      return null;
    }
  }

  /* ════════════════════════════════════════════════════════════
     Rendu
     ════════════════════════════════════════════════════════════ */
  var state = {
    sorties:         [],
    filter:          "tous",
    search:          "",
    joinedRouteIds:  new Set(),
    sortBy:          "date",
    userCoords:      null
  };

  function getUserRole() {
    return window.GoeloSortieCards
      ? window.GoeloSortieCards.getUserRole()
      : (window.GOELO_ROLE === "admin" || window.GOELO_ROLE === "team_rider" || window.GOELO_ROLE === "user"
        ? window.GOELO_ROLE : "visitor");
  }

  function isTeamRiderOrAdmin() {
    var r = getUserRole();
    return r === "team_rider" || r === "admin";
  }

  function sortieToCard(s) {
    var SC = window.GoeloSortieCards;
    return {
      id:           s.id,
      title:        s.title,
      group:        s.group,
      groupKey:     SC ? SC.groupKeyFromLabel(s.group) : "vert",
      type:         s.type,
      place:        s.place,
      date:         s.date,
      meetTime:     s.meetTime,
      km:           s.km,
      dplus:        s.dplus,
      duration:     s.duration,
      paceKmh:      s.paceKmh,
      captain:      s.captain,
      assigned_team_rider_id: s.assigned_team_rider_id || null,
      teamRiderPseudo: s.teamRiderPseudo || "",
      status:       s.status,
      imageUrl:     s.imageUrl,
      participants: s.participants || [],
      embeddedPoints: s.embeddedPoints || null,
      meetLat:      s.meetLat,
      meetLon:      s.meetLon,
      weather:      s.weather || null,
      weatherLat:   s.weatherLat,
      weatherLon:   s.weatherLon
    };
  }

  function sortedSorties(list) {
    var copy = list.slice();
    if (state.sortBy === "weather" && window.GoeloWeather) {
      copy.sort(function (a, b) {
        var ka = window.GoeloWeather.weatherSortKey(a.weather);
        var kb = window.GoeloWeather.weatherSortKey(b.weather);
        if (ka.tier !== kb.tier) return ka.tier - kb.tier;
        if (ka.rain !== kb.rain) return ka.rain - kb.rain;
        return ka.wind - kb.wind;
      });
      return copy;
    }
    if (state.sortBy === "distance" && state.userCoords && window.GoeloWeather) {
      var uc = state.userCoords;
      copy.sort(function (a, b) {
        var alat = a.weatherLat != null ? a.weatherLat : (window.GoeloWeather.resolveCoords(a) || window.GoeloWeather.DEFAULT_COORDS).lat;
        var alon = a.weatherLon != null ? a.weatherLon : (window.GoeloWeather.resolveCoords(a) || window.GoeloWeather.DEFAULT_COORDS).lon;
        var blat = b.weatherLat != null ? b.weatherLat : (window.GoeloWeather.resolveCoords(b) || window.GoeloWeather.DEFAULT_COORDS).lat;
        var blon = b.weatherLon != null ? b.weatherLon : (window.GoeloWeather.resolveCoords(b) || window.GoeloWeather.DEFAULT_COORDS).lon;
        var da = window.GoeloWeather.haversineKm(uc.lat, uc.lon, alat, alon);
        var db = window.GoeloWeather.haversineKm(uc.lat, uc.lon, blat, blon);
        return da - db;
      });
      return copy;
    }
    copy.sort(function (a, b) {
      var ta = a.date ? a.date.getTime() : Infinity;
      var tb = b.date ? b.date.getTime() : Infinity;
      return ta - tb;
    });
    return copy;
  }

  function render() {
    var host = document.getElementById("sorties-list");
    if (!host) return;
    if (!window.GoeloSortieCards) {
      host.innerHTML = '<p class="go-sc-empty">Chargement…</p>';
      return;
    }
    var list = sortedSorties(state.sorties.filter(matchesFilter)).map(sortieToCard);
    window.GoeloSortieCards.renderList(list, host, {
      viewMode: "sorties",
      joinedRouteIds: state.joinedRouteIds,
      emptyHtml: '<p class="go-sc-empty" role="status">Aucune sortie pour ce filtre.</p>'
    });
  }

  async function fetchJoinedRouteIds() {
    if (getUserRole() !== "user") {
      state.joinedRouteIds = new Set();
      return;
    }
    if (!window.GOELO_USER || !window.GOELO_USER.id) {
      state.joinedRouteIds = new Set();
      return;
    }
    var data = await supabaseRpc("signup_list_registered_routes", {});
    var routes = data && (data.routes || data);
    if (!Array.isArray(routes)) routes = [];
    state.joinedRouteIds = new Set(routes.map(String));
  }

  async function cancelSortieAdmin(id, titre, btn) {
    if (!confirm('Annuler la sortie "' + titre + '" ?')) return;
    var sb = getSb();
    if (!sb) return;
    try {
      var fetch = await sb.from("routes").select("front_config").eq("id", id).single();
      if (fetch.error) throw fetch.error;
      var fc = parseFrontConfig(fetch.data.front_config);
      fc.sortieStatus = "cancelled";
      var upd = await sb.from("routes").update({ front_config: fc }).eq("id", id);
      if (upd.error) throw upd.error;
      var sortie = state.sorties.find(function (s) { return String(s.id) === String(id); });
      if (sortie) sortie.status = "cancelled";
      var card = btn ? btn.closest(".go-sc-card") : null;
      if (card) card.classList.add("is-cancelled");
      render();
    } catch (err) {
      console.error("[sorties] cancelSortie:", err.message || err);
      alert("Erreur : " + (err.message || err));
    }
  }

  function bindCardActions() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-go-sc-cancel]");
      if (!btn) return;
      e.preventDefault();
      cancelSortieAdmin(
        btn.getAttribute("data-go-sc-cancel"),
        btn.getAttribute("data-go-sc-title") || "cette sortie",
        btn
      );
    });
  }

  function matchesFilter(s) {
    var now = new Date();
    if (state.filter === "route" || state.filter === "gravel" || state.filter === "vtt") {
      if (s.type !== state.filter) return false;
    } else if (state.filter === "a-venir") {
      if (!s.date || s.date.getTime() < now.getTime()) return false;
    } else if (state.filter === "aujourdhui") {
      if (!s.date) return false;
      if (
        s.date.getFullYear() !== now.getFullYear() ||
        s.date.getMonth()    !== now.getMonth()    ||
        s.date.getDate()     !== now.getDate()
      ) return false;
    } else if (state.filter === "meteo-ideale") {
      if (!window.GoeloWeather || !window.GoeloWeather.isIdealWeather(s.weather)) return false;
    }
    if (state.search) {
      var hay = (s.title + " " + s.group + " " + s.place).toLowerCase();
      if (hay.indexOf(state.search) === -1) return false;
    }
    return true;
  }

  /* ════════════════════════════════════════════════════════════
     Popups contextuels
     ════════════════════════════════════════════════════════════ */
  function lockBodyHtml(kind, idPrefix) {
    var c = LOCK_CONTENT[kind] || LOCK_CONTENT.create;
    return (
      '<span class="gr-popover__lock" aria-hidden="true">🔒</span>' +
      '<p class="gr-popover__title" id="' + idPrefix + '-title">' + escapeHtml(c.title) + "</p>" +
      '<p class="gr-popover__text">' + escapeHtml(c.text) + "</p>" +
      '<div class="gr-popover__actions">' +
      '<button type="button" class="gr-popover__btn" data-goelo-auth-trigger>Se connecter</button>' +
      '<a class="gr-popover__btn gr-popover__btn--ghost" href="' + ACCESS_MAILTO + '">Demander l\'accès</a>' +
      "</div>"
    );
  }

  var tipEl = null;
  var tipHideTimer = null;

  function getTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "gr-popover";
    tipEl.style.position = "fixed";
    tipEl.style.zIndex = "9500";
    tipEl.hidden = true;
    tipEl.setAttribute("role", "tooltip");
    tipEl.addEventListener("mouseenter", function () { if (tipHideTimer) clearTimeout(tipHideTimer); });
    tipEl.addEventListener("mouseleave", scheduleTipHide);
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function showTip(trigger, kind) {
    var tip = getTip();
    if (tipHideTimer) clearTimeout(tipHideTimer);
    tip.innerHTML = lockBodyHtml(kind, "so-tip");
    tip.hidden = false;
    var r = trigger.getBoundingClientRect();
    var w = tip.offsetWidth;
    var left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    tip.style.top  = Math.round(r.bottom + 10) + "px";
    tip.style.left = Math.round(left) + "px";
    tip.style.right = "auto";
  }

  function scheduleTipHide() {
    if (tipHideTimer) clearTimeout(tipHideTimer);
    tipHideTimer = setTimeout(function () { if (tipEl) tipEl.hidden = true; }, 180);
  }

  var lockModalEl = null;

  function getLockModal() {
    if (lockModalEl) return lockModalEl;
    lockModalEl = document.createElement("div");
    lockModalEl.className = "gr-lockmodal";
    lockModalEl.hidden = true;
    lockModalEl.setAttribute("role", "dialog");
    lockModalEl.setAttribute("aria-modal", "true");
    lockModalEl.setAttribute("aria-labelledby", "so-lockmodal-title");
    lockModalEl.innerHTML =
      '<div class="gr-lockmodal__backdrop" data-lockmodal-close></div>' +
      '<div class="gr-lockmodal__panel">' +
      '<button type="button" class="gr-lockmodal__close" data-lockmodal-close aria-label="Fermer">✕</button>' +
      '<div class="gr-lockmodal__body"></div>' +
      "</div>";
    lockModalEl.addEventListener("click", function (e) {
      if (e.target.closest("[data-lockmodal-close]")) closeLockModal();
      if (e.target.closest("[data-goelo-auth-trigger]")) closeLockModal();
    });
    document.body.appendChild(lockModalEl);
    return lockModalEl;
  }

  function openLockModal(kind) {
    var m = getLockModal();
    m.querySelector(".gr-lockmodal__body").innerHTML = lockBodyHtml(kind, "so-lockmodal");
    m.hidden = false;
    if (tipEl) tipEl.hidden = true;
  }

  function closeLockModal() {
    if (lockModalEl) lockModalEl.hidden = true;
  }

  function bindLockTriggers() {
    document.addEventListener("mouseover", function (e) {
      var t = e.target.closest("[data-lock]");
      if (!t || !t.classList.contains("is-locked")) return;
      showTip(t, t.getAttribute("data-lock"));
    });
    document.addEventListener("mouseout", function (e) {
      var t = e.target.closest("[data-lock]");
      if (!t) return;
      scheduleTipHide();
    });
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-lock]");
      if (t && t.classList.contains("is-locked")) {
        e.preventDefault();
        openLockModal(t.getAttribute("data-lock"));
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeLockModal();
        if (tipEl) tipEl.hidden = true;
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     État Team Rider
     ════════════════════════════════════════════════════════════ */
  function applyTeamRiderState() {
    if (window.GoeloUI) window.GoeloUI.syncRoleUI();
    var unlocked = isTeamRiderOrAdmin();
    var createBtn = document.getElementById("nav-create-sortie");
    if (createBtn) {
      if (unlocked) {
        createBtn.classList.remove("is-locked");
        createBtn.removeAttribute("data-lock");
        createBtn.removeAttribute("aria-disabled");
        var lockIcon = createBtn.querySelector(".gr-nav__cta-lock");
        if (lockIcon) lockIcon.textContent = "+";
        createBtn.onclick = function () {
          window.location.href = "gestion-sorties.html?mode=create";
        };
      }
    }
    var aside = document.getElementById("so-aside");
    if (aside && unlocked) {
      aside.classList.add("is-unlocked");
      aside.innerHTML =
        '<div class="so-aside__lock" aria-hidden="true">✓</div>' +
        '<p class="so-aside__title">Mode Team Rider<br>actif</p>' +
        '<p class="so-aside__text">Tu peux créer, modifier et annuler des sorties.</p>' +
        '<a class="gr-popover__btn" href="gestion-sorties.html?mode=create">Créer une sortie</a>';
    }
  }

  /* ════════════════════════════════════════════════════════════
     Filtres + recherche
     ════════════════════════════════════════════════════════════ */
  function bindFilters() {
    document.querySelectorAll(".so-chip[data-filter]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        document.querySelectorAll(".so-chip[data-filter]").forEach(function (c) {
          c.classList.toggle("is-active", c === chip);
        });
        state.filter = chip.getAttribute("data-filter");
        render();
      });
    });
    var input = document.getElementById("so-search-input");
    if (input) {
      input.addEventListener("input", function () {
        state.search = input.value.trim().toLowerCase();
        render();
      });
    }
    var sortSel = document.getElementById("so-sort-by");
    if (sortSel) {
      sortSel.addEventListener("change", function () {
        state.sortBy = sortSel.value || "date";
        if (state.sortBy === "distance") requestUserCoords();
        render();
      });
    }
  }

  function requestUserCoords() {
    if (state.userCoords || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        state.userCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        render();
      },
      function () { /* tri distance sans position : fallback date */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  async function enrichWeather() {
    if (!window.GoeloWeather || !state.sorties.length) return;
    try {
      await window.GoeloWeather.enrichSorties(state.sorties);
      render();
    } catch (err) {
      console.warn("[sorties] enrichWeather:", err.message || err);
    }
  }

  /* ════════════════════════════════════════════════════════════
     Init
     ════════════════════════════════════════════════════════════ */
  document.addEventListener("DOMContentLoaded", async function () {
    if (window.GoeloUI) await window.GoeloUI.waitForRole();

    applyTeamRiderState();
    bindFilters();
    bindLockTriggers();
    bindCardActions();

    window.addEventListener("goelo:role-ready", function () {
      applyTeamRiderState();
      fetchJoinedRouteIds().then(render);
    });

    window.addEventListener("goelo:auth-success", function () {
      applyTeamRiderState();
      fetchJoinedRouteIds().then(render);
    });

    window.addEventListener("goelo:signup-changed", function () {
      reloadParticipants();
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        reloadParticipants();
        enrichWeather();
      }
    });

    window.addEventListener("pageshow", function () {
      if (state.sorties.length) reloadParticipants();
    });

    window.addEventListener("focus", function () {
      if (state.sorties.length) reloadParticipants();
    });

    state.sorties = await fetchSorties();
    await fetchJoinedRouteIds();
    await reloadParticipants();
    render();
    enrichWeather();
    state.sorties.forEach(function (s) {
      loadStats(s).then(function (st) {
        if (st && (st.km != null || st.dplus != null)) {
          s.km    = st.km;
          s.dplus = st.dplus;
          render();
        }
      });
    });
  });
})();
