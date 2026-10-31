/**
 * GoëloRides — page profil
 */
(function () {
  "use strict";

  var ROLE_LABELS = {
    visitor: "Visiteur",
    user: "Cycliste",
    team_rider: "Ride Leader",
    admin: "Admin"
  };

  var activeUser = null, generation = 0, loadedId = null, saving = false, retrySession = null;

  function $(id) { return document.getElementById(id); }

  function getSb() {
    return typeof window.goeloGetSb === "function" ? window.goeloGetSb() : null;
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value || "—";
  }

  function hide(id) {
    var el = $(id);
    if (el) el.hidden = true;
  }

  function show(id) {
    var el = $(id);
    if (el) el.hidden = false;
  }

  /* ── États de page ──────────────────────────────────────────── */
  function showGate() {
    hide("profile-retry");
    show("profile-gate");
    hide("profile-loading");
    hide("profile-content");
    hide("profile-fatal");
  }

  function showLoading() {
    hide("profile-retry");
    hide("profile-gate");
    show("profile-loading");
    hide("profile-content");
    hide("profile-fatal");
  }

  function showProfile() {
    hide("profile-gate");
    hide("profile-loading");
    hide("profile-retry");
    show("profile-content");
    hide("profile-fatal");
  }

  function showFatal(msg) {
    hide("profile-gate");
    hide("profile-loading");
    hide("profile-content");
    show("profile-retry");
    var box = $("profile-fatal");
    if (box) {
      box.textContent = msg;
      box.hidden = false;
    }
  }

  function showBanner(msg) {
    var box = $("profile-banner");
    if (box) {
      box.textContent = msg;
      box.hidden = false;
    }
  }

  function hideBanner() {
    var box = $("profile-banner");
    if (box) box.hidden = true;
  }

  /* ── Chargement des données ─────────────────────────────────── */
  async function loadProfile(user) {
    var sb = getSb();
    if (!sb) {
      showFatal("Service indisponible pour le moment. Réessaie plus tard.");
      return;
    }
    if (!user) {
      showGate();
      return;
    }

    var request = ++generation;
    activeUser = user;
    showLoading();

    var profile = {};
    var fetchError = null;

    try {
      var result = await window.GoeloAccount.request(sb
        .from("profiles")
        .select("pseudo, username, cyclist_level, city, role")
        .eq("id", user.id)
        .maybeSingle());
      if (result.error) {
        fetchError = result.error;
        console.warn("[profile] profiles fetch:", result.error.message);
      } else {
        profile = result.data || {};
      }
    } catch (err) {
      fetchError = err;
      console.warn("[profile] profiles fetch (exception):", err && err.message);
    }

    if (request !== generation) return;
    loadedId = fetchError ? null : user.id;
    var pseudo =
      profile.pseudo ||
      (window.GoeloProfile && window.GoeloProfile.getDisplayName(
        window.GoeloProfile.profileFromUser(user)
      )) ||
      (user.user_metadata && (user.user_metadata.pseudo || user.user_metadata.name)) ||
      (window.GoeloProfile ? window.GoeloProfile.getParticipantInitials(
        window.GoeloProfile.profileFromUser(user)
      ) : "?");

    var role = profile.role || (window.GoeloAuthState ? window.GoeloAuthState.resolveRoleFromUserAndProfile(user, profile) : "user");

    var avatar = $("profile-avatar");
    if (avatar) {
      if (window.GoeloProfile) {
        avatar.textContent = window.GoeloProfile.initials({ pseudo: pseudo });
        avatar.style.background = window.GoeloProfile.avatarColor({ pseudo: pseudo });
      } else {
        avatar.textContent = String(pseudo).slice(0, 2).toUpperCase();
      }
    }

    setText("profile-name", pseudo);
    setText("profile-role", ROLE_LABELS[role] || role);
    var metadata = user.user_metadata || {};
    var values = { email: user.email || "", pseudo: pseudo === "?" ? "" : pseudo,
      fullname: Object.prototype.hasOwnProperty.call(profile, "username") ? profile.username || "" : metadata.username || metadata.name || "",
      level: Object.prototype.hasOwnProperty.call(profile, "cyclist_level") ? profile.cyclist_level || "" : metadata.cyclist_level || "",
      city: Object.prototype.hasOwnProperty.call(profile, "city") ? profile.city || "" : metadata.city || "" };
    Object.keys(values).forEach(function (key) {
      var el = $("profile-" + key);
      if (el.tagName === "SELECT" && values[key] && !Array.from(el.options).some(function (o) { return o.value === values[key]; })) {
        el.add(new Option(values[key], values[key]));
      }
      el.value = values[key];
      if (el.tagName === "SELECT") Array.from(el.options).forEach(function (o) { o.defaultSelected = o.value === values[key]; });
      else el.defaultValue = values[key];
    });
    var levels = {debutant:"Débutant", intermediaire:"Intermédiaire", confirme:"Confirmé"};
    setText("profile-summary-city", values.city || "Ville à renseigner");
    setText("profile-summary-level", levels[values.level] || values.level || "À renseigner");
    var memberSince = new Date(user.created_at);
    setText("profile-member-since", isNaN(memberSince.getTime()) ? "" : "Membre depuis " + memberSince.toLocaleDateString("fr-FR", {month:"long", year:"numeric"}));
    if (isNaN(memberSince.getTime())) $("profile-member-since").textContent = "";
    var filled = [values.pseudo,values.fullname,values.level,values.city].filter(Boolean).length;
    $("profile-completion").value = filled;
    setText("profile-completion-label", filled === 4 ? "Ta fiche est complète. Il ne reste plus qu’à rouler !" : filled + " informations sur 4 renseignées.");
    $("profile-dirty").textContent = fetchError ? "La lecture du profil a échoué. Réessaie avant de modifier tes informations." : "Tes informations sont à jour.";
    $("profile-save").disabled = !!fetchError;

    if (fetchError) {
      showBanner("Certaines informations de profil n'ont pas pu être chargées.");
    } else {
      hideBanner();
    }

    showProfile();
    if (fetchError) show("profile-retry");
  }

  /* ── Auth events ─────────────────────────────────────────────── */
  function onAuth(detail) {
    if (detail && detail.pending) return;
    var user = detail && detail.user;
    if (!user) { generation++; loadedId = null; activeUser = null; showGate(); return; }
    if (activeUser && activeUser.id === user.id) return;
    loadProfile(user);
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (saving || !activeUser || loadedId !== activeUser.id) return;
    var user = activeUser, feedback = $("profile-feedback"), form = $("profile-form");
    var fields = { username: $("profile-fullname").value.trim() || null, pseudo: $("profile-pseudo").value.trim(), cyclist_level: $("profile-level").value || null, city: $("profile-city").value.trim() || null };
    if (!fields.pseudo) { $("profile-pseudo").setCustomValidity("Indique un pseudo."); $("profile-pseudo").reportValidity(); return; }
    saving = true;
    Array.from(form.elements).forEach(function (el) { el.disabled = true; });
    feedback.textContent = "Enregistrement…";
    feedback.dataset.error = "false";
    try {
      var result = await window.GoeloAccount.request(getSb().from("profiles").upsert(Object.assign({ id: user.id }, fields), { onConflict: "id" }).select("pseudo, username, cyclist_level, city").single());
      if (result.error || !result.data) throw new Error("save_failed");
      if (activeUser !== user) return;
      // Auth synchronise les metadata vers profiles à la connexion : les garder cohérentes.
      var sync;
      try { sync = await window.GoeloAccount.request(getSb().auth.updateUser({ data: fields })); }
      catch (syncError) { sync = { error: syncError }; }
      if (activeUser !== user) return;
      if (window.GoeloAuthState) window.GoeloAuthState.setState({ pseudo: fields.pseudo });
      await loadProfile(user);
      feedback.textContent = sync.error ? "Profil enregistré. La synchronisation du compte a échoué : réenregistre avant ta prochaine connexion." : "Tes informations ont bien été enregistrées.";
      feedback.dataset.error = sync.error ? "true" : "false";
    } catch (err) {
      if (activeUser === user) { feedback.textContent = "Impossible d’enregistrer tes modifications. Elles sont conservées ici, réessaie."; feedback.dataset.error = "true"; }
    } finally {
      saving = false;
      Array.from(form.elements).forEach(function (el) { el.disabled = false; });
      $("profile-save").disabled = !loadedId;
    }
  }

  function init() {
    $("profile-form").addEventListener("submit", saveProfile);
    $("profile-pseudo").addEventListener("input", function () { this.setCustomValidity(""); });
    $("profile-form").addEventListener("reset", function () { $("profile-feedback").textContent = ""; $("profile-pseudo").setCustomValidity(""); });
    showLoading();
    $("profile-form").addEventListener("input", function () { $("profile-dirty").textContent = "Modifications non enregistrées."; $("profile-feedback").textContent = ""; });
    $("profile-form").addEventListener("reset", function () { $("profile-dirty").textContent = "Tes informations sont à jour."; });
    retrySession = window.GoeloAccount.watch(onAuth, function () { showFatal("Ton espace n’a pas pu s’ouvrir. Vérifie ta connexion puis réessaie. Tes informations sont conservées."); });
    $("profile-retry").addEventListener("click", function () { activeUser = null; loadedId = null; showLoading(); retrySession(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
