// js/settings.js

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  setupForms();
});

function loadSettings() {
  const ui = JSON.parse(localStorage.getItem("goelo_ui") || "{}");
  const groups = JSON.parse(localStorage.getItem("goelo_groups") || "{}");

  if (ui.accent_color)
    document.querySelector("[name='accent_color']").value = ui.accent_color;

  if (ui.card_radius)
    document.querySelector("[name='card_radius']").value = ui.card_radius;

  if (groups.group_labels)
    document.querySelector("[name='group_labels']").value =
      groups.group_labels;
}

function setupForms() {
  document
    .getElementById("ui-settings-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      localStorage.setItem("goelo_ui", JSON.stringify(data));
      alert("Réglages d’affichage enregistrés.");
    });

  document
    .getElementById("groups-settings-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      localStorage.setItem("goelo_groups", JSON.stringify(data));
      alert("Réglages de groupes enregistrés.");
    });
}

