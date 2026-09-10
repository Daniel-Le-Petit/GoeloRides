/**
 * GoëloRides — Source unique des niveaux (Blanc / Vert / Bleu / Rouge).
 * Modifier les distances / libellés ici uniquement ; Home, sondage et helpers
 * s’appuient sur ce module.
 */
(function (global) {
  "use strict";

  var LEVELS = [
    {
      key: "blanc",
      colorName: "Blanc",
      label: "Découverte",
      emoji: "⚪",
      distanceLabel: "15 – 30 km",
      distanceShort: "15–30 km",
      dplusLabel: "< 220 m D+",
      paceLabel: "tranquille",
      paceKmh: "18–22",
      accessLabel: "Accessible",
      subtitle: "Découverte · Tranquille",
      levelClass: "level-blanc",
      pollLabel: "Découverte"
    },
    {
      key: "vert",
      colorName: "Vert",
      label: "Intermédiaire",
      emoji: "🟢",
      distanceLabel: "30 – 50 km",
      distanceShort: "30–50 km",
      dplusLabel: "< 400 m D+",
      paceLabel: "régulier",
      paceKmh: "22–25",
      accessLabel: "Régulier",
      subtitle: "Intermédiaire · Régulier",
      levelClass: "level-vert",
      pollLabel: "Intermédiaire"
    },
    {
      key: "bleu",
      colorName: "Bleu",
      label: "Confirmé",
      emoji: "🔵",
      distanceLabel: "60 – 70 km",
      distanceShort: "60–70 km",
      dplusLabel: "< 600 m D+",
      paceLabel: "vallonné",
      paceKmh: "25–28",
      accessLabel: "Confirmé",
      subtitle: "Confirmé · Vallonné",
      levelClass: "level-bleu",
      pollLabel: "Confirmé"
    },
    {
      key: "rouge",
      colorName: "Rouge",
      label: "Expert",
      emoji: "🔴",
      distanceLabel: "> 70 km",
      distanceShort: "> 70 km",
      dplusLabel: "> 600 m D+",
      paceLabel: "exigeant",
      paceKmh: "28+",
      accessLabel: "Expert",
      subtitle: "Expert · Exigeant",
      levelClass: "level-rouge",
      pollLabel: "Expert"
    }
  ];

  var POLL_QUESTION = "Quelle sortie vous ferait vraiment venir rouler avec GoëloRides ?";
  var POLL_SLUG = "preferences-sorties-v1";

  /** Modifier ici les créneaux proposés (slug + options) — Home & seed SQL s’alignent. */
  var SCHEDULE_POLL_SLUG = "preferences-horaire-v1";
  var SCHEDULE_POLL_QUESTION =
    "Quel jour et quelle heure vous conviennent le mieux pour les sorties GoëloRides ?";
  var SCHEDULE_OPTIONS = [
    { level_key: "sat-09",  label: "Samedi · 9h00",     subtitle: "Week-end · matin",      emoji: "🌅", sort_order: 0 },
    { level_key: "sat-14",  label: "Samedi · 14h00",    subtitle: "Week-end · après-midi", emoji: "☀️", sort_order: 1 },
    { level_key: "sun-14",  label: "Dimanche · 14h00",  subtitle: "Week-end · après-midi", emoji: "🌞", sort_order: 2 },
    { level_key: "week-09", label: "En semaine · 9h00",  subtitle: "Semaine · matin",      emoji: "🚲", sort_order: 3 },
    { level_key: "week-18", label: "En semaine · 18h00", subtitle: "Semaine · soir",       emoji: "🌇", sort_order: 4 }
  ];

  /** Sondage multi — motivations (checkboxes). Modifier ici pour changer les options. */
  var MOTIVATION_POLL_SLUG = "preferences-motivations-v1";
  var MOTIVATION_POLL_QUESTION = "Qu'est-ce qui vous ferait venir rouler avec nous ?";
  var MOTIVATION_FREE_PROMPT =
    "Autre chose ? Dites-nous ce qui vous donnerait envie de venir…";
  var MOTIVATION_OPTIONS = [
    { level_key: "access",   label: "Une sortie accessible",      sort_order: 0 },
    { level_key: "friendly", label: "Un groupe convivial",        sort_order: 1 },
    { level_key: "route",    label: "Un parcours intéressant",    sort_order: 2 },
    { level_key: "schedule", label: "Un horaire qui me convient", sort_order: 3 },
    { level_key: "nearby",   label: "Partir près de chez moi",    sort_order: 4 },
    { level_key: "other",    label: "Autre",                      sort_order: 5 }
  ];

  function getByKey(key) {
    var k = String(key || "").toLowerCase().replace(/^level-/, "");
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === k) return LEVELS[i];
    }
    return null;
  }

  function groupKeyFromLabel(label) {
    var gl = String(label || "").toLowerCase();
    if (gl.indexOf("blanc") !== -1) return "blanc";
    if (gl.indexOf("rouge") !== -1) return "rouge";
    if (gl.indexOf("bleu") !== -1) return "bleu";
    if (gl.indexOf("noir") !== -1) return "rouge";
    if (gl.indexOf("vert") !== -1) return "vert";
    return "vert";
  }

  function fromLevelClass(levelClass) {
    return getByKey(String(levelClass || "").replace(/^level-/, "")) || getByKey("bleu");
  }

  function fromGroupOrClass(groupLabel, levelClass) {
    if (levelClass) {
      var fromClass = getByKey(String(levelClass).replace(/^level-/, ""));
      if (fromClass) return fromClass;
    }
    return getByKey(groupKeyFromLabel(groupLabel)) || getByKey("vert");
  }

  function shortHint(levelOrKey) {
    var lv = typeof levelOrKey === "string" ? getByKey(levelOrKey) : levelOrKey;
    if (!lv) return "";
    return lv.distanceShort + " · " + lv.paceLabel;
  }

  /** Options de sondage = mêmes libellés / distances que les niveaux. */
  function pollOptionPresets() {
    return LEVELS.map(function (lv, i) {
      return {
        level_key: lv.key,
        label: lv.pollLabel || lv.label,
        subtitle: shortHint(lv),
        emoji: lv.emoji,
        sort_order: i
      };
    });
  }

  /** Options jour/heure — modifier SCHEDULE_OPTIONS pour changer les créneaux. */
  function schedulePollOptionPresets() {
    return SCHEDULE_OPTIONS.map(function (o) {
      return {
        level_key: o.level_key,
        label: o.label,
        subtitle: o.subtitle || "",
        emoji: o.emoji || "",
        sort_order: o.sort_order
      };
    });
  }

  function motivationPollOptionPresets() {
    return MOTIVATION_OPTIONS.map(function (o) {
      return {
        level_key: o.level_key,
        label: o.label,
        subtitle: o.subtitle || "",
        emoji: o.emoji || "",
        sort_order: o.sort_order
      };
    });
  }

  global.GoeloLevels = {
    LEVELS: LEVELS,
    getByKey: getByKey,
    groupKeyFromLabel: groupKeyFromLabel,
    fromLevelClass: fromLevelClass,
    fromGroupOrClass: fromGroupOrClass,
    shortHint: shortHint,
    pollOptionPresets: pollOptionPresets,
    schedulePollOptionPresets: schedulePollOptionPresets,
    motivationPollOptionPresets: motivationPollOptionPresets,
    POLL_QUESTION: POLL_QUESTION,
    POLL_SLUG: POLL_SLUG,
    SCHEDULE_POLL_SLUG: SCHEDULE_POLL_SLUG,
    SCHEDULE_POLL_QUESTION: SCHEDULE_POLL_QUESTION,
    SCHEDULE_OPTIONS: SCHEDULE_OPTIONS,
    MOTIVATION_POLL_SLUG: MOTIVATION_POLL_SLUG,
    MOTIVATION_POLL_QUESTION: MOTIVATION_POLL_QUESTION,
    MOTIVATION_FREE_PROMPT: MOTIVATION_FREE_PROMPT,
    MOTIVATION_OPTIONS: MOTIVATION_OPTIONS
  };
})(typeof window !== "undefined" ? window : this);
