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
    if (global.GoeloLevels && global.GoeloLevels.groupKeyFromLabel) {
      return global.GoeloLevels.groupKeyFromLabel(label);
    }
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

  function isSortiePassed(card) {
    if (!card.date) return false;
    var now = new Date();
    return card.date < now;
  }

  /** Boutons principaux en haut à droite (Voir · Rejoindre). */
  function buildTopActions(card, opts) {
    opts = opts || {};
    var role = getUserRole();
    var viewMode = opts.viewMode || "sorties";
    var joined = opts.joinedRouteIds && opts.joinedRouteIds.has(String(card.id));
    var voirHref = parcoursHref(card.id);
    var parts = [
      '<a class="go-sc-btn go-sc-btn--voir" href="' + escapeAttr(voirHref) + '">Voir</a>'
    ];

    if (isSortiePassed(card)) {
      parts.push('<span class="go-sc-badge go-sc-badge--passed">Sortie passée</span>');
    }

    if (viewMode === "team-rider") return parts.join("");

    var guestJoined = global.GoeloPseudoParticipation && global.GoeloPseudoParticipation.hasLocal(card.id);
    if ((role === "visitor" || guestJoined) && !isSortiePassed(card)) {…59542 tokens truncated…me-color" content="#0D0D0D">
  <link rel="manifest" href="/manifest.json">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="GoëloRides">
  <title>Sorties &amp; parcours · Goëlo Rides</title>
  <meta property="og:title" content="Sorties &amp; parcours · GoëloRides" />
  <meta property="og:description" content="Sorties vélo sur la Côte du Goëlo — route, gravel, famille." />
  <meta property="og:image" content="https://goelorides.onrender.com/assets/hero-accueil.png" />
  <meta property="og:url" content="https://goelorides.onrender.com/sorties.html" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231a3a4a'/%3E%3Ctext x='16' y='22' font-family='Georgia,serif' font-size='14' fill='%23e8d5a3' text-anchor='middle'%3EGR%3C/text%3E%3C/svg%3E" type="image/svg+xml">
  <link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231a3a4a'/%3E%3Ctext x='16' y='22' font-family='Georgia,serif' font-size='14' fill='%23e8d5a3' text-anchor='middle'%3EGR%3C/text%3E%3C/svg%3E">
  <link rel="icon" href="/favicon.ico" sizes="any" type="image/x-icon">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/pages/sorties.css">
  <link rel="stylesheet" href="goelo-pwa-notifications.css?v=7">
<link rel="stylesheet" href="css/components/back-navigation.css">
  <link rel="stylesheet" href="css/pages/pseudo-participation.css?v=20261029-pseudo">
  <link rel="stylesheet" href="css/components/brand.css?v=20261030-footer">
</head>
<body>

  <!-- ── BANDEAU ── -->
  <p class="gr-topstrip">Toutes les sorties de la Côte du Goëlo</p>

  <!-- ── NAV (identique aux autres pages) ── -->
  <nav class="gr-nav" role="navigation" aria-label="Navigation principale">
    <a href="index.html" class="gr-nav__logo">GOËLO<span>RIDES</span></a>
    <ul class="gr-nav__links">
      <li><a href="sorties.html" aria-current="page">Sorties</a></li>
      <li><a href="groupes.html">Groupes</a></li>
      <li><a href="infos-pratiques.html">Infos pratiques</a></li>
      <li><a href="https://www.instagram.com/goelo.rides/" style="color:#fff;" target="_blank" rel="noopener noreferrer">Actualités</a></li>
    </ul>
    <!-- Réservé Team Riders : grisé + cadenas si non connecté
         (popup contextuel « Mode Team Rider requis » au survol / clic) -->
    <a href="gestion-sorties.html?mode=create" class="gr-nav__cta is-locked" id="nav-create-sortie" data-lock="create" aria-disabled="true">
      <span class="gr-nav__cta-lock" aria-hidden="true">🔒</span>
      Créer une sortie
    </a>
  </nav>

  <!-- ── EN-TÊTE ── -->
  <header class="gr-page-header">
    <h1>Sorties</h1>
    <p>Route, gravel ou VTT — trouve ta prochaine sortie sur la Côte du Goëlo.</p>
  </header>

  <!-- ── MAIN ── -->
  <main class="so-main" id="main-content" role="main">

    <!-- Filtres horizontaux + recherche -->
    <div class="so-filters" role="toolbar" aria-label="Filtres des sorties">
      <button type="button" class="so-chip" data-filter="toutes" data-admin-only hidden>Toutes</button>
      <button type="button" class="so-chip is-active" data-filter="a-venir">À venir</button>
      <button type="button" class="so-chip" data-filter="passees">Passées</button>
      <button type="button" class="so-chip" data-filter="route">Route</button>
      <button type="button" class="so-chip" data-filter="gravel">Gravel</button>
      <button type="button" class="so-chip" data-filter="vtt">VTT</button>
      <button type="button" class="so-chip" data-filter="aujourdhui">Aujourd'hui</button>
      <button type="button" class="so-chip" data-filter="meteo-ideale">Météo idéale</button>
      <label class="so-search">
        <span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">Rechercher une sortie</span>
        <input type="search" id="so-search-input" placeholder="Rechercher…" autocomplete="off">
      </label>
    </div>

    <div class="so-weather-bar" role="group" aria-label="Tri des sorties">
      <label class="so-weather-sort">
        <span>Trier par</span>
        <select id="so-sort-by" aria-label="Trier les sorties">
          <option value="date">Date de départ</option>
          <option value="weather">Meilleure météo</option>
          <option value="distance">Plus proche</option>
        </select>
      </label>
    </div>

    <div class="so-messenger" id="go-messenger-compact" hidden>
      <p class="so-messenger__text">
        Une question sur une sortie ? Rejoignez le groupe Messenger GoëloRides
      </p>
      <button type="button" class="go-sc-btn go-sc-btn--ghost go-messenger__btn" data-goelo-messenger-open>
        💬 Rejoindre le groupe Messenger
      </button>
    </div>

    <!-- Liste + colonne droite Team Rider -->
    <div class="so-layout">

      <div id="sorties-list" aria-live="polite">
        <p class="go-sc-empty">Chargement des sorties…</p>
      </div>

      <!-- Colonne droite grisée : actions réservées aux Team Riders -->
      <aside class="so-aside" id="so-aside" aria-label="Actions Membres GoëloRides">
        <div class="so-aside__lock" aria-hidden="true">🔒</div>
        <p class="so-aside__title">Réservé aux<br>Ride Leaders</p>
        <p class="so-aside__text">Créer, modifier ou annuler une sortie nécessite l'accès Membres GoëloRides.</p>
        <button type="button" class="gr-popover__btn" data-goelo-auth-trigger>Se connecter</button>
        <a class="gr-popover__btn gr-popover__btn--ghost"
           href="mailto:goelo.rides@gmail.com?subject=Demande%20acc%C3%A8s%20Membres%20Go%C3%ABloRides&amp;body=Bonjour%2C%0A%0AJe%20souhaite%20demander%20l%27acc%C3%A8s%20Membres%20Go%C3%ABloRides.%0A%0A">
          Demander l'accès
        </a>
      </aside>

    </div>

  </main>

  <!-- ── FOOTER INFO ── -->
  <footer class="footer" role="contentinfo">
    <div class="footer-inner">
      <div>
        <p class="footer-logo">GOËLO<span>RIDES</span></p>
        <p class="footer-loc">Saint-Quay-Portrieux<br>Côtes-d'Armor · 22410<br>Bretagne · France</p>
      </div>
      <div>
        <p class="footer-col-title">Nous suivre</p>
        <div class="footer-links">
          <a href="https://www.instagram.com/goelo.rides/" target="_blank" rel="noopener" class="footer-link">
            <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
            @goelo.rides
          </a>
          <a href="https://www.facebook.com/goelo.rides" target="_blank" rel="noopener" class="footer-link">
            <svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            Goëlo Rides
          </a>
          <a href="mailto:goelo.rides@gmail.com" class="footer-link">
            <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
            goelo.rides@gmail.com
          </a>
        </div>
      </div>
      <div>
        <p class="footer-col-title">Le projet</p>
        <p class="footer-legal-text">
          Initiative locale et indépendante.<br>
          Pas d'adhésion. Pas de fédération.<br>
          Pas de course. Juste du vélo.<br><br>
          Été 2026 · GoëloRides
        </p>
      </div>
    </div>
  </footer>

  <!-- ── MOBILE NAV ── -->
  <nav class="goelo-mobile-tabbar" role="navigation" aria-label="Navigation principale" data-no-swipe-nav>
    <a href="index.html">Accueil</a>
    <a href="groupes.html">Groupes</a>
    <a href="sorties.html" aria-current="page">Sorties</a>
    <a href="infos-pratiques.html">Infos</a>
  </nav>

<!--
  ORDRE D'INCLUSION IMPÉRATIF :
  1. goelo-config.js  → window.GOELO_CONFIG
  2. supabase.min.js  → window.supabase
  3. auth.js          → window.goeloGetSb, window.GOELO_ROLE, goelo:role-ready
  4. ***-rider.js    → écoute goelo:role-ready, lit GOELO_ROLE
-->
  <script src="js/goelo-config.js"></script>
  <script src="js/goelo-messenger.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="js/goelo-auth-state.js"></script>
<script src="js/auth.js"></script>
<script src="js/goelo-profile.js"></script>
<script src="js/goelo-ui.js"></script>
<script src="js/goelo-navbar.js"></script>
  <script src="js/signup-participants.js"></script>
  <script src="js/goelo-activity.js"></script>
  <script src="js/goelo-weather.js"></script>
  <script src="js/goelo-sortie-dates.js"></script>
  <script src="js/goelo-pseudo-participation.js?v=20261029-home-sync"></script>
  <script src="js/sortie-cards.js?v=20261029-short-label"></script>
  <script src="js/sorties.js"></script>
  <script src="js/goelo-swipe-nav.js" defer></script>
  <script>
    window.GOELO_ONESIGNAL_APP_ID = "";
    window.GOELO_ONESIGNAL_SAFARI_WEB_ID = "";
  </script>
  <script src="goelo-onesignal.js?v=16" defer></script>
  <script src="goelo-enable-notifications-banner.js?v=11" defer></script>
  <script src="goelo-notif-manual-button.js?v=11" defer></script>
  <script>window.GOELO_DEBUG = false;</script>
  <script src="goelo-debug-panel.js?v=1" defer></script>
<script src="js/goelo-back-navigation.js" defer></script>
</body>
</html>
