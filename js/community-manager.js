/**
 * GoëloRides — Planning Communication
 * Source de vérité = sorties `routes`. Aucune action sans sortie liée.
 * Titres métier uniquement (jamais d'ID technique dans l'UI).
 */
(function () {
  "use strict";

  var STORAGE_KEY = "goelo-cm-overrides-v3";
  var PAST_WINDOW_DAYS = 14;
  var ARCHIVE_AFTER_DAYS = 7;

  var HASHTAGS_BASE = [
    "#GoëloRides",
    "#CyclismeBretagne",
    "#SaintQuayPortrieux",
    "#CotesdArmor"
  ];

  var STATUS = {
    planned:   { key: "planned",   label: "Planifié",       emoji: "⚪" },
    draft:     { key: "draft",     label: "À préparer",     emoji: "🟠" },
    ready:     { key: "ready",     label: "Prêt à publier", emoji: "🟡" },
    published: { key: "published", label: "Publié",         emoji: "🟢" },
    archived:  { key: "archived",  label: "Archivé",        emoji: "⚫" }
  };

  /** Planning relatif à la date réelle de la sortie. */
  var ACTION_TEMPLATES = [
    {
      kind: "annonce_fb_page",
      canal: "facebook_page",
      offsetDays: -7,
      time: "10:00",
      label: "Annonce sortie",
      phase: "pre",
      needs: []
    },
    {
      kind: "spotlight_instagram",
      canal: "instagram",
      offsetDays: -3,
      time: "11:00",
      label: "Mise en avant parcours",
      phase: "pre",
      needs: ["photo"]
    },
    {
      kind: "rappel_messenger",
      canal: "messenger",
      offsetDays: -1,
      time: "18:00",
      label: "Rappel participants",
      phase: "pre",
      needs: []
    },
    {
      kind: "feedback_strava",
      canal: "strava",
      offsetDays: 1,
      time: "10:00",
      label: "Feedback sortie",
      phase: "post",
      needs: ["photo", "statistiques"]
    },
    {
      kind: "recap_facebook",
      canal: "facebook_page",
      offsetDays: 1,
      time: "11:00",
      label: "Récap sortie",
      phase: "post",
      needs: ["photo"]
    }
  ];

  var state = {
    view: "today",
    sorties: [],
    sortiesById: {},
    actions: [],
    overrides: {},
    calWeekStart: null,
    calSelectedIso: null,
    openId: null,
    previewId: null,
    editId: null,
    overdueOpen: false,
    lastSyncAt: null,
    eventsBound: false,
    loadError: null
  };

  /* ── Social URLs (config only) ─────────────────────────────── */

  function social() {
    var cfg = (window.GOELO_CONFIG && window.GOELO_CONFIG.GOELO_SOCIAL) || {};
    return {
      site: cfg.site || "https://goelorides.onrender.com",
      facebook_page: cfg.facebook_page || "",
      facebook_group: cfg.facebook_group || "",
      messenger: cfg.messenger || window.GOELO_CONFIG && window.GOELO_CONFIG.GOELO_MESSENGER_GROUP_URL || "",
      instagram: cfg.instagram || "",
      strava: cfg.strava || ""
    };
  }

  function canalMeta(key) {
    var s = social();
    var map = {
      facebook_page:  { label: "Facebook Page",  icon: "📘", url: s.facebook_page },
      facebook_group: { label: "Facebook Groupe", icon: "👥", url: s.facebook_group },
      messenger:      { label: "Messenger",       icon: "💬", url: s.messenger },
      instagram:      { label: "Instagram",       icon: "📸", url: s.instagram },
      strava:         { label: "Strava",          icon: "🚴", url: s.strava }
    };
    return map[key] || { label: key, icon: "📢", url: s.site };
  }

  function canalUrl(key) {
    return canalMeta(key).url || social().site;
  }

  /* ── Dates ─────────────────────────────────────────────────── */

  function pad2(n) { return String(n).padStart(2, "0"); }

  function toIsoDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function parseIso(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return null;
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function addDays(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function mondayOf(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    var day = x.getDay();
    return addDays(x, day === 0 ? -6 : 1 - day);
  }

  function todayIso() {
    if (window.GoeloSortieDates && window.GoeloSortieDates.todayParisYmd) {
      return window.GoeloSortieDates.todayParisYmd();
    }
    return toIsoDate(new Date());
  }

  function formatDateShort(d) {
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatDateFrLong(iso) {
    var d = parseIso(iso);
    if (!d) return iso || "—";
    var s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function formatTimeDisplay(hhmm) {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return hhmm || "—";
    return hhmm.replace(":", "h");
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function nowHm() {
    var n = new Date();
    return pad2(n.getHours()) + ":" + pad2(n.getMinutes());
  }

  /* ── Titre métier (jamais d'ID technique) ──────────────────── */

  function isTechnicalLabel(value, routeId) {
    var v = String(value || "").trim();
    if (!v) return true;
    if (routeId && v === String(routeId)) return true;
    if (/^c_[0-9a-f]{8,}$/i.test(v)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
    if (/\.gpx$/i.test(v)) return true;
    if (/^strava/i.test(v) && v.length < 20) return true;
    return false;
  }

  function firstDisplayable(candidates, routeId) {
    for (var i = 0; i < candidates.length; i++) {
      var v = candidates[i];
      if (v == null) continue;
      var t = String(v).trim();
      if (!t || isTechnicalLabel(t, routeId)) continue;
      return t;
    }
    return null;
  }

  function goeloNumberFor(sortedCards, card) {
    var n = 1;
    for (var i = 0; i < sortedCards.length; i++) {
      if (String(sortedCards[i].id) === String(card.id)) return n;
      n++;
    }
    return n;
  }

  /**
   * Priorité : title → name → track_name humanisé → GoëloRides #N
   * track_name n'est utilisé que s'il est affichable ; sinon fallback numéroté.
   */
  function resolveDisplayTitle(row, fc, goeloNum) {
    var id = String(row.id || "");
    fc = fc || {};

    var preferred = firstDisplayable([
      row.title,
      fc.title,
      row.name,
      fc.name,
      fc.displayTitle,
      fc.sortieTitle
    ], id);

    if (preferred) {
      if (/goëlo\s*rides/i.test(preferred) || /goelorides/i.test(preferred)) return preferred;
      return "GoëloRides #" + goeloNum + " - " + preferred;
    }

    var track = String(row.track_name || "").trim();
    if (track && !isTechnicalLabel(track, id)) {
      if (/goëlo\s*rides/i.test(track) || /goelorides/i.test(track)) return track;
      return "GoëloRides #" + goeloNum + " - " + track;
    }

    return "GoëloRides #" + goeloNum;
  }

  /* ── Snapshot sortie ───────────────────────────────────────── */

  function sortieUrlPath(routeId) {
    return "parcours.html?id=" + encodeURIComponent(routeId);
  }

  function absoluteSortieUrl(routeId) {
    return social().site.replace(/\/$/, "") + "/" + sortieUrlPath(routeId);
  }

  function snapshotFromEnriched(card) {
    var dateIso = window.GoeloSortieDates
      ? window.GoeloSortieDates.sortieCalendarYmd(card)
      : toIsoDate(card.date);
    var startTime = card.meetTime || "09:00";
    if (!/^\d{2}:\d{2}$/.test(startTime)) startTime = "09:00";

    var snap = {
      route_id: String(card.id),
      title: card.displayTitle || "GoëloRides",
      date: dateIso,
      start_time: startTime,
      location: card.place || "",
      niveau: card.group || card.groupKey || "",
      km: card.km != null ? card.km : null,
      dplus: card.dplus != null ? card.dplus : null,
      lien: absoluteSortieUrl(card.id),
      imageUrl: card.imageUrl || "",
      statut: card.statut || "",
      duration: card.duration || null
    };
    snap.fingerprint = [
      snap.route_id, snap.date, snap.start_time, snap.location,
      snap.niveau, snap.km, snap.dplus, snap.title, snap.lien
    ].join("|");
    return snap;
  }

  function sortieHasEnded(snap) {
    var t = todayIso();
    if (!snap.date) return false;
    if (snap.date < t) return true;
    if (snap.date > t) return false;
    /* Jour J : après l'heure de RDV (+ durée estimée ~3h si absente) */
    var endHm = snap.start_time || "09:00";
    var parts = endHm.split(":");
    var mins = (+parts[0]) * 60 + (+parts[1]) + 180;
    var endH = Math.min(23, Math.floor(mins / 60));
    var endM = mins % 60;
    var endStr = pad2(endH) + ":" + pad2(endM);
    return nowHm() >= endStr;
  }

  /* ── Fetch ─────────────────────────────────────────────────── */

  async function fetchSorties() {
    var sb = window.goeloGetSb && window.goeloGetSb();
    if (!sb) {
      state.loadError = "Supabase indisponible";
      return [];
    }

    var res = await sb
      .from("routes")
      .select("id, track_name, group_label, pace_label, is_active, front_config, created_at, assigned_team_rider_id, team_rider:profiles!assigned_team_rider_id(pseudo)")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (res.error) {
      console.error("[CM] routes:", res.error);
      state.loadError = res.error.message || "Erreur chargement sorties";
      return [];
    }
    state.loadError = null;

    var today = todayIso();
    var pastLimit = toIsoDate(addDays(parseIso(today), -PAST_WINDOW_DAYS));

    var cards = (res.data || [])
      .map(function (row) {
        var card = window.GoeloSortieCards.fromRouteRow(row);
        var fc = row.front_config;
        if (typeof fc === "string") {
          try { fc = JSON.parse(fc); } catch (e) { fc = {}; }
        }
        card._row = row;
        card._fc = fc || {};
        return card;
      })
      .filter(function (c) {
        if (c.status === "cancelled" || c.statut === "annulee") return false;
        var iso = window.GoeloSortieDates
          ? window.GoeloSortieDates.sortieCalendarYmd(c)
          : toIsoDate(c.date);
        if (!iso) return false;
        return iso >= pastLimit;
      })
      .sort(function (a, b) {
        var da = (a.date && a.date.getTime) ? a.date.getTime() : 0;
        var db = (b.date && b.date.getTime) ? b.date.getTime() : 0;
        return da - db;
      });

    cards.forEach(function (c, i) {
      c.displayTitle = resolveDisplayTitle(c._row, c._fc, i + 1);
      /* Log technique uniquement */
      if (isTechnicalLabel(c._row.track_name, c.id)) {
        console.info("[CM] titre fallback pour", c.id, "→", c.displayTitle);
      }
    });

    return cards;
  }

  /* ── Génération posts par canal ────────────────────────────── */

  function statsLine(snap) {
    var parts = [];
    if (snap.niveau) parts.push("Groupe " + snap.niveau);
    if (snap.km != null && snap.km !== "") parts.push(snap.km + " km");
    if (snap.dplus != null && snap.dplus !== "") parts.push(snap.dplus + " m D+");
    return parts.join(" · ");
  }

  function hashtagsFor(canal) {
    var tags = HASHTAGS_BASE.slice();
    if (canal === "instagram") {
      tags = tags.concat(["#Velo", "#Bretagne"]);
    }
    if (canal === "strava") {
      tags = tags.concat(["#Cycling"]);
    }
    return tags;
  }

  function generateBody(kind, snap) {
    var dateFr = formatDateFrLong(snap.date);
    var timeFr = formatTimeDisplay(snap.start_time);
    var stats = statsLine(snap);
    var site = social().site;
    var lien = snap.lien || site;
    var tags;

    if (kind === "annonce_fb_page") {
      tags = hashtagsFor("facebook_page").join(" ");
      return (
        "🚴 " + snap.title + "\n\n" +
        "Nouvelle sortie GoëloRides — ouvert à la découverte !\n\n" +
        "📅 " + dateFr + "\n" +
        "⏰ RDV " + timeFr + "\n" +
        "📍 " + (snap.location || "Lieu à confirmer") +
        (stats ? "\n" + stats : "") + "\n\n" +
        "Tu débutes ou tu veux rejoindre le peloton ?\n" +
        "Inscriptions et infos :\n" + lien + "\n\n" +
        tags
      );
    }

    if (kind === "spotlight_instagram") {
      tags = hashtagsFor("instagram").join(" ");
      return (
        "✨ " + snap.title + "\n\n" +
        "Les routes du Goëlo n'attendent que toi.\n" +
        dateFr + " · RDV " + timeFr + "\n" +
        (snap.location ? snap.location + "\n" : "") +
        (stats ? stats + "\n" : "") + "\n" +
        "Story & parcours en stories 📷\n" +
        "Infos en bio 🔗\n\n" +
        tags
      );
    }

    if (kind === "rappel_messenger") {
      return (
        "Bonjour 👋\n\n" +
        "Rappel pour demain :\n\n" +
        "🚴 " + snap.title + "\n" +
        "📅 " + dateFr + "\n" +
        "⏰ RDV " + timeFr + "\n" +
        "📍 " + (snap.location || "—") +
        (stats ? "\n" + stats : "") + "\n\n" +
        "Pense à vérifier ton vélo et la météo.\n" +
        "Détails : " + lien + "\n\n" +
        "À demain sur le Goëlo 💚\n#GoëloRides"
      );
    }

    if (kind === "feedback_strava") {
      tags = hashtagsFor("strava").join(" ");
      return (
        "🚴 " + snap.title + "\n\n" +
        "Feedback club GoëloRides\n" +
        "📅 " + dateFr + " · RDV " + timeFr + "\n" +
        (stats ? "📊 " + stats + "\n" : "📊 Stats à compléter après l'activité\n") +
        "📍 " + (snap.location || "—") + "\n\n" +
        "Trace & club : " + canalUrl("strava") + "\n" +
        "Site : " + lien + "\n\n" +
        tags
      );
    }

    if (kind === "recap_facebook") {
      tags = hashtagsFor("facebook_page").join(" ");
      return (
        "📸 Récap — " + snap.title + "\n\n" +
        "Belle sortie sur le Goëlo 💚\n\n" +
        "📅 " + dateFr + "\n" +
        "📍 " + (snap.location || "—") +
        (stats ? "\n" + stats : "") + "\n\n" +
        "Merci au peloton !\n" +
        "Prochaine sortie & inscriptions :\n" + lien + "\n\n" +
        tags
      );
    }

    if (kind === "recap_instagram") {
      tags = hashtagsFor("instagram").join(" ");
      return (
        "🌅 " + snap.title + "\n\n" +
        "Ce qu'il reste quand la sortie est finie :\n" +
        "les sourires, les paysages, le Goëlo.\n\n" +
        dateFr +
        (stats ? " · " + stats : "") + "\n\n" +
        "Prochaine aventure en bio 🔗\n\n" +
        tags
      );
    }

    return snap.title + "\n" + dateFr + " · " + timeFr + "\n" + lien;
  }

  function missingFor(tpl, snap, ov) {
    var needs = (tpl.needs || []).slice();
    if ((ov && ov.photosAdded) || snap.imageUrl) {
      needs = needs.filter(function (n) { return n !== "photo"; });
    }
    if (snap.km != null && snap.dplus != null) {
      needs = needs.filter(function (n) { return n !== "statistiques"; });
    }
    return needs;
  }

  function normalizeStatus(s) {
    if (s === "prepare") return "draft";
    if (STATUS[s]) return s;
    return "planned";
  }

  function defaultStatus(missing) {
    return missing.length ? "draft" : "ready";
  }

  /* ── Build actions ─────────────────────────────────────────── */

  function actionDateFor(tpl, snap) {
    var ride = parseIso(snap.date);
    if (!ride) return snap.date;
    return toIsoDate(addDays(ride, tpl.offsetDays || 0));
  }

  function archiveCutoffIso() {
    return toIsoDate(addDays(parseIso(todayIso()), -ARCHIVE_AFTER_DAYS));
  }

  function buildActionFromTemplate(tpl, snap, ov) {
    ov = ov || {};
    var id = snap.route_id + "__" + tpl.kind;
    var missing = missingFor(tpl, snap, ov);
    var liveBody = (typeof ov.bodyOverride === "string" && ov.bodyOverride.trim())
      ? ov.bodyOverride
      : generateBody(tpl.kind, snap);
    var status = normalizeStatus(ov.status || defaultStatus(missing));
    var bodyFingerprint = snap.fingerprint;
    var stale = false;
    var actionDate = actionDateFor(tpl, snap);
    var actionTime = tpl.time || "10:00";
    var cutoff = archiveCutoffIso();

    if (actionDate < cutoff && status !== "published" && status !== "archived") {
      status = "archived";
    }

    if (status === "published" || status === "archived") {
      if (typeof ov.body === "string" && ov.body.trim()) {
        liveBody = ov.body;
        bodyFingerprint = ov.bodyFingerprint || "";
        stale = bodyFingerprint !== snap.fingerprint;
      }
      if (ov.actionDate) actionDate = ov.actionDate;
      if (ov.actionTime) actionTime = ov.actionTime;
    } else {
      if (!ov.bodyOverride) {
        liveBody = generateBody(tpl.kind, snap);
      } else {
        stale = !!(ov.bodyFingerprint && ov.bodyFingerprint !== snap.fingerprint);
      }
      bodyFingerprint = snap.fingerprint;
      if (!ov.status) {
        status = defaultStatus(missing);
      } else {
        status = normalizeStatus(ov.status);
        if (!missing.length && status === "planned") status = "ready";
      }
    }

    var hasText = !!(liveBody && String(liveBody).trim());
    var needsPhoto = (tpl.needs || []).indexOf("photo") !== -1;
    var photoOk = !needsPhoto || !!(snap.imageUrl || (ov && ov.photosAdded));
    var checklist = [
      { ok: hasText, label: "Texte généré" },
      { ok: photoOk, label: needsPhoto ? "Photo disponible" : "Photo non requise" },
      {
        ok: status === "published",
        label: status === "published" ? "Publication effectuée" : "Publication non effectuée"
      }
    ];

    return {
      id: id,
      kind: tpl.kind,
      kindLabel: tpl.label,
      phase: tpl.phase,
      date: actionDate,
      time: actionTime,
      canal: tpl.canal,
      title: tpl.label + " — " + snap.title,
      status: status,
      body: liveBody,
      bodyFingerprint: bodyFingerprint,
      stale: stale,
      hashtags: hashtagsFor(tpl.canal),
      sortieUrl: sortieUrlPath(snap.route_id),
      imageUrl: snap.imageUrl || null,
      missing: missing,
      checklist: checklist,
      sortie: snap
    };
  }

  function rebuildActionsFromSorties() {
    var list = [];
    var today = todayIso();
    var cutoff = archiveCutoffIso();

    state.sorties.forEach(function (card) {
      var snap = snapshotFromEnriched(card);
      if (!snap.date) return;

      ACTION_TEMPLATES.forEach(function (tpl) {
        var aDate = actionDateFor(tpl, snap);
        var ov = state.overrides[snap.route_id + "__" + tpl.kind];

        /* Post-sortie uniquement après le jour J */
        if (tpl.phase === "post" && snap.date >= today) return;

        /* > 7 jours et non publié → hors vues principales */
        if (aDate < cutoff && (!ov || ov.status !== "published")) return;

        /* Sortie passée : ignorer les pré-ride non publiées */
        if (tpl.phase === "pre" && snap.date < today) {
          if (!ov || (ov.status !== "published" && ov.status !== "archived")) return;
        }

        var action = buildActionFromTemplate(tpl, snap, ov);
        if (action.status === "archived") return;
        list.push(action);
      });
    });

    list.sort(function (a, b) {
      return (a.date + a.time).localeCompare(b.date + b.time);
    });
    state.actions = list;
  }

  /* ── Persistence ───────────────────────────────────────────── */

  function loadOverrides() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (raw && raw.overrides && typeof raw.overrides === "object") {
        Object.keys(raw.overrides).forEach(function (k) {
          if (raw.overrides[k].status === "prepare") raw.overrides[k].status = "draft";
        });
        return raw.overrides;
      }
    } catch (e) { /* ignore */ }
    /* Migration v2 → v3 */
    try {
      var old = JSON.parse(localStorage.getItem("goelo-cm-overrides-v2") || "null");
      if (old && old.overrides) {
        Object.keys(old.overrides).forEach(function (k) {
          if (old.overrides[k].status === "prepare") old.overrides[k].status = "draft";
        });
        return old.overrides;
      }
    } catch (e2) { /* ignore */ }
    return {};
  }

  function persistOverrides() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, overrides: state.overrides }));
  }

  function patchOverride(id, patch) {
    state.overrides[id] = Object.assign({}, state.overrides[id] || {}, patch);
    persistOverrides();
  }

  /* ── Stale check ───────────────────────────────────────────── */

  function isCopyBlocked(action) {
    if (!action || !action.sortie || !action.sortie.route_id) return true;
    if (!state.sortiesById[action.sortie.route_id]) return true;
    if (action.stale) return true;
    var live = snapshotFromEnriched(state.sortiesById[action.sortie.route_id]);
    if (live.fingerprint !== action.sortie.fingerprint) return true;
    if (action.status === "published" && action.bodyFingerprint && action.bodyFingerprint !== live.fingerprint) {
      return true;
    }
    return false;
  }

  function refreshActionContent(action) {
    if (!action || !action.sortie) return;
    var card = state.sortiesById[action.sortie.route_id];
    if (!card) {
      toast("Sortie introuvable");
      return;
    }
    var snap = snapshotFromEnriched(card);
    var ov = Object.assign({}, state.overrides[action.id] || {});
    delete ov.bodyOverride;
    if (action.status === "published" || action.status === "archived") {
      ov.status = action.status;
      ov.body = generateBody(action.kind, snap);
      ov.bodyFingerprint = snap.fingerprint;
    } else {
      delete ov.body;
      delete ov.bodyFingerprint;
      ov.bodyFingerprint = snap.fingerprint;
    }
    state.overrides[action.id] = ov;
    persistOverrides();
    rebuildActionsFromSorties();
    toast("Contenu actualisé depuis la sortie");
    refresh();
  }

  /* ── Filters ───────────────────────────────────────────────── */

  function isOpenStatus(a) {
    return a.status === "ready" || a.status === "draft" || a.status === "planned";
  }

  function actionsForIso(iso) {
    return state.actions.filter(function (a) {
      return a.date === iso && a.status !== "archived";
    });
  }

  function overdueActions(today) {
    var cutoff = archiveCutoffIso();
    return state.actions.filter(function (a) {
      return a.date < today && a.date >= cutoff && isOpenStatus(a);
    }).sort(function (a, b) {
      return (a.date + a.time).localeCompare(b.date + b.time);
    });
  }

  function nextSortie() {
    var today = todayIso();
    var upcoming = state.sorties
      .map(function (c) { return snapshotFromEnriched(c); })
      .filter(function (s) { return s.date && s.date >= today; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
    return upcoming[0] || null;
  }

  function sortiesOnIso(iso) {
    return state.sorties
      .map(function (c) { return snapshotFromEnriched(c); })
      .filter(function (s) { return s.date === iso; });
  }

  function upcomingSortieCount() {
    var today = todayIso();
    return state.sorties.filter(function (c) {
      var iso = window.GoeloSortieDates
        ? window.GoeloSortieDates.sortieCalendarYmd(c)
        : toIsoDate(c.date);
      return iso && iso >= today;
    }).length;
  }

  function pendingPublishCount() {
    return state.actions.filter(function (a) {
      return a.status === "ready" || a.status === "draft";
    }).length;
  }

  function actionsInRange(startIso, endIso) {
    return state.actions.filter(function (a) {
      return a.date >= startIso && a.date <= endIso && a.status !== "archived";
    }).sort(function (a, b) {
      return (a.date + a.time).localeCompare(b.date + b.time);
    });
  }

  function countByStatus(list) {
    var c = { published: 0, ready: 0, draft: 0, planned: 0 };
    list.forEach(function (a) {
      if (c[a.status] != null) c[a.status]++;
    });
    return c;
  }

  function remainingCount(list) {
    return list.filter(isOpenStatus).length;
  }

  /* ── Toast / copy ──────────────────────────────────────────── */

  function toast(msg) {
    var wrap = document.getElementById("toast-wrap");
    if (!wrap) return;
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3000);
  }

  function copyText(text) {
    if (!text) { toast("Aucun texte à copier"); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast("Post copié");
      }).catch(function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("Post copié"); }
    catch (e) { toast("Copie impossible"); }
    document.body.removeChild(ta);
  }

  /* ── Render ────────────────────────────────────────────────── */

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusMeta(key) {
    return STATUS[normalizeStatus(key)] || STATUS.planned;
  }

  function renderStaleBanner(action) {
    if (!isCopyBlocked(action)) return "";
    return (
      '<div class="stale-banner" role="alert">' +
        "<div>⚠️ Les informations de la publication ne correspondent plus à la sortie actuelle.</div>" +
        '<button type="button" class="btn-sm accent" data-act="refresh" data-id="' +
          escapeHtml(action.id) + '">Actualiser le contenu</button>' +
      "</div>"
    );
  }

  function renderChecklist(action) {
    var items = action.checklist || [];
    if (!items.length) return "";
    return (
      '<div class="action-checklist">' +
        '<div class="action-field__lab">Checklist</div>' +
        '<ul>' +
        items.map(function (it) {
          return "<li class=\"" + (it.ok ? "is-ok" : "is-ko") + "\">" +
            (it.ok ? "✅" : "❌") + " " + escapeHtml(it.label) +
            "</li>";
        }).join("") +
        "</ul>" +
      "</div>"
    );
  }

  function renderEventCard(snap) {
    return (
      '<article class="event-card">' +
        '<div class="event-card__eyebrow">🚴 Événement GoëloRides</div>' +
        '<div class="event-card__title">' + escapeHtml(snap.title) + "</div>" +
        '<div class="event-card__meta">' +
          escapeHtml(formatDateFrLong(snap.date)) + "<br>" +
          escapeHtml(formatTimeDisplay(snap.start_time)) + "<br>" +
          escapeHtml(snap.location || "—") +
        "</div>" +
        '<div class="action-btns">' +
          '<a class="btn-sm" href="' + escapeHtml(sortieUrlPath(snap.route_id)) + '">Voir la sortie</a>' +
        "</div>" +
      "</article>"
    );
  }

  function renderCard(action, opts) {
    opts = opts || {};
    var st = statusMeta(action.status);
    var canal = canalMeta(action.canal);
    var isOpen = state.openId === action.id;
    var isPreview = state.previewId === action.id;
    var overdue = !!opts.overdue;
    var blocked = isCopyBlocked(action);
    var snap = action.sortie;
    var hasBody = !!(action.body && action.body.trim());

    var previewClass = "action-preview" +
      (hasBody ? "" : " is-empty") +
      (isPreview ? " is-expanded is-full" : "");

    var previewText = hasBody ? action.body : "Contenu à générer.";

    return (
      '<article class="action-card' +
        (action.status === "published" ? " is-published" : "") +
        (overdue ? " is-overdue" : "") +
        (blocked ? " is-stale" : "") +
        (isOpen ? " is-open" : "") +
        '" data-id="' + escapeHtml(action.id) + '">' +

        '<div class="action-card__canal">' +
          '<span class="action-canal__icon">' + canal.icon + "</span>" +
          '<span class="action-canal__name">' + escapeHtml(canal.label) + "</span>" +
          '<span class="action-status status--' + st.key + '">' +
            st.emoji + " " + escapeHtml(st.label) +
          "</span>" +
        "</div>" +

        '<div class="action-card__body">' +
          '<div class="action-field"><span class="action-field__lab">Action</span>' +
            '<div class="action-field__val">' + escapeHtml(action.title) + "</div></div>" +
          '<div class="action-field"><span class="action-field__lab">Date publication</span>' +
            '<div class="action-field__val">' + escapeHtml(formatDateFrLong(action.date)) +
            " · " + escapeHtml(formatTimeDisplay(action.time)) + "</div></div>" +
          '<div class="action-field"><span class="action-field__lab">Sortie</span>' +
            '<div class="action-field__val action-sortie">' +
              (snap
                ? "<strong>" + escapeHtml(snap.title) + "</strong><br>" +
                  escapeHtml(formatDateFrLong(snap.date)) + "<br>" +
                  "RDV " + escapeHtml(formatTimeDisplay(snap.start_time)) + "<br>" +
                  escapeHtml(snap.location || "—")
                : "—") +
            "</div></div>" +
          renderChecklist(action) +
        "</div>" +

        renderStaleBanner(action) +

        '<div class="' + previewClass + '" data-preview="' + escapeHtml(action.id) + '">' +
          escapeHtml(previewText) +
        "</div>" +

        '<div class="action-btns">' + buildActionButtons(action, blocked) + "</div>" +

        (isOpen ? renderDetail(action, canal) : "") +
      "</article>"
    );
  }

  function buildActionButtons(action, blocked) {
    var parts = [];
    var st = action.status;
    var canal = canalMeta(action.canal);

    if (action.body && action.body.trim() && !blocked && st !== "published") {
      parts.push('<button type="button" class="btn-sm accent" data-act="copy" data-id="' + escapeHtml(action.id) + '">📋 Copier le post</button>');
    } else if (st === "published" && action.body && !blocked) {
      parts.push('<button type="button" class="btn-sm" data-act="copy" data-id="' + escapeHtml(action.id) + '">📋 Copier le post</button>');
    } else {
      parts.push('<button type="button" class="btn-sm" data-act="copy" data-id="' + escapeHtml(action.id) + '" disabled>📋 Copier</button>');
    }

    parts.push('<button type="button" class="btn-sm" data-act="preview" data-id="' + escapeHtml(action.id) + '">👁 Voir aperçu</button>');
    parts.push('<button type="button" class="btn-sm" data-act="edit" data-id="' + escapeHtml(action.id) + '">✏ Modifier</button>');
    parts.push('<a class="btn-sm" href="' + escapeHtml(canal.url || "#") + '" target="_blank" rel="noopener">🔗 Ouvrir canal</a>');

    if (blocked) {
      parts.push('<button type="button" class="btn-sm accent" data-act="refresh" data-id="' + escapeHtml(action.id) + '">Actualiser le contenu</button>');
    }

    if (st === "ready" && !blocked) {
      parts.push('<button type="button" class="btn-sm accent" data-act="publish" data-id="' + escapeHtml(action.id) + '">✅ Marquer publié</button>');
    } else if (st === "published") {
      parts.push('<button type="button" class="btn-sm" data-act="archive" data-id="' + escapeHtml(action.id) + '">⚫ Archiver</button>');
    }

    if ((st === "draft" || st === "planned") && action.missing.indexOf("photo") !== -1) {
      parts.push('<button type="button" class="btn-sm" data-act="photos" data-id="' + escapeHtml(action.id) + '">📸 Photos OK</button>');
    }

    return parts.join("");
  }

  function renderDetail(action, canal) {
    var snap = action.sortie;
    var tags = (action.hashtags || []).map(function (h) {
      return '<span class="hashtag">' + escapeHtml(h) + "</span>";
    }).join(" ");

    return (
      '<div class="detail-panel">' +
        '<div class="detail-row"><div class="detail-label">Canal</div>' +
          '<div class="detail-value">' + canal.icon + " " + escapeHtml(canal.label) + "</div></div>" +
        '<div class="detail-row"><div class="detail-label">Hashtags</div>' +
          '<div class="hashtag-list">' + tags + "</div></div>" +
        (snap
          ? '<div class="detail-row"><div class="detail-label">Parcours</div>' +
            '<div class="detail-value">' +
              (snap.km != null ? escapeHtml(String(snap.km)) + " km" : "—") +
              (snap.dplus != null ? " · " + escapeHtml(String(snap.dplus)) + " m D+" : "") +
              (snap.niveau ? " · " + escapeHtml(snap.niveau) : "") +
            "</div></div>"
          : "") +
        '<div class="detail-row"><div class="detail-label">Lien site</div>' +
          '<div class="detail-value"><a href="' + escapeHtml(snap && snap.lien || social().site) +
          '" target="_blank" rel="noopener">' + escapeHtml(snap && snap.lien || social().site) +
          "</a></div></div>" +
      "</div>"
    );
  }

  function formatSyncStamp(d) {
    if (!d) return "—";
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear() +
      " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function renderSyncBar() {
    var today = todayIso();
    var todayN = actionsForIso(today).length;
    return (
      '<div class="sync-bar">' +
        "<div class=\"sync-bar__main\">" +
          "<span>Données synchronisées : <strong>" +
          escapeHtml(formatSyncStamp(state.lastSyncAt)) +
          "</strong></span>" +
          '<div class="sync-bar__stats">' +
            "<span>Sorties à venir : <strong>" + upcomingSortieCount() + "</strong></span>" +
            "<span>Actions aujourd'hui : <strong>" + todayN + "</strong></span>" +
            "<span>Publications en attente : <strong>" + pendingPublishCount() + "</strong></span>" +
          "</div>" +
          (state.loadError ? '<span class="sync-bar__err">⚠️ ' + escapeHtml(state.loadError) + "</span>" : "") +
        "</div>" +
        '<button type="button" class="btn-sm" id="btn-resync">↻ Synchroniser</button>' +
      "</div>"
    );
  }

  function groupByDate(list) {
    var map = {};
    var order = [];
    list.forEach(function (a) {
      if (!map[a.date]) {
        map[a.date] = [];
        order.push(a.date);
      }
      map[a.date].push(a);
    });
    return { map: map, order: order };
  }

  /* ── Views ─────────────────────────────────────────────────── */

  function renderToday() {
    var today = todayIso();
    document.getElementById("today-date").textContent = formatDateShort(parseIso(today));

    var todayList = actionsForIso(today).sort(function (a, b) {
      return a.time.localeCompare(b.time);
    });
    var overdue = overdueActions(today);
    var next = nextSortie();
    var todayEvents = sortiesOnIso(today);
    var counts = countByStatus(todayList);
    document.getElementById("sum-published").textContent = String(counts.published);
    document.getElementById("sum-ready").textContent = String(counts.ready);
    document.getElementById("sum-draft").textContent = String(counts.draft);
    document.getElementById("sum-planned").textContent = String(counts.planned);

    var left = remainingCount(todayList);
    var hint = document.getElementById("remaining-hint");
    if (!state.sorties.length) {
      hint.innerHTML = "Aucune sortie active. Publie une sortie dans <a href=\"gestion-sorties.html\" style=\"color:var(--accent)\">Gestion sorties</a>.";
    } else if (left === 0) {
      hint.innerHTML = "<strong>Rien à publier aujourd'hui.</strong>" +
        (overdue.length ? " " + overdue.length + " retard(s) dans la section repliable." : " Consulte la vue Semaine.");
    } else {
      hint.innerHTML = "<strong>" + left + " action" + (left > 1 ? "s" : "") +
        "</strong> prévue" + (left > 1 ? "s" : "") + " aujourd'hui.";
    }

    var html = renderSyncBar();

    html += '<p class="slabel">Actions prévues aujourd\'hui <em>' + todayList.length + "</em></p>";
    if (todayEvents.length) {
      todayEvents.forEach(function (s) { html += renderEventCard(s); });
    }
    if (!todayList.length && !todayEvents.length) {
      html += '<div class="empty-state"><strong>Aucune action aujourd\'hui</strong>Les publications à venir sont dans l\'onglet Semaine.</div>';
    } else {
      todayList.forEach(function (a) { html += renderCard(a); });
    }

    if (overdue.length) {
      html +=
        '<button type="button" class="slabel slabel--urgent overdue-toggle" id="overdue-toggle" aria-expanded="' +
        (state.overdueOpen ? "true" : "false") + '">' +
        "Actions en retard <em>" + overdue.length + "</em>" +
        '<span class="overdue-toggle__chev">' + (state.overdueOpen ? "▼" : "▶") + "</span>" +
        "</button>";
      if (state.overdueOpen) {
        html += '<div class="overdue-panel">';
        overdue.forEach(function (a) { html += renderCard(a, { overdue: true }); });
        html += "</div>";
      }
    }

    html += '<p class="slabel">Prochaine sortie GoëloRides</p>';
    if (next) {
      html += renderEventCard(next);
    } else {
      html += '<div class="empty-state"><strong>Pas de sortie à venir</strong></div>';
    }

    document.getElementById("today-feed").innerHTML = html;
  }

  function renderWeek() {
    var today = parseIso(todayIso());
    var start = mondayOf(today);
    var end = addDays(start, 6);
    var startIso = toIsoDate(start);
    var endIso = toIsoDate(end);
    var list = actionsInRange(startIso, endIso);

    document.getElementById("week-title").textContent =
      formatDateShort(start) + " → " + formatDateShort(end);
    document.getElementById("week-hint").innerHTML =
      "<strong>" + list.length + "</strong> action" + (list.length !== 1 ? "s" : "") + " cette semaine";

    var grouped = groupByDate(list);
    var html = renderSyncBar();
    html += '<p class="slabel">Actions de la semaine</p>';

    var dayCursor = new Date(start);
    var any = false;
    for (var i = 0; i < 7; i++) {
      var iso = toIsoDate(dayCursor);
      var dayActions = grouped.map[iso] || [];
      var daySorties = sortiesOnIso(iso);
      if (dayActions.length || daySorties.length) {
        any = true;
        html += '<p class="day-heading">📅 ' + formatDateFrLong(iso) + "</p>";
        daySorties.forEach(function (s) { html += renderEventCard(s); });
        dayActions.forEach(function (a) { html += renderCard(a); });
      }
      dayCursor = addDays(dayCursor, 1);
    }

    if (!any) {
      html += '<div class="empty-state"><strong>Rien cette semaine</strong>Aucune publication ni sortie planifiée.</div>';
    }

    document.getElementById("week-feed").innerHTML = html;
  }

  function renderCalendar() {
    if (!state.calWeekStart) state.calWeekStart = mondayOf(parseIso(todayIso()));
    if (!state.calSelectedIso) state.calSelectedIso = todayIso();

    var start = state.calWeekStart;
    var end = addDays(start, 6);
    var tIso = todayIso();

    document.getElementById("cal-label").textContent =
      "Semaine du " + formatDateShort(start) +
      (end.getMonth() !== start.getMonth() ? " → " + formatDateShort(end) : "");

    var weekHtml = "";
    for (var i = 0; i < 7; i++) {
      var d = addDays(start, i);
      var iso = toIsoDate(d);
      var dayActions = actionsForIso(iso);
      var daySorties = sortiesOnIso(iso);
      var name = d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
      var dots = dayActions.slice(0, 4).map(function (a) {
        return '<span class="cal-dot cal-dot--' + a.status + '"></span>';
      }).join("");
      if (daySorties.length) {
        dots += '<span class="cal-dot cal-dot--event" title="Sortie"></span>';
      }

      weekHtml +=
        '<button type="button" class="cal-day' +
        (iso === tIso ? " is-today" : "") +
        (iso === state.calSelectedIso ? " is-selected" : "") +
        (daySorties.length ? " has-event" : "") +
        '" data-cal-day="' + iso + '">' +
        '<div class="cal-day__name">' + escapeHtml(capitalize(name)) + "</div>" +
        '<div class="cal-day__n">' + d.getDate() + "</div>" +
        '<div class="cal-day__dots">' + dots + "</div>" +
        "</button>";
    }
    document.getElementById("cal-week").innerHTML = weekHtml;

    var list = actionsForIso(state.calSelectedIso).sort(function (a, b) {
      return a.time.localeCompare(b.time);
    });
    var events = sortiesOnIso(state.calSelectedIso);
    var detail = renderSyncBar() +
      '<p class="day-heading">📅 ' + formatDateFrLong(state.calSelectedIso) + "</p>";
    if (!list.length && !events.length) {
      detail += '<div class="empty-state"><strong>Rien ce jour</strong></div>';
    } else {
      events.forEach(function (s) { detail += renderEventCard(s); });
      list.forEach(function (a) { detail += renderCard(a); });
    }
    document.getElementById("cal-day-detail").innerHTML = detail;
  }

  function setView(view) {
    state.view = view;
    document.getElementById("view-today").hidden = view !== "today";
    document.getElementById("view-week").hidden = view !== "week";
    document.getElementById("view-calendar").hidden = view !== "calendar";

    document.querySelectorAll(".view-tab").forEach(function (tab) {
      var on = tab.getAttribute("data-view") === view;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });

    document.querySelectorAll("[data-view-link]").forEach(function (a) {
      var on = a.getAttribute("data-view-link") === view;
      a.classList.toggle("is-active", on);
      if (a.closest(".mobile-nav")) {
        if (on) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }
    });

    refresh();
  }

  function refresh() {
    if (state.view === "today") renderToday();
    else if (state.view === "week") renderWeek();
    else renderCalendar();
  }

  /* ── Handlers ──────────────────────────────────────────────── */

  function findAction(id) {
    for (var i = 0; i < state.actions.length; i++) {
      if (state.actions[i].id === id) return state.actions[i];
    }
    return null;
  }

  function openEditDialog(action) {
    state.editId = action.id;
    var dlg = document.getElementById("edit-dialog");
    document.getElementById("edit-sub").textContent = action.title;
    document.getElementById("edit-body").value = action.body || "";
    if (dlg.showModal) dlg.showModal();
    else dlg.setAttribute("open", "open");
  }

  function handleAction(act, id) {
    var action = findAction(id);
    if (!action && act !== "preview") return;

    if (act === "preview") {
      state.previewId = state.previewId === id ? null : id;
      state.openId = state.previewId === id ? id : state.openId;
      refresh();
      return;
    }

    if (act === "edit") {
      openEditDialog(action);
      return;
    }

    if (act === "refresh") {
      refreshActionContent(action);
      return;
    }

    if (act === "copy") {
      if (isCopyBlocked(action)) {
        toast("Actualise le contenu avant de copier");
        return;
      }
      copyText(action.body);
      return;
    }

    if (act === "photos") {
      patchOverride(id, {
        status: action.status === "planned" ? "draft" : action.status,
        photosAdded: true
      });
      rebuildActionsFromSorties();
      toast("Photos marquées OK");
      refresh();
      return;
    }

    if (act === "ready") {
      if (isCopyBlocked(action)) {
        toast("Actualise d'abord le contenu");
        return;
      }
      patchOverride(id, { status: "ready" });
      rebuildActionsFromSorties();
      toast("Statut : Prêt à publier");
      refresh();
      return;
    }

    if (act === "publish") {
      if (isCopyBlocked(action)) {
        toast("Actualise d'abord le contenu");
        return;
      }
      patchOverride(id, {
        status: "published",
        body: action.body,
        bodyFingerprint: action.sortie ? action.sortie.fingerprint : "",
        actionDate: action.date,
        actionTime: action.time,
        canal: action.canal,
        title: action.title
      });
      rebuildActionsFromSorties();
      toast("Marqué comme publié");
      refresh();
      return;
    }

    if (act === "archive") {
      patchOverride(id, { status: "archived" });
      rebuildActionsFromSorties();
      toast("Archivé");
      refresh();
    }
  }

  async function syncFromSorties(opts) {
    opts = opts || {};
    state.sorties = await fetchSorties();
    state.sortiesById = {};
    state.sorties.forEach(function (c) {
      state.sortiesById[String(c.id)] = c;
    });
    rebuildActionsFromSorties();
    state.lastSyncAt = new Date();
    if (opts.toast) {
      toast(state.sorties.length
        ? state.sorties.length + " sortie(s) synchronisée(s)"
        : "Aucune sortie à synchroniser");
    }
    refresh();
  }

  function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;

    document.querySelectorAll(".view-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setView(tab.getAttribute("data-view"));
      });
    });

    document.querySelectorAll("[data-view-link]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        var v = a.getAttribute("data-view-link");
        if (!v) return;
        e.preventDefault();
        setView(v);
      });
    });

    document.getElementById("cal-prev").addEventListener("click", function () {
      state.calWeekStart = addDays(state.calWeekStart, -7);
      renderCalendar();
    });
    document.getElementById("cal-next").addEventListener("click", function () {
      state.calWeekStart = addDays(state.calWeekStart, 7);
      renderCalendar();
    });
    document.getElementById("cal-today-btn").addEventListener("click", function () {
      var t = parseIso(todayIso());
      state.calWeekStart = mondayOf(t);
      state.calSelectedIso = todayIso();
      renderCalendar();
    });

    var editForm = document.getElementById("edit-form");
    if (editForm) {
      editForm.addEventListener("submit", function (e) {
        var submitter = e.submitter;
        var val = submitter ? submitter.value : "cancel";
        if (val === "save" && state.editId) {
          e.preventDefault();
          var body = document.getElementById("edit-body").value;
          var action = findAction(state.editId);
          var fp = action && action.sortie ? action.sortie.fingerprint : "";
          patchOverride(state.editId, {
            status: action && action.status === "planned" ? "draft" : (action && action.status) || "draft",
            bodyOverride: body,
            bodyFingerprint: fp
          });
          rebuildActionsFromSorties();
          toast("Post modifié");
          var dlg = document.getElementById("edit-dialog");
          if (dlg.close) dlg.close();
          else dlg.removeAttribute("open");
          refresh();
        }
      });
    }

    document.addEventListener("click", function (e) {
      if (e.target.closest("#btn-resync")) {
        syncFromSorties({ toast: true });
        return;
      }
      if (e.target.closest("#overdue-toggle")) {
        state.overdueOpen = !state.overdueOpen;
        refresh();
        return;
      }
      var calDay = e.target.closest("[data-cal-day]");
      if (calDay) {
        state.calSelectedIso = calDay.getAttribute("data-cal-day");
        renderCalendar();
        return;
      }
      var btn = e.target.closest("[data-act]");
      if (btn) {
        handleAction(btn.getAttribute("data-act"), btn.getAttribute("data-id"));
      }
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") syncFromSorties({ toast: false });
    });
  }

  async function showDashboard(role, user) {
    var gate = document.getElementById("gate-panel");
    var dash = document.getElementById("dashboard");
    if (!gate || !dash) return;

    if (role !== "admin" && role !== "team_rider") {
      gate.style.display = "block";
      dash.style.display = "none";
      return;
    }

    gate.style.display = "none";
    dash.style.display = "block";

    var name =
      window.GOELO_DISPLAY_NAME ||
      (user && user.user_metadata && user.user_metadata.display_name) ||
      (user && user.email) ||
      "Community";

    var nameEl = document.getElementById("user-name");
    var avEl = document.getElementById("user-avatar");
    if (nameEl) nameEl.textContent = name;
    if (avEl) {
      var parts = String(name).trim().split(/\s+/);
      avEl.textContent = parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : String(name).slice(0, 2).toUpperCase();
    }

    state.overrides = loadOverrides();
    state.calWeekStart = mondayOf(parseIso(todayIso()));
    state.calSelectedIso = todayIso();
    bindEvents();
    setView("today");
    await syncFromSorties({ toast: false });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var demo = new URLSearchParams(location.search).get("demo");
    var gate = document.getElementById("gate-panel");
    if (gate) gate.style.display = "block";

    if (window.GOELO_ROLE && window.GOELO_ROLE !== "visitor") {
      showDashboard(window.GOELO_ROLE, window.GOELO_USER);
      return;
    }

    window.addEventListener("goelo:role-ready", function handler(e) {
      window.removeEventListener("goelo:role-ready", handler);
      showDashboard(e.detail.role, e.detail.user);
    }, { once: true });

    if (demo === "admin" || demo === "team_rider") {
      setTimeout(function () {
        var dash = document.getElementById("dashboard");
        if (!dash || dash.style.display === "none") {
          window.GOELO_DISPLAY_NAME = "Community";
          showDashboard(demo, {
            email: demo + "@demo.local",
            user_metadata: { display_name: "Community" }
          });
        }
      }, 1800);
    }
  });
})();
