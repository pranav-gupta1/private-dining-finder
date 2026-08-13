import { describe, expect, it } from "vitest";

import type { Commute, RankedVenue, SearchRequest } from "@/lib/types";
import { estimateTravel, prefilterRadiusMeters } from "@/lib/geo/distance";
import { allVenues, seedFiles } from "@/lib/db/snapshot";
import { haversineMeters } from "@/lib/geo/distance";
import { rankVenue, STRETCH_MULTIPLIER } from "@/lib/rank/score";

/**
 * The three briefs from the spec, run end to end without touching the network.
 *
 * Commute times come from the straight-line estimator rather than a routing
 * service, so these assertions are about the pipeline and the dataset rather
 * than about any provider being up. The margins below are wide enough that a
 * real routed number lands inside them too.
 */

const ORIGINS = {
  timesSquare: { lat: 40.757975, lon: -73.985543 },
  salesforceTower: { lat: 37.789661, lon: -122.396742 },
  hiltonHawaiianVillage: { lat: 21.28194, lon: -157.83722 },
};

function search(origin: { lat: number; lon: number }, request: SearchRequest): RankedVenue[] {
  const radius = prefilterRadiusMeters(request.maxCommuteMinutes, request.travelMode) * STRETCH_MULTIPLIER;
  const ceiling = request.maxCommuteMinutes * STRETCH_MULTIPLIER;

  return allVenues()
    .filter((venue) => haversineMeters(origin, venue) <= radius)
    .map((venue) => {
      const leg = estimateTravel(origin, venue, request.travelMode);
      const commute: Commute = {
        mode: request.travelMode,
        durationMinutes: leg.durationSeconds / 60,
        distanceMeters: leg.distanceMeters,
        provider: "straight-line estimate",
        estimated: true,
      };
      return { venue, commute };
    })
    .filter(({ commute }) => commute.durationMinutes <= ceiling)
    .map(({ venue, commute }) => rankVenue(venue, commute, request))
    .filter((r): r is RankedVenue => r !== null)
    .sort((a, b) => {
      if (a.withinCommute !== b.withinCommute) return a.withinCommute ? -1 : 1;
      return b.score - a.score;
    });
}

const base: Omit<SearchRequest, "address" | "headcount" | "maxCommuteMinutes" | "style"> = {
  travelMode: "walking",
  dietary: [],
  allowBuyout: true,
  includeUnverified: true,
};

describe("scenario 1 — 50 people near Times Square, under a 20 minute walk", () => {
  const results = search(ORIGINS.timesSquare, {
    ...base,
    address: "Times Square, New York, NY",
    headcount: 50,
    maxCommuteMinutes: 20,
    style: "seated_dinner",
  });
  const within = results.filter((r) => r.withinCommute);

  it("returns a usable shortlist", () => {
    expect(within.length).toBeGreaterThanOrEqual(4);
  });

  it("only recommends spaces that actually hold 50", () => {
    for (const result of within) {
      expect(result.fit.capacity).toBeGreaterThanOrEqual(50);
      expect(result.fit.arrangement).not.toBe("none");
    }
  });

  it("keeps every result inside the stated walk", () => {
    for (const result of within) expect(result.commute.durationMinutes).toBeLessThanOrEqual(20);
  });

  it("leads with a venue whose capacity came from the venue itself", () => {
    expect(within[0].trust).toBe("verified");
  });

  it("excludes the Upper East Side venue that is nowhere near Times Square", () => {
    expect(results.map((r) => r.venue.slug)).not.toContain("haswell-greens-midtown");
  });
});

describe("scenario 2 — 30 people near Salesforce Tower, under a 15 minute walk", () => {
  const results = search(ORIGINS.salesforceTower, {
    ...base,
    address: "415 Mission St, San Francisco, CA 94105",
    headcount: 30,
    maxCommuteMinutes: 15,
    style: "seated_dinner",
  });
  const within = results.filter((r) => r.withinCommute);

  it("returns a usable shortlist", () => {
    expect(within.length).toBeGreaterThanOrEqual(4);
  });

  it("only recommends spaces that hold 30 seated", () => {
    for (const result of within) expect(result.fit.capacity).toBeGreaterThanOrEqual(30);
  });

  it("surfaces the two venues closest to the tower near the top", () => {
    const topFive = within.slice(0, 5).map((r) => r.venue.slug);
    expect(topFive).toContain("prospect-sf");
    expect(topFive).toContain("wayfare-tavern");
  });

  it("does not reach as far as the western end of SoMa", () => {
    // Mars Bar is a real, well-reviewed option — and a 25 minute walk away.
    const marsBar = results.find((r) => r.venue.slug === "mars-bar-sf");
    expect(marsBar?.withinCommute ?? false).toBe(false);
  });
});

