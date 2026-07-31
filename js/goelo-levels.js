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
      emoji: "🟢",
      distanceLabel: "25 – 40 km",
      distanceShort: "25–40 km",
      dplusLabel: "< 700 m D+",
      paceLabel: "tranquille",
      paceKmh: "18–22",
      accessLabel: "Ouvert à tous",
      subtitle: "Découverte · Allure tranquille",
      levelClass: "level-blanc",
      pollLabel: "Découverte"
    },
    {
      key: "vert",
      colorName: "Vert",
      label: "Intermédiaire",
      emoji: "🔵",
      distanceLabel: "40 – 60 km",
      distanceShort: "40–60 km",
      dplusLabel: "700 – 1 200 m D+",
      paceLabel: "régulier",
      paceKmh: "22–25",
      accessLabel: "Ouvert à tous",
      subtitle: "Endurance · Allure modérée",
      levelClass: "level-vert",
      pollLabel: "Intermédiaire"
    },
    {
      key: "bleu",
      colorName: "Bleu",
      label: "Confirmé",
      emoji: "🟣",
      distanceLabel: "55 – 75 km",
      distanceShort: "55–75 km",
      dplusLabel: "1 200 – 1 800 m D+",
      paceLabel: "soutenu",
      paceKmh: "25–30",
      accessLabel: "Bon niveau requis",
      subtitle: "Sportif · Allure soutenue",
      levelClass: "level-bleu",
      pollLabel: "Confirmé"
    },
    {
      key: "rouge",
      colorName: "Rouge",
      label: "Expert",
      emoji: "🔴",
      distanceLabel: "75 km+",
      distanceShort: "75 km+",
      dplusLabel: "1 800 m D+ et +",
      paceLabel: "exigeant",
      paceKmh: "30+",
      accessLabel: "Niveau expert",
      subtitle: "Compétition · Allure élevée",
      levelClass: "level-rouge",
      pollLabel: "Expert"
    }
  ];

  var POLL_QUESTION = "Quelle sortie vous ferait vraiment venir rouler avec GoëloRides ?";

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

  global.GoeloLevels = {
    LEVELS: LEVELS,
    getByKey: getByKey,
    groupKeyFromLabel: groupKeyFromLabel,
    fromLevelClass: fromLevelClass,
    fromGroupOrClass: fromGroupOrClass,
    shortHint: shortHint,
    pollOptionPresets: pollOptionPresets,
    POLL_QUESTION: POLL_QUESTION
  };
})(typeof window !== "undefined" ? window : this);
