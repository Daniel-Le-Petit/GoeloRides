/**
 * GoëloRides — dates de sortie (calendrier Europe/Paris).
 * Utilisé pour les listes actives : date_sortie >= aujourd'hui (Paris).
 */
(function (global) {
  "use strict";

  var TZ = "Europe/Paris";

  var FR_MONTHS = {
    janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12
  };

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

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function ymdFromDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function rideDateFromFc(fc) {
    var cfg = fc && typeof fc === "object" ? fc : {};
    var iso = typeof cfg.rideDateIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cfg.rideDateIso.trim())
      ? cfg.rideDateIso.trim() : "";
    var time = typeof cfg.rideTime === "string" && /^\d{2}:\d{2}$/.test(cfg.rideTime.trim())
      ? cfg.rideTime.trim() : "";
    if (iso) {
      var hhmm = time ? time.split(":") : ["8", "30"];
      var p = iso.split("-");
      return new Date(+p[0], +p[1] - 1, +p[2], +hhmm[0], +hhmm[1]);
    }
    var d = cfg.depart && typeof cfg.depart === "object" ? cfg.depart : {};
    var label = String((d.dateLabel || cfg.dateLabel || "")).trim();
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

  function rideDateIsoFromFc(fc) {
    var cfg = parseFrontConfig(fc);
    var iso = typeof cfg.rideDateIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cfg.rideDateIso.trim())
      ? cfg.rideDateIso.trim() : "";
    if (iso) return iso;
    return ymdFromDate(rideDateFromFc(cfg));
  }

  function todayParisYmd() {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    var y = "";
    var m = "";
    var d = "";
    parts.forEach(function (p) {
      if (p.type === "year") y = p.value;
      if (p.type === "month") m = p.value;
      if (p.type === "day") d = p.value;
    });
    return y + "-" + m + "-" + d;
  }

  function sortieCalendarYmd(entry) {
    if (!entry) return null;
    if (entry.date instanceof Date) return ymdFromDate(entry.date);
    if (entry.front_config != null) return rideDateIsoFromFc(entry.front_config);
    if (typeof entry.rideDateIso === "string") return rideDateIsoFromFc(entry);
    return null;
  }

  /**
   * true si la sortie est à venir ou aujourd'hui (calendrier Paris).
   * entry : { date }, { front_config }, ou ligne routes Supabase.
   */
  function isActiveListSortie(entry) {
    var iso = sortieCalendarYmd(entry);
    if (!iso) return false;
    return iso >= todayParisYmd();
  }

  function isTodayParisSortie(entry) {
    var iso = sortieCalendarYmd(entry);
    return !!iso && iso === todayParisYmd();
  }

  global.GoeloSortieDates = {
    rideDateFromFc: rideDateFromFc,
    rideDateIsoFromFc: rideDateIsoFromFc,
    sortieCalendarYmd: sortieCalendarYmd,
    todayParisYmd: todayParisYmd,
    isActiveListSortie: isActiveListSortie,
    isTodayParisSortie: isTodayParisSortie
  };
})(typeof window !== "undefined" ? window : globalThis);
