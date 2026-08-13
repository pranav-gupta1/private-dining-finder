import type { TravelMode } from "@/lib/types";

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export const MODE_SPEED_MPS: Record<TravelMode, number> = {
  walking: 1.35,
  driving: 6.7,
};

export const DETOUR_FACTOR: Record<TravelMode, number> = {
  walking: 1.28,
  driving: 1.4,
};

const MODE_OVERHEAD_SECONDS: Record<TravelMode, number> = {
  walking: 0,
  driving: 180,
};

export function estimateTravel(
  origin: LatLon,
  destination: LatLon,
  mode: TravelMode,
): { durationSeconds: number; distanceMeters: number } {
  const straight = haversineMeters(origin, destination);
  const routed = straight * DETOUR_FACTOR[mode];
  const duration = routed / MODE_SPEED_MPS[mode] + MODE_OVERHEAD_SECONDS[mode];
  return {
    durationSeconds: Math.round(duration),
    distanceMeters: Math.round(routed),
  };
}

export function prefilterRadiusMeters(minutes: number, mode: TravelMode): number {
  const seconds = minutes * 60;
  const straightLine = (seconds * MODE_SPEED_MPS[mode]) / DETOUR_FACTOR[mode];
  return Math.round(straightLine * 1.15);
}

export function formatDistance(meters: number, units: "imperial" | "metric" = "imperial"): string {
  if (units === "metric") {
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  }
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.round(feet / 10) * 10} ft`;
  return `${(meters / 1609.344).toFixed(1)} mi`;
}

export function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
