// js/participants.js

document.addEventListener("DOMContentLoaded", () => {
  loadRideSelect();
  setupSignupForm();
});

async function loadRideSelect() {
  const select = document.getElementById("participants-ride-select");

  const { data } = await supabase
    .from("routes")
    .select("*")
    .order("created_at", { ascending: false });

  select.innerHTML = "";

  data.forEach((ride) => {
    const opt = document.createElement("option");
    opt.value = ride.id;
    opt.textContent = ride.track_name;
    select.appendChild(opt);
  });

  loadParticipants(select.value);

  select.addEventListener("change", () => {
    loadParticipants(select.value);
  });
}

async function loadParticipants(routeId) {
  const list = document.getElementById("participants-list");

  const { data } = await supabase
    .from("signups")
    .select("*")
    .eq("route_id", routeId)
    .is("canceled_at", null);

  list.innerHTML = "";

  data.forEach((p) => {
    const item = document.createElement("div");
    item.className = "list-item";

    item.innerHTML = `
      <div class="list-main">
        <div class="list-title">${p.pseudo}</div>
        <div class="list-meta">${p.participant_city || "Ville inconnue"}</div>
      </div>
      <button class="btn ghost cancel">Annuler</button>
    `;

    item.querySelector(".cancel").addEventListener("click", async () => {
      await supabase
        .from("signups")
        .update({ canceled_at: new Date().toISOString() })
        .eq("route_id", routeId)
        .eq("email", p.email);

      loadParticipants(routeId);
    });

    list.appendChild(item);
  });
}

function setupSignupForm() {
  const form = document.getElementById("add-signup-form");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(form));

    const payload = {
      route_id: data.route_id,
      pseudo: data.pseudo,
      email: data.email,
      participant_city: data.participant_city,
      cyclist_level: data.cyclist_level,
      waitlist: false,
    };

    await supabase.from("signups").insert(payload);

    loadParticipants(data.route_id);
    form.reset();
  });
}

