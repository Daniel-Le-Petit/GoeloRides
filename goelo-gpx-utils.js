/**
 * Shared GPX parsing, geo utilities, and track analysis.
 *
 * Depends on: goelo-routes-data.js (window.GoeloShared.GPX_MAX_POINTS).
 * Loaded before page-specific scripts.
 */
(function () {
  "use strict";
  var G = (window.GoeloShared = window.GoeloShared || {});

  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var p = Math.PI / 180;
    var a =
      Math.pow(Math.sin((lat2 - lat1) * p / 2), 2) +
      Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.pow(Math.sin((lon2 - lon1) * p / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function parseGpxTrack(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) return [];
    var points = [];
    var nodes = doc.getElementsByTagName("*");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var tag = el.localName || el.nodeName.split(":").pop();
      if (tag !== "trkpt" && tag !== "rtept") continue;
      var lat = parseFloat(el.getAttribute("lat"));
      var lon = parseFloat(el.getAttribute("lon"));
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      var ele = null;
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
        var n = c.localName || c.nodeName.split(":").pop();
        if (n === "ele" && c.textContent) {
          var v = parseFloat(c.textContent.trim());
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
    var n = points.length;
    if (!n) return [];
    var hasAny = points.some(function (p) {
      return typeof p.ele === "number" && !Number.isNaN(p.ele);
    });
    if (!hasAny) {
      return points.map(function (p) {
        return { lat: p.lat, lon: p.lon };
      });
    }
    var out = points.map(function (p) {
      return {
        lat: p.lat,
        lon: p.lon,
        ele: typeof p.ele === "number" && !Number.isNaN(p.ele) ? p.ele : null
      };
    });
    var first = -1;
    var last = -1;
    for (var i = 0; i < n; i++) {
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
    for (var i = 0; i < first; i++) out[i].ele = out[first].ele;
    for (var i = last + 1; i < n; i++) out[i].ele = out[last].ele;
    var i = first;
    while (i < last) {
      var j = i + 1;
      while (j <= last && out[j].ele === null) j++;
      if (j > last) break;
      var e0 = out[i].ele;
      var e1 = out[j].ele;
      var steps = j - i;
      for (var k = 1; k < steps; k++) {
        out[i + k].ele = e0 + (e1 - e0) * (k / steps);
      }
      i = j;
    }
    return out;
  }

  function simplifyTrack(points, maxPoints) {
    if (points.length <= maxPoints) return points.slice();
    var step = Math.ceil(points.length / maxPoints);
    var out = [points[0]];
    for (var i = step; i < points.length - 1; i += step) out.push(points[i]);
    out.push(points[points.length - 1]);
    return out;
  }

  function computeElevationGainM(points) {
    if (!points || points.length < 2) return null;
    var gain = 0;
    var any = false;
    for (var i = 1; i < points.length; i++) {
      var e0 = points[i - 1].ele;
      var e1 = points[i].ele;
      if (typeof e0 !== "number" || typeof e1 !== "number" || Number.isNaN(e0) || Number.isNaN(e1)) continue;
      any = true;
      var d = e1 - e0;
      if (d > 0) gain += d;
    }
    return any ? Math.round(gain) : null;
  }

  function buildTrack(points) {
    var filled = fillElevationGaps(points);
    var distM = 0;
    for (var i = 1; i < filled.length; i++) {
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
    var lat = r[0];
    var lon = r[1];
    var ele = r.length > 2 && r[2] != null && !Number.isNaN(Number(r[2])) ? Number(r[2]) : undefined;
    return { lat: lat, lon: lon, ele: ele };
  }

  function profileFromEmbeddedRows(rows) {
    if (!rows || !rows.length) return null;
    var pts = rows.map(deserializeEmbeddedPointRow).filter(Boolean);
    if (pts.length < 2) return null;
    return buildTrack(pts);
  }

  async function loadGpxTrack(url) {
    try {
      var res = await fetch(encodeURI(url));
      if (!res.ok) return null;
      var pts = simplifyTrack(parseGpxTrack(await res.text()), G.GPX_MAX_POINTS);
      return pts.length ? buildTrack(pts) : null;
    } catch (e) {
      void e;
      return null;
    }
  }

  async function loadRouteProfile(cfg) {
    var emb = cfg && cfg.embeddedPoints;
    if (emb && Array.isArray(emb) && emb.length >= 2) {
      var prof = profileFromEmbeddedRows(emb);
      if (prof && prof.points && prof.points.length) return prof;
    }
    var file = cfg && cfg.file != null ? String(cfg.file).trim() : "";
    if (file) return loadGpxTrack(file);
    return null;
  }

  function serializeEmbeddedPoints(points, maxN) {
    var simp = simplifyTrack(points, maxN);
    return simp.map(function (p) {
      var row = [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5];
      if (typeof p.ele === "number" && !Number.isNaN(p.ele)) row.push(Math.round(p.ele * 10) / 10);
      return row;
    });
  }

  /* ── Public API ── */
  G.haversine = haversine;
  G.parseGpxTrack = parseGpxTrack;
  G.fillElevationGaps = fillElevationGaps;
  G.simplifyTrack = simplifyTrack;
  G.computeElevationGainM = computeElevationGainM;
  G.buildTrack = buildTrack;
  G.deserializeEmbeddedPointRow = deserializeEmbeddedPointRow;
  G.profileFromEmbeddedRows = profileFromEmbeddedRows;
  G.loadGpxTrack = loadGpxTrack;
  G.loadRouteProfile = loadRouteProfile;
  G.serializeEmbeddedPoints = serializeEmbeddedPoints;
})();
