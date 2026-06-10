/**
 * @jest-environment jsdom
 */

const auth = require("../goelo-auth.js");

beforeEach(() => {
  localStorage.clear();
  window.GOELO_SUPABASE_URL = "";
  window.GOELO_SUPABASE_ANON_KEY = "";
});

describe("normalizeApiKey", () => {
  it("trims whitespace and removes internal spaces", () => {
    expect(auth.normalizeApiKey("  abc  def  ")).toBe("abcdef");
  });

  it("returns empty string for null/undefined", () => {
    expect(auth.normalizeApiKey(null)).toBe("");
    expect(auth.normalizeApiKey(undefined)).toBe("");
  });

  it("converts non-string to string", () => {
    expect(auth.normalizeApiKey(12345)).toBe("12345");
  });
});

describe("getSupabaseConfig / isConfigured", () => {
  it("returns empty when globals not set", () => {
    const cfg = auth.getSupabaseConfig();
    expect(cfg.url).toBe("");
    expect(cfg.anonKey).toBe("");
    expect(auth.isConfigured()).toBe(false);
  });

  it("returns configured when valid url and key set", () => {
    window.GOELO_SUPABASE_URL = "https://myproject.supabase.co";
    window.GOELO_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiJ9.test.key";
    expect(auth.isConfigured()).toBe(true);
  });

  it("rejects placeholder url", () => {
    window.GOELO_SUPABASE_URL = "https://xxxxxxxx.supabase.co";
    window.GOELO_SUPABASE_ANON_KEY = "some-key";
    expect(auth.isConfigured()).toBe(false);
  });
});

describe("readSession / writeSession / clearSession", () => {
  it("returns null when no session stored", () => {
    expect(auth.readSession()).toBe(null);
  });

  it("persists and reads back a session object", () => {
    const session = { access_token: "tok123", email: "a@b.com" };
    auth.writeSession(session);
    const result = auth.readSession();
    expect(result).toEqual(session);
  });

  it("clearSession removes stored session", () => {
    auth.writeSession({ access_token: "tok" });
    auth.clearSession();
    expect(auth.readSession()).toBe(null);
  });

  it("readSession returns null for corrupted JSON", () => {
    localStorage.setItem("goelo_user_auth_v1", "not{json");
    expect(auth.readSession()).toBe(null);
  });

  it("readSession returns null for non-object values", () => {
    localStorage.setItem("goelo_user_auth_v1", JSON.stringify("string"));
    expect(auth.readSession()).toBe(null);
  });
});

describe("parseJwtPayload", () => {
  function makeJwt(payload) {
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `header.${b64}.signature`;
  }

  it("parses a valid JWT payload", () => {
    const payload = { sub: "user-123", email: "test@example.com", exp: 9999999999 };
    const jwt = makeJwt(payload);
    expect(auth.parseJwtPayload(jwt)).toEqual(payload);
  });

  it("handles unicode characters in payload", () => {
    const payload = { name: "Goëlo Rides", city: "Saint-Quay-Portrieux" };
    const jwt = makeJwt(payload);
    expect(auth.parseJwtPayload(jwt)).toEqual(payload);
  });

  it("returns null for invalid token", () => {
    expect(auth.parseJwtPayload("")).toBe(null);
    expect(auth.parseJwtPayload("no-dots")).toBe(null);
    expect(auth.parseJwtPayload(null)).toBe(null);
  });

  it("returns null for malformed base64 in payload", () => {
    expect(auth.parseJwtPayload("h.!!!invalid!!!.s")).toBe(null);
  });
});

describe("normalizeUserMetadata", () => {
  it("returns empty object for null/undefined", () => {
    expect(auth.normalizeUserMetadata(null)).toEqual({});
    expect(auth.normalizeUserMetadata(undefined)).toEqual({});
  });

  it("returns the object as-is if valid", () => {
    const obj = { pseudo: "Jean", age: 42 };
    expect(auth.normalizeUserMetadata(obj)).toEqual(obj);
  });

  it("returns empty object for arrays", () => {
    expect(auth.normalizeUserMetadata([1, 2, 3])).toEqual({});
  });

  it("parses valid JSON string", () => {
    const obj = { pseudo: "Rider" };
    expect(auth.normalizeUserMetadata(JSON.stringify(obj))).toEqual(obj);
  });

  it("returns empty object for non-object JSON string", () => {
    expect(auth.normalizeUserMetadata('"just a string"')).toEqual({});
    expect(auth.normalizeUserMetadata("42")).toEqual({});
  });

  it("returns empty object for invalid JSON string", () => {
    expect(auth.normalizeUserMetadata("{bad json")).toEqual({});
  });

  it("returns empty object for non-string/non-object types", () => {
    expect(auth.normalizeUserMetadata(42)).toEqual({});
    expect(auth.normalizeUserMetadata(true)).toEqual({});
  });
});

