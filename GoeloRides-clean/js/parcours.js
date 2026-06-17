/**
 * GoëloRides — Page Détail Parcours / Sortie (parcours.html?id=…)
 *
 * - Données mock (MOCK_SORTIES) pour démontrer le fonctionnement complet
 *   avant raccordement à Supabase (le point d'entrée est isolé dans
 *   getSortieById(), à remplacer par un appel RPC `routes_list` + signups).
 * - Carte Leaflet : trace GPX, zoom +/- natif, bouton « Recentrer »,
 *   colorisation du tracé selon la pente (vert / bleu / orange / rouge).
 * - Participation : « Je participe ! » ↔ « J'annule », persistée en
 *   localStorage (goelo_parcours_join_v1), compteur de participants.
 * - Accordéons : un seul ouvert à la fois, animation max-height.
 */
(function () {
  "use strict";

  /* ════════════════════════════════════════════════════════════
     Données mock
     ════════════════════════════════════════════════════════════ */

  var MOCK_SORTIES = {
    falaises: {
      id: "falaises",
      type: "Route",
      group: "Groupe Blanc",
      pace: "15–18 km/h",
      title: "Route des Falaises",
      dateIso: "2026-07-08",
      time: "08:30",
      meetTime: "8h20",
      rollingStart: "08h30",
      captain: "Daniel",
      place: "Parking du Kasino, Saint-Quay-Portrieux",
      kmFallback: 42.4,
      dplusFallback: 480,
      duration: "Environ 2 h 30",
      gpx: "La Route des Falaises.gpx",
      cities: ["Saint-Quay-Portrieux", "Binic", "Étables-sur-Mer", "Plouha"],
      participants: [
        { name: "Daniel", captain: true },
        { name: "Alice" },
        { name: "Marc" },
        { name: "Sophie" },
        { name: "Thomas" }
      ]
    },
    brehec: {
      id: "brehec",
      type: "Route",
      group: "Groupe Vert",
      pace: "18–22 km/h",
      title: "Vers Bréhec",
      dateIso: "2026-07-21",
      time: "08:30",
      meetTime: "8h20",
      rollingStart: "08h30",
      captain: "Daniel",
      place: "Parking du Kasino, Saint-Quay-Portrieux",
      kmFallback: 61,
      dplusFallback: 700,
      duration: "Environ 3 h",
      gpx: "Bréhec.gpx",
      cities: ["Saint-Quay-Portrieux", "Plouha", "Bréhec", "Binic"],
      participants: [
        { name: "Daniel", captain: true },
        { name: "Claire" },
        { name: "Hugo" }
      ]
    },
    boucle: {
      id: "boucle",
      type: "Route",
      group: "Groupe Bleu",
      pace: "22–26 km/h",
      title: "La Grande Boucle du Goëlo",
      dateIso: "2026-07-14",
      time: "08:30",
      meetTime: "8h20",
      rollingStart: "08h30",
      captain: "Daniel",
      place: "Parking du Kasino, Saint-Quay-Portrieux",
      kmFallback: 85,
      dplusFallback: 950,
      duration: "Environ 3 h 30",
      gpx: "La Grande Boucle du Goëlo.gpx",
      cities: ["Saint-Quay-Portrieux", "Lantic", "Plélo", "Goudelin", "Pléguien", "Binic"],
      participants: [
        { name: "Daniel", captain: true },
        { name: "Léa" },
        { name: "Paul" },
        { name: "Nina" }
      ]
    }
  };

  /**
   * Point d'entrée des données.
   * Raccordement Supabase : remplacer par RPC `routes_list` (filtre id)
   * + `signup_list_all_names` pour les participants.
   */
  function getSortieById(id) {
    return MOCK_SORTIES[id] || MOCK_SORTIES.falaises;
  }

  /* ════════════════════════════════════════════════════════════
     Helpers
     ════════════════════════════════════════════════════════════ */

  var AVATAR_COLORS = ["#C8F135", "#7DD3FC", "#FCA5A5", "#FCD34D", "#C4B5FD", "#86EFAC"];

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initials(name) {
    return String(name || "")
      .split(/\s+/)
      .map(function (w) { return w.charAt(0); })
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function avatarColor(name, i) {
    return AVATAR_COLORS[(String(name).length + i) % AVATAR_COLORS.length];
  }

  function frenchDateLabel(dateIso, time) {
    var p = dateIso.split("-");
    var hhmm = time.split(":");
    var d = new Date(+p[0], +p[1] - 1, +p[2], +hhmm[0], +hhmm[1]);
    var label = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(d);
    label = label.charAt(0).toUpperCase() + label.slice(1);
    return label + " · " + hhmm[0] + "h" + hhmm[1];
  }

  function formatKm(km) {
    if (km == null) return "—";
    var v = Math.round(km * 10) / 10;
    return String(v).replace(".", ",") + " km";
  }

  /* ════════════════════════════════════════════════════════════
     Participation (mock persisté en localStorage)
     ════════════════════════════════════════════════════════════ */

  var JOIN_KEY = "goelo_parcours_join_v1";

  function loadJoins() {
    try {
      var o = JSON.parse(localStorage.getItem(JOIN_KEY) || "{}");
      return o && typeof o === "object" ? o : {};
    } catch (err) {
      void err;
      return {};
    }
  }

  /**
   * Sauvegarde l'inscription.
   * Raccordement Supabase : appeler ici RPC `signup_register` /
   * `signup_unregister` puis rafraîchir la liste des participants.
   */
  function saveJoin(sortieId, joined) {
    var o = loadJoins();
    if (joined) o[sortieId] = true;
    else delete o[sortieId];
    try {
      localStorage.setItem(JOIN_KEY, JSON.stringify(o));
    } catch (err) {
      void err;
    }
  }

  function isJoined(sortieId) {
    return loadJoins()[sortieId] === true;
  }

  /* ════════════════════════════════════════════════════════════
     Rendu hero + participants
     ════════════════════════════════════════════════════════════ */

  var sortie = null;

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderHero() {
    document.title = sortie.title + " · Goëlo Rides";
    setText("pd-type", sortie.type);
    setText("pd-group", sortie.group + " · " + sortie.pace);
    setText("pd-title", sortie.title);
    setText("pd-date", frenchDateLabel(sortie.dateIso, sortie.time));

    var cap = document.getElementById("pd-captain");
    if (cap) {
      cap.innerHTML =
        'Capitaine · Team Rider : <strong>' + escapeHtml(sortie.captain) + "</strong>";
    }

    setText("pd-km", formatKm(sortie.kmFallback));
    setText("pd-dplus", sortie.dplusFallback + " m D+");
    setText("pd-duration", sortie.duration);
    setText("pd-meet", sortie.meetTime);
    setText("pd-start", sortie.rollingStart);
    setText("pd-place", sortie.place);

    var citiesEl = document.getElementById("pd-cities");
    if (citiesEl) {
      citiesEl.innerHTML = sortie.cities
        .map(function (c) { return "<li>" + escapeHtml(c) + "</li>"; })
        .join("");
    }

    var gpxBtn = document.getElementById("pd-gpx-btn");
    if (gpxBtn) {
      gpxBtn.href = encodeURI(sortie.gpx);
      gpxBtn.setAttribute("download", sortie.gpx);
    }
  }

  function allParticipants() {
    var list = sortie.participants.slice();
    if (isJoined(sortie.id)) list.push({ name: "Toi", you: true });
    return list;
  }

  function renderJoin() {
    var btn = document.getElementById("pd-join-btn");
    var count = document.getElementById("pd-join-count");
    var joined = isJoined(sortie.id);
    var n = allParticipants().length;

    if (btn) {
      btn.textContent = joined ? "J'annule" : "Je participe !";
      btn.classList.toggle("is-registered", joined);
    }
    if (count) {
      count.innerHTML = "<strong>" + n + "</strong> participant" + (n > 1 ? "s" : "");
    }
  }

  function renderParticipants() {
    var host = document.getElementById("pd-participants");
    var countEl = document.getElementById("pd-participants-count");
    if (!host) return;
    var list = allParticipants();

    host.innerHTML = list
      .map(function (p, i) {
        return (
          "<li>" +
          '<span class="so-avatar" style="background:' + avatarColor(p.name, i) + '">' +
          escapeHtml(initials(p.name)) +
          "</span>" +
          '<span class="pd-participant__name">' + escapeHtml(p.name) + "</span>" +
          (p.captain ? '<span class="pd-participant__role">Capitaine</span>' : "") +
          (p.you ? '<span class="pd-participant__role">Toi</span>' : "") +
          "</li>"
        );
      })
      .join("");

    if (countEl) countEl.textContent = "(" + list.length + ")";
  }

  function bindJoin() {
    var btn = document.getElementById("pd-join-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      saveJoin(sortie.id, !isJoined(sortie.id));
      renderJoin();
      renderParticipants();
    });
  }

  /* ════════════════════════════════════════════════════════════
     GPX + carte Leaflet + colorisation pente
     ════════════════════════════════════════════════════════════ */

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

  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var p = Math.PI / 180;
    var a =
      Math.pow(Math.sin(((lat2 - lat1) * p) / 2), 2) +
      Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.pow(Math.sin(((lon2 - lon1) * p) / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function computeStats(points) {
    var dist = 0;
    var gain = 0;
    var lastEle = null;
    for (var i = 1; i < points.length; i++) {
      dist += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
      var e = points[i].ele;
      if (typeof e === "number") {
        if (lastEle != null && e > lastEle) gain += e - lastEle;
        lastEle = e;
      }
    }
    return { km: dist / 1000, dplus: Math.round(gain) };
  }

  /**
   * Couleur de pente.
   * Architecture prête même sans altitude : si les points n'ont pas
   * d'« ele », tout le tracé est rendu en « plat » (bleu).
   *   vert   : descente   (pente < -2 %)
   *   bleu   : plat       (-2 % … 2 %)
   *   orange : montée     (2 % … 6 %)
   *   rouge  : montée raide (> 6 %)
   */
  var SLOPE_COLORS = { down: "#22c55e", flat: "#3b82f6", up: "#f59e0b", steep: "#ef4444" };

  function slopeCategory(gradePct) {
    if (gradePct < -2) return "down";
    if (gradePct <= 2) return "flat";
    if (gradePct <= 6) return "up";
    return "steep";
  }

  /** Découpe la trace en segments contigus de même catégorie de pente. */
  function buildSlopeSegments(points) {
    var hasEle = points.some(function (p) { return typeof p.ele === "number"; });
    if (!hasEle) {
      return [{ cat: "flat", latlngs: points.map(function (p) { return [p.lat, p.lon]; }) }];
    }

    /* Pente lissée sur une fenêtre glissante (~150 m) pour éviter le bruit GPS */
    var WINDOW_M = 150;
    var segments = [];
    var cur = null;
    var accDist = 0;
    var winStart = 0;
    var dists = [0];
    for (var i = 1; i < points.length; i++) {
      accDist += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
      dists.push(accDist);
    }

    for (var j = 1; j < points.length; j++) {
      while (dists[j] - dists[winStart] > WINDOW_M && winStart < j - 1) winStart++;
      var run = dists[j] - dists[winStart];
      var e1 = points[winStart].ele;
      var e2 = points[j].ele;
      var grade = run > 10 && typeof e1 === "number" && typeof e2 === "number"
        ? ((e2 - e1) / run) * 100
        : 0;
      var cat = slopeCategory(grade);

      if (!cur || cur.cat !== cat) {
        var startPt = [points[j - 1].lat, points[j - 1].lon];
        cur = { cat: cat, latlngs: [startPt] };
        segments.push(cur);
      }
      cur.latlngs.push([points[j].lat, points[j].lon]);
    }
    return segments;
  }

  async function initMap() {
    var mapEl = document.getElementById("pd-map");
    if (!mapEl || typeof L === "undefined") return;

    var map = L.map(mapEl, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    map.setView([48.65, -2.84], 11);

    var points = [];
    try {
      var res = await fetch(encodeURI(sortie.gpx));
      if (res.ok) points = parseGpxPoints(await res.text());
    } catch (err) {
      console.warn("GPX introuvable", sortie.gpx, err);
    }

    if (points.length < 2) return;

    /* Stats réelles depuis la trace (remplacent le mock) */
    var st = computeStats(points);
    setText("pd-km", formatKm(st.km));
    if (st.dplus > 5) setText("pd-dplus", st.dplus + " m D+");

    /* Tracé colorisé selon la pente */
    var group = L.featureGroup();
    buildSlopeSegments(points).forEach(function (seg) {
      L.polyline(seg.latlngs, {
        color: SLOPE_COLORS[seg.cat],
        weight: 4,
        opacity: 0.9,
        lineJoin: "round"
      }).addTo(group);
    });
    group.addTo(map);

    /* Marqueurs départ / arrivée */
    L.circleMarker([points[0].lat, points[0].lon], {
      radius: 7, color: "#0D0D0D", weight: 2, fillColor: "#C8F135", fillOpacity: 1
    }).addTo(map).bindTooltip("Départ");
    var last = points[points.length - 1];
    L.circleMarker([last.lat, last.lon], {
      radius: 6, color: "#0D0D0D", weight: 2, fillColor: "#ef4444", fillOpacity: 1
    }).addTo(map).bindTooltip("Arrivée");

    function fit() {
      map.fitBounds(group.getBounds(), { padding: [28, 28] });
    }
    fit();

    var fitBtn = document.getElementById("pd-map-fit");
    if (fitBtn) fitBtn.addEventListener("click", fit);
  }

  /* ════════════════════════════════════════════════════════════
     Accordéons (un seul ouvert, animation max-height)
     ════════════════════════════════════════════════════════════ */

  function bindAccordions() {
    var items = Array.prototype.slice.call(document.querySelectorAll(".pd-acc__item"));

    function close(item) {
      item.classList.remove("is-open");
      item.querySelector(".pd-acc__head").setAttribute("aria-expanded", "false");
      item.querySelector(".pd-acc__panel").style.maxHeight = "0";
    }

    function open(item) {
      item.classList.add("is-open");
      item.querySelector(".pd-acc__head").setAttribute("aria-expanded", "true");
      var panel = item.querySelector(".pd-acc__panel");
      panel.style.maxHeight = panel.scrollHeight + "px";
    }

    items.forEach(function (item) {
      item.querySelector(".pd-acc__head").addEventListener("click", function () {
        var isOpen = item.classList.contains("is-open");
        items.forEach(close);
        if (!isOpen) open(item);
      });
    });

    /* Recalcule la hauteur de l'accordéon ouvert au redimensionnement */
    window.addEventListener("resize", function () {
      items.forEach(function (item) {
        if (item.classList.contains("is-open")) {
          var panel = item.querySelector(".pd-acc__panel");
          panel.style.maxHeight = panel.scrollHeight + "px";
        }
      });
    });
  }

  /* ════════════════════════════════════════════════════════════
     Init
     ════════════════════════════════════════════════════════════ */

  document.addEventListener("DOMContentLoaded", function () {
    var id = new URLSearchParams(window.location.search).get("id") || "falaises";
    sortie = getSortieById(id);

    renderHero();
    renderJoin();
    renderParticipants();
    bindJoin();
    bindAccordions();
    initMap();
  });
})();
