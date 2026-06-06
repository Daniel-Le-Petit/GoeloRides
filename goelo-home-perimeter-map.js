/**
 * Carte indicative : ~90 km autour du Kasino (Saint-Quay-Portrieux), 4 enveloppes GPX
 * (blanc / vert / bleu / rouge), repères villes. Plusieurs blocs possibles via [data-goelo-perimeter-map].
 */
(function () {
  "use strict";

  var mapNodes = document.querySelectorAll("[data-goelo-perimeter-map]");
  if (!mapNodes.length || typeof L === "undefined") return;

  var LEVELS = [
    { file: "rouge.gpx", color: "#ef4444", fill: "#ef4444" },
    { file: "bleu.gpx", color: "#3b82f6", fill: "#3b82f6" },
    { file: "vert.gpx", color: "#22c55e", fill: "#22c55e" },
    { file: "blanc.gpx", color: "#cbd5e1", fill: "#e2e8f0" }
  ];

  var KASINO = [48.65185, -2.83235];
  var RADIUS_90_KM = 90000;

  var TOWNS = [
    { name: "Binic-Étables", lat: 48.628, lon: -2.823 },
    { name: "Plérin", lat: 48.534, lon: -2.768 },
    { name: "Plouha", lat: 48.675, lon: -2.918 },
    { name: "Langueux", lat: 48.495, lon: -2.718 },
    { name: "Paimpol", lat: 48.778, lon: -3.046 },
    { name: "Saint-Brieuc", lat: 48.514, lon: -2.765 }
  ];

  /** Une seule série de fetch GPX pour tous les widgets de la page. */
  var gpxCache = null;
  function loadGpxTexts() {
    if (gpxCache) return gpxCache;
    gpxCache = Promise.all(
      LEVELS.map(function (lv) {
        return fetch(lv.file, { credentials: "same-origin" }).then(function (r) {
          if (!r.ok) throw new Error(lv.file);
          return r.text();
        });
      })
    ).catch(function (e) {
      gpxCache = null;
      throw e;
    });
    return gpxCache;
  }

  function parseGpxTrack(xml) {
    var doc = new DOMParser().parseFromString(xml, "application/xml");
    var err = doc.querySelector("parsererror");
    if (err) return [];
    var nodes = doc.querySelectorAll("trkpt");
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var lat = parseFloat(nodes[i].getAttribute("lat"));
      var lon = parseFloat(nodes[i].getAttribute("lon"));
      if (!isNaN(lat) && !isNaN(lon)) out.push([lat, lon]);
    }
    return out;
  }

  function buildMapInEl(mapEl) {
    if (mapEl.getAttribute("data-map-built") === "1") return;
    mapEl.setAttribute("data-map-built", "1");

    var onLightPanel = !!(mapEl.closest && mapEl.closest(".groupes-perimeter-section"));
    var ringColor = onLightPanel ? "rgba(21, 101, 168, 0.5)" : "rgba(255, 255, 255, 0.42)";

    loadGpxTexts()
      .then(function (texts) {
        var layers = [];
        var polyBounds = L.latLngBounds([]);
        for (var i = 0; i < texts.length; i++) {
          var latlngs = parseGpxTrack(texts[i]);
          if (latlngs.length < 3) continue;
          var poly = L.polygon(latlngs, {
            color: LEVELS[i].color,
            weight: 2,
            opacity: 0.92,
            fillColor: LEVELS[i].fill,
            fillOpacity: 0.14,
            lineJoin: "round"
          });
          layers.push(poly);
          for (var t = 0; t < latlngs.length; t++) {
            polyBounds.extend(latlngs[t]);
          }
        }

        if (!layers.length) {
          throw new Error("no layers");
        }

        var map = L.map(mapEl, {
          scrollWheelZoom: false,
          attributionControl: true,
          zoomControl: true
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        var ring90 = L.circle(KASINO, {
          radius: RADIUS_90_KM,
          fill: false,
          color: ringColor,
          weight: 1.5,
          dashArray: "7 11",
          interactive: false
        });
        ring90.addTo(map);
        var bounds90 = ring90.getBounds();

        for (var j = 0; j < layers.length; j++) {
          layers[j].addTo(map);
        }

        for (var k = 0; k < TOWNS.length; k++) {
          var tw = TOWNS[k];
          L.circleMarker([tw.lat, tw.lon], {
            radius: 5,
            color: onLightPanel ? "rgba(21, 101, 168, 0.9)" : "rgba(255, 255, 255, 0.92)",
            weight: 2,
            fillColor: "#0f172a",
            fillOpacity: 0.9
          })
            .bindTooltip(tw.name, {
              direction: "top",
              className: "goelo-perimeter-town-tip",
              offset: [0, -4]
            })
            .addTo(map);
        }

        L.circleMarker(KASINO, {
          radius: 7,
          color: "#f9d71c",
          weight: 2,
          fillColor: "#14222d",
          fillOpacity: 0.95
        })
          .addTo(map)
          .bindTooltip(
            "Départ le plus souvent ici — le lieu exact est dans la description de la sortie.",
            { permanent: false, direction: "top" }
          );

        var fit = L.latLngBounds(polyBounds);
        fit.extend(bounds90);

        map.fitBounds(fit, { padding: [26, 26], maxZoom: 10 });

        function onResize() {
          try {
            map.invalidateSize();
          } catch (e) {
            void e;
          }
        }
        window.addEventListener("resize", onResize);
        setTimeout(onResize, 400);
      })
      .catch(function () {
        mapEl.setAttribute("data-map-error", "1");
        mapEl.innerHTML =
          '<p class="goelo-perimeter-map-fallback">Carte indisponible pour le moment — les tracés détaillés sont sur chaque fiche sortie.</p>';
      });
  }

  function whenVisible(mapEl) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              io.unobserve(entries[i].target);
              buildMapInEl(entries[i].target);
            }
          }
        },
        { root: null, rootMargin: "120px 0px", threshold: 0.01 }
      );
      io.observe(mapEl);
    } else {
      buildMapInEl(mapEl);
    }
  }

  for (var n = 0; n < mapNodes.length; n++) {
    whenVisible(mapNodes[n]);
  }
})();
