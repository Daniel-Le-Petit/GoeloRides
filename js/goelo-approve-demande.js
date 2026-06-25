/**
 * GoëloRides — Approbation demande Team Rider via Edge Function backend.
 * Crée l'utilisateur Auth si besoin + notification OneSignal admin (côté serveur).
 */
(function (global) {
  "use strict";

  function parseInvokeResult(result) {
    if (result.error) {
      var msg = result.error.message || "Erreur Edge Function";
      if (result.data && result.data.error) {
        msg = String(result.data.error);
      }
      throw new Error(msg);
    }
    var data = result.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { void e; }
    }
    if (!data || data.ok !== true) {
      throw new Error((data && data.error) ? String(data.error) : "Approbation échouée");
    }
    return data;
  }

  global.goeloApproveDemande = async function (demandeId) {
    var sb = global.goeloGetSb ? global.goeloGetSb() : null;
    if (!sb) throw new Error("Client Supabase non disponible");

    var id = String(demandeId || "").trim();
    if (!id) throw new Error("Identifiant demande manquant");

    var result = await sb.functions.invoke("approve-demande", {
      body: { demande_id: id }
    });

    return parseInvokeResult(result);
  };
})(typeof window !== "undefined" ? window : globalThis);
