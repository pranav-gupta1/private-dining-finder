import { describe, expect, it } from "vitest";

import type { Venue, VenueSpace } from "@/lib/types";
import { bestCapacityFit, fitQuality, usableCapacity } from "@/lib/rank/capacity";

function space(overrides: Partial<VenueSpace> & { name: string }): VenueSpace {
  return {
    id: `space-${overrides.name}`,
    kind: "private_room",
    seatedCapacity: null,
    standingCapacity: null,
    minGuests: null,
    squareFeet: null,
    minSpendCents: null,
    perPersonCents: null,
    currency: "USD",
    features: [],
    notes: null,
    combinableWith: [],
    ...overrides,
  };
}

function venue(spaces: VenueSpace[], overrides: Partial<Venue> = {}): Venue {
  return {
    id: "venue-1",
    slug: "test-venue",
    name: "Test Venue",
    venueType: "restaurant",
    addressLine1: "1 Test St",
    addressLine2: null,
    city: "New York",
    region: "NY",
    postalCode: null,
    country: "US",
    neighborhood: null,
    lat: 40.75,
    lon: -73.98,
    cuisines: [],
    priceTier: null,
    website: null,
    eventsUrl: null,
    phone: null,
    eventsEmail: null,
    summary: null,
    eventStyles: [],
    acceptsBuyout: false,
    spaces,
    menus: [],
    dietary: [],
    evidence: [],
    ...overrides,
  };
}

describe("usableCapacity", () => {
  it("uses seated capacity for a seated dinner", () => {
    const result = usableCapacity(
      space({ name: "A", seatedCapacity: 40, standingCapacity: 80 }),
      "seated_dinner",
    );
    expect(result).toEqual({ value: 40, derived: false, basis: "seated" });
  });

  it("uses standing capacity for a reception", () => {
    const result = usableCapacity(
      space({ name: "A", seatedCapacity: 40, standingCapacity: 80 }),
      "reception",
    );
    expect(result).toEqual({ value: 80, derived: false, basis: "standing" });
  });

  it("flags a converted number as derived rather than passing it off as published", () => {
    const result = usableCapacity(space({ name: "A", seatedCapacity: 100 }), "reception");
    expect(result?.derived).toBe(true);
    expect(result?.value).toBe(140);
  });

  it("returns null when the space has no capacity at all", () => {
    expect(usableCapacity(space({ name: "A" }), "seated_dinner")).toBeNull();
  });
});

describe("fitQuality", () => {
  it("scores a room that cannot hold the group at zero", () => {
    expect(fitQuality(40, 50)).toBe(0);
  });

  it("scores comfortable headroom at the maximum", () => {
    expect(fitQuality(60, 50)).toBe(1);
    expect(fitQuality(75, 50)).toBe(1);
  });

  it("penalises an exact fit, since there is no room for a bar or AV", () => {
    expect(fitQuality(50, 50)).toBeLessThan(0.8);
  });

  it("penalises a cavernous room", () => {
    expect(fitQuality(500, 50)).toBeLessThan(0.4);
    expect(fitQuality(3500, 200)).toBeLessThan(0.4);
  });

  it("rises into the ideal band and falls away past it", () => {
    expect(fitQuality(52, 50)).toBeLessThan(fitQuality(60, 50));
    expect(fitQuality(200, 50)).toBeLessThan(fitQuality(100, 50));
    expect(fitQuality(100, 50)).toBeLessThan(fitQuality(60, 50));
  });
});

describe("bestCapacityFit", () => {
  it("prefers the room sized closest to the group", () => {
    const fit = bestCapacityFit(
      venue([
        space({ name: "Ballroom", seatedCapacity: 400, kind: "ballroom" }),
        space({ name: "Library", seatedCapacity: 60 }),
        space({ name: "Nook", seatedCapacity: 20 }),
      ]),
      50,
      "seated_dinner",
    );
    expect(fit.label).toBe("Library");
    expect(fit.arrangement).toBe("single_room");
    expect(fit.explanation).toContain("fits 50");
  });

  it("reports no fit rather than proposing something too small", () => {
    const fit = bestCapacityFit(venue([space({ name: "Nook", seatedCapacity: 20 })]), 50, "seated_dinner");
    expect(fit.arrangement).toBe("none");
    expect(fit.capacity).toBe(0);
  });

  it("combines rooms only when no single room works", () => {
    const fit = bestCapacityFit(
      venue([
        space({ name: "North", seatedCapacity: 30, combinableWith: ["South"] }),
        space({ name: "South", seatedCapacity: 30, combinableWith: ["North"] }),
      ]),
      50,
      "seated_dinner",
    );
    expect(fit.arrangement).toBe("combined_rooms");
    expect(fit.capacity).toBe(60);
    expect(fit.spaceIds).toHaveLength(2);
  });

  it("takes a single room over a combination when both would work", () => {
    const fit = bestCapacityFit(
      venue([
        space({ name: "Whole floor", seatedCapacity: 70 }),
        space({ name: "North", seatedCapacity: 30, combinableWith: ["South"] }),
        space({ name: "South", seatedCapacity: 30, combinableWith: ["North"] }),
      ]),
      50,
      "seated_dinner",
    );
    expect(fit.arrangement).toBe("single_room");
  });

  it("resolves a chain of combinable rooms transitively", () => {
    const fit = bestCapacityFit(
      venue([
        space({ name: "A", seatedCapacity: 20, combinableWith: ["B"] }),
        space({ name: "B", seatedCapacity: 20, combinableWith: ["A", "C"] }),
        space({ name: "C", seatedCapacity: 20, combinableWith: ["B"] }),
      ]),
      55,
      "seated_dinner",
    );
    expect(fit.capacity).toBe(60);
    expect(fit.spaceIds).toHaveLength(3);
  });

  it("excludes buyouts when the planner has ruled them out", () => {
    const fit = bestCapacityFit(
      venue([space({ name: "Whole venue", seatedCapacity: 120, kind: "full_buyout" })]),
      50,
      "seated_dinner",
      { allowBuyout: false },
    );
    expect(fit.arrangement).toBe("none");
  });

  it("switches to standing capacity for a reception", () => {
    const fit = bestCapacityFit(
      venue([space({ name: "Terrace", seatedCapacity: 120, standingCapacity: 300, kind: "outdoor" })]),
      200,
      "reception",
    );
    expect(fit.capacity).toBe(300);
    expect(fit.explanation).toContain("standing");
  });

  it("marks capacity unverified when the venue publishes nothing", () => {
    const fit = bestCapacityFit(venue([space({ name: "Room", seatedCapacity: 60 })]), 50, "seated_dinner");
    expect(fit.trust).toBe("unverified");
  });

  it("carries first-party evidence through to the fit", () => {
    const rooms = [space({ name: "Room", seatedCapacity: 60 })];
    const withEvidence = venue(rooms, {
      evidence: [
        {
          field: "space.capacity",
          spaceId: rooms[0].id,
          menuId: null,
          sourceKind: "venue_site",
          sourceUrl: "https://example.com/events",
          sourceTitle: null,
          snippet: "The Room seats 60.",
          observedAt: new Date().toISOString().slice(0, 10),
        },
      ],
    });
    expect(bestCapacityFit(withEvidence, 50, "seated_dinner").trust).toBe("verified");
  });
});
