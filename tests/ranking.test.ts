import { describe, expect, it } from "vitest";

import type { Commute, SearchRequest, Venue } from "@/lib/types";
import { budgetFit, priceSignal } from "@/lib/rank/price";
import { rankVenue, WEIGHTS } from "@/lib/rank/score";
import { allVenues } from "@/lib/db/snapshot";

const bySlug = (slug: string): Venue => {
  const venue = allVenues().find((v) => v.slug === slug);
  if (!venue) throw new Error(`Fixture venue ${slug} is missing from the dataset`);
  return venue;
};

const commute = (minutes: number, overrides: Partial<Commute> = {}): Commute => ({
  mode: "walking",
  durationMinutes: minutes,
  distanceMeters: Math.round(minutes * 60 * 1.35),
  provider: "osrm",
  estimated: false,
  ...overrides,
});

const request = (overrides: Partial<SearchRequest> = {}): SearchRequest => ({
  address: "Times Square, New York, NY",
  headcount: 50,
  maxCommuteMinutes: 20,
  travelMode: "walking",
  style: "seated_dinner",
  dietary: [],
  allowBuyout: true,
  includeUnverified: true,
  ...overrides,
});

describe("scoring weights", () => {
  it("sum to exactly 1 so the score is a true percentage", () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("weight capacity highest and contactability lowest", () => {
    expect(WEIGHTS.capacity).toBeGreaterThan(WEIGHTS.commute);
    expect(WEIGHTS.commute).toBeGreaterThan(WEIGHTS.trust);

    expect(WEIGHTS.trust).toBeGreaterThan(WEIGHTS.price);
    expect(WEIGHTS.contact).toBeLessThan(WEIGHTS.dietary);
  });
});

describe("rankVenue", () => {
  it("returns null when no space can hold the group", () => {
    expect(rankVenue(bySlug("keens-steakhouse"), commute(5), request({ headcount: 500 }))).toBeNull();
  });

  it("produces a component for every weighted dimension", () => {
    const ranked = rankVenue(bySlug("keens-steakhouse"), commute(12), request())!;
    expect(ranked.components.map((c) => c.key).sort()).toEqual(
      Object.keys(WEIGHTS).sort(),
    );
    for (const component of ranked.components) {
      expect(component.score).toBeGreaterThanOrEqual(0);
      expect(component.score).toBeLessThanOrEqual(1);
      expect(component.detail.length).toBeGreaterThan(0);
    }
  });

  it("scores the composite as the weighted sum of its parts", () => {
    const ranked = rankVenue(bySlug("keens-steakhouse"), commute(12), request())!;
    const expected = ranked.components.reduce((sum, c) => sum + c.score * c.weight, 0) * 100;
    expect(ranked.score).toBeCloseTo(Math.round(expected * 10) / 10, 5);
  });

  it("ranks a closer venue above an identical one further away", () => {
    const near = rankVenue(bySlug("keens-steakhouse"), commute(4), request())!;
    const far = rankVenue(bySlug("keens-steakhouse"), commute(18), request())!;
    expect(near.score).toBeGreaterThan(far.score);
  });

  it("flags venues past the commute budget without dropping them", () => {
    const stretch = rankVenue(bySlug("keens-steakhouse"), commute(24), request())!;
    expect(stretch.withinCommute).toBe(false);
    expect(stretch.warnings.some((w) => /over the 20 minute limit/.test(w))).toBe(true);
  });

  it("warns when a commute is a straight-line estimate", () => {
    const ranked = rankVenue(
      bySlug("keens-steakhouse"),
      commute(10, { estimated: true, provider: "straight-line estimate" }),
      request(),
    )!;
    expect(ranked.warnings.some((w) => /straight-line estimate/.test(w))).toBe(true);
  });

  it("warns when the recommended room has a guest minimum above the headcount", () => {
    const ranked = rankVenue(bySlug("keens-steakhouse"), commute(10), request({ headcount: 38 }))!;
    expect(ranked.fit.label).toBe("Lincoln Room");
    expect(ranked.warnings.some((w) => /40 guest minimum/.test(w))).toBe(true);
  });

  it("drops unverified venues when the planner asks it to", () => {
    const undocumented: Venue = {
      ...bySlug("keens-steakhouse"),
      slug: "undocumented",
      evidence: [],
    };
    expect(rankVenue(undocumented, commute(5), request())).not.toBeNull();
    expect(rankVenue(undocumented, commute(5), request({ includeUnverified: false }))).toBeNull();

    expect(
      rankVenue(bySlug("keens-steakhouse"), commute(5), request({ includeUnverified: false })),
    ).not.toBeNull();
  });

  it("reports which requested dietary needs are unmet", () => {
    const ranked = rankVenue(
      bySlug("virgils-real-barbecue"),
      commute(3),
      request({ dietary: ["vegetarian", "kosher"] }),
    )!;
    expect(ranked.dietaryCoverage.covered).toEqual(["vegetarian"]);
    const dietary = ranked.components.find((c) => c.key === "dietary")!;
    expect(dietary.detail).toMatch(/missing: kosher/i);
  });

  it("credits a venue that publishes the format it is being asked for", () => {
    const ranked = rankVenue(
      bySlug("carmines-times-square"),
      commute(2),
      request({ style: "reception", headcount: 150 }),
    )!;
    expect(ranked.components.find((c) => c.key === "style")!.score).toBe(1);
  });
});

describe("price signals", () => {
  it("prefers a published room minimum and normalises it per head", () => {
    const venue = bySlug("sushi-lab-times-square");
    const signal = priceSignal(venue, venue.spaces, 40);
    expect(signal.kind).toBe("min_spend");
    expect(signal.amountCents).toBe(1_000_000);
    expect(signal.perPersonCents).toBe(25_000);
    expect(signal.trust).toBe("likely");
  });

  it("falls back to the cheapest published group menu", () => {
    const venue = bySlug("keens-steakhouse");
    const signal = priceSignal(venue, venue.spaces, 50);
    expect(signal.kind).toBe("per_person");
    expect(signal.perPersonCents).toBe(13_000);
  });

  it("never lets a price tier present as anything but a hint", () => {
    const venue = bySlug("hunt-and-fish-club");
    const signal = priceSignal(venue, venue.spaces, 50);
    expect(signal.kind).toBe("price_tier");
    expect(signal.trust).toBe("unverified");
    expect(signal.amountCents).toBeNull();
  });
});

describe("budgetFit", () => {
  it("rewards a concrete number when no budget is given", () => {
    const withNumber = budgetFit(
      { kind: "min_spend", amountCents: 500_000, perPersonCents: 10_000, tier: 3, currency: "USD", trust: "likely", label: "" },
      null,
    );
    const withoutNumber = budgetFit(
      { kind: "unknown", amountCents: null, perPersonCents: null, tier: null, currency: "USD", trust: "unverified", label: "" },
      null,
    );
    expect(withNumber).toBeGreaterThan(withoutNumber);
  });

  it("peaks at or just under budget rather than at the cheapest option", () => {
    const signal = (perPerson: number) =>
      ({ kind: "per_person", amountCents: null, perPersonCents: perPerson, tier: null, currency: "USD", trust: "likely", label: "" }) as const;

    const atBudget = budgetFit(signal(10_000), 10_000);
    const wellUnder = budgetFit(signal(3_000), 10_000);
    expect(atBudget).toBe(1);

    expect(wellUnder).toBeLessThan(atBudget);
  });

  it("decays over budget instead of dropping to zero", () => {
    const signal = (perPerson: number) =>
      ({ kind: "per_person", amountCents: null, perPersonCents: perPerson, tier: null, currency: "USD", trust: "likely", label: "" }) as const;

    const tenPercentOver = budgetFit(signal(11_000), 10_000);
    const doubleBudget = budgetFit(signal(20_000), 10_000);
    expect(tenPercentOver).toBeGreaterThan(0.5);
    expect(doubleBudget).toBeLessThan(tenPercentOver);
    expect(doubleBudget).toBeGreaterThan(0);
  });
});
