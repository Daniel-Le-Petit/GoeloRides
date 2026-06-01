/**
 * Page « Sorties » — charge les mêmes routes que index.html (parcours fixes + Supabase).
 * Colle window.GOELO_SUPABASE_URL et window.GOELO_SUPABASE_ANON_KEY dans sorties.html
 * (comme sur index.html) pour les sorties custom et les comptes d’inscrits.
 */
(function () {
  const GPX_MAX_POINTS = 6000;

  const ROUTES_BUILTIN = [
    {
      id: "falaises",
      thumbSrc: "assets/groupe-blanc-cyclistes.png",
      file: "La Route des Falaises.gpx",
      color: "#e8e8e8",
      casingColor: "#4b5563",
      name: "Groupe Blanc",
      track: "La Route des Falaises",
      pace: "15–18 km/h",
      levelClass: "level-blanc",
      levelLabel: "Découverte",
      vibe: "Convivial",
      shortDesc: "Falaises et villages côtiers · rythme tranquille",
      depart: {
        day: "7",
        month: "JUILLET",
        year: "2026",
        weekday: "Mar",
        dateLabel: "7 juillet 2026 · 8h30"
      },
      meetPlace: "Devant le Kasino",
      cities: [
        { name: "Saint-Quay-Portrieux", lat: 48.6539, lon: -2.8384, start: true },
        { name: "Plouha", lat: 48.6728, lon: -2.903 },
        { name: "Bréhec", lat: 48.7276, lon: -2.9489 },
        { name: "Binic", lat: 48.6077, lon: -2.8296 }
      ]
    },
    {
      id: "brehec",
      thumbSrc: "assets/groupe-vert-cyclistes.png",
      file: "Bréhec.gpx",
      color: "#2e7d52",
      casingColor: "#14532d",
      name: "Groupe Vert",
      track: "Vers Bréhec",
      pace: "18–22 km/h",
      levelClass: "level-vert",
      levelLabel: "Intermédiaire",
      vibe: "Convivial",
      shortDesc: "Littoral et Bréhec · rythme régulier sans pression",
      depart: {
        day: "21",
        month: "JUILLET",
        year: "2026",
        weekday: "Mar",
        dateLabel: "21 juillet 2026 · 8h30"
      },
      meetPlace: "Devant le Kasino",
      cities: [
        { name: "Saint-Quay-Portrieux", lat: 48.6539, lon: -2.8384, start: true },
        { name: "Plouha", lat: 48.6728, lon: -2.903 },
        { name: "Bréhec", lat: 48.7276, lon: -2.9489 },
        { name: "Binic", lat: 48.6077, lon: -2.8296 }
      ]
    },
    {
      id: "boucle",
      thumbSrc: "assets/groupe-bleu-cyclistes.png",
      file: "La Grande Boucle du Goëlo.gpx",
      color: "#2563eb",
      name: "Groupe Bleu",
      track: "La Grande Boucle du Goëlo",
      pace: "22–26 km/h",
      levelClass: "level-bleu",
      levelLabel: "Confirmé",
      vibe: "Rouleur",
      shortDesc: "Grande boucle du Goëlo · parcours long et soutenu",
      depart: {
        day: "14",
        month: "JUILLET",
        year: "2026",
        weekday: "Mar",
        dateLabel: "14 juillet 2026 · 8h30"
      },
      meetPlace: "Devant le Kasino",
      cities: [
        { name: "Saint-Quay-Portrieux", lat: 48.6536, lon: -2.8353, start: true },
        { name: "Lantic", lat: 48.5976, lon: -2.899 },
        { name: "Plélo", lat: 48.5333, lon: -2.932 },
        { name: "Goudelin", lat: 48.6025, lon: -3.0194 },
        { name: "Pléguien", lat: 48.6218, lon: -2.9349 },
        { name: "Binic", lat: 48.6077, lon: -2.8296 }
      ]
    }
  ];

  const DEFAULT_MEET_PLACE = "Devant le Kasino";
  const LOCAL_SIGNUPS_KEY = "goeloRides_inscriptions_v1";

  const FR_MONTHS = {
    janvier: 1,
    février: 2,
    fevrier: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    août: 8,
    aout: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    décembre: 12,
    decembre: 12
  };

  function normalizeApiKey(raw) {
    let k = raw == null ? "" : String(raw).trim().replace(/\s/g, "");
    if (k.indexOf("sb_publishedable_") === 0) {
      console.warn("Goëlo : préfixe de clé Supabase à corriger (publishable).");
    }
    return k;
  }

  function getSupabaseConfig() {
    const url =
      typeof window !== "undefined"
        ? String(window.GOELO_SUPABASE_URL || "")
            .trim()
            .replace(/\s/g, "")
        : "";
    const anonKey =
      typeof window !== "undefined" ? normalizeApiKey(window.GOELO_SUPABASE_ANON_KEY) : "";
    return { url: url, anonKey: anonKey };
  }

  function isSupabaseEnabled() {
    const c = getSupabaseConfig();
    return !!(c.url && c.anonKey);
  }

  var goeloLastRpcFailure = null;

  async function supabaseRpc(fnName, payload) {
    goeloLastRpcFailure = null;
    const { url, anonKey } = getSupabaseConfig();
    if (!url || !anonKey) return null;
    if (url.indexOf("xxxxxxxx.supabase.co") !== -1) return null;
    const base = url.replace(/\/?$/, "");
    let res;
    try {
      res = await fetch(base + "/rest/v1/rpc/" + encodeURIComponent(fnName), {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: "Bearer " + anonKey,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(payload || {})
      });
    } catch (err) {
      goeloLastRpcFailure = { code: 36, httpStatus: 0, fnName: fnName };
      console.warn("Supabase RPC", fnName, err);
      return null;
    }
    if (!res.ok) {
      goeloLastRpcFailure = { code: 37, httpStatus: res.status, fnName: fnName };
      return null;
    }
    if (res.status === 204) {
      goeloLastRpcFailure = { code: 38, httpStatus: res.status, fnName: fnName };
      return null;
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      goeloLastRpcFailure = { code: 38, httpStatus: res.status, fnName: fnName };
      return null;
    }
    try {
      return await res.json();
    } catch (e) {
      goeloLastRpcFailure = { code: 39, httpStatus: res.status, fnName: fnName };
      return null;
    }
  }

  function dbRowToRoute(row) {
    const fc = row && row.front_config && typeof row.front_config === "object" ? row.front_config : {};
    return {
      id: row.id,
      file: String(fc.file || "").trim(),
      embeddedPoints: Array.isArray(fc.embeddedPoints) ? fc.embeddedPoints : undefined,
      raceType: fc.raceType || "",
      coverImageDataUrl: typeof fc.coverImageDataUrl === "string" ? fc.coverImageDataUrl : "",
      coverImageUrl: typeof fc.coverImageUrl === "string" ? String(fc.coverImageUrl).trim() : "",
      thumbSrc: typeof fc.thumbSrc === "string" ? String(fc.thumbSrc).trim() : "",
      color: fc.color || "#3d8b8b",
      casingColor: fc.casingColor || "#2d6b6b",
      name: row.group_label || "Sortie",
      track: row.track_name,
      pace: row.pace_label || "—",
      levelClass: fc.levelClass || "level-bleu",
      levelLabel: fc.levelLabel || (row.group_label || "—"),
      vibe: fc.vibe || "",
      shortDesc: fc.shortDesc || "",
      depart: fc.depart && typeof fc.depart === "object"
        ? fc.depart
        : {
            day: "",
            month: "",
            year: "2026",
            weekday: "",
            dateLabel: String(fc.dateLabel || row.track_name || "")
          },
      meetPlace:
        typeof fc.meetPlace === "string" && fc.meetPlace.trim()
          ? fc.meetPlace.trim()
          : DEFAULT_MEET_PLACE,
      cities: Array.isArray(fc.cities) && fc.cities.length
        ? fc.cities
        : [{ name: "Saint-Quay-Portrieux", lat: 48.6536, lon: -2.8353, start: true }],
      routeKind: row.route_kind || "custom"
    };
  }

  async function fetchCustomRoutesFromSupabase() {
    if (!isSupabaseEnabled()) return [];
    const rows = await supabaseRpc("routes_list", { p_filter: {} });
    if (!Array.isArray(rows)) return [];
    const builtIds = {};
    ROUTES_BUILTIN.forEach(function (r) {
      builtIds[r.id] = true;
    });
    const out = [];
    rows.forEach(function (row) {
      if (!row || !row.id || builtIds[row.id]) return;
      if (row.route_kind !== "custom") return;
      out.push(dbRowToRoute(row));
    });
    return out;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const p = Math.PI / 180;
    const a =
      Math.pow(Math.sin((lat2 - lat1) * p / 2), 2) +
      Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.pow(Math.sin((lon2 - lon1) * p / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function parseGpxTrack(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) return [];
    const points = [];
    const nodes = doc.getElementsByTagName("*");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const tag = el.localName || el.nodeName.split(":").pop();
      if (tag !== "trkpt" && tag !== "rtept") continue;
      const lat = parseFloat(el.getAttribute("lat"));
      const lon = parseFloat(el.getAttribute("lon"));
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      let ele = null;
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
        const n = c.localName || c.nodeName.split(":").pop();
        if (n === "ele" && c.textContent) {
          const v = parseFloat(c.textContent.trim());
          if (!Number.isNaN(v)) ele = v;
          break;
        }
      }
      if (ele !== null) points.push({ lat: lat, lon: lon, ele: ele });
      else points.push({ lat: lat, lon: lon });
    }
    return points;
  }

  function fillElevationGaps(points) {
    const n = points.length;
    if (!n) return [];
    const hasAny = points.some(function (p) {
      return typeof p.ele === "number" && !Number.isNaN(p.ele);
    });
    if (!hasAny) {
      return points.map(function (p) {
        return { lat: p.lat, lon: p.lon };
      });
    }
    const out = points.map(function (p) {
      return {
        lat: p.lat,
        lon: p.lon,
        ele: typeof p.ele === "number" && !Number.isNaN(p.ele) ? p.ele : null
      };
    });
    let first = -1;
    let last = -1;
    for (let i = 0; i < n; i++) {
      if (out[i].ele !== null) {
        if (first < 0) first = i;
        last = i;
      }
    }
    if (first < 0) {
      return out.map(function (p) {
        return { lat: p.lat, lon: p.lon };
      });
    }
    for (let i = 0; i < first; i++) out[i].ele = out[first].ele;
    for (let i = last + 1; i < n; i++) out[i].ele = out[last].ele;
    let i = first;
    while (i < last) {
      let j = i + 1;
      while (j <= last && out[j].ele === null) j++;
      if (j > last) break;
      const e0 = out[i].ele;
      const e1 = out[j].ele;
      const steps = j - i;
      for (let k = 1; k < steps; k++) {
        out[i + k].ele = e0 + (e1 - e0) * (k / steps);
      }
      i = j;
    }
    return out;
  }

  function simplifyTrack(points, maxPoints) {
    if (points.length <= maxPoints) return points.slice();
    const step = Math.ceil(points.length / maxPoints);
    const out = [points[0]];
    for (let i = step; i < points.length - 1; i += step) out.push(points[i]);
    out.push(points[points.length - 1]);
    return out;
  }

  function computeElevationGainM(points) {
    if (!points || points.length < 2) return null;
    let gain = 0;
    let any = false;
    for (let i = 1; i < points.length; i++) {
      const e0 = points[i - 1].ele;
      const e1 = points[i].ele;
      if (typeof e0 !== "number" || typeof e1 !== "number" || Number.isNaN(e0) || Number.isNaN(e1)) continue;
      any = true;
      const d = e1 - e0;
      if (d > 0) gain += d;
    }
    return any ? Math.round(gain) : null;
  }

  function buildTrack(points) {
    const filled = fillElevationGaps(points);
    let distM = 0;
    for (let i = 1; i < filled.length; i++) {
      distM += haversine(filled[i - 1].lat, filled[i - 1].lon, filled[i].lat, filled[i].lon);
    }
    return {
      points: filled,
      totalKm: distM / 1000,
      elevGainM: computeElevationGainM(filled)
    };
  }

  function deserializeEmbeddedPointRow(r) {
    if (!Array.isArray(r) || r.length < 2) return null;
    const lat = r[0];
    const lon = r[1];
    const ele = r.length > 2 && r[2] != null && !Number.isNaN(Number(r[2])) ? Number(r[2]) : undefined;
    return { lat: lat, lon: lon, ele: ele };
  }

  function profileFromEmbeddedRows(rows) {
    if (!rows || !rows.length) return null;
    const pts = rows.map(deserializeEmbeddedPointRow).filter(Boolean);
    if (pts.length < 2) return null;
    return buildTrack(pts);
  }

  async function loadGpxTrack(url) {
    try {
      const res = await fetch(encodeURI(url));
      if (!res.ok) return null;
      const pts = simplifyTrack(parseGpxTrack(await res.text()), GPX_MAX_POINTS);
      return pts.length ? buildTrack(pts) : null;
    } catch {
      return null;
    }
  }

  async function loadRouteProfile(cfg) {
    const emb = cfg && cfg.embeddedPoints;
    if (emb && Array.isArray(emb) && emb.length >= 2) {
      const prof = profileFromEmbeddedRows(emb);
      if (prof && prof.points && prof.points.length) return prof;
    }
    const file = cfg && cfg.file != null ? String(cfg.file).trim() : "";
    if (file) return loadGpxTrack(file);
    return null;
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
    const rx = /(\d{1,2})\s+([a-zéèêëàâùûôîïçA-ZÉÈÊËÀÂÙÛÔÎÏÇ]+)\s+(\d{4})/;
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
    const d = route.depart || {};
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
        const meet = escapeHtml(route.meetPlace || DEFAULT_MEET_PLACE);
        const paceEsc = escapeHtml(route.pace || "—");
        const shortDescEsc = route.shortDesc ? escapeHtml(route.shortDesc) : "";
        const typeLine =
          '<span class="sorties-pill sorties-pill--type' + typeExtra + '">' + escapeHtml(meta.label) + "</span>" +
          (shortDescEsc ? '<span class="sorties-type-desc"> · ' + shortDescEsc + "</span>" : "");
        const registered = isUserRegistered(route.id, regState);
        const regBlock = registered
          ? '<span class="sorties-reg sorties-reg--ok">Inscrit·e ✓</span>'
          : '<span class="sorties-reg">J’en suis ?</span>';
        const sortieHref = "sortie.html?id=" + encodeURIComponent(String(route.id));
        html +=
          '<li>' +
          '<a class="sorties-card sorties-card--' +
          railMod +
          '" href="' +
          escapeAttr(sortieHref) +
          '">' +
          '<div class="sorties-card-thumb"><img src="' +
          escapeAttr(thumb) +
          '" alt="" loading="lazy" decoding="async"></div>' +
          '<div class="sorties-card-rail sorties-card-rail--' +
          railMod +
          '" aria-hidden="true">' +
          '<span class="sorties-rail-day">' +
          escapeHtml(d.day || "—") +
          "</span>" +
          '<span class="sorties-rail-month">' +
          escapeHtml(d.month || "") +
          "</span>" +
          '<span class="sorties-rail-time">' +
          timeDisp +
          "</span></div>" +
          '<div class="sorties-card-body sorties-card-body--' +
          railMod +
          '">' +
          '<h3 class="sorties-card-title">' +
          escapeHtml(route.track) +
          "</h3>" +
          '<p class="sorties-card-type-line">' +
          typeLine +
          "</p>" +
          '<div class="sorties-card-hero-stats" aria-label="Distance et dénivelé">' +
          '<span class="sorties-hero-km">' +
          escapeHtml(km) +
          "</span>" +
          '<span class="sorties-hero-sep" aria-hidden="true"></span>' +
          '<span class="sorties-hero-dplus">' +
          escapeHtml(dpl) +
          "</span></div>" +
          '<div class="sorties-card-details">' +
          '<p class="sorties-card-line"><strong>Départ</strong> · ' +
          meet +
          "</p>" +
          '<p class="sorties-card-line"><strong>Allure</strong> · ' +
          paceEsc +
          "</p>" +
          '<p class="sorties-card-levelrow">' +
          '<span class="sorties-level-dot sorties-level-dot--' +
          tone +
          '" aria-hidden="true"></span>' +
          '<span class="sorties-level-text">· ' +
          escapeHtml(route.levelLabel || "—") +
          "</span></p></div></div>" +
          '<div class="sorties-card-aside sorties-card-aside--' +
          railMod +
          '">' +
          regBlock +
          '<span class="sorties-card-chev" aria-hidden="true">›</span></div>' +
          "</a></li>";
      });
      html += "</ul>";
    });

    if (!keys.length) {
      html = '<p class="sorties-empty">Aucune sortie pour ce filtre.</p>';
    }
    host.innerHTML = html;
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const listEl = document.getElementById("sorties-list");
    const typeSel = document.getElementById("sorties-filter-type");
    const levelSel = document.getElementById("sorties-filter-level");
    const statusSel = document.getElementById("sorties-filter-status");
    if (!listEl) return;

    let routesAll = [];
    const regState = { supabaseIds: new Set(), localObj: {} };

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

    const extra = await fetchCustomRoutesFromSupabase();
    const merged = ROUTES_BUILTIN.concat(extra);
    const results = await Promise.all(
      merged.map(async function (cfg) {
        const profile = await loadRouteProfile(cfg);
        if (!profile) return null;
        return Object.assign({}, cfg, { profile: profile });
      })
    );
    routesAll = results.filter(function (r) {
      return r !== null;
    });

    await refreshRegState();

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

    [typeSel, levelSel, statusSel].forEach(function (el) {
      if (el) el.addEventListener("change", redraw);
    });

    window.addEventListener("storage", function (ev) {
      if (ev.key === LOCAL_SIGNUPS_KEY || ev.key === "goeloRides_last_email") {
        refreshRegState().then(redraw);
      }
    });

    const calBtn = document.getElementById("sorties-cal-btn");
    if (calBtn) {
      calBtn.addEventListener("click", function () {
        window.alert("Calendrier : à brancher plus tard (export .ics ou vue mensuelle).");
      });
    }

    redraw();
  });
})();
