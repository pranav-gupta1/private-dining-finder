import type { Commute, TravelMode } from "@/lib/types";
import { canWriteCaches, getServerClient } from "@/lib/db/client";
import { estimateTravel, haversineMeters, type LatLon } from "./distance";
import { googleTravelProvider } from "./providers/google";
import { osrmProvider } from "./providers/osrm";
import type { TravelLeg, TravelProvider } from "./providers/types";

/**
 * Cache keys round coordinates to five decimals (~1 m). Venues never move, and
 * a planner searching the same office twice should not pay for routing twice.
 */
const coordKey = (p: LatLon) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
const cacheKey = (o: LatLon, d: LatLon, mode: TravelMode) =>
  `${mode}:${coordKey(o)}:${coordKey(d)}`;

/** Routes go stale slowly. A month is a reasonable compromise. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function providers(): TravelProvider[] {
  return [googleTravelProvider, osrmProvider].filter((p) => p.isAvailable());
}

export interface TravelBatchResult {
  commutes: Commute[];
  /** Provider that answered for the majority of legs, for the UI to display. */
  primaryProvider: string;
  cacheHits: number;
}

interface CacheRow {
  cache_key: string;
  duration_secs: number;
  distance_meters: number;
  provider: string;
  created_at: string;
}

async function readCache(keys: string[]): Promise<Map<string, CacheRow>> {
  const supabase = getServerClient();
  if (!supabase || keys.length === 0) return new Map();

  const { data, error } = await supabase
    .from("commute_cache")
    .select("cache_key, duration_secs, distance_meters, provider, created_at")
    .in("cache_key", keys);

  if (error || !data) return new Map();

  const cutoff = Date.now() - CACHE_TTL_MS;
  const map = new Map<string, CacheRow>();
  for (const row of data as CacheRow[]) {
    if (new Date(row.created_at).getTime() >= cutoff) map.set(row.cache_key, row);
  }
  return map;
}

async function writeCache(
  rows: {
    cache_key: string;
    origin_lat: number;
    origin_lon: number;
    dest_lat: number;
    dest_lon: number;
    mode: string;
    duration_secs: number;
    distance_meters: number;
    provider: string;
  }[],
): Promise<void> {
  const supabase = getServerClient();
  if (!supabase || !canWriteCaches() || rows.length === 0) return;
  // Best effort: a cache write failing should never fail a search.
  await supabase.from("commute_cache").upsert(rows, { onConflict: "cache_key" });
}

/**
 * Travel time from one origin to many destinations.
 *
 * Order of preference per destination:
 *   1. cache
 *   2. a real routing provider (Google if keyed, otherwise public OSRM)
 *   3. a straight-line estimate, flagged as such
 *
 * The estimate is what makes this safe to demo: the search always returns, and
 * the UI is honest about which numbers are routed and which are approximated.
 */
export async function travelTimes(
  origin: LatLon,
  destinations: LatLon[],
  mode: TravelMode,
): Promise<TravelBatchResult> {
  if (destinations.length === 0) {
    return { commutes: [], primaryProvider: "none", cacheHits: 0 };
  }

  const keys = destinations.map((d) => cacheKey(origin, d, mode));
  const cache = await readCache(keys);

  const legs: (TravelLeg | null)[] = new Array(destinations.length).fill(null);
  const providerByIndex: (string | null)[] = new Array(destinations.length).fill(null);

  destinations.forEach((_, i) => {
    const hit = cache.get(keys[i]);
    if (hit) {
      legs[i] = { durationSeconds: hit.duration_secs, distanceMeters: hit.distance_meters };
      providerByIndex[i] = hit.provider;
    }
  });

  const cacheHits = legs.filter(Boolean).length;
  const missingIndexes = legs.map((leg, i) => (leg ? -1 : i)).filter((i) => i >= 0);

  if (missingIndexes.length > 0) {
    for (const provider of providers()) {
      const stillMissing = missingIndexes.filter((i) => legs[i] === null);
      if (stillMissing.length === 0) break;
      if (!provider.supports(mode)) continue;

      try {
        const answers = await provider.matrix(
          origin,
          stillMissing.map((i) => destinations[i]),
          mode,
        );
        stillMissing.forEach((destIndex, answerIndex) => {
          const leg = answers[answerIndex];
          if (!leg) return;
          legs[destIndex] = {
            durationSeconds: leg.durationSeconds,
            // Some matrix APIs return durations without distances.
            distanceMeters:
              leg.distanceMeters >= 0
                ? leg.distanceMeters
                : estimateTravel(origin, destinations[destIndex], mode).distanceMeters,
          };
          providerByIndex[destIndex] = provider.name;
        });
      } catch {
        // Fall through to the next provider, then to estimates.
      }
    }

    const fresh = missingIndexes
      .filter((i) => legs[i] !== null)
      .map((i) => ({
        cache_key: keys[i],
        origin_lat: origin.lat,
        origin_lon: origin.lon,
        dest_lat: destinations[i].lat,
        dest_lon: destinations[i].lon,
        mode,
        duration_secs: legs[i]!.durationSeconds,
        distance_meters: legs[i]!.distanceMeters,
        provider: providerByIndex[i] ?? "unknown",
      }));

    void writeCache(fresh);
  }

  const commutes: Commute[] = destinations.map((destination, i) => {
    const leg = legs[i];
    if (leg && providerByIndex[i]) {
      return {
        mode,
        durationMinutes: leg.durationSeconds / 60,
        distanceMeters: leg.distanceMeters,
        provider: providerByIndex[i]!,
        estimated: false,
      };
    }
    const fallback = estimateTravel(origin, destination, mode);
    return {
      mode,
      durationMinutes: fallback.durationSeconds / 60,
      distanceMeters: fallback.distanceMeters,
      provider: "straight-line estimate",
      estimated: true,
    };
  });

  const tally = new Map<string, number>();
  for (const c of commutes) tally.set(c.provider, (tally.get(c.provider) ?? 0) + 1);
  const primaryProvider =
    [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "straight-line estimate";

  return { commutes, primaryProvider, cacheHits };
}

/** Convenience wrapper for a single destination. */
export async function travelTime(
  origin: LatLon,
  destination: LatLon,
  mode: TravelMode,
): Promise<Commute> {
  const { commutes } = await travelTimes(origin, [destination], mode);
  return commutes[0];
}

export { haversineMeters };
