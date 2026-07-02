/**
 * GoëloRides — état auth centralisé (session → user → role).
 * Source unique pour l'UI : GoeloAuthState.subscribe(fn).
 */
(function (global) {
  "use strict";

  var state = {
    pending: true,
    role: "visitor",
    user: null,
    pseudo: null
  };

  var listeners = [];

  function isTruthyMetaFlag(value) {
    return value === true || value === "true" || value === "t" || value === "1" || value === 1;
  }

  /**
   * Résolution canonique : profiles.role prime sur les flags JWT legacy.
   * goelo_admin = droit Team Rider (créer sortie), pas Admin.
   * goelo_super_admin = Admin legacy (sans profil).
   */
  function resolveRoleFromUserAndProfile(user, profile) {
    if (!user) return "visitor";
    var pr = profile && profile.role ? String(profile.role).trim() : "";
    if (pr === "admin" || pr === "team_rider" || pr === "user") return pr;
    var meta = user.app_metadata || {};
    if (isTruthyMetaFlag(meta.goelo_super_admin)) return "admin";
    if (isTruthyMetaFlag(meta.goelo_admin)) return "team_rider";
    return "user";
  }

  var ROLE_LABELS = {
    visitor: "Visitor",
    user: "Cycliste",
    team_rider: "Team Rider",
    admin: "Admin"
  };

  function roleLabel(role) {
    return ROLE_LABELS[role] || role;
  }

  function syncGlobals() {
    global.GOELO_ROLE = state.role;
    global.GOELO_USER = state.user;
    global.GOELO_DISPLAY_NAME = state.pseudo;
    global.GOELO_AUTH_PENDING = state.pending;
  }

  function getState() {
    return {
      pending: state.pending,
      role: state.role,
      user: state.user,
      pseudo: state.pseudo
    };
  }

  function notify() {
    var snapshot = getState();
    listeners.forEach(function (fn) {
      try { fn(snapshot); } catch (e) { console.warn("[GoeloAuthState]", e); }
    });
    global.dispatchEvent(new CustomEvent("goelo:auth-state", { detail: snapshot }));
  }

  function setState(patch) {
    patch = patch || {};
    var next = {
      pending: patch.pending != null ? !!patch.pending : state.pending,
      role: patch.role != null ? String(patch.role) : state.role,
      user: patch.user !== undefined ? patch.user : state.user,
      pseudo: patch.pseudo !== undefined ? patch.pseudo : state.pseudo
    };

    if (!next.role) next.role = "visitor";
    if (next.role !== "visitor" && !next.user) {
      next.role = "visitor";
      next.pseudo = null;
    }

    var changed =
      next.pending !== state.pending ||
      next.role !== state.role ||
      next.user !== state.user ||
      next.pseudo !== state.pseudo;

    state = next;
    syncGlobals();

    if (changed) notify();
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.push(fn);
    return function unsubscribe() {
      listeners = listeners.filter(function (item) { return item !== fn; });
    };
  }

  syncGlobals();

  global.GoeloAuthState = {
    getState: getState,
    setState: setState,
    subscribe: subscribe,
    resolveRoleFromUserAndProfile: resolveRoleFromUserAndProfile,
    roleLabel: roleLabel,
    ROLE_LABELS: ROLE_LABELS
  };
})(typeof window !== "undefined" ? window : globalThis);
