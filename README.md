# Private Dining Finder

A research tool for corporate event planners. Enter an address, a headcount, and how far people
are willing to travel; get back a ranked shortlist of venues that can actually hold the group,
with every number traced back to the page it came from.

It does not book anything. It is the step before the call.

| | |
|---|---|
| **Stack** | Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript · Postgres on Supabase |
| **Runs without keys** | Yes. OpenStreetMap geocoding and routing, committed venue dataset |
| **Tests** | `npm test`, 86 tests, no network |

---

## Why the trust label is the centre of this

The hard part of private dining is not finding restaurants. It is that the data is bad.

Capacities live on a private-events page, or a booking-platform listing, or a magazine round-up,
or nowhere at all. They disagree with each other. They go stale when a venue reconfigures a room.
Two of the venues that appear near the top of every "best private dining in San Francisco" list,
Town Hall and Roy's, have closed, and their listings are still up. A planner who puts a venue in
a deck and finds out on the call that the room was never that big has burned a day and some
credibility.

So the schema stores facts next to the source they came from, and the UI never shows a capacity
without showing how much to trust it:

| Label | Meaning |
|---|---|
| **Verified** | The venue published it (its own events page, a capacity chart, a banquet PDF), or a planner confirmed it by phone. |
| **Likely** | A booking platform (The Vendry, Tagvenue, Cvent) or an editorial guide carries it. Usually right, occasionally out of date. |
| **Unverified, needs a call** | We estimated it, or nobody published it. |

Two extra rules do most of the work:

- **Age costs a level.** A first-party capacity from two years ago drops to _likely_; past three
  years it drops to _unverified_. Private dining pages change slowly, but they do change.
- **Independent agreement promotes.** Two third-party listings on different hosts stating the same
  number promote to _verified_. Two pages of the same aggregator do not, because that is one source.

Every badge in the UI is clickable and shows the source URL, the verbatim sentence the number came
from, and the date it was last checked. Capacity and price carry separate labels, because a venue
that publishes its room sizes very often publishes nothing at all about money.

---

## Quick start

```bash
git clone <repo> && cd private-dining-finder
npm install
npm run dev          # http://localhost:3000
```

That is the whole setup. No API keys, no database. The app serves the committed venue dataset and
routes commutes through public OpenStreetMap services, and the three demo scenarios are one click
each in the search panel.

To check the pipeline from a terminal instead:

```bash
npm run scenarios              # all three briefs, ranked, with sources
npm run scenarios -- --scenario=3 --limit=10
npm test                       # unit + scenario tests, offline
npm run data:check             # dataset integrity
```

### Wiring up Supabase

The app runs on the committed snapshot when Supabase is not configured, and says so in the search
metadata. To use Postgres properly:

1. Create a Supabase project.
2. `cp .env.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL`.
3. Run the migrations and load the catalogue:

```bash
npm run db:migrate
npm run db:seed
```

Once it is configured, searches narrow candidates in the database and write through to the geocode
and commute caches. Identifiers are derived deterministically from venue slugs, so re-seeding
updates rows in place and a shortlist built against the snapshot still resolves against Postgres.

### Optional environment variables

| Variable | Effect if unset |
|---|---|
| `SUPABASE_*` | Serves the committed snapshot instead of Postgres |
| `GOOGLE_MAPS_API_KEY` | Geocoding and routing fall back to Nominatim + OSRM |
| `GEO_CONTACT_EMAIL` | Nominatim asks for a contact address in the User-Agent; harmless to omit for light use |
| `ANTHROPIC_API_KEY` | Only needed to re-run the research pipeline; the app never calls an LLM |

---

## How a search runs

```
address ──► geocode (pinned → cache → Google → Nominatim)
                │
                ▼
        commute budget ──► straight-line radius, padded 15% and again for stretch options
                │
                ▼
        search_candidates()  ── bounding box + capacity prefilter, in Postgres
                │
                ▼
        travel matrix (cache → Google → OSRM → straight-line estimate)
                │
                ▼
        rank each venue ──► capacity fit · commute · trust · price · format · dietary · contact
                │
                ▼
        sorted results, within-limit first, stretch options after
```

