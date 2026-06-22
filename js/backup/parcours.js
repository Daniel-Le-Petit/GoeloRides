/**
 * GoëloRides — Parcours page (CLEAN STABLE VERSION)
 */
(function () {
  "use strict";

  let sortie = null;

  /* =========================
     HELPERS
  ========================= */

  function getSb() {
    return window.goeloGetSb?.();
  }

  function setLoading(v) {
    const el = document.getElementById("loading");
    if (el) el.style.display = v ? "block" : "none";
  }

  function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v ?? "";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* =========================
     AUTH
  ========================= */

  async function getUser() {
    const sb = getSb();
    if (!sb) return null;

    const { data } = await sb.auth.getUser();
    return data?.user ?? null;
  }

  /* =========================
     JOIN LOGIC (DB ONLY)
  ========================= */

  async function isJoined(routeId) {
    const sb = getSb();
    const user = await getUser();
    if (!sb || !user) return false;

    const { data } = await sb
      .from("signups")
      .select("route_id")
      .eq("route_id", routeId)
      .eq("user_id", user.id)
      .maybeSingle();

    return !!data;
  }

async function saveJoin(sortie) {
  const sb = window.goeloGetSb();

  const user = sb.auth.getUser?.();
  const userId = user?.data?.user?.id;

  if (!userId) throw new Error("User not logged in");

  const payload = {
    user_id: userId,
    sortie_id: sortie.id,
    created_at: new Date().toISOString(),
  };

  const { error } = await sb
    .from("signups")
    .insert(payload, {
      // 👇 clé magique contre ton 409
      ignoreDuplicates: true,
    });

  if (error && error.code !== "23505") {
    console.log("[JOIN ERROR]", error);
    throw error;
  }

  return true;
}


/* =========================================================
   CHECK IF ALREADY JOINED
   ========================================================= */
async function checkIfJoined(sortieId) {
  const sb = window.goeloGetSb();

  const user = sb.auth.getUser?.();
  const userId = user?.data?.user?.id;

  if (!userId) return false;

  const { data, error } = await sb
    .from("signups")
    .select("id")
    .eq("user_id", userId)
    .eq("sortie_id", sortieId)
    .maybeSingle();

  if (error) {
    console.error("[CHECK JOIN ERROR]", error);
    return false;
  }

  return !!data;
}

  /* =========================
     RENDER JOIN
  ========================= */

  async function renderJoin() {
    if (!sortie?.id) return;

    const btn = document.getElementById("pd-join-btn");
    const count = document.getElementById("pd-join-count");
    if (!btn) return;

    const sb = getSb();
    const user = await getUser();

    if (!user) {
      btn.textContent = "Connexion requise";
      btn.disabled = true;
      return;
    }

    const joined = await isJoined(sortie.id);

    btn.disabled = false;
    btn.textContent = joined ? "J'annule" : "Je participe !";

    const n = Array.isArray(sortie.participants)
      ? sortie.participants.length
      : 0;

    if (count) {
      count.innerHTML = `<strong>${n}</strong> participant${n > 1 ? "s" : ""}`;
    }
  }

  /* =========================
     JOIN CLICK
  ========================= */

  async function onJoinClick() {
    if (!sortie) return;

    const user = await getUser();
    if (!user) {
      console.log("[JOIN] not logged");
      return;
    }

    const joined = await isJoined(sortie.id);

    const ok = await saveJoin(sortie.id, !joined);
    if (!ok) return;

    await refreshParticipants();
    await renderJoin();
    renderParticipants();
  }

  /* =========================
     BIND BUTTON
  ========================= */

function bindJoin(sortie) {
  const btn = document.getElementById("pd-join-btn");

  if (!btn) return;

  console.log("[bindJoin] attach OK", btn);

  if (btn.dataset.bound === "true") return;
  btn.dataset.bound = "true";

  // 💡 on stocke l’objet dans le DOM
  btn.dataset.sortieId = sortie.id;
  btn.dataset.sortie = JSON.stringify(sortie);

  btn.addEventListener("click", async () => {
    console.log("[JOIN] click");

    try {
      const raw = btn.dataset.sortie;

      if (!raw) {
        throw new Error("No sortie stored in button dataset");
      }

      const sortieParsed = JSON.parse(raw);

      console.log("[JOIN] sortie =", sortieParsed);

      await saveJoin(sortieParsed);

      btn.textContent = "Inscrit ✔";
    } catch (err) {
      console.error("[JOIN ERROR]", err);
    }
  });
}

  /* =========================
     PARTICIPANTS
  ========================= */

  function renderParticipants() {
    const host = document.getElementById("pd-participants");
    if (!host || !sortie) return;

    const list = sortie.participants || [];

    host.innerHTML = list
      .map((p, i) => {
        return `
          <li>
            <span class="so-avatar" style="background:${avatarColor(p.email, i)}">
              ${escapeHtml((p.email || "?").slice(0, 2).toUpperCase())}
            </span>
            <span>${escapeHtml(p.email || "")}</span>
          </li>
        `;
      })
      .join("");
  }

  function avatarColor(seed, i) {
    const colors = ["#C8F135", "#7DD3FC", "#FCA5A5", "#FCD34D", "#C4B5FD"];
    return colors[(String(seed).length + i) % colors.length];
  }

  /* =========================
     HERO
  ========================= */

  function renderHero() {
    if (!sortie) return;

    document.title = sortie.title;

    setText("pd-title", sortie.title);
    setText("pd-group", sortie.group);
    setText("pd-type", sortie.type);
    setText("pd-place", sortie.place);
  }

  /* =========================
     MAP (safe stub)
  ========================= */

  async function initMap() {
    if (!sortie) return;

    const el = document.getElementById("pd-map");
    if (!el || typeof L === "undefined") return;

    const map = L.map(el).setView([48.6, -2.8], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(map);
  }

  /* =========================
     RENDER ALL
  ========================= */

function renderAll() {
  console.log("[renderAll] start");

  renderHero?.();
  renderJoin?.();
  renderParticipants?.();
  bindJoin?.();
  bindAccordions?.();
}

async function refreshParticipants() {
  const sb = getSb();
  if (!sb || !sortie) return;

  const { data, error } = await sb
    .from("signups")
    .select("*")
    .eq("route_id", sortie.id);

  if (error) {
    console.error("[PARTICIPANTS ERROR]", error);
    return;
  }

  sortie.participants = data || [];
}

  /* =========================
     INIT
  ========================= */

  document.addEventListener("DOMContentLoaded", async function () {
    try {
      setLoading(true);

      const id = new URLSearchParams(location.search).get("id");
      if (!id) throw new Error("Missing id");

      const sb = getSb();
      if (!sb) throw new Error("Supabase not ready");

      const { data, error } = await sb
        .from("routes")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      if (!data) throw new Error("Route not found");

      sortie = {
        id: data.id,
        title: data.track_name || "Sortie",
        group: data.group_label,
        type: data.route_kind,
        place: data.front_config?.meetPlace || ""
      };

      await refreshParticipants();

      await renderAll();
      await initMap();

    } catch (err) {
      console.error(err);

      const el = document.getElementById("error");
      if (el) el.textContent = err.message;
    } finally {
      setLoading(false);
    }
  });

})();
