/**
 * GoëloRides — alertes « nouvelles / mises à jour » (localStorage) + kit texte Instagram (manuel).
 * Aucune publication automatique ; pas de push.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "goelo_routes_fingerprint_v1";

  function readStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { v: 1, byId: {} };
      var p = JSON.parse(raw);
      if (!p || typeof p !== "object" || !p.byId || typeof p.byId !== "object") return { v: 1, byId: {} };
      return { v: 1, byId: p.byId };
    } catch (e) {
      void e;
      return { v: 1, byId: {} };
    }
  }

  function writeStore(byId) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, byId: byId }));
    } catch (e) {
      void e;
    }
  }

  function goeloRideRouteSnapshot(route) {
    if (!route || route.id == null) return null;
    var depart = route.depart && typeof route.depart === "object" ? route.depart : {};
    var prof = route.profile && typeof route.profile === "object" ? route.profile : {};
    var km =
      typeof prof.totalKm === "number" && !Number.isNaN(prof.totalKm)
        ? Math.round(prof.totalKm * 10) / 10
        : null;
    return {
      id: String(route.id),
      track: String(route.track || "").trim(),
      name: String(route.name || "").trim(),
      dateLabel: String(depart.dateLabel || "").trim(),
      pace: String(route.pace || "").trim(),
      meetPlace: String(route.meetPlace || "").trim(),
      meetPlaceDetail: String(route.meetPlaceDetail || "").trim(),
      rideLeader: String(route.rideLeader || "").trim(),
      shortDesc: String(route.shortDesc || "")
        .trim()
        .slice(0, 280),
      sortieStatus: String(route.sortieStatus || "open").trim(),
      visibility: String(route.visibility || "public").trim(),
      maxParticipants:
        typeof route.maxParticipants === "number" && route.maxParticipants > 0
          ? route.maxParticipants
          : null,
      estimatedDurationHm: String(route.estimatedDurationHm || "").trim(),
      raceType: String(route.raceType || "").trim(),
      routeKind: String(route.routeKind || "").trim(),
      km: km
    };
  }

  function snapsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  var FIELD_LABELS = {
    track: "nom du parcours",
    name: "groupe",
    dateLabel: "date",
    pace: "allure",
    meetPlace: "lieu de départ",
    meetPlaceDetail: "précisions lieu",
    rideLeader: "capitaine",
    shortDesc: "description",
    sortieStatus: "statut des inscriptions",
    visibility: "visibilité",
    maxParticipants: "places max",
    estimatedDurationHm: "durée",
    raceType: "type de sortie",
    routeKind: "type de route",
    km: "distance (trace)"
  };

  function diffSnapshotsToSummaryFr(oldSnap, newSnap) {
    if (!oldSnap || !newSnap) return "informations mises à jour";
    var parts = [];
    Object.keys(FIELD_LABELS).forEach(function (k) {
      if (oldSnap[k] !== newSnap[k]) parts.push(FIELD_LABELS[k]);
    });
    if (!parts.length) return "informations mises à jour";
    if (parts.length <= 3) return parts.join(", ") + " modifié·e·s";
    return parts.slice(0, 3).join(", ") + " et autres changements";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function goeloRideUpdatesProcessList(routes) {
    var list = Array.isArray(routes) ? routes : [];
    var store = readStore();
    var prev = store.byId;
    var hadBaseline = Object.keys(prev).length > 0;
    var next = {};
    Object.keys(prev).forEach(function (k) {
      next[k] = prev[k];
    });
    var newRides = [];
    var updatedRides = [];
    var listIds = {};

    list.forEach(function (route) {
      var snap = goeloRideRouteSnapshot(route);
      if (!snap) return;
      var id = snap.id;
      listIds[id] = true;
      var before = prev[id];
      if (!before) {
        if (hadBaseline) newRides.push({ id: id, track: snap.track, dateLabel: snap.dateLabel });
      } else if (!snapsEqual(before, snap)) {
        updatedRides.push({
          id: id,
          track: snap.track,
          dateLabel: snap.dateLabel,
          summary: diffSnapshotsToSummaryFr(before, snap)
        });
      }
      next[id] = snap;
    });

    Object.keys(next).forEach(function (k) {
      if (!listIds[k]) delete next[k];
    });

    writeStore(next);

    return {
      hadBaseline: hadBaseline,
      newRides: newRides,
      updatedRides: updatedRides
    };
  }

  function goeloRideUpdatesMountBanner(mountEl, result) {
    var el = mountEl || document.getElementById("goelo-site-updates-banner");
    if (!el || !result) return;
    var nr = result.newRides || [];
    var ur = result.updatedRides || [];
    if (!nr.length && !ur.length) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var bits = [];
    if (nr.length) {
      bits.push(
        "<strong>" +
          nr.length +
          " nouvelle" +
          (nr.length > 1 ? "s" : "") +
          " sortie" +
          (nr.length > 1 ? "s" : "") +
          "</strong> : " +
          nr
            .map(function (x) {
              return escapeHtml(x.track) + (x.dateLabel ? " · " + escapeHtml(x.dateLabel) : "");
            })
            .join(" · ")
      );
    }
    if (ur.length) {
      bits.push(
        "<strong>" +
          ur.length +
          " sortie" +
          (ur.length > 1 ? "s" : "") +
          " mise" +
          (ur.length > 1 ? "s" : "") +
          " à jour</strong> — " +
          ur
            .map(function (x) {
              return (
                '<span class="goelo-site-updates-banner__item">' +
                escapeHtml(x.track) +
                " : " +
                escapeHtml(x.summary) +
                "</span>"
              );
            })
            .join(" ")
      );
    }
    el.innerHTML =
      '<div class="goelo-site-updates-banner" role="region" aria-label="Actualités sorties">' +
      '<div class="goelo-site-updates-banner__inner">' +
      '<p class="goelo-site-updates-banner__text">' +
      bits.join(" ") +
      "</p>" +
      '<div class="goelo-site-updates-banner__actions">' +
      '<a class="goelo-site-updates-banner__link" href="sorties.html">Voir les sorties</a>' +
      '<button type="button" class="goelo-site-updates-banner__close">Fermer</button>' +
      "</div></div></div>";
    var btn = el.querySelector(".goelo-site-updates-banner__close");
    if (btn)
      btn.addEventListener("click", function () {
        el.innerHTML = "";
        el.hidden = true;
      });
  }

  function mergeRouteFingerprint(route) {
    var snap = goeloRideRouteSnapshot(route);
    if (!snap) return;
    var store = readStore();
    var next = {};
    Object.keys(store.byId).forEach(function (k) {
      next[k] = store.byId[k];
    });
    next[snap.id] = snap;
    writeStore(next);
  }

  function goeloRideUpdatesApplySortieStrip(route) {
    var strip = document.getElementById("sortie-updated-strip");
    if (!strip || !route || route.id == null) return;
    var store = readStore();
    var sid = String(route.id);
    var prev = store.byId[sid];
    var snap = goeloRideRouteSnapshot(route);
    if (!snap) return;

    var hadBaseline = Object.keys(store.byId).length > 0;
    var msg = "";
    var show = false;
    if (!prev) {
      if (hadBaseline) {
        msg = "Nouvelle sortie sur le calendrier.";
        show = true;
      }
    } else if (!snapsEqual(prev, snap)) {
      msg = "Cette sortie a été mise à jour — " + diffSnapshotsToSummaryFr(prev, snap) + ".";
      show = true;
    }
    if (show) {
      strip.textContent = msg;
      strip.hidden = false;
    } else {
      strip.textContent = "";
      strip.hidden = true;
    }
    mergeRouteFingerprint(route);
  }

  function pickVisualIdea(route) {
    var rt = String((route && route.raceType) || "").toLowerCase();
    var color = (route && route.color) || "#3d8b8b";
    if (rt === "gravel") return "Fond texturé gravier + trace stylisée, tons terre et " + color + " — format 9:16.";
    if (rt === "vtt") return "Sentier et relief, silhouettes VTT, ambiance forêt — format 9:16.";
    if (rt === "famille") return "Famille et côte douce, couleurs ensoleillées, ton convivial — format 9:16.";
    return (
      "Grande ligne de côte, carte minimaliste, date et horaire très lisibles en story — accent " +
      color +
      " — 9:16."
    );
  }

  function buildInstagramStoryText(route, opts) {
    var o = opts || {};
    var title = String((route && route.track) || "GoëloRides").trim();
    var dep = route && route.depart && typeof route.depart === "object" ? route.depart : {};
    var dateLine = String(dep.dateLabel || "").trim() || "À venir";
    var meet =
      String((route && route.meetPlaceDetail) || "").trim() ||
      String((route && route.meetPlace) || "").trim();
    var changeLine = String(o.changeLine || "").trim();
    var origin = String(o.origin || window.location.origin || "").replace(/\/$/, "");
    var id = route && route.id != null ? String(route.id) : "";
    var url = id ? origin + "/sortie.html?id=" + encodeURIComponent(id) : origin + "/sorties.html";
    var wasEdit = !!o.wasEdit;
    var lines = [
      title,
      dateLine,
      meet ? "Départ : " + meet : "",
      wasEdit
        ? "Mise à jour — vérifie l’horaire et le lieu sur la fiche."
        : "Nouvelle sortie — inscriptions sur la fiche.",
      changeLine,
      "",
      "→ " + url,
      "",
      "#GoëloRides #SaintQuayPortrieux"
    ];
    return lines
      .filter(function (x) {
        return x != null && String(x).length > 0;
      })
      .join("\n");
  }

  function fallbackCopy(text, onOk, onErr) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand("copy")) {
        if (onOk) onOk();
      } else if (onErr) onErr();
    } catch (e) {
      void e;
      if (onErr) onErr();
    }
    document.body.removeChild(ta);
  }

  function copyTextToClipboard(text, onOk, onErr) {
    var t = String(text || "");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(onOk).catch(function () {
        fallbackCopy(t, onOk, onErr);
      });
    } else fallbackCopy(t, onOk, onErr);
  }

  window.goeloRideRouteSnapshot = goeloRideRouteSnapshot;
  window.goeloRideUpdatesProcessList = goeloRideUpdatesProcessList;
  window.goeloRideUpdatesMountBanner = goeloRideUpdatesMountBanner;
  window.goeloRideUpdatesApplySortieStrip = goeloRideUpdatesApplySortieStrip;
  window.goeloRideUpdatesBuildInstagramStoryText = buildInstagramStoryText;
  window.goeloRideUpdatesPickVisualIdea = pickVisualIdea;
  window.goeloRideUpdatesCopyToClipboard = copyTextToClipboard;
})();