describe("scenario 3 — 200 people, reception, under a 15 minute walk from Hilton Hawaiian Village", () => {
  const results = search(ORIGINS.hiltonHawaiianVillage, {
    ...base,
    address: "Hilton Hawaiian Village Waikiki Beach Resort, Waikiki, HI",
    headcount: 200,
    maxCommuteMinutes: 15,
    style: "reception",
  });
  const within = results.filter((r) => r.withinCommute);

  it("returns a usable shortlist", () => {
    expect(within.length).toBeGreaterThanOrEqual(3);
  });

  it("ranks against standing capacity, not seated", () => {
    for (const result of within) {
      expect(result.fit.capacity).toBeGreaterThanOrEqual(200);
      expect(result.fit.explanation).toContain("standing");
    }
  });

  it("puts the resort's own space first — it is a zero minute walk", () => {
    expect(within[0].venue.slug).toBe("hilton-hawaiian-village");
    expect(within[0].commute.durationMinutes).toBeLessThan(1);
  });

  it("picks a right-sized room rather than the biggest one available", () => {
    // The Coral Ballroom holds 3,775. Recommending it for 200 would be absurd.
    expect(within[0].fit.label).toBe("Rainbow Suite");
  });

  it("warns when a room is many times larger than the group", () => {
    const sheraton = results.find((r) => r.venue.slug === "sheraton-waikiki");
    expect(sheraton).toBeDefined();
    expect(sheraton!.warnings.some((w) => /will feel empty/.test(w))).toBe(true);
  });

  it("excludes the venue that caps out at 75", () => {
    expect(results.map((r) => r.venue.slug)).not.toContain("kani-ka-pila-grille");
  });

  it("offers near-miss venues as stretch options rather than hiding them", () => {
    const stretch = results.filter((r) => !r.withinCommute);
    expect(stretch.length).toBeGreaterThan(0);
    for (const result of stretch) {
      expect(result.commute.durationMinutes).toBeGreaterThan(15);
      expect(result.commute.durationMinutes).toBeLessThanOrEqual(15 * STRETCH_MULTIPLIER);
    }
  });
});

describe("committed dataset", () => {
  const venues = allVenues();

  it("covers all three markets", () => {
    expect(seedFiles().map((f) => f.market).sort()).toEqual([
      "Manhattan, NY",
      "San Francisco, CA",
      "Waikiki, HI",
    ]);
  });

  it("has unique slugs", () => {
    const slugs = venues.map((v) => v.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every space at least one capacity figure", () => {
    for (const venue of venues) {
      for (const space of venue.spaces) {
        expect(
          space.seatedCapacity ?? space.standingCapacity,
          `${venue.slug} / ${space.name}`,
        ).not.toBeNull();
      }
    }
  });

  it("never leaves an estimate undocumented", () => {
    for (const venue of venues) {
      for (const item of venue.evidence) {
        if (item.sourceKind === "inferred") {
          expect(item.snippet, `${venue.slug} / ${item.field}`).toBeTruthy();
        }
      }
    }
  });

  it("points every space-scoped evidence row at a space that exists", () => {
    for (const venue of venues) {
      const ids = new Set(venue.spaces.map((s) => s.id));
      const menuIds = new Set(venue.menus.map((m) => m.id));
      for (const item of venue.evidence) {
        if (item.spaceId) expect(ids.has(item.spaceId), `${venue.slug}`).toBe(true);
        if (item.menuId) expect(menuIds.has(item.menuId), `${venue.slug}`).toBe(true);
      }
    }
  });

  it("keeps every venue inside the market it is filed under", () => {
    const centres: Record<string, { lat: number; lon: number }> = {
      "Manhattan, NY": ORIGINS.timesSquare,
      "San Francisco, CA": ORIGINS.salesforceTower,
      "Waikiki, HI": ORIGINS.hiltonHawaiianVillage,
    };
    for (const file of seedFiles()) {
      for (const venue of file.venues) {
        const km = haversineMeters(centres[file.market], venue) / 1000;
        expect(km, `${venue.slug} is ${km.toFixed(1)} km from ${file.market}`).toBeLessThan(12);
      }
    }
  });
});
