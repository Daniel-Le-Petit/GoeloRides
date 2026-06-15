
// js/pilapps.js

// --- Supabase placeholders ---
const SUPABASE_URL = "https://iqxyiwnjwcepfgngkzsm.supabase.co";
const SUPABASE_ANON_KEY =
  "yMzY5ODcsImV4cCI6MjA5NTgxMjk4N30._vanK7hFTdH-8o2l-BaVHP9m7mJv7oUFVyGrDwYCnbA";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Helpers ---
function formatDateFR(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function createBadge(label, color) {
  const span = document.createElement("span");
  span.className = `badge ${color}`;
  span.textContent = label;
  return span;
}

function createListItem(title, meta, badgeColor) {
  const div = document.createElement("div");
  div.className = "ride-item";

  const num = document.createElement("span");
  num.textContent = title;

  const metaSpan = document.createElement("span");
  metaSpan.textContent = meta;

  const badge = createBadge(
    badgeColor === "green" ? "Publiée" : "Brouillon",
    badgeColor
  );

  div.appendChild(num);
  div.appendChild(metaSpan);
  div.appendChild(badge);

  return div;
}

