/**
 * @jest-environment jsdom
 */

const updates = require("../goelo-ride-updates.js");

describe("goeloRideRouteSnapshot", () => {
  it("returns null for null/undefined route", () => {
    expect(updates.goeloRideRouteSnapshot(null)).toBe(null);
    expect(updates.goeloRideRouteSnapshot(undefined)).toBe(null);
  });

  it("returns null for route without id", () => {
    expect(updates.goeloRideRouteSnapshot({ name: "test" })).toBe(null);
  });

  it("creates a snapshot with all expected fields", () => {
    const route = {
      id: "route-1",
      track: "La Boucle du Goëlo",
      name: "Groupe A",
      depart: { dateLabel: "Dim. 15 juin" },
      pace: "28 km/h",
      meetPlace: "Saint-Quay",
      meetPlaceDetail: "Parking du port",
      rideLeader: "Jean",
      shortDesc: "Parcours côtier avec dénivelé modéré",
      sortieStatus: "open",
      visibility: "public",
      maxParticipants: 20,
      estimatedDurationHm: "2h30",
      raceType: "route",
      routeKind: "boucle",
      profile: { totalKm: 45.678 }
    };
    const snap = updates.goeloRideRouteSnapshot(route);
    expect(snap.id).toBe("route-1");
    expect(snap.track).toBe("La Boucle du Goëlo");
    expect(snap.name).toBe("Groupe A");
    expect(snap.dateLabel).toBe("Dim. 15 juin");
    expect(snap.pace).toBe("28 km/h");
    expect(snap.meetPlace).toBe("Saint-Quay");
    expect(snap.meetPlaceDetail).toBe("Parking du port");
    expect(snap.rideLeader).toBe("Jean");
    expect(snap.shortDesc).toBe("Parcours côtier avec dénivelé modéré");
    expect(snap.sortieStatus).toBe("open");
    expect(snap.visibility).toBe("public");
    expect(snap.maxParticipants).toBe(20);
    expect(snap.estimatedDurationHm).toBe("2h30");
    expect(snap.raceType).toBe("route");
    expect(snap.routeKind).toBe("boucle");
    expect(snap.km).toBe(45.7);
  });

  it("handles missing optional fields gracefully", () => {
    const route = { id: 42 };
    const snap = updates.goeloRideRouteSnapshot(route);
    expect(snap.id).toBe("42");
    expect(snap.track).toBe("");
    expect(snap.name).toBe("");
    expect(snap.dateLabel).toBe("");
    expect(snap.pace).toBe("");
    expect(snap.km).toBe(null);
    expect(snap.maxParticipants).toBe(null);
    expect(snap.sortieStatus).toBe("open");
    expect(snap.visibility).toBe("public");
  });

  it("truncates shortDesc to 280 characters", () => {
    const route = { id: 1, shortDesc: "x".repeat(500) };
    const snap = updates.goeloRideRouteSnapshot(route);
    expect(snap.shortDesc.length).toBe(280);
  });

  it("rounds km to one decimal", () => {
    const route = { id: 1, profile: { totalKm: 12.345 } };
    expect(updates.goeloRideRouteSnapshot(route).km).toBe(12.3);
  });

  it("returns null km for NaN totalKm", () => {
    const route = { id: 1, profile: { totalKm: NaN } };
    expect(updates.goeloRideRouteSnapshot(route).km).toBe(null);
  });
});

describe("snapsEqual", () => {
  it("returns true for identical snapshots", () => {
    const a = { id: "1", track: "A" };
    const b = { id: "1", track: "A" };
    expect(updates.snapsEqual(a, b)).toBe(true);
  });

  it("returns false for different snapshots", () => {
    const a = { id: "1", track: "A" };
    const b = { id: "1", track: "B" };
    expect(updates.snapsEqual(a, b)).toBe(false);
  });

  it("returns true for both null", () => {
    expect(updates.snapsEqual(null, null)).toBe(true);
  });
});

describe("diffSnapshotsToSummaryFr", () => {
  it("returns generic message when oldSnap is null", () => {
    expect(updates.diffSnapshotsToSummaryFr(null, { id: "1" })).toBe("informations mises à jour");
  });

  it("returns generic message when newSnap is null", () => {
    expect(updates.diffSnapshotsToSummaryFr({ id: "1" }, null)).toBe("informations mises à jour");
  });

  it("returns generic message when no fields differ", () => {
    const snap = { track: "A", name: "B", pace: "25" };
    expect(updates.diffSnapshotsToSummaryFr(snap, snap)).toBe("informations mises à jour");
  });

  it("lists changed fields in French (1-3 changes)", () => {
    const old = { track: "A", name: "B", pace: "25", dateLabel: "lun" };
    const updated = { track: "A2", name: "B", pace: "28", dateLabel: "lun" };
    const result = updates.diffSnapshotsToSummaryFr(old, updated);
    expect(result).toContain("nom du parcours");
    expect(result).toContain("allure");
    expect(result).toContain("modifié·e·s");
  });

  it("truncates and says 'et autres changements' for 4+ changes", () => {
    const old = { track: "A", name: "B", pace: "25", dateLabel: "lun", meetPlace: "X" };
    const updated = { track: "A2", name: "B2", pace: "28", dateLabel: "mar", meetPlace: "Y" };
    const result = updates.diffSnapshotsToSummaryFr(old, updated);
    expect(result).toContain("et autres changements");
  });
});