describe("extractPseudoFromMetadata", () => {
  it("extracts pseudo field", () => {
    expect(auth.extractPseudoFromMetadata({ pseudo: "CycloMax" })).toBe("CycloMax");
  });

  it("falls back through preferred_username, username, name, etc.", () => {
    expect(auth.extractPseudoFromMetadata({ preferred_username: "pref" })).toBe("pref");
    expect(auth.extractPseudoFromMetadata({ username: "usr" })).toBe("usr");
    expect(auth.extractPseudoFromMetadata({ name: "Nom" })).toBe("Nom");
    expect(auth.extractPseudoFromMetadata({ full_name: "Nom Complet" })).toBe("Nom Complet");
    expect(auth.extractPseudoFromMetadata({ display_name: "Display" })).toBe("Display");
    expect(auth.extractPseudoFromMetadata({ given_name: "Prénom" })).toBe("Prénom");
  });

  it("returns empty string when no pseudo fields exist", () => {
    expect(auth.extractPseudoFromMetadata({ email: "x@y.z" })).toBe("");
    expect(auth.extractPseudoFromMetadata({})).toBe("");
  });

  it("trims whitespace", () => {
    expect(auth.extractPseudoFromMetadata({ pseudo: "  spacey  " })).toBe("spacey");
  });

  it("handles null/undefined metadata via normalizeUserMetadata", () => {
    expect(auth.extractPseudoFromMetadata(null)).toBe("");
  });
});

describe("unwrapAuthUser", () => {
  it("returns null for non-object input", () => {
    expect(auth.unwrapAuthUser(null)).toBe(null);
    expect(auth.unwrapAuthUser("string")).toBe(null);
    expect(auth.unwrapAuthUser(42)).toBe(null);
  });

  it("unwraps nested user object", () => {
    const user = { id: "u1", email: "a@b.c" };
    expect(auth.unwrapAuthUser({ user })).toBe(user);
  });

  it("returns payload directly if no .user wrapper", () => {
    const payload = { id: "u2", email: "x@y.z" };
    expect(auth.unwrapAuthUser(payload)).toBe(payload);
  });

  it("does not unwrap if user is not an object", () => {
    const payload = { user: "not-an-object", id: "u3" };
    expect(auth.unwrapAuthUser(payload)).toBe(payload);
  });
});

describe("pseudoFromSupabaseUser", () => {
  it("extracts pseudo from user_metadata", () => {
    const user = { user_metadata: { pseudo: "Rider42" } };
    expect(auth.pseudoFromSupabaseUser(user)).toBe("Rider42");
  });

  it("extracts pseudo from raw_user_meta_data as fallback", () => {
    const user = { user_metadata: {}, raw_user_meta_data: { name: "RawName" } };
    expect(auth.pseudoFromSupabaseUser(user)).toBe("RawName");
  });

  it("extracts pseudo from identities as last resort", () => {
    const user = {
      user_metadata: {},
      raw_user_meta_data: {},
      identities: [{ identity_data: { username: "IdUser" } }]
    };
    expect(auth.pseudoFromSupabaseUser(user)).toBe("IdUser");
  });

  it("handles wrapped user object", () => {
    const wrapped = { user: { user_metadata: { pseudo: "Wrapped" } } };
    expect(auth.pseudoFromSupabaseUser(wrapped)).toBe("Wrapped");
  });

  it("returns empty string for null/invalid", () => {
    expect(auth.pseudoFromSupabaseUser(null)).toBe("");
    expect(auth.pseudoFromSupabaseUser({})).toBe("");
  });
});

describe("normalizeTokenResponse", () => {
  it("returns null for non-object", () => {
    expect(auth.normalizeTokenResponse(null)).toBe(null);
    expect(auth.normalizeTokenResponse("string")).toBe(null);
  });

  it("passes through root-level access_token", () => {
    const body = { access_token: "tok", refresh_token: "ref", expires_in: 7200 };
    expect(auth.normalizeTokenResponse(body)).toBe(body);
  });

  it("returns null if access_token is empty string", () => {
    expect(auth.normalizeTokenResponse({ access_token: "" })).toBe(null);
  });

  it("extracts from nested session object", () => {
    const body = {
      user: { id: "u1" },
      session: { access_token: "nested-tok", refresh_token: "ref2", expires_in: 1800 }
    };
    const result = auth.normalizeTokenResponse(body);
    expect(result.access_token).toBe("nested-tok");
    expect(result.refresh_token).toBe("ref2");
    expect(result.expires_in).toBe(1800);
    expect(result.user).toEqual({ id: "u1" });
  });

  it("uses session.user if no top-level user", () => {
    const body = {
      session: { access_token: "t", refresh_token: "r", expires_in: 3600, user: { id: "su" } }
    };
    const result = auth.normalizeTokenResponse(body);
    expect(result.user).toEqual({ id: "su" });
  });

  it("defaults expires_in to 3600 when not a number", () => {
    const body = {
      session: { access_token: "t", refresh_token: "r", expires_in: "invalid" }
    };
    const result = auth.normalizeTokenResponse(body);
    expect(result.expires_in).toBe(3600);
  });
});

