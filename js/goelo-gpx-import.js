/** Analyse locale d’un GPX, avant son envoi dans la bibliothèque. */
(function (global) {
  'use strict';
  var MAX_FILE_SIZE = 10 * 1024 * 1024;
  var MAX_POINTS = 100000;

  function distance(a, b) {
    var radians = Math.PI / 180;
    var lat = (b[1] - a[1]) * radians;
    var lon = (b[0] - a[0]) * radians;
    var h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(lon / 2) ** 2;
    return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }

  function analyzeSegments(input) {
    var segments = input.filter(function (segment) { return segment.length >= 2; });
    if (!segments.length) throw new Error('Ce GPX ne contient pas de tracé exploitable : il faut au moins deux points.');
    var meters = 0;
    var gain = 0;
    var completeElevation = true;
    var count = 0;
    var coordinates = segments.map(function (segment) {
      var anchor = null;
      return segment.map(function (point, index) {
        if (++count > MAX_POINTS) throw new Error('Ce GPX est trop détaillé. Exporte une version simplifiée du parcours.');
        if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) {
          throw new Error('Certains points du GPX ont des coordonnées invalides.');
        }
        if (index) meters += distance(segment[index - 1], point);
        var elevation = Number.isFinite(point[2]) ? point[2] : null;
        if (elevation == null) { completeElevation = false; anchor = null; }
        else if (anchor == null) anchor = elevation;
        else if (elevation - anchor >= 3) { gain += elevation - anchor; anchor = elevation; }
        else if (elevation - anchor <= -3) anchor = elevation;
        return elevation == null ? [point[0], point[1]] : [point[0], point[1], elevation];
      });
    });
    if (!(meters > 0)) throw new Error('La trace ne contient pas de parcours mesurable.');
    return {
      distanceKm: Math.round(meters / 1000 * 10) / 10,
      elevationGain: completeElevation ? Math.round(gain) : null,
      pointCount: count,
      segmentCount: coordinates.length,
      geometry: coordinates.length === 1 ? { type: 'LineString', coordinates: coordinates[0] } : { type: 'MultiLineString', coordinates: coordinates }
    };
  }

  function parse(text, filename) {
    if (!text || text.length > MAX_FILE_SIZE) throw new Error('Le fichier est vide ou dépasse 10 Mo.');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Ce format de GPX n’est pas pris en charge. Réexporte le parcours depuis ton application vélo.');
    var xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.getElementsByTagNameNS('*', 'parsererror').length || !xml.documentElement || xml.documentElement.localName !== 'gpx') {
      throw new Error('Ce fichier n’est pas un GPX valide.');
    }
    var segments = [];
    function points(parent, name) {
      return Array.from(parent.getElementsByTagNameNS('*', name)).map(function (node) {
        var lat = node.getAttribute('lat');
        var lon = node.getAttribute('lon');
        var ele = node.getElementsByTagNameNS('*', 'ele')[0];
        return [lon && lon.trim() ? Number(lon) : NaN, lat && lat.trim() ? Number(lat) : NaN,
          ele && ele.textContent.trim() ? Number(ele.textContent.trim()) : null];
      });
    }
    Array.from(xml.getElementsByTagNameNS('*', 'trk')).forEach(function (track) {
      var parts = Array.from(track.getElementsByTagNameNS('*', 'trkseg'));
      (parts.length ? parts : [track]).forEach(function (part) { segments.push(points(part, 'trkpt')); });
    });
    if (!segments.some(function (segment) { return segment.length >= 2; })) {
      Array.from(xml.getElementsByTagNameNS('*', 'rte')).forEach(function (route) { segments.push(points(route, 'rtept')); });
    }
    var result = analyzeSegments(segments);
    result.suggestedTitle = String(filename || 'Nouveau parcours').replace(/\.gpx$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 200) || 'Nouveau parcours';
    return result;
  }

  async function readFile(file) {
    if (!file || !/\.gpx$/i.test(file.name)) throw new Error('Choisis un fichier au format .gpx.');
    if (!file.size || file.size > MAX_FILE_SIZE) throw new Error('Le fichier est vide ou dépasse 10 Mo.');
    var text;
    if (typeof file.text === 'function') text = await file.text();
    else text = await new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Impossible de lire ce fichier. Réessaie depuis Fichiers.')); };
      reader.readAsText(file);
    });
    return parse(text, file.name);
  }

  function svgPreview(geometry) {
    var segments = geometry.type === 'MultiLineString' ? geometry.coordinates : [geometry.coordinates];
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, total = 0;
    segments.forEach(function (segment) { segment.forEach(function (p) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); total++;
    }); });
    var ratio = Math.max(0.01, Math.cos((maxY + minY) / 2 * Math.PI / 180));
    var scale = Math.min(360 / ((maxX - minX) * ratio || 0.00001), 180 / (maxY - minY || 0.00001));
    var left = (400 - (maxX - minX) * ratio * scale) / 2;
    var top = (220 - (maxY - minY) * scale) / 2;
    var stride = Math.max(1, Math.ceil(total / 1500));
    return '<svg viewBox="0 0 400 220" aria-hidden="true">' + segments.map(function (segment) {
      var sampled = segment.filter(function (_, index) { return index === 0 || index === segment.length - 1 || index % stride === 0; });
      return '<polyline fill="none" stroke="#c8f135" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="' + sampled.map(function (p) {
        return (left + (p[0] - minX) * ratio * scale).toFixed(2) + ',' + (top + (maxY - p[1]) * scale).toFixed(2);
      }).join(' ') + '"/>';
    }).join('') + '</svg>';
  }

  global.GoeloGpxImport = { MAX_FILE_SIZE: MAX_FILE_SIZE, parse: parse, readFile: readFile, analyzeSegments: analyzeSegments, svgPreview: svgPreview };
})(window);
