import { z } from "zod";

import type { RankedVenue, SearchRequest, SearchResponse } from "@/lib/types";
import { prefilterRadiusMeters } from "@/lib/geo/distance";
import { geocode } from "@/lib/geo/geocode";
import { travelTimes } from "@/lib/geo/travel";
import { findCandidates } from "@/lib/db/queries";
import { rankVenue, STRETCH_MULTIPLIER } from "@/lib/rank/score";

export const searchRequestSchema = z.object({
  address: z.string().min(3, "Enter an address or landmark"),
  headcount: z.coerce.number().int().min(1).max(5000),
  maxCommuteMinutes: z.coerce.number().int().min(1).max(120),
  travelMode: z.enum(["walking", "driving"]).default("walking"),
  style: z
    .enum(["seated_dinner", "reception", "happy_hour", "meeting", "buffet"])
    .default("seated_dinner"),
  budgetPerPersonCents: z.coerce.number().int().nonnegative().nullable().optional(),
  dietary: z
    .array(
      z.enum([
        "vegetarian",
        "vegan",
        "gluten_free",
        "dairy_free",
        "nut_allergy",
        "halal",
        "kosher",
        "shellfish_allergy",
      ]),
    )
    .default([]),
  allowBuyout: z.coerce.boolean().default(true),
  includeUnverified: z.coerce.boolean().default(true),
});

/**
 * Run a search end to end.
 *
 * The expensive step is routing, so the order matters: geocode once, narrow by
 * straight-line radius in the database, and only then ask a routing provider
 * about the venues that survived. On a typical Midtown search that is the
 * difference between one matrix call for a dozen destinations and one for the
 * entire catalogue.
 */
export async function runSearch(request: SearchRequest): Promise<SearchResponse> {
  const startedAt = Date.now();
  const notes: string[] = [];

  const origin = await geocode(request.address);

  const radius = prefilterRadiusMeters(request.maxCommuteMinutes, request.travelMode);
  // Venues just outside the limit are still worth surfacing as stretch options.
  const searchRadius = Math.round(radius * STRETCH_MULTIPLIER);

  const { venues, source, scanned } = await findCandidates(
    origin,
    searchRadius,
    request.headcount,
  );

  if (source === "snapshot") {
    notes.push(
      "Served from the committed venue snapshot — Supabase is not configured for this environment.",
    );
  }

  const { commutes, primaryProvider, cacheHits } = await travelTimes(
    origin,
    venues.map((v) => ({ lat: v.lat, lon: v.lon })),
    request.travelMode,
  );

  if (cacheHits > 0) {
    notes.push(`${cacheHits} of ${venues.length} commute times came from cache.`);
  }
  if (commutes.some((c) => c.estimated)) {
    const count = commutes.filter((c) => c.estimated).length;
    notes.push(
      `${count} commute${count === 1 ? "" : "s"} fell back to a straight-line estimate and are flagged on the card.`,
    );
  }

  const ceiling = request.maxCommuteMinutes * STRETCH_MULTIPLIER;

  const ranked = venues
    .map((venue, i) => ({ venue, commute: commutes[i] }))
    .filter(({ commute }) => commute.durationMinutes <= ceiling)
    .map(({ venue, commute }) => rankVenue(venue, commute, request))
    .filter((result): result is RankedVenue => result !== null)
    .sort((a, b) => {
      // Everything inside the stated limit outranks everything outside it,
      // however good the stretch option looks on paper.
      if (a.withinCommute !== b.withinCommute) return a.withinCommute ? -1 : 1;
      return b.score - a.score;
    });

  const withinCommute = ranked.filter((r) => r.withinCommute).length;

  if (withinCommute === 0 && ranked.length > 0) {
    notes.push(
      `Nothing fits inside ${request.maxCommuteMinutes} minutes. The results below are just outside it.`,
    );
  }

  return {
    origin,
    request,
    results: ranked,
    meta: {
      candidatesConsidered: scanned,
      withinCommute,
      routedWith: primaryProvider,
      prefilterRadiusMeters: searchRadius,
      elapsedMs: Date.now() - startedAt,
      notes,
    },
  };
}
