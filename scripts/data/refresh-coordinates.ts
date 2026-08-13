/**
 * Re-geocodes every seeded address and reports how far the stored coordinate
 * has drifted.
 *
 *   npm run data:coords           report only
 *   npm run data:coords -- --write update the JSON files in place
 *
 * Coordinates are the one field in the dataset that cannot be sanity-checked by
 * eye, and a venue placed a block off changes its commute by a minute or two.
 * Nominatim is rate limited to roughly one request a second, which this
 * respects.
 */

import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { seedFileSchema } from "../../src/data/schema";
import { haversineMeters } from "../../src/lib/geo/distance";
import { nominatimProvider } from "../../src/lib/geo/providers/nominatim";

const FILES = ["manhattan.json", "san-francisco.json", "waikiki.json"];
const DATA_DIR = path.join(process.cwd(), "src", "data", "venues");

/** Anything past this is a genuine mistake rather than rounding. */
const DRIFT_ALERT_METERS = 150;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const write = process.argv.includes("--write");

  for (const filename of FILES) {
    const filepath = path.join(DATA_DIR, filename);
    const parsed = seedFileSchema.parse(JSON.parse(await readFile(filepath, "utf8")));
    let changed = false;

    console.log(`\n${parsed.market}`);

    for (const venue of parsed.venues) {
      const query = [
        venue.addressLine1,
        venue.city,
        venue.region,
        venue.postalCode,
        venue.country,
      ]
        .filter(Boolean)
        .join(", ");

      try {
        const result = await nominatimProvider.geocode(query);
        if (!result) {
          console.log(`  ?     ${venue.name.padEnd(42)} no geocoder match`);
          continue;
        }

        const drift = haversineMeters(venue, { lat: result.lat, lon: result.lon });
        const flag = drift > DRIFT_ALERT_METERS ? "DRIFT" : "  ok ";
        console.log(
          `  ${flag} ${venue.name.padEnd(42)} ${drift.toFixed(0).padStart(5)} m` +
            (drift > DRIFT_ALERT_METERS ? `  → ${result.lat.toFixed(6)}, ${result.lon.toFixed(6)}` : ""),
        );

        if (write && drift > DRIFT_ALERT_METERS) {
          venue.lat = Number(result.lat.toFixed(6));
          venue.lon = Number(result.lon.toFixed(6));
          changed = true;
        }
      } catch (error) {
        console.log(
          `  !     ${venue.name.padEnd(42)} ${error instanceof Error ? error.message : error}`,
        );
      }

      await sleep(1100);
    }

    if (write && changed) {
      await writeFile(filepath, `${JSON.stringify(parsed, null, 2)}\n`);
      console.log(`  written: ${filename}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
