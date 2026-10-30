(function (global) {
  "use strict";

  function number(value) {
    if (value == null || String(value).trim() === "") return null;
    var n = Number(String(value).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function compare(ride, usualKm, usualClimb) {
    var km = number(ride.kmRaw), climb = number(ride.dplusRaw);
    var distance = number(usualKm), elevation = number(usualClimb);
    if (distance == null || distance <= 0 || elevation == null) {
      return "Indique la distance et le dénivelé d’une sortie que tu termines à l’aise, pour comparer avec ce parcours.";
    }
    if (km == null || climb == null) {
      return "La distance ou le dénivelé de cette sortie n’est pas renseigné. Demande ces précisions au capitaine avant de comparer.";
    }
    var extra = [];
    if (km > distance) extra.push("plus de kilomètres");
    if (climb > elevation) extra.push("plus de dénivelé");
    return extra.length
      ? "Ce parcours comporte " + extra.join(" et ") + " que ta sortie habituelle. Prévois un effort supplémentaire et échange avec le capitaine si tu hésites."
      : "La distance et le dénivelé restent dans tes habitudes. Vérifie aussi que tu es à l’aise avec l’allure du groupe et la durée annoncée.";
  }

  function render(ride) {
    var root = document.getElementById("pd-level-guide");
    if (!root || !ride) return;
    var groups = {
      blanc: "Découverte : pour découvrir les sorties en groupe ou reprendre progressivement.",
      vert: "Intermédiaire : pour un cycliste régulier, à l’aise sur un parcours modérément vallonné.",
      bleu: "Confirmé : pour un cycliste habitué aux sorties longues et aux parcours vallonnés.",
      rouge: "Expert : pour un cycliste expérimenté, à l’aise avec les longues distances et un dénivelé important."
    };
    var group = String(ride.group || "").toLowerCase().match(/blanc|vert|bleu|rouge/);
    root.querySelector('[data-level-group]').textContent = group ? groups[group[0]] : "Niveau du groupe non renseigné : demande conseil au capitaine.";
    var km = number(ride.kmRaw), climb = number(ride.dplusRaw);
    var summary = (km == null ? "Distance non renseignée" : km.toLocaleString("fr-FR") + " km") +
      " · " + (climb == null ? "Dénivelé non renseigné" : climb.toLocaleString("fr-FR") + " m D+");
    if (ride.duration) summary += " · durée estimée : " + ride.duration;
    if (ride.pace) summary += " · allure annoncée : " + ride.pace;
    var levels = { debutant: "Débutant", intermediaire: "Intermédiaire", confirme: "Confirmé" };
    if (levels[ride.niveau]) summary += " · niveau requis : " + levels[ride.niveau];
    root.querySelector('[data-level-summary]').textContent = summary;
    var distance = root.querySelector('[data-level-distance]');
    var elevation = root.querySelector('[data-level-elevation]');
    var result = root.querySelector('[data-level-result]');
    function update() {
      result.textContent = compare(ride, distance.value, elevation.value);
      var panel = root.closest('.pd-acc__panel');
      if (panel && root.closest('.pd-acc__item').classList.contains('is-open')) panel.style.maxHeight = panel.scrollHeight + 'px';
    }
    distance.oninput = elevation.oninput = update;
    update();
  }

  global.GoeloRideLevel = { compare: compare, render: render };
})(typeof window !== "undefined" ? window : globalThis);
