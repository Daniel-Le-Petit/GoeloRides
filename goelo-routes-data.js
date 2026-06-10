/**
 * Shared route data, French date utilities, duration parsing, and DB↔route mapping.
 *
 * Depends on: goelo-supabase-client.js (window.GoeloShared.isSupabaseEnabled, supabaseRpc).
 * Loaded before page-specific scripts.
 */
(function () {
  "use strict";
  var G = (window.GoeloShared = window.GoeloShared || {});

  /* ── Constants ── */
  var GPX_MAX_POINTS = 6000;
  var DEFAULT_MEET_PLACE = "Devant le Kasino";
  var LOCAL_SIGNUPS_KEY = "goeloRides_inscriptions_v1";

  /* ── Built-in routes (superset — thumbSrc + meetPlace included) ── */
  var ROUTES_BUILTIN = [
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

  /* ── Visibility (server + local skip list) ── */
  var serverHiddenBuiltinIds = [];

  function mergeHiddenBuiltinIdsSet() {
    var hide = {};
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
    var hide = mergeHiddenBuiltinIdsSet();
    return ROUTES_BUILTIN.filter(function (r) {
      return !hide[String(r.id)];
    });
  }

  /* ── French month maps ── */
  var FR_MONTHS = {
    janvier: 1,
    "février": 2,
    fevrier: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    "août": 8,
    aout: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    "décembre": 12,
    decembre: 12
  };

  var FR_MONTH_NAMES_UPPER = [
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
    var lower = String(monthWord || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    var idx = FR_MONTHS[lower];
    if (!idx) return String(monthWord || "").trim().toUpperCase();
    return FR_MONTH_NAMES_UPPER[idx] || String(monthWord || "").trim().toUpperCase();
  }

  /** Ex. « 7 juillet 2026 · 8h30 » or « 1er juillet 2026 » */
  function parseFrenchDateLabelParts(label) {
    var raw = String(label || "").trim();
    if (!raw) return null;
    var rx = /(\d{1,2})(?:er)?\s+([a-zéèêëàâùûôîïçA-ZÉÈÊËÀÂÙÛÔÎÏÇ]+)\s+(\d{4})/;
    var m = raw.match(rx);
    if (!m) return null;
    var day = String(parseInt(m[1], 10));
    var year = String(parseInt(m[3], 10));
    var month = normalizeMonthWordForDisplay(m[2]);
    if (!month) return null;
    return { day: day, month: month, year: year };
  }

  function enrichDepartObject(depart, dateLabelFallback) {
    var d =
      depart && typeof depart === "object"
        ? Object.assign({}, depart)
        : { day: "", month: "", year: "", weekday: "", dateLabel: "" };
    var label = String(d.dateLabel || dateLabelFallback || "").trim();
    if (!d.dateLabel && label) d.dateLabel = label;
    var hasDay = String(d.day || "").trim() !== "";
    var hasMonth = String(d.month || "").trim() !== "";
    if (hasDay && hasMonth) return d;
    var p = parseFrenchDateLabelParts(label);
    if (!p) return d;
    if (!hasDay) d.day = p.day;
    if (!hasMonth) d.month = p.month;
    if (!String(d.year || "").trim()) d.year = p.year;
    return d;
  }

  /* ── Duration parsing ── */
  function formatMinutesToHm(totalMin) {
    var h = Math.floor(totalMin / 60);
    var mm = totalMin % 60;
    return String(h) + ":" + String(mm).padStart(2, "0");
  }

  function parseSingleHmFragment(frag) {
    var m = String(frag || "")
      .trim()
      .match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
    if (!m) return null;
    var hh = parseInt(m[1], 10);
    var mm = parseInt(m[2], 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm < 0 || mm > 59 || hh > 36) return null;
    var minutes = hh * 60 + mm;
    if (minutes <= 0) return null;
    return { minutes: minutes, hm: formatMinutesToHm(minutes) };
  }

  /** Admin input: minutes, « H:MM » or « H:MM - H:MM » → { minutes, hm, isRange? } or null. */
  function parseDurationInputToStore(raw) {
    var s = String(raw || "").trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      var n = parseInt(s, 10);
      if (!Number.isFinite(n) || n <= 0 || n > 36 * 60) return null;
      return { minutes: n, hm: formatMinutesToHm(n) };
    }
    var rm = s.match(
      /^(\d{1,2}\s*:\s*\d{1,2})\s*[-–—]\s*(\d{1,2}\s*:\s*\d{1,2})$/
    );
    if (rm) {
      var a = parseSingleHmFragment(rm[1]);
      var b = parseSingleHmFragment(rm[2]);
      if (!a || !b) return null;
      if (b.minutes < a.minutes) return null;
      if (b.minutes === a.minutes) {
        return { minutes: a.minutes, hm: a.hm };
      }
      var avg = Math.round((a.minutes + b.minutes) / 2);
      return {
        minutes: avg,
        hm: a.hm + " - " + b.hm,
        isRange: true,
        minMinutes: a.minutes,
        maxMinutes: b.minutes
      };
    }
    var one = parseSingleHmFragment(s);
    if (one) return { minutes: one.minutes, hm: one.hm };
    return null;
  }

  /* ── Route config parsing ── */
  /** front_config (jsonb): object; some paths return a JSON string. */
  function parseRouteFrontConfig(raw) {
    if (raw == null) return {};
    if (typeof raw === "string") {
      try {
        var p = JSON.parse(raw);
        return p && typeof p === "object" && !Array.isArray(p) ? p : {};
      } catch (err) {
        void err;
        return {};
      }
    }
    if (typeof raw === "object" && !Array.isArray(raw)) return raw;
    return {};
  }

  /** Map a Supabase routes row to a normalized route object. */
  function dbRowToRoute(row) {
    var fc = parseRouteFrontConfig(row && row.front_config);
    var so = row.sort_order;

    var rideLeader = "";
    if (typeof fc.rideLeader === "string" && fc.rideLeader.trim()) {
      rideLeader = fc.rideLeader.trim();
    } else if (typeof fc.ride_leader === "string" && fc.ride_leader.trim()) {
      rideLeader = fc.ride_leader.trim();
    }

    var meetPlaceDetail = "";
    if (typeof fc.meetPlaceDetail === "string" && fc.meetPlaceDetail.trim()) {
      meetPlaceDetail = fc.meetPlaceDetail.trim();
    } else if (typeof fc.meet_place_detail === "string" && fc.meet_place_detail.trim()) {
      meetPlaceDetail = fc.meet_place_detail.trim();
    }

    return {
      id: row.id,
      raw_front_config: row != null ? row.front_config : null,
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
      rideLeader: rideLeader,
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
          : typeof fc.meet_place === "string" && fc.meet_place.trim()
            ? fc.meet_place.trim()
            : DEFAULT_MEET_PLACE,
      meetPlaceDetail: meetPlaceDetail,
      estimatedDurationHm:
        typeof fc.estimatedDurationHm === "string" && fc.estimatedDurationHm.trim()
          ? String(fc.estimatedDurationHm).trim()
          : typeof fc.estimated_duration_hm === "string" && fc.estimated_duration_hm.trim()
            ? String(fc.estimated_duration_hm).trim()
            : "",
      estimatedDurationMinutes: (function () {
        var nRaw = fc.estimatedDurationMinutes != null ? fc.estimatedDurationMinutes : fc.estimated_duration_minutes;
        if (typeof nRaw === "number" && Number.isFinite(nRaw)) {
          var rounded = Math.round(nRaw);
          return rounded > 0 ? Math.min(rounded, 36 * 60) : null;
        }
        if (typeof nRaw === "string" && /^\d+$/.test(String(nRaw).trim())) {
          var v = parseInt(String(nRaw).trim(), 10);
          return Number.isFinite(v) && v > 0 ? Math.min(v, 36 * 60) : null;
        }
        var hmStr =
          typeof fc.estimatedDurationHm === "string" && fc.estimatedDurationHm.trim()
            ? fc.estimatedDurationHm.trim()
            : typeof fc.estimated_duration_hm === "string" && fc.estimated_duration_hm.trim()
              ? fc.estimated_duration_hm.trim()
              : "";
        if (hmStr) {
          var dur = parseDurationInputToStore(hmStr);
          return dur ? dur.minutes : null;
        }
        return null;
      })(),
      maxParticipants: (function () {
        var raw =
          fc.maxParticipants != null
            ? fc.maxParticipants
            : fc.max_participants != null
              ? fc.max_participants
              : fc.max_places != null
                ? fc.max_places
                : fc.capacity != null
                  ? fc.capacity
                  : null;
        if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.round(raw);
        if (typeof raw === "string" && String(raw).trim()) {
          var n = Math.max(0, parseInt(String(raw).replace(/\D/g, ""), 10) || 0);
          return n > 0 ? n : null;
        }
        return null;
      })(),
      sortieStatus: typeof fc.sortieStatus === "string" && fc.sortieStatus.trim() ? fc.sortieStatus.trim() : "open",
      visibility: typeof fc.visibility === "string" && fc.visibility.trim() ? fc.visibility.trim() : "public",
      rideDateIso:
        typeof fc.rideDateIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(fc.rideDateIso).trim())
          ? String(fc.rideDateIso).trim()
          : "",
      rideTime:
        typeof fc.rideTime === "string" && /^\d{2}:\d{2}$/.test(String(fc.rideTime).trim())
          ? String(fc.rideTime).trim()
          : "",
      sortOrder: typeof so === "number" && Number.isFinite(so) ? so : 40,
      cities: Array.isArray(fc.cities) && fc.cities.length
        ? fc.cities
        : [{ name: "Saint-Quay-Portrieux", lat: 48.6536, lon: -2.8353, start: true }],
      routeKind: row.route_kind || row.routeKind || "custom"
    };
  }

  /** PostgREST often returns an array; some configs return a JSON string or wrapper. */
  function normalizeRoutesListRows(data) {
    if (data == null) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === "string") {
      try {
        var p = JSON.parse(data);
        return Array.isArray(p) ? p : [];
      } catch (err) {
        void err;
        return [];
      }
    }
    if (typeof data === "object" && Array.isArray(data.routes)) return data.routes;
    return [];
  }

  /* ── Public API ── */
  G.GPX_MAX_POINTS = GPX_MAX_POINTS;
  G.DEFAULT_MEET_PLACE = DEFAULT_MEET_PLACE;
  G.LOCAL_SIGNUPS_KEY = LOCAL_SIGNUPS_KEY;
  G.ROUTES_BUILTIN = ROUTES_BUILTIN;
  G.FR_MONTHS = FR_MONTHS;
  G.FR_MONTH_NAMES_UPPER = FR_MONTH_NAMES_UPPER;

  G.mergeHiddenBuiltinIdsSet = mergeHiddenBuiltinIdsSet;
  G.builtinsVisibleOnSite = builtinsVisibleOnSite;
  G.normalizeMonthWordForDisplay = normalizeMonthWordForDisplay;
  G.parseFrenchDateLabelParts = parseFrenchDateLabelParts;
  G.enrichDepartObject = enrichDepartObject;
  G.formatMinutesToHm = formatMinutesToHm;
  G.parseSingleHmFragment = parseSingleHmFragment;
  G.parseDurationInputToStore = parseDurationInputToStore;
  G.parseRouteFrontConfig = parseRouteFrontConfig;
  G.dbRowToRoute = dbRowToRoute;
  G.normalizeRoutesListRows = normalizeRoutesListRows;

  /* Mutable server-hidden IDs array (pages push into it after fetching from Supabase). */
  Object.defineProperty(G, "serverHiddenBuiltinIds", {
    get: function () { return serverHiddenBuiltinIds; },
    set: function (v) { serverHiddenBuiltinIds = v; },
    enumerable: true
  });
})();
