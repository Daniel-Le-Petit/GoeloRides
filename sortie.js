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

  const SHARED = {
    meetPlace: "Devant le Kasino",
    meetParking: "Parking du Kasino, Saint-Quay-Portrieux",
    meetRv: "8h20",
    region: "Côte du Goëlo",
    time: "8h30"
  };

  const FORM_NOTIFY_EMAIL = "goelo.rides@gmail.com";
  var sortiePageRouteRef = null;

  function departTimeDisplay(route) {
    const label = String((route.depart && route.depart.dateLabel) || "");
    const m = label.match(/[·.]\s*(\d{1,2}h\d{2})/);
    if (m) return m[1];
    const m2 = label.match(/(\d{1,2}h\d{2})/);
    return m2 ? m2[1] : SHARED.time;
  }

  function routeSkinClass(route) {
    if (route.id === "falaises") return "is-route-falaises";
    if (route.id === "brehec") return "is-route-brehec";
    if (route.id === "boucle") return "is-route-boucle";
    return "is-custom-route";
  }

  const BIKE_SVG =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path fill="#1f2937" d="M5 20.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm14 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z' +
    'M6.8 15h10.4l1.2-3.5H8.3L6.8 15zm2.5-5.2L10 8h3.2l.5 1.8h-4.4z"/></svg>';

  function buildHeroTable(route) {
    const d = route.depart || {};
    const timeInTable = departTimeDisplay(route);
    const kmTxt = route.profile ? formatKm(route.profile.totalKm) : "—";
    return (
      '<table class="ride-event-card ride-event-card--choice ' +
      routeSkinClass(route) +
      '">' +
      "<tbody>" +
      '<tr><td class="ride-td-left"><span class="ride-day">' +
      escapeHtml(d.day || "—") +
      "</span></td>" +
      '<td class="ride-td-right"><div class="ride-km-row ride-km-row--sortie">' +
      '<p class="ride-km">' +
      kmTxt +
      "</p>" +
      '<div id="sortie-hero-actions" class="sortie-hero-actions"></div>' +
      "</div></td></tr>" +
      '<tr><td class="ride-td-left"><span class="ride-month">' +
      escapeHtml(d.month || "") +
      "</span></td>" +
      '<td class="ride-td-right"><h4 class="ride-course">' +
      escapeHtml(route.track) +
      "</h4></td></tr>" +
      '<tr><td class="ride-td-left"><span class="ride-time">' +
      escapeHtml(timeInTable) +
      "</span></td>" +
      '<td class="ride-td-right"><p class="ride-group">' +
      escapeHtml(route.name) +
      "</p></td></tr>" +
      '<tr><td class="ride-td-left ride-td-bike" rowspan="2">' +
      '<p class="ride-meet-place">' +
      escapeHtml(route.meetPlace || DEFAULT_MEET_PLACE) +
      "</p>" +
      '<div class="ride-aside-bike">' +
      BIKE_SVG +
      "</div></td>" +
      '<td class="ride-td-right"><p class="ride-pace-level">' +
      escapeHtml(route.pace || "—") +
      " · " +
      escapeHtml(route.levelLabel || "—") +
      "</p></td></tr>" +
      '<tr><td class="ride-td-right"><p class="ride-desc">' +
      escapeHtml(route.shortDesc || "") +
      "</p></td></tr>" +
      "</tbody></table>"
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
      '<div class="sortie-fact"><dt>Lieu de rendez-vous</dt><dd>' +
      escapeHtml(route.meetPlace || DEFAULT_MEET_PLACE) +
      "</dd></div></dl>" +

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
      "<li>Sur routes larges, roulez en <strong>file à deux</strong> au maximum ; en file indienne sur les portions étroites.</li>" +
      "<li>Signale les obstacles (poteaux, nids-de-poule, dos-d’âne…).</li>" +
      "<li>Garde ta ligne et signale clairement tout dépassement.</li>" +
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
      '<p class="sortie-prose"><strong>Goëlo Rides</strong> : pas de cotisation annuelle. L’inscription sur la page Sorties, ici avec « Je participe ! », ou par e-mail sert à <strong>anticiper le nombre de participants</strong>. Préviens-nous si tu ne peux finalement pas venir.</p></section>' +

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
        _template: "table"
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

  async function registerSortie(route, pseudo, email) {
    const p = (pseudo || "").trim();
    const e = (email || "").trim().toLowerCase();
    if (!p || !e) return { ok: false, error: "missing" };
    if (isSupabaseEnabled()) {
      var data = await supabaseRpc("signup_register", {
        p_route_id: route.id,
        p_pseudo: p,
        p_email: e
      });
      if (Array.isArray(data)) data = data[0];
      if (!data || !data.ok) {
        if (data && data.error === "already_registered") {
          return { ok: false, error: "already_registered" };
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
      return { ok: true };
    }
    const obj = loadLocalSignupsObject();
    if (!obj[route.id]) obj[route.id] = [];
    const wasNew = !isRegisteredLocal(route.id, e, obj);
    if (wasNew) {
      obj[route.id].push({ pseudo: p, email: e, at: new Date().toISOString() });
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
    return { ok: true };
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
  async function fetchSignupSnapshotForRoute(routeId) {
    const rid = String(routeId);
    if (isSupabaseEnabled()) {
      var data = await supabaseRpc("signup_list_all_names", {});
      if (Array.isArray(data) && data.length) data = data[0];
      if (data == null || typeof data !== "object") {
        return {
          countText: "Inscrits : —",
          names: [],
          rpcFailed: true,
          localMode: false
        };
      }
      var arr = data[rid];
      var names = Array.isArray(arr)
        ? arr
            .map(function (x) {
              return String(x).trim();
            })
            .filter(Boolean)
        : [];
      var n = names.length;
      var countText = n === 0 ? "0 inscrit·e·s" : n === 1 ? "1 inscrit·e" : n + " inscrit·e·s";
      return { countText: countText, names: names, rpcFailed: false, localMode: false };
    }
    var obj = loadLocalSignupsObject();
    var localArr = obj[rid];
    var names = [];
    if (Array.isArray(localArr)) {
      localArr.forEach(function (e) {
        var p = e && e.pseudo ? String(e.pseudo).trim() : "";
        if (p && names.indexOf(p) === -1) names.push(p);
      });
    }
    var m = names.length;
    var countText =
      m === 0
        ? "0 inscrit·e·s (mode local)"
        : m === 1
          ? "1 inscrit·e (mode local)"
          : m + " inscrit·e·s (mode local)";
    return { countText: countText, names: names, rpcFailed: false, localMode: true };
  }

  function renderSortieParticipantsPanel(snap) {
    var sec = document.getElementById("sortie-participants-section");
    var listEl = document.getElementById("sortie-participants-list");
    var emptyEl = document.getElementById("sortie-participants-empty");
    if (!sec || !listEl || !emptyEl) return;
    sec.hidden = false;
    listEl.innerHTML = "";
    if (snap.rpcFailed) {
      emptyEl.hidden = false;
      emptyEl.textContent = "Liste des participant·e·s indisponible pour le moment.";
      return;
    }
    snap.names.forEach(function (name) {
      var li = document.createElement("li");
      li.className = "sortie-participants-item";
      li.textContent = name;
      listEl.appendChild(li);
    });
    emptyEl.hidden = snap.names.length > 0;
    emptyEl.textContent = snap.localMode
      ? "Aucun pseudo enregistré sur cet appareil pour cette sortie."
      : "Personne pour l’instant — sois le ou la première !";
  }

  async function refreshRegisteredUI(route) {
    const registered = await userIsRegisteredForRoute(route.id);
    const regLine = document.getElementById("sortie-reg-line");
    if (regLine) {
      regLine.hidden = false;
      regLine.textContent = registered
        ? "Tu es inscrit·e sur cette sortie ✓"
        : "Pas encore inscrit·e — utilise le bouton orange « Je participe ! » ci-dessous.";
      regLine.classList.toggle("sortie-reg-line--ok", registered);
    }
    const snap = await fetchSignupSnapshotForRoute(route.id);
    const countEl = document.getElementById("sortie-signup-count");
    if (countEl) {
      countEl.hidden = false;
      countEl.textContent = snap.countText;
      countEl.setAttribute("aria-label", snap.countText);
    }
    renderSortieParticipantsPanel(snap);
    mountSortieParticipateUI(route, registered);
  }

  function mountSortieParticipateUI(route, registered) {
    sortiePageRouteRef = route;
    const host = document.getElementById("sortie-hero-actions");
    if (!host) return;
    host.innerHTML = "";

    if (registered) {
      const row = document.createElement("div");
      row.className = "sortie-hero-inscrit-row";

      const badge = document.createElement("span");
      badge.className = "sortie-inscrit-badge";
      badge.setAttribute("role", "status");
      badge.textContent = "Inscrit·e ✓";
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
      if (emEl) emEl.value = getLastStoredEmail() || "";
      if (panel) panel.hidden = false;
      if (psEl) psEl.focus();
    });
    host.appendChild(go);
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
      const marker = L.marker([city.lat, city.lon], { icon: sortieCityMarkerIcon(city) });
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

    const extra = await fetchCustomRoutesFromSupabase();
    const merged = ROUTES_BUILTIN.concat(extra);
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
    if (errEl) errEl.hidden = true;
    if (contentEl) contentEl.hidden = false;
    if (titleEl) titleEl.textContent = route.track;

    if (heroWrap) {
      const thumb = thumbForRoute(route);
      heroWrap.innerHTML =
        '<div class="sortie-hero-grid">' +
        '<div class="sortie-hero-thumb"><img src="' +
        escapeAttr(thumb) +
        '" alt="" loading="lazy" decoding="async"></div>' +
        '<div class="sortie-hero-table">' +
        buildHeroTable(route) +
        "</div></div>";
    }

    if (courseEl) {
      courseEl.innerHTML = buildCourseDetailsSortie(route, route.profile);
    }

    await refreshRegisteredUI(route);

    initSortieMap(route);

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
        const res = await registerSortie(sortiePageRouteRef, ps ? ps.value : "", em ? em.value : "");
        if (res.ok) {
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
