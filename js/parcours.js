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

  let sortie = null;
  let loadError = null;


  /* ════════════════════════════════════════════════════════════
     Helpers
     ════════════════════════════════════════════════════════════ */

  var AVATAR_COLORS = ["#C8F135", "#7DD3FC", "#FCA5A5", "#FCD34D", "#C4B5FD", "#86EFAC"];

  function setLoading(isLoading) {
    const el = document.getElementById("loading");
    if (!el) return;

    el.style.display = isLoading ? "block" : "none";
  }

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
  if (!dateIso || !time) return "Date inconnue";

  var p = dateIso.split("-");
  var hhmm = time.split(":");

  var d = new Date(+p[0], +p[1] - 1, +p[2], +hhmm[0], +hhmm[1]);

  var label = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(d);

  return (
    label.charAt(0).toUpperCase() + label.slice(1) +
    " · " + hhmm[0] + "h" + hhmm[1]
  );
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


  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderHero() {
    document.title = sortie.title + " · Goëlo Rides";
    setText("pd-type", sortie.type);
    setText("pd-group", sortie.group + " · " + sortie.pace);
    setText("pd-title", sortie.title);
    setText(
      "pd-date",
      sortie.dateIso && sortie.time
        ? frenchDateLabel(sortie.dateIso, sortie.time)
        : "Date à venir"
    );

    var cap = document.getElementById("pd-captain");
    if (cap) {
      cap.innerHTML =
        'Capitaine · Team Rider : <strong>' + escapeHtml(sortie.captain) + "</strong>";
    }

    setText("pd-km", (sortie.kmFallback ?? 0) + " km");
    setText("pd-dplus", (sortie.dplusFallback ?? 0) + " m D+");
    setText("pd-duration", sortie.duration);
    setText("pd-meet", sortie.meetTime);
    setText("pd-start", sortie.rollingStart);
    setText("pd-place", sortie.place);

    var cities = Array.isArray(sortie.cities)
      ? sortie.cities
      : JSON.parse(sortie.cities || "[]");

    var gpxBtn = document.getElementById("pd-gpx-btn");
    if (gpxBtn) {
      gpxBtn.href = encodeURI(sortie.gpx);
      gpxBtn.setAttribute("download", sortie.gpx);
    }
  }

  function allParticipants(participants) {
    const list = Array.isArray(participants) ? participants : [];
    return list.slice();
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
  if (!sortie) return;

  const mapEl = document.getElementById("pd-map");
  if (!mapEl || typeof L === "undefined") return;

  let map = L.map(mapEl, { scrollWheelZoom: false });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  map.setView([48.65, -2.84], 11);

  let points = [];

  try {
    if (!sortie.gpx) {
      console.warn("GPX manquant pour la sortie");
    } else {
      const res = await fetch(encodeURI(sortie.gpx));

      if (res.ok) {
        const gpxText = await res.text();
        points = parseGpxPoints(gpxText) || [];
      } else {
        console.warn("GPX introuvable :", sortie.gpx);
      }
    }
  } catch (err) {
    console.warn("Erreur GPX", sortie.gpx, err);
  }

  if (!Array.isArray(points) || points.length < 2) return;

  /* Stats réelles */
  const st = computeStats(points);

  setText("pd-km", formatKm(st.km));

  if (st.dplus && st.dplus > 5) {
    setText("pd-dplus", st.dplus + " m D+");
  }

  /* Tracé colorisé */
  const group = L.featureGroup();

  if (typeof buildSlopeSegments === "function" && typeof SLOPE_COLORS !== "undefined") {
    buildSlopeSegments(points).forEach(seg => {
      if (!seg?.latlngs) return;

      L.polyline(seg.latlngs, {
        color: SLOPE_COLORS[seg.cat] || "#666",
        weight: 4,
        opacity: 0.9,
        lineJoin: "round"
      }).addTo(group);
    });
  }

  group.addTo(map);

  /* Départ */
  if (points[0]) {
    L.circleMarker([points[0].lat, points[0].lon], {
      radius: 7,
      color: "#0D0D0D",
      weight: 2,
      fillColor: "#C8F135",
      fillOpacity: 1
    })
      .addTo(map)
      .bindTooltip("Départ");
  }

  /* Arrivée */
  const last = points[points.length - 1];

  if (last) {
    L.circleMarker([last.lat, last.lon], {
      radius: 6,
      color: "#0D0D0D",
      weight: 2,
      fillColor: "#ef4444",
      fillOpacity: 1
    })
      .addTo(map)
      .bindTooltip("Arrivée");
  }

  /* Fit map */
  const fit = () => {
    if (group.getBounds && group.getBounds().isValid()) {
      map.fitBounds(group.getBounds(), { padding: [28, 28] });
    }
  };

  fit();

  const fitBtn = document.getElementById("pd-map-fit");
  if (fitBtn) {
    fitBtn.addEventListener("click", fit);
  }
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

function mapRouteToSortie(route) {
  const fc = route.front_config || {};

  return {
    id: route.id,
    title: route.track_name,
    type: route.route_kind,
    group: route.group_label,
    pace: route.pace_label,

    dateIso: fc.rideDateIso,
    time: fc.rideTime,

    captain: fc.rideLeader,

    kmFallback: fc.stats?.totalKm,
    dplusFallback: fc.stats?.elevGainM,

    duration: fc.estimated_duration_hm,
    meetTime: fc.rideTime,

    place: fc.meetPlace,

    cities: fc.embeddedPoints || [],

    gpx: "gpx/" + fc.file
  };
}

function renderError(message) {
  console.error(message);

  const el = document.getElementById("error");
  if (el) el.textContent = message;
}

function renderAll() {
  renderHero();
  renderJoin();
  renderParticipants();
  bindJoin();
  bindAccordions();
}

  /* ════════════════════════════════════════════════════════════
     Init
     ════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async function () {
  const id = new URLSearchParams(window.location.search).get("id");

  if (!id) {
    loadError = "ID manquant dans l’URL";
    console.error(loadError);
    return renderError();
  }

  try {
    setLoading(true);
    const { data, error } = await supabase
      .from("routes")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!data) {
      throw new Error("Aucune sortie trouvée");
    }

    sortie = mapRouteToSortie(data);

    renderAll();

    console.log("SORTIE avant initMap=", sortie);
    initMap();
   

  } catch (err) {
    console.error(err);
    loadError = err.message;
    renderError();
  } finally {
    setLoading(false);
  }
});

})(); 
