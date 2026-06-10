/**
 * @jest-environment jsdom
 */

const nav = require("../goelo-swipe-nav.js");

describe("constants", () => {
  it("exposes navigation ring with 4 pages", () => {
    expect(nav.RING).toEqual(["index.html", "sorties.html", "groupes.html", "infos-pratiques.html"]);
  });

  it("exposes edge detection threshold", () => {
    expect(nav.EDGE).toBe(40);
  });

  it("exposes minimum horizontal distance", () => {
    expect(nav.MIN_DX).toBe(56);
  });

  it("exposes minimum horizontal ratio", () => {
    expect(nav.MIN_HORIZ).toBe(1.12);
  });

  it("exposes max mobile width", () => {
    expect(nav.MAX_WIDTH).toBe(900);
  });
});

describe("isMobile", () => {
  it("returns false for desktop-width viewport", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      }))
    });
    expect(nav.isMobile()).toBe(false);
  });

  it("returns true for narrow viewport", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: true,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      }))
    });
    expect(nav.isMobile()).toBe(true);
  });
});

describe("pathBase", () => {
  function setPath(path) {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { pathname: path }
    });
  }

  it("detects sorties.html", () => {
    setPath("/app/sorties.html");
    expect(nav.pathBase()).toBe("sorties.html");
  });

  it("detects sortie.html (single ride)", () => {
    setPath("/sortie.html");
    expect(nav.pathBase()).toBe("sortie.html");
  });

  it("detects groupes.html", () => {
    setPath("/groupes.html");
    expect(nav.pathBase()).toBe("groupes.html");
  });

  it("detects infos-pratiques.html", () => {
    setPath("/infos-pratiques.html");
    expect(nav.pathBase()).toBe("infos-pratiques.html");
  });

  it("detects index.html", () => {
    setPath("/index.html");
    expect(nav.pathBase()).toBe("index.html");
  });

  it("falls back to index.html for root path", () => {
    setPath("/");
    expect(nav.pathBase()).toBe("index.html");
  });

  it("falls back to index.html for empty path", () => {
    setPath("");
    expect(nav.pathBase()).toBe("index.html");
  });

  it("falls back to index.html for unknown paths", () => {
    setPath("/something-else.html");
    expect(nav.pathBase()).toBe("index.html");
  });
});

describe("ringIndex", () => {
  function setPath(path) {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { pathname: path }
    });
  }

  it("returns 0 for index.html", () => {
    setPath("/index.html");
    expect(nav.ringIndex()).toBe(0);
  });

  it("returns 1 for sorties.html", () => {
    setPath("/sorties.html");
    expect(nav.ringIndex()).toBe(1);
  });

  it("returns 2 for groupes.html", () => {
    setPath("/groupes.html");
    expect(nav.ringIndex()).toBe(2);
  });

  it("returns 3 for infos-pratiques.html", () => {
    setPath("/infos-pratiques.html");
    expect(nav.ringIndex()).toBe(3);
  });

  it("returns -1 for sortie.html (detail page, outside ring)", () => {
    setPath("/sortie.html");
    expect(nav.ringIndex()).toBe(-1);
  });

  it("returns 0 for root/unknown paths", () => {
    setPath("/");
    expect(nav.ringIndex()).toBe(0);
  });
});

describe("shouldIgnoreTarget", () => {
  it("returns true for null/undefined element", () => {
    expect(nav.shouldIgnoreTarget(null)).toBe(true);
    expect(nav.shouldIgnoreTarget(undefined)).toBe(true);
  });

  it("returns true for elements without closest method", () => {
    expect(nav.shouldIgnoreTarget({})).toBe(true);
  });

  it("ignores input elements", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(nav.shouldIgnoreTarget(input)).toBe(true);
    document.body.removeChild(input);
  });

  it("ignores textarea elements", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    expect(nav.shouldIgnoreTarget(textarea)).toBe(true);
    document.body.removeChild(textarea);
  });

  it("ignores button elements", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    expect(nav.shouldIgnoreTarget(button)).toBe(true);
    document.body.removeChild(button);
  });

  it("ignores anchor elements", () => {
    const a = document.createElement("a");
    a.href = "#";
    document.body.appendChild(a);
    expect(nav.shouldIgnoreTarget(a)).toBe(true);
    document.body.removeChild(a);
  });

  it("ignores elements inside leaflet container", () => {
    const container = document.createElement("div");
    container.classList.add("leaflet-container");
    const child = document.createElement("div");
    container.appendChild(child);
    document.body.appendChild(container);
    expect(nav.shouldIgnoreTarget(child)).toBe(true);
    document.body.removeChild(container);
  });

  it("ignores elements with data-no-swipe-nav attribute", () => {
    const el = document.createElement("div");
    el.setAttribute("data-no-swipe-nav", "");
    document.body.appendChild(el);
    expect(nav.shouldIgnoreTarget(el)).toBe(true);
    document.body.removeChild(el);
  });

  it("allows plain div elements", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    expect(nav.shouldIgnoreTarget(div)).toBe(false);
    document.body.removeChild(div);
  });

  it("allows span elements", () => {
    const span = document.createElement("span");
    document.body.appendChild(span);
    expect(nav.shouldIgnoreTarget(span)).toBe(false);
    document.body.removeChild(span);
  });
});

describe("blockingModal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.classList.remove("goelo-auth-modal-open");
  });

  it("returns false when no modals exist", () => {
    expect(nav.blockingModal()).toBe(false);
  });

  it("returns true when new-route-modal is visible", () => {
    const modal = document.createElement("div");
    modal.id = "new-route-modal";
    document.body.appendChild(modal);
    expect(nav.blockingModal()).toBe(true);
  });

  it("returns false when new-route-modal is hidden", () => {
    const modal = document.createElement("div");
    modal.id = "new-route-modal";
    modal.hidden = true;
    document.body.appendChild(modal);
    expect(nav.blockingModal()).toBe(false);
  });

  it("returns true when signup-modal is visible", () => {
    const modal = document.createElement("div");
    modal.id = "signup-modal";
    document.body.appendChild(modal);
    expect(nav.blockingModal()).toBe(true);
  });

  it("returns true when sortie-signup-panel is visible", () => {
    const panel = document.createElement("div");
    panel.id = "sortie-signup-panel";
    document.body.appendChild(panel);
    expect(nav.blockingModal()).toBe(true);
  });

  it("returns true when goelo-auth-modal-open class is on html", () => {
    document.documentElement.classList.add("goelo-auth-modal-open");
    expect(nav.blockingModal()).toBe(true);
  });
});