describe("humanizeAuthError", () => {
  it("returns redirect error in French", () => {
    const msg = auth.humanizeAuthError("redirect_to is not allowed");
    expect(msg).toContain("L\u2019adresse de retour");
    expect(msg).toContain("Redirect URLs");
    expect(msg).toContain("n\u2019est pas autoris\u00e9e");
  });

  it("returns invalid login credentials message", () => {
    const msg = auth.humanizeAuthError("Invalid login credentials");
    expect(msg).toContain("Connexion refusée");
    expect(msg).toContain("e-mail ou mot de passe incorrect");
  });

  it("returns invalid_grant message", () => {
    const msg = auth.humanizeAuthError("invalid_grant");
    expect(msg).toContain("Connexion refusée");
  });

  it("returns email not confirmed message", () => {
    const msg = auth.humanizeAuthError("Email not confirmed");
    expect(msg).toContain("pas encore confirmée");
  });

  it("returns already registered message", () => {
    const msg = auth.humanizeAuthError("User already registered");
    expect(msg).toContain("déjà utilisée");
  });

  it("returns weak password message", () => {
    const msg = auth.humanizeAuthError("Password is too weak");
    expect(msg).toContain("trop court ou trop faible");
  });

  it("appends signup hint for short invalid messages during signup", () => {
    const msg = auth.humanizeAuthError("Invalid request", "/auth/v1/signup");
    expect(msg).toContain("inscriptions sont autorisées");
  });

  it("returns raw message for unknown errors", () => {
    expect(auth.humanizeAuthError("Something unexpected")).toBe("Something unexpected");
  });

  it("returns default for empty/null", () => {
    expect(auth.humanizeAuthError("")).toBe("Demande refusée.");
    expect(auth.humanizeAuthError(null)).toBe("Demande refusée.");
  });
});

describe("persistFromAuthResponse", () => {
  beforeEach(() => {
    localStorage.clear();
    window.GOELO_SUPABASE_URL = "https://proj.supabase.co";
    window.GOELO_SUPABASE_ANON_KEY = "valid-key";
  });

  function makeJwt(payload) {
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `header.${b64}.signature`;
  }

  it("stores session from a valid response", () => {
    const token = makeJwt({ email: "rider@goelo.fr", user_metadata: { pseudo: "Rider" } });
    const body = {
      access_token: token,
      refresh_token: "ref-tok",
      expires_in: 3600,
      user: { email: "rider@goelo.fr", user_metadata: { pseudo: "Rider" } }
    };
    expect(auth.persistFromAuthResponse(body)).toBe(true);
    const session = auth.readSession();
    expect(session.access_token).toBe(token);
    expect(session.refresh_token).toBe("ref-tok");
    expect(session.email).toBe("rider@goelo.fr");
    expect(session.pseudo).toBe("Rider");
    expect(session.expires_at_ms).toBeGreaterThan(Date.now());
  });

  it("returns false for null/invalid body", () => {
    expect(auth.persistFromAuthResponse(null)).toBe(false);
    expect(auth.persistFromAuthResponse({})).toBe(false);
    expect(auth.persistFromAuthResponse({ access_token: "" })).toBe(false);
  });

  it("extracts email from JWT payload when not in user object", () => {
    const token = makeJwt({ email: "jwt@email.com" });
    const body = { access_token: token, refresh_token: "r", expires_in: 3600 };
    auth.persistFromAuthResponse(body);
    const session = auth.readSession();
    expect(session.email).toBe("jwt@email.com");
  });

  it("preserves previous refresh_token if new one is empty", () => {
    auth.writeSession({ access_token: "old", refresh_token: "old-ref", email: "" });
    const token = makeJwt({ email: "a@b.c" });
    const body = { access_token: token, refresh_token: "", expires_in: 3600 };
    auth.persistFromAuthResponse(body);
    const session = auth.readSession();
    expect(session.refresh_token).toBe("old-ref");
  });
});
