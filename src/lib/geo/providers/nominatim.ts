import { fetchJson, type GeocodeProvider, type GeocodeResult } from "./types";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name?: string;
}

export const nominatimProvider: GeocodeProvider = {
  name: "nominatim",

  isAvailable() {
    return true;
  },

  async geocode(query: string): Promise<GeocodeResult | null> {
    const url = new URL(ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "0");

    const contact = process.env.GEO_CONTACT_EMAIL?.trim();
    const places = await fetchJson<NominatimPlace[]>(url.toString(), {
      timeoutMs: 8000,
      headers: {
        "User-Agent": `private-dining-finder/1.0${contact ? ` (${contact})` : ""}`,
        "Accept-Language": "en",
      },
    });

    const first = places[0];
    if (!first) return null;

    return {
      lat: Number.parseFloat(first.lat),
      lon: Number.parseFloat(first.lon),
      displayName: first.display_name ?? null,
      provider: "nominatim",
    };
  },
};
