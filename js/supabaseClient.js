(function () {
  "use strict";

  function getConfig() {
    return {
      url: window.GOELO_SUPABASE_URL || "",
      key: window.GOELO_SUPABASE_ANON_KEY || ""
    };
  }

  function initSupabase() {
    if (!window.supabase) {
      console.warn("Supabase SDK non chargé");
      return null;
    }

    var cfg = getConfig();

    if (!cfg.url || !cfg.key) {
      console.warn("Supabase config manquante");
      return null;
    }

    try {
      return window.supabase.createClient(cfg.url, cfg.key);
    } catch (e) {
      console.warn("Erreur init Supabase", e);
      return null;
    }
  }

  window.supabaseClient = initSupabase();

  window.getSupabaseClient = function () {
    return window.supabaseClient;
  };
})();
