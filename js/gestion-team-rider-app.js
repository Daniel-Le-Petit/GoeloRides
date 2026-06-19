/**
 * gestion-team-rider-app.js
 * GoëloRides — Formulaire demande d'adhésion + page confirmation
 *
 * Responsabilités :
 *  - Validation du formulaire
 *  - Envoi INSERT dans Supabase table `demandes`
 *  - Affichage de la confirmation avec récap
 *  - Gestion des états loading / error / success
 */

(function () {
  "use strict";

  /* ── Supabase lazy client ─────────────────────────────────────
     Ne jamais appeler createClient au niveau module :
     le CDN est chargé avec defer → pas encore disponible.
     getSb() est appelé uniquement dans des handlers async.
     ─────────────────────────────────────────────────────────── */
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

  /* ── Toast ─────────────────────────────────────────────────── */
  function showToast(msg, type = "info") {
    const wrap = document.getElementById("gtr-toast-wrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "gtr-toast" + (type === "error" ? " gtr-toast--error" : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  /* ── Validation ─────────────────────────────────────────────── */
  function validateField(input, errorEl, condition, message) {
    if (!condition) {
      input.classList.add("is-error");
      if (errorEl) { errorEl.textContent = message; errorEl.classList.add("visible"); }
      return false;
    }
    input.classList.remove("is-error");
    if (errorEl) errorEl.classList.remove("visible");
    return true;
  }

  function validateForm(fields) {
    let valid = true;
    const { firstName, lastName, email } = fields;

    if (!validateField(
      firstName.input, firstName.error,
      firstName.input.value.trim().length >= 2,
      "Prénom requis (min. 2 caractères)"
    )) valid = false;

    if (!validateField(
      lastName.input, lastName.error,
      lastName.input.value.trim().length >= 2,
      "Nom requis (min. 2 caractères)"
    )) valid = false;

    const emailVal = email.input.value.trim();
    const emailOk  = /^[^@]+@[^@]+\.[^@]+$/.test(emailVal);
    if (!validateField(
      email.input, email.error,
      emailOk,
      "Adresse e-mail invalide"
    )) valid = false;

    return valid;
  }

  /* ── Confirmation screen ──────────────────────────────────────
     Affiche la page de confirmation avec le récap des données.
     ─────────────────────────────────────────────────────────── */
  function showConfirmation(payload) {
    const formView    = document.getElementById("gtr-form-view");
    const confirmView = document.getElementById("gtr-confirm-view");
    if (!formView || !confirmView) return;

    formView.style.display    = "none";
    confirmView.style.display = "block";

    // Remplir le récap
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set("confirm-name",  payload.first_name + " " + payload.last_name);
    set("confirm-email", payload.email);

    // Badge niveau
    const levelEl = document.getElementById("confirm-level");
    if (levelEl) {
      levelEl.className = "gtr-badge-level gtr-badge-level--" + payload.level;
      levelEl.textContent = payload.level.toUpperCase();
    }

    // Scroll haut
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ── Submit handler ─────────────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();

    const form       = document.getElementById("gtr-form");
    const submitBtn  = document.getElementById("gtr-submit-btn");
    if (!form || !submitBtn) return;

    // Champs
    const firstNameInput = document.getElementById("gtr-first-name");
    const lastNameInput  = document.getElementById("gtr-last-name");
    const emailInput     = document.getElementById("gtr-email");
    const phoneInput     = document.getElementById("gtr-phone");
    const messageInput   = document.getElementById("gtr-message");
    const levelInput     = form.querySelector('input[name="level"]:checked');

    const fields = {
      firstName: { input: firstNameInput, error: document.getElementById("gtr-first-name-err") },
      lastName:  { input: lastNameInput,  error: document.getElementById("gtr-last-name-err") },
      email:     { input: emailInput,     error: document.getElementById("gtr-email-err") },
    };

    if (!validateForm(fields)) return;

    const payload = {
      first_name: firstNameInput.value.trim(),
      last_name:  lastNameInput.value.trim(),
      email:      emailInput.value.trim().toLowerCase(),
      phone:      phoneInput?.value.trim() || null,
      level:      levelInput?.value || "vert",
      message:    messageInput?.value.trim() || null,
      status:     "pending"
    };

    // Loading state
    submitBtn.classList.add("is-loading");
    submitBtn.disabled = true;

    try {
      const { error } = await getSb()
        .from("demandes")
        .insert(payload);

      if (error) {
        // Doublon email
        if (error.code === "23505") {
          showToast("Cette adresse e-mail a déjà soumis une demande.", "error");
        } else {
          throw error;
        }
        return;
      }

      showConfirmation(payload);

    } catch (err) {
      console.error("Submit error:", err);
      showToast("Erreur lors de l'envoi : " + (err.message || err), "error");
    } finally {
      submitBtn.classList.remove("is-loading");
      submitBtn.disabled = false;
    }
  }

  /* ── Live validation on blur ─────────────────────────────────── */
  function bindLiveValidation() {
    const rules = [
      {
        inputId: "gtr-first-name", errorId: "gtr-first-name-err",
        test: v => v.length >= 2, msg: "Prénom requis (min. 2 caractères)"
      },
      {
        inputId: "gtr-last-name", errorId: "gtr-last-name-err",
        test: v => v.length >= 2, msg: "Nom requis (min. 2 caractères)"
      },
      {
        inputId: "gtr-email", errorId: "gtr-email-err",
        test: v => /^[^@]+@[^@]+\.[^@]+$/.test(v), msg: "Adresse e-mail invalide"
      }
    ];
    rules.forEach(({ inputId, errorId, test, msg }) => {
      const input = document.getElementById(inputId);
      const error = document.getElementById(errorId);
      if (!input) return;
      input.addEventListener("blur", () => {
        validateField(input, error, test(input.value.trim()), msg);
      });
      input.addEventListener("input", () => {
        if (input.classList.contains("is-error")) {
          if (test(input.value.trim())) {
            input.classList.remove("is-error");
            if (error) error.classList.remove("visible");
          }
        }
      });
    });
  }

  /* ── Init ────────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("gtr-form");
    if (form) {
      form.addEventListener("submit", handleSubmit);
      bindLiveValidation();
    }

    // Bouton retour sur la page de confirmation
    const backBtn = document.getElementById("gtr-back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        window.location.href = "index.html";
      });
    }
  });

})();
