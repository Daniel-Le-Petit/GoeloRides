// js/rides.js

document.addEventListener("DOMContentLoaded", () => {
  loadRides();
  setupCreateRideForm();
});

async function loadRides() {
  const list = document.getElementById("rides-list");

  const { data, error } = await supabase
    .from("routes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = "Erreur de chargement.";
    return;
  }

  list.innerHTML = "";

  data.forEach((ride) => {
    const item = document.createElement("div");
    item.className = "list-item";

    item.innerHTML = `
      <div class="list-main">
        <div class="list-title">${ride.track_name}</div>
        <div class="list-meta">${ride.group_label} • ${
      ride.route_kind
    }</div>
      </div>
      <div class="list-actions">
        <button class="btn ghost toggle">${ride.is_active ? "Dépublier" : "Publier"}</button>
      </div>
    `;

    item.querySelector(".toggle").addEventListener("click", async () => {
      await supabase
        .from("routes")
        .update({ is_active: !ride.is_active })
        .eq("id", ride.id);
      loadRides();
    });

    list.appendChild(item);
  });
}

function setupCreateRideForm() {
  const form = document.getElementById("create-ride-form");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(form));

    const payload = {
      track_name: data.track_name,
      group_label: data.group_label,
      route_kind: data.route_kind,
      pace_label: data.pace_label,
      sort_order: Number(data.sort_order || 10),
      is_active: data.is_active === "on",
      front_config: {},
    };

    await supabase.from("routes").insert(payload);

    form.reset();
    loadRides();
  });
}

