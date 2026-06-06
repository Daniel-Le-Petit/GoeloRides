    (function () {
      const START = { lat: 48.6536, lon: -2.8353, label: "Saint-Quay-Portrieux" };
      const GPX_MAX_POINTS = 6000;
      const EMBEDDED_POINTS_MAX = 1400;
      let newRoutePreviewMapInst = null;
      let newRoutePreviewLine = null;

      const SHARED = {
        meetPlace: "Devant le Kasino",
        meetParking: "Parking du Kasino, Saint-Quay-Portrieux",
        meetRv: "8h20",
        region: "Côte du Goëlo",
        time: "8h30"
      };

      /* E-mail pour recevoir les inscriptions (Formsubmit). Laisse vide pour lien mailto uniquement.
         formSubmitOnUnregister : envoyer aussi un POST FormSubmit à la désinscription (défaut false :
         FormSubmit renvoie souvent 521 / ERR_ABORTED côté CDN — la désinscription reste gérée par Supabase). */
      const SIGNUP = {
        formEmail: "goelo.rides@gmail.com",
        participantsCsvUrl: "",
        formSubmitOnUnregister: false
      };

      /**
       * Texte FormSubmit `_autoresponse` (e-mail de confirmation au cycliste), en français.
       * Limitation FormSubmit : `_autoresponse` est ignoré pour les envois en AJAX (`fetch`) et quand
       * `_captcha` est à `false` (notre cas — inscription fluide sans reCAPTCHA). Le texte reste prêt si
       * vous passez un jour à un POST formulaire classique ou si la règle évolue.
       * @see https://formsubmit.co/documentation (_autoresponse)
       */
      const GOELO_FORMSUBMIT_AUTORESPONSE_INSCRIPTION =
        "Bonjour,\n\n" +
        "Nous avons bien reçu ton inscription Goëlo Rides (message automatique).\n\n" +
        "Retrouve le détail sur la page Sorties du site. Pense à vérifier le point de rendez-vous, le niveau et ton matériel avant le départ.\n\n" +
        "À bientôt sur la route,\n" +
        "L’équipe Goëlo Rides";

      const GOELO_FORMSUBMIT_AUTORESPONSE_DESINSCRIPTION =
        "Bonjour,\n\n" +
        "Nous avons bien enregistré ta désinscription pour ce parcours (message automatique).\n\n" +
        "Tu peux te réinscrire à tout moment depuis la page des sorties si tu changes d’avis.\n\n" +
        "À bientôt,\n" +
        "L’équipe Goëlo Rides";

      /**
       * Supabase (optionnel) : `window.GOELO_SUPABASE_URL` + `window.GOELO_SUPABASE_ANON_KEY`
       * (voir supabase/SUPABASE.md). Valeurs relues à chaque appel — le petit script de config peut
       * être placé juste après ce fichier. Termine chaque assignation par `;` si les deux lignes
       * sont sur la même ligne (sinon erreur de syntaxe).
       */
      function normalizeApiKey(raw) {
        let k = raw == null ? "" : String(raw).trim().replace(/\s/g, "");
        if (k.indexOf("sb_publishedable_") === 0) {
          console.warn(
            "Goëlo Rides : faute de frappe dans la clé — « sb_publishedable_ » n’existe pas. " +
              "Le bon préfixe Supabase est « sb_publishable_ » (publishable, sans « ed »)."
          );
        }
        return k;
      }
      function getSupabaseConfig() {
        const url =
          typeof window !== "undefined"
            ? String(window.GOELO_SUPABASE_URL || "")
                .trim()
                .replace(/\s/g, "")
            : "";
        const anonKey =
          typeof window !== "undefined" ? normalizeApiKey(window.GOELO_SUPABASE_ANON_KEY) : "";
        return { url: url, anonKey: anonKey };
      }
      function isSupabaseEnabled() {
        const c = getSupabaseConfig();
        return !!(c.url && c.anonKey);
      }
      (function warnSupabaseHalfConfig() {
        const c = getSupabaseConfig();
        if (typeof window !== "undefined" && c.url && !c.anonKey) {
          console.warn(
            "Goëlo Rides : GOELO_SUPABASE_URL est défini mais GOELO_SUPABASE_ANON_KEY est vide — " +
              "inscriptions en localStorage uniquement. Colle la clé anon (JWT eyJ…) ou retire aussi l’URL " +
              "(voir supabase/SUPABASE.md)."
          );
        }
      })();
      const supabaseNamesByRoute = {};
      const supabaseWaitlistByRoute = {};
      let registeredRouteIdsCache = { email: "", routes: [] };
      let emailSupabaseDebounce = null;
      /** Dernier échec transport / HTTP pour message utilisateur (codes 36–39). Réinitialisé à chaque appel RPC. */
      let goeloLastRpcFailure = null;

      function goeloFormatDbFailureAlert(code, httpStatus, fnName, failBody) {
        if (code === 41) {
          return (
            "Impossible d’enregistrer dans la mémoire de ce navigateur (quota plein, navigation privée ou blocage).\n\n" +
            "Erreur 41 — contacter l’administrateur ou réessaie après avoir libéré de l’espace."
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
          const b = String(failBody);
          return (
            "Inscription impossible : la base Supabase du site n’est pas alignée avec le formulaire actuel (fonction RPC ou colonnes manquantes — HTTP 400).\n\n" +
            "Pour l’administrateur : sur ce projet Supabase, exécuter dans l’ordre les migrations du dépôt :\n" +
            "• supabase/migrations/20250623120000_signups_cyclist_level.sql\n" +
            "• supabase/migrations/20250624120000_signups_participant_city.sql\n\n" +
            "(ou `supabase db push` depuis la machine de développement), puis réessayer.\n\n" +
            "Détail technique : " +
            (b.length > 320 ? b.slice(0, 320) + "…" : b)
          );
        }
        if (code === 37 && httpStatus === 404 && fnName === "route_delete") {
          return (
            "La suppression n’est pas encore activée sur ton projet Supabase : la fonction RPC « route_delete » est introuvable (HTTP 404).\n\n" +
            "Dans le dashboard Supabase → SQL Editor, ouvre et exécute le fichier :\n" +
            "supabase/migrations/20250610120000_route_delete.sql\n\n" +
            "Ensuite réessaie la suppression."
          );
        }
        var ref = "Erreur " + code;
        if (httpStatus) ref += " (HTTP " + httpStatus + ")";
        ref += " — contacter l’administrateur en communiquant ce code exact.";
        return (
          "La demande n’a pas pu être enregistrée sur le serveur de données (réseau, serveur occupé ou refus).\n\n" +
          ref +
          "\n\nRéessaie plus tard si la connexion semble instable."
        );
      }

      const GOELO_ADMIN_SESSION_KEY = "goelo_admin_auth_v1";

      function decodeJwtPayload(accessToken) {
        if (!accessToken || typeof accessToken !== "string") return null;
        const parts = accessToken.split(".");
        if (parts.length < 2) return null;
        try {
          let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
          return JSON.parse(atob(b64 + pad));
        } catch (err) {
          void err;
          return null;
        }
      }

      function jwtIsGoeloAdmin(accessToken) {
        const p = decodeJwtPayload(accessToken);
        if (!p || typeof p !== "object") return false;
        const am = p.app_metadata;
        if (!am || typeof am !== "object") return false;
        const v = am.goelo_admin;
        return v === true || v === "true" || v === 1 || v === "1";
      }

      function getAdminSession() {
        try {
          const raw = sessionStorage.getItem(GOELO_ADMIN_SESSION_KEY);
          if (!raw) return null;
          const o = JSON.parse(raw);
          if (!o || typeof o !== "object" || !o.access_token) return null;
          return o;
        } catch (e) {
          void e;
          return null;
        }
      }

      function saveAdminSession(tok) {
        if (!tok || !tok.access_token) return;
        const sec = typeof tok.expires_in === "number" && tok.expires_in > 0 ? tok.expires_in : 3600;
        const expMs = Date.now() + sec * 1000;
        sessionStorage.setItem(
          GOELO_ADMIN_SESSION_KEY,
          JSON.stringify({
            access_token: tok.access_token,
            refresh_token: tok.refresh_token != null ? String(tok.refresh_token) : "",
            expires_at_ms: expMs
          })
        );
      }

      function clearAdminSession() {
        try {
          sessionStorage.removeItem(GOELO_ADMIN_SESSION_KEY);
        } catch (e) {
          void e;
        }
      }

      function isAdminSessionUsable() {
        const s = getAdminSession();
        if (!s || !s.access_token) return false;
        const exp = s.expires_at_ms || 0;
        if (Date.now() >= exp - 8000) return false;
        return jwtIsGoeloAdmin(s.access_token);
      }

      async function supabasePasswordGrant(email, password) {
        const { url, anonKey } = getSupabaseConfig();
        if (!url || !anonKey) return null;
        const base = url.replace(/\/?$/, "");
        let res;
        try {
          res = await fetch(base + "/auth/v1/token?grant_type=password", {
            method: "POST",
            headers: {
              apikey: anonKey,
              Authorization: "Bearer " + anonKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ email: email, password: password })
          });
        } catch (err) {
          void err;
          return { ok: false, message: "Réseau indisponible ou CORS bloqué." };
        }
        let body;
        try {
          body = await res.json();
        } catch (e) {
          void e;
          return { ok: false, message: "Réponse du serveur illisible." };
        }
        if (!res.ok) {
          const msg =
            (body && (body.error_description || body.msg || body.message)) ||
            (body && body.error ? String(body.error) : "") ||
            "HTTP " + res.status;
          try {
            console.warn("Goëlo admin login Auth:", res.status, body && typeof body === "object" ? body : body);
          } catch (e) {
            void e;
          }
          return { ok: false, message: String(msg).trim() || "Connexion refusée." };
        }
        if (!body.access_token) {
          return { ok: false, message: "Réponse sans jeton de session." };
        }
        return {
          ok: true,
          access_token: body.access_token,
          refresh_token: body.refresh_token != null ? String(body.refresh_token) : "",
          expires_in: body.expires_in
        };
      }

      /** Messages GoTrue pour la modale admin « Gérer les sorties » (grant_type=password). */
      function humanizeAdminPasswordGrantError(rawMsg) {
        const s = String(rawMsg || "").trim();
        const low = s.toLowerCase();
        if (
          low.includes("email not confirmed") ||
          low.includes("email_not_confirmed") ||
          low.includes("not confirmed") ||
          (/confirm|vérifi/.test(s) && /email|mail|address|adresse/i.test(s))
        ) {
          return (
            "E-mail non confirmé (ou confirmation requise) : ouvre le lien reçu à l’inscription, vérifie les spams, puis réessaie."
          );
        }
        if (
          low.includes("invalid login credentials") ||
          low === "invalid_grant" ||
          low.includes("invalid credentials")
        ) {
          const base =
            "Supabase refuse la connexion. Vérifie dans ce projet (même URL que le site) : Authentication → Users — " +
            "l’e-mail existe, le mot de passe est celui du compte Auth, et l’e-mail est confirmé. " +
            "Si la confirmation est obligatoire, un compte non confirmé renvoie souvent la même erreur qu’un mauvais mot de passe. " +
            "Copie-colle l’e-mail **tel qu’il apparaît** dans la liste Users (Gmail : avec ou sans point, ce n’est pas la même chaîne pour Supabase).";
          if (s && s !== "invalid_grant" && s.length < 200) {
            return base + " Détail API : " + s + ".";
          }
          return base;
        }
        if (s.length > 0 && s.length < 220) return s;
        return "E-mail ou mot de passe incorrect.";
      }

      /**
       * @returns {Promise<{ email: string, hint: null } | { email: null, hint: 'empty'|'alias'|'rpc' }>}
       */
      async function resolveAdminEmailForLogin(loginRaw) {
        const raw = (loginRaw || "").trim();
        if (!raw) return { email: null, hint: "empty" };
        if (raw.indexOf("@") !== -1) return { email: raw.toLowerCase(), hint: null };
        const data = await supabaseRpc("goelo_admin_resolve_login", { p_raw: raw });
        if (data && data.ok === true && data.email) {
          return { email: String(data.email).trim().toLowerCase(), hint: null };
        }
        if (data && data.ok === false && data.error === "not_found") {
          return { email: null, hint: "alias" };
        }
        return { email: null, hint: "rpc" };
      }

      async function supabaseRpc(fnName, payload, rpcOpts) {
        rpcOpts = rpcOpts || {};
        goeloLastRpcFailure = null;
        const { url, anonKey } = getSupabaseConfig();
        if (!url || !anonKey) return null;
        if (url.indexOf("xxxxxxxx.supabase.co") !== -1) {
          console.warn(
            "Goëlo Rides : GOELO_SUPABASE_URL contient encore l’exemple « xxxxxxxx » — mets ton vrai identifiant projet " +
              "(ex. https://abcd1234xyz.supabase.co depuis Settings → API)."
          );
          return null;
        }
        const base = url.replace(/\/?$/, "");
        const bearer =
          rpcOpts && rpcOpts.accessToken && String(rpcOpts.accessToken).trim()
            ? String(rpcOpts.accessToken).trim()
            : anonKey;
        let res;
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
          let errTxt = "";
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
        const ct = res.headers.get("content-type") || "";
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

      async function fetchHiddenBuiltinIdsFromSupabase() {
        if (!isSupabaseEnabled()) return [];
        const raw = await supabaseRpc("goelo_hidden_builtin_ids", {});
        if (raw == null) return [];
        if (Array.isArray(raw)) {
          return raw.map(function (x) { return String(x).trim(); }).filter(Boolean);
        }
        return [];
      }

      async function refreshSupabaseNames() {
        if (!isSupabaseEnabled()) return;
        const data = await supabaseRpc("signup_list_all_names", {});
        if (!data || typeof data !== "object") return;
        Object.keys(supabaseNamesByRoute).forEach(function (k) {
          delete supabaseNamesByRoute[k];
        });
        Object.keys(supabaseWaitlistByRoute).forEach(function (k) {
          delete supabaseWaitlistByRoute[k];
        });
        Object.keys(data).forEach(function (id) {
          const v = data[id];
          if (Array.isArray(v)) {
            supabaseNamesByRoute[id] = v.map(normalizeParticipantEntryRpc).filter(function (r) {
              return r.pseudo;
            });
            supabaseWaitlistByRoute[id] = [];
          } else if (v && typeof v === "object") {
            const p = v.participants;
            const w = v.waitlist;
            supabaseNamesByRoute[id] = Array.isArray(p)
              ? p.map(normalizeParticipantEntryRpc).filter(function (r) {
                  return r.pseudo;
                })
              : [];
            supabaseWaitlistByRoute[id] = Array.isArray(w)
              ? w.map(normalizeParticipantEntryRpc).filter(function (r) {
                  return r.pseudo;
                })
              : [];
          } else {
            supabaseNamesByRoute[id] = [];
            supabaseWaitlistByRoute[id] = [];
          }
        });
      }

      async function refreshRegisteredRoutesCache(emailRaw) {
        if (!isSupabaseEnabled()) return;
        const e = (emailRaw || "").trim().toLowerCase();
        if (!e) {
          registeredRouteIdsCache = { email: "", routes: [] };
          return;
        }
        const data = await supabaseRpc("signup_list_registered_routes", { p_email: e });
        const routes = data && data.routes;
        registeredRouteIdsCache = {
          email: e,
          routes: Array.isArray(routes) ? routes.map(function (r) { return String(r); }) : []
        };
      }

      const LOCAL_SIGNUPS_KEY = "goeloRides_inscriptions_v1";

      let participantsByRoute = {};
      let localSignupsByRoute = {};
      let modalRouteRef = null;
      let showRouteHandler = null;

      const ROUTES_BUILTIN = [
        {
          id: "falaises",
          file: "La Route des Falaises.gpx",
          color: "#e8e8e8",
          casingColor: "#4b5563",
          name: "Groupe Blanc",
          track: "La Route des Falaises",
          pace: "15–18 km/h",
          levelClass: "level-blanc",
          levelLabel: "Découverte",
          vibe: "Convivial",
          shortDesc: "Falaises et villages côtiers · rythme tranquille",
          depart: {
            day: "7",
            month: "JUILLET",
            year: "2026",
            weekday: "Mar",
            dateLabel: "7 juillet 2026 · 8h30"
          },
          cities: [
            { name: "Saint-Quay-Portrieux", lat: 48.6539, lon: -2.8384, start: true },
            { name: "Plouha", lat: 48.6728, lon: -2.903 },
            { name: "Bréhec", lat: 48.7276, lon: -2.9489 },
            { name: "Binic", lat: 48.6077, lon: -2.8296 }
          ]
        },
        {
          id: "brehec",
          file: "Bréhec.gpx",
          color: "#2e7d52",
          casingColor: "#14532d",
          name: "Groupe Vert",
          track: "Vers Bréhec",
          pace: "18–22 km/h",
          levelClass: "level-vert",
          levelLabel: "Intermédiaire",
          vibe: "Convivial",
          shortDesc: "Littoral et Bréhec · rythme régulier sans pression",
          depart: {
            day: "21",
            month: "JUILLET",
            year: "2026",
            weekday: "Mar",
            dateLabel: "21 juillet 2026 · 8h30"
          },
          cities: [
            { name: "Saint-Quay-Portrieux", lat: 48.6539, lon: -2.8384, start: true },
            { name: "Plouha", lat: 48.6728, lon: -2.903 },
            { name: "Bréhec", lat: 48.7276, lon: -2.9489 },
            { name: "Binic", lat: 48.6077, lon: -2.8296 }
          ]
        },
        {
          id: "boucle",
          file: "La Grande Boucle du Goëlo.gpx",
          color: "#2563eb",
          name: "Groupe Bleu",
          track: "La Grande Boucle du Goëlo",
          pace: "22–26 km/h",
          levelClass: "level-bleu",
          levelLabel: "Confirmé",
          vibe: "Rouleur",
          shortDesc: "Grande boucle du Goëlo · parcours long et soutenu",
          depart: {
            day: "14",
            month: "JUILLET",
            year: "2026",
            weekday: "Mar",
            dateLabel: "14 juillet 2026 · 8h30"
          },
          cities: [
            { name: "Saint-Quay-Portrieux", lat: 48.6536, lon: -2.8353, start: true },
            { name: "Lantic", lat: 48.5976, lon: -2.899 },
            { name: "Plélo", lat: 48.5333, lon: -2.932 },
            { name: "Goudelin", lat: 48.6025, lon: -3.0194 },
            { name: "Pléguien", lat: 48.6218, lon: -2.9349 },
            { name: "Binic", lat: 48.6077, lon: -2.8296 }
          ]
        }
      ];

      var serverHiddenBuiltinIds = [];

      function mergeHiddenBuiltinIdsSet() {
        const hide = {};
        serverHiddenBuiltinIds.forEach(function (id) {
          hide[String(id).trim()] = true;
        });
        if (
          typeof window !== "undefined" &&
          window.GOELO_SKIP_BUILTIN_IDS &&
          Array.isArray(window.GOELO_SKIP_BUILTIN_IDS)
        ) {
          window.GOELO_SKIP_BUILTIN_IDS.forEach(function (id) {
            hide[String(id).trim()] = true;
          });
        }
        return hide;
      }

      /** Parcours intégrés affichés sur le site (hors liste serveur + option window.GOELO_SKIP_BUILTIN_IDS). */
      function builtinsVisibleOnSite() {
        const hide = mergeHiddenBuiltinIdsSet();
        return ROUTES_BUILTIN.filter(function (r) {
          return !hide[String(r.id)];
        });
      }

      function routeVisibleOnPublicSite(route) {
        if (!route || !route.id) return false;
        return !mergeHiddenBuiltinIdsSet()[String(route.id)];
      }

      function dbRowToRoute(row) {
        const fc = row && row.front_config && typeof row.front_config === "object" ? row.front_config : {};
        const so = row.sort_order;
        return {
          id: row.id,
          file: String(fc.file || "").trim(),
          embeddedPoints: Array.isArray(fc.embeddedPoints) ? fc.embeddedPoints : undefined,
          raceType: fc.raceType || "",
          coverImageDataUrl: typeof fc.coverImageDataUrl === "string" ? fc.coverImageDataUrl : "",
          color: fc.color || "#3d8b8b",
          casingColor: fc.casingColor || "#2d6b6b",
          name: row.group_label || "Sortie",
          track: row.track_name,
          pace: row.pace_label || "—",
          levelClass: fc.levelClass || "level-bleu",
          levelLabel: fc.levelLabel || (row.group_label || "—"),
          vibe: fc.vibe || "",
          shortDesc: fc.shortDesc || "",
          rideLeader:
            typeof fc.rideLeader === "string" && fc.rideLeader.trim()
              ? fc.rideLeader.trim()
              : typeof fc.ride_leader === "string" && fc.ride_leader.trim()
                ? fc.ride_leader.trim()
                : "",
          meetPlace:
            typeof fc.meetPlace === "string" && fc.meetPlace.trim() ? fc.meetPlace.trim() : "",
          meetPlaceDetail:
            typeof fc.meetPlaceDetail === "string" && fc.meetPlaceDetail.trim()
              ? fc.meetPlaceDetail.trim()
              : "",
          estimatedDurationHm:
            typeof fc.estimatedDurationHm === "string" && fc.estimatedDurationHm.trim()
              ? String(fc.estimatedDurationHm).trim()
              : "",
          estimatedDurationMinutes: (function () {
            if (typeof fc.estimatedDurationMinutes === "number" && Number.isFinite(fc.estimatedDurationMinutes)) {
              return Math.max(0, Math.round(fc.estimatedDurationMinutes));
            }
            if (typeof fc.estimatedDurationHm === "string" && fc.estimatedDurationHm.trim()) {
              const p = parseDurationInputToStore(fc.estimatedDurationHm);
              return p ? p.minutes : null;
            }
            return null;
          })(),
          maxParticipants:
            typeof fc.maxParticipants === "number" && Number.isFinite(fc.maxParticipants) && fc.maxParticipants > 0
              ? Math.round(fc.maxParticipants)
              : typeof fc.maxParticipants === "string" && String(fc.maxParticipants).trim()
                ? Math.max(0, parseInt(String(fc.maxParticipants).replace(/\D/g, ""), 10) || 0) || null
                : null,
          sortieStatus: typeof fc.sortieStatus === "string" && fc.sortieStatus.trim() ? fc.sortieStatus.trim() : "open",
          visibility: typeof fc.visibility === "string" && fc.visibility.trim() ? fc.visibility.trim() : "public",
          rideDateIso: typeof fc.rideDateIso === "string" ? fc.rideDateIso : "",
          rideTime: typeof fc.rideTime === "string" ? fc.rideTime : "",
          sortOrder: typeof so === "number" && Number.isFinite(so) ? so : 40,
          depart: fc.depart && typeof fc.depart === "object"
            ? fc.depart
            : {
              day: "",
              month: "",
              year: "2026",
              weekday: "",
              dateLabel: String(fc.dateLabel || row.track_name || "")
            },
          cities: Array.isArray(fc.cities) && fc.cities.length ? fc.cities : [
            { name: "Saint-Quay-Portrieux", lat: 48.6536, lon: -2.8353, start: true }
          ],
          routeKind: row.route_kind || row.routeKind || "custom"
        };
      }

      /** PostgREST renvoie souvent un tableau ; certaines configs renvoient une chaîne JSON ou un wrapper. */
      function normalizeRoutesListRows(data) {
        if (data == null) return [];
        if (Array.isArray(data)) return data;
        if (typeof data === "string") {
          try {
            const p = JSON.parse(data);
            return Array.isArray(p) ? p : [];
          } catch (err) {
            void err;
            return [];
          }
        }
        if (typeof data === "object" && Array.isArray(data.routes)) return data.routes;
        return [];
      }

      async function fetchCustomRoutesFromSupabase(opts) {
        if (!isSupabaseEnabled()) return [];
        const forAdmin =
          opts && opts.forAdminEdit && isAdminSessionUsable();
        const adm = forAdmin ? getAdminSession() : null;
        const raw = await supabaseRpc(
          "routes_list",
          forAdmin ? { p_filter: { includeNonPublic: true } } : { p_filter: {} },
          adm && adm.access_token ? { accessToken: adm.access_token } : undefined
        );
        const rows = normalizeRoutesListRows(raw);
        const builtIds = {};
        ROUTES_BUILTIN.forEach(function (r) {
          builtIds[r.id] = true;
        });
        const out = [];
        rows.forEach(function (row) {
          if (!row || !row.id || builtIds[row.id]) return;
          const rk = row.route_kind != null ? row.route_kind : row.routeKind;
          if (rk !== "custom") return;
          out.push(dbRowToRoute(row));
        });
        return out;
      }

      /** Alimente loadedRoutesCache avec les sorties custom (pour la liste « Corriger une sortie »). */
      async function hydrateCustomRoutesForToolbarEdit() {
        if (!isSupabaseEnabled() || !document.getElementById("new-route-edit-select")) return;
        const customs = await fetchCustomRoutesFromSupabase({ forAdminEdit: true });
        if (!customs.length) return;
        const results = await Promise.all(
          customs.map(async function (cfg) {
            const profile = await loadRouteProfile(cfg);
            if (!profile) return null;
            return Object.assign({}, cfg, { profile: profile });
          })
        );
        results.forEach(function (r) {
          if (!r) return;
          const idx = loadedRoutesCache.findIndex(function (x) {
            return x.id === r.id;
          });
          if (idx >= 0) loadedRoutesCache[idx] = r;
          else loadedRoutesCache.push(r);
        });
      }

      function formatKm(km) {
        return km.toFixed(1).replace(".", ",") + " km";
      }

      function escapeHtml(s) {
        return String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;");
      }

      function sanitizeSignupCyclistLevel(raw) {
        const c = String(raw || "").trim().toLowerCase();
        if (c === "debutant" || c === "intermediaire" || c === "confirme") return c;
        return "";
      }

      function sanitizeParticipantCity(raw) {
        let s = String(raw || "")
          .replace(/[\u0000-\u001F\u007F]/g, "")
          .trim()
          .replace(/\s+/g, " ");
        if (s.length > 80) s = s.slice(0, 80);
        return s;
      }

      function normalizeParticipantEntryRpc(x) {
        if (x == null) return { pseudo: "", cyclist_level: "", city: "" };
        if (typeof x === "string") {
          const p = String(x).trim();
          return { pseudo: p, cyclist_level: "", city: "" };
        }
        if (typeof x === "object") {
          const p = String(x.pseudo != null ? x.pseudo : x.name != null ? x.name : "").trim();
          const cl = sanitizeSignupCyclistLevel(x.cyclist_level);
          const cy = sanitizeParticipantCity(x.city != null ? x.city : x.participant_city);
          return { pseudo: p, cyclist_level: cl, city: cy };
        }
        return { pseudo: "", cyclist_level: "", city: "" };
      }

      function cyclistLevelLabelFrModal(code) {
        const c = String(code || "").trim().toLowerCase();
        if (c === "debutant") return "Débutant";
        if (c === "intermediaire") return "Intermédiaire";
        if (c === "confirme") return "Confirmé";
        return "";
      }

      function formatMinutesToHm(totalMin) {
        const h = Math.floor(totalMin / 60);
        const mm = totalMin % 60;
        return String(h) + ":" + String(mm).padStart(2, "0");
      }

      /** « H:MM » ou plage « 2:30 - 3:00 ». */
      function parseSingleHmFragment(frag) {
        const m = String(frag || "")
          .trim()
          .match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
        if (!m) return null;
        const hh = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm < 0 || mm > 59 || hh > 36) return null;
        const minutes = hh * 60 + mm;
        if (minutes <= 0) return null;
        return { minutes: minutes, hm: formatMinutesToHm(minutes) };
      }

      function parseDurationInputToStore(raw) {
        const s = String(raw || "").trim();
        if (!s) return null;
        if (/^\d+$/.test(s)) {
          const n = parseInt(s, 10);
          if (!Number.isFinite(n) || n <= 0 || n > 36 * 60) return null;
          return { minutes: n, hm: formatMinutesToHm(n) };
        }
        const rm = s.match(
          /^(\d{1,2}\s*:\s*\d{1,2})\s*[-–—]\s*(\d{1,2}\s*:\s*\d{1,2})$/
        );
        if (rm) {
          const a = parseSingleHmFragment(rm[1]);
          const b = parseSingleHmFragment(rm[2]);
          if (!a || !b) return null;
          if (b.minutes < a.minutes) return null;
          if (b.minutes === a.minutes) {
            return { minutes: a.minutes, hm: a.hm };
          }
          const avg = Math.round((a.minutes + b.minutes) / 2);
          return {
            minutes: avg,
            hm: a.hm + " - " + b.hm,
            isRange: true,
            minMinutes: a.minutes,
            maxMinutes: b.minutes
          };
        }
        const one = parseSingleHmFragment(s);
        if (one) return { minutes: one.minutes, hm: one.hm };
        return null;
      }

      function routeEffectiveDurationMinutes(route) {
        let min =
          route && route.estimatedDurationMinutes != null && Number.isFinite(Number(route.estimatedDurationMinutes))
            ? Math.round(Number(route.estimatedDurationMinutes))
            : 0;
        const hmRaw =
          route && typeof route.estimatedDurationHm === "string" && route.estimatedDurationHm.trim()
            ? String(route.estimatedDurationHm).trim()
            : "";
        if (hmRaw) {
          const p = parseDurationInputToStore(hmRaw);
          if (p) min = p.minutes;
        }
        return min > 0 ? min : 0;
      }

      function buildCourseDetailsHtml(route) {
        const prof = route.profile;
        const kmLine = prof ? formatKm(prof.totalKm) : "— (chargement de la trace…)";
        const isBlanc = route.id === "falaises";
        const isVert = route.id === "brehec";
        const pacePhil =
          isBlanc
            ? "Allure visée sur le plat : <strong>15–18 km/h</strong> pour que chacun puisse suivre. " +
              "Merci de ne pas augmenter le rythme sans l’accord du groupe : on roule ensemble."
            : isVert
            ? "Allure visée sur le plat : <strong>18–22 km/h</strong>, sans « sprints » sauf accord du groupe. " +
              "On garde un rythme régulier pour que personne ne se retrouve seul."
            : "Allure visée sur le plat : <strong>22–26 km/h</strong>, parcours plus long. " +
              "Relais et attentes aux points convenus pour garder le groupe cohérent.";
        const philo =
          isBlanc
            ? "La philosophie du <strong>Groupe Blanc</strong> : on roule à un rythme raisonnable pour que tout le monde prenne du plaisir. " +
              "On part ensemble, on roule ensemble, on rentre ensemble. C’est une sortie <strong>sociale et conviviale</strong>."
            : isVert
            ? "La philosophie du <strong>Groupe Vert</strong> : un cran au-dessus du Blanc, tout en gardant l’esprit <strong>convivial</strong>. " +
              "On roule proprement, on veille les uns sur les autres, on profite du paysage côtier jusqu’à Bréhec."
            : "La philosophie du <strong>Groupe Bleu</strong> : rythme soutenu mais respectueux du peloton. " +
              "On s’entraide, on communique, on garde l’esprit d’équipe sur toute la sortie.";

        return (
          "<h3 class=\"signup-modal-course-title\">Détail sortie</h3>" +
          "<p><strong>Parcours</strong> · " +
          escapeHtml(route.track) +
          "</p>" +
          "<p><strong>Groupe</strong> · " +
          escapeHtml(route.name) +
          " · " +
          escapeHtml(route.pace) +
          "</p>" +
          (route.rideLeader && String(route.rideLeader).trim()
            ? "<p><strong>Capitaine · Team Rider</strong> · " + escapeHtml(String(route.rideLeader).trim()) + "</p>"
            : "") +
          (route.meetPlaceDetail && String(route.meetPlaceDetail).trim()
            ? "<p><strong>Départ précis</strong> · " + escapeHtml(String(route.meetPlaceDetail).trim()) + "</p>"
            : "") +
          (function () {
            const hmRaw =
              route && typeof route.estimatedDurationHm === "string" && route.estimatedDurationHm.trim()
                ? String(route.estimatedDurationHm).trim()
                : "";
            if (hmRaw) {
              const pr = parseDurationInputToStore(hmRaw);
              if (pr) {
                if (pr.isRange) {
                  return "<p><strong>Durée estimée</strong> · " + escapeHtml("Environ " + pr.hm) + "</p>";
                }
                const min = pr.minutes;
                const line =
                  min < 60
                    ? "Environ " + min + " min"
                    : "Environ " +
                      Math.floor(min / 60) +
                      " h " +
                      String(min % 60).padStart(2, "0") +
                      " (≈ " +
                      formatMinutesToHm(min) +
                      ")";
                return "<p><strong>Durée estimée</strong> · " + escapeHtml(line) + "</p>";
              }
            }
            const min = routeEffectiveDurationMinutes(route);
            if (min <= 0) return "";
            const line =
              min < 60
                ? "Environ " + min + " min"
                : "Environ " +
                  Math.floor(min / 60) +
                  " h " +
                  String(min % 60).padStart(2, "0") +
                  " (≈ " +
                  formatMinutesToHm(min) +
                  ")";
            return "<p><strong>Durée estimée</strong> · " + escapeHtml(line) + "</p>";
          })() +
          "<p><strong>Date</strong> · " +
          escapeHtml(route.depart.dateLabel) +
          "</p>" +
          "<p><strong>Distance (trace GPX)</strong> · " +
          kmLine +
          "</p>" +
          "<p><strong>Point de départ</strong> · " +
          escapeHtml(SHARED.meetParking) +
          "</p>" +
          "<p><strong>Rendez-vous</strong> · " +
          escapeHtml(SHARED.meetRv) +
          " · <strong>Départ roulant</strong> · " +
          escapeHtml(SHARED.time) +
          "</p>" +
          "<h3 class=\"signup-modal-course-title\">À propos</h3>" +
          "<p class=\"course-warn\">Merci de bien lire la description avant de t’inscrire.</p>" +
          "<p>La sortie pourra être <strong>annulée ou décalée</strong> selon les conditions météorologiques. " +
          "En cas de doute, suis les messages sur " +
          "<a href=\"https://www.instagram.com/goelo.rides/\" target=\"_blank\" rel=\"noopener noreferrer\">@goelo.rides</a> " +
          "ou contacte-nous par e-mail.</p>" +
          "<p>" +
          pacePhil +
          "</p>" +
          "<p>" +
          philo +
          "</p>" +
          "<p class=\"course-sub\">En montée</p>" +
          "<p>Chacun roule à son rythme ; <strong>regroupement en haut</strong> des bosses pour repartir groupés.</p>" +
          "<p class=\"course-sub\">Préparation et autonomie</p>" +
          "<ul>" +
          "<li>Aie la <strong>trace GPS</strong> du parcours sur ton téléphone ou GPS pour pouvoir rentrer en autonomie en cas de problème.</li>" +
          "<li>Sois autonome : <strong>outillage</strong>, chambre à air / patins, <strong>alimentation</strong> et eau adaptées à la durée.</li>" +
          "</ul>" +
          "<p class=\"course-sub\">Consignes de sécurité</p>" +
          "<ul>" +
          "<li>Participation réservée aux <strong>personnes majeures</strong> ; les <strong>mineur·e·s</strong> ne peuvent pas prendre part à la sortie.</li>" +
          "<li>Sur routes larges, roulez en <strong>file à deux</strong> au maximum ; en file indienne sur les portions étroites.</li>" +
          "<li><strong>Dépassements par la gauche</strong> uniquement ; annonce clairement ton intention avant de passer.</li>" +
          "<li>Signale les obstacles (poteaux, nids-de-poule, dos-d’âne…).</li>" +
          "<li>Garde ta ligne et signale tout changement de position utile au groupe.</li>" +
          "</ul>" +
          "<p class=\"course-sub\">Matériel</p>" +
          "<ul>" +
          "<li>Respect du <strong>code de la route</strong> et du bon sens collectif. Comportement dangereux = exclusion possible de la sortie.</li>" +
          "<li><strong>Casque obligatoire</strong> (quelle que soit la météo).</li>" +
          "<li><strong>Éclairage</strong> et <strong>avertisseur</strong> conformes si les conditions l’exigent.</li>" +
          "<li>Prolongateurs de cintre type « clip-on » : <strong>interdits</strong> sur la sortie.</li>" +
          "<li>Prévois l’équipement adapté à la météo (couche chaude, coupe-vent, protection pluie…).</li>" +
          "</ul>" +
          "<p class=\"course-sub\">Inscription</p>" +
          "<p><strong>Phase de lancement — cadre et assurance</strong> : Goëlo Rides n’a pas encore de <strong>structure associative</strong> ni d’<strong>assurance collective</strong> pour encadrer les sorties. Elles se déroulent dans un cadre <strong>informel</strong> : chaque participant·e reste <strong>responsable</strong> de sa personne, de son matériel et des risques liés à la route. <strong>Dès qu’une association sera créée</strong> (statuts, éventuelle adhésion et assurance), nous mettrons à jour les fiches sorties et la page <a href=\"infos-pratiques.html\">Infos pratiques</a> pour que tout soit <strong>clair et à jour</strong>.</p>" +
          "<p><strong>Pas de cotisation annuelle</strong> pour l’instant. L’inscription sur cette page ou par e-mail sert à <strong>anticiper le nombre de participants</strong>. " +
          "Préviens-nous si tu ne peux finalement pas venir.</p>" +
          "<p class=\"signup-modal-course-footer\">" +
          "Bonne sortie · Goëlo Rides · " +
          escapeHtml(SHARED.region) +
          "</p>"
        );
      }

      function parseParticipantsCsv(text) {
        const out = { falaises: [], brehec: [], boucle: [] };
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) return out;
        const header = lines[0].toLowerCase().split(",");
        const routeIdx = header.findIndex(function (h) { return h.includes("route"); });
        const nameIdx = header.findIndex(function (h) { return h.includes("prenom") || h.includes("prénom") || h.includes("nom"); });
        if (routeIdx < 0 || nameIdx < 0) return out;
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",");
          const routeId = (cols[routeIdx] || "").trim().toLowerCase();
          const name = (cols[nameIdx] || "").trim();
          if (!name || !out[routeId]) continue;
          if (out[routeId].indexOf(name) === -1) out[routeId].push(name);
        }
        return out;
      }

      function mergeParticipants(base, extra) {
        const merged = {};
        Object.keys(base || {}).forEach(function (id) {
          merged[id] = (base[id] || []).slice();
        });
        Object.keys(extra || {}).forEach(function (id) {
          if (!merged[id]) merged[id] = [];
          (extra[id] || []).forEach(function (name) {
            if (merged[id].indexOf(name) === -1) merged[id].push(name);
          });
        });
        return merged;
      }

      async function loadParticipants() {
        let data = { falaises: [], brehec: [], boucle: [] };
        try {
          const res = await fetch("participants.json");
          if (res.ok) data = await res.json();
        } catch { /* ignore */ }
        if (SIGNUP.participantsCsvUrl) {
          try {
            const csvRes = await fetch(SIGNUP.participantsCsvUrl);
            if (csvRes.ok) {
              data = mergeParticipants(data, parseParticipantsCsv(await csvRes.text()));
            }
          } catch { /* ignore */ }
        }
        participantsByRoute = { falaises: [], brehec: [], boucle: [] };
        Object.keys(data).forEach(function (k) {
          participantsByRoute[k] = Array.isArray(data[k]) ? data[k].slice() : [];
        });
      }

      function loadLocalSignups() {
        try {
          const raw = localStorage.getItem(LOCAL_SIGNUPS_KEY);
          if (!raw) return;
          const data = JSON.parse(raw);
          localSignupsByRoute = { falaises: [], brehec: [], boucle: [] };
          Object.keys(data).forEach(function (k) {
            if (Array.isArray(data[k])) localSignupsByRoute[k] = data[k];
          });
        } catch { /* ignore */ }
      }

      function saveLocalSignups() {
        try {
          localStorage.setItem(LOCAL_SIGNUPS_KEY, JSON.stringify(localSignupsByRoute));
          return true;
        } catch {
          return false;
        }
      }

      function getParticipantRows(routeId) {
        const byKey = {};
        (participantsByRoute[routeId] || []).forEach(function (n) {
          const p = String(n).trim();
          if (!p) return;
          const k = p.toLowerCase();
          if (!byKey[k]) byKey[k] = { pseudo: p, cyclist_level: "", city: "" };
        });
        if (isSupabaseEnabled()) {
          (supabaseNamesByRoute[routeId] || []).forEach(function (entry) {
            const r =
              entry && typeof entry === "object" && entry.pseudo != null
                ? {
                    pseudo: String(entry.pseudo).trim(),
                    cyclist_level: sanitizeSignupCyclistLevel(entry.cyclist_level),
                    city: sanitizeParticipantCity(entry.city != null ? entry.city : entry.participant_city)
                  }
                : { pseudo: String(entry || "").trim(), cyclist_level: "", city: "" };
            if (!r.pseudo) return;
            byKey[r.pseudo.toLowerCase()] = r;
          });
        } else {
          (localSignupsByRoute[routeId] || []).forEach(function (e) {
            const p = (e.pseudo || "").trim();
            if (!p) return;
            const k = p.toLowerCase();
            byKey[k] = {
              pseudo: p,
              cyclist_level: sanitizeSignupCyclistLevel(e.cyclist_level),
              city: sanitizeParticipantCity(e.participant_city || e.city)
            };
          });
        }
        return Object.keys(byKey)
          .sort(function (a, b) {
            return a.localeCompare(b, "fr", { sensitivity: "base" });
          })
          .map(function (k) {
            return byKey[k];
          });
      }

      function getParticipantNames(routeId) {
        return getParticipantRows(routeId).map(function (r) {
          return r.pseudo;
        });
      }

      function getWaitlistRows(routeId) {
        if (!isSupabaseEnabled()) return [];
        return (supabaseWaitlistByRoute[routeId] || [])
          .map(normalizeParticipantEntryRpc)
          .filter(function (r) {
            return r.pseudo;
          });
      }

      function getWaitlistNames(routeId) {
        return getWaitlistRows(routeId).map(function (r) {
          return r.pseudo;
        });
      }

      function isRegisteredForRoute(routeId, email) {
        const norm = (email || "").trim().toLowerCase();
        if (!norm) return false;
        if (isSupabaseEnabled()) {
          if (registeredRouteIdsCache.email !== norm) return false;
          return registeredRouteIdsCache.routes.indexOf(routeId) >= 0;
        }
        return (localSignupsByRoute[routeId] || []).some(function (e) {
          return (e.email || "").trim().toLowerCase() === norm;
        });
      }

      function getLocalSignup(routeId, email) {
        const norm = (email || "").trim().toLowerCase();
        if (!norm) return null;
        return (localSignupsByRoute[routeId] || []).find(function (e) {
          return (e.email || "").trim().toLowerCase() === norm;
        }) || null;
      }

      function getLastStoredEmail() {
        try {
          const last = JSON.parse(localStorage.getItem("goeloRides_last_email") || '""');
          return typeof last === "string" ? last : "";
        } catch {
          return "";
        }
      }

      function renderParticipantsInModal(routeId) {
        const rows = getParticipantRows(routeId);
        const waitRows = getWaitlistRows(routeId);
        const countEl = document.getElementById("modal-participants-count");
        const listEl = document.getElementById("modal-participants-list");
        const emptyEl = document.getElementById("modal-participants-empty");
        const wrapWl = document.getElementById("signup-modal-waitlist-wrap");
        const listWl = document.getElementById("modal-waitlist-list");
        const emptyWl = document.getElementById("modal-waitlist-empty");

        if (countEl) countEl.textContent = String(rows.length);
        if (listEl) {
          listEl.innerHTML = "";
          rows.forEach(function (row) {
            const li = document.createElement("li");
            li.appendChild(document.createTextNode(row.pseudo || ""));
            const lv = cyclistLevelLabelFrModal(row.cyclist_level);
            if (lv) {
              const sp = document.createElement("span");
              sp.className = "modal-participants-level";
              sp.textContent = " · " + lv;
              li.appendChild(sp);
            }
            const cty = String(row.city || "").trim();
            if (cty) {
              const csp = document.createElement("span");
              csp.className = "modal-participants-city";
              csp.textContent = " · " + cty;
              li.appendChild(csp);
            }
            listEl.appendChild(li);
          });
          listEl.classList.toggle("is-hidden", rows.length === 0);
        }
        if (emptyEl) emptyEl.classList.toggle("is-hidden", rows.length > 0);

        if (wrapWl && listWl && emptyWl) {
          const showWl = waitRows.length > 0;
          wrapWl.hidden = !showWl;
          listWl.innerHTML = "";
          waitRows.forEach(function (row) {
            const li = document.createElement("li");
            li.appendChild(document.createTextNode(row.pseudo || ""));
            const lv = cyclistLevelLabelFrModal(row.cyclist_level);
            if (lv) {
              const sp = document.createElement("span");
              sp.className = "modal-participants-level";
              sp.textContent = " · " + lv;
              li.appendChild(sp);
            }
            const cty = String(row.city || "").trim();
            if (cty) {
              const csp = document.createElement("span");
              csp.className = "modal-participants-city";
              csp.textContent = " · " + cty;
              li.appendChild(csp);
            }
            listWl.appendChild(li);
          });
          listWl.classList.toggle("is-hidden", waitRows.length === 0);
          emptyWl.classList.toggle("is-hidden", waitRows.length > 0);
        }
      }

      async function refreshJoinButtons() {
        if (isSupabaseEnabled()) {
          const emailInput = document.getElementById("signup-modal-email");
          const checkEmail =
            emailInput && emailInput.value.trim()
              ? emailInput.value
              : getLastStoredEmail();
          await refreshRegisteredRoutesCache(checkEmail);
        }
        document.querySelectorAll(".btn-je-participe[data-join-route]").forEach(function (btn) {
          const routeId = btn.dataset.joinRoute;
          const emailInput = document.getElementById("signup-modal-email");
          const checkEmail = emailInput && emailInput.value ? emailInput.value : getLastStoredEmail();
          const registered = isRegisteredForRoute(routeId, checkEmail);
          btn.textContent = registered ? "Inscrit·e ✓" : "Je participe !";
          btn.classList.toggle("btn-je-participe--done", registered);
          btn.setAttribute("aria-pressed", registered ? "true" : "false");
          btn.setAttribute("aria-label", registered
            ? "Inscrit·e sur ce parcours — gérer l’inscription"
            : "S’inscrire sur ce parcours");
        });
      }

      function closeSignupModal() {
        const modal = document.getElementById("signup-modal");
        if (modal) {
          modal.hidden = true;
          modal.setAttribute("aria-hidden", "true");
        }
        document.body.style.overflow = "";
        modalRouteRef = null;
      }

      async function fillSignupModal(route) {
        const info = document.getElementById("signup-modal-route");
        const done = document.getElementById("signup-modal-done");
        const registeredActions = document.getElementById("signup-registered-actions");
        const form = document.getElementById("signup-modal-form");
        const pseudoInput = document.getElementById("signup-modal-pseudo");
        const emailInput = document.getElementById("signup-modal-email");
        const mailto = document.getElementById("signup-modal-mailto");
        const title = document.getElementById("signup-modal-title");

        if (emailInput && !emailInput.value) {
          const last = getLastStoredEmail();
          if (last) emailInput.value = last;
        }

        if (isSupabaseEnabled()) {
          const em = (emailInput && emailInput.value.trim()) || getLastStoredEmail();
          await refreshRegisteredRoutesCache(em);
        }

        if (info) {
          info.innerHTML =
            "<strong>" + escapeHtml(route.track) + "</strong><br>" +
            escapeHtml(route.name) + " · " + escapeHtml(route.depart.dateLabel) + "<br>" +
            (route.profile ? formatKm(route.profile.totalKm) + " · " : "") +
            escapeHtml(route.pace) + " · " + escapeHtml(route.levelLabel) + "<br>" +
            escapeHtml(route.shortDesc || "") + "<br>" +
            (route.meetPlaceDetail && String(route.meetPlaceDetail).trim()
              ? escapeHtml(String(route.meetPlaceDetail).trim())
              : escapeHtml(SHARED.meetPlace)) +
            " · " +
            escapeHtml(SHARED.time);
        }

        const courseEl = document.getElementById("signup-modal-course");
        if (courseEl) {
          courseEl.innerHTML = buildCourseDetailsHtml(route);
        }

        if (mailto) {
          const subject = encodeURIComponent("Inscription Goëlo Rides — " + route.track);
          const body = encodeURIComponent(
            "Pseudo :\nE-mail :\nParcours : " + route.track + "\nDate : " + route.depart.dateLabel
          );
          mailto.href =
            "https://mail.google.com/mail/?view=cm&fs=1&to=goelo.rides@gmail.com&su=" +
            subject +
            "&body=" +
            body;
        }

        renderParticipantsInModal(route.id);

        let registered = false;
        if (emailInput && emailInput.value) {
          registered = isRegisteredForRoute(route.id, emailInput.value);
        }

        let welcomePseudo = "";
        let onWaitlist = false;
        if (registered) {
          if (isSupabaseEnabled() && emailInput && emailInput.value) {
            let regData = await supabaseRpc("signup_get_registration", {
              p_route_id: route.id,
              p_email: emailInput.value
            });
            if (Array.isArray(regData) && regData.length) regData = regData[0];
            welcomePseudo = regData && regData.pseudo ? String(regData.pseudo).trim() : "";
            onWaitlist = !!(regData && regData.on_waitlist);
            if (welcomePseudo && pseudoInput && !pseudoInput.value) pseudoInput.value = welcomePseudo;
          } else {
            const entry = getLocalSignup(route.id, emailInput.value);
            welcomePseudo = entry && entry.pseudo ? String(entry.pseudo).trim() : "";
            onWaitlist = !!(entry && entry.waitlist);
            if (entry && pseudoInput && !pseudoInput.value) pseudoInput.value = entry.pseudo || "";
          }
          if (title) title.textContent = onWaitlist ? "Tu es sur la liste d’attente" : "Tu es inscrit·e !";
          if (done) {
            done.textContent = onWaitlist
              ? (welcomePseudo ? welcomePseudo + ", " : "") +
                "Les places du peloton principal sont prises — tu es en liste d’attente. Si un·e cycliste se désinscrit, tu seras promu·e automatiquement."
              : welcomePseudo
                ? welcomePseudo + ", tu es bien inscrit·e sur ce parcours. À bientôt au départ !"
                : "Tu es bien inscrit·e sur ce parcours. À bientôt au départ !";
            done.classList.add("is-visible");
          }
          if (registeredActions) registeredActions.hidden = false;
          if (form) form.style.display = "none";
          if (mailto) mailto.style.display = "none";
        } else {
          if (title) title.textContent = "Je participe !";
          if (done) {
            done.textContent = "";
            done.classList.remove("is-visible");
          }
          if (registeredActions) registeredActions.hidden = true;
          if (form) form.style.display = "";
          if (mailto) mailto.style.display = "";
          const clSel = document.getElementById("signup-modal-cyclist-level");
          if (clSel) {
            clSel.value = "";
            if (window.GoeloAuth && typeof window.GoeloAuth.getCyclistLevelFromSession === "function") {
              const gl = window.GoeloAuth.getCyclistLevelFromSession();
              if (gl && ["debutant", "intermediaire", "confirme"].indexOf(gl) !== -1) {
                clSel.value = gl;
              }
            }
          }
        }
      }

      async function openSignupModal(route) {
        if (!route) return;
        modalRouteRef = route;
        const modal = document.getElementById("signup-modal");
        if (!modal) return;
        await fillSignupModal(route);
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        if (showRouteHandler) {
          try {
            showRouteHandler(route, { scroll: false });
          } catch (err) {
            console.error("showRoute:", err);
          }
        }
        await refreshJoinButtons();
        const dlg = modal.querySelector(".signup-modal-dialog");
        function scrollModalTopAndFocusTitle() {
          if (dlg) dlg.scrollTop = 0;
          const t = document.getElementById("signup-modal-title");
          if (t) {
            t.setAttribute("tabindex", "-1");
            t.focus({ preventScroll: true });
          }
          if (dlg) dlg.scrollTop = 0;
        }
        scrollModalTopAndFocusTitle();
        requestAnimationFrame(scrollModalTopAndFocusTitle);
        setTimeout(scrollModalTopAndFocusTitle, 160);
      }

      /**
       * FormSubmit : POST no-cors vers l’URL classique. Si formsubmit.co renvoie 521 / panne CDN,
       * l’inscription Supabase n’en dépend pas — on logue et on continue sans faire planter la page.
       */
      async function notifySignupByEmail(route, pseudo, email) {
        try {
          if (!SIGNUP.formEmail) return;
          const body = new URLSearchParams({
            pseudo: pseudo,
            email: email,
            parcours: route.track + " · " + route.depart.dateLabel,
            _subject: "Inscription Goëlo Rides — " + route.track,
            _captcha: "false",
            _template: "table",
            _replyto: email,
            _autoresponse: GOELO_FORMSUBMIT_AUTORESPONSE_INSCRIPTION
          });
          await fetch("https://formsubmit.co/" + encodeURIComponent(SIGNUP.formEmail), {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body
          });
        } catch (err) {
          console.warn(
            "Goëlo : notification FormSubmit non envoyée (réseau ou panne côté formsubmit.co, ex. 521). " +
              "L’inscription reste enregistrée.",
            err && err.message ? err.message : err
          );
        }
      }

      async function notifyUnregisterByEmail(route, pseudo, email) {
        try {
          if (!SIGNUP.formEmail) return;
          if (!SIGNUP.formSubmitOnUnregister) return;
          const body = new URLSearchParams({
            pseudo: pseudo || "—",
            email: email,
            parcours: route.track + " · " + route.depart.dateLabel,
            message: "Désinscription du parcours",
            _subject: "Désinscription Goëlo Rides — " + route.track,
            _captcha: "false",
            _template: "table",
            _replyto: email,
            _autoresponse: GOELO_FORMSUBMIT_AUTORESPONSE_DESINSCRIPTION
          });
          await fetch("https://formsubmit.co/" + encodeURIComponent(SIGNUP.formEmail), {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body
          });
        } catch (err) {
          console.warn(
            "Goëlo : notification FormSubmit (désinscription) non envoyée — service indisponible ou réseau.",
            err && err.message ? err.message : err
          );
        }
      }

      async function unregisterForRoute(route, email) {
        const e = (email || "").trim().toLowerCase();
        if (!route || !e) return false;
        if (isSupabaseEnabled()) {
          let data = await supabaseRpc("signup_unregister", { p_route_id: route.id, p_email: e });
          if (Array.isArray(data)) data = data[0];
          if (!data || !data.ok) {
            const fail = goeloLastRpcFailure;
            const code = fail ? fail.code : 40;
            window.alert(
              goeloFormatDbFailureAlert(code, fail && fail.httpStatus, fail && fail.fnName, fail && fail.body)
            );
            return false;
          }
          await refreshSupabaseNames();
          await refreshRegisteredRoutesCache(e);
          notifyUnregisterByEmail(route, (data.pseudo && String(data.pseudo)) || "—", e);
          renderParticipantsInModal(route.id);
          await refreshJoinButtons();
          await fillSignupModal(route);
          return true;
        }
        const entry = getLocalSignup(route.id, e);
        if (!entry) return false;
        const before = (localSignupsByRoute[route.id] || []).length;
        localSignupsByRoute[route.id] = (localSignupsByRoute[route.id] || []).filter(function (item) {
          return (item.email || "").trim().toLowerCase() !== e;
        });
        if ((localSignupsByRoute[route.id] || []).length === before) return false;
        if (!saveLocalSignups()) {
          localSignupsByRoute[route.id].push(entry);
          window.alert(goeloFormatDbFailureAlert(41, 0));
          return false;
        }
        notifyUnregisterByEmail(route, entry.pseudo, e);
        renderParticipantsInModal(route.id);
        await refreshJoinButtons();
        await fillSignupModal(route);
        return true;
      }

      async function registerForRoute(route, pseudo, email, cyclistLevelRaw, participantCityRaw) {
        const p = pseudo.trim();
        const e = email.trim().toLowerCase();
        const cl = sanitizeSignupCyclistLevel(cyclistLevelRaw);
        const city = sanitizeParticipantCity(participantCityRaw);
        if (!p || !e) return false;
        if (isSupabaseEnabled()) {
          let data = await supabaseRpc("signup_register", {
            p_route_id: route.id,
            p_pseudo: p,
            p_email: e,
            p_cyclist_level: cl || null,
            p_participant_city: city || null
          });
          if (Array.isArray(data)) data = data[0];
          if (!data || !data.ok) {
            if (data && data.error === "already_registered") {
              window.alert("Tu es déjà inscrit·e sur ce parcours avec cet e-mail.");
            } else if (data && data.error === "sortie_cancelled") {
              window.alert("Cette sortie est annulée — inscription impossible.");
            } else if (data && data.error === "sortie_closed") {
              window.alert("Les inscriptions sont fermées pour cette sortie.");
            } else if (data && data.error === "private_route") {
              window.alert("Cette sortie est privée — inscription impossible depuis le site.");
            } else if (data && data.error === "invitation_only") {
              window.alert("Inscription sur invitation uniquement — contacte l’organisation.");
            } else {
              const fail = goeloLastRpcFailure;
              const code = fail ? fail.code : 40;
              window.alert(
                goeloFormatDbFailureAlert(code, fail && fail.httpStatus, fail && fail.fnName, fail && fail.body)
              );
            }
            return false;
          }
          if (data.waitlist === true) {
            window.alert(
              "Les places du peloton principal sont prises — tu es en liste d’attente. Si un·e cycliste se désinscrit, tu seras promu·e automatiquement."
            );
          }
          await refreshSupabaseNames();
          await refreshRegisteredRoutesCache(e);
          try {
            localStorage.setItem("goeloRides_last_email", JSON.stringify(e));
          } catch { /* ignore */ }
          notifySignupByEmail(route, p, e);
          renderParticipantsInModal(route.id);
          await refreshJoinButtons();
          await fillSignupModal(route);
          return true;
        }
        if (!localSignupsByRoute[route.id]) localSignupsByRoute[route.id] = [];
        const maxP =
          route && route.maxParticipants != null && Number(route.maxParticipants) > 0
            ? Number(route.maxParticipants)
            : null;
        const mainCount = (localSignupsByRoute[route.id] || []).filter(function (x) {
          return x && !x.waitlist;
        }).length;
        if (!isRegisteredForRoute(route.id, e)) {
          const wait = maxP != null && mainCount >= maxP;
          localSignupsByRoute[route.id].push({
            pseudo: p,
            email: e,
            at: new Date().toISOString(),
            waitlist: wait,
            cyclist_level: cl,
            participant_city: city
          });
          if (wait) {
            window.alert(
              "Mode local : places « max » atteintes — tu es enregistré·e en liste d’attente sur cet appareil."
            );
          }
          if (!saveLocalSignups()) {
            localSignupsByRoute[route.id].pop();
            window.alert(goeloFormatDbFailureAlert(41, 0));
            return false;
          }
        }
        try {
          localStorage.setItem("goeloRides_last_email", JSON.stringify(e));
        } catch { /* ignore */ }
        notifySignupByEmail(route, p, e);
        renderParticipantsInModal(route.id);
        await refreshJoinButtons();
        await fillSignupModal(route);
        return true;
      }

      function setupSignupModal() {
        const modal = document.getElementById("signup-modal");
        const form = document.getElementById("signup-modal-form");
        if (!modal || !form) return;

        modal.querySelectorAll("[data-close-modal]").forEach(function (el) {
          el.addEventListener("click", closeSignupModal);
        });

        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && modal && !modal.hidden) closeSignupModal();
        });

        form.addEventListener("submit", async function (e) {
          e.preventDefault();
          if (!modalRouteRef) return;
          const pseudo = document.getElementById("signup-modal-pseudo").value;
          const email = document.getElementById("signup-modal-email").value;
          const clEl = document.getElementById("signup-modal-cyclist-level");
          const cyclistLevelRaw = clEl ? clEl.value : "";
          const cityEl = document.getElementById("signup-modal-city");
          const participantCityRaw = cityEl ? cityEl.value : "";
          await registerForRoute(modalRouteRef, pseudo, email, cyclistLevelRaw, participantCityRaw);
        });

        const emailInput = document.getElementById("signup-modal-email");
        if (emailInput) {
          emailInput.addEventListener("input", function () {
            if (isSupabaseEnabled()) {
              clearTimeout(emailSupabaseDebounce);
              emailSupabaseDebounce = setTimeout(async function () {
                if (modalRouteRef) await fillSignupModal(modalRouteRef);
                await refreshJoinButtons();
              }, 420);
            } else {
              if (modalRouteRef) void fillSignupModal(modalRouteRef);
              void refreshJoinButtons();
            }
          });
        }

        const unregisterBtn = document.getElementById("signup-unregister-btn");
        if (unregisterBtn) {
          unregisterBtn.addEventListener("click", async function () {
            if (!modalRouteRef) return;
            const emailEl = document.getElementById("signup-modal-email");
            const email = emailEl ? emailEl.value.trim() : getLastStoredEmail();
            if (!email) {
              window.alert("Indique ton e-mail pour te désinscrire.");
              if (emailEl) emailEl.focus();
              return;
            }
            if (!isRegisteredForRoute(modalRouteRef.id, email)) {
              window.alert("Aucune inscription trouvée avec cet e-mail sur ce parcours.");
              if (modalRouteRef) await fillSignupModal(modalRouteRef);
              return;
            }
            const label = modalRouteRef.track;
            if (!window.confirm("Te désinscrire du parcours « " + label + " » ?")) return;
            if (await unregisterForRoute(modalRouteRef, email)) {
              const done = document.getElementById("signup-modal-done");
              if (done) {
                done.textContent = "Tu es désinscrit·e. On espère te revoir sur un autre parcours !";
                done.classList.add("is-visible");
              }
              const registeredActions = document.getElementById("signup-registered-actions");
              if (registeredActions) registeredActions.hidden = true;
              const form = document.getElementById("signup-modal-form");
              if (form) form.style.display = "";
              const mailto = document.getElementById("signup-modal-mailto");
              if (mailto) mailto.style.display = "";
              const title = document.getElementById("signup-modal-title");
              if (title) title.textContent = "Je participe !";
            }
          });
        }
      }

      function closeGpxUploadPop() {
        const pop = document.getElementById("gpx-upload-pop");
        if (pop) {
          pop.hidden = true;
          pop.setAttribute("aria-hidden", "true");
        }
      }

      function destroyNewRoutePreviewMap() {
        if (newRoutePreviewMapInst) {
          try {
            newRoutePreviewMapInst.remove();
          } catch (err) {
            void err;
          }
          newRoutePreviewMapInst = null;
          newRoutePreviewLine = null;
        }
        const el = document.getElementById("new-route-preview-map");
        if (el) {
          el.innerHTML = "";
          el.className = "";
        }
      }

      function closeNewRouteModal() {
        const modal = document.getElementById("new-route-modal");
        closeGpxUploadPop();
        destroyNewRoutePreviewMap();
        if (modal && typeof modal.__goeloResetNewRouteDraft === "function") {
          modal.__goeloResetNewRouteDraft();
        }
        if (modal) {
          modal.hidden = true;
          modal.setAttribute("aria-hidden", "true");
        }
        document.body.style.overflow = "";
      }

      async function openNewRouteModal() {
        const modal = document.getElementById("new-route-modal");
        const form = document.getElementById("new-route-form");
        if (!modal || !form) return;
        closeGpxUploadPop();
        destroyNewRoutePreviewMap();
        if (typeof modal.__goeloResetNewRouteDraft === "function") {
          modal.__goeloResetNewRouteDraft();
        }
        form.reset();
        const timeIn = document.getElementById("new-route-time");
        if (timeIn) timeIn.value = "08:30";
        /* Après reset(), certains navigateurs réappliquent l’état initial des boutons du formulaire :
           on resynchronise l’assistant (ex. masquer « Créer la sortie » hors étape 5). */
        if (typeof modal.__goeloSetWizardStep === "function") {
          modal.__goeloSetWizardStep(1);
        }
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        setNewRouteModalTab("access");
        syncNewRouteAdminUi();
        if (isSupabaseEnabled()) {
          await hydrateCustomRoutesForToolbarEdit();
        }
        refreshEditRouteSelect();
        focusFirstInNewRouteActivePanel();
      }

      function raceTypeLabel(v) {
        if (v === "gravel") return "Gravel";
        if (v === "vtt" || v === "rtt") return "VTT";
        return "Route";
      }

      function inferDifficultyBand(totalKm, elevGainM) {
        const eg = elevGainM == null || !Number.isFinite(elevGainM) ? 0 : elevGainM;
        const score = totalKm * 1.15 + eg / 48;
        if (score < 40) return { levelClass: "level-blanc", levelLabel: "Blanc" };
        if (score < 62) return { levelClass: "level-vert", levelLabel: "Vert" };
        if (score < 92) return { levelClass: "level-bleu", levelLabel: "Bleu" };
        return { levelClass: "level-rouge", levelLabel: "Rouge" };
      }

      function colorsForRaceType(rt) {
        if (rt === "gravel") return { color: "#6d5544", casingColor: "#3e3428" };
        if (rt === "vtt" || rt === "rtt") return { color: "#2e6b3f", casingColor: "#1a4025" };
        return { color: "#1565a8", casingColor: "#0a3d66" };
      }

      function formatFrenchRideDateLabel(dateStr, timeStr) {
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "";
        const parts = dateStr.split("-");
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dt = new Date(y, m, d);
        const t = timeStr && /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : "08:30";
        const th = parseInt(t.slice(0, 2), 10);
        const tm = parseInt(t.slice(3, 5), 10);
        dt.setHours(th, tm, 0, 0);
        const weekday = dt.toLocaleDateString("fr-FR", { weekday: "long" });
        const month = dt.toLocaleDateString("fr-FR", { month: "long" });
        const cap = function (s) {
          return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
        };
        const timeLabel = (th < 10 ? "0" + th : String(th)) + "h" + (tm < 10 ? "0" + tm : String(tm));
        return cap(weekday) + " " + d + " " + month + " " + y + " · " + timeLabel;
      }

      function setNewRouteModalTab(tab) {
        const modal = document.getElementById("new-route-modal");
        if (!modal) return;
        const tabBtns = modal.querySelectorAll("[data-new-route-tab]");
        if (!tabBtns.length) return;
        const t = tab === "edit" || tab === "create" ? tab : "access";
        tabBtns.forEach(function (btn) {
          const id = btn.getAttribute("data-new-route-tab");
          const on = id === t;
          btn.classList.toggle("is-active", on);
          btn.setAttribute("aria-selected", on ? "true" : "false");
        });
        modal.querySelectorAll("[data-tabpanel]").forEach(function (panel) {
          const id = panel.getAttribute("data-tabpanel");
          const on = id === t;
          panel.classList.toggle("is-active", on);
          panel.hidden = !on;
        });
        if (t === "create") {
          if (typeof modal.__goeloSetWizardStep === "function") {
            const s =
              typeof modal.__goeloWizardStep === "number" && modal.__goeloWizardStep >= 1 && modal.__goeloWizardStep <= 5
                ? modal.__goeloWizardStep
                : 1;
            modal.__goeloSetWizardStep(s);
          }
          setTimeout(function () {
            if (newRoutePreviewMapInst && typeof newRoutePreviewMapInst.invalidateSize === "function") {
              try {
                newRoutePreviewMapInst.invalidateSize(false);
              } catch (err) {
                void err;
              }
            }
          }, 120);
        }
      }

      function focusFirstInNewRouteActivePanel() {
        const modal = document.getElementById("new-route-modal");
        if (!modal) return;
        const panel = modal.querySelector(".new-route-tabpanel.is-active");
        if (!panel || panel.hidden) return;
        const cand =
          panel.querySelector(
            "input:not([type=\"hidden\"]):not([disabled]), select:not([disabled]), textarea:not([disabled])"
          ) || panel.querySelector("button:not([disabled])");
        if (cand && typeof cand.focus === "function") {
          try {
            cand.focus();
          } catch (err) {
            void err;
          }
        }
      }

      function syncNewRouteAdminUi() {
        const gate = document.getElementById("new-route-admin-gate");
        const toolbar = document.getElementById("new-route-admin-toolbar");
        const body = document.getElementById("new-route-modal-body");
        const errEl = document.getElementById("new-route-admin-error");
        const tabEdit = document.getElementById("new-route-tab-edit");
        const tabCreate = document.getElementById("new-route-tab-create");
        const disTitle = "Identifie-toi dans l’onglet « Accès Team Rider »";
        if (!gate || !body) return;
        if (errEl) {
          errEl.textContent = "";
          errEl.hidden = true;
        }
        if (isAdminSessionUsable()) {
          gate.hidden = true;
          if (toolbar) toolbar.hidden = false;
          body.classList.remove("is-locked");
          if (tabEdit) {
            tabEdit.disabled = false;
            tabEdit.removeAttribute("title");
          }
          if (tabCreate) {
            tabCreate.disabled = false;
            tabCreate.removeAttribute("title");
          }
        } else {
          clearAdminSession();
          gate.hidden = false;
          if (toolbar) toolbar.hidden = true;
          body.classList.add("is-locked");
          if (tabEdit) {
            tabEdit.disabled = true;
            tabEdit.setAttribute("title", disTitle);
          }
          if (tabCreate) {
            tabCreate.disabled = true;
            tabCreate.setAttribute("title", disTitle);
          }
          setNewRouteModalTab("access");
        }
      }

      function setupNewRouteModal() {
        const modal = document.getElementById("new-route-modal");
        const form = document.getElementById("new-route-form");
        const btn = document.getElementById("btn-new-route");
        const gpxPop = document.getElementById("gpx-upload-pop");
        const gpxDrop = document.getElementById("gpx-upload-drop");
        const gpxInput = document.getElementById("gpx-upload-input");
        const btnOpenGpx = document.getElementById("new-route-open-gpx");
        const coverBtn = document.getElementById("new-route-cover-btn");
        const coverInput = document.getElementById("new-route-cover-input");
        const coverPreview = document.getElementById("new-route-cover-preview");

        if (btn) btn.hidden = !isSupabaseEnabled();
        const hdrNew = document.getElementById("sorties-header-new-route");
        if (hdrNew) hdrNew.hidden = !isSupabaseEnabled();
        if (!modal || !form) return;

        syncNewRouteAdminUi();

        modal.querySelectorAll("[data-new-route-tab]").forEach(function (tabBtn) {
          if (tabBtn.dataset.goeloTabBound) return;
          tabBtn.dataset.goeloTabBound = "1";
          tabBtn.addEventListener("click", function () {
            if (tabBtn.disabled) return;
            const t = tabBtn.getAttribute("data-new-route-tab");
            if (t) setNewRouteModalTab(t);
          });
        });

        const admSubmit = document.getElementById("new-route-admin-submit");
        const admLogout = document.getElementById("new-route-admin-logout-toolbar");
        const admLogin = document.getElementById("new-route-admin-login");
        const admPass = document.getElementById("new-route-admin-password");
        if (admPass && !admPass.dataset.goeloEnterBound) {
          admPass.dataset.goeloEnterBound = "1";
          admPass.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
              ev.preventDefault();
              if (admSubmit) admSubmit.click();
            }
          });
        }
        if (admSubmit && !admSubmit.dataset.goeloBound) {
          admSubmit.dataset.goeloBound = "1";
          admSubmit.addEventListener("click", async function () {
            const errEl = document.getElementById("new-route-admin-error");
            const login = admLogin && admLogin.value ? admLogin.value.trim() : "";
            const password = admPass && admPass.value ? admPass.value : "";
            if (errEl) {
              errEl.textContent = "";
              errEl.hidden = true;
            }
            if (!login || !password) {
              if (errEl) {
                errEl.textContent = "Indique l’e-mail (ou pseudo) et le mot de passe.";
                errEl.hidden = false;
              }
              return;
            }
            admSubmit.disabled = true;
            const resolved = await resolveAdminEmailForLogin(login);
            const email = resolved.email;
            if (!email) {
              admSubmit.disabled = false;
              if (errEl) {
                if (resolved.hint === "alias") {
                  errEl.textContent =
                    "Pseudo inconnu : utilise l’e-mail exact du compte Supabase, ou ajoute une ligne pour ce pseudo dans la table goelo_admin_login_aliases (voir supabase/SUPABASE.md §5).";
                } else if (resolved.hint === "rpc") {
                  errEl.textContent =
                    "Impossible de résoudre le pseudo (réseau, clé API, ou migration SQL 20250607120000 non appliquée).";
                } else {
                  errEl.textContent = "Identifiant inconnu ou compte non configuré.";
                }
                errEl.hidden = false;
              }
              return;
            }
            const grant = await supabasePasswordGrant(email, password);
            if (!grant || grant.ok !== true || !grant.access_token) {
              admSubmit.disabled = false;
              if (errEl) {
                let userMsg = "E-mail ou mot de passe incorrect.";
                if (grant === null) {
                  userMsg =
                    "Cette page n’a pas les variables Supabase (URL ou clé anon vide). " +
                    "Ouvre la console (F12) et vérifie window.GOELO_SUPABASE_URL — si vide, recharge sans cache (Ctrl+F5) " +
                    "ou assure-toi que le bloc <script> avec GOELO_SUPABASE_* est bien juste avant parcours.js (comme sur index.html).";
                } else if (grant.message) {
                  userMsg = humanizeAdminPasswordGrantError(grant.message);
                }
                errEl.textContent = userMsg;
                errEl.hidden = false;
              }
              return;
            }
            if (!jwtIsGoeloAdmin(grant.access_token)) {
              admSubmit.disabled = false;
              if (errEl) {
                errEl.textContent =
                  "Connexion OK, mais ce compte n’a pas le droit créateur (goelo_admin). Un admin peut t’ajouter via la section « Team Riders » dans cette modale (après migration 20250608120000), ou voir le bootstrap SQL dans supabase/SUPABASE.md §5.";
                errEl.hidden = false;
              }
              return;
            }
            saveAdminSession(grant);
            if (admPass) admPass.value = "";
            admSubmit.disabled = false;
            syncNewRouteAdminUi();
            focusFirstInNewRouteActivePanel();
            void (async function () {
              await hydrateCustomRoutesForToolbarEdit();
              refreshEditRouteSelect();
            })();
          });
        }
        function bindAdminLogout(btn) {
          if (!btn || btn.dataset.goeloBound) return;
          btn.dataset.goeloBound = "1";
          btn.addEventListener("click", function () {
            clearAdminSession();
            syncNewRouteAdminUi();
            focusFirstInNewRouteActivePanel();
          });
        }
        bindAdminLogout(admLogout);

        const teamSubmit = document.getElementById("new-route-team-submit");
        const teamEmail = document.getElementById("new-route-team-email");
        const teamGrant = document.getElementById("new-route-team-grant");
        const teamMsg = document.getElementById("new-route-team-msg");
        if (teamSubmit && !teamSubmit.dataset.goeloBound) {
          teamSubmit.dataset.goeloBound = "1";
          teamSubmit.addEventListener("click", async function () {
            if (!isAdminSessionUsable()) return;
            const em = teamEmail && teamEmail.value ? teamEmail.value.trim().toLowerCase() : "";
            if (teamMsg) {
              teamMsg.textContent = "";
              teamMsg.hidden = true;
              teamMsg.classList.remove("is-ok");
            }
            if (!em || em.indexOf("@") < 1) {
              if (teamMsg) {
                teamMsg.textContent =
                  "Indique un e-mail valide (compte déjà présent dans Authentication → Users).";
                teamMsg.hidden = false;
              }
              return;
            }
            const sess = getAdminSession();
            if (!sess || !sess.access_token) return;
            teamSubmit.disabled = true;
            const grantFlag = !!(teamGrant && teamGrant.checked);
            const data = await supabaseRpc(
              "goelo_admin_set_team_rider",
              { p_target_email: em, p_goelo_admin: grantFlag },
              { accessToken: sess.access_token }
            );
            teamSubmit.disabled = false;
            if (!teamMsg) return;
            teamMsg.hidden = false;
            if (data && data.ok === true) {
              teamMsg.classList.add("is-ok");
              teamMsg.textContent = grantFlag
                ? "Droit créateur activé pour " + em + ". La personne doit se déconnecter puis se reconnecter ici pour rafraîchir son jeton."
                : "Droit créateur retiré pour " + em + ".";
              if (teamEmail) teamEmail.value = "";
            } else if (data && data.error === "user_not_found") {
              teamMsg.textContent = "Aucun utilisateur Auth avec cet e-mail dans ce projet.";
            } else if (data && data.error === "forbidden") {
              teamMsg.textContent = "Action refusée : reconnecte-toi (session admin expirée ou sans droit).";
            } else if (data && data.error === "invalid_email") {
              teamMsg.textContent = "E-mail invalide.";
            } else if (data && data.error === "auth_required") {
              teamMsg.textContent = "Session admin absente : reconnecte-toi.";
            } else if (data == null) {
              teamMsg.textContent =
                "Erreur réseau ou RPC. Vérifie que la migration 20250608120000_goelo_admin_set_team_rider.sql est appliquée sur ce projet.";
            } else {
              teamMsg.textContent =
                data && data.error ? "Refus : " + String(data.error) + "." : "Demande refusée.";
            }
          });
        }

        let wizardStep = 1;
        let newRouteProfile = null;
        let newRouteGpxName = "";
        let newRouteCoverDataUrl = null;
        let newRouteEditId = null;
        let newRouteEditSortOrder = 40;

        function setNewRouteModalTitle(isEdit) {
          const h2 = document.getElementById("new-route-modal-title");
          if (!h2) return;
          h2.textContent = isEdit ? "Modifier la sortie" : "Gérer les sorties";
        }

        function refreshEditRouteSelect() {
          const sel = document.getElementById("new-route-edit-select");
          if (!sel) return;
          const cur = sel.value;
          sel.innerHTML = "";
          const opt0 = document.createElement("option");
          opt0.value = "";
          opt0.textContent = "— Nouvelle sortie —";
          sel.appendChild(opt0);
          const hide = mergeHiddenBuiltinIdsSet();
          ROUTES_BUILTIN.forEach(function (r) {
            if (!r || !r.id) return;
            const o = document.createElement("option");
            o.value = r.id;
            const masked = !!hide[String(r.id)];
            o.textContent =
              (r.track || r.id) + " · " + r.id + (masked ? " (masquée)" : "") + " — parcours intégré";
            sel.appendChild(o);
          });
          loadedRoutesCache.forEach(function (r) {
            if (!r || r.routeKind !== "custom" || !r.id) return;
            const o = document.createElement("option");
            o.value = r.id;
            o.textContent = (r.track || r.id) + " · " + r.id;
            sel.appendChild(o);
          });
          if (cur && Array.prototype.some.call(sel.options, function (op) { return op.value === cur; })) {
            sel.value = cur;
          } else {
            sel.value = "";
          }
          const hint = document.getElementById("new-route-edit-empty-hint");
          if (hint) hint.hidden = sel.options.length > 1;
        }

        function commitProfileUi(prof, filename, skipAutoTitle) {
          newRouteProfile = prof;
          newRouteGpxName = filename || "trace.gpx";
          const gl = document.getElementById("new-route-gpx-label");
          if (gl) gl.textContent = newRouteGpxName;
          const stats = document.getElementById("new-route-stats");
          const sk = document.getElementById("new-route-stat-km");
          const sd = document.getElementById("new-route-stat-dplus");
          const sg = document.getElementById("new-route-suggest-diff");
          if (sk) sk.textContent = formatKm(prof.totalKm);
          if (sd) {
            sd.textContent =
              prof.elevGainM != null && prof.elevGainM > 5
                ? "+" + prof.elevGainM + " m"
                : "— (élévation absente dans le GPX)";
          }
          const band = inferDifficultyBand(prof.totalKm, prof.elevGainM);
          if (sg) sg.textContent = band.levelLabel;
          if (stats) stats.hidden = false;
          const levelRadios = form.querySelectorAll('input[name="new-route-level"]');
          if (!skipAutoTitle) {
            levelRadios.forEach(function (radio) {
              radio.checked = radio.value === band.levelClass;
            });
          }
          const rt = (form.querySelector('input[name="new-route-race"]:checked') || {}).value || "route";
          const titleIn = document.getElementById("new-route-track");
          if (titleIn && !skipAutoTitle && !titleIn.value.trim()) {
            titleIn.value =
              raceTypeLabel(rt) +
              " · " +
              formatKm(prof.totalKm) +
              (prof.elevGainM != null && prof.elevGainM > 5 ? " · +" + Math.round(prof.elevGainM) + " m · " : " · ") +
              band.levelLabel;
            titleIn.setAttribute("data-title-auto", "1");
          }
          drawNewRoutePreview(prof);
        }

        function applyRouteIntoWizard(route) {
          if (!route || !route.profile || !route.profile.points || route.profile.points.length < 2) {
            window.alert("Impossible de charger cette sortie (trace absente ou trop courte).");
            return;
          }
          newRouteEditId = route.id;
          newRouteEditSortOrder =
            typeof route.sortOrder === "number" && Number.isFinite(route.sortOrder) ? route.sortOrder : 40;
          const prof = {
            points: route.profile.points.map(function (p) {
              return { lat: p.lat, lon: p.lon, ele: p.ele };
            }),
            totalKm: route.profile.totalKm,
            elevGainM: route.profile.elevGainM
          };
          commitProfileUi(prof, route.file || "trace.gpx", true);
          const titleIn = document.getElementById("new-route-track");
          if (titleIn) {
            titleIn.value = route.track || "";
            titleIn.removeAttribute("data-title-auto");
          }
          const gEl = document.getElementById("new-route-group");
          if (gEl) gEl.value = route.name || "";
          const pEl = document.getElementById("new-route-pace");
          if (pEl) pEl.value = route.pace && route.pace !== "—" ? route.pace : "";
          const rlEl = document.getElementById("new-route-ride-leader");
          if (rlEl) rlEl.value = route.rideLeader && String(route.rideLeader).trim() ? String(route.rideLeader).trim() : "";
          const dEl = document.getElementById("new-route-desc");
          if (dEl) dEl.value = route.shortDesc || "";
          const dateIn = document.getElementById("new-route-date");
          const timeIn = document.getElementById("new-route-time");
          if (dateIn) {
            dateIn.value =
              route.rideDateIso && /^\d{4}-\d{2}-\d{2}$/.test(route.rideDateIso)
                ? route.rideDateIso
                : "";
          }
          if (timeIn) {
            timeIn.value =
              route.rideTime && /^\d{2}:\d{2}$/.test(route.rideTime) ? route.rideTime : "08:30";
          }
          const meetD = document.getElementById("new-route-meet-detail");
          if (meetD) {
            meetD.value =
              route.meetPlaceDetail && String(route.meetPlaceDetail).trim()
                ? String(route.meetPlaceDetail).trim()
                : "";
          }
          const durM = document.getElementById("new-route-duration-min");
          if (durM) {
            const hm =
              route.estimatedDurationHm && String(route.estimatedDurationHm).trim()
                ? String(route.estimatedDurationHm).trim()
                : "";
            if (hm) {
              durM.value = hm;
            } else if (route.estimatedDurationMinutes != null && Number(route.estimatedDurationMinutes) > 0) {
              durM.value = String(route.estimatedDurationMinutes);
            } else {
              durM.value = "";
            }
          }
          const maxPIn = document.getElementById("new-route-max-p");
          if (maxPIn) {
            maxPIn.value =
              route.maxParticipants != null && Number(route.maxParticipants) > 0
                ? String(route.maxParticipants)
                : "0";
          }
          const stEl = document.getElementById("new-route-status");
          if (stEl) stEl.value = route.sortieStatus || "open";
          const visEl = document.getElementById("new-route-visibility");
          if (visEl) visEl.value = route.visibility || "public";
          const rt = route.raceType || "route";
          form.querySelectorAll('input[name="new-route-race"]').forEach(function (radio) {
            radio.checked = radio.value === rt;
          });
          const lv = route.levelClass || "level-vert";
          form.querySelectorAll('input[name="new-route-level"]').forEach(function (radio) {
            radio.checked = radio.value === lv;
          });
          newRouteCoverDataUrl = route.coverImageDataUrl || null;
          if (coverPreview) {
            coverPreview.innerHTML = "";
            if (newRouteCoverDataUrl) {
              const im = document.createElement("img");
              im.alt = "Aperçu couverture";
              im.src = newRouteCoverDataUrl;
              coverPreview.appendChild(im);
              coverPreview.hidden = false;
            } else {
              coverPreview.hidden = true;
            }
          }
          setNewRouteModalTitle(true);
          setWizardStep(1);
          setNewRouteModalTab("create");
          requestAnimationFrame(function () {
            const d = document.getElementById("new-route-date");
            if (d) d.focus();
          });
        }

        function fillRecap() {
          const recap = document.getElementById("new-route-recap");
          if (!recap) return;
          const trackEl = document.getElementById("new-route-track");
          const dateEl = document.getElementById("new-route-date");
          const timeEl = document.getElementById("new-route-time");
          const track = trackEl ? trackEl.value.trim() : "";
          const dateStr = dateEl ? dateEl.value : "";
          const timeStr = timeEl ? timeEl.value : "";
          const dt = formatFrenchRideDateLabel(dateStr, timeStr) || "—";
          const rt = raceTypeLabel((form.querySelector('input[name="new-route-race"]:checked') || {}).value || "route");
          const lvEl = form.querySelector('input[name="new-route-level"]:checked');
          const lm = { "level-blanc": "Blanc", "level-vert": "Vert", "level-bleu": "Bleu", "level-rouge": "Rouge" };
          const lv = lvEl && lm[lvEl.value] ? lm[lvEl.value] : "Vert";
          const gpx = escapeHtml(newRouteGpxName || "—");
          let km = "—";
          let dpl = "—";
          if (newRouteProfile) {
            km = formatKm(newRouteProfile.totalKm);
            dpl =
              newRouteProfile.elevGainM != null && newRouteProfile.elevGainM > 5
                ? "+" + Math.round(newRouteProfile.elevGainM) + " m"
                : "—";
          }
          const grpEl = document.getElementById("new-route-group");
          const paceEl = document.getElementById("new-route-pace");
          const descEl = document.getElementById("new-route-desc");
          const grp = grpEl ? grpEl.value.trim() : "";
          const pace = paceEl ? paceEl.value.trim() : "";
          const desc = descEl ? descEl.value.trim() : "";
          const rideEl = document.getElementById("new-route-ride-leader");
          const rl = rideEl ? rideEl.value.trim() : "";
          const meetDEl = document.getElementById("new-route-meet-detail");
          const meetD = meetDEl ? meetDEl.value.trim() : "";
          const durEl = document.getElementById("new-route-duration-min");
          const durStr = durEl ? durEl.value.trim() : "";
          const maxEl = document.getElementById("new-route-max-p");
          const maxStr = maxEl ? maxEl.value.trim() : "0";
          const stEl = document.getElementById("new-route-status");
          const stVal = stEl ? stEl.value : "open";
          const visEl = document.getElementById("new-route-visibility");
          const visVal = visEl ? visEl.value : "public";
          const stLab = { open: "Ouvertes", closed: "Fermées", cancelled: "Annulée" };
          const visLab = { public: "Publique", invitation: "Sur invitation", private: "Privée" };
          recap.innerHTML =
            "<ul class=\"new-route-recap-list\">" +
            "<li><strong>Titre</strong> · " + escapeHtml(track) + "</li>" +
            "<li><strong>Date</strong> · " + escapeHtml(dt) + "</li>" +
            "<li><strong>Type</strong> · " + escapeHtml(rt) + "</li>" +
            "<li><strong>Niveau</strong> · " + escapeHtml(lv) + "</li>" +
            "<li><strong>GPX</strong> · " + gpx + "</li>" +
            "<li><strong>Distance / D+</strong> · " + escapeHtml(km) + " · " + escapeHtml(dpl) + "</li>" +
            (grp ? "<li><strong>Groupe</strong> · " + escapeHtml(grp) + "</li>" : "") +
            (pace ? "<li><strong>Allure</strong> · " + escapeHtml(pace) + "</li>" : "") +
            (rl ? "<li><strong>Capitaine · Team Rider</strong> · " + escapeHtml(rl) + "</li>" : "") +
            (desc ? "<li><strong>Description</strong> · " + escapeHtml(desc) + "</li>" : "") +
            (meetD ? "<li><strong>Départ précis</strong> · " + escapeHtml(meetD) + "</li>" : "") +
            (durStr
              ? "<li><strong>Durée estimée</strong> · " +
                (function () {
                  const p = parseDurationInputToStore(durStr);
                  if (!p) return escapeHtml(durStr);
                  if (p.isRange) return escapeHtml("≈ " + p.hm + " (" + p.minMinutes + "–" + p.maxMinutes + " min)");
                  return escapeHtml("≈ " + p.hm + " (" + p.minutes + " min)");
                })() +
                "</li>"
              : "") +
            (maxStr && maxStr !== "0" ? "<li><strong>Places max</strong> · " + escapeHtml(maxStr) + "</li>" : "<li><strong>Places max</strong> · Illimité</li>") +
            "<li><strong>Statut</strong> · " + escapeHtml(stLab[stVal] || stVal) + "</li>" +
            "<li><strong>Visibilité</strong> · " + escapeHtml(visLab[visVal] || visVal) + "</li>" +
            "</ul>";
        }

        function setWizardStep(s) {
          wizardStep = Math.max(1, Math.min(5, s));
          for (let i = 1; i <= 5; i++) {
            const p = document.getElementById("new-route-panel-" + i);
            if (p) p.hidden = i !== wizardStep;
          }
          modal.querySelectorAll(".new-route-steps li").forEach(function (li, idx) {
            li.classList.toggle("is-active", idx === wizardStep - 1);
          });
          const prevBtn = document.getElementById("new-route-prev");
          const nextBtn = document.getElementById("new-route-next");
          const submitBtn = document.getElementById("new-route-submit");
          if (prevBtn) prevBtn.hidden = wizardStep <= 1;
          if (nextBtn) nextBtn.hidden = wizardStep >= 5;
          if (submitBtn) submitBtn.hidden = wizardStep < 5;
          modal.__goeloWizardStep = wizardStep;
          if (wizardStep === 5) fillRecap();
          setTimeout(function () {
            if (newRoutePreviewMapInst && typeof newRoutePreviewMapInst.invalidateSize === "function") {
              try {
                newRoutePreviewMapInst.invalidateSize(false);
              } catch (err) {
                void err;
              }
            }
          }, 120);
        }

        modal.__goeloSetWizardStep = setWizardStep;

        function resetDraft() {
          newRouteEditId = null;
          newRouteEditSortOrder = 40;
          setNewRouteModalTitle(false);
          const sel = document.getElementById("new-route-edit-select");
          if (sel) sel.value = "";
          newRouteProfile = null;
          newRouteGpxName = "";
          newRouteCoverDataUrl = null;
          const gl = document.getElementById("new-route-gpx-label");
          if (gl) gl.textContent = "Aucun fichier";
          const stats = document.getElementById("new-route-stats");
          if (stats) stats.hidden = true;
          const sk = document.getElementById("new-route-stat-km");
          const sd = document.getElementById("new-route-stat-dplus");
          const sg = document.getElementById("new-route-suggest-diff");
          if (sk) sk.textContent = "—";
          if (sd) sd.textContent = "—";
          if (sg) sg.textContent = "—";
          if (coverPreview) {
            coverPreview.hidden = true;
            coverPreview.innerHTML = "";
          }
          const meetD = document.getElementById("new-route-meet-detail");
          if (meetD) meetD.value = "";
          const durM = document.getElementById("new-route-duration-min");
          if (durM) durM.value = "";
          const maxPIn = document.getElementById("new-route-max-p");
          if (maxPIn) maxPIn.value = "0";
          const stEl = document.getElementById("new-route-status");
          if (stEl) stEl.value = "open";
          const visEl = document.getElementById("new-route-visibility");
          if (visEl) visEl.value = "public";
          const titleIn = document.getElementById("new-route-track");
          if (titleIn) titleIn.removeAttribute("data-title-auto");
          if (gpxInput) gpxInput.value = "";
          setWizardStep(1);
        }

        modal.__goeloResetNewRouteDraft = resetDraft;

        function drawNewRoutePreview(profile) {
          if (typeof L === "undefined") return;
          const el = document.getElementById("new-route-preview-map");
          if (!el || !profile || !profile.points || profile.points.length < 2) return;
          destroyNewRoutePreviewMap();
          const latlngs = profile.points.map(function (p) {
            return [p.lat, p.lon];
          });
          newRoutePreviewMapInst = L.map(el, { zoomControl: true, attributionControl: true });
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
            maxZoom: 19
          }).addTo(newRoutePreviewMapInst);
          newRoutePreviewLine = L.polyline(latlngs, {
            color: "#b4232f",
            weight: 4,
            opacity: 1,
            lineCap: "round",
            lineJoin: "round"
          }).addTo(newRoutePreviewMapInst);
          newRoutePreviewMapInst.fitBounds(L.latLngBounds(latlngs), { padding: [14, 14], maxZoom: 14 });
          setTimeout(function () {
            if (newRoutePreviewMapInst) newRoutePreviewMapInst.invalidateSize(false);
          }, 280);
        }

        function applyGpxText(text, filename) {
          const prof = loadGpxProfileFromText(text);
          if (!prof || !prof.points || prof.points.length < 2) {
            window.alert("GPX invalide ou trace trop courte.");
            return;
          }
          commitProfileUi(prof, filename || "trace.gpx", false);
          closeGpxUploadPop();
        }

        function openGpxUploadPop() {
          if (!gpxPop) return;
          gpxPop.hidden = false;
          gpxPop.setAttribute("aria-hidden", "false");
        }

        function shrinkImageToDataUrl(file, maxW, quality, done) {
          const fr = new FileReader();
          fr.onload = function () {
            const url = fr.result;
            const img = new Image();
            img.onload = function () {
              let w = img.naturalWidth;
              let h = img.naturalHeight;
              const scale = Math.min(1, maxW / w);
              const cw = Math.max(1, Math.round(w * scale));
              const ch = Math.max(1, Math.round(h * scale));
              const canvas = document.createElement("canvas");
              canvas.width = cw;
              canvas.height = ch;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                done(null);
                return;
              }
              ctx.drawImage(img, 0, 0, cw, ch);
              let dataUrl = canvas.toDataURL("image/jpeg", quality);
              if (dataUrl.length > 480000) dataUrl = canvas.toDataURL("image/jpeg", 0.7);
              done(dataUrl.length > 620000 ? null : dataUrl);
            };
            img.onerror = function () {
              done(null);
            };
            img.src = url;
          };
          fr.onerror = function () {
            done(null);
          };
          fr.readAsDataURL(file);
        }

        modal.querySelectorAll("[data-close-new-route]").forEach(function (el) {
          el.addEventListener("click", closeNewRouteModal);
        });

        document.addEventListener("keydown", function (e) {
          if (e.key !== "Escape") return;
          if (gpxPop && !gpxPop.hidden) {
            closeGpxUploadPop();
            return;
          }
          if (modal && !modal.hidden) closeNewRouteModal();
        });

        if (btn) {
          btn.addEventListener("click", function () {
            void openNewRouteModal();
          });
        }

        if (hdrNew) {
          hdrNew.addEventListener("click", function () {
            void openNewRouteModal();
          });
        }

        const editLoadBtn = document.getElementById("new-route-edit-load");
        if (editLoadBtn && !editLoadBtn.dataset.goeloBound) {
          editLoadBtn.dataset.goeloBound = "1";
          editLoadBtn.addEventListener("click", function () {
            const sel = document.getElementById("new-route-edit-select");
            const id = sel && sel.value ? sel.value.trim() : "";
            if (!id) {
              if (typeof modal.__goeloResetNewRouteDraft === "function") {
                modal.__goeloResetNewRouteDraft();
              }
              form.reset();
              const timeIn = document.getElementById("new-route-time");
              if (timeIn) timeIn.value = "08:30";
              return;
            }
            const route = loadedRoutesCache.find(function (r) {
              return r.id === id;
            });
            if (!route) {
              window.alert("Sortie introuvable. Recharge la page si tu viens d’en créer une.");
              return;
            }
            applyRouteIntoWizard(route);
          });
        }

        const editDeleteBtn = document.getElementById("new-route-edit-delete");
        if (editDeleteBtn && !editDeleteBtn.dataset.goeloBound) {
          editDeleteBtn.dataset.goeloBound = "1";
          editDeleteBtn.addEventListener("click", async function () {
            if (!isSupabaseEnabled()) {
              window.alert("Connecte Supabase (clé anon) pour supprimer une sortie.");
              return;
            }
            if (!isAdminSessionUsable()) {
              window.alert("Connexion administrateur requise.");
              syncNewRouteAdminUi();
              return;
            }
            const sel = document.getElementById("new-route-edit-select");
            const id = sel && sel.value ? sel.value.trim() : "";
            if (!id) {
              window.alert("Choisis d’abord une sortie dans la liste.");
              return;
            }
            const route = loadedRoutesCache.find(function (r) {
              return r.id === id;
            });
            const label = route && route.track ? String(route.track) : id;
            const safe = label.replace(/"/g, "″");
            const builtinIds = { falaises: true, brehec: true, boucle: true };
            const isBuiltin = !!builtinIds[id];
            const confirmMsg = isBuiltin
              ? "Masquer la sortie « " +
                safe +
                " » sur le site ?\n\nC’est un parcours intégré : il sera retiré des listes publiques (réglage en base). Les inscriptions déjà enregistrées restent en base ; pour le réafficher il faudra retirer son id de la table goelo_site_flags côté Supabase."
              : "Supprimer la sortie « " +
                safe +
                " » ?\n\nElle disparaîtra du site (désactivation en base). Les inscriptions existantes restent enregistrées mais la sortie ne sera plus proposée.";
            if (!window.confirm(confirmMsg)) {
              return;
            }
            editDeleteBtn.disabled = true;
            const admTok = getAdminSession();
            let data = await supabaseRpc(
              "route_delete",
              { p_route_id: id },
              { accessToken: admTok && admTok.access_token ? admTok.access_token : "" }
            );
            if (Array.isArray(data)) data = data[0];
            editDeleteBtn.disabled = false;
            if (!data || !data.ok) {
              const fail = goeloLastRpcFailure;
              if (fail && fail.httpStatus === 401) {
                clearAdminSession();
                syncNewRouteAdminUi();
                window.alert("Session expirée ou refusée. Reconnecte-toi en administrateur.");
                return;
              }
              if (data && data.error === "forbidden") {
                window.alert("Ce compte n’a pas le droit de supprimer une sortie.");
                clearAdminSession();
                syncNewRouteAdminUi();
                return;
              }
              if (data && data.error === "auth_required") {
                window.alert("Authentification requise. Reconnecte-toi en administrateur.");
                clearAdminSession();
                syncNewRouteAdminUi();
                return;
              }
              if (data && data.error === "not_found_or_fixed") {
                window.alert(
                  "Impossible de supprimer cette sortie (introuvable, déjà retirée, ou migration route_delete non appliquée sur Supabase)."
                );
                return;
              }
              const code = fail ? fail.code : 40;
              window.alert(
                goeloFormatDbFailureAlert(code, fail && fail.httpStatus, fail && fail.fnName, fail && fail.body)
              );
              return;
            }
            window.alert(
              data && data.kind === "builtin_hidden"
                ? "Parcours intégré masqué sur le site. La page va se recharger."
                : "Sortie supprimée. La page va se recharger."
            );
            window.location.reload();
          });
        }

        if (btnOpenGpx) {
          btnOpenGpx.addEventListener("click", function () {
            openGpxUploadPop();
          });
        }

        if (gpxPop) {
          gpxPop.querySelectorAll("[data-close-gpx-pop]").forEach(function (el) {
            el.addEventListener("click", function (ev) {
              ev.preventDefault();
              closeGpxUploadPop();
            });
          });
        }

        if (gpxDrop && gpxInput) {
          gpxDrop.addEventListener("click", function () {
            gpxInput.click();
          });
          gpxDrop.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              gpxInput.click();
            }
          });
          ["dragenter", "dragover"].forEach(function (evt) {
            gpxDrop.addEventListener(evt, function (e) {
              e.preventDefault();
              e.stopPropagation();
              gpxDrop.classList.add("is-drag");
            });
          });
          ["dragleave", "drop"].forEach(function (evt) {
            gpxDrop.addEventListener(evt, function (e) {
              e.preventDefault();
              e.stopPropagation();
              gpxDrop.classList.remove("is-drag");
            });
          });
          gpxDrop.addEventListener("drop", function (e) {
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = function () {
              applyGpxText(String(reader.result || ""), f.name);
            };
            reader.readAsText(f);
          });
          gpxInput.addEventListener("change", function () {
            const f = gpxInput.files && gpxInput.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = function () {
              applyGpxText(String(reader.result || ""), f.name);
            };
            reader.readAsText(f);
          });
        }

        const prevBtn = document.getElementById("new-route-prev");
        const nextBtn = document.getElementById("new-route-next");
        if (nextBtn) {
          nextBtn.addEventListener("click", function () {
            if (wizardStep === 1) {
              const d = document.getElementById("new-route-date");
              if (!d || !d.value) {
                window.alert("Choisis une date pour continuer.");
                return;
              }
            }
            if (wizardStep === 2) {
              if (!newRouteProfile) {
                window.alert("Importe un fichier GPX avant de passer à l’étape suivante.");
                return;
              }
            }
            if (wizardStep === 3) {
              const t = document.getElementById("new-route-track");
              if (!t || !t.value.trim()) {
                window.alert("Indique un titre pour la sortie.");
                return;
              }
            }
            setWizardStep(wizardStep + 1);
          });
        }
        if (prevBtn) {
          prevBtn.addEventListener("click", function () {
            setWizardStep(wizardStep - 1);
          });
        }

        form.querySelectorAll('input[name="new-route-race"]').forEach(function (r) {
          r.addEventListener("change", function () {
            const titleIn = document.getElementById("new-route-track");
            if (!titleIn || titleIn.getAttribute("data-title-auto") !== "1" || !newRouteProfile) return;
            const prof = newRouteProfile;
            const band = inferDifficultyBand(prof.totalKm, prof.elevGainM);
            const rt = (form.querySelector('input[name="new-route-race"]:checked') || {}).value || "route";
            titleIn.value =
              raceTypeLabel(rt) +
              " · " +
              formatKm(prof.totalKm) +
              (prof.elevGainM != null && prof.elevGainM > 5 ? " · +" + Math.round(prof.elevGainM) + " m · " : " · ") +
              band.levelLabel;
          });
        });

        form.querySelectorAll('input[name="new-route-level"]').forEach(function (r) {
          r.addEventListener("change", function () {
            const titleIn = document.getElementById("new-route-track");
            if (!titleIn || titleIn.getAttribute("data-title-auto") !== "1" || !newRouteProfile) return;
            const prof = newRouteProfile;
            const rt = (form.querySelector('input[name="new-route-race"]:checked') || {}).value || "route";
            const lv = form.querySelector('input[name="new-route-level"]:checked');
            const lab =
              lv && lv.value === "level-blanc"
                ? "Blanc"
                : lv && lv.value === "level-vert"
                  ? "Vert"
                  : lv && lv.value === "level-bleu"
                    ? "Bleu"
                    : lv && lv.value === "level-rouge"
                      ? "Rouge"
                      : "Vert";
            titleIn.value =
              raceTypeLabel(rt) +
              " · " +
              formatKm(prof.totalKm) +
              (prof.elevGainM != null && prof.elevGainM > 5 ? " · +" + Math.round(prof.elevGainM) + " m · " : " · ") +
              lab;
          });
        });

        const titleField = document.getElementById("new-route-track");
        if (titleField) {
          titleField.addEventListener("input", function () {
            titleField.removeAttribute("data-title-auto");
          });
        }

        if (coverBtn && coverInput && coverPreview) {
          coverBtn.addEventListener("click", function () {
            coverInput.click();
          });
          coverInput.addEventListener("change", function () {
            const f = coverInput.files && coverInput.files[0];
            if (!f || !/^image\//.test(f.type)) return;
            shrinkImageToDataUrl(f, 960, 0.82, function (dataUrl) {
              if (!dataUrl) {
                window.alert("Image trop lourde après compression — choisis une photo plus petite.");
                newRouteCoverDataUrl = null;
                coverPreview.hidden = true;
                coverPreview.innerHTML = "";
                return;
              }
              newRouteCoverDataUrl = dataUrl;
              coverPreview.innerHTML = "";
              const im = document.createElement("img");
              im.alt = "Aperçu couverture";
              im.src = dataUrl;
              coverPreview.appendChild(im);
              coverPreview.hidden = false;
            });
          });
        }

        form.addEventListener("submit", async function (e) {
          e.preventDefault();
          if (!isSupabaseEnabled()) {
            window.alert("Connecte Supabase (clé anon) pour créer une sortie.");
            return;
          }
          if (!isAdminSessionUsable()) {
            window.alert(
              "Connexion administrateur requise : identifie-toi avec ton e-mail (ou pseudo) et ton mot de passe dans cette fenêtre."
            );
            syncNewRouteAdminUi();
            const loginEl = document.getElementById("new-route-admin-login");
            if (loginEl) loginEl.focus();
            return;
          }
          if (wizardStep !== 5) {
            window.alert("Va jusqu’à l’étape « Confirmation » avec « Suivant », puis valide.");
            setWizardStep(5);
            return;
          }
          const track = document.getElementById("new-route-track").value.trim();
          const group = document.getElementById("new-route-group").value.trim();
          const pace = document.getElementById("new-route-pace").value.trim();
          const rideLeaderStr = (function () {
            const el = document.getElementById("new-route-ride-leader");
            return el ? el.value.trim() : "";
          })();
          const desc = document.getElementById("new-route-desc").value.trim();
          const dateStr = document.getElementById("new-route-date").value;
          const timeStr = document.getElementById("new-route-time").value;
          const dateText = formatFrenchRideDateLabel(dateStr, timeStr);
          const rt = (form.querySelector('input[name="new-route-race"]:checked') || {}).value || "route";
          const levelEl = form.querySelector('input[name="new-route-level"]:checked');
          const levelClass = levelEl ? levelEl.value : "level-vert";
          const levelLabelMap = {
            "level-blanc": "Blanc",
            "level-vert": "Vert",
            "level-bleu": "Bleu",
            "level-rouge": "Rouge"
          };
          const levelLabel = levelLabelMap[levelClass] || "Vert";

          if (!track) {
            window.alert("Indique un titre pour la sortie.");
            return;
          }
          if (!dateStr) {
            window.alert("Choisis une date.");
            return;
          }
          if (!newRouteProfile || !newRouteGpxName) {
            window.alert("Importe un fichier GPX (fenêtre dédiée) avant de créer la sortie.");
            return;
          }

          const meetDetailStr = (function () {
            const el = document.getElementById("new-route-meet-detail");
            return el ? el.value.trim() : "";
          })();
          if (!meetDetailStr) {
            if (
              !window.confirm(
                "Tu n’as pas indiqué de lieu de départ précis : la fiche restera moins claire pour les participant·e·s. Continuer quand même ?"
              )
            ) {
              return;
            }
          }
          const durRaw = (function () {
            const el = document.getElementById("new-route-duration-min");
            return el ? String(el.value || "").trim() : "";
          })();
          const durParsed = parseDurationInputToStore(durRaw);
          if (durRaw && !durParsed) {
            window.alert(
              "Durée invalide : indique un nombre de minutes (ex. 165), un horaire H:MM (ex. 2:45), ou une plage H:MM - H:MM (ex. 2:30 - 3:00)."
            );
            return;
          }
          const maxPRaw = (function () {
            const el = document.getElementById("new-route-max-p");
            const v = el ? parseInt(String(el.value || "").trim(), 10) : 0;
            return Number.isFinite(v) && v > 0 ? v : null;
          })();
          const sortieStatusVal = (function () {
            const el = document.getElementById("new-route-status");
            return el && el.value ? el.value : "open";
          })();
          const visibilityVal = (function () {
            const el = document.getElementById("new-route-visibility");
            return el && el.value ? el.value : "public";
          })();

          const emb = serializeEmbeddedPoints(newRouteProfile.points, EMBEDDED_POINTS_MAX);
          const cols = colorsForRaceType(rt);
          const yearFromDate = parseInt(String(dateStr).slice(0, 4), 10) || 2026;
          const frontConfig = {
            file: newRouteGpxName,
            embeddedPoints: emb,
            raceType: rt,
            stats: {
              totalKm: newRouteProfile.totalKm,
              elevGainM: newRouteProfile.elevGainM
            },
            depart: {
              day: "",
              month: "",
              year: String(yearFromDate),
              weekday: "",
              dateLabel: dateText
            },
            shortDesc: desc,
            color: cols.color,
            casingColor: cols.casingColor,
            levelClass: levelClass,
            levelLabel: levelLabel,
            vibe: raceTypeLabel(rt),
            coverImageDataUrl: newRouteCoverDataUrl || "",
            rideDateIso: dateStr,
            rideTime: timeStr && /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : "08:30",
            rideLeader: rideLeaderStr,
            meetPlace: SHARED.meetPlace,
            meetPlaceDetail: meetDetailStr,
            estimatedDurationHm: durParsed ? durParsed.hm : "",
            estimatedDurationMinutes: durParsed ? durParsed.minutes : null,
            maxParticipants: maxPRaw,
            sortieStatus: sortieStatusVal,
            visibility: visibilityVal
          };

          const admTok = getAdminSession();
          const rpcPayload = {
            p_track_name: track,
            p_group_label: group || raceTypeLabel(rt),
            p_pace_label: pace || "—",
            p_front_config: frontConfig,
            p_sort_order: newRouteEditId ? newRouteEditSortOrder : 40
          };
          let data;
          if (newRouteEditId) {
            data = await supabaseRpc(
              "route_update",
              Object.assign({ p_route_id: newRouteEditId }, rpcPayload),
              { accessToken: admTok && admTok.access_token ? admTok.access_token : "" }
            );
          } else {
            data = await supabaseRpc(
              "route_create",
              rpcPayload,
              { accessToken: admTok && admTok.access_token ? admTok.access_token : "" }
            );
          }
          if (Array.isArray(data)) data = data[0];
          if (!data || !data.ok) {
            const fail = goeloLastRpcFailure;
            if (fail && fail.httpStatus === 401) {
              clearAdminSession();
              syncNewRouteAdminUi();
              window.alert("Session expirée ou refusée. Reconnecte-toi en administrateur.");
              return;
            }
            if (data && data.error === "forbidden") {
              window.alert("Ce compte n’a pas le droit de créer une sortie (administrateur requis côté serveur).");
              clearAdminSession();
              syncNewRouteAdminUi();
              return;
            }
            if (data && data.error === "auth_required") {
              window.alert("Authentification requise. Reconnecte-toi en administrateur.");
              clearAdminSession();
              syncNewRouteAdminUi();
              return;
            }
            if (data && data.error === "limit_reached") {
              window.alert("Nombre maximum de sorties personnalisées atteint. Contacte l’organisation.");
            } else if (data && data.error === "not_found_or_fixed") {
              window.alert(
                "Impossible de modifier cette sortie : elle n’existe pas en base, est inactive, ou le SQL n’est pas à jour.\n\n" +
                  "Pour les parcours intégrés (Falaises, Bréhec, Boucle), exécute aussi sur Supabase :\n" +
                  "supabase/migrations/20250622120000_route_update_allow_fixed_builtins.sql"
              );
            } else {
              const code = fail ? fail.code : 40;
              window.alert(
                goeloFormatDbFailureAlert(code, fail && fail.httpStatus, fail && fail.fnName, fail && fail.body)
              );
            }
            return;
          }
          const wasEdit = !!newRouteEditId;
          closeNewRouteModal();
          window.alert(
            wasEdit
              ? "Sortie mise à jour. La page va se recharger."
              : "Sortie créée. La page va se recharger pour afficher le nouveau parcours."
          );
          window.location.reload();
        });

        refreshEditRouteSelect();
      }

      let activeRouteRef = null;

      function updateRoutePickerLayout() {
        const picker = document.getElementById("route-picker");
        const scrollWrap = document.getElementById("route-choices-scroll");
        const n = loadedRoutesCache.filter(routeVisibleOnPublicSite).length;

        if (picker) {
          picker.classList.toggle("route-choices--many", n > 2);
          if (n > 2) picker.setAttribute("aria-orientation", "horizontal");
          else picker.removeAttribute("aria-orientation");
        }

        if (!picker || !scrollWrap) return;

        function updateScrollHints() {
          const max = picker.scrollWidth - picker.clientWidth;
          scrollWrap.classList.toggle("can-scroll-left", picker.scrollLeft > 8);
          scrollWrap.classList.toggle("can-scroll-right", max > 8 && picker.scrollLeft < max - 8);
        }

        if (!picker.dataset.scrollBound) {
          picker.dataset.scrollBound = "1";
          picker.addEventListener("scroll", updateScrollHints, { passive: true });
          window.addEventListener("resize", updateScrollHints);
        }
        updateScrollHints();
        requestAnimationFrame(function () {
          requestAnimationFrame(updateScrollHints);
        });
      }

      function syncRouteDistances(routes) {
        routes.forEach(function (route) {
          const kmLabel = formatKm(route.profile.totalKm);
          document.querySelectorAll('.route-km[data-route-id="' + route.id + '"]').forEach(function (el) {
            el.textContent = kmLabel;
          });
          document.querySelectorAll('[data-choice-km="' + route.id + '"]').forEach(function (el) {
            el.textContent = kmLabel;
          });
        });
      }

      let loadedRoutesCache = [];

      function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const p = Math.PI / 180;
        const a =
          Math.pow(Math.sin((lat2 - lat1) * p / 2), 2) +
          Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.pow(Math.sin((lon2 - lon1) * p / 2), 2);
        return 2 * R * Math.asin(Math.sqrt(a));
      }

      function parseGpxTrack(xmlText) {
        const doc = new DOMParser().parseFromString(xmlText, "application/xml");
        if (doc.querySelector("parsererror")) return [];

        const points = [];
        const nodes = doc.getElementsByTagName("*");
        for (let i = 0; i < nodes.length; i++) {
          const el = nodes[i];
          const tag = el.localName || el.nodeName.split(":").pop();
          if (tag !== "trkpt" && tag !== "rtept") continue;
          const lat = parseFloat(el.getAttribute("lat"));
          const lon = parseFloat(el.getAttribute("lon"));
          if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
          let ele = null;
          for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
            const n = c.localName || c.nodeName.split(":").pop();
            if (n === "ele" && c.textContent) {
              const v = parseFloat(c.textContent.trim());
              if (!Number.isNaN(v)) ele = v;
              break;
            }
          }
          if (ele !== null) points.push({ lat: lat, lon: lon, ele: ele });
          else points.push({ lat: lat, lon: lon });
        }
        return points;
      }

      function fillElevationGaps(points) {
        const n = points.length;
        if (!n) return [];
        const hasAny = points.some(function (p) {
          return typeof p.ele === "number" && !Number.isNaN(p.ele);
        });
        if (!hasAny) {
          return points.map(function (p) {
            return { lat: p.lat, lon: p.lon };
          });
        }
        const out = points.map(function (p) {
          return {
            lat: p.lat,
            lon: p.lon,
            ele: typeof p.ele === "number" && !Number.isNaN(p.ele) ? p.ele : null
          };
        });
        let first = -1;
        let last = -1;
        for (let i = 0; i < n; i++) {
          if (out[i].ele !== null) {
            if (first < 0) first = i;
            last = i;
          }
        }
        if (first < 0) {
          return out.map(function (p) {
            return { lat: p.lat, lon: p.lon };
          });
        }
        for (let i = 0; i < first; i++) out[i].ele = out[first].ele;
        for (let i = last + 1; i < n; i++) out[i].ele = out[last].ele;
        let i = first;
        while (i < last) {
          let j = i + 1;
          while (j <= last && out[j].ele === null) j++;
          if (j > last) break;
          const e0 = out[i].ele;
          const e1 = out[j].ele;
          const steps = j - i;
          for (let k = 1; k < steps; k++) {
            out[i + k].ele = e0 + (e1 - e0) * (k / steps);
          }
          i = j;
        }
        return out;
      }

      function gradePercentBetween(p0, p1) {
        const horiz = haversine(p0.lat, p0.lon, p1.lat, p1.lon);
        if (horiz < 0.5) return 0;
        if (typeof p0.ele !== "number" || typeof p1.ele !== "number") return null;
        return ((p1.ele - p0.ele) / horiz) * 100;
      }

      function smoothedEdgeGrade(points, i) {
        const w = 2;
        let sum = 0;
        let cnt = 0;
        for (let k = -w; k <= w; k++) {
          const idx = i + k;
          if (idx < 0 || idx >= points.length - 1) continue;
          const g = gradePercentBetween(points[idx], points[idx + 1]);
          if (g !== null) {
            sum += g;
            cnt++;
          }
        }
        return cnt ? sum / cnt : 0;
      }

      function segmentColorForGrade(gradePct) {
        if (gradePct < -2.5) return "#2563eb";
        if (gradePct < 2) return "#64748b";
        if (gradePct < 4.5) return "#ca8a04";
        if (gradePct < 8) return "#ea580c";
        return "#dc2626";
      }

      function simplifyTrack(points, maxPoints) {
        if (points.length <= maxPoints) return points.slice();
        const step = Math.ceil(points.length / maxPoints);
        const out = [points[0]];
        for (let i = step; i < points.length - 1; i += step) out.push(points[i]);
        out.push(points[points.length - 1]);
        return out;
      }

      function computeElevationGainM(points) {
        if (!points || points.length < 2) return null;
        let gain = 0;
        let any = false;
        for (let i = 1; i < points.length; i++) {
          const e0 = points[i - 1].ele;
          const e1 = points[i].ele;
          if (typeof e0 !== "number" || typeof e1 !== "number" || Number.isNaN(e0) || Number.isNaN(e1)) continue;
          any = true;
          const d = e1 - e0;
          if (d > 0) gain += d;
        }
        return any ? Math.round(gain) : null;
      }

      function buildTrack(points) {
        const filled = fillElevationGaps(points);
        let distM = 0;
        for (let i = 1; i < filled.length; i++) {
          distM += haversine(
            filled[i - 1].lat, filled[i - 1].lon, filled[i].lat, filled[i].lon
          );
        }
        return {
          points: filled,
          totalKm: distM / 1000,
          elevGainM: computeElevationGainM(filled)
        };
      }

      function loadGpxProfileFromText(xmlText) {
        const raw = parseGpxTrack(xmlText);
        if (!raw.length) return null;
        const pts = simplifyTrack(raw, GPX_MAX_POINTS);
        return buildTrack(pts);
      }

      function deserializeEmbeddedPointRow(r) {
        if (!Array.isArray(r) || r.length < 2) return null;
        const lat = r[0];
        const lon = r[1];
        const ele = r.length > 2 && r[2] != null && !Number.isNaN(Number(r[2])) ? Number(r[2]) : undefined;
        return { lat: lat, lon: lon, ele: ele };
      }

      function profileFromEmbeddedRows(rows) {
        if (!rows || !rows.length) return null;
        const pts = rows.map(deserializeEmbeddedPointRow).filter(Boolean);
        if (pts.length < 2) return null;
        return buildTrack(pts);
      }

      async function loadRouteProfile(cfg) {
        const emb = cfg && cfg.embeddedPoints;
        if (emb && Array.isArray(emb) && emb.length >= 2) {
          const prof = profileFromEmbeddedRows(emb);
          if (prof && prof.points && prof.points.length) return prof;
        }
        const file = cfg && cfg.file != null ? String(cfg.file).trim() : "";
        if (file) return loadGpxTrack(file);
        return null;
      }

      function serializeEmbeddedPoints(points, maxN) {
        const simp = simplifyTrack(points, maxN);
        return simp.map(function (p) {
          const row = [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5];
          if (typeof p.ele === "number" && !Number.isNaN(p.ele)) row.push(Math.round(p.ele * 10) / 10);
          return row;
        });
      }

      async function loadGpxTrack(url) {
        try {
          const res = await fetch(encodeURI(url));
          if (!res.ok) return null;
          const pts = simplifyTrack(parseGpxTrack(await res.text()), GPX_MAX_POINTS);
          return pts.length ? buildTrack(pts) : null;
        } catch {
          return null;
        }
      }

      const BIKE_SVG =
        '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path fill="#1f2937" d="M5 20.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm14 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z' +
        'M6.8 15h10.4l1.2-3.5H8.3L6.8 15zm2.5-5.2L10 8h3.2l.5 1.8h-4.4z"/></svg>';

      function buildRouteChoiceTable(route) {
        const d = route.depart;
        return (
          '<table class="ride-event-card ride-event-card--choice is-route-' + route.id + '">' +
          "<tbody>" +
          '<tr><td class="ride-td-left"><span class="ride-day">' + d.day + "</span></td>" +
          '<td class="ride-td-right"><div class="ride-km-row">' +
          '<p class="ride-km" data-choice-km="' + route.id + '">' + formatKm(route.profile.totalKm) + "</p>" +
          '<button type="button" class="btn-je-participe" data-join-route="' + route.id + '">Je participe !</button>' +
          "</div></td></tr>" +
          '<tr><td class="ride-td-left"><span class="ride-month">' + d.month + "</span></td>" +
          '<td class="ride-td-right"><h4 class="ride-course">' + route.track + "</h4></td></tr>" +
          '<tr><td class="ride-td-left"><span class="ride-time">' + SHARED.time + "</span></td>" +
          '<td class="ride-td-right"><p class="ride-group">' + route.name + "</p></td></tr>" +
          '<tr><td class="ride-td-left ride-td-bike" rowspan="2">' +
          '<p class="ride-meet-place">' + SHARED.meetPlace + "</p>" +
          '<div class="ride-aside-bike">' + BIKE_SVG + "</div></td>" +
          '<td class="ride-td-right"><p class="ride-pace-level">' +
          route.pace + " · " + route.levelLabel + "</p></td></tr>" +
          '<tr><td class="ride-td-right"><p class="ride-desc">' +
          (route.shortDesc || "") + "</p></td></tr>" +
          "</tbody></table>"
        );
      }

      async function updateRideCard(route) {
        const wrap = document.getElementById("signup-modal-map-section");
        if (wrap) {
          wrap.classList.remove("is-falaises", "is-brehec", "is-boucle", "is-custom-route");
          if (route.id === "falaises") wrap.classList.add("is-falaises");
          else if (route.id === "brehec") wrap.classList.add("is-brehec");
          else if (route.id === "boucle") wrap.classList.add("is-boucle");
          else wrap.classList.add("is-custom-route");
        }
        await refreshJoinButtons();
        if (modalRouteRef && modalRouteRef.id === route.id) {
          await fillSignupModal(route);
        }
      }

      function cityMarkerIcon(city) {
        return L.divIcon({
          className: "city-marker",
          html: '<span class="city-label' + (city.start ? " city-start" : "") + '">' + city.name + "</span>",
          iconAnchor: [0, 0]
        });
      }

      function updateCitiesList(cities) {
        const list = document.getElementById("cities-list");
        if (!list) return;
        list.innerHTML = "";
        if (!cities || !cities.length) return;
        cities.forEach(function (city) {
          const chip = document.createElement("span");
          chip.className = "city-chip" + (city.start ? " is-start" : "");
          chip.textContent = city.name;
          list.appendChild(chip);
        });
      }

      function addCityMarkers(map, cities) {
        const group = L.layerGroup();
        cities.forEach(function (city) {
          const marker = L.marker([city.lat, city.lon], { icon: cityMarkerIcon(city) });
          marker.bindPopup("<strong>" + city.name + "</strong>" + (city.start ? "<br>Départ · arrivée" : ""));
          group.addLayer(marker);
        });
        return group;
      }

      function resolveArrowColor(routeColor, casingColor) {
        if (routeColor === "#e8e8e8") return casingColor || "#4b5563";
        return routeColor;
      }

      function bearingDegrees(lat1, lon1, lat2, lon2) {
        const toRad = Math.PI / 180;
        const toDeg = 180 / Math.PI;
        const dLon = (lon2 - lon1) * toRad;
        const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
        const x =
          Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
          Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
        return (Math.atan2(y, x) * toDeg + 360) % 360;
      }

      function addManualDirectionArrows(latlngs, arrowColor) {
        const group = L.layerGroup();
        if (latlngs.length < 2) return group;
        const step = Math.max(1, Math.floor(latlngs.length / 14));
        for (let i = step; i < latlngs.length - 1; i += step) {
          const from = latlngs[i - 1];
          const at = latlngs[i];
          const bearing = bearingDegrees(from[0], from[1], at[0], at[1]);
          const icon = L.divIcon({
            className: "route-arrow-marker",
            html:
              '<span class="route-arrow" style="color:' + arrowColor + ";transform:rotate(" +
              (bearing - 90) + 'deg)">▶</span>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          });
          group.addLayer(L.marker(at, { icon: icon, interactive: false }));
        }
        return group;
      }

      function addStravaTrack(map, latlngs, color, casingColor) {
        const weight = 5;
        const arrowColor = resolveArrowColor(color, casingColor);
        const casing = L.polyline(latlngs, {
          color: casingColor || "#ffffff",
          weight: weight + 4,
          opacity: 1,
          lineCap: "round",
          lineJoin: "round"
        });
        const line = L.polyline(latlngs, {
          color: color,
          weight: weight,
          opacity: 1,
          lineCap: "round",
          lineJoin: "round"
        });
        const layers = [casing, line];

        if (typeof L.polylineDecorator === "function" && typeof L.Symbol !== "undefined") {
          layers.push(
            L.polylineDecorator(line, {
              patterns: [
                {
                  offset: "4%",
                  repeat: "7%",
                  symbol: L.Symbol.arrowHead({
                    pixelSize: 12,
                    headAngle: 42,
                    polygon: false,
                    pathOptions: {
                      color: arrowColor,
                      weight: 3,
                      opacity: 1,
                      lineCap: "round",
                      lineJoin: "round"
                    }
                  })
                }
              ]
            })
          );
        } else {
          layers.push(addManualDirectionArrows(latlngs, arrowColor));
        }

        const group = L.layerGroup(layers);
        group.mainLine = line;
        return group;
      }

      function profileHasElevation(points) {
        return points.some(function (p) {
          return typeof p.ele === "number" && !Number.isNaN(p.ele);
        });
      }

      function addGradeColoredTrack(map, points, routeFallbackColor, casingColor) {
        const weight = 5;
        const latlngs = points.map(function (p) {
          return [p.lat, p.lon];
        });
        const casing = L.polyline(latlngs, {
          color: casingColor || "#ffffff",
          weight: weight + 4,
          opacity: 1,
          lineCap: "round",
          lineJoin: "round"
        });
        const colored = L.layerGroup();
        let i = 0;
        while (i < points.length - 1) {
          const g = smoothedEdgeGrade(points, i);
          const col = segmentColorForGrade(g);
          const path = [[points[i].lat, points[i].lon]];
          let j = i;
          while (j < points.length - 1) {
            const gj = smoothedEdgeGrade(points, j);
            if (segmentColorForGrade(gj) !== col) break;
            j++;
            path.push([points[j].lat, points[j].lon]);
          }
          if (j === i) {
            j = i + 1;
            path.push([points[j].lat, points[j].lon]);
          }
          colored.addLayer(
            L.polyline(path, {
              color: col,
              weight: weight,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round"
            })
          );
          i = j;
        }
        const arrowColor = resolveArrowColor(routeFallbackColor, casingColor);
        const layers = [casing, colored];
        if (typeof L.polylineDecorator === "function" && typeof L.Symbol !== "undefined") {
          layers.push(
            L.polylineDecorator(casing, {
              patterns: [
                {
                  offset: "4%",
                  repeat: "7%",
                  symbol: L.Symbol.arrowHead({
                    pixelSize: 12,
                    headAngle: 42,
                    polygon: false,
                    pathOptions: {
                      color: arrowColor,
                      weight: 3,
                      opacity: 1,
                      lineCap: "round",
                      lineJoin: "round"
                    }
                  })
                }
              ]
            })
          );
        } else {
          layers.push(addManualDirectionArrows(latlngs, arrowColor));
        }
        const group = L.layerGroup(layers);
        group.mainLine = casing;
        return group;
      }

      function addTrackForRoute(map, route, useGradeColors) {
        const pts = route.profile.points;
        const latlngs = pts.map(function (p) {
          return [p.lat, p.lon];
        });
        const canGrade = useGradeColors && profileHasElevation(pts);
        if (canGrade) {
          return addGradeColoredTrack(map, pts, route.color, route.casingColor);
        }
        return addStravaTrack(map, latlngs, route.color, route.casingColor);
      }

      document.addEventListener("DOMContentLoaded", async function () {
        const mapEl = document.getElementById("route-map");
        const mapLoading = document.getElementById("map-loading");
        const mapAlert = document.getElementById("map-alert");
        const routePicker = document.getElementById("route-picker");
        if (!mapEl || typeof L === "undefined") return;

        const map = L.map("route-map", {
          scrollWheelZoom: true,
          zoomControl: true
        }).setView([START.lat, START.lon], 11);
        mapEl.classList.add("strava-map-tiles");

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19
        }).addTo(map);

        let activeRoute = null;
        let trackLayer = null;
        let citiesLayer = null;
        const optCities = document.getElementById("opt-cities");
        const optGradeColors = document.getElementById("opt-grade-colors");

        function refreshMapSize() {
          map.invalidateSize({ animate: false });
        }

        function clearTrack() {
          if (trackLayer) {
            map.removeLayer(trackLayer);
            trackLayer = null;
          }
          if (citiesLayer) {
            map.removeLayer(citiesLayer);
            citiesLayer = null;
          }
        }

        function showCities(route) {
          if (citiesLayer) {
            map.removeLayer(citiesLayer);
            citiesLayer = null;
          }
          if (!route.cities || !route.cities.length) {
            updateCitiesList([]);
            return;
          }
          updateCitiesList(route.cities);
          if (optCities && !optCities.checked) return;
          citiesLayer = addCityMarkers(map, route.cities);
          citiesLayer.addTo(map);
        }

        if (optCities) {
          optCities.addEventListener("change", function () {
            if (activeRoute) showCities(activeRoute);
          });
        }

        if (optGradeColors) {
          optGradeColors.addEventListener("change", function () {
            if (activeRoute) showRoute(activeRoute, { scroll: false });
          });
        }

        function boundsForLatLngs(latlngs) {
          return L.latLngBounds(latlngs);
        }

        function showRoute(route, options) {
          const opts = options || {};
          activeRoute = route;
          activeRouteRef = route;
          clearTrack();
          const pts = route.profile.points;
          const latlngs = pts.map(function (p) { return [p.lat, p.lon]; });
          const useGrade = optGradeColors && optGradeColors.checked;
          const hasElev = typeof pts[0] !== "undefined" && typeof pts[0].ele === "number";
          if (optGradeColors) {
            optGradeColors.disabled = !hasElev;
            const lab = optGradeColors.closest("label");
            if (lab) lab.style.opacity = hasElev ? "" : "0.5";
          }
          const gradeLegend = document.getElementById("grade-legend");
          if (gradeLegend) gradeLegend.hidden = !(useGrade && hasElev);

          trackLayer = addTrackForRoute(map, route, useGrade);
          trackLayer.addTo(map);
          trackLayer.mainLine.bindPopup(
            "<strong>" + route.track + "</strong><br>" + route.depart.dateLabel +
            "<br>" + formatKm(route.profile.totalKm) + " · " + route.name +
            (useGrade && hasElev
              ? "<br><span style=\"font-size:0.8em;opacity:0.9\">Couleurs = pente (rouge = montée raide).</span>"
              : "")
          );
          map.fitBounds(boundsForLatLngs(latlngs), { padding: [40, 40], maxZoom: 14 });

          void updateRideCard(route);
          showCities(route);

          document.querySelectorAll(".route-choice-card").forEach(function (card) {
            const isActive = card.dataset.routeId === route.id;
            card.classList.toggle("is-active", isActive);
            card.setAttribute("aria-selected", isActive ? "true" : "false");
            if (isActive) {
              card.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
            }
          });
          document.querySelectorAll(".group-card[data-route-id]").forEach(function (card) {
            card.classList.toggle("is-route-active", card.dataset.routeId === route.id);
          });

          setTimeout(refreshMapSize, 50);
          setTimeout(refreshMapSize, 350);
        }

        showRouteHandler = showRoute;

        function bindRouteUi(route) {
          if (routePicker) {
            const card = document.createElement("div");
            card.className = "route-choice-card";
            card.dataset.routeId = route.id;
            card.setAttribute("role", "tab");
            card.tabIndex = 0;
            card.setAttribute("aria-label", route.track + " · " + route.name);
            card.style.setProperty("--route-color", route.color);
            card.innerHTML = buildRouteChoiceTable(route);
            card.addEventListener("click", function (e) {
              if (e.target.closest(".btn-je-participe")) return;
              openSignupModal(route);
            });
            card.addEventListener("keydown", function (e) {
              if (e.key === "Enter" || e.key === " ") {
                if (e.target.closest(".btn-je-participe")) return;
                e.preventDefault();
                openSignupModal(route);
              }
            });
            routePicker.appendChild(card);
          }

          document.querySelectorAll('.group-card[data-route-id="' + route.id + '"]').forEach(function (card) {
            card.addEventListener("click", function () {
              openSignupModal(route);
              var _mapSec = document.getElementById("map-section");
              if (_mapSec) _mapSec.scrollIntoView({ behavior: "smooth" });
            });
          });
        }

        const extraFromDb = await fetchCustomRoutesFromSupabase();
        serverHiddenBuiltinIds = await fetchHiddenBuiltinIdsFromSupabase();
        const routesToLoad = ROUTES_BUILTIN.concat(extraFromDb);

        const results = await Promise.all(
          routesToLoad.map(async function (cfg) {
            const profile = await loadRouteProfile(cfg);
            if (!profile) return null;
            return Object.assign({}, cfg, { profile: profile });
          })
        );

        loadedRoutesCache = results.filter(function (r) { return r !== null; });

        if (!isSupabaseEnabled()) loadLocalSignups();
        await loadParticipants();
        if (isSupabaseEnabled()) await refreshSupabaseNames();
        /* Si le script qui définit GOELO_SUPABASE_* est placé après ce fichier, il s’exécute après ce bloc : on resynchronise au tick suivant. */
        setTimeout(async function () {
          if (!isSupabaseEnabled()) return;
          await refreshSupabaseNames();
          await refreshJoinButtons();
        }, 0);
        setupSignupModal();
        setupNewRouteModal();

        loadedRoutesCache.forEach(function (route) {
          if (!routeVisibleOnPublicSite(route)) return;
          bindRouteUi(route);
        });

        if (routePicker && !routePicker.dataset.joinDelegated) {
          routePicker.dataset.joinDelegated = "1";
          routePicker.addEventListener("click", function (e) {
            const joinBtn = e.target.closest(".btn-je-participe");
            if (!joinBtn) return;
            e.preventDefault();
            e.stopPropagation();
            const routeId = joinBtn.getAttribute("data-join-route");
            const route = loadedRoutesCache.find(function (r) { return r.id === routeId; });
            if (route) openSignupModal(route);
          });
        }

        syncRouteDistances(loadedRoutesCache.filter(routeVisibleOnPublicSite));
        updateRoutePickerLayout();
        await refreshJoinButtons();

        if (mapLoading) mapLoading.classList.add("is-hidden");

        if (!loadedRoutesCache.some(routeVisibleOnPublicSite)) {
          if (mapAlert) mapAlert.classList.add("is-visible");
          return;
        }

        setTimeout(refreshMapSize, 150);
        if ("IntersectionObserver" in window) {
          new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) refreshMapSize();
            });
          }, { threshold: 0.1 }).observe(mapEl);
        }
        window.addEventListener("resize", refreshMapSize);

        var openParams = new URLSearchParams(window.location.search);
        var openRouteId = openParams.get("openRoute");
        if (openRouteId && loadedRoutesCache.length) {
          var routeToOpen = loadedRoutesCache.find(function (r) {
            return String(r.id) === String(openRouteId) && routeVisibleOnPublicSite(r);
          });
          if (routeToOpen) {
            var mapSec = document.getElementById("map-section");
            if (mapSec) mapSec.scrollIntoView({ behavior: "smooth", block: "start" });
            setTimeout(function () {
              openSignupModal(routeToOpen);
            }, 280);
          }
          try {
            openParams.delete("openRoute");
            var q2 = openParams.toString();
            var cleanUrl = window.location.pathname + (q2 ? "?" + q2 : "") + (window.location.hash || "");
            history.replaceState(null, "", cleanUrl);
          } catch (eOpen) { /* ignore */ }
        }
      });
    })();
