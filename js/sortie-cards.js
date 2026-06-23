/**
 * GoëloRides — Cartes sortie partagées (sorties.html + team-rider.html)
 * Design Strava · calendrier vert acide · photo à droite · boutons par rôle
 */
(function (global) {
  "use strict";

  var MONTH_SHORT = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  var WEEKDAY_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  var THUMBS = {
    route:  "assets/goeloRidesHomePage-thumb.jpg",
    gravel: "assets/groupe-blanc-cyclistes-thumb.jpg",
    vtt:    "assets/groupe-vert-cyclistes-thumb.png",
    blanc:  "assets/groupe-blanc-cyclistes-thumb.jpg",
    vert:   "assets/groupe-vert-cyclistes-thumb.png",
    bleu:   "assets/groupe-bleu-cyclistes-thumb.png",
    rouge:  "assets/groupe-rouge-cyclistes-thumb.png",
    default:"assets/goeloRidesHomePage-thumb.jpg"
  };

  function participantsPreviewHtml(participants) {
    if (global.GoeloSignupParticipants) {
      return global.GoeloSignupParticipants.renderParticipantsPreview(participants, {
        maxAvatars: 5,
        maxNames: 4
      });
    }
    return "";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return String(s || "").replace(/"/g, "&quot;");
  }

  /** Rôle depuis auth.js — jamais hardcodé côté appelant */
  function getUserRole() {
    var r = global.GOELO_ROLE;
    if (r === "admin" || r === "team_rider" || r === "user") return r;
    return "visitor";
  }

  function groupKeyFromLabel(label) {
    var gl = String(label || "").toLowerCase();
    if (gl.indexOf("blanc") !== -1) return "blanc";
    if (gl.indexOf("rouge") !== -1) return "rouge";
    if (gl.indexOf("bleu")  !== -1) return "bleu";
    if (gl.indexOf("noir")  !== -1) return "rouge";
    if (gl.indexOf("vert")  !== -1) return "vert";
    return "vert";
  }

  function isCardOwner(card, user) {
    if (!user || !card.captain) return false;
    var cap = String(card.captain).trim().toLowerCase();
    if (!cap || cap === "—") return false;
    var email = (user.email || "").trim().toLowerCase();
    var um = user.user_metadata || {};
    var pseudo = String(um.pseudo || um.name || "").trim().toLowerCase();
    var local = email ? email.split("@")[0] : "";
    return cap === email || cap === pseudo || cap === local;
  }

  function frDateFull(d, timeStr) {
    if (!d) return "Date à préciser";
    var label = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).format(d);
    label = label.charAt(0).toUpperCase() + label.slice(1);
    var t = timeStr ? String(timeStr).replace(":", "h") : "";
    return t ? label + " · " + t : label;
  }

  function calendarHtml(d) {
    if (!d) {
      return '<div class="go-cal go-cal--empty" aria-hidden="true">—</div>';
    }
    return (
      '<div class="go-cal" aria-hidden="true">' +
      '<div class="go-cal__head">' + MONTH_SHORT[d.getMonth() + 1] + "</div>" +
      '<div class="go-cal__body">' +
      '<span class="go-cal__day">' + d.getDate() + "</span>" +
      '<span class="go-cal__wd">' + WEEKDAY_SHORT[d.getDay()] + "</span>" +
      "</div></div>"
    );
  }

  function typeLabel(t) {
    if (t === "gravel") return "Gravel";
    if (t === "vtt") return "VTT";
    return "Route";
  }

  function fmtKm(km) {
    if (km == null) return "—";
    return String(Math.round(km * 10) / 10).replace(".", ",") + " km";
  }

  function fmtDplus(d) {
    if (d == null) return "—";
    return Math.round(d) + " m D+";
  }

  function estimateDuration(km, dplus, paceKmh) {
    if (km == null) return "—";
    var speed = paceKmh || 20;
    var min = Math.round((km / speed) * 60 + (dplus || 0) / 18);
    var h = Math.floor(min / 60);
    var m = min % 60;
    return h ? "≈ " + h + " h" + (m ? " " + m : "") : "≈ " + m + " min";
  }

  function thumbFor(card) {
    if (card.imageUrl) return card.imageUrl;
    return THUMBS[card.type] || THUMBS[card.groupKey] || THUMBS.default;
  }

  function parcoursHref(id) {
    return "parcours.html?id=" + encodeURIComponent(id);
  }

  function gestionHref(id, mode) {
    return "gestion-sorties.html?mode=" + (mode || "edit") + "&id=" + encodeURIComponent(id);
  }

  /**
   * Boutons selon rôle (admin / team_rider / user / visitor).
   * @param {object} card
   * @param {object} opts — viewMode: 'sorties'|'team-rider', joinedRouteIds: Set, onCancel: fn name
   */
  function buildActions(card, opts) {
    opts = opts || {};
    var role = getUserRole();
    var user = global.GOELO_USER;
    var viewMode = opts.viewMode || "sorties";
    var joined = opts.joinedRouteIds && opts.joinedRouteIds.has(String(card.id));
    var owner = isCardOwner(card, user);
    var parts = [];

    var voirHref = viewMode === "team-rider"
      ? gestionHref(card.id, "edit")
      : parcoursHref(card.id);

    parts.push('<a class="go-sc-btn go-sc-btn--primary" href="' + escapeAttr(voirHref) + '">Voir</a>');

    if (viewMode === "team-rider") {
      if (role === "admin") {
        parts.push('<a class="go-sc-btn go-sc-btn--ghost" href="' + escapeAttr(gestionHref(card.id, "edit")) + '">Modifier</a>');
        parts.push(
          '<button type="button" class="go-sc-btn go-sc-btn--danger" data-go-sc-cancel="' +
          escapeAttr(card.id) + '" data-go-sc-title="' + escapeAttr(card.title) + '">Annuler</button>'
        );
      } else if (role === "team_rider" && owner) {
        parts.push('<a class="go-sc-btn go-sc-btn--ghost" href="' + escapeAttr(gestionHref(card.id, "edit")) + '">Modifier</a>');
      }
      return parts.join("");
    }

    /* ── Liste publique sorties.html ── */
    if (role === "admin") {
      parts.push('<a class="go-sc-btn go-sc-btn--ghost" href="' + escapeAttr(gestionHref(card.id, "edit")) + '">Modifier</a>');
      parts.push(
        '<button type="button" class="go-sc-btn go-sc-btn--danger" data-go-sc-cancel="' +
        escapeAttr(card.id) + '" data-go-sc-title="' + escapeAttr(card.title) + '">Annuler</button>'
      );
    } else if (role === "team_rider") {
      if (owner) {
        parts.push('<a class="go-sc-btn go-sc-btn--ghost" href="' + escapeAttr(gestionHref(card.id, "edit")) + '">Modifier</a>');
      }
    } else if (role === "user") {
      if (joined) {
        parts.push('<a class="go-sc-btn go-sc-btn--danger" href="' + escapeAttr(parcoursHref(card.id)) + '">J\'annule</a>');
      } else {
        parts.push('<a class="go-sc-btn go-sc-btn--accent" href="' + escapeAttr(parcoursHref(card.id)) + '">Rejoindre</a>');
      }
    } else {
      parts.push('<button type="button" class="go-sc-btn go-sc-btn--ghost" data-goelo-auth-trigger>Se connecter</button>');
    }

    return parts.join("");
  }

  function buildCardHtml(card, opts) {
    opts = opts || {};
    var d = card.date;
    var cancelled = card.status === "cancelled" || card.statut === "annulee";
    var gk = card.groupKey || groupKeyFromLabel(card.group);
    var groupShort = String(card.group || "").replace(/^Groupe\s+/i, "") || "—";
    var time = card.meetTime
      ? String(card.meetTime).replace(":", "h")
      : d ? String(d.getHours()) + "h" + String(d.getMinutes()).padStart(2, "0") : "";
    var fullDate = frDateFull(d, card.meetTime || (d ? String(d.getHours()) + ":" + String(d.getMinutes()).padStart(2, "0") : ""));
    var participants = card.participants || [];
    var participantsBlock = participantsPreviewHtml(participants);

    var statutBadge = "";
    if (opts.viewMode === "team-rider" && card.statut) {
      var sc = card.statut === "publiee" ? "pub" : card.statut === "annulee" ? "cancel" : "draft";
      var st = card.statut === "publiee" ? "Publiée" : card.statut === "annulee" ? "Annulée" : "Brouillon";
      statutBadge = '<span class="go-sc-badge go-sc-badge--statut go-sc-badge--' + sc + '">' + st + "</span>";
    }

    var duration = card.duration || estimateDuration(card.km, card.dplus, card.paceKmh);

    return (
      '<article class="go-sc-card' + (cancelled ? " is-cancelled" : "") + '" style="animation-delay:' + (opts.animDelay || 0) + 'ms">' +
      '<div class="go-sc-card__body">' +
        '<div class="go-sc-card__top">' +
          calendarHtml(d) +
          '<div class="go-sc-card__intro">' +
            '<p class="go-sc-card__datetime">' + escapeHtml(fullDate) + "</p>" +
          "</div>" +
        "</div>" +
        '<div class="go-sc-card__title-row">' +
          '<h2 class="go-sc-card__title">' + escapeHtml(card.title) +
          (cancelled ? ' <span class="go-sc-badge go-sc-badge--cancel">Annulée</span>' : "") +
          statutBadge +
          "</h2>" +
          '<span class="go-sc-badge go-level-badge go-sc-badge--' + gk + '" data-level="' + gk + '">' + escapeHtml(groupShort) + "</span>" +
        "</div>" +
        '<div class="go-sc-metrics">' +
          '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">Sport</span>' +
          '<span class="go-sc-metrics__val">🚴 ' + escapeHtml(typeLabel(card.type)) + "</span></div>" +
          '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">Distance</span>' +
          '<span class="go-sc-metrics__val">' + escapeHtml(fmtKm(card.km)) + "</span></div>" +
          '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">Dénivelé</span>' +
          '<span class="go-sc-metrics__val">' + escapeHtml(fmtDplus(card.dplus)) + "</span></div>" +
          '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">Durée</span>' +
          '<span class="go-sc-metrics__val">' + escapeHtml(duration) + "</span></div>" +
        "</div>" +
        '<p class="go-sc-card__meta">' +
          '<span>📍 ' + escapeHtml(card.place || "—") + "</span>" +
          (time ? '<span>🕒 ' + escapeHtml(time) + "</span>" : "") +
        "</p>" +
        participantsBlock +
        '<div class="go-sc-card__actions">' + buildActions(card, opts) + "</div>" +
      "</div>" +
      '<div class="go-sc-card__visual">' +
        '<div class="go-sc-card__img-wrap">' +
        '<img class="go-sc-card__img" src="' + escapeAttr(thumbFor(card)) + '" alt="" loading="lazy" decoding="async">' +
        "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function renderList(cards, container, opts) {
    if (!container) return;
    opts = opts || {};
    if (!cards.length) {
      container.innerHTML = opts.emptyHtml || '<p class="go-sc-empty">Aucune sortie pour ce filtre.</p>';
      return;
    }
    var asList = opts.asList !== false;
    var html = cards.map(function (c, i) {
      var itemOpts = Object.assign({}, opts, { animDelay: i * 45 });
      var inner = buildCardHtml(c, itemOpts);
      return asList ? "<li>" + inner + "</li>" : inner;
    }).join("");
    if (asList) {
      container.innerHTML = '<ul class="go-sc-list">' + html + "</ul>";
    } else {
      container.innerHTML = html;
    }
  }

  /** Normalise une ligne Supabase `routes` → objet carte */
  function fromRouteRow(row) {
    var fc = row.front_config;
    if (typeof fc === "string") {
      try { fc = JSON.parse(fc); } catch (e) { fc = {}; }
    }
    fc = fc || {};
    var stats = fc.stats || {};
    var dateIso = fc.rideDateIso;
    var date = dateIso ? new Date(dateIso + "T12:00:00") : null;
    var time = fc.meetTime || fc.rideTime || "";
    if (date && time && /^\d{2}:\d{2}$/.test(time)) {
      var p = time.split(":");
      date.setHours(+p[0], +p[1], 0, 0);
    }
    var group = row.group_label || "";
    var statut = fc.sortieStatus === "cancelled" ? "annulee"
      : fc.visibility === "public" ? "publiee" : "brouillon";
    var km = stats.totalKm != null ? stats.totalKm : (fc.km != null ? fc.km : null);
    var dplus = stats.elevGainM != null ? stats.elevGainM : (fc.dplus != null ? fc.dplus : null);

    return {
      id: String(row.id),
      title: row.track_name || "Sortie",
      group: group,
      groupKey: groupKeyFromLabel(group),
      type: (function () {
        var rt = String(fc.raceType || "route").toLowerCase();
        if (rt === "gravel") return "gravel";
        if (rt === "vtt" || rt === "rtt") return "vtt";
        return "route";
      })(),
      place: fc.meetPlace || fc.meet_place || "Devant le Kasino",
      date: date,
      meetTime: time,
      km: km,
      dplus: dplus,
      paceKmh: parsePaceKmh(row.pace_label),
      captain: fc.captain || fc.rideLeader || "",
      status: fc.sortieStatus || "open",
      statut: statut,
      imageUrl: fc.thumbSrc || fc.coverImageUrl || fc.coverImageDataUrl || "",
      participants: []
    };
  }

  function parsePaceKmh(paceLabel) {
    var m = String(paceLabel || "").match(/(\d+)\s*[–-]\s*(\d+)/);
    if (m) return (parseInt(m[1], 10) + parseInt(m[2], 10)) / 2;
    return 20;
  }

  global.GoeloSortieCards = {
    getUserRole: getUserRole,
    groupKeyFromLabel: groupKeyFromLabel,
    isCardOwner: isCardOwner,
    fromRouteRow: fromRouteRow,
    buildCardHtml: buildCardHtml,
    buildActions: buildActions,
    renderList: renderList,
    renderParticipantsPreview: participantsPreviewHtml
  };
})(typeof window !== "undefined" ? window : globalThis);
