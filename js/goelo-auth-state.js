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
    subscribe: subscribe
  };
})(typeof window !== "undefined" ? window : globalThis);
