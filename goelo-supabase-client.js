/**
 * Shared Supabase configuration, RPC client, and error formatting.
 *
 * Loaded before page-specific scripts via <script src="goelo-supabase-client.js" defer>.
 * Exposes utilities on window.GoeloShared so each page IIFE can reference them
 * instead of re-declaring identical copies.
 */
(function () {
  "use strict";
  var G = (window.GoeloShared = window.GoeloShared || {});

  function normalizeApiKey(raw) {
    var k = raw == null ? "" : String(raw).trim().replace(/\s/g, "");
    if (k.indexOf("sb_publishedable_") === 0) {
      console.warn(
        "Goëlo Rides : faute de frappe dans la clé — « sb_publishedable_ » n'existe pas. " +
          "Le bon préfixe Supabase est « sb_publishable_ » (publishable, sans « ed »)."
      );
    }
    return k;
  }

  function getSupabaseConfig() {
    var url =
      typeof window !== "undefined"
        ? String(window.GOELO_SUPABASE_URL || "")
            .trim()
            .replace(/\s/g, "")
        : "";
    var anonKey =
      typeof window !== "undefined" ? normalizeApiKey(window.GOELO_SUPABASE_ANON_KEY) : "";
    return { url: url, anonKey: anonKey };
  }

  function isSupabaseEnabled() {
    var c = getSupabaseConfig();
    return !!(c.url && c.anonKey);
  }

  /* Warn once at load if URL is set but key is missing. */
  (function warnSupabaseHalfConfig() {
    var c = getSupabaseConfig();
    if (typeof window !== "undefined" && c.url && !c.anonKey) {
      console.warn(
        "Goëlo Rides : GOELO_SUPABASE_URL est défini mais GOELO_SUPABASE_ANON_KEY est vide — " +
          "inscriptions en localStorage uniquement. Colle la clé anon (JWT eyJ…) ou retire aussi l'URL " +
          "(voir supabase/SUPABASE.md)."
      );
    }
  })();

  /** Last RPC transport/HTTP failure (codes 36–39). Reset on each RPC call. */
  var goeloLastRpcFailure = null;

  /**
   * Generic Supabase RPC caller.
   * @param {string} fnName  PostgREST RPC function name.
   * @param {object} payload Body payload (default {}).
   * @param {object} [rpcOpts] Optional { accessToken } to override the bearer.
   */
  async function supabaseRpc(fnName, payload, rpcOpts) {
    rpcOpts = rpcOpts || {};
    goeloLastRpcFailure = null;
    var cfg = getSupabaseConfig();
    var url = cfg.url;
    var anonKey = cfg.anonKey;
    if (!url || !anonKey) return null;
    if (url.indexOf("xxxxxxxx.supabase.co") !== -1) {
      console.warn(
        "Goëlo Rides : GOELO_SUPABASE_URL contient encore l'exemple « xxxxxxxx » — mets ton vrai identifiant projet " +
          "(ex. https://abcd1234xyz.supabase.co depuis Settings → API)."
      );
      return null;
    }
    var base = url.replace(/\/?$/, "");
    var bearer =
      rpcOpts.accessToken && String(rpcOpts.accessToken).trim()
        ? String(rpcOpts.accessToken).trim()
        : anonKey;
    var res;
    try {
      res = await fetch(base + "/rest/v1/rpc/" + encodeURIComponent(fnName), {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: "Bearer " + bearer,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(payload || {})
      });
    } catch (err) {
      goeloLastRpcFailure = { code: 36, httpStatus: 0, fnName: fnName };
      console.warn("Supabase RPC", fnName, "réseau / fetch :", err && err.message ? err.message : err);
      return null;
    }
    if (!res.ok) {
      var errTxt = "";
      try {
        errTxt = await res.text();
      } catch (eRead) {
        void eRead;
      }
      goeloLastRpcFailure = { code: 37, httpStatus: res.status, fnName: fnName, body: errTxt };
      console.warn("Supabase RPC", fnName, res.status, errTxt);
      if (res.status === 401 && errTxt.indexOf("Invalid API key") !== -1) {
        console.warn(
          "Goëlo — 401 : vérifie la clé (Legacy **anon** JWT eyJ…, ou **sb_publishable_** sans faute). " +
            "Même URL et clé pour le même projet."
        );
      }
      return null;
    }
    if (res.status === 204) {
      goeloLastRpcFailure = { code: 38, httpStatus: res.status, fnName: fnName };
      return null;
    }
    var ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      goeloLastRpcFailure = { code: 38, httpStatus: res.status, fnName: fnName };
      return null;
    }
    try {
      return await res.json();
    } catch (e) {
      goeloLastRpcFailure = { code: 39, httpStatus: res.status, fnName: fnName };
      console.warn("Supabase RPC", fnName, "réponse JSON invalide", e);
      return null;
    }
  }

  function goeloFormatDbFailureAlert(code, httpStatus, fnName, failBody) {
    if (code === 41) {
      return (
        "Impossible d'enregistrer dans la mémoire de ce navigateur (quota plein, navigation privée ou blocage).\n\n" +
        "Erreur 41 — contacter l'administrateur ou réessaie après avoir libéré de l'espace."
      );
    }
    if (
      code === 37 &&
      httpStatus === 400 &&
      fnName === "signup_register" &&
      failBody &&
      (String(failBody).indexOf("PGRST202") !== -1 ||
        String(failBody).toLowerCase().indexOf("could not find") !== -1 ||
        String(failBody).indexOf("signup_register") !== -1 ||
        (String(failBody).toLowerCase().indexOf("column") !== -1 &&
          String(failBody).toLowerCase().indexOf("does not exist") !== -1))
    ) {
      var b = String(failBody);
      return (
        "Inscription impossible : la base Supabase du site n'est pas alignée avec le formulaire actuel (fonction RPC ou colonnes manquantes — HTTP 400).\n\n" +
        "Pour l'administrateur : sur ce projet Supabase, exécuter dans l'ordre les migrations du dépôt :\n" +
        "• supabase/migrations/20250623120000_signups_cyclist_level.sql\n" +
        "• supabase/migrations/20250624120000_signups_participant_city.sql\n\n" +
        "(ou `supabase db push` depuis la machine de développement), puis réessayer.\n\n" +
        "Détail technique : " +
        (b.length > 320 ? b.slice(0, 320) + "…" : b)
      );
    }
    if (
      code === 37 &&
      httpStatus === 404 &&
      (fnName === "sortie_comment_add" || fnName === "sortie_comment_list")
    ) {
      return (
        "Fil de discussion indisponible : les fonctions « sortie_comment_list » et « sortie_comment_add » sont introuvables sur le projet Supabase (HTTP 404).\n\n" +
        "Pour l'administrateur : exécuter le SQL du dépôt :\n" +
        "• supabase/migrations/20250620120000_sortie_route_comments.sql\n\n" +
        "Ensuite, pour rester aligné avec le site (inscriptions, visibilité, commentaires si sortie annulée…), enchaîner les migrations du dossier `supabase/migrations/` dans l'ordre des dates, au minimum jusqu'à `20250621130000_signup_waitlist_route_visibility.sql`.\n\n" +
        "(Ou `supabase db push`.)"
      );
    }
    if (code === 37 && httpStatus === 404 && fnName === "route_delete") {
      return (
        "La suppression n'est pas encore activée sur ton projet Supabase : la fonction RPC « route_delete » est introuvable (HTTP 404).\n\n" +
        "Dans le dashboard Supabase → SQL Editor, ouvre et exécute le fichier :\n" +
        "supabase/migrations/20250610120000_route_delete.sql\n\n" +
        "Ensuite réessaie la suppression."
      );
    }
    var ref = "Erreur " + code;
    if (httpStatus) ref += " (HTTP " + httpStatus + ")";
    ref += " — contacter l'administrateur en communiquant ce code exact.";
    return (
      "La demande n'a pas pu être enregistrée sur le serveur de données (réseau, serveur occupé ou refus).\n\n" +
      ref +
      "\n\nRéessaie plus tard si la connexion semble instable."
    );
  }

  /* ── Public API ── */
  G.normalizeApiKey = normalizeApiKey;
  G.getSupabaseConfig = getSupabaseConfig;
  G.isSupabaseEnabled = isSupabaseEnabled;
  G.supabaseRpc = supabaseRpc;
  G.goeloFormatDbFailureAlert = goeloFormatDbFailureAlert;

  Object.defineProperty(G, "goeloLastRpcFailure", {
    get: function () { return goeloLastRpcFailure; },
    set: function (v) { goeloLastRpcFailure = v; },
    enumerable: true
  });
})();
