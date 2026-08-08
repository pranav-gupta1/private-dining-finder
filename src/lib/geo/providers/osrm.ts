import type { TravelMode } from "@/lib/types";
import type { LatLon } from "@/lib/geo/distance";
import { fetchJson, type TravelLeg, type TravelProvider } from "./types";

/**
 * Public OSRM instances maintained by the OpenStreetMap community. Each profile
 * is a separately compiled graph, so walking and driving live at different
 * hosts. The trailing path segment is always `driving` regardless of profile —
 * that is an OSRM API quirk, not a copy/paste error.
 */
const PROFILE_BASE: Record<TravelMode, string> = {
  walking: "https://routing.openstreetmap.de/routed-foot",
  driving: "https://routing.openstreetmap.de/routed-car",
};

/**
 * OSRM's table service takes coordinates in the URL path, so a huge batch would
 * blow past URL length limits. Chunking also keeps a single slow request from
 * holding up an entire search.
 */
const MAX_DESTINATIONS_PER_CALL = 60;

interface OsrmTableResponse {
  code: string;
  durations?: (number | null)[][];
  distances?: (number | null)[][];
}

const asCoord = (p: LatLon) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`;

async function tableChunk(
  origin: LatLon,
  destinations: LatLon[],
  mode: TravelMode,
): Promise<(TravelLeg | null)[]> {
  const coords = [origin, ...destinations].map(asCoord).join(";");
  const url =
    `${PROFILE_BASE[mode]}/table/v1/driving/${coords}` +
    `?sources=0&annotations=duration,distance`;

  const body = await fetchJson<OsrmTableResponse>(url, { timeoutMs: 9000 });
  if (body.code !== "Ok" || !body.durations?.[0]) {
    throw new Error(`OSRM returned ${body.code}`);
  }

  const durations = body.durations[0];
  const distances = body.distances?.[0];

  // Index 0 of each row is the origin against itself; the destinations follow.
  return destinations.map((_, i) => {
    const duration = durations[i + 1];
    const distance = distances?.[i + 1];
    if (duration == null) return null;
    return {
      durationSeconds: Math.round(duration),
      // The table service can omit distances; the caller substitutes an
      // estimate rather than showing nothing.
      distanceMeters: distance == null ? -1 : Math.round(distance),
    };
  });
}

export const osrmProvider: TravelProvider = {
  name: "osrm",

  isAvailable() {
    return process.env.DISABLE_OSRM !== "1";
  },

  supports(mode: TravelMode) {
    return mode in PROFILE_BASE;
  },

  async matrix(origin, destinations, mode) {
    const out: (TravelLeg | null)[] = [];
    for (let i = 0; i < destinations.length; i += MAX_DESTINATIONS_PER_CALL) {
      const chunk = destinations.slice(i, i + MAX_DESTINATIONS_PER_CALL);
      try {
        out.push(...(await tableChunk(origin, chunk, mode)));
      } catch {
        // A failed chunk is not a failed search. Hand back nulls and let the
        // orchestrator fill them with straight-line estimates.
        out.push(...chunk.map(() => null));
      }
    }
    return out;
  },
};
