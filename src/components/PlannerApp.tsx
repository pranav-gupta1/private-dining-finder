"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, List, MapPin, SlidersHorizontal } from "lucide-react";

import type { RankedVenue, SearchRequest, SearchResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PRESETS, SearchPanel } from "./SearchPanel";
import { ResultCard } from "./ResultCard";
import { VenueDetail } from "./VenueDetail";
import { CompareDialog, CompareTray } from "./Compare";
import { Button, Segmented } from "./ui/primitives";

// MapLibre touches `window` at import time, so it is client-only.
const ResultsMap = dynamic(() => import("./ResultsMap").then((m) => m.ResultsMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-ink-100" />,
});

type SortKey = "fit" | "commute" | "capacity" | "price";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "fit", label: "Best fit" },
  { value: "commute", label: "Closest" },
  { value: "capacity", label: "Room size" },
  { value: "price", label: "Cheapest" },
];

function sortResults(results: RankedVenue[], key: SortKey): RankedVenue[] {
  const copy = [...results];
  switch (key) {
    case "commute":
      return copy.sort((a, b) => a.commute.durationMinutes - b.commute.durationMinutes);
    case "capacity":
      return copy.sort((a, b) => b.fit.capacity - a.fit.capacity);
    case "price":
      // Venues with no published price sort last: an unknown is not a low price.
      return copy.sort((a, b) => {
        const av = a.price.perPersonCents ?? Number.POSITIVE_INFINITY;
        const bv = b.price.perPersonCents ?? Number.POSITIVE_INFINITY;
        return av - bv;
      });
    default:
      return copy.sort((a, b) => b.score - a.score);
  }
}

