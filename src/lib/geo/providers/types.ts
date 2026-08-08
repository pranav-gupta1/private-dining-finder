import type { TravelMode } from "@/lib/types";
import type { LatLon } from "@/lib/geo/distance";

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string | null;
  provider: string;
}

export interface TravelLeg {
  durationSeconds: number;
  distanceMeters: number;
}

export interface GeocodeProvider {
  name: string;
  /** False when the provider is missing configuration and should be skipped. */
  isAvailable(): boolean;
  geocode(query: string): Promise<GeocodeResult | null>;
}

export interface TravelProvider {
  name: string;
  isAvailable(): boolean;
  supports(mode: TravelMode): boolean;
  /**
   * One origin to many destinations. Implementations return `null` in a slot
   * they could not route (an island with no pedestrian network, say) so the
   * caller can fall back per-destination instead of discarding the batch.
   */
  matrix(
    origin: LatLon,
    destinations: LatLon[],
    mode: TravelMode,
  ): Promise<(TravelLeg | null)[]>;
}

/** Shared fetch wrapper: hard timeout, no hanging searches. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 6000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...rest, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText} from ${new URL(url).host}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
