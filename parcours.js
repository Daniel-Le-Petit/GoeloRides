    (function () {
      /* ── Import shared utilities from GoeloShared ── */
      var _S = window.GoeloShared;
      var normalizeApiKey      = _S.normalizeApiKey;
      var getSupabaseConfig    = _S.getSupabaseConfig;
      var isSupabaseEnabled    = _S.isSupabaseEnabled;
      var supabaseRpc          = _S.supabaseRpc;
      var goeloFormatDbFailureAlert = _S.goeloFormatDbFailureAlert;
      var ROUTES_BUILTIN       = _S.ROUTES_BUILTIN;
      var LOCAL_SIGNUPS_KEY    = _S.LOCAL_SIGNUPS_KEY;
      var DEFAULT_MEET_PLACE   = _S.DEFAULT_MEET_PLACE;
      var FR_MONTHS            = _S.FR_MONTHS;
      var FR_MONTH_NAMES_UPPER = _S.FR_MONTH_NAMES_UPPER;
      var mergeHiddenBuiltinIdsSet = _S.mergeHiddenBuiltinIdsSet;
      var builtinsVisibleOnSite = _S.builtinsVisibleOnSite;
      var parseRouteFrontConfig = _S.parseRouteFrontConfig;
      var dbRowToRoute         = _S.dbRowToRoute;
      var normalizeRoutesListRows = _S.normalizeRoutesListRows;
      var enrichDepartObject   = _S.enrichDepartObject;
      var normalizeMonthWordForDisplay = _S.normalizeMonthWordForDisplay;
      var parseFrenchDateLabelParts = _S.parseFrenchDateLabelParts;
      var formatMinutesToHm    = _S.formatMinutesToHm;
      var parseSingleHmFragment = _S.parseSingleHmFragment;
      var parseDurationInputToStore = _S.parseDurationInputToStore;
      var haversine            = _S.haversine;
      var parseGpxTrack        = _S.parseGpxTrack;
      var fillElevationGaps    = _S.fillElevationGaps;
      var simplifyTrack        = _S.simplifyTrack;
      var computeElevationGainM = _S.computeElevationGainM;
      var buildTrack           = _S.buildTrack;
      var deserializeEmbeddedPointRow = _S.deserializeEmbeddedPointRow;
      var profileFromEmbeddedRows = _S.profileFromEmbeddedRows;
      var loadGpxTrack         = _S.loadGpxTrack;
      var loadRouteProfile     = _S.loadRouteProfile;
      var serializeEmbeddedPoints = _S.serializeEmbeddedPoints;
      var GPX_MAX_POINTS       = _S.GPX_MAX_POINTS;

      const START = { lat: 48.6536, lon: -2.8353, label: "Saint-Quay-Portrieux" };
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

      /* Supabase config, RPC client, and error formatting → goelo-supabase-client.js */


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


      let participantsByRoute = {};
      let localSignupsByRoute = {};
      let modalRouteRef = null;
      let showRouteHandler = null;



      function routeVisibleOnPublicSite(route) {
        if (!route || !route.id) return false;
        return !mergeHiddenBuiltinIdsSet()[String(route.id)];
      }

      /** front_config (jsonb) : objet ; certains chemins renvoient une chaîne JSON. */

      function goeloTryStrConfigVal(v) {
        if (typeof v === "string" && v.trim()) return v.trim();
        if (typeof v === "number" && Number.isFinite(v) && v !== 0) return String(v);
        return "";
      }

      /** Clés alternatives (anciens brouillons / exports) pour capitaine Team Rider. */
      function goeloRideLeaderFromFc(fc) {
        if (!fc || typeof fc !== "object") return "";
        const t = goeloTryStrConfigVal;
        return (
          t(fc.rideLeader) ||
          t(fc.ride_leader) ||
          t(fc.capitaine) ||
          t(fc.captain) ||
          t(fc.leader) ||
          t(fc.teamRider) ||
          t(fc.team_rider) ||
          ""
        );
      }

      /** Lieu de départ précis : alias JSON possibles. */
      function goeloMeetPlaceDetailFromFc(fc) {
        if (!fc || typeof fc !== "object") return "";
        const t = goeloTryStrConfigVal;
        return (
          t(fc.meetPlaceDetail) ||
          t(fc.meet_place_detail) ||
          t(fc.meet_detail) ||
          t(fc.departure_detail) ||
          t(fc.lieu_depart_precis) ||
          ""
        );
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

      /**
       * Recharge une sortie custom depuis Supabase au moment du clic « Charger »
       * (évite un cache public incomplet vs front_config admin).
       */
      async function fetchFreshCustomRouteForEdit(routeId) {
        if (!isSupabaseEnabled() || !routeId) return null;
        const forAdmin = isAdminSessionUsable();
        const adm = forAdmin ? getAdminSession() : null;
        const raw = await supabaseRpc(
          "routes_list",
          forAdmin && adm && adm.access_token
            ? { p_filter: { includeNonPublic: true } }
            : { p_filter: {} },
          forAdmin && adm && adm.access_token ? { accessToken: adm.access_token } : undefined
        );
        const rows = normalizeRoutesListRows(raw);
        const row = rows.find(function (r) {
          return r && String(r.id) === String(routeId);
        });
        if (!row) return null;
        const rk = row.route_kind != null ? row.route_kind : row.routeKind;
        if (rk !== "custom") return null;
        const cfg = dbRowToRoute(row);
        const profile = await loadRouteProfile(cfg);
        if (!profile || !profile.points || profile.points.length < 2) return null;
        return Object.assign({}, cfg, { profile: profile });
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
            const fail = _S.goeloLastRpcFailure;
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
              const fail = _S.goeloLastRpcFailure;
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
        removeNewRouteAdminOverlays();
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

      function removeNewRouteAdminOverlays() {
        const modal = document.getElementById("new-route-modal");
        if (!modal) return;
        modal.querySelectorAll(".new-route-after-save-overlay, .goelo-ig-kit-backdrop--nested").forEach(function (el) {
          el.remove();
        });
      }

      function goeloShareMessengerOpenUrl() {
        if (typeof window !== "undefined" && window.GOELO_SHARE_MESSENGER_URL) {
          const u = String(window.GOELO_SHARE_MESSENGER_URL).trim();
          if (u) return u;
        }
        return "https://www.messenger.com/";
      }

      function goeloShareInstagramOpenUrl() {
        if (typeof window !== "undefined" && window.GOELO_SHARE_INSTAGRAM_URL) {
          const u = String(window.GOELO_SHARE_INSTAGRAM_URL).trim();
          if (u) return u;
        }
        return "https://www.instagram.com/goelo.rides/";
      }

      /**
       * @param {HTMLElement} panelMountEl
       * @param {object} kitRoute
       * @param {{ wasEdit?: boolean, changeLine?: string, cancelled?: boolean }} overlayOpts
       */
      function showNewRouteAfterSaveOverlay(panelMountEl, kitRoute, overlayOpts) {
        if (!panelMountEl || !kitRoute) return;
        removeNewRouteAdminOverlays();
        const opts = overlayOpts || {};
        const wasEdit = !!opts.wasEdit;
        const changeLine = String(opts.changeLine || "").trim();
        const cancelled = !!opts.cancelled;
        const buildStory =
          typeof window.goeloRideUpdatesBuildInstagramStoryText === "function"
            ? window.goeloRideUpdatesBuildInstagramStoryText
            : null;
        const buildGroup =
          typeof window.goeloRideUpdatesBuildGroupAnnouncementText === "function"
            ? window.goeloRideUpdatesBuildGroupAnnouncementText
            : null;
        const pick =
          typeof window.goeloRideUpdatesPickVisualIdea === "function" ? window.goeloRideUpdatesPickVisualIdea : null;
        const copyFn =
          typeof window.goeloRideUpdatesCopyToClipboard === "function"
            ? window.goeloRideUpdatesCopyToClipboard
            : null;
        const commonOpts = {
          wasEdit: wasEdit,
          changeLine: changeLine,
          cancelled: cancelled,
          origin: window.location.origin
        };
        const story = buildStory ? buildStory(kitRoute, commonOpts) : "";
        const groupText = buildGroup ? buildGroup(kitRoute, commonOpts) : story || "";
        const visual = cancelled
          ? "Story ou post sobre (annulation) : titre, date, mention « annulé », fond neutre — format 9:16."
          : pick
            ? pick(kitRoute)
            : "";
        const wrap = document.createElement("div");
        wrap.className = "new-route-after-save-overlay";
        wrap.setAttribute("role", "region");
        wrap.setAttribute(
          "aria-label",
          cancelled ? "Sortie retirée — annonce réseaux" : "Après enregistrement — annonce réseaux"
        );
        const titleBlock = cancelled
          ? '<h3 class="new-route-after-save-title">Sortie retirée du site</h3>' +
            '<p class="new-route-after-save-ok">La sortie a été <strong>supprimée ou masquée</strong> dans Supabase.</p>'
          : '<h3 class="new-route-after-save-title">Sortie enregistrée</h3>' +
            (wasEdit
              ? '<p class="new-route-after-save-ok">La sortie a été <strong>mise à jour</strong> dans Supabase.</p>'
              : '<p class="new-route-after-save-ok">La sortie a été <strong>créée</strong> dans Supabase.</p>');
        const detailsOpen = cancelled ? "" : " open";
        wrap.innerHTML =
          '<div class="new-route-after-save-inner">' +
          titleBlock +
          "<p class=\"new-route-after-save-intro\">Les groupes Messenger ou Instagram <strong>ne reçoivent rien automatiquement</strong> depuis ce site (pas d’API Meta côté GoëloRides). Copie le message ci-dessous, ouvre l’app avec les boutons, puis colle dans la conversation du groupe (Messenger, DM Insta, WhatsApp…).</p>" +
          '<h4 class="new-route-after-save-sub">Message groupe</h4>' +
          '<label class="new-route-after-save-label" for="new-route-after-save-group">Texte à copier</label>' +
          '<textarea id="new-route-after-save-group" class="new-route-after-save-textarea new-route-after-save-textarea--mid" rows="9" readonly></textarea>' +
          '<div class="new-route-after-save-actions new-route-after-save-actions--spread">' +
          '<button type="button" class="btn-primary" id="new-route-after-save-copy-group">Copier le message</button>' +
          '<button type="button" class="btn-app-outline new-route-after-save-btn-messenger" id="new-route-after-save-open-messenger">Messenger</button>' +
          '<button type="button" class="btn-app-outline new-route-after-save-btn-instagram" id="new-route-after-save-open-instagram">Instagram</button>' +
          "</div>" +
          '<details class="new-route-after-save-details"' +
          detailsOpen +
          ">" +
          '<summary class="new-route-after-save-summary">Texte pour story Instagram (plus détaillé)</summary>' +
          '<label class="new-route-after-save-label" for="new-route-after-save-story">Texte à copier</label>' +
          '<textarea id="new-route-after-save-story" class="new-route-after-save-textarea" rows="9" readonly></textarea>' +
          '<div class="new-route-after-save-actions">' +
          '<button type="button" class="btn-app-outline" id="new-route-after-save-copy">Copier le texte story</button>' +
          "</div>" +
          '<h4 class="new-route-after-save-sub">Idée visuelle (Canva, Stories…)</h4>' +
          '<p class="new-route-after-save-visual" id="new-route-after-save-visual"></p>' +
          "</details>" +
          '<div class="new-route-after-save-actions new-route-after-save-actions--footer">' +
          '<button type="button" class="btn-primary" id="new-route-after-save-reload">Recharger la page</button>' +
          "</div>" +
          "</div>";
        panelMountEl.appendChild(wrap);
        const taGroup = wrap.querySelector("#new-route-after-save-group");
        if (taGroup) taGroup.value = groupText;
        const ta = wrap.querySelector("#new-route-after-save-story");
        if (ta) ta.value = story;
        const visEl = wrap.querySelector("#new-route-after-save-visual");
        if (visEl) visEl.textContent = visual;
        function bindCopy(btn, text) {
          if (!btn) return;
          if (copyFn) {
            btn.addEventListener("click", function () {
              copyFn(
                text,
                function () {
                  window.alert("Texte copié dans le presse-papiers.");
                },
                function () {
                  window.alert("Sélectionne le texte dans la zone si la copie est refusée.");
                }
              );
            });
          } else {
            btn.addEventListener("click", function () {
              window.alert("Copie : sélectionne le texte dans la zone puis Ctrl+C (ou Cmd+C).");
            });
          }
        }
        bindCopy(wrap.querySelector("#new-route-after-save-copy-group"), groupText);
        bindCopy(wrap.querySelector("#new-route-after-save-copy"), story);
        const btnMsg = wrap.querySelector("#new-route-after-save-open-messenger");
        if (btnMsg) {
          btnMsg.addEventListener("click", function () {
            try {
              window.open(goeloShareMessengerOpenUrl(), "_blank", "noopener,noreferrer");
            } catch (err) {
              void err;
              window.location.href = goeloShareMessengerOpenUrl();
            }
          });
        }
        const btnIg = wrap.querySelector("#new-route-after-save-open-instagram");
        if (btnIg) {
          btnIg.addEventListener("click", function () {
            try {
              window.open(goeloShareInstagramOpenUrl(), "_blank", "noopener,noreferrer");
            } catch (err) {
              void err;
              window.location.href = goeloShareInstagramOpenUrl();
            }
          });
        }
        const rel = wrap.querySelector("#new-route-after-save-reload");
        if (rel) {
          rel.addEventListener("click", function () {
            window.location.reload();
          });
        }
        const focusEl = taGroup || ta;
        if (focusEl) {
          try {
            focusEl.focus();
          } catch (err) {
            void err;
          }
        }
      }

      async function openNewRouteModal() {
        const modal = document.getElementById("new-route-modal");
        const form = document.getElementById("new-route-form");
        if (!modal || !form) return;
        closeGpxUploadPop();
        destroyNewRoutePreviewMap();
        removeNewRouteAdminOverlays();
        if (typeof modal.__goeloResetNewRouteDraft === "function") {
          modal.__goeloResetNewRouteDraft();
        }
        form.reset();
        const timeIn = document.getElementById("new-route-time");
        if (timeIn) timeIn.value = "08:30";
        /* Après reset(), certains navigateurs réappliquent l’état initial des boutons du formulaire :
           on resynchronise l’assistant (ex. masquer « Créer la sortie » hors dernière étape). */
        if (typeof modal.__goeloSetWizardStep === "function") {
          modal.__goeloSetWizardStep(1);
        }
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
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

      /** Inverse partiel de formatFrenchRideDateLabel : remplit l’input date si `rideDateIso` manque en base. */
      function normalizeFrMonthKey(raw) {
        return String(raw || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/œ/g, "oe")
          .replace(/æ/g, "ae");
      }

      function parseFrenchDateLabelToRideDateParts(dateLabel) {
        const dl = String(dateLabel || "").trim();
        if (!dl) return { iso: "", time: "" };
        const bits = dl.split(/\s*·\s*/);
        const main = (bits[0] || "").trim();
        const timePart = bits.length > 1 ? bits[1].trim() : "";
        const MONTHS = {
          janvier: 1,
          fevrier: 2,
          mars: 3,
          avril: 4,
          mai: 5,
          juin: 6,
          juillet: 7,
          aout: 8,
          septembre: 9,
          octobre: 10,
          novembre: 11,
          decembre: 12
        };
        const rm = main.match(/(\d{1,2})\s+([A-Za-zÀÂÄÈÉÊËÎÏÔÙÛÜÇàâäèéêëîïôùûüç]+)\s+(\d{4})/);
        if (!rm) return { iso: "", time: "" };
        const day = parseInt(rm[1], 10);
        const y = parseInt(rm[3], 10);
        const mo = MONTHS[normalizeFrMonthKey(rm[2])];
        if (!mo || !Number.isFinite(day) || !Number.isFinite(y)) return { iso: "", time: "" };
        const iso = y + "-" + String(mo).padStart(2, "0") + "-" + String(day).padStart(2, "0");
        let timeStr = "";
        if (timePart) {
          const tm = timePart.match(/(\d{1,2})\s*h\s*(\d{2})/i);
          if (tm) {
            const hh = Math.min(23, Math.max(0, parseInt(tm[1], 10)));
            const mm = Math.min(59, Math.max(0, parseInt(tm[2], 10)));
            timeStr = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
          }
        }
        return { iso: iso, time: timeStr };
      }

      function setNewRouteModalTab(tab) {
        const modal = document.getElementById("new-route-modal");
        if (!modal) return;
        const tabBtns = modal.querySelectorAll("[data-new-route-tab]");
        if (!tabBtns.length) {
          if (tab === "create" && typeof modal.__goeloSetWizardStep === "function") {
            const s =
              typeof modal.__goeloWizardStep === "number" && modal.__goeloWizardStep >= 1 && modal.__goeloWizardStep <= 5
                ? modal.__goeloWizardStep
                : 1;
            modal.__goeloSetWizardStep(s);
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
          return;
        }
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
        if (!modal || modal.hidden) return;
        const body = document.getElementById("new-route-modal-body");
        const panel =
          (body && !body.classList.contains("is-locked") && body.querySelector("#new-route-panel-" + (modal.__goeloWizardStep || 1))) ||
          modal.querySelector(".new-route-tabpanel.is-active");
        const root = panel && !panel.hidden ? panel : body;
        if (!root) return;
        const cand =
          root.querySelector(
            "input:not([type=\"hidden\"]):not([disabled]), select:not([disabled]), textarea:not([disabled])"
          ) || root.querySelector("button:not([disabled])");
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
        if (errEl) {
          errEl.textContent = "";
          errEl.hidden = true;
        }
        if (!body) return;
        if (!gate) {
          if (isAdminSessionUsable()) {
            body.classList.remove("is-locked");
          } else {
            body.classList.add("is-locked");
          }
          return;
        }
        if (isAdminSessionUsable()) {
          gate.hidden = true;
          if (toolbar) toolbar.hidden = false;
          body.classList.remove("is-locked");
        } else {
          clearAdminSession();
          gate.hidden = false;
          if (toolbar) toolbar.hidden = true;
          body.classList.add("is-locked");
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
        const GOELO_EXAMPLE_STORY_PNG_URL = "assets/gestion-sorties-story-exemple.png";

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
        var WIZARD_LAST = 5;
        let newRouteProfile = null;
        let newRouteGpxName = "";
        let newRouteCoverDataUrl = null;
        let newRouteEditId = null;
        let newRouteEditSortOrder = 40;

        function setNewRouteModalTitle(isEdit) {
          const h2 = document.getElementById("new-route-modal-title");
          if (!h2) return;
          h2.textContent = isEdit ? "Modifier la sortie" : "Nouvelle sortie";
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

        function goeloFrontStr(fc, camel, snake) {
          if (!fc || typeof fc !== "object") return "";
          const tryStr = function (v) {
            if (typeof v === "string" && v.trim()) return v.trim();
            if (typeof v === "number" && Number.isFinite(v) && v !== 0) return String(v);
            return "";
          };
          let x = tryStr(fc[camel]);
          if (x) return x;
          x = tryStr(fc[snake]);
          if (x) return x;
          if (camel === "rideLeader" || snake === "ride_leader") {
            x =
              tryStr(fc.capitaine) ||
              tryStr(fc.captain) ||
              tryStr(fc.leader) ||
              tryStr(fc.teamRider) ||
              tryStr(fc.team_rider);
            if (x) return x;
          }
          if (camel === "meetPlaceDetail" || snake === "meet_place_detail") {
            x = tryStr(fc.meet_detail) || tryStr(fc.departure_detail) || tryStr(fc.lieu_depart_precis);
            if (x) return x;
          }
          return "";
        }

        function applyRouteIntoWizard(route) {
          if (!route || !route.profile || !route.profile.points || route.profile.points.length < 2) {
            window.alert("Impossible de charger cette sortie (trace absente ou trop courte).");
            return;
          }
          const fcRaw = parseRouteFrontConfig(route.raw_front_config);
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
          if (rlEl) {
            rlEl.value =
              (route.rideLeader && String(route.rideLeader).trim()) ||
              goeloFrontStr(fcRaw, "rideLeader", "ride_leader") ||
              goeloRideLeaderFromFc(fcRaw) ||
              "";
          }
          const dEl = document.getElementById("new-route-desc");
          if (dEl) {
            dEl.value =
              (route.shortDesc && String(route.shortDesc).trim()) ||
              goeloFrontStr(fcRaw, "shortDesc", "short_desc") ||
              "";
          }
          const dateIn = document.getElementById("new-route-date");
          const timeIn = document.getElementById("new-route-time");
          if (dateIn) {
            let iso =
              route.rideDateIso && /^\d{4}-\d{2}-\d{2}$/.test(String(route.rideDateIso).trim())
                ? String(route.rideDateIso).trim()
                : "";
            if (!iso) {
              const fromLabel = parseFrenchDateLabelToRideDateParts(
                route.depart && route.depart.dateLabel ? route.depart.dateLabel : ""
              );
              if (fromLabel.iso) iso = fromLabel.iso;
            }
            dateIn.value = iso;
          }
          if (timeIn) {
            let t =
              route.rideTime && /^\d{2}:\d{2}$/.test(String(route.rideTime).trim())
                ? String(route.rideTime).trim()
                : "";
            if (!t) {
              const fromLabel = parseFrenchDateLabelToRideDateParts(
                route.depart && route.depart.dateLabel ? route.depart.dateLabel : ""
              );
              if (fromLabel.time) t = fromLabel.time;
            }
            timeIn.value = t || "08:30";
          }
          const meetD = document.getElementById("new-route-meet-detail");
          if (meetD) {
            meetD.value =
              (route.meetPlaceDetail && String(route.meetPlaceDetail).trim()) ||
              goeloFrontStr(fcRaw, "meetPlaceDetail", "meet_place_detail") ||
              goeloMeetPlaceDetailFromFc(fcRaw) ||
              "";
          }
          const durM = document.getElementById("new-route-duration-min");
          if (durM) {
            let hm =
              (route.estimatedDurationHm && String(route.estimatedDurationHm).trim()) ||
              goeloFrontStr(fcRaw, "estimatedDurationHm", "estimated_duration_hm") ||
              "";
            let mins =
              route.estimatedDurationMinutes != null && Number(route.estimatedDurationMinutes) > 0
                ? route.estimatedDurationMinutes
                : null;
            if (mins == null) {
              const nR =
                fcRaw.estimatedDurationMinutes != null ? fcRaw.estimatedDurationMinutes : fcRaw.estimated_duration_minutes;
              if (typeof nR === "number" && Number.isFinite(nR) && nR > 0) {
                mins = Math.round(nR);
              } else if (typeof nR === "string" && /^\d+$/.test(String(nR).trim())) {
                const n = parseInt(String(nR).trim(), 10);
                if (Number.isFinite(n) && n > 0) mins = Math.min(n, 36 * 60);
              }
            }
            if (hm) {
              durM.value = hm;
            } else if (mins != null) {
              durM.value = String(mins);
            } else {
              durM.value = "";
            }
          }
          const maxPIn = document.getElementById("new-route-max-p");
          if (maxPIn) {
            let maxP =
              route.maxParticipants != null && Number(route.maxParticipants) > 0
                ? Number(route.maxParticipants)
                : null;
            if (maxP == null) {
              const raw =
                fcRaw.maxParticipants != null
                  ? fcRaw.maxParticipants
                  : fcRaw.max_participants != null
                    ? fcRaw.max_participants
                    : fcRaw.max_places != null
                      ? fcRaw.max_places
                      : fcRaw.capacity != null
                        ? fcRaw.capacity
                        : null;
              if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
                maxP = Math.round(raw);
              } else if (typeof raw === "string" && String(raw).trim()) {
                const n = Math.max(0, parseInt(String(raw).replace(/\D/g, ""), 10) || 0);
                if (n > 0) maxP = n;
              }
            }
            maxPIn.value = maxP != null ? String(maxP) : "";
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
          const modalSnap = document.getElementById("new-route-modal");
          if (modalSnap && newRouteEditId) {
            modalSnap.__goeloStep3Restore = {
              routeId: newRouteEditId,
              rideLeader: rlEl ? rlEl.value : "",
              meetDetail: meetD ? meetD.value : "",
              duration: durM ? durM.value : ""
            };
          } else if (modalSnap) {
            modalSnap.__goeloStep3Restore = null;
          }
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
          const maxStr = maxEl ? maxEl.value.trim() : "";
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

        function formatDateFrNewRoute(iso) {
          if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
          const p = iso.split("-");
          const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
          if (Number.isNaN(d.getTime())) return iso;
          try {
            return d.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric"
            });
          } catch (e) {
            void e;
            return iso;
          }
        }

        /** Ex. « 14 JUILLET » pour encarts type flyer. */
        function formatDateFlyerShort(iso) {
          if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
          const p = iso.split("-");
          const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
          if (Number.isNaN(d.getTime())) return "—";
          try {
            const day = d.toLocaleDateString("fr-FR", { day: "numeric" });
            const mon = d.toLocaleDateString("fr-FR", { month: "long" });
            return (day + " " + mon).toUpperCase();
          } catch (e) {
            void e;
            return iso;
          }
        }

        function niveauLabelNewRoute(code) {
          if (code === "bleu") return "Bleu";
          if (code === "rouge") return "Rouge";
          return "Vert";
        }

        function readNewRoutePublishSnapshot() {
          const trackEl = document.getElementById("new-route-track");
          const dateEl = document.getElementById("new-route-date");
          const timeEl = document.getElementById("new-route-time");
          const meetDEl = document.getElementById("new-route-meet-detail");
          const descEl = document.getElementById("new-route-desc");
          const nom = trackEl ? trackEl.value.trim() : "";
          const dateStr = dateEl ? dateEl.value.trim() : "";
          const heure = timeEl ? timeEl.value.trim() : "";
          const detailRaw = meetDEl ? meetDEl.value.trim() : "";
          const detail = detailRaw.length <= 1 ? "" : detailRaw;
          const defMeet =
            typeof SHARED !== "undefined" && SHARED && SHARED.meetPlace
              ? String(SHARED.meetPlace).trim()
              : "";
          const lieu = detail ? detail + (defMeet ? " — " + defMeet : "") : defMeet || "—";
          let kmStr = "—";
          if (newRouteProfile && typeof newRouteProfile.totalKm === "number" && Number.isFinite(newRouteProfile.totalKm)) {
            kmStr = formatKm(newRouteProfile.totalKm);
          }
          const lvRaw = (form.querySelector('input[name="new-route-level"]:checked') || {}).value || "level-vert";
          const niveau =
            lvRaw === "level-bleu" ? "bleu" : lvRaw === "level-rouge" ? "rouge" : "vert";
          const com = descEl ? descEl.value.trim() : "";
          const dateL = formatDateFrNewRoute(dateStr);
          const dateFlyerShort = formatDateFlyerShort(dateStr);
          const nivLab = niveauLabelNewRoute(niveau);
          const infos = com ? com : "—";
          return { nom, dateStr, heure, lieu, kmStr, niveau, nivLab, infos, dateL, dateFlyerShort };
        }

        function updateNewRoutePublishPreviews() {
          /* Anciens blocs Facebook / Instagram retirés : le flyer (étape 5) utilise readNewRoutePublishSnapshot côté génération. */
        }

        function splitCanvasLinesByWidth(ctx, text, maxW) {
          const t = String(text || "").trim() || "—";
          const words = t.split(/\s+/);
          const lines = [];
          let cur = "";
          words.forEach(function (w) {
            const test = cur ? cur + " " + w : w;
            if (ctx.measureText(test).width <= maxW) {
              cur = test;
            } else {
              if (cur) lines.push(cur);
              cur = w;
            }
          });
          if (cur) lines.push(cur);
          return lines.length ? lines : [t];
        }

        function buildNewRouteFlyerDataUrl(done) {
          const snap = readNewRoutePublishSnapshot();
          if (!snap.nom || !snap.dateStr || !snap.heure) {
            done("Indique au minimum le titre, la date et l’heure (étapes 1 et 3).", null);
            return;
          }
          const flyerBgCustom =
            typeof window !== "undefined" && window.GOELO_FLYER_BG_URL && String(window.GOELO_FLYER_BG_URL).trim()
              ? String(window.GOELO_FLYER_BG_URL).trim()
              : "";
          const flyerBgChain = flyerBgCustom
            ? [flyerBgCustom]
            : ["assets/goelo-flyer-bg.jpg", "assets/goelo-flyer-bg.png", GOELO_EXAMPLE_STORY_PNG_URL];

          function fetchFlyerBg(i) {
            if (i >= flyerBgChain.length) {
              return Promise.reject(new Error("nobg"));
            }
            return fetch(flyerBgChain[i]).then(function (res) {
              if (res.ok) {
                return res.blob();
              }
              return fetchFlyerBg(i + 1);
            });
          }

          function niveauFlyerSub(code) {
            if (code === "rouge") return "RYTHME SOUTENU";
            if (code === "bleu") return "GROUPE À JALON";
            return "TOUS NIVEAUX";
          }

          function drawRoundRect(ctx, x, y, rw, rh, r, fill, stroke) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + rw, y, x + rw, y + rh, r);
            ctx.arcTo(x + rw, y + rh, x, y + rh, r);
            ctx.arcTo(x, y + rh, x, y, r);
            ctx.arcTo(x, y, x + rw, y, r);
            ctx.closePath();
            if (fill) {
              ctx.fillStyle = fill;
              ctx.fill();
            }
            if (stroke) {
              ctx.strokeStyle = stroke;
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }

          function drawIconCalendar(ctx, cx, cy, s) {
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.lineWidth = Math.max(2, s * 0.08);
            const x = cx - s * 0.35;
            const y = cy - s * 0.3;
            const w = s * 0.7;
            const h = s * 0.55;
            ctx.beginPath();
            ctx.moveTo(x, y + s * 0.12);
            ctx.lineTo(x + w, y + s * 0.12);
            ctx.lineTo(x + w, y + h);
            ctx.lineTo(x, y + h);
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y + s * 0.12);
            ctx.lineTo(x, y);
            ctx.lineTo(x + w, y);
            ctx.lineTo(x + w, y + s * 0.12);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + w * 0.35, y + s * 0.22);
            ctx.lineTo(x + w * 0.65, y + s * 0.22);
            ctx.stroke();
          }

          function drawIconPin(ctx, cx, cy, s) {
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.lineWidth = Math.max(2, s * 0.08);
            ctx.beginPath();
            ctx.moveTo(cx, cy - s * 0.32);
            ctx.bezierCurveTo(
              cx - s * 0.28,
              cy - s * 0.32,
              cx - s * 0.32,
              cy + s * 0.02,
              cx,
              cy + s * 0.36
            );
            ctx.bezierCurveTo(
              cx + s * 0.32,
              cy + s * 0.02,
              cx + s * 0.28,
              cy - s * 0.32,
              cx,
              cy - s * 0.32
            );
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy - s * 0.08, s * 0.1, 0, Math.PI * 2);
            ctx.stroke();
          }

          function drawIconBike(ctx, cx, cy, s) {
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.lineWidth = Math.max(2, s * 0.08);
            const r = s * 0.14;
            ctx.beginPath();
            ctx.arc(cx - s * 0.22, cy + s * 0.12, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + s * 0.22, cy + s * 0.12, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.22, cy + s * 0.12);
            ctx.lineTo(cx - s * 0.05, cy - s * 0.18);
            ctx.lineTo(cx + s * 0.12, cy - s * 0.18);
            ctx.lineTo(cx + s * 0.22, cy + s * 0.12);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.05, cy - s * 0.18);
            ctx.lineTo(cx + s * 0.02, cy - s * 0.28);
            ctx.stroke();
          }

          function drawLogoMountains(ctx, x, y, s) {
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.beginPath();
            ctx.moveTo(x, y + s);
            ctx.lineTo(x + s * 0.42, y + s * 0.32);
            ctx.lineTo(x + s * 0.68, y + s);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x + s * 0.32, y + s);
            ctx.lineTo(x + s * 0.72, y + s * 0.38);
            ctx.lineTo(x + s * 1.05, y + s);
            ctx.closePath();
            ctx.fill();
          }

          function drawFooterWaves(ctx, cx, cy, s) {
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2;
            for (let i = -1; i <= 1; i++) {
              ctx.beginPath();
              const ox = cx + i * s * 0.22;
              ctx.moveTo(ox - s * 0.2, cy);
              ctx.quadraticCurveTo(ox - s * 0.1, cy - s * 0.12, ox, cy);
              ctx.quadraticCurveTo(ox + s * 0.1, cy + s * 0.12, ox + s * 0.2, cy);
              ctx.stroke();
            }
          }

          function drawFooterPeople(ctx, cx, cy, s) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            for (let i = -1; i <= 1; i++) {
              const px = cx + i * s * 0.2;
              ctx.beginPath();
              ctx.arc(px, cy - s * 0.08, s * 0.08, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillRect(px - s * 0.1, cy + s * 0.02, s * 0.2, s * 0.22);
            }
          }

          function drawFooterMountain(ctx, cx, cy, s) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.28, cy + s * 0.18);
            ctx.lineTo(cx - s * 0.08, cy - s * 0.12);
            ctx.lineTo(cx + s * 0.1, cy + s * 0.05);
            ctx.lineTo(cx + s * 0.28, cy - s * 0.18);
            ctx.lineTo(cx + s * 0.38, cy + s * 0.18);
            ctx.closePath();
            ctx.fill();
          }

          function drawIconDistance(ctx, cx, cy, s) {
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.lineWidth = Math.max(2, s * 0.08);
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.26, cy + s * 0.06);
            ctx.quadraticCurveTo(cx - s * 0.1, cy - s * 0.14, cx + s * 0.05, cy + s * 0.08);
            ctx.quadraticCurveTo(cx + s * 0.18, cy - s * 0.1, cx + s * 0.28, cy + s * 0.04);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + s * 0.28, cy + s * 0.1, s * 0.07, 0, Math.PI * 2);
            ctx.stroke();
          }

          function drawInfoRow(ctx, y, iconDraw, line1, line2) {
            const box = 56;
            const ix = 22;
            const iy = y;
            drawRoundRect(ctx, ix, iy, box, box, 8, "rgba(42, 92, 88, 0.95)", "rgba(255,255,255,0.2)");
            ctx.save();
            ctx.translate(ix + box / 2, iy + box / 2);
            iconDraw(ctx, 0, 0, 44);
            ctx.restore();
            const tx = ix + box + 14;
            ctx.textBaseline = "top";
            ctx.fillStyle = "#ffffff";
            ctx.font = "800 20px system-ui, -apple-system, 'Segoe UI', sans-serif";
            ctx.fillText(line1, tx, iy + 6);
            const sub = line2 != null ? String(line2).trim() : "";
            if (sub) {
              ctx.font = "600 13px system-ui, -apple-system, 'Segoe UI', sans-serif";
              ctx.fillStyle = "rgba(255,255,255,0.88)";
              ctx.fillText(sub, tx, iy + 30);
            }
          }

          fetchFlyerBg(0)
            .then(function (blob) {
              return new Promise(function (resolve, reject) {
                const u = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = function () {
                  URL.revokeObjectURL(u);
                  try {
                    const iw = img.naturalWidth;
                    const ih = img.naturalHeight;
                    if (!iw || !ih) {
                      reject(new Error("img"));
                      return;
                    }
                    const OUT_W = 720;
                    const OUT_H = 1280;
                    const targetAspect = 9 / 16;
                    let sx;
                    let sy;
                    let sw;
                    let sh;
                    if (iw / ih > targetAspect) {
                      sh = ih;
                      sw = Math.round(ih * targetAspect);
                      sx = Math.round((iw - sw) / 2);
                      sy = 0;
                    } else {
                      sw = iw;
                      sh = Math.round(iw / targetAspect);
                      sx = 0;
                      sy = Math.round((ih - sh) / 2);
                    }
                    const canvas = document.createElement("canvas");
                    canvas.width = OUT_W;
                    canvas.height = OUT_H;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                      reject(new Error("canvas"));
                      return;
                    }
                    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);
                    /* Voile vert : zone haute + assez de hauteur pour couvrir le bloc infos (dont niveau / couleur) et le texte éventuel sur la photo. */
                    const overlayH = OUT_H * 0.62;
                    const overlayW = OUT_W * 0.72;
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, overlayW, overlayH);
                    ctx.clip();
                    const grad = ctx.createLinearGradient(0, 0, overlayW * 0.92, 0);
                    grad.addColorStop(0, "rgba(16, 52, 50, 0.91)");
                    grad.addColorStop(0.45, "rgba(16, 52, 50, 0.62)");
                    grad.addColorStop(0.75, "rgba(16, 52, 50, 0.22)");
                    grad.addColorStop(1, "rgba(16, 52, 50, 0)");
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, overlayW, overlayH);
                    const gradV = ctx.createLinearGradient(0, 0, 0, overlayH);
                    gradV.addColorStop(0, "rgba(12, 44, 42, 0.35)");
                    gradV.addColorStop(0.45, "rgba(12, 44, 42, 0.14)");
                    gradV.addColorStop(0.78, "rgba(12, 44, 42, 0.06)");
                    gradV.addColorStop(1, "rgba(12, 44, 42, 0)");
                    ctx.fillStyle = gradV;
                    ctx.fillRect(0, 0, overlayW, overlayH);
                    ctx.restore();

                    const words = snap.nom.split(/\s+/).filter(Boolean);
                    let titleLine1;
                    let titleLine2;
                    if (words.length >= 2) {
                      titleLine1 = words[0].toUpperCase();
                      titleLine2 = words.slice(1).join(" ").toUpperCase();
                    } else {
                      titleLine1 = "SORTIE";
                      titleLine2 = snap.nom.toUpperCase();
                    }

                    drawLogoMountains(ctx, 20, 22, 22);
                    ctx.fillStyle = "#ffffff";
                    ctx.textBaseline = "top";
                    ctx.font = "800 17px system-ui, -apple-system, 'Segoe UI', sans-serif";
                    ctx.fillText("GOËLORIDES", 54, 28);

                    ctx.fillStyle = "rgba(200, 230, 232, 0.95)";
                    ctx.font = "800 26px system-ui, -apple-system, 'Segoe UI', sans-serif";
                    ctx.fillText(titleLine1, 20, 72);
                    ctx.fillStyle = "#ffffff";
                    let ty = 100;
                    const titleMaxW = OUT_W * 0.52;
                    const titleMaxLines = 4;
                    let titleFs = 46;
                    let titleStep = 50;
                    let title2Lines = [];
                    for (titleFs = 46; titleFs >= 32; titleFs -= 2) {
                      ctx.font = "800 " + titleFs + "px system-ui, -apple-system, 'Segoe UI', sans-serif";
                      title2Lines = splitCanvasLinesByWidth(ctx, titleLine2, titleMaxW);
                      if (title2Lines.length <= titleMaxLines) {
                        break;
                      }
                    }
                    title2Lines = title2Lines.slice(0, titleMaxLines);
                    if (title2Lines.length >= 4) {
                      titleStep = 42;
                    } else if (title2Lines.length === 3) {
                      titleStep = 46;
                    } else {
                      titleStep = 50;
                    }
                    ctx.font = "800 " + titleFs + "px system-ui, -apple-system, 'Segoe UI', sans-serif";
                    title2Lines.forEach(function (ln) {
                      ctx.fillText(ln, 20, ty);
                      ty += titleStep;
                    });
                    ty += 4;
                    ctx.font = "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
                    ctx.fillStyle = "rgba(255,255,255,0.82)";
                    ctx.fillText("ROULER   ·   DÉCOUVRIR   ·   PARTAGER", 20, ty);

                    const rowY0 = ty + 36;
                    const lieuOne =
                      splitCanvasLinesByWidth(ctx, snap.lieu, OUT_W * 0.48)[0] ||
                      String(snap.lieu || "—").slice(0, 28);
                    drawInfoRow(ctx, rowY0, drawIconCalendar, snap.dateFlyerShort, snap.heure);
                    drawInfoRow(ctx, rowY0 + 84, drawIconPin, lieuOne, "");
                    drawInfoRow(ctx, rowY0 + 168, drawIconDistance, snap.kmStr, "Distance (GPX)");
                    drawInfoRow(ctx, rowY0 + 252, drawIconBike, snap.nivLab.toUpperCase(), niveauFlyerSub(snap.niveau));

                    const fy = OUT_H - 118;
                    const colW = OUT_W / 3;
                    const foot = [
                      { draw: drawFooterWaves, t2: "BORD DE MER" },
                      { draw: drawFooterPeople, t2: "ALLURE COLLECTIVE" },
                      { draw: drawFooterMountain, t2: "PAS UNE COURSE" }
                    ];
                    ctx.textAlign = "center";
                    foot.forEach(function (col, idx) {
                      const cx = colW * idx + colW * 0.5;
                      ctx.save();
                      col.draw(ctx, cx, fy + 8, 26);
                      ctx.restore();
                      ctx.font = "700 9px system-ui, -apple-system, 'Segoe UI', sans-serif";
                      ctx.fillStyle = "rgba(255,255,255,0.78)";
                      ctx.fillText(col.t2, cx, fy + 38);
                    });
                    ctx.textAlign = "left";

                    const sealR = 34;
                    const scx = OUT_W - sealR - 16;
                    const scy = sealR + 16;
                    ctx.beginPath();
                    ctx.arc(scx, scy, sealR, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(35, 78, 74, 0.92)";
                    ctx.fill();
                    ctx.strokeStyle = "rgba(255,255,255,0.35)";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.save();
                    drawLogoMountains(ctx, scx - 18, scy - 14, 14);
                    ctx.restore();
                    ctx.fillStyle = "rgba(255,255,255,0.88)";
                    ctx.font = "600 6px system-ui, sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("GOËLO", scx, scy + 8);
                    ctx.textAlign = "left";

                    let q = 0.88;
                    let dataUrl = canvas.toDataURL("image/jpeg", q);
                    let guard = 0;
                    while (dataUrl.length > 520000 && guard < 12 && q > 0.45) {
                      q -= 0.06;
                      dataUrl = canvas.toDataURL("image/jpeg", q);
                      guard += 1;
                    }
                    if (dataUrl.length > 600000) {
                      reject(new Error("big"));
                      return;
                    }
                    resolve(dataUrl);
                  } catch (e) {
                    reject(e);
                  }
                };
                img.onerror = function () {
                  URL.revokeObjectURL(u);
                  reject(new Error("img"));
                };
                img.src = u;
              });
            })
            .then(function (dataUrl) {
              done(null, dataUrl);
            })
            .catch(function () {
              done(
                "Image de fond introuvable. Ajoute assets/goelo-flyer-bg.jpg (ou .png) dans le dossier assets, ou définis window.GOELO_FLYER_BG_URL vers ta photo paysage.",
                null
              );
            });
        }

        function setWizardStep(s) {
          wizardStep = Math.max(1, Math.min(WIZARD_LAST, s));
          for (let i = 1; i <= WIZARD_LAST; i++) {
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
          if (nextBtn) nextBtn.hidden = wizardStep >= WIZARD_LAST;
          if (submitBtn) {
            submitBtn.hidden = wizardStep < WIZARD_LAST;
            if (!submitBtn.hidden) {
              submitBtn.textContent = newRouteEditId ? "Enregistrer les modifications" : "Créer la sortie";
            }
          }
          modal.__goeloWizardStep = wizardStep;
          if (wizardStep === 3) {
            const snap = modal.__goeloStep3Restore;
            if (snap && newRouteEditId && snap.routeId === newRouteEditId) {
              const rl = document.getElementById("new-route-ride-leader");
              const md = document.getElementById("new-route-meet-detail");
              const du = document.getElementById("new-route-duration-min");
              if (rl && !String(rl.value || "").trim() && String(snap.rideLeader || "").trim()) {
                rl.value = snap.rideLeader;
              }
              if (md && !String(md.value || "").trim() && String(snap.meetDetail || "").trim()) {
                md.value = snap.meetDetail;
              }
              if (du && !String(du.value || "").trim() && String(snap.duration || "").trim()) {
                du.value = snap.duration;
              }
            }
          }
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

        function goeloPublishOpenUrl(key, fallback) {
          var u =
            typeof window !== "undefined" && window[key] && String(window[key]).trim()
              ? String(window[key]).trim()
              : fallback;
          try {
            window.open(u, "_blank", "noopener,noreferrer");
          } catch (err) {
            void err;
            window.location.href = u;
          }
        }

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
          if (maxPIn) maxPIn.value = "";
          const mSnap = document.getElementById("new-route-modal");
          if (mSnap) mSnap.__goeloStep3Restore = null;
          const stEl = document.getElementById("new-route-status");
          if (stEl) stEl.value = "open";
          const visEl = document.getElementById("new-route-visibility");
          if (visEl) visEl.value = "public";
          const titleIn = document.getElementById("new-route-track");
          if (titleIn) titleIn.removeAttribute("data-title-auto");
          if (gpxInput) gpxInput.value = "";
          const submitBtnReset = document.getElementById("new-route-submit");
          if (submitBtnReset) submitBtnReset.textContent = "Créer la sortie";
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
          if (modal && !modal.hidden) {
            if (modal.querySelector(".new-route-after-save-overlay, .goelo-ig-kit-backdrop--nested")) {
              removeNewRouteAdminOverlays();
              return;
            }
            closeNewRouteModal();
          }
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

        async function loadSelectedEditRouteIntoWizard() {
          const sel = document.getElementById("new-route-edit-select");
          const id = sel && sel.value ? sel.value.trim() : "";
          if (!id) {
            if (typeof modal.__goeloResetNewRouteDraft === "function") {
              modal.__goeloResetNewRouteDraft();
            }
            form.reset();
            const timeIn = document.getElementById("new-route-time");
            if (timeIn) timeIn.value = "08:30";
            return false;
          }
          const btnEl = document.getElementById("new-route-edit-load");
          if (btnEl) btnEl.disabled = true;
          let route = loadedRoutesCache.find(function (r) {
            return r.id === id;
          });
          try {
            const fresh = await fetchFreshCustomRouteForEdit(id);
            if (fresh) {
              route = fresh;
              const idx = loadedRoutesCache.findIndex(function (r) {
                return r && r.id === id;
              });
              if (idx >= 0) loadedRoutesCache[idx] = fresh;
              else loadedRoutesCache.push(fresh);
            }
          } catch (err) {
            void err;
          } finally {
            if (btnEl) btnEl.disabled = false;
          }
          if (!route) {
            window.alert("Sortie introuvable. Recharge la page si tu viens d’en créer une.");
            return false;
          }
          applyRouteIntoWizard(route);
          return true;
        }

        async function openNewRouteModalFromListForEdit(routeId) {
          var rid = routeId != null ? String(routeId).trim() : "";
          if (!rid) return;
          await openNewRouteModal();
          var sel = document.getElementById("new-route-edit-select");
          if (sel) {
            sel.value = rid;
          }
          if (!isAdminSessionUsable()) {
            syncNewRouteAdminUi();
            return;
          }
          await loadSelectedEditRouteIntoWizard();
        }

        async function quickCancelSortieFromList(routeId) {
          var rid = routeId != null ? String(routeId).trim() : "";
          if (!rid) return;
          if (!isSupabaseEnabled()) {
            window.alert("Connecte Supabase (clé anon) pour modifier une sortie.");
            return;
          }
          if (!isAdminSessionUsable()) {
            window.alert(
              "Connexion Team Rider requise : sur la page Sorties, déplie « Équipe organisatrice », identifie-toi, puis réessaie."
            );
            await openNewRouteModal();
            syncNewRouteAdminUi();
            return;
          }
          if (
            !window.confirm(
              "Marquer cette sortie comme annulée sur le site ?\n\nLes inscriptions restent en base ; la fiche indiquera que la sortie est annulée."
            )
          ) {
            return;
          }
          const fresh = await fetchFreshCustomRouteForEdit(rid);
          if (!fresh || String(fresh.routeKind || "") !== "custom") {
            window.alert("Sortie introuvable ou parcours intégré : annulation impossible depuis la liste.");
            return;
          }
          const fc = parseRouteFrontConfig(fresh.raw_front_config);
          const merged = Object.assign({}, fc, { sortieStatus: "cancelled" });
          const admTok = getAdminSession();
          let data = await supabaseRpc(
            "route_update",
            {
              p_route_id: rid,
              p_track_name: String(fresh.track || "Sortie").trim() || "Sortie",
              p_group_label: String(fresh.name || "").trim(),
              p_pace_label: String(fresh.pace || "—").trim() || "—",
              p_front_config: merged,
              p_sort_order:
                typeof fresh.sortOrder === "number" && Number.isFinite(fresh.sortOrder) ? fresh.sortOrder : 40
            },
            { accessToken: admTok && admTok.access_token ? admTok.access_token : "" }
          );
          if (Array.isArray(data)) data = data[0];
          if (!data || !data.ok) {
            const fail = _S.goeloLastRpcFailure;
            if (fail && fail.httpStatus === 401) {
              clearAdminSession();
              syncNewRouteAdminUi();
              window.alert("Session expirée ou refusée. Reconnecte-toi en administrateur.");
              return;
            }
            if (data && data.error === "forbidden") {
              window.alert("Ce compte n’a pas le droit d’enregistrer.");
              return;
            }
            const code = fail ? fail.code : 40;
            window.alert(
              goeloFormatDbFailureAlert(code, fail && fail.httpStatus, fail && fail.fnName, fail && fail.body)
            );
            return;
          }
          try {
            window.dispatchEvent(new CustomEvent("goelo-routes-need-refresh"));
          } catch (e) {
            void e;
          }
          window.alert("La sortie est marquée comme annulée sur le site.");
        }

        const editLoadBtn = document.getElementById("new-route-edit-load");
        if (editLoadBtn && !editLoadBtn.dataset.goeloBound) {
          editLoadBtn.dataset.goeloBound = "1";
          editLoadBtn.addEventListener("click", function () {
            void loadSelectedEditRouteIntoWizard();
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
            if (!route) {
              window.alert("Sortie introuvable. Recharge la page si tu viens d’en créer une.");
              return;
            }
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
              const fail = _S.goeloLastRpcFailure;
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
            const dlg = document.querySelector("#new-route-modal .signup-modal-dialog");
            const kitRouteCancel = {
              id: route.id,
              track: route.track || label,
              name: route.name || "",
              depart: route.depart && typeof route.depart === "object" ? route.depart : { dateLabel: "" },
              meetPlace: route.meetPlace || "",
              meetPlaceDetail: route.meetPlaceDetail || "",
              pace: route.pace || "",
              raceType: route.raceType || "",
              color: route.color || "#3d8b8b",
              profile: route.profile && typeof route.profile === "object" ? route.profile : {}
            };
            if (dlg) {
              try {
                showNewRouteAfterSaveOverlay(dlg, kitRouteCancel, {
                  wasEdit: false,
                  changeLine: "",
                  cancelled: true
                });
              } catch (err) {
                void err;
                window.alert(
                  data && data.kind === "builtin_hidden"
                    ? "Parcours intégré masqué sur le site. La page va se recharger."
                    : "Sortie supprimée. La page va se recharger."
                );
                window.location.reload();
              }
            } else {
              window.alert(
                data && data.kind === "builtin_hidden"
                  ? "Parcours intégré masqué sur le site. La page va se recharger."
                  : "Sortie supprimée. La page va se recharger."
              );
              window.location.reload();
            }
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

        function applyNewRouteCoverDataUrl(dataUrl) {
          if (!coverPreview) return;
          if (!dataUrl) {
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
                applyNewRouteCoverDataUrl(null);
                return;
              }
              applyNewRouteCoverDataUrl(dataUrl);
            });
          });
        }

        const coverFromExampleBtn = document.getElementById("new-route-cover-from-example");
        if (coverFromExampleBtn && coverPreview && !coverFromExampleBtn.dataset.goeloBound) {
          coverFromExampleBtn.dataset.goeloBound = "1";
          coverFromExampleBtn.addEventListener("click", function () {
            const exUrl = GOELO_EXAMPLE_STORY_PNG_URL;
            coverFromExampleBtn.disabled = true;
            fetch(exUrl)
              .then(function (res) {
                if (!res.ok) throw new Error("bad");
                return res.blob();
              })
              .then(function (blob) {
                const f = new File([blob], "gestion-sorties-story-exemple.png", {
                  type: blob.type && /^image\//.test(blob.type) ? blob.type : "image/png"
                });
                shrinkImageToDataUrl(f, 960, 0.82, function (dataUrl) {
                  coverFromExampleBtn.disabled = false;
                  if (!dataUrl) {
                    window.alert(
                      "Le modèle est trop lourd après compression. Utilise « Choisir une image » avec le fichier PNG local, ou une version plus légère."
                    );
                    return;
                  }
                  applyNewRouteCoverDataUrl(dataUrl);
                });
              })
              .catch(function () {
                coverFromExampleBtn.disabled = false;
                window.alert(
                  "Impossible de charger « " +
                    exUrl +
                    " ». Vérifie que le fichier est bien présent dans le dossier assets du site (déploiement)."
                );
              });
          });
        }

        (function bindNewRoutePublishStep6Flyer() {
          let lastGeneratedFlyerDataUrl = null;
          const flyerGen = document.getElementById("new-route-publish-generate-flyer");
          const flyerWrap = document.getElementById("new-route-publish-flyer-wrap");
          const flyerImg = document.getElementById("new-route-publish-flyer-preview");
          const flyerDl = document.getElementById("new-route-publish-download-flyer");
          const flyerCp = document.getElementById("new-route-publish-copy-flyer");

          function dataUrlToBlob(dataUrl) {
            const parts = String(dataUrl).split(",");
            if (parts.length < 2) return null;
            const mimeMatch = parts[0].match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
            const bin = atob(parts[1]);
            const len = bin.length;
            const arr = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              arr[i] = bin.charCodeAt(i);
            }
            return new Blob([arr], { type: mime });
          }

          /** PNG pour le presse-papiers : Chrome / Edge refusent souvent image/jpeg dans ClipboardItem. */
          function dataUrlToPngBlob(dataUrl) {
            return new Promise(function (resolve) {
              const img = new Image();
              img.onload = function () {
                try {
                  const w = img.naturalWidth;
                  const h = img.naturalHeight;
                  if (!w || !h) {
                    resolve(null);
                    return;
                  }
                  const c = document.createElement("canvas");
                  c.width = w;
                  c.height = h;
                  const x = c.getContext("2d");
                  if (!x) {
                    resolve(null);
                    return;
                  }
                  x.drawImage(img, 0, 0);
                  c.toBlob(function (b) {
                    resolve(b || null);
                  }, "image/png");
                } catch (e) {
                  void e;
                  resolve(null);
                }
              };
              img.onerror = function () {
                resolve(null);
              };
              img.src = dataUrl;
            });
          }

          function showGeneratedFlyer(dataUrl) {
            lastGeneratedFlyerDataUrl = dataUrl;
            if (flyerImg) {
              flyerImg.src = dataUrl;
            }
            if (flyerWrap) {
              flyerWrap.hidden = false;
            }
          }

          if (flyerGen && !flyerGen.dataset.goeloBound) {
            flyerGen.dataset.goeloBound = "1";
            flyerGen.addEventListener("click", function () {
              flyerGen.disabled = true;
              buildNewRouteFlyerDataUrl(function (err, dataUrl) {
                flyerGen.disabled = false;
                if (err || !dataUrl) {
                  window.alert(err || "Génération flyer impossible.");
                  return;
                }
                showGeneratedFlyer(dataUrl);
              });
            });
          }

          if (flyerDl && !flyerDl.dataset.goeloBound) {
            flyerDl.dataset.goeloBound = "1";
            flyerDl.addEventListener("click", function () {
              if (!lastGeneratedFlyerDataUrl) return;
              const snap = readNewRoutePublishSnapshot();
              const base =
                (snap.nom || "goelorides-flyer")
                  .replace(/[^\w\-\s\u00C0-\u024f]+/gi, "_")
                  .replace(/\s+/g, "-")
                  .slice(0, 40) || "goelorides-flyer";
              const a = document.createElement("a");
              a.href = lastGeneratedFlyerDataUrl;
              a.download = base + "-flyer.jpg";
              a.rel = "noopener";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            });
          }

          if (flyerCp && !flyerCp.dataset.goeloBound) {
            flyerCp.dataset.goeloBound = "1";
            flyerCp.addEventListener("click", function () {
              void (async function () {
                if (!lastGeneratedFlyerDataUrl) return;
                if (!navigator.clipboard || typeof navigator.clipboard.write !== "function") {
                  window.alert(
                    "Copie d’image non disponible (navigateur ou page non sécurisée). Utilise « Télécharger (JPEG) » puis envoie le fichier."
                  );
                  return;
                }
                if (typeof window.ClipboardItem === "undefined") {
                  window.alert("Copie d’image non supportée par ce navigateur. Utilise « Télécharger (JPEG) ».");
                  return;
                }
                try {
                  const pngBlob = await dataUrlToPngBlob(lastGeneratedFlyerDataUrl);
                  const jpegBlob = dataUrlToBlob(lastGeneratedFlyerDataUrl);
                  const itemDict = {};
                  if (pngBlob && pngBlob.size) {
                    itemDict["image/png"] = pngBlob;
                  }
                  if (jpegBlob && jpegBlob.size && !itemDict["image/png"]) {
                    itemDict["image/jpeg"] = jpegBlob;
                  }
                  if (!Object.keys(itemDict).length) {
                    throw new Error("blob");
                  }
                  await navigator.clipboard.write([new ClipboardItem(itemDict)]);
                  window.alert("Flyer copié — colle-le dans ton réseau social.");
                } catch (err) {
                  void err;
                  window.alert(
                    "Impossible de copier le flyer dans le presse-papiers. Utilise « Télécharger (JPEG) » puis importe le fichier dans ton appli (souvent plus fiable)."
                  );
                }
              })();
            });
          }
        })();

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
          if (wizardStep !== WIZARD_LAST) {
            window.alert(
              "Va jusqu’à la dernière étape (« Récapitulatif et flyer ») avec « Suivant », puis valide avec « Créer la sortie » ou « Enregistrer les modifications »."
            );
            setWizardStep(WIZARD_LAST);
            return;
          }
          const editSelectGuard = document.getElementById("new-route-edit-select");
          const pickedListRouteId =
            editSelectGuard && editSelectGuard.value ? String(editSelectGuard.value).trim() : "";
          if (pickedListRouteId && !newRouteEditId) {
            window.alert(
              "Le brouillon n’est pas lié à une sortie existante. Ferme cette fenêtre, puis rouvre « Modifier » depuis la carte de la sortie."
            );
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

          if (!rideLeaderStr) {
            if (
              !window.confirm(
                "Tu n’as pas indiqué de capitaine (Team Rider) : la fiche n’affichera pas de nom sur cette ligne. Continuer quand même ?"
              )
            ) {
              return;
            }
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
          if (!durRaw) {
            if (
              !window.confirm(
                "Tu n’as pas indiqué de temps estimé sur la route : la fiche restera sans durée affichée pour les participant·e·s. Continuer quand même ?"
              )
            ) {
              return;
            }
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

          const meetPlaceVal = (function () {
            const def = SHARED && SHARED.meetPlace ? String(SHARED.meetPlace).trim() : "";
            if (!newRouteEditId) return def || "Devant le Kasino";
            const prev = loadedRoutesCache.find(function (r) {
              return r && r.id === newRouteEditId;
            });
            const mp =
              prev && typeof prev.meetPlace === "string" && prev.meetPlace.trim()
                ? prev.meetPlace.trim()
                : "";
            return mp || def || "Devant le Kasino";
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
            meetPlace: meetPlaceVal,
            meetPlaceDetail: meetDetailStr,
            estimatedDurationHm: durParsed ? durParsed.hm : "",
            estimatedDurationMinutes: durParsed ? durParsed.minutes : null,
            maxParticipants: maxPRaw,
            max_participants: maxPRaw,
            sortieStatus: sortieStatusVal,
            visibility: visibilityVal,
            ride_leader: rideLeaderStr,
            meet_place: meetPlaceVal,
            meet_place_detail: meetDetailStr,
            estimated_duration_hm: durParsed ? durParsed.hm : "",
            estimated_duration_minutes: durParsed ? durParsed.minutes : null
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
            const fail = _S.goeloLastRpcFailure;
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
          const routeIdForKit =
            (data && data.route_id != null && String(data.route_id).trim()) ||
            (newRouteEditId != null && String(newRouteEditId).trim()) ||
            "";
          const kitRoute = {
            id: routeIdForKit,
            track: track,
            name: group || raceTypeLabel(rt),
            depart: frontConfig.depart,
            meetPlace: meetPlaceVal,
            meetPlaceDetail: meetDetailStr,
            pace: pace || "—",
            raceType: rt,
            color: cols.color,
            profile: { totalKm: newRouteProfile.totalKm }
          };
          const kitPayload = {
            route: kitRoute,
            wasEdit: wasEdit,
            changeLine: wasEdit ? "Les participant·e·s voient la fiche à jour après rechargement." : ""
          };
          const dlg = document.querySelector("#new-route-modal .signup-modal-dialog");
          if (dlg) {
            try {
              showNewRouteAfterSaveOverlay(dlg, kitRoute, {
                wasEdit: wasEdit,
                changeLine: kitPayload.changeLine
              });
            } catch (err) {
              void err;
              console.warn("showNewRouteAfterSaveOverlay", err);
              closeNewRouteModal();
              window.alert(
                wasEdit
                  ? "Sortie mise à jour. La page va se recharger."
                  : "Sortie créée. La page va se recharger pour afficher le nouveau parcours."
              );
              window.location.reload();
            }
          } else {
            closeNewRouteModal();
            window.alert(
              wasEdit
                ? "Sortie mise à jour. La page va se recharger."
                : "Sortie créée. La page va se recharger pour afficher le nouveau parcours."
            );
            window.location.reload();
          }
        });

        window.__goeloOpenNewRouteEditorFromList = openNewRouteModalFromListForEdit;
        window.__goeloQuickCancelSortieFromList = quickCancelSortieFromList;

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

      /* GPX/geo utilities → goelo-gpx-utils.js */

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
        _S.serverHiddenBuiltinIds = await fetchHiddenBuiltinIdsFromSupabase();
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

        if (window.goeloRideUpdatesProcessList) {
          window.goeloRideUpdatesProcessList(loadedRoutesCache.filter(routeVisibleOnPublicSite));
        }

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
