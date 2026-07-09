/**
 * GoëloRides — Cartes sortie partagées (sorties.html + team-rider.html)
 * Layout cinématique · photo plein écran · overlays
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
      return global.GoeloSignupParticipants.renderParticipantsPreview(participants);
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
    if (!user || !user.id || !card.assigned_team_rider_id) return false;
    return String(card.assigned_team_rider_id) === String(user.id);
  }

  function canEditRoute(card, role, user) {
    if (role === "admin") return true;
    return isCardOwner(card, user);
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
    if (km == null) return "Non renseigné";
    return String(Math.round(km * 10) / 10).replace(".", ",") + " km";
  }

  function fmtDplus(d) {
    if (d == null) return "Non renseigné";
    return Math.round(d) + " m D+";
  }

  function estimateDuration(km, dplus, paceKmh) {
    if (km == null) return "Non renseigné";
    var speed = paceKmh || 20;
    var min = Math.round((km / speed) * 60 + (dplus || 0) / 18);
    var h = Math.floor(min / 60);
    var m = min % 60;
    return h ? "≈ " + h + " h" + (m ? " " + m : "") : "≈ " + m + " min";
  }

  function durationDisplay(card) {
    if (card.duration) return String(card.duration);
    var est = estimateDuration(card.km, card.dplus, card.paceKmh);
    if (est === "Non renseigné") return est;
    return est.replace(/^≈\s*/, "").replace(/\s+h\s+/i, "h").replace(/\s+min$/, "");
  }

  function weatherInlineHtml(weather) {
    var wxLabel = function (score) {
      if (score === "ideal") return "Idéal";
      if (score === "moderate") return "Modéré";
      if (score === "difficult") return "Difficile";
      return "—";
    };
    if (!weather || weather.status === "loading") {
      return '<span class="go-sc-wx">Temps <span class="go-sc-wx__dot go-sc-wx__dot--na" aria-hidden="true"></span></span>';
    }
    if (weather.status !== "ok" || !weather.score) {
      return '<span class="go-sc-wx">Temps <span class="go-sc-wx__dot go-sc-wx__dot--na" aria-hidden="true"></span></span>';
    }
    return (
      '<span class="go-sc-wx">Temps <span class="go-sc-wx__dot go-sc-wx__dot--' + escapeAttr(weather.score) + '" aria-hidden="true"></span> ' +
      escapeHtml(wxLabel(weather.score)) + "</span>"
    );
  }

  function statKmHtml(km) {
    if (km == null) return '<span class="go-sc-stat__muted">—</span>';
    var n = String(Math.round(km * 10) / 10).replace(".", ",");
    return '<strong class="go-sc-stat__num">' + escapeHtml(n) + "</strong> km";
  }

  function statDplusHtml(d) {
    if (d == null) return '<span class="go-sc-stat__muted">—</span>';
    return '<strong class="go-sc-stat__num">' + Math.round(d) + "</strong> m D+";
  }

  function statDurationHtml(card) {
    var d = durationDisplay(card);
    if (!d || d === "Non renseigné") return '<span class="go-sc-stat__muted">—</span>';
    return '<strong class="go-sc-stat__num">' + escapeHtml(d) + "</strong>";
  }

  var CLOCK_SVG =
    '<svg class="go-sc-card__clock" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

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

  /** Boutons principaux en haut à droite (Voir · Rejoindre). */
  function buildTopActions(card, opts) {
    opts = opts || {};
    var role = getUserRole();
    var viewMode = opts.viewMode || "sorties";
    var joined = opts.joinedRouteIds && opts.joinedRouteIds.has(String(card.id));
    var voirHref = viewMode === "team-rider"
      ? gestionHref(card.id, "edit")
      : parcoursHref(card.id);
    var parts = [
      '<a class="go-sc-btn go-sc-btn--voir" href="' + escapeAttr(voirHref) + '">Voir</a>'
    ];

    if (viewMode === "team-rider") return parts.join("");

    if (role === "user" && !joined) {
      parts.push('<a class="go-sc-btn go-sc-btn--join" href="' + escapeAttr(parcoursHref(card.id)) + '">Rejoindre</a>');
    } else if (role === "visitor") {
      parts.push('<button type="button" class="go-sc-btn go-sc-btn--join" data-goelo-auth-trigger>Rejoindre</button>');
    }

    return parts.join("");
  }

  /** Actions secondaires (admin, désinscription) en bas de carte. */
  function buildSecondaryActions(card, opts) {
    opts = opts || {};
    var role = getUserRole();
    var user = global.GOELO_USER;
    var viewMode = opts.viewMode || "sorties";
    var joined = opts.joinedRouteIds && opts.joinedRouteIds.has(String(card.id));
    var canEdit = canEditRoute(card, role, user);
    var parts = [];

    if (viewMode === "team-rider") {
      if (role === "admin") {
        parts.push('<a class="go-sc-btn go-sc-btn--ghost" href="' + escapeAttr(gestionHref(card.id, "edit")) + '">Modifier</a>');
        parts.push(
          '<button type="button" class="go-sc-btn go-sc-btn--danger" data-go-sc-cancel="' +
          escapeAttr(card.id) + '" data-go-sc-title="' + escapeAttr(card.title) + '">Annuler</button>'
        );
      } else if (role === "team_rider" && canEdit) {
        parts.push('<a class="go-sc-btn go-sc-btn--ghost" href="' + escapeAttr(gestionHref(card.id, "edit")) + '">Modifier</a>');
      }
      return parts.join("");
    }

    if (role === "admin") {
      parts.push('<a class="go-sc-btn go-sc-btn--ghost" href="' + escapeAttr(gestionHref(card.id, "edit")) + '">Modifier</a>');
      parts.push(
        '<button type="button" class="go-sc-btn go-sc-btn--danger" data-go-sc-cancel="' +
        escapeAttr(card.id) + '" data-go-sc-title="' + escapeAttr(card.title) + '">Annuler</button>'
      );
    } else if (role === "team_rider" && canEdit) {
      parts.push('<a class="go-sc-btn go-sc-btn--ghost" href="' + escapeAttr(gestionHref(card.id, "edit")) + '">Modifier</a>');
    } else if (role === "user" && joined) {
      parts.push('<a class="go-sc-btn go-sc-btn--danger" href="' + escapeAttr(parcoursHref(card.id)) + '">J\'annule</a>');
    }

    return parts.join("");
  }

  /** @deprecated compat — top + secondaire */
  function buildActions(card, opts) {
    return buildTopActions(card, opts) + buildSecondaryActions(card, opts);
  }

  function buildCardHtml(card, opts) {
    opts = opts || {};
    var d = card.date;
    var cancelled = card.status === "cancelled" || card.statut === "annulee";
    var gk = card.groupKey || groupKeyFromLabel(card.group);
    var groupShort = String(card.group || "").replace(/^Groupe\s+/i, "") || "—";
    var groupFull = /^groupe\s/i.test(String(card.group || ""))
      ? String(card.group)
      : "Groupe " + groupShort;
    var time = card.meetTime
      ? String(card.meetTime).replace(":", "h")
      : d ? String(d.getHours()) + "h" + String(d.getMinutes()).padStart(2, "0") : "";
    var participants = card.participants || [];
    var participantsBlock = participants.length
      ? participantsPreviewHtml(participants)
      : "";
    var secondaryActions = buildSecondaryActions(card, opts);

    var statutBadge = "";
    if (opts.viewMode === "team-rider" && card.statut) {
      var sc = card.statut === "publiee" ? "pub" : card.statut === "annulee" ? "cancel" : "draft";
      var st = card.statut === "publiee" ? "Publiée" : card.statut === "annulee" ? "Annulée" : "Brouillon";
      statutBadge = '<span class="go-sc-badge go-sc-badge--statut go-sc-badge--' + sc + '">' + st + "</span>";
    }

    var cancelBadge = cancelled
      ? '<span class="go-sc-badge go-sc-badge--cancel">Annulée</span>'
      : "";

    var teamRiderLine = opts.viewMode === "team-rider" && card.teamRiderPseudo
      ? '<p class="go-sc-card__rider">🚴 Team Rider : ' + escapeHtml(card.teamRiderPseudo) + "</p>"
      : "";

    var metaTime = time
      ? '<span class="go-sc-card__meta-time">' + CLOCK_SVG + escapeHtml(time) + "</span>"
      : "";

    var metaSep = '<span class="go-sc-card__meta-sep" aria-hidden="true"></span>';

    return (
      '<article class="go-sc-card' + (cancelled ? " is-cancelled" : "") + '" style="animation-delay:' + (opts.animDelay || 0) + 'ms" data-route-id="' + escapeAttr(card.id) + '">' +
        '<img class="go-sc-card__bg" src="' + escapeAttr(thumbFor(card)) + '" alt="" loading="lazy" decoding="async">' +
        '<div class="go-sc-card__shade" aria-hidden="true"></div>' +
        '<div class="go-sc-card__inner">' +
          '<header class="go-sc-card__top">' +
            '<div class="go-sc-card__top-left">' +
              '<div class="go-sc-card__cal">' + calendarHtml(d) + "</div>" +
              '<div class="go-sc-card__meta">' +
                metaTime +
                (metaTime ? metaSep : "") +
                weatherInlineHtml(card.weather) +
                metaSep +
                '<span class="go-sc-card__meta-group go-sc-card__meta-group--' + gk + '">' + escapeHtml(groupFull) + "</span>" +
                statutBadge +
                cancelBadge +
              "</div>" +
            "</div>" +
            '<div class="go-sc-card__top-actions">' + buildTopActions(card, opts) + "</div>" +
          "</header>" +
          '<h2 class="go-sc-card__title">' + escapeHtml(card.title) + "</h2>" +
          '<div class="go-sc-card__stats" role="group" aria-label="Statistiques">' +
            '<div class="go-sc-stat"><span class="go-sc-stat__label">Sport</span>' +
            '<span class="go-sc-stat__val"><span class="go-sc-stat__sport-icon" aria-hidden="true">🚴</span> ' + escapeHtml(typeLabel(card.type)) + "</span></div>" +
            '<div class="go-sc-stat"><span class="go-sc-stat__label">Dénivelé</span>' +
            '<span class="go-sc-stat__val">' + statDplusHtml(card.dplus) + "</span></div>" +
            '<div class="go-sc-stat"><span class="go-sc-stat__label">Distance</span>' +
            '<span class="go-sc-stat__val">' + statKmHtml(card.km) + "</span></div>" +
            '<div class="go-sc-stat"><span class="go-sc-stat__label">Durée</span>' +
            '<span class="go-sc-stat__val">' + statDurationHtml(card) + "</span></div>" +
          "</div>" +
          '<footer class="go-sc-card__foot">' +
            '<div class="go-sc-card__foot-main">' +
              '<div class="go-sc-card__place-block">' +
                '<span class="go-sc-card__pin" aria-hidden="true"></span>' +
                '<div class="go-sc-card__place-lines">' +
                  '<p class="go-sc-card__place">' + escapeHtml(card.place || "—") + "</p>" +
                  (time ? '<p class="go-sc-card__meet">Rendez-vous ' + escapeHtml(time) + "</p>" : "") +
                "</div>" +
              "</div>" +
              (participantsBlock ? '<div class="go-sc-card__participants">' + participantsBlock + "</div>" : "") +
            "</div>" +
            teamRiderLine +
            (secondaryActions
              ? '<div class="go-sc-card__actions go-sc-card__actions--secondary">' + secondaryActions + "</div>"
              : "") +
          "</footer>" +
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
    bindCardTracking(container, opts);
  }

  function cardMetaFromEl(card) {
    var routeId = card.getAttribute("data-route-id") || "";
    var titleEl = card.querySelector(".go-sc-card__title");
    return {
      route_id: routeId,
      route_title: titleEl ? titleEl.textContent.trim() : ""
    };
  }

  function bindCardTracking(container, opts) {
    if (!container || !opts || !opts.trackSource) return;
    if (container.dataset.goScTrackBound === "1") return;
    container.dataset.goScTrackBound = "1";

    container.addEventListener("click", function (e) {
      var GA = global.GoeloActivity;
      if (!GA) return;

      var card = e.target.closest(".go-sc-card[data-route-id]");
      if (!card) return;

      var cardMeta = cardMetaFromEl(card);
      var meta = {
        source: opts.trackSource,
        route_id: cardMeta.route_id,
        route_title: cardMeta.route_title
      };
      var extras = {
        route_id: cardMeta.route_id,
        route_title: cardMeta.route_title
      };

      if (e.target.closest(".go-sc-btn--voir")) {
        GA.logEvent(null, GA.EVENT_TYPES.UPCOMING_RIDE_VIEW_CLICKED, meta, extras);
        return;
      }
      if (e.target.closest(".go-sc-btn--join")) {
        GA.logEvent(null, GA.EVENT_TYPES.UPCOMING_RIDE_JOIN_CLICKED, meta, extras);
        return;
      }
      if (e.target.closest("a, button, .go-sc-btn")) return;

      GA.logEvent(null, GA.EVENT_TYPES.UPCOMING_RIDE_CARD_CLICKED, meta, extras);
    });
  }

  function teamRiderDisplayName(tr) {
    if (!tr) return "";
    if (global.GoeloProfile) return global.GoeloProfile.getDisplayName(tr);
    return "User";
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
      duration: fc.estimatedDurationHm || fc.estimated_duration_hm || null,
      paceKmh: parsePaceKmh(row.pace_label),
      assigned_team_rider_id: row.assigned_team_rider_id || null,
      teamRiderPseudo: teamRiderDisplayName(row.team_rider),
      captain: fc.captain || fc.rideLeader || "",
      status: fc.sortieStatus || "open",
      statut: statut,
      imageUrl: fc.thumbSrc || fc.coverImageUrl || fc.coverImageDataUrl || "",
      participants: [],
      embeddedPoints: Array.isArray(fc.embeddedPoints) ? fc.embeddedPoints : null,
      meetLat: fc.meetLat != null ? Number(fc.meetLat) : (fc.meet_lat != null ? Number(fc.meet_lat) : null),
      meetLon: fc.meetLon != null ? Number(fc.meetLon) : (fc.meet_lon != null ? Number(fc.meet_lon) : null)
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
    canEditRoute: canEditRoute,
    fromRouteRow: fromRouteRow,
    buildCardHtml: buildCardHtml,
    buildActions: buildActions,
    buildTopActions: buildTopActions,
    buildSecondaryActions: buildSecondaryActions,
    renderList: renderList,
    renderParticipantsPreview: participantsPreviewHtml
  };
})(typeof window !== "undefined" ? window : globalThis);
