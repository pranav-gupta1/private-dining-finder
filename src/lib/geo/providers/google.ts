import type { TravelMode } from "@/lib/types";
import {
  fetchJson,
  type GeocodeProvider,
  type GeocodeResult,
  type TravelLeg,
  type TravelProvider,
} from "./types";

/**
 * Optional Google Maps Platform providers.
 *
 * These take priority when GOOGLE_MAPS_API_KEY is set and quietly step aside
 * when it is not, so the repo runs for anyone who clones it without needing a
 * billing account. Nothing else in the codebase knows which provider answered.
 */

const key = () => process.env.GOOGLE_MAPS_API_KEY?.trim() || null;

interface GeocodeResponse {
  status: string;
  results: {
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
  }[];
}

export const googleGeocodeProvider: GeocodeProvider = {
  name: "google",

  isAvailable() {
    return key() !== null;
  },

  async geocode(query: string): Promise<GeocodeResult | null> {
    const apiKey = key();
    if (!apiKey) return null;

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("key", apiKey);

    const body = await fetchJson<GeocodeResponse>(url.toString());
    if (body.status !== "OK") return null;

    const first = body.results[0];
    if (!first) return null;

    return {
      lat: first.geometry.location.lat,
      lon: first.geometry.location.lng,
      displayName: first.formatted_address,
      provider: "google",
    };
  },
};

interface DistanceMatrixResponse {
  status: string;
  rows: {
    elements: {
      status: string;
      duration?: { value: number };
      distance?: { value: number };
    }[];
  }[];
}

// Google caps a single Distance Matrix request at 25 destinations.
const MAX_DESTINATIONS_PER_CALL = 25;

const GOOGLE_MODE: Record<TravelMode, string> = {
  walking: "walking",
  driving: "driving",
};

export const googleTravelProvider: TravelProvider = {
  name: "google-distance-matrix",

  isAvailable() {
    return key() !== null;
  },

  supports(mode: TravelMode) {
    return mode in GOOGLE_MODE;
  },

  async matrix(origin, destinations, mode) {
    const apiKey = key();
    if (!apiKey) return destinations.map(() => null);

    const out: (TravelLeg | null)[] = [];

    for (let i = 0; i < destinations.length; i += MAX_DESTINATIONS_PER_CALL) {
      const chunk = destinations.slice(i, i + MAX_DESTINATIONS_PER_CALL);
      const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
      url.searchParams.set("origins", `${origin.lat},${origin.lon}`);
      url.searchParams.set("destinations", chunk.map((d) => `${d.lat},${d.lon}`).join("|"));
      url.searchParams.set("mode", GOOGLE_MODE[mode]);
      url.searchParams.set("units", "imperial");
      url.searchParams.set("key", apiKey);

      try {
        const body = await fetchJson<DistanceMatrixResponse>(url.toString(), { timeoutMs: 9000 });
        const elements = body.rows[0]?.elements ?? [];
        out.push(
          ...chunk.map((_, j) => {
            const el = elements[j];
            if (!el || el.status !== "OK" || !el.duration) return null;
            return {
              durationSeconds: el.duration.value,
              distanceMeters: el.distance?.value ?? -1,
            };
          }),
        );
      } catch {
        out.push(...chunk.map(() => null));
      }
    }

    return out;
  },
};
