import { createHash } from "node:crypto";

import type { Origin } from "@/lib/types";
import { canWriteCaches, getServerClient } from "@/lib/db/client";
import { googleGeocodeProvider } from "./providers/google";
import { nominatimProvider } from "./providers/nominatim";
import type { GeocodeProvider } from "./providers/types";

const PINNED: Record<string, { lat: number; lon: number; displayName: string }> = {
  "times square, new york, ny": {
    lat: 40.757975,
    lon: -73.985543,
    displayName: "Times Square, Manhattan, New York, NY 10036",
  },
  "415 mission st, san francisco, ca 94105": {
    lat: 37.789661,
    lon: -122.396742,
    displayName: "Salesforce Tower, 415 Mission St, San Francisco, CA 94105",
  },
  "hilton hawaiian village waikiki beach resort, waikiki, hi": {
    lat: 21.28194,
    lon: -157.83722,
    displayName: "Hilton Hawaiian Village Waikiki Beach Resort, 2005 Kalia Rd, Honolulu, HI 96815",
  },
};

const normalise = (query: string) =>
  query.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.]/g, "");

const hash = (query: string) => createHash("sha256").update(normalise(query)).digest("hex").slice(0, 32);

function providers(): GeocodeProvider[] {
  return [googleGeocodeProvider, nominatimProvider].filter((p) => p.isAvailable());
}

function matchPinned(query: string) {
  const key = normalise(query);
  const direct = PINNED[key];
  if (direct) return direct;

  const found = Object.entries(PINNED).find(
    ([pinned]) => key.includes(pinned) || pinned.includes(key),
  );
  return found?.[1] ?? null;
}

export async function geocode(query: string): Promise<Origin> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("An address is required");

  const pinned = matchPinned(trimmed);
  if (pinned) {
    return { query: trimmed, ...pinned, provider: "pinned", cached: true };
  }

  const supabase = getServerClient();
  const queryHash = hash(trimmed);

  if (supabase) {
    const { data } = await supabase
      .from("geocode_cache")
      .select("lat, lon, display_name, provider")
      .eq("query_hash", queryHash)
      .maybeSingle();

    if (data) {
      return {
        query: trimmed,
        lat: data.lat,
        lon: data.lon,
        displayName: data.display_name,
        provider: data.provider,
        cached: true,
      };
    }
  }

  let lastError: unknown = null;
  for (const provider of providers()) {
    try {
      const result = await provider.geocode(trimmed);
      if (!result) continue;

      if (supabase && canWriteCaches()) {
        await supabase.from("geocode_cache").upsert(
          {
            query_hash: queryHash,
            query: trimmed,
            lat: result.lat,
            lon: result.lon,
            display_name: result.displayName,
            provider: result.provider,
          },
          { onConflict: "query_hash" },
        );
      }

      return { query: trimmed, ...result, cached: false };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Could not find "${trimmed}". Try a full street address` +
      (lastError instanceof Error ? ` (${lastError.message})` : ""),
  );
}