Two decisions carry most of the weight here.

**Narrow before you route.** Routing is the only per-request call to a third party, so nothing gets
routed until a bounding-box query in Postgres has ruled out everything that cannot possibly
qualify. The radius is deliberately generous, because straight-line distance always
under-estimates a real walking route and a venue dropped by the prefilter can never be recovered
later. A Midtown search issues one matrix call for a dozen destinations rather than one for the
whole catalogue.

**Never fail the search.** Providers are tried in order and a straight-line estimate is the
backstop, so a search always returns even if the free routing service is down. Estimated commutes
are flagged on the card and in the response metadata rather than presented as routed numbers.

### Ranking

"Best overall fit" has to be defensible, so the score is a weighted sum of seven components and
every one of them is shown, with its weight and a sentence of reasoning, behind the score chip on
each card.

| Component | Weight | What it measures |
|---|---:|---|
| Room fit | 28% | Does a real room hold the group, and is it the right size |
| Commute | 22% | Door-to-door time against the stated budget |
| Data confidence | 18% | How well sourced the capacity and price are |
| Budget fit | 12% | Per-head cost against a budget, if one was given |
| Format fit | 10% | Seated dinner vs reception vs happy hour |
| Dietary | 6% | Coverage of requested restrictions |
| Contactability | 4% | Can the planner reach them today |

Two of these are less obvious than they look.

**Room fit is not "bigger is better".** A room that holds exactly the headcount scores worse than
one with a little slack, because you need room for a bar, a screen, servers, and the two people
who were not on the list. A room three times the size scores worse still: it feels empty and you
pay for space you do not use. The sweet spot is 1.1× to 1.6×. This is why the Waikiki scenario
recommends Hilton Hawaiian Village's Rainbow Suite (273 standing) for 200 people rather than the
Coral Ballroom, which holds 3,775.

**Data confidence outranks price.** The expensive failure in this workflow is not overpaying by
10%; it is a venue that turns out not to fit. Weighting trust above budget is a claim about what
planners actually optimise for, and the tests assert it so it cannot drift by accident.

Capacity is measured against the requested format: seated for dinners, standing for receptions.
Where a venue publishes only one of the two, the other is converted with a conservative factor and
capped at _likely_, because that number was never published by anybody.

Venues just outside the commute limit are returned rather than dropped, flagged, and shown in a
separate "just outside the limit" section. A planner who gets zero results wants to know that two
minutes of slack would fix it.

---

## The planner experience

The brief is a research and comparison workflow, not an API, so the interface is built around what
happens after the results land.

- **Search panel**: address, headcount, commute budget, walking or driving, event format, and
  optional budget-per-head and dietary filters. The three scenarios from the spec are presets.
