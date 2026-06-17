/**
 * GoëloRides — Gestion des sorties (admin Team Rider)
 *
 * - Accès réservé : JWT Supabase avec app_metadata.goelo_admin = true
 *   (session parcours.js ou session supabase-js de la modale Connexion).
 * - Assistant 7 étapes avec progression en %, formulaire 14 sections.
 * - Import GPX (drag & drop) : distance, D+, durée estimée (vitesse du
 *   groupe), carte Leaflet, profil altimétrique canvas.
 * - Flyer 1080×1350 généré en temps réel sur canvas depuis
 *   assets/goeloRidesHomePage.jpg + copie presse-papiers / téléchargement PNG.
 * - Textes Facebook / Instagram / Messenger générés automatiquement.
 * - Sauvegarde auto toutes les 30 s (localStorage), duplication,
 *   confirmation avant annulation, historique des modifications,
 *   participants mock + liste d'attente, aperçu mobile / desktop.
 *
 * Raccordement Supabase : les points d'entrée sont saveDraftRemote()
 * (RPC route_create / route_update) et notifyParticipants().
 */
(function () {
  "use strict";

  var SITE_URL = "goelorides.onrender.com";
  var FACEBOOK_PAGE_URL = "https://www.facebook.com/goelo.rides";
  var INSTAGRAM_PAGE_URL = "https://www.instagram.com/goelo.rides/";
  var FLYER_BG = "assets/goeloRidesHomePage.jpg";
  var DRAFT_KEY = "goelo_gestion_sortie_draft_v1";
  var AUTOSAVE_MS = 30000;

  var GROUPS = {
    blanc: { label: "Blanc", pace: "18–22 km/h", speed: 20, color: "#E5E7EB" },
    bleu:  { label: "Bleu",  pace: "22–25 km/h", speed: 23.5, color: "#3b82f6" },
    rouge: { label: "Rouge", pace: "25–30 km/h", speed: 27.5, color: "#ef4444" },
    noir:  { label: "Noir",  pace: "30+ km/h",   speed: 31, color: "#6b7280" }
  };

  var TYPE_LABELS = { route: "Route", gravel: "Gravel", vtt: "VTT" };

  var ETAT_LABELS = {
    brouillon: "Brouillon",
    publiee: "Publiée",
    complete: "Complète",
    annulee: "Annulée",
    reportee: "Reportée"
  };

  /* Anciennes sorties pour la duplication (mock) */
  var PAST_SORTIES = [
    {
      id: "falaises",
      titre: "Route des Falaises",
      type: "route",
      groupe: "blanc",
      date: "2026-07-08",
      heure: "08:30",
      adresse: "Parking du Kasino",
      ville: "Saint-Quay-Portrieux",
      cp: "22410",
      km: 42.4,
      dplus: 480
    },
    {
      id: "brehec",
      titre: "Vers Bréhec",
      type: "route",
      groupe: "bleu",
      date: "2026-07-21",
      heure: "08:30",
      adresse: "Parking du Kasino",
      ville: "Saint-Quay-Portrieux",
      cp: "22410",
      km: 61,
      dplus: 700
    },
    {
      id: "boucle",
      titre: "La Grande Boucle du Goëlo",
      type: "route",
      groupe: "rouge",
      date: "2026-07-14",
      heure: "08:30",
      adresse: "Parking du Kasino",
      ville: "Saint-Quay-Portrieux",
      cp: "22410",
      km: 85,
      dplus: 950
    }
  ];

  /* Participants mock (compteur, inscrits, liste d'attente auto) */
  var MOCK_PARTICIPANTS = [
    { name: "Daniel", captain: true, email: "daniel@example.org" },
    { name: "Alice", email: "alice@example.org" },
    { name: "Marc", email: "marc@example.org" },
    { name: "Sophie", email: "sophie@example.org" },
    { name: "Thomas", email: "thomas@example.org" },
    { name: "Claire", email: "claire@example.org" },
    { name: "Hugo", email: "hugo@example.org" }
  ];

  var AVATAR_COLORS = ["#C8F135", "#7DD3FC", "#FCA5A5", "#FCD34D", "#C4B5FD", "#86EFAC"];

  /* ════════════════════════════════════════════════════════════
     État du formulaire
     ════════════════════════════════════════════════════════════ */

  var state = {
    type: "route",
    groupe: "blanc",
    titre: "",
    date: "",
    heure: "08:30",
    adresse: "",
    ville: "",
    cp: "",
    rdv: "08:20",
    depart: "08:30",
    capitaine: "",
    descriptionHtml: "",
    niveau: "debutant",
    max: 15,
    illimite: false,
    meteo: false,
    materiel: ["casque"],
    etat: "brouillon",
    gpxName: "",
    km: null,
    dplus: null,
    dureeMin: null,
    socialDone: false
  };

  var gpxPoints = [];

  /* ════════════════════════════════════════════════════════════
     Accès Team Rider
     ════════════════════════════════════════════════════════════ */

  function decodeJwtPayload(t) {
    if (!t || typeof t !== "string") return null;
    var parts = t.split(".");
    if (parts.length < 2) return null;
    try {
      var b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      var pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
      return JSON.parse(atob(b64 + pad));
    } catch (err) {
      void err;
      return null;
    }
  }

  function tokenInfo(t) {
    var p = decodeJwtPayload(t);
    if (!p || typeof p !== "object") return null;
    if (typeof p.exp === "number" && p.exp * 1000 < Date.now()) return null;
    var am = p.app_metadata || {};
    var v = am.goelo_admin;
    var isAdmin = v === true || v === "true" || v === 1 || v === "1";
    if (!isAdmin) return null;
    var um = p.user_metadata || {};
    return {
      pseudo: (um.pseudo || um.name || "").trim() || (p.email || "").split("@")[0] || "Team Rider"
    };
  }

  function detectTeamRider() {
    try {
      var raw = sessionStorage.getItem("goelo_admin_auth_v1");
      if (raw) {
        var o = JSON.parse(raw);
        var info = o && o.access_token ? tokenInfo(o.access_token) : null;
        if (info) return info;
      }
    } catch (err) {
      void err;
    }
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf("sb-") !== 0 || k.indexOf("-auth-token") === -1) continue;
        var s = JSON.parse(localStorage.getItem(k));
        var tok = s && (s.access_token || (s.currentSession && s.currentSession.access_token));
        var info2 = tok ? tokenInfo(tok) : null;
        if (info2) return info2;
      }
    } catch (err) {
      void err;
    }
    return null;
  }

  /* ════════════════════════════════════════════════════════════
     Helpers
     ════════════════════════════════════════════════════════════ */

  function $(id) {
    return document.getElementById(id);
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

  function frDate(dateIso) {
    if (!dateIso) return "";
    var p = dateIso.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var label = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).format(d);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function frTime(t) {
    return t ? t.replace(":", "h") : "";
  }

  function fmtKm(km) {
    if (km == null) return "—";
    return String(Math.round(km * 10) / 10).replace(".", ",") + " km";
  }

  function fmtDplus(d) {
    return d == null ? "—" : Math.round(d) + " m D+";
  }

  function fmtDuree(min) {
    if (min == null) return "—";
    var h = Math.floor(min / 60);
    var m = Math.round(min % 60);
    return "Environ " + h + " h" + (m ? " " + (m < 10 ? "0" : "") + m : "");
  }

  function toast(msg) {
    var el = $("gs-toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 3500);
  }

  function addHistory(msg) {
    var host = $("gs-history");
    if (!host) return;
    var empty = host.querySelector(".gs-history__empty");
    if (empty) empty.remove();
    var li = document.createElement("li");
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    li.innerHTML = "<strong>" + hh + "</strong> — " + escapeHtml(msg);
    host.prepend(li);
  }

  /**
   * Notification automatique (modification / annulation).
   * Raccordement : webhook / Edge Function (voir supabase/SUPABASE.md) ou
   * OneSignal. Ici : trace dans l'historique + toast.
   */
  function notifyParticipants(message) {
    addHistory("Notification envoyée aux participants : " + message);
    toast("Notification participants : " + message);
  }

  /* ════════════════════════════════════════════════════════════
     Progression de l'assistant
     ════════════════════════════════════════════════════════════ */

  function stepStatus() {
    var infos = !!(state.type && state.groupe && state.titre.trim() && state.date && state.heure);
    var gpx = state.km != null;
    var orga = !!(state.adresse.trim() && state.ville.trim() && state.rdv && state.depart &&
      state.capitaine.trim() && (state.illimite || state.max > 0));
    var securite = !!(state.niveau && state.materiel.length);
    var publication = !!(state.descriptionHtml.replace(/<[^>]*>/g, "").trim() && state.etat !== "brouillon");
    var social = state.socialDone;
    var prev = infos && gpx && orga && securite && publication && social;
    return {
      infos: infos, gpx: gpx, orga: orga, securite: securite,
      publication: publication, social: social, validation: prev
    };
  }

  function renderWizard() {
    var st = stepStatus();
    var order = ["infos", "gpx", "orga", "securite", "publication", "social", "validation"];
    var done = 0;
    var currentSet = false;

    order.forEach(function (key) {
      var li = document.querySelector('.gs-step[data-step="' + key + '"]');
      if (!li) return;
      var dot = li.querySelector(".gs-step__dot");
      li.classList.remove("is-done", "is-current");
      if (st[key]) {
        li.classList.add("is-done");
        dot.textContent = "✓";
        done++;
      } else if (!currentSet) {
        li.classList.add("is-current");
        dot.textContent = "●";
        currentSet = true;
      } else {
        dot.textContent = "○";
      }
    });

    var pct = Math.round((done / order.length) * 100);
    $("gs-progress-pct").textContent = pct + "%";
    $("gs-progress-bar").style.width = pct + "%";
  }

  /* ════════════════════════════════════════════════════════════
     Lecture du formulaire → state
     ════════════════════════════════════════════════════════════ */

  function readForm() {
    state.titre = $("gs-titre").value;
    state.date = $("gs-date").value;
    state.heure = $("gs-heure").value;
    state.adresse = $("gs-adresse").value;
    state.ville = $("gs-ville").value;
    state.cp = $("gs-cp").value;
    state.rdv = $("gs-rdv").value;
    state.depart = $("gs-depart").value;
    state.capitaine = $("gs-capitaine").value;
    state.descriptionHtml = $("gs-description").innerHTML;
    state.max = parseInt($("gs-max").value, 10) || 0;
    state.illimite = $("gs-illimite").checked;
    state.meteo = $("gs-meteo").checked;
    state.etat = $("gs-etat").value;
    state.materiel = Array.prototype.slice
      .call(document.querySelectorAll("#gs-materiel input:checked"))
      .map(function (c) { return c.value; });
  }

  function writeForm() {
    $("gs-titre").value = state.titre;
    $("gs-date").value = state.date;
    $("gs-heure").value = state.heure;
    $("gs-adresse").value = state.adresse;
    $("gs-ville").value = state.ville;
    $("gs-cp").value = state.cp;
    $("gs-rdv").value = state.rdv;
    $("gs-depart").value = state.depart;
    $("gs-capitaine").value = state.capitaine;
    $("gs-description").innerHTML = state.descriptionHtml;
    $("gs-max").value = state.illimite ? "" : String(state.max || 15);
    $("gs-illimite").checked = state.illimite;
    $("gs-meteo").checked = state.meteo;
    $("gs-etat").value = state.etat;

    document.querySelectorAll(".gs-type[data-type]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-type") === state.type);
    });
    document.querySelectorAll(".gs-group[data-group]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-group") === state.groupe);
    });
    document.querySelectorAll(".gs-type[data-niveau]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-niveau") === state.niveau);
    });
    document.querySelectorAll("#gs-materiel input").forEach(function (c) {
      c.checked = state.materiel.indexOf(c.value) !== -1;
    });
  }

  /** Appelé à chaque changement : recalcul global + rendus dérivés. */
  function refresh() {
    readForm();
    renderWizard();
    renderPreview();
    renderSocialTexts();
    drawFlyer();
    renderParticipants();
    scheduleDirty();
  }

  /* ════════════════════════════════════════════════════════════
     Sauvegarde auto (30 s) + brouillon localStorage
     ════════════════════════════════════════════════════════════ */

  var dirty = false;

  function scheduleDirty() {
    dirty = true;
    var el = $("gs-autosave");
    if (el) {
      el.textContent = "Modifications non enregistrées…";
      el.classList.remove("is-saved");
    }
  }

  /**
   * Sauvegarde du brouillon.
   * Raccordement Supabase : appeler ici RPC `route_create` / `route_update`
   * avec le front_config construit depuis `state`.
   */
  function saveDraft(reason) {
    readForm();
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    } catch (err) {
      void err;
    }
    dirty = false;
    var el = $("gs-autosave");
    if (el) {
      var now = new Date();
      el.textContent =
        "Enregistré à " +
        String(now.getHours()).padStart(2, "0") + ":" +
        String(now.getMinutes()).padStart(2, "0") + ":" +
        String(now.getSeconds()).padStart(2, "0");
      el.classList.add("is-saved");
    }
    if (reason) addHistory(reason);
  }

  function restoreDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      var o = JSON.parse(raw);
      if (!o || typeof o !== "object") return false;
      Object.keys(state).forEach(function (k) {
        if (k in o) state[k] = o[k];
      });
      return true;
    } catch (err) {
      void err;
      return false;
    }
  }

  /* ════════════════════════════════════════════════════════════
     GPX : drag & drop, stats, carte, profil
     ════════════════════════════════════════════════════════════ */

  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var p = Math.PI / 180;
    var a =
      Math.pow(Math.sin(((lat2 - lat1) * p) / 2), 2) +
      Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.pow(Math.sin(((lon2 - lon1) * p) / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

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

  var miniMap = null;
  var miniLayer = null;

  function renderGpx() {
    if (gpxPoints.length < 2) return;

    var dist = 0;
    var gain = 0;
    var lastEle = null;
    gpxPoints.forEach(function (pt, i) {
      if (i > 0) dist += haversine(gpxPoints[i - 1].lat, gpxPoints[i - 1].lon, pt.lat, pt.lon);
      if (typeof pt.ele === "number") {
        if (lastEle != null && pt.ele > lastEle) gain += pt.ele - lastEle;
        lastEle = pt.ele;
      }
    });

    state.km = dist / 1000;
    state.dplus = Math.round(gain) > 5 ? Math.round(gain) : null;
    /* Durée estimée selon la vitesse moyenne du groupe + malus dénivelé */
    var speed = (GROUPS[state.groupe] || GROUPS.blanc).speed;
    state.dureeMin = Math.round((state.km / speed) * 60 + (state.dplus || 0) / 18);

    $("gs-gpx-km").textContent = fmtKm(state.km);
    $("gs-gpx-dplus").textContent = fmtDplus(state.dplus);
    $("gs-gpx-duree").textContent = fmtDuree(state.dureeMin);
    $("gs-gpx-result").hidden = false;

    /* Carte */
    if (typeof L !== "undefined") {
      if (!miniMap) {
        miniMap = L.map($("gs-map"), { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(miniMap);
      }
      if (miniLayer) miniLayer.remove();
      miniLayer = L.polyline(
        gpxPoints.map(function (p) { return [p.lat, p.lon]; }),
        { color: "#C8F135", weight: 4, opacity: 0.95 }
      ).addTo(miniMap);
      miniMap.invalidateSize();
      miniMap.fitBounds(miniLayer.getBounds(), { padding: [20, 20] });
    }

    drawProfile();
  }

  /** Profil altimétrique (canvas). Architecture OK sans altitude : message. */
  function drawProfile() {
    var canvas = $("gs-profil");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    canvas.width = canvas.clientWidth || 600;
    var W = canvas.width;
    var H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#242424";
    ctx.fillRect(0, 0, W, H);

    var eles = gpxPoints.filter(function (p) { return typeof p.ele === "number"; });
    if (eles.length < 2) {
      ctx.fillStyle = "#888888";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Pas de données d'altitude dans cette trace", W / 2, H / 2);
      return;
    }

    var min = Infinity;
    var max = -Infinity;
    eles.forEach(function (p) {
      if (p.ele < min) min = p.ele;
      if (p.ele > max) max = p.ele;
    });
    var span = Math.max(max - min, 10);

    ctx.beginPath();
    ctx.moveTo(0, H);
    eles.forEach(function (p, i) {
      var x = (i / (eles.length - 1)) * W;
      var y = H - 12 - ((p.ele - min) / span) * (H - 26);
      ctx.lineTo(x, y);
    });
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = "rgba(200, 241, 53, 0.22)";
    ctx.fill();

    ctx.beginPath();
    eles.forEach(function (p, i) {
      var x = (i / (eles.length - 1)) * W;
      var y = H - 12 - ((p.ele - min) / span) * (H - 26);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#C8F135";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#888888";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(Math.round(max) + " m", 6, 14);
    ctx.fillText(Math.round(min) + " m", 6, H - 4);
  }

  function bindGpx() {
    var zone = $("gs-dropzone");
    var input = $("gs-gpx-input");
    if (!zone || !input) return;

    function handleFile(file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        gpxPoints = parseGpxPoints(String(reader.result || ""));
        if (gpxPoints.length < 2) {
          toast("Fichier GPX illisible ou trace trop courte.");
          return;
        }
        state.gpxName = file.name;
        renderGpx();
        addHistory("Trace GPX importée : " + file.name);
        refresh();
      };
      reader.readAsText(file);
    }

    zone.addEventListener("click", function () { input.click(); });
    zone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", function () { handleFile(input.files[0]); });

    ["dragenter", "dragover"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        zone.classList.add("is-over");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        zone.classList.remove("is-over");
      });
    });
    zone.addEventListener("drop", function (e) {
      handleFile(e.dataTransfer.files[0]);
    });
  }

  /* ════════════════════════════════════════════════════════════
     Aperçu mobile / desktop
     ════════════════════════════════════════════════════════════ */

  function renderPreview() {
    var host = $("gs-preview-card");
    if (!host) return;
    var d = state.date ? state.date.split("-") : null;
    var dateBlock = d
      ? '<small>' + new Intl.DateTimeFormat("fr-FR", { weekday: "short" })
          .format(new Date(+d[0], +d[1] - 1, +d[2])).toUpperCase().replace(".", "") + "</small>" +
        "<strong>" + +d[2] + "</strong>" +
        "<small>" + new Intl.DateTimeFormat("fr-FR", { month: "short" })
          .format(new Date(+d[0], +d[1] - 1, +d[2])).toUpperCase().replace(".", "") + "</small>"
      : "<small>—</small><strong>?</strong><small></small>";

    var g = GROUPS[state.groupe] || GROUPS.blanc;
    var badge = state.etat === "annulee"
      ? '<span class="gs-preview__badge gs-preview__badge--annulee">Annulée</span>'
      : state.etat === "brouillon"
        ? '<span class="gs-preview__badge gs-preview__badge--brouillon">Brouillon</span>'
        : '<span class="gs-preview__badge">' + escapeHtml(ETAT_LABELS[state.etat] || "") + "</span>";

    host.innerHTML =
      '<div class="gs-preview__row">' +
      '<div class="gs-preview__date" style="border-left-color:' + g.color + '">' + dateBlock + "</div>" +
      '<div class="gs-preview__body">' +
      badge +
      "<h3>" + escapeHtml(state.titre || "Titre de la sortie") + "</h3>" +
      "<p>" + fmtKm(state.km) + " · " + fmtDplus(state.dplus) + " · " +
      escapeHtml(TYPE_LABELS[state.type]) + "</p>" +
      "<p>📍 " + escapeHtml(state.ville || "Ville") + " · 🕒 " + escapeHtml(frTime(state.depart)) + "</p>" +
      "</div></div>";
  }

  function bindPreviewToggle() {
    var mob = $("gs-preview-mobile-btn");
    var desk = $("gs-preview-desktop-btn");
    var box = $("gs-preview");
    if (!mob || !desk || !box) return;
    mob.addEventListener("click", function () {
      box.classList.add("gs-preview--mobile");
      box.classList.remove("gs-preview--desktop");
      mob.classList.add("is-active");
      desk.classList.remove("is-active");
    });
    desk.addEventListener("click", function () {
      box.classList.add("gs-preview--desktop");
      box.classList.remove("gs-preview--mobile");
      desk.classList.add("is-active");
      mob.classList.remove("is-active");
    });
  }

  /* ════════════════════════════════════════════════════════════
     Flyer 1080×1350 (canvas, temps réel)
     ════════════════════════════════════════════════════════════ */

  var flyerImg = null;
  var flyerImgReady = false;

  function loadFlyerBg() {
    flyerImg = new Image();
    flyerImg.onload = function () {
      flyerImgReady = true;
      drawFlyer();
    };
    flyerImg.onerror = function () {
      flyerImgReady = false;
      drawFlyer();
    };
    flyerImg.src = FLYER_BG;
  }

  function drawFlyer() {
    var canvas = $("gs-flyer");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var W = canvas.width;   /* 1080 */
    var H = canvas.height;  /* 1350 */

    /* Fond : image d'origine conservée, recadrée en « cover » */
    ctx.fillStyle = "#0D0D0D";
    ctx.fillRect(0, 0, W, H);
    if (flyerImgReady && flyerImg.naturalWidth) {
      var ir = flyerImg.naturalWidth / flyerImg.naturalHeight;
      var cr = W / H;
      var sw, sh, sx, sy;
      if (ir > cr) {
        sh = flyerImg.naturalHeight;
        sw = sh * cr;
        sx = (flyerImg.naturalWidth - sw) / 2;
        sy = 0;
      } else {
        sw = flyerImg.naturalWidth;
        sh = sw / cr;
        sx = 0;
        sy = (flyerImg.naturalHeight - sh) / 2;
      }
      ctx.drawImage(flyerImg, sx, sy, sw, sh, 0, 0, W, H);
    }

    /* Panneau dégradé à gauche pour la lisibilité */
    var grad = ctx.createLinearGradient(0, 0, W * 0.72, 0);
    grad.addColorStop(0, "rgba(13, 13, 13, 0.92)");
    grad.addColorStop(0.62, "rgba(13, 13, 13, 0.55)");
    grad.addColorStop(1, "rgba(13, 13, 13, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    var x = 64;
    var g = GROUPS[state.groupe] || GROUPS.blanc;

    /* Badge type */
    ctx.font = "800 40px 'Barlow Condensed', sans-serif";
    var typeTxt = (TYPE_LABELS[state.type] || "Route").toUpperCase();
    var bw = ctx.measureText(typeTxt).width + 56;
    ctx.fillStyle = "#C8F135";
    roundRect(ctx, x, 90, bw, 70, 35);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(typeTxt, x + 28, 90 + 37);

    /* Titre */
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "alphabetic";
    var title = state.titre.trim() || "Ta prochaine sortie";
    var size = 96;
    ctx.font = "800 " + size + "px 'Barlow Condensed', sans-serif";
    while (ctx.measureText(title).width > W * 0.66 && size > 48) {
      size -= 4;
      ctx.font = "800 " + size + "px 'Barlow Condensed', sans-serif";
    }
    wrapText(ctx, title, x, 300, W * 0.66, size * 1.04);

    /* Date + heure */
    ctx.fillStyle = "#C8F135";
    ctx.font = "700 52px 'Barlow Condensed', sans-serif";
    var dateLine = state.date ? frDate(state.date) : "Date à venir";
    ctx.fillText(dateLine, x, 520);
    ctx.fillText(frTime(state.depart) ? "Départ " + frTime(state.depart) : "", x, 585);

    /* Stats */
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 64px 'Barlow Condensed', sans-serif";
    var statsLine =
      (state.km != null ? fmtKm(state.km) : "— km") +
      "   ·   " +
      (state.dplus != null ? state.dplus + " m D+" : "— m D+");
    ctx.fillText(statsLine, x, 700);

    /* Groupe */
    ctx.fillStyle = g.color;
    ctx.font = "800 48px 'Barlow Condensed', sans-serif";
    ctx.fillText("GROUPE " + g.label.toUpperCase() + " · " + g.pace, x, 780);

    /* Point de départ */
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.font = "500 38px Inter, sans-serif";
    var dep = [state.adresse.trim(), state.ville.trim()].filter(Boolean).join(", ") ||
      "Parking du Kasino, Saint-Quay-Portrieux";
    wrapText(ctx, "📍 " + dep, x, 860, W * 0.62, 50);

    /* Bandeau bas : logo + site */
    ctx.fillStyle = "rgba(13, 13, 13, 0.82)";
    ctx.fillRect(0, H - 150, W, 150);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 64px 'Barlow Condensed', sans-serif";
    ctx.fillText("GOËLO", x, H - 58);
    var w1 = ctx.measureText("GOËLO").width;
    ctx.fillStyle = "#C8F135";
    ctx.fillText("RIDES", x + w1 + 12, H - 58);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "500 34px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(SITE_URL, W - 56, H - 60);
    ctx.textAlign = "left";
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(ctx, text, x, y, maxW, lineH) {
    var words = String(text).split(/\s+/);
    var line = "";
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y);
        y += lineH;
        line = w;
      } else {
        line = test;
      }
    });
    if (line) ctx.fillText(line, x, y);
  }

  function flyerBlob() {
    return new Promise(function (resolve) {
      $("gs-flyer").toBlob(resolve, "image/png");
    });
  }

  function bindFlyerActions() {
    $("gs-copy-flyer").addEventListener("click", async function () {
      try {
        var blob = await flyerBlob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        state.socialDone = true;
        toast("Flyer copié dans le presse-papiers ✓");
        addHistory("Flyer copié dans le presse-papiers.");
        renderWizard();
      } catch (err) {
        console.warn(err);
        toast("Copie impossible dans ce navigateur — utilise « Télécharger ».");
      }
    });

    $("gs-download-flyer").addEventListener("click", async function () {
      var blob = await flyerBlob();
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "goelorides-flyer-" + (state.titre.trim() || "sortie").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-") + ".png";
      a.click();
      URL.revokeObjectURL(a.href);
      state.socialDone = true;
      toast("Flyer téléchargé ✓");
      addHistory("Flyer téléchargé (PNG 1080×1350).");
      renderWizard();
    });
  }

  /* ════════════════════════════════════════════════════════════
     Textes réseaux sociaux (génération automatique)
     ════════════════════════════════════════════════════════════ */

  function socialText(kind) {
    var lines = [
      "🚴 Nouvelle sortie GoëloRides",
      "",
      state.titre.trim() || "Sortie à venir",
      "",
      "📅 " + (state.date ? frDate(state.date) + " · " + frTime(state.depart) : "Date à venir"),
      "📍 " + ([state.adresse.trim(), state.ville.trim()].filter(Boolean).join(", ") || "Départ à venir"),
      "📏 " + (state.km != null ? fmtKm(state.km) : "Distance à venir"),
      "⛰️ " + (state.dplus != null ? state.dplus + " m D+" : "Dénivelé à venir"),
      "",
      "Inscription sur :",
      SITE_URL
    ];
    if (kind === "instagram") {
      lines.push("", "#goelorides #velo #cyclisme #bretagne #cotesdarmor #" + (state.type || "route"));
    }
    if (kind === "messenger") {
      lines.unshift("Salut l'équipe !");
    }
    return lines.join("\n");
  }

  function renderSocialTexts() {
    $("gs-fb-text").value = socialText("facebook");
    $("gs-ig-text").value = socialText("instagram");
    $("gs-msg-text").value = socialText("messenger");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      void err;
      return false;
    }
  }

  function bindSocialActions() {
    $("gs-fb-post").addEventListener("click", async function () {
      await copyText($("gs-fb-text").value);
      window.open(FACEBOOK_PAGE_URL, "_blank", "noopener");
      state.socialDone = true;
      toast("Texte copié — colle-le dans ton post Facebook ✓");
      addHistory("Post Facebook préparé (texte copié).");
      renderWizard();
    });

    $("gs-ig-post").addEventListener("click", async function () {
      await copyText($("gs-ig-text").value);
      window.open(INSTAGRAM_PAGE_URL, "_blank", "noopener");
      state.socialDone = true;
      toast("Texte copié — colle-le dans ton post Instagram ✓");
      addHistory("Post Instagram préparé (texte copié).");
      renderWizard();
    });

    $("gs-msg-copy").addEventListener("click", async function () {
      var ok = await copyText($("gs-msg-text").value);
      state.socialDone = true;
      toast(ok ? "Message Messenger copié ✓" : "Copie impossible — sélectionne le texte.");
      addHistory("Message Messenger copié.");
      renderWizard();
    });
  }

  /* ════════════════════════════════════════════════════════════
     Participants + liste d'attente
     ════════════════════════════════════════════════════════════ */

  function renderParticipants() {
    var listEl = $("gs-participants-list");
    var waitEl = $("gs-waitlist");
    var waitTitle = $("gs-waitlist-title");
    var countEl = $("gs-participants-count");
    if (!listEl) return;

    var cap = state.illimite ? Infinity : Math.max(1, state.max || 15);
    var inscrits = MOCK_PARTICIPANTS.slice(0, Math.min(MOCK_PARTICIPANTS.length, cap));
    var attente = MOCK_PARTICIPANTS.slice(inscrits.length);

    function li(p, i) {
      return (
        "<li>" +
        '<span class="so-avatar" style="background:' +
        AVATAR_COLORS[(p.name.length + i) % AVATAR_COLORS.length] + '">' +
        escapeHtml(initials(p.name)) +
        "</span>" +
        escapeHtml(p.name) +
        (p.captain ? " · ⭐ Capitaine" : "") +
        "</li>"
      );
    }

    listEl.innerHTML = inscrits.map(li).join("");
    waitEl.innerHTML = attente.map(li).join("");
    waitTitle.hidden = !attente.length;
    countEl.textContent =
      "(" + inscrits.length + (state.illimite ? "" : " / " + cap) +
      (attente.length ? " · " + attente.length + " en attente" : "") + ")";
  }

  function bindMessageAll() {
    $("gs-message-all").addEventListener("click", function () {
      var emails = MOCK_PARTICIPANTS.map(function (p) { return p.email; }).join(",");
      var subject = encodeURIComponent("GoëloRides — " + (state.titre.trim() || "ta sortie"));
      var body = encodeURIComponent(socialText("messenger"));
      window.location.href = "mailto:?bcc=" + emails + "&subject=" + subject + "&body=" + body;
      addHistory("Message envoyé à tous les participants.");
    });
  }

  /* ════════════════════════════════════════════════════════════
     Actions principales
     ════════════════════════════════════════════════════════════ */

  function bindActions() {
    $("gs-save-draft").addEventListener("click", function () {
      saveDraft("Brouillon enregistré.");
      toast("Brouillon enregistré ✓");
    });

    $("gs-publish").addEventListener("click", function () {
      readForm();
      if (!state.titre.trim() || !state.date) {
        toast("Titre et date obligatoires pour publier.");
        return;
      }
      var wasModified = state.etat !== "brouillon";
      $("gs-etat").value = "publiee";
      refresh();
      saveDraft("Sortie publiée : " + state.titre);
      toast("Sortie publiée ✓");
      if (wasModified) notifyParticipants("la sortie « " + state.titre + " » a été modifiée.");
    });

    $("gs-duplicate").addEventListener("click", function () {
      readForm();
      state.titre = state.titre ? state.titre + " (copie)" : "";
      state.etat = "brouillon";
      state.date = "";
      writeForm();
      refresh();
      addHistory("Sortie dupliquée — pense à changer la date.");
      toast("Sortie dupliquée : choisis une nouvelle date.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    /* Confirmation avant annulation + notification automatique */
    $("gs-cancel-sortie").addEventListener("click", function () {
      readForm();
      var name = state.titre.trim() || "cette sortie";
      if (!window.confirm("Annuler « " + name + " » ?\n\nLes participants seront notifiés automatiquement.")) {
        return;
      }
      $("gs-etat").value = "annulee";
      refresh();
      saveDraft("Sortie annulée : " + name);
      notifyParticipants("la sortie « " + name + " » est annulée.");
      toast("Sortie annulée — participants notifiés.");
    });

    /* Duplication d'une ancienne sortie */
    var sel = $("gs-duplicate-select");
    PAST_SORTIES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.titre + " (" + s.date + ")";
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () {
      var src = PAST_SORTIES.find(function (s) { return s.id === sel.value; });
      if (!src) return;
      state.titre = src.titre + " (copie)";
      state.type = src.type;
      state.groupe = src.groupe;
      state.adresse = src.adresse;
      state.ville = src.ville;
      state.cp = src.cp;
      state.km = src.km;
      state.dplus = src.dplus;
      state.date = "";
      state.etat = "brouillon";
      writeForm();
      refresh();
      addHistory("Dupliqué depuis « " + src.titre + " ».");
      toast("Sortie pré-remplie depuis « " + src.titre + " » — choisis la date.");
      sel.value = "";
    });

    $("gs-pick-map").addEventListener("click", function () {
      toast("Sélection sur carte : à raccorder (Leaflet + clic = adresse).");
    });
  }

  /* ════════════════════════════════════════════════════════════
     Liaison formulaire
     ════════════════════════════════════════════════════════════ */

  function bindForm() {
    /* Boutons radio custom (type / groupe / niveau) */
    document.querySelectorAll(".gs-type[data-type]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.type = b.getAttribute("data-type");
        writeForm();
        refresh();
      });
    });
    document.querySelectorAll(".gs-group[data-group]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.groupe = b.getAttribute("data-group");
        writeForm();
        if (gpxPoints.length) renderGpx(); /* recalcul durée selon vitesse */
        refresh();
      });
    });
    document.querySelectorAll(".gs-type[data-niveau]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.niveau = b.getAttribute("data-niveau");
        writeForm();
        refresh();
      });
    });

    /* Tous les champs natifs */
    ["gs-titre", "gs-date", "gs-heure", "gs-adresse", "gs-ville", "gs-cp",
      "gs-rdv", "gs-depart", "gs-capitaine", "gs-max", "gs-etat"].forEach(function (id) {
      var el = $(id);
      el.addEventListener("input", refresh);
      el.addEventListener("change", refresh);
    });
    $("gs-illimite").addEventListener("change", function () {
      $("gs-max").disabled = $("gs-illimite").checked;
      refresh();
    });
    $("gs-meteo").addEventListener("change", refresh);
    document.querySelectorAll("#gs-materiel input").forEach(function (c) {
      c.addEventListener("change", refresh);
    });

    /* Éditeur riche */
    $("gs-description").addEventListener("input", refresh);
    document.querySelectorAll(".gs-rte-toolbar button").forEach(function (b) {
      b.addEventListener("mousedown", function (e) {
        e.preventDefault(); /* garde la sélection dans l'éditeur */
        var cmd = b.getAttribute("data-cmd");
        if (cmd === "createLink") {
          var url = window.prompt("Adresse du lien :", "https://");
          if (url) document.execCommand("createLink", false, url);
        } else {
          document.execCommand(cmd, false, null);
        }
        refresh();
      });
    });
  }

  /* ════════════════════════════════════════════════════════════
     Init
     ════════════════════════════════════════════════════════════ */

  document.addEventListener("DOMContentLoaded", function () {
    var gate = $("gs-gate");
    var app = $("gs-app");

    function boot(rider) {
      gate.hidden = true;
      app.hidden = false;

      var restored = restoreDraft();
      if (!state.capitaine) state.capitaine = rider.pseudo; /* prérempli Team Rider connecté */
      writeForm();
      $("gs-max").disabled = state.illimite;

      bindForm();
      bindGpx();
      bindActions();
      bindFlyerActions();
      bindSocialActions();
      bindPreviewToggle();
      bindMessageAll();
      loadFlyerBg();

      refresh();
      if (restored) addHistory("Brouillon restauré depuis la sauvegarde automatique.");

      /* Sauvegarde automatique toutes les 30 secondes */
      setInterval(function () {
        if (dirty) saveDraft("Sauvegarde automatique.");
      }, AUTOSAVE_MS);
    }

    var rider = detectTeamRider();
    /* Mode démo : gestion-sorties.html?demo=1 pour prévisualiser sans connexion */
    if (!rider && new URLSearchParams(window.location.search).get("demo") === "1") {
      rider = { pseudo: "Démo" };
    }
    if (rider) {
      boot(rider);
    } else {
      gate.hidden = false;
      app.hidden = true;
      /* Après connexion réussie via la modale js/auth.js */
      window.addEventListener("goelo:auth-success", function () {
        var r = detectTeamRider();
        if (r) boot(r);
      });
    }
  });
})();
