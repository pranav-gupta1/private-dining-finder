import { describe, expect, it } from "vitest";

import {
  estimateTravel,
  formatDistance,
  formatDuration,
  haversineMeters,
  prefilterRadiusMeters,
} from "@/lib/geo/distance";

const TIMES_SQUARE = { lat: 40.757975, lon: -73.985543 };
const KEENS = { lat: 40.750775, lon: -73.986 };
const SALESFORCE_TOWER = { lat: 37.789661, lon: -122.396742 };

describe("haversineMeters", () => {
  it("is zero for a point against itself", () => {
    expect(haversineMeters(TIMES_SQUARE, TIMES_SQUARE)).toBe(0);
  });

  it("matches a known short Manhattan distance", () => {
    // Times Square to Keens is a little over 800 m as the crow flies.
    const metres = haversineMeters(TIMES_SQUARE, KEENS);
    expect(metres).toBeGreaterThan(750);
    expect(metres).toBeLessThan(850);
  });

  it("is symmetric", () => {
    expect(haversineMeters(TIMES_SQUARE, SALESFORCE_TOWER)).toBeCloseTo(
      haversineMeters(SALESFORCE_TOWER, TIMES_SQUARE),
      6,
    );
  });

  it("handles a transcontinental distance", () => {
    const km = haversineMeters(TIMES_SQUARE, SALESFORCE_TOWER) / 1000;
    expect(km).toBeGreaterThan(4100);
    expect(km).toBeLessThan(4200);
  });
});

describe("estimateTravel", () => {
  it("produces a walking time in the right ballpark", () => {
    const { durationSeconds, distanceMeters } = estimateTravel(TIMES_SQUARE, KEENS, "walking");
    // ~800 m straight line, ~1 km walked, ~12 minutes at planning pace.
    expect(distanceMeters).toBeGreaterThan(950);
    expect(durationSeconds / 60).toBeGreaterThan(10);
    expect(durationSeconds / 60).toBeLessThan(15);
  });

  it("always routes further than the straight line", () => {
    const straight = haversineMeters(TIMES_SQUARE, KEENS);
    expect(estimateTravel(TIMES_SQUARE, KEENS, "walking").distanceMeters).toBeGreaterThan(straight);
  });

  it("charges driving a fixed overhead, so short hops are not faster than walking", () => {
    const walk = estimateTravel(TIMES_SQUARE, KEENS, "walking").durationSeconds;
    const drive = estimateTravel(TIMES_SQUARE, KEENS, "driving").durationSeconds;
    expect(drive).toBeGreaterThan(0);
    // Over ~800 m in Midtown, parking and traffic mean driving is no quicker.
    expect(drive).toBeGreaterThan(walk * 0.4);
  });
});

describe("prefilterRadiusMeters", () => {
  it("grows with the time budget", () => {
    expect(prefilterRadiusMeters(20, "walking")).toBeGreaterThan(
      prefilterRadiusMeters(10, "walking"),
    );
  });

  it("is wider for driving than walking", () => {
    expect(prefilterRadiusMeters(15, "driving")).toBeGreaterThan(
      prefilterRadiusMeters(15, "walking"),
    );
  });

  it("never excludes a venue the estimator would have accepted", () => {
    // The radius has to be generous in the direction of over-inclusion: a
    // venue dropped by the prefilter can never be recovered later.
    const budgetMinutes = 20;
    const radius = prefilterRadiusMeters(budgetMinutes, "walking");
    const destination = { lat: TIMES_SQUARE.lat + radius / 111_320, lon: TIMES_SQUARE.lon };
    const estimated = estimateTravel(TIMES_SQUARE, destination, "walking").durationSeconds / 60;
    expect(estimated).toBeGreaterThan(budgetMinutes);
  });

  it("puts a 20 minute Manhattan walk somewhere near a mile", () => {
    const miles = prefilterRadiusMeters(20, "walking") / 1609.344;
    expect(miles).toBeGreaterThan(0.8);
    expect(miles).toBeLessThan(1.3);
  });
});

describe("formatting", () => {
  it("uses feet below a thousand and miles above", () => {
    expect(formatDistance(100)).toMatch(/ft$/);
    expect(formatDistance(2000)).toBe("1.2 mi");
  });

  it("supports metric", () => {
    expect(formatDistance(400, "metric")).toBe("400 m");
    expect(formatDistance(2400, "metric")).toBe("2.4 km");
  });

  it("rounds durations and breaks into hours past sixty minutes", () => {
    expect(formatDuration(12.4)).toBe("12 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(95)).toBe("1 hr 35 min");
  });
});