- **Ranked cards**: commute, recommended room, and price signal as three scannable stats, with the
  trust badge on the venue and a separate one on the price. Warnings ("room is at near-capacity for
  this group", "requires combining rooms, confirm the wall actually opens") sit on the card rather
  than being buried.
- **Score breakdown**: click the number, see the seven components with their weights and reasoning.
- **Map**: pins coloured by trust, numbered to match the list, with the commute radius drawn
  faintly as orientation. Selecting either side highlights the other.
- **Detail drawer**: every space with seated/standing/minimum, group menus, dietary accommodation,
  and a full source list showing each snippet and the date it was checked.
- **Compare**: up to four venues side by side, ordered so the make-or-break facts are at the top.
- **Shortlist and export**: star venues, export to CSV with the columns that go into a deck.
- **Outreach draft**: a first-contact email generated from the search. The useful part is that the
  questions come from what this venue's record is missing: if capacity came from a directory it
  asks them to confirm it, if there is no published minimum it asks for one.

Commute mode is stated on every result and in the export. **Walking is the default**, which is the
right default for all three scenarios. A group of fifty leaving an office at 6pm walks.

---

## The data

38 venues and 85 private spaces across Manhattan, San Francisco and Waikiki, with 141 sourced
evidence rows.

Collection went venue-page first, then booking platforms and editorial guides for venues that
publish nothing themselves. Numbers are recorded exactly as the source states them. Nothing is
averaged, nothing is rounded, and where a source gives square footage but no headcount the derived
capacity is marked as our estimate with the derivation written into the snippet.

`npm run data:check` enforces the rules that actually caught mistakes while the catalogue was being
built: evidence pointing at a room that was later renamed, a capacity typed with an extra zero, a
coordinate in the wrong city, an estimate with no explanation of where it came from.

```
scripts/research/extract.ts   fetch a venue page → structured draft with citations
scripts/data/check.ts         dataset integrity rules
scripts/data/refresh-coordinates.ts   re-geocode every address, report drift
scripts/db/migrate.ts         apply supabase/migrations in order
scripts/db/seed.ts            load the catalogue into Postgres
```

### The research pipeline

Reading capacity out of venue pages is the genuinely tedious part of this problem. Every venue
publishes it in a different shape, and there are a few hundred per market.
`npm run research:extract` fetches a page, strips it to text, and asks Claude for a structured
record under one rule: extract only what the page literally says, and attach the sentence you took
it from. A capacity without its source sentence cannot be checked, and an unverifiable number is
worse than no number because it looks like data.

Output lands in `scripts/research/out/` as a draft for a human to check against the snippets before
anything reaches `src/data`. The pipeline proposes; a person decides.

**The application itself never calls an LLM.** The dataset is committed, so a search costs nothing
and returns the same thing every time.

---

## Layout

```
src/
  app/                    routes and the search API
  components/             planner UI
  data/                   venue datasets + zod schema
  lib/
    geo/                  geocoding, routing, distance, provider fallbacks
    trust/                trust label resolution
    rank/                 capacity fit, price signals, composite scoring
    db/                   Supabase access, snapshot fallback, deterministic ids
    search/               the pipeline that ties it together
supabase/migrations/      schema, prefilter function, row level security
scripts/                  db, data and research tooling
tests/                    unit + scenario tests
```

The schema uses plain lat/lon and a SQL haversine function rather than PostGIS. Search always runs
a cheap bounding-box prefilter before the real routing call, so an index on `(lat, lon)` is enough
and the schema stays portable to any vanilla Postgres. Row level security makes the catalogue
publicly readable and leaves the cache and workspace tables reachable only through the service role.

---

## Trade-offs

**Walking and driving only.** Transit would need a GTFS feed or a paid API per metro, and a wrong
transit number is worse than no transit number.

**A committed dataset rather than a live crawl.** A crawl looks better in a README and worse in
practice: it is slow, it breaks when a venue changes its markup, and it cannot be reviewed. Curated
data with citations is what a planner can actually defend. The pipeline that produces it is in the
repo and would be the thing to scale.

**Keyless by default.** Nominatim and OSRM are volunteer-run and occasionally slow, which is why
the three demo origins are pinned and every provider has a fallback. Google is wired in and takes
priority the moment a key is present.

**Trust is derived, not stored.** Recomputing labels from evidence on every request is slightly
more work than a column, and it means a label can never drift out of sync with its sources.

---

## What I would do next

**Close the loop on calls.** The natural next step is a phone-call outcome: a planner rings a
venue, records what they were told, and that becomes `source_kind: phone_call`: first-party
evidence with today's date. The schema already supports it. That is the point where the trust
labels start improving themselves instead of decaying.

**Availability, which is the real gap.** Everything here is about whether a venue *could* work.
Whether it is free on 14 November is a question only the venue can answer, and answering it at
scale is an outreach problem rather than a search problem.

**Coverage.** Three markets and 38 venues is enough to demonstrate the ranking; a real deployment
needs thousands. The extraction pipeline is the lever, but it needs a discovery stage in front of
it and a review queue behind it.

**Isochrones instead of radii.** The prefilter uses a padded straight-line radius, which
over-fetches in cities cut by water or a park. Real isochrones would narrow the candidate set
before routing rather than after.

**Freshness as a background job.** Trust decays with age, so the labels get quietly worse if
nothing re-checks them. A crawler that re-runs extraction on a schedule and flags changed
capacities would keep the catalogue honest without anybody remembering to look.
