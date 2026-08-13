"use client";

import { useEffect } from "react";
import { Columns3, Download, Star, X } from "lucide-react";

import type { RankedVenue, SearchRequest } from "@/lib/types";
import { formatDistance, formatDuration } from "@/lib/geo/distance";
import { formatMoney } from "@/lib/rank/price";
import { toCsv } from "@/lib/outreach";
import { cn, titleise } from "@/lib/utils";
import { Button } from "./ui/primitives";
import { TrustBadge } from "./TrustBadge";

export function CompareTray({
  compared,
  shortlisted,
  request,
  onOpen,
  onClear,
  onRemove,
}: {
  compared: RankedVenue[];
  shortlisted: RankedVenue[];
  request: SearchRequest;
  onOpen: () => void;
  onClear: () => void;
  onRemove: (slug: string) => void;
}) {
  if (compared.length === 0 && shortlisted.length === 0) return null;

  const download = (rows: RankedVenue[], name: string) => {
    const blob = new Blob([toCsv(rows, request)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-rise pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-2xl bg-ink-950/95 px-3 py-2.5 text-white shadow-2xl backdrop-blur">
        {compared.length > 0 ? (
          <>
            <span className="pl-1 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
              Compare
            </span>
            <div className="flex max-w-md flex-wrap gap-1.5">
              {compared.map((result) => (
                <span
                  key={result.venue.slug}
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 py-1 pr-1 pl-2.5 text-[12px]"
                >
                  {result.venue.name}
                  <button
                    type="button"
                    onClick={() => onRemove(result.venue.slug)}
                    aria-label={`Remove ${result.venue.name} from comparison`}
                    className="rounded-full p-0.5 hover:bg-white/20"
                  >
                    <X size={11} aria-hidden />
                  </button>
                </span>
              ))}
            </div>
            <Button size="sm" variant="primary" onClick={onOpen} disabled={compared.length < 2}>
              <Columns3 size={13} aria-hidden />
              Compare {compared.length}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClear}
              className="text-ink-300 hover:bg-white/10 hover:text-white"
            >
              Clear
            </Button>
          </>
        ) : null}

        {shortlisted.length > 0 ? (
          <>
            {compared.length > 0 ? <span className="mx-1 h-6 w-px bg-white/15" /> : null}
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-300">
              <Star size={12} fill="currentColor" aria-hidden />
              {shortlisted.length} shortlisted
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => download(shortlisted, "shortlist.csv")}
              className="text-white hover:bg-white/10"
            >
              <Download size={13} aria-hidden />
              Export CSV
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

const ROWS: {
  label: string;
  render: (result: RankedVenue, request: SearchRequest) => React.ReactNode;
}[] = [
  {
    label: "Fit score",
    render: (r) => <span className="tnum text-base font-semibold">{r.score.toFixed(1)}</span>,
  },
  {
    label: "Recommended space",
    render: (r) => (
      <>
        <span className="font-medium">{r.fit.label}</span>
        <span className="block text-[11px] text-ink-500">
          {titleise(r.fit.arrangement)} · holds {r.fit.capacity}
        </span>
      </>
    ),
  },
  {
    label: "Capacity trust",
    render: (r) => (
      <TrustBadge
        level={r.trust}
        reason={r.trustReason}
        evidence={r.venue.evidence.filter((e) => e.field === "space.capacity")}
      />
    ),
  },
  {
    label: "Commute",
    render: (r) => (
      <>
        <span className="tnum font-medium">
          {formatDuration(r.commute.durationMinutes)} {r.commute.mode === "walking" ? "walk" : "drive"}
        </span>
        <span className="tnum block text-[11px] text-ink-500">
          {formatDistance(r.commute.distanceMeters)}
          {r.commute.estimated ? " · estimated" : ""}
        </span>
      </>
    ),
  },
  {
    label: "Price signal",
    render: (r) => (
      <>
        <span className="font-medium">{r.price.label}</span>
        {r.price.perPersonCents != null ? (
          <span className="tnum block text-[11px] text-ink-500">
            {formatMoney(r.price.perPersonCents)} per head
          </span>
        ) : null}
      </>
    ),
  },
  {
    label: "Rooms on file",
    render: (r) => (
      <span className="tnum">
        {r.venue.spaces.length}
        <span className="block text-[11px] text-ink-500">
          largest{" "}
          {Math.max(
            ...r.venue.spaces.map((s) => Math.max(s.seatedCapacity ?? 0, s.standingCapacity ?? 0)),
          )}
        </span>
      </span>
    ),
  },
  {
    label: "Menus",
    render: (r) =>
      r.venue.menus.length === 0 ? (
        <span className="text-ink-400">None published</span>
      ) : (
        <span>
          {r.venue.menus.length} published
          <span className="block text-[11px] text-ink-500">
            {r.venue.menus
              .map((m) => (m.pricePerPersonCents ? formatMoney(m.pricePerPersonCents) : null))
              .filter(Boolean)
              .join(" · ") || "priced per event"}
          </span>
        </span>
      ),
  },
  {
    label: "Dietary",
    render: (r) =>
      r.venue.dietary.length === 0 ? (
        <span className="text-ink-400">Nothing published</span>
      ) : (
        <span className="text-[12px]">
          {r.venue.dietary.map((d) => titleise(d.option)).join(", ")}
        </span>
      ),
  },
  {
    label: "Contact",
    render: (r) => (
      <span className="text-[12px] break-all">
        {r.venue.eventsEmail ? <span className="block">{r.venue.eventsEmail}</span> : null}
        {r.venue.phone ? <span className="tnum block">{r.venue.phone}</span> : null}
        {!r.venue.eventsEmail && !r.venue.phone ? (
          <span className="text-ink-400">Enquiry form only</span>
        ) : null}
      </span>
    ),
  },
  {
    label: "Watch out for",
    render: (r) =>
      r.warnings.length === 0 ? (
        <span className="text-verified-600">Nothing flagged</span>
      ) : (
        <ul className="space-y-0.5 text-[12px] text-likely-600">
          {r.warnings.slice(0, 3).map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      ),
  },
];

export function CompareDialog({
  results,
  request,
  onClose,
}: {
  results: RankedVenue[];
  request: SearchRequest;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-label="Compare venues"
        className="animate-fade-rise relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-ink-900">Side by side</h2>
            <p className="text-xs text-ink-500">
              {request.headcount} guests · {titleise(request.style)} ·{" "}
              {request.maxCommuteMinutes} min {request.travelMode === "walking" ? "walk" : "drive"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden />
          </Button>
        </header>

        <div className="scroll-slim flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-white">
              <tr>
                <th className="w-40 border-b border-ink-200 px-4 py-3" />
                {results.map((result) => (
                  <th
                    key={result.venue.slug}
                    className="min-w-56 border-b border-l border-ink-200 px-4 py-3 align-top"
                  >
                    <span className="block text-[14px] font-semibold text-ink-900">
                      {result.venue.name}
                    </span>
                    <span className="block text-[11px] font-normal text-ink-500">
                      {result.venue.addressLine1}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, index) => (
                <tr key={row.label} className={cn(index % 2 === 1 && "bg-ink-50/70")}>
                  <th className="px-4 py-3 align-top text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
                    {row.label}
                  </th>
                  {results.map((result) => (
                    <td
                      key={result.venue.slug}
                      className="border-l border-ink-100 px-4 py-3 align-top text-ink-900"
                    >
                      {row.render(result, request)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
