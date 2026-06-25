/**
 * GoëloRides — Météo sorties (Open-Meteo, sans clé API)
 * Prévision au lieu et à l'heure de la sortie · cache 30 min · score vélo
 */
(function (global) {
  "use strict";

  var CACHE_TTL_MS = 30 * 60 * 1000;
  var FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  var GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
  var DEFAULT_COORDS = { lat: 48.6511, lon: -2.8394, label: "Saint-Quay-Portrieux" };
  var MAX_FORECAST_DAYS = 16;

  var STRINGS = {
    fr: {
      unavailable: "Météo indisponible momentanément",
      ideal: "Idéal",
      moderate: "Correct",
      difficult: "Difficile",
      scoreIdeal: "Conditions idéales",
      scoreModerate: "Conditions correctes",
      scoreDifficult: "Conditions difficiles",
      temp: "Température",
      feels: "Ressenti",
      rain: "Risque de pluie",
      wind: "Vent",
      conditions: "Conditions",
      forecastAt: "Prévision pour",
      loading: "Météo…"
    },
    en: {
      unavailable: "Weather temporarily unavailable",
      ideal: "Ideal",
      moderate: "Fair",
      difficult: "Tough",
      scoreIdeal: "Ideal conditions",
      scoreModerate: "Fair conditions",
      scoreDifficult: "Difficult conditions",
      temp: "Temperature",
      feels: "Feels like",
      rain: "Rain risk",
      wind: "Wind",
      conditions: "Conditions",
      forecastAt: "Forecast for",
      loading: "Weather…"
    }
  };

  var memoryCache = new Map();
  var inflight = new Map();

  function locale() {
    var lang = (global.document && global.document.documentElement.lang) || "fr";
    return lang.indexOf("en") === 0 ? "en" : "fr";
  }

  function t(key) {
    var loc = locale();
    return (STRINGS[loc] && STRINGS[loc][key]) || STRINGS.fr[key] || key;
  }

  function cacheGet(key) {
    var entry = memoryCache.get(key);
    if (!entry) {
      try {
        var raw = global.sessionStorage.getItem("goelo_wx:" + key);
        if (raw) entry = JSON.parse(raw);
      } catch (e) { void e; }
    }
    if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry.data;
  }

  function cacheSet(key, data) {
    var entry = { ts: Date.now(), data: data };
    memoryCache.set(key, entry);
    try {
      global.sessionStorage.setItem("goelo_wx:" + key, JSON.stringify(entry));
    } catch (e) { void e; }
  }

  function firstPoint(points) {
    if (!Array.isArray(points) || !points.length) return null;
    var p = points[0];
    if (Array.isArray(p) && p.length >= 2) {
      return { lat: +p[0], lon: +p[1] };
    }
    if (p && typeof p.lat === "number") {
      return { lat: p.lat, lon: p.lon != null ? p.lon : p.lng };
    }
    return null;
  }

  function resolveCoords(sortie) {
    if (sortie && typeof sortie.meetLat === "number" && typeof sortie.meetLon === "number") {
      return { lat: sortie.meetLat, lon: sortie.meetLon };
    }
    var fromGpx = firstPoint(sortie && sortie.embeddedPoints);
    if (fromGpx) return fromGpx;
    return null;
  }

  function placeKey(name) {
    return String(name || "").trim().toLowerCase();
  }

  async function geocodePlace(name) {
    var key = "geo:" + placeKey(name);
    var cached = cacheGet(key);
    if (cached) return cached;

    if (inflight.has(key)) return inflight.get(key);

    var promise = (async function () {
      try {
        var q = encodeURIComponent(String(name).trim());
        var url = GEOCODE_URL + "?name=" + q + "&count=1&language=fr&format=json";
        var res = await fetch(url);
        if (!res.ok) throw new Error("geocode " + res.status);
        var json = await res.json();
        var hit = json.results && json.results[0];
        if (!hit) return DEFAULT_COORDS;
        var out = { lat: hit.latitude, lon: hit.longitude, label: hit.name || name };
        cacheSet(key, out);
        return out;
      } catch (err) {
        console.warn("[GoeloWeather] geocode:", err.message || err);
        return DEFAULT_COORDS;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  async function resolveLocation(sortie) {
    var coords = resolveCoords(sortie);
    if (coords) return coords;
    var place = (sortie && sortie.place) ? String(sortie.place).trim() : "";
    if (place) return geocodePlace(place);
    return DEFAULT_COORDS;
  }

  function rideDateTime(sortie) {
    if (sortie && sortie.date instanceof Date && !isNaN(sortie.date.getTime())) {
      return new Date(sortie.date.getTime());
    }
    if (sortie && sortie.date && typeof sortie.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sortie.date)) {
      var p = sortie.date.split("-");
      var hh = 8;
      var mm = 30;
      var time = sortie.meetTime || sortie.rideTime || "";
      if (/^\d{2}:\d{2}$/.test(String(time))) {
        var t = String(time).split(":");
        hh = +t[0];
        mm = +t[1];
      }
      return new Date(+p[0], +p[1] - 1, +p[2], hh, mm);
    }
    return null;
  }

  function isoDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  async function fetchHourly(lat, lon, dateIso) {
    var key = "fc:" + lat.toFixed(3) + ":" + lon.toFixed(3) + ":" + dateIso;
    var cached = cacheGet(key);
    if (cached) return cached;

    if (inflight.has(key)) return inflight.get(key);

    var promise = (async function () {
      try {
        var params = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          hourly: "temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m",
          timezone: "Europe/Paris",
          start_date: dateIso,
          end_date: dateIso
        });
        var res = await fetch(FORECAST_URL + "?" + params.toString());
        if (!res.ok) throw new Error("forecast " + res.status);
        var json = await res.json();
        cacheSet(key, json);
        return json;
      } catch (err) {
        console.warn("[GoeloWeather] forecast:", err.message || err);
        return null;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  function pickHourIndex(hourly, target) {
    if (!hourly || !Array.isArray(hourly.time)) return -1;
    var targetIso = isoDate(target) + "T" + String(target.getHours()).padStart(2, "0") + ":00";
    var idx = hourly.time.indexOf(targetIso);
    if (idx >= 0) return idx;
    var best = -1;
    var bestDiff = Infinity;
    for (var i = 0; i < hourly.time.length; i++) {
      var t = new Date(hourly.time[i]);
      var diff = Math.abs(t.getTime() - target.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    return best;
  }

  function weatherCodeInfo(code) {
    var c = Number(code);
    if (c === 0) return { icon: "☀️", label: "Ciel dégagé" };
    if (c === 1 || c === 2) return { icon: "🌤️", label: "Peu nuageux" };
    if (c === 3) return { icon: "☁️", label: "Couvert" };
    if (c === 45 || c === 48) return { icon: "🌫️", label: "Brouillard" };
    if (c >= 51 && c <= 57) return { icon: "🌦️", label: "Bruine" };
    if (c >= 61 && c <= 67) return { icon: "🌧️", label: "Pluie" };
    if (c >= 71 && c <= 77) return { icon: "🌨️", label: "Neige" };
    if (c >= 80 && c <= 82) return { icon: "🌧️", label: "Averses" };
    if (c >= 95) return { icon: "⛈️", label: "Orage" };
    return { icon: "🌡️", label: "Variable" };
  }

  function computeBikeScore(temp, rainProb, windKmh) {
    if (temp == null && rainProb == null && windKmh == null) return null;
    var t = temp != null ? temp : 18;
    var r = rainProb != null ? rainProb : 0;
    var w = windKmh != null ? windKmh : 0;

    if (r > 50 || w > 25 || t < 5 || t > 35) return "difficult";
    if (r < 20 && w < 15 && t >= 12 && t <= 28) return "ideal";
    if ((r >= 20 && r <= 50) || (w >= 15 && w <= 25)) return "moderate";
    return "moderate";
  }

  function scoreLabel(score) {
    if (score === "ideal") return t("scoreIdeal");
    if (score === "moderate") return t("scoreModerate");
    if (score === "difficult") return t("scoreDifficult");
    return "";
  }

  function scoreBadgeShort(score) {
    if (score === "ideal") return "🟢 " + t("ideal");
    if (score === "moderate") return "🟡 " + t("moderate");
    if (score === "difficult") return "🔴 " + t("difficult");
    return "";
  }

  function formatForecastWhen(d) {
    if (!d) return "";
    return new Intl.DateTimeFormat(locale() === "en" ? "en-GB" : "fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  }

  function buildSnapshot(hourly, idx, when, coords) {
    if (!hourly || idx < 0) return { status: "error" };
    var temp = hourly.temperature_2m[idx];
    var feels = hourly.apparent_temperature[idx];
    var rain = hourly.precipitation_probability[idx];
    var wind = hourly.wind_speed_10m[idx];
    var code = hourly.weather_code[idx];
    var info = weatherCodeInfo(code);
    var score = computeBikeScore(temp, rain, wind);

    return {
      status: "ok",
      score: score,
      tempC: temp,
      feelsC: feels,
      rainProb: rain,
      windKmh: wind,
      weatherCode: code,
      icon: info.icon,
      conditions: info.label,
      forecastAt: when,
      forecastLabel: formatForecastWhen(when),
      lat: coords.lat,
      lon: coords.lon
    };
  }

  async function getWeatherForSortie(sortie) {
    var when = rideDateTime(sortie);
    if (!when) {
      return { status: "error", message: t("unavailable") };
    }

    var now = new Date();
    var diffDays = (when.getTime() - now.getTime()) / (86400000);
    if (diffDays > MAX_FORECAST_DAYS) {
      return { status: "error", message: t("unavailable") };
    }

    var coords = await resolveLocation(sortie);
    var dateIso = isoDate(when);
    var hourlyPayload = await fetchHourly(coords.lat, coords.lon, dateIso);
    if (!hourlyPayload || !hourlyPayload.hourly) {
      return { status: "error", message: t("unavailable") };
    }

    var idx = pickHourIndex(hourlyPayload.hourly, when);
    var snap = buildSnapshot(hourlyPayload.hourly, idx, when, coords);
    if (snap.status !== "ok") {
      snap.message = t("unavailable");
    }
    return snap;
  }

  async function enrichSorties(sorties) {
    if (!Array.isArray(sorties) || !sorties.length) return sorties;

    var buckets = new Map();

    for (var i = 0; i < sorties.length; i++) {
      var s = sorties[i];
      var when = rideDateTime(s);
      if (!when) {
        s.weather = { status: "error", message: t("unavailable") };
        continue;
      }
      var coords = await resolveLocation(s);
      var key = coords.lat.toFixed(3) + ":" + coords.lon.toFixed(3) + ":" + isoDate(when);
      if (!buckets.has(key)) {
        buckets.set(key, { coords: coords, when: when, list: [] });
      }
      buckets.get(key).list.push(s);
    }

    var tasks = [];
    buckets.forEach(function (bucket) {
      tasks.push((async function () {
        var dateIso = isoDate(bucket.when);
        var hourlyPayload = await fetchHourly(bucket.coords.lat, bucket.coords.lon, dateIso);
        if (!hourlyPayload || !hourlyPayload.hourly) {
          bucket.list.forEach(function (s) {
            s.weather = { status: "error", message: t("unavailable") };
          });
          return;
        }
        var idx = pickHourIndex(hourlyPayload.hourly, bucket.when);
        var snap = buildSnapshot(hourlyPayload.hourly, idx, bucket.when, bucket.coords);
        if (snap.status !== "ok") snap.message = t("unavailable");
        bucket.list.forEach(function (s) {
          s.weather = snap;
          if (snap.status === "ok") {
            s.weatherLat = snap.lat;
            s.weatherLon = snap.lon;
          }
        });
      })());
    });

    await Promise.all(tasks);
    return sorties;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function badgeHtml(weather, opts) {
    opts = opts || {};
    if (!weather || weather.status !== "ok" || !weather.score) {
      return '<span class="go-wx-badge go-wx-badge--na" title="' + escapeHtml(t("unavailable")) + '">—</span>';
    }
    var cls = "go-wx-badge go-wx-badge--" + weather.score;
    var label = scoreBadgeShort(weather.score);
    return '<span class="' + cls + '" title="' + escapeHtml(scoreLabel(weather.score)) + '">' +
      escapeHtml(label) + "</span>";
  }

  function cardHtml(weather) {
    if (!weather || weather.status !== "ok") {
      return (
        '<div class="go-wx-card go-wx-card--na">' +
        '<p class="go-wx-card__unavailable">' + escapeHtml(weather && weather.message ? weather.message : t("unavailable")) + "</p>" +
        "</div>"
      );
    }

    var temp = weather.tempC != null ? Math.round(weather.tempC) + "°C" : "—";
    var feels = weather.feelsC != null ? Math.round(weather.feelsC) + "°C" : "—";
    var rain = weather.rainProb != null ? Math.round(weather.rainProb) + " %" : "—";
    var wind = weather.windKmh != null ? Math.round(weather.windKmh) + " km/h" : "—";

    return (
      '<div class="go-wx-card go-wx-card--' + escapeHtml(weather.score) + '">' +
        '<div class="go-wx-card__head">' +
          '<span class="go-wx-card__icon" aria-hidden="true">' + weather.icon + "</span>" +
          '<div class="go-wx-card__head-text">' +
            '<p class="go-wx-card__conditions">' + escapeHtml(weather.conditions) + "</p>" +
            '<p class="go-wx-card__temp">' + escapeHtml(temp) +
              (weather.feelsC != null ? ' <span class="go-wx-card__feels">(' + escapeHtml(t("feels")) + " " + escapeHtml(feels) + ")</span>" : "") +
            "</p>" +
          "</div>" +
          '<span class="go-wx-card__score">' + escapeHtml(scoreBadgeShort(weather.score)) + "</span>" +
        "</div>" +
        '<dl class="go-wx-card__grid">' +
          '<div><dt>' + escapeHtml(t("rain")) + '</dt><dd>' + escapeHtml(rain) + "</dd></div>" +
          '<div><dt>' + escapeHtml(t("wind")) + '</dt><dd>' + escapeHtml(wind) + "</dd></div>" +
          '<div class="go-wx-card__when"><dt>' + escapeHtml(t("forecastAt")) + '</dt><dd>' + escapeHtml(weather.forecastLabel || "") + "</dd></div>" +
        "</dl>" +
      "</div>"
    );
  }

  function weatherSortKey(weather) {
    if (!weather || weather.status !== "ok" || !weather.score) {
      return { tier: 3, rain: 999, wind: 999 };
    }
    var tier = weather.score === "ideal" ? 0 : weather.score === "moderate" ? 1 : 2;
    return {
      tier: tier,
      rain: weather.rainProb != null ? weather.rainProb : 50,
      wind: weather.windKmh != null ? weather.windKmh : 50
    };
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var p = Math.PI / 180;
    var a =
      Math.sin(((lat2 - lat1) * p) / 2) * Math.sin(((lat2 - lat1) * p) / 2) +
      Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) * Math.sin(((lon2 - lon1) * p) / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  global.GoeloWeather = {
    t: t,
    DEFAULT_COORDS: DEFAULT_COORDS,
    resolveCoords: resolveCoords,
    resolveLocation: resolveLocation,
    rideDateTime: rideDateTime,
    getWeatherForSortie: getWeatherForSortie,
    enrichSorties: enrichSorties,
    computeBikeScore: computeBikeScore,
    badgeHtml: badgeHtml,
    cardHtml: cardHtml,
    weatherSortKey: weatherSortKey,
    haversineKm: haversineKm,
    scoreBadgeShort: scoreBadgeShort,
    scoreLabel: scoreLabel
  };
})(typeof window !== "undefined" ? window : globalThis);
