import "../env";
import { Client } from "pg";

import { seedFiles } from "../../src/lib/db/snapshot";
import { menuId, spaceId, venueId } from "../../src/lib/db/ids";

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("SUPABASE_DB_URL is not set. See .env.example.");
    process.exit(1);
  }

  const files = seedFiles();
  const client = new Client({
    connectionString,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  let venues = 0;
  let spaces = 0;
  let evidence = 0;

  try {
    await client.query("begin");

    for (const file of files) {
      console.log(`\n${file.market}`);

      for (const venue of file.venues) {
        const id = venueId(venue.slug);

        await client.query(
          `insert into venues (
             id, slug, name, venue_type, address_line1, address_line2, city, region,
             postal_code, country, neighborhood, lat, lon, cuisines, price_tier,
             website, events_url, phone, events_email, summary, event_styles, accepts_buyout
           ) values (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
           )
           on conflict (id) do update set
             slug = excluded.slug, name = excluded.name, venue_type = excluded.venue_type,
             address_line1 = excluded.address_line1, address_line2 = excluded.address_line2,
             city = excluded.city, region = excluded.region, postal_code = excluded.postal_code,
             country = excluded.country, neighborhood = excluded.neighborhood,
             lat = excluded.lat, lon = excluded.lon, cuisines = excluded.cuisines,
             price_tier = excluded.price_tier, website = excluded.website,
             events_url = excluded.events_url, phone = excluded.phone,
             events_email = excluded.events_email, summary = excluded.summary,
             event_styles = excluded.event_styles, accepts_buyout = excluded.accepts_buyout`,
          [
            id,
            venue.slug,
            venue.name,
            venue.venueType,
            venue.addressLine1,
            venue.addressLine2 ?? null,
            venue.city,
            venue.region,
            venue.postalCode ?? null,
            venue.country,
            venue.neighborhood ?? null,
            venue.lat,
            venue.lon,
            venue.cuisines,
            venue.priceTier ?? null,
            venue.website ?? null,
            venue.eventsUrl ?? null,
            venue.phone ?? null,
            venue.eventsEmail ?? null,
            venue.summary ?? null,
            venue.eventStyles,
            venue.acceptsBuyout,
          ],
        );

        await client.query("delete from evidence where venue_id = $1", [id]);
        await client.query("delete from venue_spaces where venue_id = $1", [id]);
        await client.query("delete from venue_menus where venue_id = $1", [id]);
        await client.query("delete from venue_dietary where venue_id = $1", [id]);

        for (const [index, space] of venue.spaces.entries()) {
          await client.query(
            `insert into venue_spaces (
               id, venue_id, name, kind, seated_capacity, standing_capacity, min_guests,
               square_feet, min_spend_cents, per_person_cents, features, notes,
               combinable_with, sort_order
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              spaceId(venue.slug, space.name),
              id,
              space.name,
              space.kind,
              space.seatedCapacity ?? null,
              space.standingCapacity ?? null,
              space.minGuests ?? null,
              space.squareFeet ?? null,
              space.minSpendCents ?? null,
              space.perPersonCents ?? null,
              space.features,
              space.notes ?? null,
              space.combinableWith,
              index,
            ],
          );
          spaces += 1;
        }

        for (const menu of venue.menus) {
          await client.query(
            `insert into venue_menus (
               id, venue_id, name, format, price_per_person_cents, courses, url, notes
             ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              menuId(venue.slug, menu.name),
              id,
              menu.name,
              menu.format,
              menu.pricePerPersonCents ?? null,
              menu.courses,
              menu.url ?? null,
              menu.notes ?? null,
            ],
          );
        }

        for (const entry of venue.dietary) {
          await client.query(
            "insert into venue_dietary (venue_id, option, dedicated, notes) values ($1,$2,$3,$4)",
            [id, entry.option, entry.dedicated, entry.notes ?? null],
          );
        }

        for (const item of venue.evidence) {
          await client.query(
            `insert into evidence (
               venue_id, space_id, menu_id, field, source_kind, source_url,
               source_title, snippet, observed_at
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              id,
              item.space ? spaceId(venue.slug, item.space) : null,
              item.menu ? menuId(venue.slug, item.menu) : null,
              item.field,
              item.sourceKind,
              item.sourceUrl ?? null,
              item.sourceTitle ?? null,
              item.snippet ?? null,
              item.observedAt,
            ],
          );
          evidence += 1;
        }

        venues += 1;
        console.log(
          `  ${venue.name.padEnd(42)} ${String(venue.spaces.length).padStart(2)} spaces  ` +
            `${String(venue.evidence.length).padStart(2)} sources`,
        );
      }
    }

    await client.query("commit");
    console.log(`\nSeeded ${venues} venues, ${spaces} spaces, ${evidence} evidence rows.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