export function PlannerApp({ catalogue }: { catalogue: { venues: number; spaces: number } }) {
  const [request, setRequest] = useState<SearchRequest>(PRESETS[0].request);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sort, setSort] = useState<SortKey>("fit");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [comparedSlugs, setComparedSlugs] = useState<string[]>([]);
  const [shortlistedSlugs, setShortlistedSlugs] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [panelOpen, setPanelOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  const search = useCallback(async (next: SearchRequest) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setPanelOpen(false);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = await res.json();

      // Ignore anything that came back after a newer search was fired.
      if (id !== requestId.current) return;

      if (!res.ok) {
        setError(body.error ?? "Search failed");
        setResponse(null);
        return;
      }

      setResponse(body as SearchResponse);
      setSelectedSlug(null);
      setComparedSlugs([]);
      listRef.current?.scrollTo({ top: 0 });
    } catch {
      if (id === requestId.current) setError("Could not reach the search service.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Run the first scenario on load so the tool opens with something in it,
  // deferred a frame so the shell and skeletons paint before the request goes out.
  useEffect(() => {
    const frame = requestAnimationFrame(() => void search(PRESETS[0].request));
    return () => cancelAnimationFrame(frame);
  }, [search]);

  const results = useMemo(() => response?.results ?? [], [response]);
  const within = useMemo(
    () => sortResults(results.filter((r) => r.withinCommute), sort),
    [results, sort],
  );
  const stretch = useMemo(
    () => sortResults(results.filter((r) => !r.withinCommute), sort),
    [results, sort],
  );

  const bySlug = useMemo(
    () => new Map(results.map((r) => [r.venue.slug, r])),
    [results],
  );
  const compared = comparedSlugs.map((s) => bySlug.get(s)).filter(Boolean) as RankedVenue[];
  const shortlisted = shortlistedSlugs.map((s) => bySlug.get(s)).filter(Boolean) as RankedVenue[];
  const detail = detailSlug ? bySlug.get(detailSlug) : null;

  const toggle = (list: string[], slug: string, limit = Infinity) =>
    list.includes(slug)
      ? list.filter((s) => s !== slug)
      : list.length >= limit
        ? list
        : [...list, slug];

  return (
    <div className="flex h-dvh flex-col">
      <header className="z-20 flex shrink-0 items-center gap-3 border-b border-ink-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-ink-900 text-[13px] font-bold text-white">
            PD
          </span>
          <div>
            <h1 className="text-[15px] leading-tight font-semibold text-ink-900">
              Private Dining Finder
            </h1>
            <p className="text-[11px] leading-tight text-ink-500">
              Research and ranking for corporate group dining
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <p className="tnum hidden text-[11px] text-ink-400 lg:block">
            {catalogue.venues} venues · {catalogue.spaces} private spaces
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="lg:hidden"
            onClick={() => setPanelOpen((v) => !v)}
          >
            <SlidersHorizontal size={14} aria-hidden />
            Search
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "scroll-slim w-[19rem] shrink-0 overflow-y-auto border-r border-ink-200 bg-white p-4",
            "max-lg:absolute max-lg:inset-y-[53px] max-lg:z-30 max-lg:w-full max-lg:max-w-sm max-lg:shadow-2xl",
            !panelOpen && "max-lg:hidden",
          )}
        >
          <SearchPanel
            value={request}
            onChange={setRequest}
            onSubmit={search}
            loading={loading}
          />
        </aside>

        <main className="flex min-w-0 flex-1">
          <section
            ref={listRef}
            className={cn(
              "scroll-slim flex-1 overflow-y-auto pb-28",
              mobileView === "map" && "max-md:hidden",
            )}
          >
            <ResultsHeader
              response={response}
              loading={loading}
              sort={sort}
              onSort={setSort}
              count={within.length}
            />

            <div className="space-y-2.5 px-4 pb-4">
              {error ? (
                <div className="flex items-start gap-2.5 rounded-xl bg-unverified-100 p-4 text-[13px] text-unverified-600 ring-1 ring-unverified-600/20">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              ) : null}

              {loading ? <Skeletons /> : null}

              {!loading && !error && results.length === 0 && response ? (
                <EmptyState request={request} />
              ) : null}

              {!loading &&
                within.map((result, index) => (
                  <ResultCard
                    key={result.venue.slug}
                    result={result}
                    rank={index + 1}
                    selected={selectedSlug === result.venue.slug}
                    compared={comparedSlugs.includes(result.venue.slug)}
                    shortlisted={shortlistedSlugs.includes(result.venue.slug)}
                    onSelect={() => setSelectedSlug(result.venue.slug)}
                    onOpenDetail={() => setDetailSlug(result.venue.slug)}
                    onToggleCompare={() =>
                      setComparedSlugs((list) => toggle(list, result.venue.slug, 4))
                    }
                    onToggleShortlist={() =>
                      setShortlistedSlugs((list) => toggle(list, result.venue.slug))
                    }
                  />
                ))}

              {!loading && stretch.length > 0 ? (
                <div className="pt-3">
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
                      Just outside the limit
                    </h2>
                    <span className="h-px flex-1 bg-ink-200" />
                  </div>
                  <p className="mb-2.5 text-[12px] leading-relaxed text-ink-500">
                    Within {Math.round(request.maxCommuteMinutes * 1.3)} minutes rather than{" "}
                    {request.maxCommuteMinutes}. Worth a look if the brief has any give in it.
                  </p>
                  <div className="space-y-2.5">
                    {stretch.map((result, index) => (
                      <ResultCard
                        key={result.venue.slug}
                        result={result}
                        rank={within.length + index + 1}
                        selected={selectedSlug === result.venue.slug}
                        compared={comparedSlugs.includes(result.venue.slug)}
                        shortlisted={shortlistedSlugs.includes(result.venue.slug)}
                        onSelect={() => setSelectedSlug(result.venue.slug)}
                        onOpenDetail={() => setDetailSlug(result.venue.slug)}
                        onToggleCompare={() =>
                          setComparedSlugs((list) => toggle(list, result.venue.slug, 4))
                        }
                        onToggleShortlist={() =>
                          setShortlistedSlugs((list) => toggle(list, result.venue.slug))
                        }
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section
            className={cn(
              "relative w-[38%] min-w-80 border-l border-ink-200",
              "max-md:w-full max-md:border-l-0",
              mobileView === "list" && "max-md:hidden",
            )}
          >
            <ResultsMap
              origin={response?.origin ?? null}
              request={request}
              results={[...within, ...stretch]}
              selectedSlug={selectedSlug}
              onSelect={(slug) => {
                setSelectedSlug(slug);
                setMobileView("list");
              }}
            />
          </section>
        </main>
      </div>

      <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 md:hidden">
        <Segmented<"list" | "map">
          value={mobileView}
          onChange={setMobileView}
          className="bg-white shadow-lg"
          options={[
            { value: "list", label: "List" },
            { value: "map", label: "Map" },
          ]}
        />
      </div>

      <CompareTray
        compared={compared}
        shortlisted={shortlisted}
        request={request}
        onOpen={() => setCompareOpen(true)}
        onClear={() => setComparedSlugs([])}
        onRemove={(slug) => setComparedSlugs((list) => list.filter((s) => s !== slug))}
      />

      {compareOpen && compared.length >= 2 ? (
        <CompareDialog
          results={compared}
          request={request}
          onClose={() => setCompareOpen(false)}
        />
      ) : null}

      {detail ? (
        <VenueDetail result={detail} request={request} onClose={() => setDetailSlug(null)} />
      ) : null}
    </div>
  );
}

function ResultsHeader({
  response,
  loading,
  sort,
  onSort,
  count,
}: {
  response: SearchResponse | null;
  loading: boolean;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  count: number;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-ink-200 bg-ink-50/92 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink-900">
            {loading
              ? "Searching…"
              : response
                ? `${count} venue${count === 1 ? "" : "s"} inside the limit`
                : "Ready"}
          </p>
          {response ? (
            <p className="truncate text-[11px] text-ink-500">
              from {response.origin.displayName ?? response.origin.query}
            </p>
          ) : null}
        </div>

        <Segmented<SortKey>
          value={sort}
          onChange={onSort}
          options={SORTS}
          className="max-w-full"
        />
      </div>

      {response ? (
        <p className="tnum mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-ink-400">
          <span>
            {response.meta.candidatesConsidered} candidates scanned ·{" "}
            {(response.meta.prefilterRadiusMeters / 1609.344).toFixed(1)} mi prefilter
          </span>
          <span>routed with {response.meta.routedWith}</span>
          <span>{response.meta.elapsedMs} ms</span>
        </p>
      ) : null}

      {response?.meta.notes.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {response.meta.notes.map((note) => (
            <li key={note} className="text-[11px] text-ink-500">
              · {note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Skeletons() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
          <div className="flex gap-3">
            <div className="size-7 shrink-0 animate-pulse rounded-lg bg-ink-100" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/5 animate-pulse rounded bg-ink-100" />
              <div className="h-2.5 w-3/5 animate-pulse rounded bg-ink-100" />
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-12 animate-pulse rounded-lg bg-ink-50" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ request }: { request: SearchRequest }) {
  return (
    <div className="rounded-xl bg-white p-6 text-center ring-1 ring-ink-200">
      <MapPin size={22} className="mx-auto text-ink-300" aria-hidden />
      <p className="mt-2 text-[14px] font-semibold text-ink-900">Nothing fits this brief</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-ink-500">
        No venue in the catalogue has a space for {request.headcount} within{" "}
        {request.maxCommuteMinutes} minutes of that address. Try widening the commute, lowering the
        headcount, or switching the format — a reception fits into far more rooms than a seated
        dinner does.
      </p>
      <p className="mx-auto mt-3 flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
        <List size={12} aria-hidden />
        The catalogue currently covers Manhattan, San Francisco and Waikiki.
      </p>
    </div>
  );
}
