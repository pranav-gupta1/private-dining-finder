import "../env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const OUT_DIR = path.join(process.cwd(), "scripts", "research", "out");
const CACHE_DIR = path.join(process.cwd(), "scripts", "research", "pages");

const extractionSchema = z.object({
  venueName: z.string().describe("The venue's name exactly as it appears on the page."),
  addressLine1: z
    .string()
    .nullable()
    .describe("Street address if the page states one, otherwise null."),
  city: z.string().nullable(),
  region: z.string().nullable().describe("Two-letter US state code, or null."),
  postalCode: z.string().nullable(),
  phone: z.string().nullable().describe("Events or main phone number, or null."),
  eventsEmail: z.string().nullable().describe("Events enquiry email address, or null."),
  spaces: z
    .array(
      z.object({
        name: z.string().describe("The room or space name as written on the page."),
        kind: z.enum([
          "private_room",
          "semi_private",
          "full_buyout",
          "ballroom",
          "outdoor",
          "rooftop",
        ]),
        seatedCapacity: z
          .number()
          .int()
          .nullable()
          .describe("Only if the page states a seated/banquet/dinner number. Never estimate."),
        standingCapacity: z
          .number()
          .int()
          .nullable()
          .describe("Only if the page states a standing/reception/cocktail number."),
        minGuests: z.number().int().nullable(),
        squareFeet: z.number().int().nullable(),
        minSpendCents: z
          .number()
          .int()
          .nullable()
          .describe("Minimum food and beverage spend in cents, e.g. $10,000 becomes 1000000."),
        perPersonCents: z.number().int().nullable(),
        sourceSnippet: z
          .string()
          .describe("Verbatim sentence or table row from the page stating these figures."),
      }),
    )
    .describe("One entry per bookable space. Empty array if the page lists none."),
  menus: z.array(
    z.object({
      name: z.string(),
      format: z.enum(["prix_fixe", "family_style", "buffet", "passed_canapes", "bar_package"]),
      pricePerPersonCents: z.number().int().nullable(),
      sourceSnippet: z.string(),
    }),
  ),
  dietaryMentions: z
    .array(z.string())
    .describe("Verbatim phrases about dietary accommodation. Empty if the page says nothing."),

  reviewNotes: z.array(z.string()),
});

const SYSTEM = `You extract private dining capacity data from restaurant and hotel event pages.

The output of this work goes in front of corporate event planners who will book against it, so the
standard is journalistic rather than helpful:

1. Record a number ONLY if the page states it. Never estimate, never average a range into a single
   figure, never convert between seated and standing capacity, never infer a capacity from square
   footage. If a page gives a range like "20-40 guests", record the upper bound.
2. Every space MUST carry a sourceSnippet quoting the page verbatim. If you cannot quote it, you
   cannot claim it. Leave the field null instead.
3. "Seated", "banquet" and "dinner" are the same measure. "Standing", "reception" and "cocktail"
   are the same measure. Do not mix them.
4. Money is in cents. $10,000 is 1000000. $112 per person is 11200.
5. If the page is not actually a private events page (a 404, a cookie wall, a generic menu), return
   an empty spaces array and say so in reviewNotes.
6. Put anything ambiguous in reviewNotes rather than resolving it yourself. A human checks this
   output before it is used.`;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|tr|li|h[1-6]|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadPage(url: string, slug: string): Promise<string> {
  const cachePath = path.join(CACHE_DIR, `${slug}.html`);
  try {
    return await readFile(cachePath, "utf8");
  } catch {}

  const response = await fetch(url, {
    headers: { "User-Agent": "private-dining-finder research (contact: see repo README)" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} fetching ${url}`);

  const html = await response.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, html);
  return html;
}

async function extractOne(client: Anthropic, source: { slug: string; url: string }) {
  const html = await loadPage(source.url, source.slug);
  const text = stripHtml(html).slice(0, 120_000);

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(extractionSchema) },
    messages: [
      {
        role: "user",
        content: `Source URL: ${source.url}\n\nPage text:\n\n${text}`,
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error(`Model did not return a parsable record for ${source.slug}`);

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${source.slug}.json`);
  await writeFile(
    outPath,
    `${JSON.stringify({ sourceUrl: source.url, extracted: parsed }, null, 2)}\n`,
  );

  return { outPath, spaces: parsed.spaces.length, notes: parsed.reviewNotes };
}

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. This script is only needed to regenerate the dataset.\n" +
        "The committed venue data in src/data/venues is its output, and the app never calls it.",
    );
    process.exit(1);
  }

  const client = new Anthropic();

  let sources: { slug: string; url: string }[];
  if (process.argv.includes("--all")) {
    const file = await readFile(
      path.join(process.cwd(), "scripts", "research", "sources.json"),
      "utf8",
    );
    sources = JSON.parse(file);
  } else {
    const url = arg("url");
    const slug = arg("slug");
    if (!url || !slug) {
      console.error("Usage: npm run research:extract -- --url=<url> --slug=<slug>   (or --all)");
      process.exit(1);
    }
    sources = [{ slug, url }];
  }

  for (const source of sources) {
    process.stdout.write(`${source.slug.padEnd(36)} `);
    try {
      const result = await extractOne(client, source);
      console.log(`${String(result.spaces).padStart(2)} spaces  → ${result.outPath}`);
      for (const note of result.notes) console.log(`    note: ${note}`);
    } catch (error) {
      console.log(`failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(
    "\nDrafts written. Check each capacity against its sourceSnippet before merging into\n" +
      "src/data/venues. The pipeline proposes, a person decides.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
