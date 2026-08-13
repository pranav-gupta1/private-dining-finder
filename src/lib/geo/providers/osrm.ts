import type { TravelMode } from "@/lib/types";
import type { LatLon } from "@/lib/geo/distance";
import { fetchJson, type TravelLeg, type TravelProvider } from "./types";

const PROFILE_BASE: Record<TravelMode, string> = {
  walking: "https://routing.openstreetmap.de/routed-foot",
  driving: "https://routing.openstreetmap.de/routed-car",
};

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

  const body = await fetchJson<OsrmTableResponse>(url, { timeoutMs: 15000 });
  if (body.code !== "Ok" || !body.durations?.[0]) {
    throw new Error(`OSRM returned ${body.code}`);
  }

  const durations = body.durations[0];
  const distances = body.distances?.[0];

  return destinations.map((_, i) => {
    const duration = durations[i + 1];
    const distance = distances?.[i + 1];
    if (duration == null) return null;
    return {
      durationSeconds: Math.round(duration),
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
        out.push(...chunk.map(() => null));
      }
    }
    return out;
  },
};
