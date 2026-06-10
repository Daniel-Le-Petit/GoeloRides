/**
 * Page « Sorties » — charge les mêmes routes que index.html (parcours fixes + Supabase).
 * Colle window.GOELO_SUPABASE_URL et window.GOELO_SUPABASE_ANON_KEY dans sorties.html
 * (comme sur index.html) pour les sorties custom et les comptes d'inscrits.
 *
 * Shared utilities live in goelo-supabase-client.js, goelo-routes-data.js,
 * and goelo-gpx-utils.js (loaded earlier via <script> tags).
 */
(function () {
  /* ── Import shared utilities from GoeloShared ── */
  var S = window.GoeloShared;

  var ROUTES_BUILTIN        = S.ROUTES_BUILTIN;
  var LOCAL_SIGNUPS_KEY      = S.LOCAL_SIGNUPS_KEY;
  var FR_MONTHS              = S.FR_MONTHS;
  var isSupabaseEnabled      = S.isSupabaseEnabled;
  var supabaseRpc            = S.supabaseRpc;
  var enrichDepartObject     = S.enrichDepartObject;
  var builtinsVisibleOnSite  = S.builtinsVisibleOnSite;
  var dbRowToRoute           = S.dbRowToRoute;
  var normalizeRoutesListRows = S.normalizeRoutesListRows;
  var loadRouteProfile       = S.loadRouteProfile;

  async function fetchCustomRoutesFromSupabase() {
    if (!isSupabaseEnabled()) return [];
    const raw = await supabaseRpc("routes_list", { p_filter: {} });
    const rows = normalizeRoutesListRows(raw);
    const builtIds = {};
    ROUTES_BUILTIN.forEach(function (r) {
      builtIds[r.id] = true;
    });
    const out = [];
    rows.forEach(function (row) {
      if (!row || !row.id || builtIds[row.id]) return;
      const rk = row.route_kind != null ? row.route_kind : row.routeKind;
      if (rk !== "custom") return;
      out.push(dbRowToRoute(row));
    });
    return out;
  }

  function formatKm(km) {
    return km.toFixed(1).replace(".", ",") + " km";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  /** Pour src/href : ne pas transformer & (sinon data URLs et query cassent). */
  function escapeAttr(s) {
    return String(s || "").replace(/"/g, "&quot;");
  }

  function raceTypeLabel(v) {
    if (v === "gravel") return "Gravel";
    if (v === "vtt" || v === "rtt") return "VTT";
    return "Route";
  }

  /** Étiquette « type » maquette + filtres data-tags (toutes route gravel vtt cafe famille) */
  function sortieTypeMeta(route) {
    const rt = String(route.raceType || "").toLowerCase();
    if (rt === "gravel") return { label: "Gravel", tags: ["gravel"] };
    if (rt === "vtt" || rt === "rtt") return { label: "VTT", tags: ["vtt"] };
    if (route.id === "falaises") return { label: "Route", tags: ["route", "famille"] };
    return { label: "Route", tags: ["route"] };
  }

  function monthKeyFromRoute(route) {
    const d = route.depart || {};
    if (d.month && d.year) {
      const m = FR_MONTHS[String(d.month).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
      if (m) return String(d.year) + "-" + String(m).padStart(2, "0");
    }
    const label = String(d.dateLabel || "");
    const rx = /(\d{1,2})(?:er)?\s+([a-zéèêëàâùûôîïçA-ZÉÈÊËÀÂÙÛÔÎÏÇ]+)\s+(\d{4})/;
    const m = label.match(rx);
    if (m) {
      const mo = FR_MONTHS[m[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
      if (mo) return m[3] + "-" + String(mo).padStart(2, "0");
    }
    return "2099-12";
  }

  function monthTitleFromKey(key) {
    const parts = key.split("-");
    if (parts.length !== 2) return "Sorties";
    const y = parts[0];
    const mo = parseInt(parts[1], 10);
    const names = [
      "",
      "JANVIER",
      "FÉVRIER",
      "MARS",
      "AVRIL",
      "MAI",
      "JUIN",
      "JUILLET",
      "AOÛT",
      "SEPTEMBRE",
      "OCTOBRE",
      "NOVEMBRE",
      "DÉCEMBRE"
    ];
    return (names[mo] || "MOIS") + " " + y;
  }

  const FALLBACK_THUMB_BY_HASH = [
    "https://images.unsplash.com/photo-1541625602330-b227f81169aa?auto=format&fit=crop&w=480&h=300&q=75",
    "https://images.unsplash.com/photo-1517649763962-0c6230660131?auto=format&fit=crop&w=480&h=300&q=75",
    "https://images.unsplash.com/photo-1571068316344-75bc76f77890?auto=format&fit=crop&w=480&h=300&q=75",
    "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?auto=format&fit=crop&w=480&h=300&q=75"
  ];

  function thumbForRoute(route) {
    const local = route.thumbSrc && String(route.thumbSrc).trim();
    if (local) return local;
    const data = route.coverImageDataUrl && String(route.coverImageDataUrl).trim();
    if (data && data.indexOf("data:") === 0) return data;
    const http = route.coverImageUrl && String(route.coverImageUrl).trim();
    if (http && /^https?:\/\//i.test(http)) return http;
    let h = 0;
    const id = String(route.id || "");
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return FALLBACK_THUMB_BY_HASH[h % FALLBACK_THUMB_BY_HASH.length];
  }

  function levelToneClass(levelClass) {
    if (levelClass === "level-blanc") return "is-blanc";
    if (levelClass === "level-vert") return "is-vert";
    if (levelClass === "level-bleu") return "is-bleu";
    if (levelClass === "level-rouge") return "is-rouge";
    return "is-bleu";
  }

  function getLastStoredEmail() {
    try {
      const last = JSON.parse(localStorage.getItem("goeloRides_last_email") || '""');
      return typeof last === "string" ? last : "";
    } catch {
      return "";
    }
  }

  function loadLocalSignupsObject() {
    try {
      const raw = localStorage.getItem(LOCAL_SIGNUPS_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }

  function isRegisteredLocal(routeId, email, localObj) {
    const norm = (email || "").trim().toLowerCase();
    if (!norm) return false;
    const arr = localObj[routeId];
    if (!Array.isArray(arr)) return false;
    return arr.some(function (e) {
      return ((e && e.email) || "").trim().toLowerCase() === norm;
    });
  }

  function isUserRegistered(routeId, regState) {
    const em = getLastStoredEmail().trim().toLowerCase();
    if (!em) return false;
    if (isSupabaseEnabled()) return regState.supabaseIds.has(String(routeId));
    return isRegisteredLocal(routeId, em, regState.localObj);
  }

  function departTimeDisplay(route) {
    const label = String((route.depart && route.depart.dateLabel) || "");
    const m = label.match(/[·.]\s*(\d{1,2}h\d{2})/);
    if (m) return m[1];
    const m2 = label.match(/(\d{1,2}h\d{2})/);
    return m2 ? m2[1] : "8h30";
  }

  function sortTsFromRoute(route) {
    const d = enrichDepartObject(route.depart || {}, "");
    const y = parseInt(String(d.year || "2099").trim(), 10) || 2099;
    let monthNum = 1;
    if (d.month) {
      const mk = FR_MONTHS[String(d.month).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
      if (mk) monthNum = mk;
    }
    const day = parseInt(String(d.day || "1").replace(/\D/g, "") || "1", 10) || 1;
    const label = String(d.dateLabel || "");
    const tm = label.match(/(\d{1,2})h(\d{2})/);
    let hh = 8;
    let mm = 30;
    if (tm) {
      hh = parseInt(tm[1], 10) || 8;
      mm = parseInt(tm[2], 10) || 0;
    }
    return new Date(y, monthNum - 1, day, hh, mm).getTime();
  }

  function railModifierFromLevel(levelClass) {
    if (levelClass === "level-blanc") return "blanc";
    if (levelClass === "level-vert") return "vert";
    if (levelClass === "level-bleu") return "bleu";
    if (levelClass === "level-rouge") return "rouge";
    return "bleu";
  }

  function renderCards(routes, activeFilter, activeLevel, activeStatus, regState) {
    const host = document.getElementById("sorties-list");
    if (!host) return;
    const cardBadges =
      typeof window.__goeloLastCardBadges === "object" && window.__goeloLastCardBadges != null
        ? window.__goeloLastCardBadges
        : {};
    function cardEncartHtml(route) {
      const st = String((route.sortieStatus != null ? route.sortieStatus : "") || "open").toLowerCase();
      if (st === "cancelled") {
        return '<span class="sorties-card-encart sorties-card-encart--cancelled" role="status">Annulée</span>';
      }
      const bid = String(route.id);
      if (cardBadges[bid] === "new") {
        return '<span class="sorties-card-encart sorties-card-encart--new" role="status">New</span>';
      }
      if (cardBadges[bid] === "updated") {
        return '<span class="sorties-card-encart sorties-card-encart--change" role="status">Changement</span>';
      }
      return "";
    }
    const now = Date.now();
    const filtered = routes.filter(function (r) {
      if (activeLevel !== "tous" && r.levelClass !== activeLevel) return false;
      if (activeFilter === "toutes") {
        /* ok */
      } else {
        const meta = sortieTypeMeta(r);
        if (activeFilter === "cafe") {
          if (meta.tags.indexOf("cafe") < 0) return false;
        } else if (meta.tags.indexOf(activeFilter) < 0) return false;
      }
      if (activeStatus === "a-venir") {
        if (sortTsFromRoute(r) <= now) return false;
      } else if (activeStatus === "passee") {
        if (sortTsFromRoute(r) >= now) return false;
      } else if (activeStatus === "inscrit") {
        if (!isUserRegistered(r.id, regState)) return false;
      }
      return true;
    });

    const sorted = filtered.slice().sort(function (a, b) {
      return sortTsFromRoute(a) - sortTsFromRoute(b);
    });

    const byMonth = {};
    sorted.forEach(function (r) {
      const k = monthKeyFromRoute(r);
      if (!byMonth[k]) byMonth[k] = [];
      byMonth[k].push(r);
    });
    const keys = Object.keys(byMonth).sort();

    let html = "";
    keys.forEach(function (key) {
      const list = byMonth[key];
      html += '<h2 class="sorties-month-title">' + escapeHtml(monthTitleFromKey(key)) + "</h2>";
      html += '<ul class="sorties-card-list">';
      list.forEach(function (route) {
        const prof = route.profile;
        const km = prof ? formatKm(prof.totalKm) : "—";
        const dpl =
          prof && prof.elevGainM != null && prof.elevGainM > 5
            ? String(Math.round(prof.elevGainM)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " m D+"
            : "—";
        const meta = sortieTypeMeta(route);
        const thumb = thumbForRoute(route);
        const tone = levelToneClass(route.levelClass);
        const railMod = railModifierFromLevel(route.levelClass);
        const typeExtra = meta.label === "Gravel" ? " is-gravel" : meta.label === "VTT" ? " is-vtt" : "";
        const d = route.depart || {};
        const timeDisp = escapeHtml(departTimeDisplay(route));
        const shortDescEsc = route.shortDesc ? escapeHtml(route.shortDesc) : "";
        const registered = isUserRegistered(route.id, regState);
        const encart = cardEncartHtml(route);
        const titleRow =
          '<div class="sorties-card-title-row">' +
          encart +
          '<h3 class="sorties-card-title">' +
          escapeHtml(route.track) +
          "</h3>" +
          (registered
            ? '<span class="sorties-card-inscrit-badge" role="status">Inscrit·e</span>'
            : "") +
          "</div>";
        const typeLine =
          '<span class="sorties-pill sorties-pill--type' + typeExtra + '">' + escapeHtml(meta.label) + "</span>" +
          (shortDescEsc ? '<span class="sorties-type-desc"> · ' + shortDescEsc + "</span>" : "");
        const sortieHref = "sortie.html?id=" + encodeURIComponent(String(route.id));
        const isCustom = route.routeKind === "custom";
        const adminRow =
          isSupabaseEnabled() && isCustom
            ? '<div class="sorties-card-admin-actions">' +
              '<button type="button" class="sorties-card-act sorties-card-act--edit" data-goelo-edit-route-id="' +
              escapeAttr(String(route.id)) +
              '">Modifier</button>' +
              '<button type="button" class="sorties-card-act sorties-card-act--cancel" data-goelo-cancel-route-id="' +
              escapeAttr(String(route.id)) +
              '">Annuler</button>' +
              "</div>"
            : "";
        const voirBlock =
          '<a class="sorties-card-voir" href="' +
          escapeAttr(sortieHref) +
          '">' +
          '<svg class="sorties-card-voir-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>' +
          '<circle fill="none" stroke="currentColor" stroke-width="2" cx="12" cy="12" r="3"/>' +
          "</svg>" +
          '<span class="sorties-card-voir-text">Voir le parcours →</span></a>';
        html +=
          '<li>' +
          '<div class="sorties-card sorties-card--' +
          railMod +
          '">' +
          '<a class="sorties-card-link" href="' +
          escapeAttr(sortieHref) +
          '">' +
          '<div class="sorties-card-thumb-col">' +
          '<div class="sorties-card-thumb"><img src="' +
          escapeAttr(thumb) +
          '" alt="" loading="lazy" decoding="async"></div></div>' +
          '<div class="sorties-card-mid">' +
          '<div class="sorties-card-rail sorties-card-rail--' +
          railMod +
          '">' +
          '<span class="sorties-rail-day">' +
          escapeHtml(d.day || "—") +
          "</span>" +
          '<span class="sorties-rail-month">' +
          escapeHtml(d.month || "") +
          "</span>" +
          '<span class="sorties-rail-time">' +
          timeDisp +
          '</span><span class="sorties-rail-level-dot sorties-level-dot sorties-level-dot--' +
          tone +
          '" aria-hidden="true"></span>' +
          '<span class="sorties-rail-level-label">' +
          escapeHtml(route.levelLabel || "—") +
          "</span></div>" +
          '<div class="sorties-card-body sorties-card-body--' +
          railMod +
          '">' +
          titleRow +
          '<div class="sorties-card-hero-stats" aria-label="Distance et dénivelé">' +
          '<span class="sorties-hero-km">' +
          escapeHtml(km) +
          "</span>" +
          '<span class="sorties-hero-sep" aria-hidden="true"></span>' +
          '<span class="sorties-hero-dplus">' +
          escapeHtml(dpl) +
          "</span></div>" +
          '<p class="sorties-card-type-line">' +
          typeLine +
          "</p>" +
          '<div class="sorties-card-details">' +
          '<p class="sorties-card-levelrow">' +
          '<span class="sorties-level-dot sorties-level-dot--' +
          tone +
          '" aria-hidden="true"></span>' +
          '<span class="sorties-level-text">· ' +
          escapeHtml(route.levelLabel || "—") +
          "</span></p></div></div></div></a>" +
          '<div class="sorties-card-aside sorties-card-aside--' +
          railMod +
          '">' +
          voirBlock +
          adminRow +
          '<span class="sorties-card-chev" aria-hidden="true">›</span></div>' +
          "</div></li>";
      });
      html += "</ul>";
    });

    if (!keys.length) {
      html =
        '<p class="sorties-empty" role="status">Aucune sortie pour ce filtre.</p>';
    }
    host.innerHTML = html;
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const listEl = document.getElementById("sorties-list");
    const typeSel = document.getElementById("sorties-filter-type");
    const levelSel = document.getElementById("sorties-filter-level");
    const statusSel = document.getElementById("sorties-filter-status");
    if (!listEl) return;

    const INSTA_HREF = "https://www.instagram.com/goelo.rides/";
    const instaAT =
      '<a href="' +
      escapeAttr(INSTA_HREF) +
      '" target="_blank" rel="noopener">@goelo.rides</a>';

    function showTotalEmpty() {
      listEl.innerHTML =
        '<p class="sorties-empty" role="status">Pas encore de sorties programmées — reviens bientôt.</p>';
    }

    function showNetworkOrTimeout() {
      listEl.innerHTML =
        '<div class="sorties-state-msg" role="alert">' +
        "<p>Impossible de charger les sorties pour l'instant.</p>" +
        "<p>Contacte-nous sur Instagram → " +
        instaAT +
        "</p></div>";
    }

    function showLoading() {
      listEl.innerHTML =
        '<p class="sorties-empty" id="sorties-loading-msg">Chargement des sorties…</p>';
    }

    let routesAll = [];
    const regState = { supabaseIds: new Set(), localObj: {} };
    let loadFailed = false;
    let slowTimer = null;
    let loadDone = false;

    async function refreshRegState() {
      regState.localObj = loadLocalSignupsObject();
      const em = getLastStoredEmail().trim().toLowerCase();
      if (isSupabaseEnabled() && em) {
        const data = await supabaseRpc("signup_list_registered_routes", { p_email: em });
        const routes = data && data.routes;
        regState.supabaseIds = new Set(
          Array.isArray(routes) ? routes.map(function (x) { return String(x); }) : []
        );
      } else {
        regState.supabaseIds = new Set();
      }
    }

    async function loadAllRoutes() {
      if (isSupabaseEnabled()) {
        const hid = await supabaseRpc("goelo_hidden_builtin_ids", {});
        S.serverHiddenBuiltinIds = Array.isArray(hid)
          ? hid.map(function (x) { return String(x).trim(); }).filter(Boolean)
          : [];
      } else {
        S.serverHiddenBuiltinIds = [];
      }
      const extra = await fetchCustomRoutesFromSupabase();
      const merged = builtinsVisibleOnSite().concat(extra);
      const results = await Promise.all(
        merged.map(async function (cfg) {
          const profile = await loadRouteProfile(cfg);
          if (!profile) return null;
          return Object.assign({}, cfg, { profile: profile });
        })
      );
      return results.filter(function (r) {
        return r !== null;
      });
    }

    showLoading();
    slowTimer = window.setTimeout(function () {
      if (!loadDone && listEl.querySelector("#sorties-loading-msg")) {
        showNetworkOrTimeout();
      }
    }, 8000);

    try {
      routesAll = await loadAllRoutes();
      await refreshRegState();
    } catch (e) {
      loadFailed = true;
      console.warn("Sorties : chargement", e);
    } finally {
      loadDone = true;
      if (slowTimer) {
        window.clearTimeout(slowTimer);
        slowTimer = null;
      }
    }

    if (loadFailed) {
      showNetworkOrTimeout();
      return;
    }

    if (!routesAll.length) {
      showTotalEmpty();
      return;
    }

    refreshFingerprintBadges();

    function readFilterState() {
      return {
        activeFilter: (typeSel && typeSel.value) || "toutes",
        activeLevel: (levelSel && levelSel.value) || "tous",
        activeStatus: (statusSel && statusSel.value) || "toutes"
      };
    }

    function redraw() {
      const st = readFilterState();
      renderCards(routesAll, st.activeFilter, st.activeLevel, st.activeStatus, regState);
    }

    function refreshFingerprintBadges() {
      if (window.goeloRideUpdatesProcessList) {
        const upd = window.goeloRideUpdatesProcessList(routesAll);
        window.__goeloLastCardBadges = (upd && upd.cardBadges) || {};
      } else {
        window.__goeloLastCardBadges = {};
      }
    }

    if (!listEl.dataset.goeloSortiesActionsBound) {
      listEl.dataset.goeloSortiesActionsBound = "1";
      listEl.addEventListener("click", function (e) {
        const ed = e.target.closest("[data-goelo-edit-route-id]");
        if (ed) {
          e.preventDefault();
          e.stopPropagation();
          const rid = ed.getAttribute("data-goelo-edit-route-id");
          if (rid && typeof window.__goeloOpenNewRouteEditorFromList === "function") {
            void window.__goeloOpenNewRouteEditorFromList(rid);
          } else if (rid) {
            window.alert("Patiente une seconde puis réessaie (chargement du module).");
          }
          return;
        }
        const cx = e.target.closest("[data-goelo-cancel-route-id]");
        if (cx) {
          e.preventDefault();
          e.stopPropagation();
          const rid2 = cx.getAttribute("data-goelo-cancel-route-id");
          if (rid2 && typeof window.__goeloQuickCancelSortieFromList === "function") {
            void window.__goeloQuickCancelSortieFromList(rid2);
          } else if (rid2) {
            window.alert("Patiente une seconde puis réessaie (chargement du module).");
          }
        }
      });
    }

    window.addEventListener("goelo-routes-need-refresh", function () {
      if (loadFailed) return;
      void (async function () {
        try {
          routesAll = await loadAllRoutes();
          refreshFingerprintBadges();
          redraw();
        } catch (err) {
          console.warn("Sorties : rafraîchissement", err);
        }
      })();
    });

    [typeSel, levelSel, statusSel].forEach(function (el) {
      if (el) el.addEventListener("change", redraw);
    });

    window.addEventListener("storage", function (ev) {
      if (ev.key === LOCAL_SIGNUPS_KEY || ev.key === "goeloRides_last_email") {
        refreshRegState().then(redraw);
      }
    });

    window.addEventListener("goelo-user-session-updated", function () {
      refreshRegState().then(redraw);
    });

    redraw();
  });
})();