describe("escapeHtml", () => {
  it("escapes &, <, >, and double quotes", () => {
    expect(updates.escapeHtml('Tom & Jerry <"friends">')).toBe(
      "Tom &amp; Jerry &lt;&quot;friends&quot;&gt;"
    );
  });

  it("handles null/undefined gracefully", () => {
    expect(updates.escapeHtml(null)).toBe("");
    expect(updates.escapeHtml(undefined)).toBe("");
  });

  it("leaves clean strings unchanged", () => {
    expect(updates.escapeHtml("Hello World")).toBe("Hello World");
  });
});

describe("pickVisualIdea", () => {
  it("returns gravel theme for gravel raceType", () => {
    const result = updates.pickVisualIdea({ raceType: "gravel", color: "#abc" });
    expect(result).toContain("gravier");
    expect(result).toContain("#abc");
  });

  it("returns VTT theme for vtt raceType", () => {
    const result = updates.pickVisualIdea({ raceType: "VTT" });
    expect(result).toContain("VTT");
  });

  it("returns famille theme for famille raceType", () => {
    const result = updates.pickVisualIdea({ raceType: "famille" });
    expect(result).toContain("Famille");
  });

  it("returns default theme for unknown raceType", () => {
    const result = updates.pickVisualIdea({ raceType: "route" });
    expect(result).toContain("côte");
    expect(result).toContain("#1565a8");
  });

  it("handles null route", () => {
    const result = updates.pickVisualIdea(null);
    expect(result).toContain("#1565a8");
  });
});

describe("buildGroupAnnouncementText", () => {
  const route = {
    id: "r1",
    track: "La Falaise",
    depart: { dateLabel: "Sam. 21 juin" },
    meetPlace: "Port de Binic",
    meetPlaceDetail: "Parking est"
  };

  it("builds a new ride announcement", () => {
    const text = updates.buildGroupAnnouncementText(route, { origin: "https://goelo.app" });
    expect(text).toContain("Nouvelle sortie GoëloRides");
    expect(text).toContain("La Falaise");
    expect(text).toContain("Sam. 21 juin");
    expect(text).toContain("Parking est");
    expect(text).toContain("https://goelo.app/sortie.html?id=r1");
    expect(text).toContain("— GoëloRides");
  });

  it("builds an update announcement when wasEdit is true", () => {
    const text = updates.buildGroupAnnouncementText(route, { wasEdit: true, origin: "https://goelo.app" });
    expect(text).toContain("Mise à jour");
    expect(text).toContain("Vérifie horaire");
  });

  it("builds a cancellation announcement", () => {
    const text = updates.buildGroupAnnouncementText(route, { cancelled: true, origin: "https://goelo.app" });
    expect(text).toContain("Sortie retirée");
    expect(text).toContain("La Falaise");
    expect(text).toContain("n\u2019est plus propos\u00e9e");
  });

  it("falls back to sorties.html when no route id", () => {
    const noId = { track: "Test", depart: {} };
    const text = updates.buildGroupAnnouncementText(noId, { origin: "https://goelo.app" });
    expect(text).toContain("https://goelo.app/sorties.html");
  });

  it("uses meetPlace when meetPlaceDetail is empty", () => {
    const r = { id: "x", track: "T", depart: {}, meetPlace: "Binic", meetPlaceDetail: "" };
    const text = updates.buildGroupAnnouncementText(r, { origin: "https://x.com" });
    expect(text).toContain("Binic");
  });
});

describe("buildInstagramStoryText", () => {
  const route = {
    id: "r2",
    track: "Saint-Quay Express",
    depart: { dateLabel: "Dim. 22 juin" },
    meetPlace: "Place du port",
    meetPlaceDetail: ""
  };

  it("builds a new story text with hashtags", () => {
    const text = updates.buildInstagramStoryText(route, { origin: "https://goelo.app" });
    expect(text).toContain("Saint-Quay Express");
    expect(text).toContain("Dim. 22 juin");
    expect(text).toContain("Départ : Place du port");
    expect(text).toContain("Nouvelle sortie");
    expect(text).toContain("#GoëloRides");
    expect(text).toContain("#SaintQuayPortrieux");
    expect(text).toContain("https://goelo.app/sortie.html?id=r2");
  });

  it("builds an update story text", () => {
    const text = updates.buildInstagramStoryText(route, { wasEdit: true, origin: "https://goelo.app" });
    expect(text).toContain("Mise à jour");
  });

  it("builds a cancellation story text", () => {
    const text = updates.buildInstagramStoryText(route, { cancelled: true, origin: "https://goelo.app" });
    expect(text).toContain("Sortie retirée");
    expect(text).toContain("Plus d\u2019inscription");
  });

  it("uses 'À venir' when dateLabel is empty", () => {
    const r = { id: "x", track: "T", depart: {} };
    const text = updates.buildInstagramStoryText(r, { origin: "https://x.com" });
    expect(text).toContain("À venir");
  });

  it("includes changeLine when provided", () => {
    const text = updates.buildInstagramStoryText(route, { changeLine: "Horaire modifié", origin: "https://x.com" });
    expect(text).toContain("Horaire modifié");
  });
});
