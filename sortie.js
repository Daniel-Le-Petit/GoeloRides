(function () {
  const GPX_MAX_POINTS = 6000;

  const ROUTES_BUILTIN = [
    {
      id: "falaises",
      thumbSrc: "assets/groupe-blanc-cyclistes.jpg",
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

  var serverHiddenBuiltinIds = [];

  function mergeHiddenBuiltinIdsSet() {
    const hide = {};
    serverHiddenBuiltinIds.forEach(function (id) {
      hide[String(id).trim()] = true;
    });
    if (
      typeof window !== "undefined" &&
      window.GOELO_SKIP_BUILTIN_IDS &&
      Array.isArray(window.GOELO_SKIP_BUILTIN_IDS)
    ) {
      window.GOELO_SKIP_BUILTIN_IDS.forEach(function (id) {
        hide[String(id).trim()] = true;
      });
    }
    return hide;
  }

  function builtinsVisibleOnSite() {
    const hide = mergeHiddenBuiltinIdsSet();
    return ROUTES_BUILTIN.filter(function (r) {
      return !hide[String(r.id)];
    });
  }

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

  const FR_MONTH_NAMES_UPPER = [
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

  function normalizeMonthWordForDisplay(monthWord) {
    const lower = String(monthWord || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const idx = FR_MONTHS[lower];
    if (!idx) return String(monthWord || "").trim().toUpperCase();
    return FR_MONTH_NAMES_UPPER[idx] || String(monthWord || "").trim().toUpperCase();
  }

  /** Ex. « 7 juillet 2026 · 8h30 » ou « 1er juillet 2026 » */
  function parseFrenchDateLabelParts(label) {
    const raw = String(label || "").trim();
    if (!raw) return null;
    const rx = /(\d{1,2})(?:er)?\s+([a-zéèêëàâùûôîïçA-ZÉÈÊËÀÂÙÛÔÎÏÇ]+)\s+(\d{4})/;
    const m = raw.match(rx);
    if (!m) return null;
    const day = String(parseInt(m[1], 10));
    const year = String(parseInt(m[3], 10));
    const month = normalizeMonthWordForDisplay(m[2]);
    if (!month) return null;
    return { day: day, month: month, year: year };
  }

  function enrichDepartObject(depart, dateLabelFallback) {
    const d =
      depart && typeof depart === "object"
        ? Object.assign({}, depart)
        : { day: "", month: "", year: "", weekday: "", dateLabel: "" };
    const label = String(d.dateLabel || dateLabelFallback || "").trim();
    if (!d.dateLabel && label) d.dateLabel = label;
    const hasDay = String(d.day || "").trim() !== "";
    const hasMonth = String(d.month || "").trim() !== "";
    if (hasDay && hasMonth) return d;
    const p = parseFrenchDateLabelParts(label);
    if (!p) return d;
    if (!hasDay) d.day = p.day;
    if (!hasMonth) d.month = p.month;
    if (!String(d.year || "").trim()) d.year = p.year;
    return d;
  }

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

  /** Dernier échec transport / HTTP (codes 36–39). Réinitialisé à chaque appel RPC. */
  var goeloLastRpcFailure = null;

  function goeloFormatDbFailureAlert(code, httpStatus) {
    if (code === 41) {
      return (
        "Impossible d’enregistrer dans la mémoire de ce navigateur (quota plein, navigation privée ou blocage).\n\n" +
        "Erreur 41 — contacter l’administrateur ou réessaie après avoir libéré de l’espace."
      );
    }
    var ref = "Erreur " + code;
    if (httpStatus) ref += " (HTTP " + httpStatus + ")";
    ref += " — contacter l’administrateur en communiquant ce code exact.";
    return (
      "La demande n’a pas pu être enregistrée sur le serveur de données (réseau, serveur occupé ou refus).\n\n" +
      ref +
      "\n\nRéessaie plus tard si la connexion semble instable."
    );
  }

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

  function formatMinutesToHm(totalMin) {
    const h = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return String(h) + ":" + String(mm).padStart(2, "0");
  }

  /** Saisie admin : minutes entières ou « H:MM » / « HH:MM » → { minutes, hm } ou null. */
  function parseDurationInputToStore(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10);
      if (!Number.isFinite(n) || n <= 0 || n > 36 * 60) return null;
      return { minutes: n, hm: formatMinutesToHm(n) };
    }
    const m = s.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
    if (m) {
      const hh = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm < 0 || mm > 59 || hh > 36) return null;
      const minutes = hh * 60 + mm;
      if (minutes <= 0) return null;
      return { minutes: minutes, hm: formatMinutesToHm(minutes) };
    }
    return null;
  }

  function routeEffectiveDurationMinutes(route) {
    let min =
      route && route.estimatedDurationMinutes != null && Number.isFinite(Number(route.estimatedDurationMinutes))
        ? Math.round(Number(route.estimatedDurationMinutes))
        : 0;
    const hmRaw =
      route && typeof route.estimatedDurationHm === "string" && route.estimatedDurationHm.trim()
        ? String(route.estimatedDurationHm).trim()
        : "";
    if (hmRaw) {
      const p = parseDurationInputToStore(hmRaw);
      if (p) min = p.minutes;
    }
    return min > 0 ? min : 0;
  }

  /** Texte HTML-échappé pour <dd> (vide si pas de durée). */
  function routeEstimatedDurationDdHtml(route) {
    const min = routeEffectiveDurationMinutes(route);
    if (min <= 0) return "";
    if (min < 60) {
      return escapeHtml("Environ " + min + " min");
    }
    const human = "Environ " + Math.floor(min / 60) + " h " + String(min % 60).padStart(2, "0");
    return escapeHtml(human + " (≈ " + formatMinutesToHm(min) + ")");
  }

  /** Libellé court pour pastille héros, ex. « ≈ 2:30 ». */
  function routeDurationHeroLabel(route) {
    const min = routeEffectiveDurationMinutes(route);
    if (min <= 0) return "";
    return "≈ " + formatMinutesToHm(min);
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
      rideLeader:
        typeof fc.rideLeader === "string" && fc.rideLeader.trim()
          ? fc.rideLeader.trim()
          : typeof fc.ride_leader === "string" && fc.ride_leader.trim()
            ? fc.ride_leader.trim()
            : "",
      depart: enrichDepartObject(
        fc.depart && typeof fc.depart === "object"
          ? fc.depart
          : {
              day: "",
              month: "",
              year: "2026",
              weekday: "",
              dateLabel: String(fc.dateLabel || row.track_name || "")
            },
        String(fc.dateLabel || "").trim()
      ),
      meetPlace:
        typeof fc.meetPlace === "string" && fc.meetPlace.trim()
          ? fc.meetPlace.trim()
          : DEFAULT_MEET_PLACE,
      meetPlaceDetail:
        typeof fc.meetPlaceDetail === "string" && fc.meetPlaceDetail.trim()
          ? fc.meetPlaceDetail.trim()
          : "",
      estimatedDurationHm:
        typeof fc.estimatedDurationHm === "string" && fc.estimatedDurationHm.trim()
          ? String(fc.estimatedDurationHm).trim()
          : "",
      estimatedDurationMinutes: (function () {
        if (typeof fc.estimatedDurationMinutes === "number" && Number.isFinite(fc.estimatedDurationMinutes)) {
          return Math.max(0, Math.round(fc.estimatedDurationMinutes));
        }
        if (typeof fc.estimatedDurationHm === "string" && fc.estimatedDurationHm.trim()) {
          const p = parseDurationInputToStore(fc.estimatedDurationHm);
          return p ? p.minutes : null;
        }
        return null;
      })(),
      maxParticipants:
        typeof fc.maxParticipants === "number" && Number.isFinite(fc.maxParticipants) && fc.maxParticipants > 0
          ? Math.round(fc.maxParticipants)
          : typeof fc.maxParticipants === "string" && String(fc.maxParticipants).trim()
            ? Math.max(0, parseInt(String(fc.maxParticipants).replace(/\D/g, ""), 10) || 0) || null
            : null,
      sortieStatus: typeof fc.sortieStatus === "string" && fc.sortieStatus.trim() ? fc.sortieStatus.trim() : "open",
      visibility: typeof fc.visibility === "string" && fc.visibility.trim() ? fc.visibility.trim() : "public",
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

  function sanitizeSignupCyclistLevel(raw) {
    const c = String(raw || "").trim().toLowerCase();
    if (c === "debutant" || c === "intermediaire" || c === "confirme") return c;
    return "";
  }

  function sanitizeParticipantCity(raw) {
    let s = String(raw || "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
      .replace(/\s+/g, " ");
    if (s.length > 80) s = s.slice(0, 80);
    return s;
  }

  function cyclistLevelLabelFr(code) {
    const c = String(code || "").trim().toLowerCase();
    if (c === "debutant") return "Débutant";
    if (c === "intermediaire") return "Intermédiaire";
    if (c === "confirme") return "Confirmé";
    return "";
  }

  /** Élément renvoyé par signup_list_all_names : chaîne (ancien format) ou { pseudo, cyclist_level, city }. */
  function normalizeParticipantRowRpc(x) {
    if (x == null) return { pseudo: "", cyclist_level: "", city: "" };
    if (typeof x === "string") {
      const p = String(x).trim();
      return { pseudo: p, cyclist_level: "", city: "" };
    }
    if (typeof x === "object") {
      const p = String(x.pseudo != null ? x.pseudo : x.name != null ? x.name : "").trim();
      const cl = sanitizeSignupCyclistLevel(x.cyclist_level);
      const cy = sanitizeParticipantCity(x.city != null ? x.city : x.participant_city);
      return { pseudo: p, cyclist_level: cl, city: cy };
    }
    return { pseudo: "", cyclist_level: "", city: "" };
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

  const SHARED = {
    meetPlace: "Devant le Kasino",
    meetParking: "Parking du Kasino, Saint-Quay-Portrieux",
    meetRv: "8h20",
    region: "Côte du Goëlo",
    time: "8h30"
  };

  const FORM_NOTIFY_EMAIL = "goelo.rides@gmail.com";

  /**
   * Texte FormSubmit `_autoresponse` (confirmation au cycliste), en français.
   * Ignoré par FormSubmit tant que l’envoi reste en `fetch` (AJAX) et `_captcha: false` — voir doc
   * https://formsubmit.co/documentation section _autoresponse.
   */
  const GOELO_FORMSUBMIT_AUTORESPONSE_INSCRIPTION =
    "Bonjour,\n\n" +
    "Nous avons bien reçu ton inscription Goëlo Rides (message automatique).\n\n" +
    "Retrouve le détail sur la page Sorties du site. Pense à vérifier le point de rendez-vous, le niveau et ton matériel avant le départ.\n\n" +
    "À bientôt sur la route,\n" +
    "L’équipe Goëlo Rides";

  var sortiePageRouteRef = null;
  var sortieCommentsPollId = null;

  function departTimeDisplay(route) {
    const label = String((route.depart && route.depart.dateLabel) || "");
    const m = label.match(/[·.]\s*(\d{1,2}h\d{2})/);
    if (m) return m[1];
    const m2 = label.match(/(\d{1,2}h\d{2})/);
    return m2 ? m2[1] : SHARED.time;
  }

  function visibilityLabelSortie(v) {
    const s = String(v || "public").toLowerCase();
    if (s === "private" || s === "prive" || s === "privee") return "Privée";
    if (s === "invitation" || s === "invite" || s === "invitation_only") return "Sur invitation";
    return "Publique";
  }

  function sortieStatusPublicLabel(st) {
    const s = String(st || "open").toLowerCase();
    if (s === "closed" || s === "ferme" || s === "fermée") return "Inscriptions fermées — contacte l’organisation pour toute exception.";
    if (s === "cancelled" || s === "canceled" || s === "annulee" || s === "annulée") return "Cette sortie est annulée.";
    return "";
  }

  function applySortieStatusBanner(route) {
    const el = document.getElementById("sortie-status-banner");
    if (!el) return;
    const msg = sortieStatusPublicLabel(route && route.sortieStatus);
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function levelSlugForHero(levelClass) {
    const lc = String(levelClass || "").toLowerCase();
    if (lc === "level-blanc") return "blanc";
    if (lc === "level-vert") return "vert";
    if (lc === "level-bleu") return "bleu";
    if (lc === "level-rouge") return "rouge";
    return "bleu";
  }

  /** Héros fiche sortie (image + overlay + CTA #sortie-hero-actions inchangé pour le JS). */
  function buildSortieHero(route) {
    const thumb = thumbForRoute(route);
    const slug = levelSlugForHero(route.levelClass);
    const d = route.depart || {};
    const dateLine = (d && d.dateLabel) || "—";
    const timeInTable = departTimeDisplay(route);
    const kmTxt = route.profile ? formatKm(route.profile.totalKm) : "—";
    let dplus = "—";
    if (route.profile && route.profile.elevGainM != null && route.profile.elevGainM > 5) {
      dplus = String(Math.round(route.profile.elevGainM)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " m D+";
    }
    return (
      '<div class="sortie-hero-retheme">' +
      '<div class="sortie-hero-retheme-bg" style="background-image:url(' +
      escapeAttr(thumb) +
      ')"></div>' +
      '<div class="sortie-hero-retheme-scrim" aria-hidden="true"></div>' +
      '<div class="sortie-hero-retheme-inner">' +
      '<span class="sortie-hero-badge sortie-hero-badge--' +
      slug +
      '">' +
      escapeHtml(route.levelLabel || "—") +
      "</span>" +
      '<h1 class="sortie-hero-h1">' +
      escapeHtml(route.track) +
      "</h1>" +
      '<div class="sortie-hero-meta-pills" role="group" aria-label="Date, horaire et parcours">' +
      "<span>" +
      escapeHtml(dateLine) +
      "</span>" +
      "<span>" +
      escapeHtml(timeInTable) +
      "</span>" +
      "<span>" +
      escapeHtml(kmTxt) +
      "</span>" +
      "<span>" +
      escapeHtml(dplus) +
      "</span>" +
      (function () {
        const dur = routeDurationHeroLabel(route);
        return dur ? "<span>" + escapeHtml(dur) + "</span>" : "";
      })() +
      "</div>" +
      '<div id="sortie-hero-actions" class="sortie-hero-actions"></div>' +
      "</div></div>"
    );
  }

  function buildCourseDetailsSortie(route, prof) {
    const kmLine = prof ? formatKm(prof.totalKm) : "— (chargement de la trace…)";
    const lc = route.levelClass || "";
    const isBlanc = lc === "level-blanc";
    const isVert = lc === "level-vert";
    const isBleu = lc === "level-bleu";
    const isRouge = lc === "level-rouge";

    var pacePhil = "";
    if (isBlanc) {
      pacePhil =
        "Allure visée sur le plat : <strong>15–18 km/h</strong> pour que chacun puisse suivre. " +
        "Merci de ne pas augmenter le rythme sans l’accord du groupe : on roule ensemble.";
    } else if (isVert) {
      pacePhil =
        "Allure visée sur le plat : <strong>18–22 km/h</strong>, sans « sprints » sauf accord du groupe. " +
        "On garde un rythme régulier pour que personne ne se retrouve seul.";
    } else if (isBleu) {
      pacePhil =
        "Allure visée sur le plat : <strong>22–26 km/h</strong>, parcours plus long. " +
        "Relais et attentes aux points convenus pour garder le groupe cohérent.";
    } else if (isRouge) {
      pacePhil =
        "Rythme soutenu à très soutenu sur le plat — pour cyclistes à l’aise avec la <strong>longue distance</strong> " +
        "et le <strong>peloton rapide</strong>.";
    } else {
      pacePhil = "Allure adaptée au groupe et au parcours annoncé.";
    }

    var philo = "";
    if (isBlanc) {
      philo =
        "La philosophie du <strong>Groupe Blanc</strong> : on roule à un rythme raisonnable pour que tout le monde prenne du plaisir. " +
        "On part ensemble, on roule ensemble, on rentre ensemble. C’est une sortie <strong>sociale et conviviale</strong>.";
    } else if (isVert) {
      philo =
        "La philosophie du <strong>Groupe Vert</strong> : un cran au-dessus du Blanc, tout en gardant l’esprit <strong>convivial</strong>. " +
        "On roule proprement, on veille les uns sur les autres, on profite du paysage côtier jusqu’à Bréhec.";
    } else if (isBleu) {
      philo =
        "La philosophie du <strong>Groupe Bleu</strong> : rythme soutenu mais respectueux du peloton. " +
        "On s’entraide, on communique, on garde l’esprit d’équipe sur toute la sortie.";
    } else if (isRouge) {
      philo =
        "Pour les <strong>jambes solides</strong> : rythme élevé et enchaînements exigeants. " +
        "Si tu te retrouves ici, c’est que tu aimes te fixer un cap — tout en restant attentif au groupe.";
    } else {
      philo = "Chacun·e roule avec le souci du groupe et du partage de l’effort.";
    }

    return (
      '<div class="sortie-detail">' +
      '<header class="sortie-detail-head"><h2 class="sortie-detail-h">Détail sortie</h2></header>' +
      '<dl class="sortie-facts">' +
      '<div class="sortie-fact"><dt>Parcours</dt><dd>' +
      escapeHtml(route.track) +
      "</dd></div>" +
      '<div class="sortie-fact"><dt>Groupe</dt><dd>' +
      escapeHtml(route.name) +
      " · " +
      escapeHtml(route.pace || "—") +
      "</dd></div>" +
      '<div class="sortie-fact"><dt>Capitaine · Team Rider</dt><dd>' +
      escapeHtml(route.rideLeader && String(route.rideLeader).trim() ? String(route.rideLeader).trim() : "—") +
      "</dd></div>" +
      '<div class="sortie-fact"><dt>Date</dt><dd>' +
      escapeHtml((route.depart && route.depart.dateLabel) || "—") +
      "</dd></div>" +
      '<div class="sortie-fact"><dt>Distance (trace GPX)</dt><dd>' +
      kmLine +
      "</dd></div>" +
      '<div class="sortie-fact"><dt>Point de départ</dt><dd>' +
      escapeHtml(SHARED.meetParking) +
      "</dd></div>" +
      '<div class="sortie-fact"><dt>Rendez-vous</dt><dd>' +
      escapeHtml(SHARED.meetRv) +
      " · <strong>Départ roulant</strong> · " +
      escapeHtml(departTimeDisplay(route)) +
      "</dd></div>" +
      (route.meetPlaceDetail && String(route.meetPlaceDetail).trim()
        ? '<div class="sortie-fact"><dt>Départ précis</dt><dd>' +
          escapeHtml(String(route.meetPlaceDetail).trim()) +
          "</dd></div>"
        : "") +
      (function () {
        const dd = routeEstimatedDurationDdHtml(route);
        return dd ? '<div class="sortie-fact"><dt>Durée estimée</dt><dd>' + dd + "</dd></div>" : "";
      })() +
      (route.visibility && String(route.visibility).toLowerCase() !== "public"
        ? '<div class="sortie-fact"><dt>Visibilité</dt><dd>' +
          escapeHtml(visibilityLabelSortie(route.visibility)) +
          "</dd></div>"
        : "") +
      "</dl>" +

      '<section class="sortie-block">' +
      '<h3 class="sortie-block-title">À propos</h3>' +
      '<p class="sortie-warn">Merci de bien lire la description avant de t’inscrire.</p>' +
      '<p class="sortie-prose">La sortie pourra être <strong>annulée ou décalée</strong> selon les conditions météorologiques. ' +
      "En cas de doute, suis les messages sur " +
      '<a href="https://www.instagram.com/goelo.rides/" target="_blank" rel="noopener noreferrer">@goelo.rides</a> ' +
      "ou contacte-nous par e-mail.</p>" +
      '<p class="sortie-prose">' +
      pacePhil +
      "</p>" +
      '<p class="sortie-prose">' +
      philo +
      "</p></section>" +

      '<section class="sortie-block">' +
      '<h3 class="sortie-block-title">En montée</h3>' +
      '<p class="sortie-prose">Chacun roule à son rythme ; <strong>regroupement en haut</strong> des bosses pour repartir groupés.</p></section>' +

      '<section class="sortie-block">' +
      '<h3 class="sortie-block-title">Préparation et autonomie</h3>' +
      "<ul class=\"sortie-list\">" +
      "<li>Aie la <strong>trace GPS</strong> du parcours sur ton téléphone ou GPS pour pouvoir rentrer en autonomie en cas de problème.</li>" +
      "<li>Sois autonome : <strong>outillage</strong>, chambre à air / patins, <strong>alimentation</strong> et eau adaptées à la durée.</li>" +
      "</ul></section>" +

      '<section class="sortie-block">' +
      '<h3 class="sortie-block-title">Consignes de sécurité</h3>' +
      "<ul class=\"sortie-list\">" +
      "<li>Participation réservée aux <strong>personnes majeures</strong> ; les <strong>mineur·e·s</strong> ne peuvent pas prendre part à la sortie.</li>" +
      "<li>Sur routes larges, roulez en <strong>file à deux</strong> au maximum ; en file indienne sur les portions étroites.</li>" +
      "<li><strong>Dépassements par la gauche</strong> uniquement ; annonce clairement ton intention avant de passer.</li>" +
      "<li>Signale les obstacles (poteaux, nids-de-poule, dos-d’âne…).</li>" +
      "<li>Garde ta ligne et signale tout changement de position utile au groupe.</li>" +
      "</ul></section>" +

      '<section class="sortie-block">' +
      '<h3 class="sortie-block-title">Matériel</h3>' +
      "<ul class=\"sortie-list\">" +
      "<li>Respect du <strong>code de la route</strong> et du bon sens collectif. Comportement dangereux = exclusion possible de la sortie.</li>" +
      "<li><strong>Casque obligatoire</strong> (quelle que soit la météo).</li>" +
      "<li><strong>Éclairage</strong> et <strong>avertisseur</strong> conformes si les conditions l’exigent.</li>" +
      "<li>Prolongateurs de cintre type « clip-on » : <strong>interdits</strong> sur la sortie.</li>" +
      "<li>Prévois l’équipement adapté à la météo (couche chaude, coupe-vent, protection pluie…).</li>" +
      "</ul></section>" +

      '<section class="sortie-block">' +
      '<h3 class="sortie-block-title">Inscription</h3>' +
      '<p class="sortie-prose"><strong>Phase de lancement — cadre et assurance</strong> : Goëlo Rides n’a pas encore de <strong>structure associative</strong> ni d’<strong>assurance collective</strong> pour encadrer les sorties. Elles se déroulent dans un cadre <strong>informel</strong> : chaque participant·e reste <strong>responsable</strong> de sa personne, de son matériel et des risques liés à la route. <strong>Dès qu’une association sera créée</strong> (statuts, éventuelle adhésion et assurance), nous mettrons à jour cette fiche et la page <a href="infos-pratiques.html">Infos pratiques</a> pour que tout soit <strong>clair et à jour</strong>.</p>' +
      '<p class="sortie-prose"><strong>Pas de cotisation annuelle</strong> pour l’instant. L’inscription sur la page Sorties, ici avec « Je participe ! », ou par e-mail sert à <strong>anticiper le nombre de participants</strong>. Préviens-nous si tu ne peux finalement pas venir.</p></section>' +

      '<p class="sortie-footer-note">Bonne sortie · Goëlo Rides · ' +
      escapeHtml(SHARED.region) +
      "</p></div>"
    );
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

  async function userIsRegisteredForRoute(routeId) {
    const email = getLastStoredEmail().trim().toLowerCase();
    if (!email) return false;
    if (isSupabaseEnabled()) {
      var data = await supabaseRpc("signup_list_registered_routes", { p_email: email });
      if (Array.isArray(data)) data = data[0];
      const routes = data && data.routes;
      return Array.isArray(routes) && routes.map(String).indexOf(String(routeId)) >= 0;
    }
    return isRegisteredLocal(routeId, email, loadLocalSignupsObject());
  }

  function saveLocalSignupsObject(obj) {
    try {
      localStorage.setItem(LOCAL_SIGNUPS_KEY, JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  async function notifySignupFormSubmit(route, pseudo, email) {
    try {
      if (!FORM_NOTIFY_EMAIL) return;
      const body = new URLSearchParams({
        pseudo: pseudo,
        email: email,
        parcours: route.track + " · " + (route.depart && route.depart.dateLabel ? route.depart.dateLabel : ""),
        _subject: "Inscription Goëlo Rides — " + route.track,
        _captcha: "false",
        _template: "table",
        _replyto: email,
        _autoresponse: GOELO_FORMSUBMIT_AUTORESPONSE_INSCRIPTION
      });
      await fetch("https://formsubmit.co/" + encodeURIComponent(FORM_NOTIFY_EMAIL), {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body
      });
    } catch (err) {
      console.warn("Goëlo : notification FormSubmit (sortie) non envoyée.", err && err.message ? err.message : err);
    }
  }

  async function registerSortie(route, pseudo, email, cyclistLevelRaw, participantCityRaw) {
    const p = (pseudo || "").trim();
    const e = (email || "").trim().toLowerCase();
    const cl = sanitizeSignupCyclistLevel(cyclistLevelRaw);
    const city = sanitizeParticipantCity(participantCityRaw);
    if (!p || !e) return { ok: false, error: "missing" };
    if (isSupabaseEnabled()) {
      var data = await supabaseRpc("signup_register", {
        p_route_id: route.id,
        p_pseudo: p,
        p_email: e,
        p_cyclist_level: cl || null,
        p_participant_city: city || null
      });
      if (Array.isArray(data)) data = data[0];
      if (!data || !data.ok) {
        if (data && data.error === "already_registered") {
          return { ok: false, error: "already_registered" };
        }
        if (data && data.error === "sortie_cancelled") {
          window.alert("Cette sortie est annulée — inscription impossible.");
          return { ok: false, error: "sortie_cancelled" };
        }
        if (data && data.error === "sortie_closed") {
          window.alert("Les inscriptions sont fermées pour cette sortie.");
          return { ok: false, error: "sortie_closed" };
        }
        if (data && data.error === "private_route") {
          window.alert("Cette sortie est privée — inscription impossible depuis le site.");
          return { ok: false, error: "private_route" };
        }
        if (data && data.error === "invitation_only") {
          window.alert("Inscription sur invitation uniquement — contacte l’organisation.");
          return { ok: false, error: "invitation_only" };
        }
        var fail = goeloLastRpcFailure;
        var code = fail ? fail.code : 40;
        window.alert(goeloFormatDbFailureAlert(code, fail && fail.httpStatus));
        return { ok: false, error: "db" };
      }
      try {
        localStorage.setItem("goeloRides_last_email", JSON.stringify(e));
      } catch (e1) { /* ignore */ }
      await notifySignupFormSubmit(route, p, e);
      return { ok: true, waitlist: !!data.waitlist };
    }
    const obj = loadLocalSignupsObject();
    if (!obj[route.id]) obj[route.id] = [];
    const maxP =
      route && route.maxParticipants != null && Number(route.maxParticipants) > 0
        ? Number(route.maxParticipants)
        : null;
    const mainCount = (obj[route.id] || []).filter(function (x) {
      return x && !x.waitlist;
    }).length;
    const wasNew = !isRegisteredLocal(route.id, e, obj);
    let waitlist = false;
    if (wasNew && maxP != null && mainCount >= maxP) waitlist = true;
    if (wasNew) {
      obj[route.id].push({
        pseudo: p,
        email: e,
        at: new Date().toISOString(),
        waitlist: waitlist,
        cyclist_level: cl,
        participant_city: city
      });
    }
    if (!saveLocalSignupsObject(obj)) {
      if (wasNew) obj[route.id].pop();
      window.alert(goeloFormatDbFailureAlert(41, 0));
      return { ok: false, error: "local_storage" };
    }
    try {
      localStorage.setItem("goeloRides_last_email", JSON.stringify(e));
    } catch (e2) { /* ignore */ }
    await notifySignupFormSubmit(route, p, e);
    return { ok: true, waitlist: waitlist };
  }

  async function unregisterSortie(route, email) {
    const e = (email || "").trim().toLowerCase();
    if (!route || !e) return false;
    if (isSupabaseEnabled()) {
      var data = await supabaseRpc("signup_unregister", { p_route_id: route.id, p_email: e });
      if (Array.isArray(data)) data = data[0];
      if (!(data && data.ok)) {
        var failU = goeloLastRpcFailure;
        var codeU = failU ? failU.code : 40;
        window.alert(goeloFormatDbFailureAlert(codeU, failU && failU.httpStatus));
        return false;
      }
      return true;
    }
    const obj = loadLocalSignupsObject();
    const arr = obj[route.id];
    if (!Array.isArray(arr)) {
      window.alert("Aucune inscription enregistrée sur cet appareil pour cet e-mail.");
      return false;
    }
    const next = arr.filter(function (item) {
      return (item.email || "").trim().toLowerCase() !== e;
    });
    if (next.length === arr.length) {
      window.alert("Aucune inscription enregistrée sur cet appareil pour cet e-mail.");
      return false;
    }
    obj[route.id] = next;
    if (!saveLocalSignupsObject(obj)) {
      obj[route.id] = arr;
      window.alert(goeloFormatDbFailureAlert(41, 0));
      return false;
    }
    return true;
  }

  /** Inscrits : texte + liste de pseudos (Supabase signup_list_all_names ou localStorage). */
  async function fetchSignupSnapshotForRoute(route) {
    const rid = String(route && route.id != null ? route.id : "");
    const leaderPseudo =
      route && route.rideLeader && String(route.rideLeader).trim()
        ? String(route.rideLeader).trim()
        : "";
    if (isSupabaseEnabled()) {
      var data = await supabaseRpc("signup_list_all_names", {});
      if (Array.isArray(data) && data.length) data = data[0];
      if (data == null || typeof data !== "object") {
        return {
          countText: "Inscrits : —",
          names: [],
          participantRows: [],
          waitlistNames: [],
          waitlistRows: [],
          leaderPseudo: leaderPseudo,
          maxParticipants: null,
          rpcFailed: true,
          localMode: false
        };
      }
      var arr = data[rid];
      var participantRows = [];
      var waitlistRows = [];
      if (Array.isArray(arr)) {
        participantRows = arr
          .map(normalizeParticipantRowRpc)
          .filter(function (row) {
            return row.pseudo;
          });
      } else if (arr && typeof arr === "object") {
        var p = arr.participants;
        var w = arr.waitlist;
        participantRows = Array.isArray(p)
          ? p
              .map(normalizeParticipantRowRpc)
              .filter(function (row) {
                return row.pseudo;
              })
          : [];
        waitlistRows = Array.isArray(w)
          ? w
              .map(normalizeParticipantRowRpc)
              .filter(function (row) {
                return row.pseudo;
              })
          : [];
      }
      var names = participantRows.map(function (row) {
        return row.pseudo;
      });
      var waitNames = waitlistRows.map(function (row) {
        return row.pseudo;
      });
      var n = names.length;
      var maxP =
        route && route.maxParticipants != null && Number(route.maxParticipants) > 0
          ? Number(route.maxParticipants)
          : null;
      var capFrag = maxP != null ? " / " + maxP + " places" : "";
      var countText =
        n === 0
          ? "0 inscrit·e·s" + capFrag
          : n === 1
            ? "1 inscrit·e" + capFrag
            : n + " inscrit·e·s" + capFrag;
      return {
        countText: countText,
        names: names,
        participantRows: participantRows,
        waitlistNames: waitNames,
        waitlistRows: waitlistRows,
        leaderPseudo: leaderPseudo,
        maxParticipants: maxP,
        rpcFailed: false,
        localMode: false
      };
    }
    var obj = loadLocalSignupsObject();
    var localArr = obj[rid];
    var names = [];
    var waitNames = [];
    var participantRows = [];
    var waitlistRows = [];
    if (Array.isArray(localArr)) {
      localArr.forEach(function (e) {
        var p = e && e.pseudo ? String(e.pseudo).trim() : "";
        if (!p) return;
        var row = {
          pseudo: p,
          cyclist_level: sanitizeSignupCyclistLevel(e && e.cyclist_level),
          city: sanitizeParticipantCity(e && (e.participant_city || e.city))
        };
        if (e && e.waitlist) {
          if (waitNames.indexOf(p) === -1) {
            waitNames.push(p);
            waitlistRows.push(row);
          }
        } else {
          if (names.indexOf(p) === -1) {
            names.push(p);
            participantRows.push(row);
          }
        }
      });
    }
    var m = names.length;
    var maxPl =
      route && route.maxParticipants != null && Number(route.maxParticipants) > 0
        ? Number(route.maxParticipants)
        : null;
    var capL = maxPl != null ? " / " + maxPl + " places" : "";
    var countText =
      m === 0
        ? "0 inscrit·e·s (mode local)" + capL
        : m === 1
          ? "1 inscrit·e (mode local)" + capL
          : m + " inscrit·e·s (mode local)" + capL;
    return {
      countText: countText,
      names: names,
      participantRows: participantRows,
      waitlistNames: waitNames,
      waitlistRows: waitlistRows,
      leaderPseudo: leaderPseudo,
      maxParticipants: maxPl,
      rpcFailed: false,
      localMode: true
    };
  }

  function renderSortieParticipantsPanel(snap) {
    var sec = document.getElementById("sortie-participants-section");
    var listEl = document.getElementById("sortie-participants-list");
    var emptyEl = document.getElementById("sortie-participants-empty");
    var wlSec = document.getElementById("sortie-waitlist-section");
    var wlList = document.getElementById("sortie-waitlist-list");
    var wlEmpty = document.getElementById("sortie-waitlist-empty");
    if (!sec || !listEl || !emptyEl) return;
    sec.hidden = false;
    listEl.innerHTML = "";
    var leaderKey = (snap.leaderPseudo || "").trim().toLowerCase();
    if (snap.rpcFailed) {
      emptyEl.hidden = false;
      emptyEl.textContent = "Liste des participant·e·s indisponible pour le moment.";
      var thFail = document.getElementById("sortie-participants-title");
      if (thFail) thFail.textContent = "Participant·e·s";
      if (wlSec) wlSec.hidden = true;
      return;
    }
    var titleHeading = document.getElementById("sortie-participants-title");
    var mainRows = snap.participantRows && snap.participantRows.length ? snap.participantRows : null;
    var nameList =
      mainRows ||
      (snap.names || []).map(function (nm) {
        return { pseudo: String(nm || "").trim(), cyclist_level: "", city: "" };
      });
    if (titleHeading) {
      var n = nameList.length;
      titleHeading.textContent =
        n === 0 ? "Participant·e·s" : n === 1 ? "1 participe" : n + " participent";
    }
    nameList.forEach(function (row) {
      var name = row.pseudo || "";
      var li = document.createElement("li");
      li.className = "sortie-participants-item";
      var isLead = leaderKey && String(name).trim().toLowerCase() === leaderKey;
      if (isLead) li.classList.add("sortie-participants-item--leader");
      li.appendChild(document.createTextNode(name));
      var lv = cyclistLevelLabelFr(row.cyclist_level);
      if (lv) {
        var lvSp = document.createElement("span");
        lvSp.className = "sortie-participants-level";
        lvSp.textContent = " · " + lv;
        li.appendChild(lvSp);
      }
      var cty = String(row.city || "").trim();
      if (cty) {
        var cSp = document.createElement("span");
        cSp.className = "sortie-participants-city";
        cSp.textContent = " · " + cty;
        li.appendChild(cSp);
      }
      if (isLead) {
        var sp = document.createElement("span");
        sp.className = "sortie-participants-role";
        sp.textContent = " · capitaine";
        li.appendChild(sp);
      }
      listEl.appendChild(li);
    });
    emptyEl.hidden = nameList.length > 0;
    emptyEl.textContent = snap.localMode
      ? "Aucun pseudo enregistré sur cet appareil pour cette sortie."
      : "Personne pour l’instant — sois le ou la première !";

    var wl = snap.waitlistRows && snap.waitlistRows.length ? snap.waitlistRows : null;
    var wlNamesFlat =
      wl ||
      (snap.waitlistNames || []).map(function (nm) {
        return { pseudo: String(nm || "").trim(), cyclist_level: "", city: "" };
      });
    if (wlSec && wlList && wlEmpty) {
      var showWl = wlNamesFlat.length > 0;
      wlSec.hidden = !showWl;
      wlList.innerHTML = "";
      wlNamesFlat.forEach(function (row) {
        var li = document.createElement("li");
        li.className = "sortie-participants-item";
        li.appendChild(document.createTextNode(row.pseudo || ""));
        var wlv = cyclistLevelLabelFr(row.cyclist_level);
        if (wlv) {
          var wsp = document.createElement("span");
          wsp.className = "sortie-participants-level";
          wsp.textContent = " · " + wlv;
          li.appendChild(wsp);
        }
        var wct = String(row.city || "").trim();
        if (wct) {
          var wcSp = document.createElement("span");
          wcSp.className = "sortie-participants-city";
          wcSp.textContent = " · " + wct;
          li.appendChild(wcSp);
        }
        wlList.appendChild(li);
      });
      wlEmpty.hidden = wlNamesFlat.length > 0;
    }
  }

  async function refreshRegisteredUI(route) {
    const registered = await userIsRegisteredForRoute(route.id);
    let onWaitlist = false;
    if (isSupabaseEnabled()) {
      const em = getLastStoredEmail().trim().toLowerCase();
      if (em && registered) {
        let rg = await supabaseRpc("signup_get_registration", {
          p_route_id: route.id,
          p_email: em
        });
        if (Array.isArray(rg) && rg.length) rg = rg[0];
        onWaitlist = !!(rg && rg.on_waitlist);
      }
    }
    const regLine = document.getElementById("sortie-reg-line");
    if (regLine) {
      regLine.hidden = false;
      if (registered) {
        regLine.textContent = onWaitlist
          ? "Tu es en liste d’attente — si un·e cycliste se désinscrit, tu seras promu·e automatiquement sur le peloton."
          : "Tu es inscrit·e sur cette sortie ✓";
        regLine.classList.toggle("sortie-reg-line--ok", !onWaitlist);
      } else {
        regLine.textContent =
          "Pas encore inscrit·e — utilise le bouton orange « Je participe ! » ci-dessous.";
        regLine.classList.toggle("sortie-reg-line--ok", false);
      }
    }
    const snap = await fetchSignupSnapshotForRoute(route);
    const countEl = document.getElementById("sortie-signup-count");
    if (countEl) {
      countEl.hidden = false;
      countEl.textContent = snap.countText;
      countEl.setAttribute("aria-label", snap.countText);
    }
    renderSortieParticipantsPanel(snap);
    mountSortieParticipateUI(route, { registered: registered, onWaitlist: onWaitlist });
  }

  function sortieSignupBlockedReason(route) {
    if (!route) return "";
    const st = String(route.sortieStatus || "open").toLowerCase();
    if (st === "cancelled" || st === "canceled" || st === "annulee" || st === "annulée") return "cancelled";
    if (st === "closed" || st === "ferme" || st === "fermée") return "closed";
    const vis = String(route.visibility || "public").toLowerCase();
    if (vis === "invitation" || vis === "invite" || vis === "invitation_only") return "invitation";
    return "";
  }

  function mountSortieParticipateUI(route, ctx) {
    ctx = ctx || {};
    const registered = !!ctx.registered;
    const onWaitlist = !!ctx.onWaitlist;
    sortiePageRouteRef = route;
    const host = document.getElementById("sortie-hero-actions");
    if (!host) return;
    host.innerHTML = "";

    const block = sortieSignupBlockedReason(route);
    if (block && !registered) {
      const p = document.createElement("p");
      p.className = "sortie-signup-blocked-msg";
      if (block === "cancelled") {
        p.textContent = "Inscriptions indisponibles — sortie annulée.";
      } else if (block === "closed") {
        p.textContent = "Inscriptions fermées pour cette sortie.";
      } else {
        p.textContent = "Inscription sur invitation uniquement — contacte l’organisation ou le·a capitaine.";
      }
      host.appendChild(p);
      return;
    }

    if (registered) {
      const row = document.createElement("div");
      row.className = "sortie-hero-inscrit-row";

      const badge = document.createElement("span");
      badge.className = "btn-je-participe btn-je-participe--done";
      badge.setAttribute("role", "status");
      badge.textContent = onWaitlist ? "Liste d’attente" : "Inscrit·e ✓";
      row.appendChild(badge);

      const unsub = document.createElement("button");
      unsub.type = "button";
      unsub.className = "btn-sortie-ghost btn-sortie-unsub";
      unsub.textContent = "Me désinscrire";
      unsub.addEventListener("click", async function () {
        const em = getLastStoredEmail().trim().toLowerCase();
        if (!em) {
          window.alert("Indique ton e-mail dans le profil navigateur (dernier e-mail utilisé) pour te désinscrire, ou passe par la page Sorties.");
          return;
        }
        if (!window.confirm("Te désinscrire de cette sortie ?")) return;
        if (await unregisterSortie(route, em)) {
          await refreshRegisteredUI(route);
          const panel = document.getElementById("sortie-signup-panel");
          if (panel) panel.hidden = true;
        }
      });
      row.appendChild(unsub);
      host.appendChild(row);
      return;
    }

    const go = document.createElement("button");
    go.type = "button";
    go.className = "btn-je-participe";
    go.id = "sortie-btn-participate";
    go.textContent = "Je participe !";
    go.addEventListener("click", function () {
      const panel = document.getElementById("sortie-signup-panel");
      const emEl = document.getElementById("sortie-signup-email");
      const psEl = document.getElementById("sortie-signup-pseudo");
      const clEl = document.getElementById("sortie-signup-cyclist-level");
      if (emEl) emEl.value = getLastStoredEmail() || "";
      if (clEl) {
        clEl.value = "";
        if (window.GoeloAuth && typeof window.GoeloAuth.getCyclistLevelFromSession === "function") {
          const gl = window.GoeloAuth.getCyclistLevelFromSession();
          if (gl && ["debutant", "intermediaire", "confirme"].indexOf(gl) !== -1) {
            clEl.value = gl;
          }
        }
      }
      if (panel) panel.hidden = false;
      if (psEl) psEl.focus();
    });
    host.appendChild(go);
  }

  function unwrapRpcSingle(data) {
    if (Array.isArray(data) && data.length === 1) return data[0];
    return data;
  }

  function stopSortieCommentsPolling() {
    if (sortieCommentsPollId != null) {
      clearInterval(sortieCommentsPollId);
      sortieCommentsPollId = null;
    }
  }

  /** Pseudo pour le fil : uniquement si compte Goëlo connecté (session), sinon champ vide. */
  function getSuggestedCommentPseudoFromAuth() {
    if (window.GoeloAuth && typeof window.GoeloAuth.readSession === "function") {
      const s = window.GoeloAuth.readSession();
      const p = s && s.pseudo ? String(s.pseudo).trim() : "";
      if (p) return p.slice(0, 40);
    }
    return "";
  }

  function formatCommentDate(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    } catch (e) {
      void e;
      return "";
    }
  }

  function renderSortieCommentsList(items, opts) {
    opts = opts || {};
    const listEl = document.getElementById("sortie-comments-list");
    const emptyEl = document.getElementById("sortie-comments-empty");
    if (!listEl || !emptyEl) return;
    listEl.innerHTML = "";
    if (!items || !items.length) {
      emptyEl.hidden = !!opts.suppressEmpty;
      return;
    }
    emptyEl.hidden = true;
    items.forEach(function (c) {
      if (!c || typeof c !== "object") return;
      const li = document.createElement("li");
      li.className = "sortie-comments-item";
      const meta = document.createElement("div");
      meta.className = "sortie-comments-meta";
      const strong = document.createElement("strong");
      strong.textContent = String(c.pseudo || "").trim() || "—";
      meta.appendChild(strong);
      const when = formatCommentDate(c.created_at);
      if (when) {
        meta.appendChild(document.createTextNode(" · "));
        const timeEl = document.createElement("time");
        timeEl.dateTime = String(c.created_at || "");
        timeEl.textContent = when;
        meta.appendChild(timeEl);
      }
      li.appendChild(meta);
      const bodyEl = document.createElement("div");
      bodyEl.className = "sortie-comments-body";
      bodyEl.textContent = String(c.body || "").trim();
      li.appendChild(bodyEl);
      listEl.appendChild(li);
    });
  }

  async function loadSortieCommentsForRoute(route, silent) {
    const statusEl = document.getElementById("sortie-comments-status");
    if (!route || !isSupabaseEnabled()) return;
    if (!silent && statusEl && !statusEl.dataset.sortieHadError) {
      statusEl.hidden = false;
      statusEl.textContent = "Chargement des messages…";
    }
    const raw = await supabaseRpc("sortie_comment_list", {
      p_route_id: String(route.id),
      p_limit: 80
    });
    if (!silent && statusEl) {
      statusEl.hidden = true;
      statusEl.textContent = "";
    }
    if (raw === null) {
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.dataset.sortieHadError = "1";
        statusEl.textContent = "Impossible de charger les messages pour le moment.";
      }
      renderSortieCommentsList([], { suppressEmpty: true });
      return;
    }
    if (statusEl) delete statusEl.dataset.sortieHadError;
    const arr = Array.isArray(raw) ? raw : [];
    renderSortieCommentsList(arr);
  }

  function initSortieDiscussion(route) {
    const section = document.getElementById("sortie-comments-section");
    if (!section) return;
    stopSortieCommentsPolling();
    const st = String((route && route.sortieStatus) || "open").toLowerCase();
    if (st === "cancelled" || st === "canceled" || st === "annulee" || st === "annulée") {
      section.hidden = true;
      return;
    }
    if (!isSupabaseEnabled()) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const pseudoInput = document.getElementById("sortie-comment-pseudo");
    if (pseudoInput) {
      const fromAuth = getSuggestedCommentPseudoFromAuth();
      if (fromAuth) {
        pseudoInput.value = fromAuth;
        pseudoInput.placeholder = "Pseudo ou prénom affiché avec le message";
      } else {
        pseudoInput.value = "";
        pseudoInput.placeholder =
          "Indique ton pseudo ou prénom (obligatoire) — connecte-toi en haut pour préremplir depuis ton compte";
      }
    }
    const bodyTa = document.getElementById("sortie-comment-body");
    if (bodyTa) {
      bodyTa.removeAttribute("readonly");
      bodyTa.removeAttribute("disabled");
    }
    const form = document.getElementById("sortie-comments-form");
    if (form && !form.dataset.sortieCommentsBound) {
      form.dataset.sortieCommentsBound = "1";
      if (!window.__goeloSortieCommentAuthBound) {
        window.__goeloSortieCommentAuthBound = true;
        window.addEventListener("goelo-user-session-updated", function () {
          if (!sortiePageRouteRef) return;
          const pi = document.getElementById("sortie-comment-pseudo");
          if (!pi) return;
          if (String(pi.value || "").trim()) return;
          const na = getSuggestedCommentPseudoFromAuth();
          if (na) {
            pi.value = na;
            pi.placeholder = "Pseudo ou prénom affiché avec le message";
          }
        });
      }
      form.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        if (!sortiePageRouteRef) return;
        const ps = document.getElementById("sortie-comment-pseudo");
        const bd = document.getElementById("sortie-comment-body");
        const btn = document.getElementById("sortie-comment-submit");
        const pseudo = ps ? String(ps.value || "").trim() : "";
        const body = bd ? String(bd.value || "").trim() : "";
        if (pseudo.length < 1 || pseudo.length > 40) {
          window.alert("Indique un pseudo ou prénom (1 à 40 caractères).");
          return;
        }
        if (body.length < 1 || body.length > 1200) {
          window.alert("Le message doit faire entre 1 et 1200 caractères.");
          return;
        }
        if (btn) btn.disabled = true;
        let data = await supabaseRpc("sortie_comment_add", {
          p_route_id: String(sortiePageRouteRef.id),
          p_pseudo: pseudo,
          p_body: body
        });
        data = unwrapRpcSingle(data);
        if (btn) btn.disabled = false;
        if (data && data.ok === true) {
          if (bd) bd.value = "";
          await loadSortieCommentsForRoute(sortiePageRouteRef, true);
          return;
        }
        const err = data && data.error ? String(data.error) : "";
        if (err === "invalid_route") {
          window.alert(
            "Cette sortie n’accepte pas de commentaires (parcours introuvable ou inactif côté serveur)."
          );
        } else if (err === "invalid_pseudo" || err === "invalid_body") {
          window.alert("Pseudo ou message invalide. Vérifie les longueurs autorisées.");
        } else {
          const code = goeloLastRpcFailure && goeloLastRpcFailure.code ? goeloLastRpcFailure.code : 37;
          window.alert(goeloFormatDbFailureAlert(code, goeloLastRpcFailure && goeloLastRpcFailure.httpStatus));
        }
      });
    }
    loadSortieCommentsForRoute(route, false);
    sortieCommentsPollId = window.setInterval(function () {
      loadSortieCommentsForRoute(route, true);
    }, 90000);
  }

  /** Libellé type de sortie (aligné page Sorties / parcours). */
  function sortieRaceTypeLabel(route) {
    const rt = String((route && route.raceType) || "").toLowerCase();
    if (rt === "gravel") return "Gravel";
    if (rt === "vtt" || rt === "rtt") return "VTT";
    if (route && route.id === "falaises") return "Route · Famille";
    return "Route";
  }

  function gradePercentBetween(p0, p1) {
    const horiz = haversine(p0.lat, p0.lon, p1.lat, p1.lon);
    if (horiz < 0.5) return 0;
    if (typeof p0.ele !== "number" || typeof p1.ele !== "number") return null;
    return ((p1.ele - p0.ele) / horiz) * 100;
  }

  function smoothedEdgeGrade(points, i) {
    const w = 2;
    let sum = 0;
    let cnt = 0;
    for (let k = -w; k <= w; k++) {
      const idx = i + k;
      if (idx < 0 || idx >= points.length - 1) continue;
      const g = gradePercentBetween(points[idx], points[idx + 1]);
      if (g !== null) {
        sum += g;
        cnt++;
      }
    }
    return cnt ? sum / cnt : 0;
  }

  function segmentColorForGrade(gradePct) {
    if (gradePct < -2.5) return "#2563eb";
    if (gradePct < 2) return "#64748b";
    if (gradePct < 4.5) return "#ca8a04";
    if (gradePct < 8) return "#ea580c";
    return "#dc2626";
  }

  function profileHasElevation(points) {
    return points.some(function (p) {
      return typeof p.ele === "number" && !Number.isNaN(p.ele);
    });
  }

  function resolveArrowColor(routeColor, casingColor) {
    const rc = routeColor === "#e8e8e8" ? casingColor || "#4b5563" : routeColor;
    return rc;
  }

  function bearingDegrees(lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const dLon = (lon2 - lon1) * toRad;
    const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
    const x =
      Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
      Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
    return (Math.atan2(y, x) * toDeg + 360) % 360;
  }

  function sortieAddManualDirectionArrows(latlngs, arrowColor) {
    const group = L.layerGroup();
    if (latlngs.length < 2) return group;
    const step = Math.max(1, Math.floor(latlngs.length / 14));
    for (let i = step; i < latlngs.length - 1; i += step) {
      const from = latlngs[i - 1];
      const at = latlngs[i];
      const bearing = bearingDegrees(from[0], from[1], at[0], at[1]);
      const icon = L.divIcon({
        className: "route-arrow-marker",
        html:
          '<span class="route-arrow" style="color:' + arrowColor + ";transform:rotate(" +
          (bearing - 90) + 'deg)">▶</span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      group.addLayer(L.marker(at, { icon: icon, interactive: false }));
    }
    return group;
  }

  /** lat/lon exploitables pour la carte (accepte lng, latitude…). */
  function citiesWithMapCoordinates(cities) {
    const out = [];
    if (!Array.isArray(cities)) return out;
    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      if (!c || typeof c !== "object") continue;
      const lat = Number(c.lat != null ? c.lat : c.latitude);
      const lon = Number(
        c.lon != null ? c.lon : c.lng != null ? c.lng : c.longitude != null ? c.longitude : NaN
      );
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const name = (c.name != null && String(c.name).trim()) || "Point";
      out.push({
        name: name,
        lat: lat,
        lon: lon,
        start: !!c.start
      });
    }
    if (out.length && !out.some(function (x) {
      return x.start;
    })) {
      out[0].start = true;
    }
    return out;
  }

  /** Repères le long de la trace si aucune ville géocodée en base. */
  function inferCitiesFromTrack(points, maxMarkers) {
    const n = points.length;
    if (n < 2) return [];
    const cap = Math.max(2, Math.min(maxMarkers || 5, n));
    const indices = [];
    for (let k = 0; k < cap; k++) {
      indices.push(Math.round((k / Math.max(1, cap - 1)) * (n - 1)));
    }
    const seen = {};
    const uniq = [];
    indices.forEach(function (idx) {
      if (seen[idx]) return;
      seen[idx] = true;
      uniq.push(idx);
    });
    return uniq.map(function (idx, i) {
      const pt = points[idx];
      const isFirst = i === 0;
      const isLast = i === uniq.length - 1;
      let name;
      if (isFirst) name = "Départ";
      else if (isLast) name = "Arrivée";
      else name = "Sur le parcours (~" + Math.round((idx / Math.max(1, n - 1)) * 100) + " %)";
      return { name: name, lat: pt.lat, lon: pt.lon, start: isFirst };
    });
  }

  function ensureCitiesForMap(route) {
    const fromCfg = citiesWithMapCoordinates(route.cities);
    const pts = route.profile && route.profile.points;
    const km = route.profile && route.profile.totalKm;
    const canInfer = !!(pts && pts.length >= 2);

    /* Repères le long de la trace uniquement si aucune ville exploitable en base.
       (Avant : dès qu’il y avait moins de 2 points, on écrasait une liste de communes
       partiellement géocodée — d’où « Départ / Sur le parcours (~x %) » à la place des noms.) */
    if (canInfer && fromCfg.length === 0) {
      return inferCitiesFromTrack(pts, 5);
    }
    if (fromCfg.length) return fromCfg;
    if (canInfer) return inferCitiesFromTrack(pts, 5);
    return [{ name: "Saint-Quay-Portrieux", lat: 48.6536, lon: -2.8353, start: true }];
  }

  function sortieCityMarkerIcon(city) {
    return L.divIcon({
      className: "sortie-city-marker",
      html:
        '<span class="sortie-city-label' +
        (city.start ? " city-start" : "") +
        '">' +
        escapeHtml(city.name) +
        "</span>",
      iconAnchor: [0, 0]
    });
  }

  function sortieUpdateCitiesList(cities) {
    const list = document.getElementById("sortie-cities-list");
    if (!list) return;
    list.innerHTML = "";
    if (!cities || !cities.length) return;
    cities.forEach(function (city) {
      const chip = document.createElement("span");
      chip.className = "sortie-city-chip" + (city.start ? " is-start" : "");
      chip.textContent = city.name;
      list.appendChild(chip);
    });
  }

  function sortieAddCityMarkers(map, cities) {
    const group = L.layerGroup();
    cities.forEach(function (city) {
      const lat = Number(city.lat);
      const lon = Number(city.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const marker = L.marker([lat, lon], { icon: sortieCityMarkerIcon(city) });
      marker.bindPopup(
        "<strong>" + escapeHtml(city.name) + "</strong>" + (city.start ? "<br>Départ" : "")
      );
      group.addLayer(marker);
    });
    return group;
  }

  function sortieAddStravaTrack(map, latlngs, color, casingColor) {
    const weight = 5;
    const arrowColor = resolveArrowColor(color, casingColor);
    const casing = L.polyline(latlngs, {
      color: casingColor || "#ffffff",
      weight: weight + 4,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round"
    });
    const line = L.polyline(latlngs, {
      color: color,
      weight: weight,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round"
    });
    const layers = [casing, line];
    if (typeof L.polylineDecorator === "function" && typeof L.Symbol !== "undefined") {
      layers.push(
        L.polylineDecorator(line, {
          patterns: [
            {
              offset: "4%",
              repeat: "7%",
              symbol: L.Symbol.arrowHead({
                pixelSize: 12,
                headAngle: 42,
                polygon: false,
                pathOptions: {
                  color: arrowColor,
                  weight: 3,
                  opacity: 1,
                  lineCap: "round",
                  lineJoin: "round"
                }
              })
            }
          ]
        })
      );
    } else {
      layers.push(sortieAddManualDirectionArrows(latlngs, arrowColor));
    }
    const group = L.layerGroup(layers);
    group.mainLine = line;
    return group;
  }

  function sortieAddGradeColoredTrack(map, points, routeFallbackColor, casingColor) {
    const weight = 5;
    const latlngs = points.map(function (p) {
      return [p.lat, p.lon];
    });
    const casing = L.polyline(latlngs, {
      color: casingColor || "#ffffff",
      weight: weight + 4,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round"
    });
    const colored = L.layerGroup();
    let i = 0;
    while (i < points.length - 1) {
      const g = smoothedEdgeGrade(points, i);
      const col = segmentColorForGrade(g);
      const path = [[points[i].lat, points[i].lon]];
      let j = i;
      while (j < points.length - 1) {
        const gj = smoothedEdgeGrade(points, j);
        if (segmentColorForGrade(gj) !== col) break;
        j++;
        path.push([points[j].lat, points[j].lon]);
      }
      if (j === i) {
        j = i + 1;
        path.push([points[j].lat, points[j].lon]);
      }
      colored.addLayer(
        L.polyline(path, {
          color: col,
          weight: weight,
          opacity: 1,
          lineCap: "round",
          lineJoin: "round"
        })
      );
      i = j;
    }
    const arrowColor = resolveArrowColor(routeFallbackColor, casingColor);
    const layers = [casing, colored];
    if (typeof L.polylineDecorator === "function" && typeof L.Symbol !== "undefined") {
      layers.push(
        L.polylineDecorator(casing, {
          patterns: [
            {
              offset: "4%",
              repeat: "7%",
              symbol: L.Symbol.arrowHead({
                pixelSize: 12,
                headAngle: 42,
                polygon: false,
                pathOptions: {
                  color: arrowColor,
                  weight: 3,
                  opacity: 1,
                  lineCap: "round",
                  lineJoin: "round"
                }
              })
            }
          ]
        })
      );
    } else {
      layers.push(sortieAddManualDirectionArrows(latlngs, arrowColor));
    }
    const group = L.layerGroup(layers);
    group.mainLine = casing;
    return group;
  }

  function sortieAddTrackForRoute(map, route, useGradeColors) {
    const pts = route.profile.points;
    const latlngs = pts.map(function (p) {
      return [p.lat, p.lon];
    });
    const inner = routeInnerLineColor(route);
    const canGrade = useGradeColors && profileHasElevation(pts);
    if (canGrade) {
      return sortieAddGradeColoredTrack(map, pts, route.color, route.casingColor);
    }
    return sortieAddStravaTrack(map, latlngs, inner, route.casingColor);
  }

  /** Couleur « centre » lisible sur tuiles (évite le gris #e8e8e8 invisible seul). */
  function routeInnerLineColor(route) {
    const raw = (route && route.color) ? String(route.color).trim() : "";
    const low = raw.toLowerCase();
    if (low === "#e8e8e8" || low === "#eeeeee" || low === "#f5f5f5" || low === "#ffffff") {
      return "#94a3b8";
    }
    var hex = low.replace("#", "");
    if (hex.length === 6) {
      var r = parseInt(hex.slice(0, 2), 16);
      var g = parseInt(hex.slice(2, 4), 16);
      var b = parseInt(hex.slice(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (lum > 0.82) return "#94a3b8";
      }
    }
    return raw || "#2563eb";
  }

  function initSortieMap(route) {
    const section = document.getElementById("sortie-map-section");
    const mapEl = document.getElementById("sortie-map");
    const typeLine = document.getElementById("sortie-map-type-line");
    const optCities = document.getElementById("sortie-opt-cities");
    const optGrade = document.getElementById("sortie-opt-grade-colors");
    const gradeLegend = document.getElementById("sortie-grade-legend");
    const zoomIn = document.getElementById("sortie-zoom-in");
    const zoomOut = document.getElementById("sortie-zoom-out");

    if (
      !section ||
      !mapEl ||
      typeof L === "undefined" ||
      !route.profile ||
      !route.profile.points ||
      route.profile.points.length < 2
    ) {
      if (section) section.hidden = true;
      return;
    }

    section.hidden = false;
    if (typeLine) {
      typeLine.innerHTML =
        "Type de sortie : <strong>" + escapeHtml(sortieRaceTypeLabel(route)) + "</strong>";
    }

    const pts = route.profile.points;
    const latlngs = pts.map(function (p) {
      return [p.lat, p.lon];
    });
    const hasElev = profileHasElevation(pts);

    if (optGrade) {
      optGrade.disabled = !hasElev;
      const lab = optGrade.closest("label");
      if (lab) lab.style.opacity = hasElev ? "" : "0.5";
    }

    const map = L.map(mapEl, { scrollWheelZoom: true, zoomControl: true }).setView([pts[0].lat, pts[0].lon], 12);
    mapEl.classList.add("strava-map-tiles");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    let trackLayer = null;
    let citiesLayer = null;

    function boundsForLatLngs(ll) {
      return L.latLngBounds(ll);
    }

    function showCitiesOnMap() {
      if (citiesLayer) {
        map.removeLayer(citiesLayer);
        citiesLayer = null;
      }
      sortieUpdateCitiesList(route.cities || []);
      const head = document.getElementById("sortie-cities-heading");
      const hasCities = route.cities && route.cities.length;
      if (head) head.hidden = !hasCities;
      if (!hasCities) return;
      if (optCities && !optCities.checked) return;
      citiesLayer = sortieAddCityMarkers(map, route.cities);
      citiesLayer.addTo(map);
    }

    function redrawTrack() {
      if (trackLayer) {
        map.removeLayer(trackLayer);
        trackLayer = null;
      }
      const useGrade = optGrade && optGrade.checked;
      if (gradeLegend) {
        gradeLegend.hidden = !(useGrade && hasElev);
      }
      trackLayer = sortieAddTrackForRoute(map, route, useGrade);
      trackLayer.addTo(map);
      const popupInner =
        "<strong>" + escapeHtml(route.track) + "</strong><br>" +
        escapeHtml(route.depart && route.depart.dateLabel ? route.depart.dateLabel : "") +
        "<br>" +
        formatKm(route.profile.totalKm) +
        " · " +
        escapeHtml(route.name || "") +
        (useGrade && hasElev
          ? "<br><span style=\"font-size:0.8em;opacity:0.9\">Couleurs = pente (rouge = montée raide).</span>"
          : "");
      if (trackLayer.mainLine) {
        trackLayer.mainLine.bindPopup(popupInner);
      }
      try {
        map.fitBounds(boundsForLatLngs(latlngs), { padding: [36, 36], maxZoom: 14 });
      } catch (e1) {
        void e1;
      }
      showCitiesOnMap();
    }

    redrawTrack();

    if (optCities) {
      optCities.addEventListener("change", function () {
        showCitiesOnMap();
      });
    }
    if (optGrade) {
      optGrade.addEventListener("change", function () {
        redrawTrack();
      });
    }
    if (zoomIn) {
      zoomIn.addEventListener("click", function () {
        map.zoomIn();
      });
    }
    if (zoomOut) {
      zoomOut.addEventListener("click", function () {
        map.zoomOut();
      });
    }

    setTimeout(function () {
      map.invalidateSize({ animate: false });
    }, 200);
    window.addEventListener("resize", function () {
      map.invalidateSize({ animate: false });
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const errEl = document.getElementById("sortie-error");
    const contentEl = document.getElementById("sortie-content");
    const titleEl = document.getElementById("sortie-title");
    const heroWrap = document.getElementById("sortie-hero-wrap");
    const courseEl = document.getElementById("sortie-course");

    function showErr(msg) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = msg;
      }
      if (contentEl) contentEl.hidden = true;
    }

    const params = new URLSearchParams(window.location.search);
    const rawId = params.get("id");
    if (!rawId || !rawId.trim()) {
      showErr("Sortie introuvable : paramètre id manquant dans l’URL.");
      if (titleEl) titleEl.textContent = "Sortie";
      return;
    }
    const wantedId = decodeURIComponent(rawId.trim());

    if (isSupabaseEnabled()) {
      const hid = await supabaseRpc("goelo_hidden_builtin_ids", {});
      serverHiddenBuiltinIds = Array.isArray(hid)
        ? hid.map(function (x) { return String(x).trim(); }).filter(Boolean)
        : [];
    } else {
      serverHiddenBuiltinIds = [];
    }
    const extra = await fetchCustomRoutesFromSupabase();
    const merged = builtinsVisibleOnSite().concat(extra);
    const cfg = merged.find(function (r) {
      return String(r.id) === String(wantedId);
    });
    if (!cfg) {
      showErr("Aucune sortie ne correspond à cet identifiant.");
      if (titleEl) titleEl.textContent = "Sortie introuvable";
      return;
    }

    const profile = await loadRouteProfile(cfg);
    if (!profile) {
      showErr("Impossible de charger la trace GPX de cette sortie.");
      if (titleEl) titleEl.textContent = cfg.track || "Sortie";
      return;
    }

    const route = Object.assign({}, cfg, { profile: profile });
    route.cities = ensureCitiesForMap(route);
    if (errEl) errEl.hidden = true;
    if (contentEl) contentEl.hidden = false;
    if (titleEl) titleEl.textContent = route.track;

    if (heroWrap) {
      heroWrap.innerHTML = buildSortieHero(route);
    }

    const rideLeaderEl = document.getElementById("sortie-ride-leader");
    if (rideLeaderEl) {
      rideLeaderEl.textContent = route.rideLeader ? route.rideLeader : "—";
    }

    if (courseEl) {
      courseEl.innerHTML = buildCourseDetailsSortie(route, route.profile);
    }

    await refreshRegisteredUI(route);

    applySortieStatusBanner(route);

    initSortieMap(route);
    initSortieDiscussion(route);

    const signupForm = document.getElementById("sortie-signup-form");
    const signupCancel = document.getElementById("sortie-signup-cancel");
    if (signupCancel && !signupCancel.dataset.sortieBound) {
      signupCancel.dataset.sortieBound = "1";
      signupCancel.addEventListener("click", function () {
        const panel = document.getElementById("sortie-signup-panel");
        if (panel) panel.hidden = true;
      });
    }
    if (signupForm && !signupForm.dataset.sortieBound) {
      signupForm.dataset.sortieBound = "1";
      signupForm.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        if (!sortiePageRouteRef) return;
        const ps = document.getElementById("sortie-signup-pseudo");
        const em = document.getElementById("sortie-signup-email");
        const cl = document.getElementById("sortie-signup-cyclist-level");
        const cityEl = document.getElementById("sortie-signup-city");
        const res = await registerSortie(
          sortiePageRouteRef,
          ps ? ps.value : "",
          em ? em.value : "",
          cl ? cl.value : "",
          cityEl ? cityEl.value : ""
        );
        if (res.ok) {
          if (res.waitlist) {
            window.alert(
              "Les places du peloton principal sont prises — tu es en liste d’attente. Si un·e cycliste se désinscrit, tu seras promu·e automatiquement (tu le verras ici et sur la page Sorties)."
            );
          }
          const panel = document.getElementById("sortie-signup-panel");
          if (panel) panel.hidden = true;
          signupForm.reset();
          await refreshRegisteredUI(sortiePageRouteRef);
        } else {
          if (res.error === "already_registered") {
            window.alert("Tu es déjà inscrit·e sur ce parcours avec cet e-mail.");
          } else if (res.error !== "db") {
            window.alert("Inscription impossible pour le moment. Réessaie plus tard.");
          }
        }
      });
    }
  });
})();
