/**
 * GoëloRides — Règles pures miroir de la migration guest_self_signup
 * (tests unitaires sans Postgres). Ne pas utiliser comme seule sécurité :
 * la source de vérité reste les RPC SECURITY DEFINER.
 */
(function (global) {
  "use strict";

  var OPEN_STATUS = { open: 1, publiee: 1, published: 1, "": 1 };
  var CANCELLED_STATUS = {
    cancelled: 1, canceled: 1, annulee: 1, "annulée": 1
  };

  function normalizeStatus(raw) {
    return String(raw == null ? "open" : raw).trim().toLowerCase();
  }

  function normalizeVisibility(raw) {
    return String(raw == null ? "public" : raw).trim().toLowerCase();
  }

  /**
   * @param {object} fc front_config
   * @param {string} todayYmd YYYY-MM-DD (Europe/Paris)
   * @returns {{ ok: boolean, error?: string }}
   */
  function isRouteOpenForPublic(fc, todayYmd) {
    fc = fc || {};
    var status = normalizeStatus(fc.sortieStatus);
    var vis = normalizeVisibility(fc.visibility);

    if (vis !== "public" && vis !== "") {
      if (vis === "invitation" || vis === "invite" || vis === "invitation_only") {
        return { ok: false, error: "invitation_only" };
      }
      return { ok: false, error: "private_route" };
    }

    if (CANCELLED_STATUS[status]) {
      return { ok: false, error: "sortie_cancelled" };
    }

    if (!OPEN_STATUS[status]) {
      return { ok: false, error: "sortie_closed" };
    }

    var iso = typeof fc.rideDateIso === "string" ? fc.rideDateIso.trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && todayYmd && iso < todayYmd) {
      return { ok: false, error: "sortie_passed" };
    }

    return { ok: true };
  }

  function parseMaxParticipants(fc) {
    fc = fc || {};
    var digits = String(fc.maxParticipants == null ? "" : fc.maxParticipants).replace(/\D/g, "");
    if (!digits) return null;
    var n = parseInt(digits, 10);
    return n >= 1 ? n : null;
  }

  /** true = liste d'attente (places principales pleines). */
  function shouldGoToWaitlist(mainCount, maxParticipants) {
    if (maxParticipants == null) return false;
    return Number(mainCount) >= Number(maxParticipants);
  }

  /**
   * Capacité après inscription concurrente : jamais dépasser max en principal.
   * Si overbook détecté, le nouvel inscrit confirmé doit basculer en waitlist.
   */
  function clampOverbook(mainCountAfterInsert, maxParticipants, wasWaitlist) {
    if (wasWaitlist) return { waitlist: true, overbook: false };
    if (maxParticipants == null) return { waitlist: false, overbook: false };
    if (mainCountAfterInsert > maxParticipants) {
      return { waitlist: true, overbook: true };
    }
    return { waitlist: false, overbook: false };
  }

  /**
   * Promotion FIFO unifiée : une seule place.
   * @param {Array<{id:string, kind:'member'|'guest', created_at:string, waitlist:boolean}>} queue
   * @param {number} mainCount
   * @param {number|null} maxParticipants
   */
  function pickOneWaitlistPromotion(queue, mainCount, maxParticipants) {
    if (maxParticipants == null) return null;
    if (mainCount >= maxParticipants) return null;
    var waiting = (queue || []).filter(function (e) {
      return e && e.waitlist;
    }).slice().sort(function (a, b) {
      var ta = String(a.created_at || "");
      var tb = String(b.created_at || "");
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return String(a.id).localeCompare(String(b.id));
    });
    return waiting.length ? waiting[0] : null;
  }

  /**
   * Anti-abus multi-couches (miroir SQL).
   * @returns {{ ok: boolean, error?: string }}
   */
  function checkRateLimits(opts) {
    opts = opts || {};
    var now = opts.nowMs || Date.now();
    var ipAttemptsHour = opts.ipAttemptsHour || 0;
    var ipRouteAttemptsHour = opts.ipRouteAttemptsHour || 0;
    var clientAttemptsDay = opts.clientAttemptsDay || 0;
    var routeAttemptsHour = opts.routeAttemptsHour || 0;
    var lastIpAtMs = opts.lastIpAtMs || 0;
    var hasIp = !!opts.hasIp;

    if (hasIp && lastIpAtMs && (now - lastIpAtMs) < 2000) {
      return { ok: false, error: "rate_limited" };
    }
    if (hasIp && ipAttemptsHour >= 10) return { ok: false, error: "rate_limited" };
    if (hasIp && ipRouteAttemptsHour >= 5) return { ok: false, error: "rate_limited" };
    if (clientAttemptsDay >= 5) return { ok: false, error: "rate_limited" };
    if (routeAttemptsHour >= 30) return { ok: false, error: "rate_limited" };
    if (!hasIp && routeAttemptsHour >= 15) return { ok: false, error: "rate_limited" };
    return { ok: true };
  }

  function validatePseudo(raw) {
    var p = String(raw || "").trim().replace(/\s+/g, " ");
    if (p.length < 2) return { ok: false, error: "pseudo_too_short" };
    if (p.length > 40) return { ok: false, error: "pseudo_too_long" };
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9 ''’\-_.]+$/.test(p)) {
      return { ok: false, error: "pseudo_invalid" };
    }
    return { ok: true, pseudo: p };
  }

  /**
   * Confiance IP (Supabase Edge managed) :
   * Aucun header n'est documenté comme garanti non spoofable → jamais trusted.
   * Protection principale = tickets Edge + client_key (pas l'IP).
   * Un hash envoyé par le navigateur (anon) est toujours ignoré.
   */
  function resolveIpHash(opts) {
    opts = opts || {};
    var role = String(opts.authRole || "anon");
    var edgeHash = String(opts.edgeIpHash || "").trim().toLowerCase();
    var headerIpHash = opts.headerIpHash ? String(opts.headerIpHash).trim().toLowerCase() : null;
    var markTrusted = opts.markTrusted === true;

    // Navigateur : ignorer tout hash fourni
    if (role !== "service_role") {
      return { ipHash: null, trusted: false, source: "none" };
    }

    // Edge / service_role : IP soft seulement si markTrusted explicitement
    // (réservé au jour où Supabase documentera un header d'ingress garanti)
    if (markTrusted && /^[0-9a-f]{64}$/.test(edgeHash)) {
      return { ipHash: edgeHash, trusted: true, source: "edge_guaranteed" };
    }
    if (headerIpHash && /^[0-9a-f]{64}$/.test(headerIpHash)) {
      return { ipHash: headerIpHash, trusted: false, source: "headers_soft" };
    }
    if (/^[0-9a-f]{64}$/.test(edgeHash)) {
      return { ipHash: edgeHash, trusted: false, source: "edge_soft" };
    }
    return { ipHash: null, trusted: false, source: "none" };
  }

  /**
   * Simulation sérialisée de 2 inscriptions concurrentes sur la dernière place.
   * Miroir du advisory lock SQL : les décisions sont séquentielles.
   */
  function simulateConcurrentLastSeat(opts) {
    opts = opts || {};
    var max = opts.maxParticipants;
    var main = Number(opts.mainCount || 0);
    var requests = opts.requests || [];
    var results = [];
    var lockQueue = requests.slice();

    while (lockQueue.length) {
      var req = lockQueue.shift();
      var waitlist = shouldGoToWaitlist(main, max);
      if (!waitlist) main += 1;
      var clamp = clampOverbook(main, max, waitlist);
      if (clamp.overbook) {
        waitlist = true;
        main -= 1; // bascule : ne compte plus en principal
      }
      results.push({
        id: req.id,
        waitlist: waitlist,
        mainAfter: main
      });
    }

    return { results: results, finalMain: main, max: max };
  }

  /**
   * Après annulation d'un confirmé : promouvoir exactement une place FIFO.
   */
  function afterCancelPromote(state) {
    state = state || {};
    var main = Number(state.mainCount || 0);
    var max = state.maxParticipants;
    var queue = state.queue || [];
    if (main > 0) main -= 1; // désinscription confirmée
    var pick = pickOneWaitlistPromotion(queue, main, max);
    if (!pick) {
      return { mainCount: main, promoted: null, queue: queue };
    }
    var nextQueue = queue.map(function (e) {
      if (e.id === pick.id) {
        return Object.assign({}, e, { waitlist: false });
      }
      return e;
    });
    return {
      mainCount: main + 1,
      promoted: pick,
      queue: nextQueue
    };
  }

  var api = {
    isRouteOpenForPublic: isRouteOpenForPublic,
    parseMaxParticipants: parseMaxParticipants,
    shouldGoToWaitlist: shouldGoToWaitlist,
    clampOverbook: clampOverbook,
    pickOneWaitlistPromotion: pickOneWaitlistPromotion,
    checkRateLimits: checkRateLimits,
    validatePseudo: validatePseudo,
    resolveIpHash: resolveIpHash,
    simulateConcurrentLastSeat: simulateConcurrentLastSeat,
    afterCancelPromote: afterCancelPromote
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.GoeloGuestSignupRules = api;
})(typeof window !== "undefined" ? window : globalThis);
