/**
 * GoëloRides — Approbation demande Team Rider via Edge Function backend.
 * Fallback RPC approve_demande_admin si la fonction edge est injoignable.
 */
(function (global) {
  "use strict";

  function parsePayload(data) {
    if (typeof data === "string") {
      try { return JSON.parse(data); } catch (e) { void e; }
    }
    return data;
  }

  function assertOk(data) {
    if (!data || data.ok !== true) {
      throw new Error((data && data.error) ? String(data.error) : "Approbation échouée");
    }
    return data;
  }

  function isEdgeUnreachable(err, res) {
    if (err) {
      var msg = String(err.message || err);
      return /failed to fetch|networkerror|edge_unreachable|load failed/i.test(msg);
    }
    if (!res) return true;
    return res.status === 404 || res.status === 502 || res.status === 503 || res.status === 0;
  }

  async function invokeEdgeFunction(sb, demandeId) {
    var cfg = global.GOELO_CONFIG || {};
    var base = String(cfg.SUPABASE_URL || "").replace(/\/$/, "");
    var anonKey = cfg.SUPABASE_ANON_KEY || "";

    var sessionRes = await sb.auth.getSession();
    var token = sessionRes.data && sessionRes.data.session
      ? sessionRes.data.session.access_token
      : null;
    if (!token) throw new Error("Session requise — reconnecte-toi");

    try {
      var res = await fetch(base + "/functions/v1/approve-demande", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
          "apikey": anonKey
        },
        body: JSON.stringify({ demande_id: demandeId })
      });

      var data = parsePayload(await res.text());

      if (res.ok) {
        return assertOk(data);
      }

      if (isEdgeUnreachable(null, res)) {
        var unreachable = new Error("edge_unreachable");
        unreachable.edgeStatus = res.status;
        throw unreachable;
      }

      if (data && data.error) throw new Error(String(data.error));
      throw new Error("Approbation échouée (HTTP " + res.status + ")");
    } catch (err) {
      if (isEdgeUnreachable(err, null)) {
        var e2 = new Error("edge_unreachable");
        e2.cause = err;
        throw e2;
      }
      throw err;
    }
  }

  async function invokeRpcFallback(sb, demandeId) {
    var rpc = await sb.rpc("approve_demande_admin", { p_demande_id: demandeId });
    if (rpc.error) throw new Error(rpc.error.message || "RPC approve_demande_admin");
    return assertOk(rpc.data);
  }

  global.goeloApproveDemande = async function (demandeId) {
    var sb = global.goeloGetSb ? global.goeloGetSb() : null;
    if (!sb) throw new Error("Client Supabase non disponible");

    var id = String(demandeId || "").trim();
    if (!id) throw new Error("Identifiant demande manquant");

    try {
      return await invokeEdgeFunction(sb, id);
    } catch (err) {
      if (!isEdgeUnreachable(err, null)) throw err;
      console.warn("[goeloApproveDemande] Edge Function injoignable, fallback RPC", err);
      return await invokeRpcFallback(sb, id);
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
