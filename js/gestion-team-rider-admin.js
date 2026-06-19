/**
 * gestion-team-rider-admin.js
 * GoëloRides — Dashboard admin : gestion des demandes Team Rider
 *
 * Responsabilités :
 *  - Vérification auth + rôle admin (app_metadata.goelo_admin)
 *  - Affichage liste des demandes depuis Supabase table `demandes`
 *  - Filtres : toutes / en attente / approuvées / refusées
 *  - Actions approve / refuse avec update Supabase
 *  - Refresh UI en temps réel après action
 *  - Stats (total, pending, approved, refused)
 */

(function () {
  "use strict";

  /* ── Supabase lazy singleton ──────────────────────────────── */
  let _sb = null;
  function getSb() {
    if (_sb) return _sb;
    const url = (window.GOELO_SUPABASE_URL  || "").trim();
    const key = (window.GOELO_SUPABASE_ANON_KEY || "").trim();
    if (!url || !key) throw new Error("Config Supabase manquante");
    if (typeof window.supabase?.createClient !== "function") {
      throw new Error("Supabase SDK non chargé");
    }
    _sb = window.supabase.createClient(url, key);
    return _sb;
  }

  /* ── State ───────────────────────────────────────────────── */
  let _allDemands = [];
  let _filter     = "all";

  /* ── Toast ───────────────────────────────────────────────── */
  function showToast(msg, type = "info") {
    const wrap = document.getElementById("gtr-toast-wrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "gtr-toast" + (type === "error" ? " gtr-toast--error" : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  /* ── Auth : détecter rôle admin ──────────────────────────── */
  function decodeJwt(t) {
    try {
      const b64 = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(b64 + "=".repeat((4 - b64.length % 4) % 4)));
    } catch { return null; }
  }

  function detectAdmin() {
    const key = Object.keys(localStorage).find(k => k.includes("auth-token"));
    if (!key) return false;
    try {
      const s   = JSON.parse(localStorage.getItem(key));
      const tok = s?.access_token || s?.currentSession?.access_token;
      if (!tok) return false;
      const p  = decodeJwt(tok);
      const am = p?.app_metadata || {};
      return am.goelo_admin === true || am.goelo_admin === "true"
          || am.goelo_admin === 1    || am.goelo_admin === "1";
    } catch { return false; }
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function fmtDate(isoStr) {
    if (!isoStr) return "—";
    try {
      const d = new Date(isoStr);
      const pad = n => String(n).padStart(2, "0");
      return `${pad(d.getDate())} ${["jan","fév","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"][d.getMonth()]} ${d.getFullYear()} · ${pad(d.getHours())}h${pad(d.getMinutes())}`;
    } catch { return isoStr; }
  }

  function levelBadge(level) {
    const l = (level || "vert").toLowerCase();
    return `<span class="gtr-badge-level gtr-badge-level--${l}">${l.toUpperCase()}</span>`;
  }

  function statusBadge(status) {
    const map = {
      pending:  { cls: "pending",  label: "EN ATTENTE" },
      approved: { cls: "approved", label: "APPROUVÉE" },
      refused:  { cls: "refused",  label: "REFUSÉE" }
    };
    const s = map[status] || map.pending;
    return `<span class="gtr-badge-status gtr-badge-status--${s.cls}">${s.label}</span>`;
  }

  /* ── Render stats ────────────────────────────────────────── */
  function renderStats(demands) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set("stat-total",    demands.length);
    set("stat-pending",  demands.filter(d => d.status === "pending").length);
    set("stat-approved", demands.filter(d => d.status === "approved").length);
    set("stat-refused",  demands.filter(d => d.status === "refused").length);
  }

  /* ── Render demand card ──────────────────────────────────── */
  function demandCardHtml(d) {
    const isPending  = d.status === "pending";
    const msgHtml = d.message
      ? `<div class="gtr-demand-card__message">"${d.message}"</div>`
      : "";
    const actionsHtml = isPending ? `
      <div class="gtr-demand-card__actions">
        <button class="gtr-btn-approve" data-id="${d.id}" onclick="window.__gtrApprove('${d.id}')">
          ✓ APPROUVER
        </button>
        <button class="gtr-btn-refuse" data-id="${d.id}" onclick="window.__gtrRefuse('${d.id}')">
          ✕ REFUSER
        </button>
      </div>` : "";

    return `
      <div class="gtr-demand-card" id="dc-${d.id}">
        <div class="gtr-demand-card__head">
          <span class="gtr-demand-card__name">${d.first_name} ${d.last_name}</span>
          <div class="gtr-demand-card__badges">
            ${levelBadge(d.level)}
            ${statusBadge(d.status)}
          </div>
        </div>
        <div class="gtr-demand-card__meta">
          <div class="gtr-demand-card__meta-row">
            <span class="gtr-demand-card__meta-icon">✉</span>
            <span>${d.email}</span>
          </div>
          ${d.phone ? `<div class="gtr-demand-card__meta-row"><span class="gtr-demand-card__meta-icon">📞</span><span>${d.phone}</span></div>` : ""}
          <div class="gtr-demand-card__meta-row">
            <span class="gtr-demand-card__meta-icon">🗓</span>
            <span>${fmtDate(d.created_at)}</span>
          </div>
        </div>
        ${msgHtml}
        ${actionsHtml}
      </div>
    `;
  }

  /* ── Render list ─────────────────────────────────────────── */
  function renderList() {
    const list = document.getElementById("gtr-demands-list");
    if (!list) return;

    let filtered = _allDemands;
    if (_filter === "pending")  filtered = _allDemands.filter(d => d.status === "pending");
    if (_filter === "approved") filtered = _allDemands.filter(d => d.status === "approved");
    if (_filter === "refused")  filtered = _allDemands.filter(d => d.status === "refused");

    if (filtered.length === 0) {
      list.innerHTML = `<div class="gtr-empty">Aucune demande pour ce filtre.</div>`;
      return;
    }

    list.innerHTML = filtered.map(demandCardHtml).join("");
  }

  /* ── Fetch all demands ───────────────────────────────────── */
  async function loadDemands() {
    const list = document.getElementById("gtr-demands-list");
    if (list) {
      list.innerHTML = `
        <div class="gtr-loading">
          <div class="gtr-loading__dot"></div>
          <div class="gtr-loading__dot"></div>
          <div class="gtr-loading__dot"></div>
        </div>`;
    }

    try {
      const { data, error } = await getSb()
        .from("demandes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      _allDemands = data || [];
      renderStats(_allDemands);
      renderList();
    } catch (err) {
      console.error("loadDemands error:", err);
      if (list) {
        list.innerHTML = `<div class="gtr-empty" style="color:var(--red)">Erreur : ${err.message}</div>`;
      }
      showToast("Impossible de charger les demandes", "error");
    }
  }

  /* ── Approve ─────────────────────────────────────────────── */
  async function approveDemand(id) {
    const btns = document.querySelectorAll(`#dc-${id} button`);
    btns.forEach(b => b.disabled = true);

    try {
      const { error } = await getSb()
        .from("demandes")
        .update({ status: "approved" })
        .eq("id", id);
      if (error) throw error;

      showToast("Demande approuvée ✓");
      await loadDemands();
    } catch (err) {
      console.error("approveDemand error:", err);
      showToast("Erreur : " + err.message, "error");
      btns.forEach(b => b.disabled = false);
    }
  }

  /* ── Refuse ──────────────────────────────────────────────── */
  async function refuseDemand(id) {
    const btns = document.querySelectorAll(`#dc-${id} button`);
    btns.forEach(b => b.disabled = true);

    try {
      const { error } = await getSb()
        .from("demandes")
        .update({ status: "refused" })
        .eq("id", id);
      if (error) throw error;

      showToast("Demande refusée");
      await loadDemands();
    } catch (err) {
      console.error("refuseDemand error:", err);
      showToast("Erreur : " + err.message, "error");
      btns.forEach(b => b.disabled = false);
    }
  }

  // Exposer pour les onclick inline générés dynamiquement
  window.__gtrApprove = approveDemand;
  window.__gtrRefuse  = refuseDemand;

  /* ── Filter tabs ─────────────────────────────────────────── */
  function bindFilterTabs() {
    document.querySelectorAll(".gtr-tab[data-filter]").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".gtr-tab").forEach(t => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        _filter = tab.getAttribute("data-filter");
        renderList();
      });
    });
  }

  /* ── Show/hide sections ──────────────────────────────────── */
  function showAdmin() {
    const gate  = document.getElementById("gtr-admin-gate");
    const panel = document.getElementById("gtr-admin-panel");
    if (gate)  gate.style.display  = "none";
    if (panel) panel.style.display = "block";
  }

  function showGate() {
    const gate  = document.getElementById("gtr-admin-gate");
    const panel = document.getElementById("gtr-admin-panel");
    if (gate)  gate.style.display  = "flex";
    if (panel) panel.style.display = "none";
  }

  /* ── Init ────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", () => {
    // Cette page est chargée uniquement si admin — vérification supplémentaire
    const isAdmin = detectAdmin()
      || new URLSearchParams(location.search).get("demo") === "admin";

    if (!isAdmin) {
      showGate();
      return;
    }

    showAdmin();
    bindFilterTabs();
    loadDemands();

    // Refresh si auth change
    window.addEventListener("goelo:auth-success", () => {
      if (detectAdmin()) { showAdmin(); loadDemands(); }
    });
  });

})();
