// js/pildashboard.js

document.addEventListener("DOMContentLoaded", () => {
  loadNextRide();
  loadMyRides();
  loadStats();
  loadChecklist();
  loadEmergencyMessages();
});

// --- 1. Prochaine sortie publiée ---
async function loadNextRide() {
  const container = document.querySelector(".next-ride");

  const { data, error } = await supabase
    .from("routes")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    container.innerHTML = "<p>Aucune sortie publiée.</p>";
    return;
  }

  const ride = data[0];

  container.querySelector("h2").textContent = ride.track_name;
  container.querySelector(".badge").textContent = "Publié";

  const meta = container.querySelector(".ride-meta");
  meta.innerHTML = `
    <span>${formatDateFR(ride.created_at)}</span>
    <span>${ride.pace_label || "Rythme non défini"}</span>
    <span>Lieu à définir</span>
  `;

  const stats = container.querySelector(".ride-stats");
  stats.innerHTML = `
    <div class="stat">${ride.front_config?.distance || "??"} km</div>
    <div class="stat">${ride.front_config?.elevation || "??"} m D+</div>
    <div class="stat badge green">${ride.group_label}</div>
  `;

  loadParticipantsPreview(ride.id);
}

// --- 1b. Participants preview ---
async function loadParticipantsPreview(routeId) {
  const container = document.querySelector(".ride-participants");

  const { data, error } = await supabase
    .from("signups")
    .select("*")
    .eq("route_id", routeId)
    .is("canceled_at", null);

  if (error) return;

  const count = data.length;
  const max = 15;

  container.innerHTML = `
    <span>${count} / ${max} inscrits</span>
    <div class="avatars">
      ${data
        .slice(0, 4)
        .map((p) => `<span>${p.pseudo?.[0] || "🚴"}</span>`)
        .join("")}
    </div>
    <span class="muted">${max - count} places restantes</span>
  `;
}

// --- 2. Mes sorties ---
async function loadMyRides() {
  const list = document.querySelector(".rides-list");

  const { data, error } = await supabase
    .from("routes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(4);

  if (error) return;

  const container = list.querySelector(".rides-list");
  list.innerHTML = "<h2>Mes sorties</h2>";

  data.forEach((ride) => {
    const badgeColor = ride.is_active ? "green" : "orange";
    const item = createListItem(
      new Date(ride.created_at).getDate(),
      ride.track_name,
      badgeColor
    );
    list.appendChild(item);
  });
}

// --- 3. Stats ---
async function loadStats() {
  const { data: rides } = await supabase.from("routes").select("*");
  const { data: signups } = await supabase.from("signups").select("*");

  document.querySelector(".actions .primary").textContent =
    "➕ Nouvelle sortie";

  // You can add stats anywhere you want
}

// --- 4. Checklist ---
function loadChecklist() {
  const list = document.querySelector(".checklist-list");

  const items = [
    { label: "📍 Route des Falaises", status: "ok" },
    { label: "📍 Route vérifiée", status: "ok" },
    { label: "🖼️ Flyer Instagram posté", status: "todo" },
    { label: "💬 Message Messenger veille J‑1", status: "urgent" },
    { label: "🌦️ Météo vérifiée", status: "urgent" },
    { label: "📸 Sortie clôturée après la ride", status: "after" },
  ];

  list.innerHTML = items
    .map((i) => `<li class="${i.status}">${i.label}</li>`)
    .join("");
}

// --- 5. Messages urgence ---
function loadEmergencyMessages() {
  const grid = document.querySelector(".emergency-grid");

  grid.innerHTML = `
    <div class="emergency-item">🚨 Retard départ</div>
    <div class="emergency-item red">❌ Annulation</div>
    <div class="emergency-item orange">⚠️ Changement RDV</div>
  `;
}

