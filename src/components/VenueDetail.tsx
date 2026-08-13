"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Mail, MapPin, Phone, X } from "lucide-react";

import type { RankedVenue, SearchRequest } from "@/lib/types";
import { formatAddress } from "@/lib/types";
import { formatDistance, formatDuration } from "@/lib/geo/distance";
import { formatMoney } from "@/lib/rank/price";
import { TRUST_DISPLAY } from "@/lib/trust/trust";
import { cn, titleise } from "@/lib/utils";
import { Button } from "./ui/primitives";
import { TrustBadge } from "./TrustBadge";
import { buildOutreachDraft } from "@/lib/outreach";

const SPACE_KIND_LABEL: Record<string, string> = {
  private_room: "Private room",
  semi_private: "Semi-private",
  full_buyout: "Full buyout",
  ballroom: "Ballroom",
  outdoor: "Outdoor",
  rooftop: "Rooftop",
};

export function VenueDetail({
  result,
  request,
  onClose,
}: {
  result: RankedVenue;
  request: SearchRequest;
  onClose: () => void;
}) {
  const { venue, fit, price, commute } = result;
  const [tab, setTab] = useState<"spaces" | "menus" | "sources" | "outreach">("spaces");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-ink-950/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-label={`${venue.name} details`}
        className="animate-slide-in-right scroll-slim relative flex w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <header className="sticky top-0 z-10 border-b border-ink-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg leading-tight font-semibold text-ink-900">{venue.name}</h2>
                <TrustBadge
                  level={result.trust}
                  reason={result.trustReason}
                  evidence={venue.evidence.filter((e) => e.field === "space.capacity")}
                />
              </div>
              <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-500">
                <MapPin size={13} className="mt-px shrink-0" aria-hidden />
                {formatAddress(venue)}
              </p>
              <p className="tnum mt-1 text-xs text-ink-500">
                {formatDuration(commute.durationMinutes)}{" "}
                {commute.mode === "walking" ? "walk" : "drive"} ·{" "}
                {formatDistance(commute.distanceMeters)}
                {commute.estimated ? " · straight-line estimate" : ` · via ${commute.provider}`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X size={16} aria-hidden />
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {venue.eventsEmail ? (
              <a
                href={`mailto:${venue.eventsEmail}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-200"
              >
                <Mail size={13} aria-hidden />
                {venue.eventsEmail}
              </a>
            ) : null}
            {venue.phone ? (
              <a
                href={`tel:${venue.phone.replace(/[^\d+]/g, "")}`}
                className="tnum inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-200"
              >
                <Phone size={13} aria-hidden />
                {venue.phone}
              </a>
            ) : null}
            {venue.eventsUrl ?? venue.website ? (
              <a
                href={venue.eventsUrl ?? venue.website ?? undefined}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-200"
              >
                <Globe size={13} aria-hidden />
                Events page
                <ExternalLink size={11} aria-hidden />
              </a>
            ) : null}
          </div>

          <nav className="mt-3 flex gap-1" aria-label="Venue detail sections">
            {(
              [
                ["spaces", `Spaces (${venue.spaces.length})`],
                ["menus", `Menus (${venue.menus.length})`],
                ["sources", `Sources (${venue.evidence.length})`],
                ["outreach", "Outreach draft"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  tab === key
                    ? "bg-ink-900 text-white"
                    : "text-ink-500 hover:bg-ink-100 hover:text-ink-700",
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        <div className="flex-1 px-5 py-4">
          {tab === "spaces" ? <SpacesTab result={result} /> : null}
          {tab === "menus" ? <MenusTab result={result} /> : null}
          {tab === "sources" ? <SourcesTab result={result} /> : null}
          {tab === "outreach" ? <OutreachTab result={result} request={request} /> : null}
        </div>

        <footer className="sticky bottom-0 border-t border-ink-200 bg-ink-50 px-5 py-3">
          <p className="text-[11px] leading-relaxed text-ink-500">
            {price.label}
            {price.perPersonCents != null
              ? ` · ${formatMoney(price.perPersonCents)} per head at ${fit.headcount} guests`
              : ""}{" "}
            — {TRUST_DISPLAY[price.trust].label.toLowerCase()}.
          </p>
        </footer>
      </aside>
    </div>
  );
}

function SpacesTab({ result }: { result: RankedVenue }) {
  const { venue, fit } = result;

  return (
    <div className="space-y-3">
      {venue.summary ? (
        <p className="text-[13px] leading-relaxed text-ink-700">{venue.summary}</p>
      ) : null}

      <div className="overflow-hidden rounded-xl ring-1 ring-ink-200">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-ink-50 text-[10px] tracking-wider text-ink-400 uppercase">
            <tr>
              <th className="px-3 py-2 font-semibold">Space</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="tnum px-3 py-2 text-right font-semibold">Seated</th>
              <th className="tnum px-3 py-2 text-right font-semibold">Standing</th>
              <th className="tnum px-3 py-2 text-right font-semibold">Minimum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {venue.spaces.map((space) => {
              const recommended = fit.spaceIds.includes(space.id);
              return (
                <tr key={space.id} className={cn(recommended && "bg-accent-100/50")}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink-900">{space.name}</span>
                    {recommended ? (
                      <span className="ml-1.5 rounded bg-accent-600 px-1 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
                        Recommended
                      </span>
                    ) : null}
                    {space.minGuests ? (
                      <span className="block text-[11px] text-ink-400">
                        {space.minGuests} guest minimum
                      </span>
                    ) : null}
                    {space.features.length > 0 ? (
                      <span className="block text-[11px] text-ink-500">
                        {space.features.join(" · ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-ink-600">
                    {SPACE_KIND_LABEL[space.kind] ?? space.kind}
                    {space.squareFeet ? (
                      <span className="tnum block text-[11px] text-ink-400">
                        {space.squareFeet.toLocaleString()} sq ft
                      </span>
                    ) : null}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-ink-900">
                    {space.seatedCapacity ?? "—"}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-ink-900">
                    {space.standingCapacity ?? "—"}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-ink-900">
                    {space.minSpendCents
                      ? formatMoney(space.minSpendCents)
                      : space.perPersonCents
                        ? `${formatMoney(space.perPersonCents)}/pp`
                        : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {venue.spaces.some((s) => s.notes) ? (
        <ul className="space-y-1">
          {venue.spaces
            .filter((s) => s.notes)
            .map((s) => (
              <li key={s.id} className="text-[11px] text-ink-500">
                <span className="font-medium text-ink-600">{s.name}:</span> {s.notes}
              </li>
            ))}
        </ul>
      ) : null}

      <section>
        <h3 className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
          Dietary accommodation
        </h3>
        {venue.dietary.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-500">
            Nothing published. Ask on the call — for a group this size it will need confirming in
            writing anyway.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {venue.dietary.map((entry) => (
              <li key={entry.option} className="flex items-start gap-2 text-[13px]">
                <span
                  className={cn(
                    "mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    entry.dedicated
                      ? "bg-verified-100 text-verified-600"
                      : "bg-ink-100 text-ink-600",
                  )}
                >
                  {entry.dedicated ? "Dedicated" : "On request"}
                </span>
                <span>
                  <span className="font-medium text-ink-900">{titleise(entry.option)}</span>
                  {entry.notes ? (
                    <span className="block text-[11px] text-ink-500">{entry.notes}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MenusTab({ result }: { result: RankedVenue }) {
  const { venue } = result;

  if (venue.menus.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-500">
        No group menus published. Most venues at this size build one per event, so expect to get
        pricing only after the first call.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {venue.menus.map((menu) => (
        <div key={menu.id} className="rounded-xl p-3.5 ring-1 ring-ink-200">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[14px] font-semibold text-ink-900">{menu.name}</h3>
            <span className="tnum shrink-0 text-[13px] font-semibold text-ink-900">
              {menu.pricePerPersonCents
                ? `${formatMoney(menu.pricePerPersonCents)}/head`
                : "Priced per event"}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] tracking-wide text-ink-400 uppercase">
            {titleise(menu.format)}
          </p>
          {menu.courses.length > 0 ? (
            <p className="mt-1.5 text-[13px] text-ink-700">{menu.courses.join(" · ")}</p>
          ) : null}
          {menu.notes ? (
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">{menu.notes}</p>
          ) : null}
          {menu.url ? (
            <a
              href={menu.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-flex items-center gap-1 text-[12px] text-accent-600 hover:underline"
            >
              View on the venue site
              <ExternalLink size={11} aria-hidden />
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SourcesTab({ result }: { result: RankedVenue }) {
  const grouped = new Map<string, typeof result.venue.evidence>();
  for (const item of result.venue.evidence) {
    const key = item.field;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  const spaceName = (id: string | null) =>
    id ? (result.venue.spaces.find((s) => s.id === id)?.name ?? null) : null;

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-ink-500">
        Everything on the card traces back to one of these. Dates are when the source was last
        checked, which is what drives the trust label as much as who published it.
      </p>

      {[...grouped.entries()].map(([field, items]) => (
        <section key={field}>
          <h3 className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
            {field.replace(/[._]/g, " ")}
          </h3>
          <ul className="mt-1.5 space-y-2">
            {items.map((item, index) => (
              <li key={index} className="rounded-lg bg-ink-50 p-2.5 text-[12px]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-medium text-ink-700">
                    {titleise(item.sourceKind)}
                  </span>
                  {spaceName(item.spaceId) ? (
                    <>
                      <span className="text-ink-300">·</span>
                      <span className="text-ink-600">{spaceName(item.spaceId)}</span>
                    </>
                  ) : null}
                  <span className="text-ink-300">·</span>
                  <span className="tnum text-ink-400">{item.observedAt}</span>
                </div>
                {item.snippet ? (
                  <p className="mt-1 border-l-2 border-ink-200 pl-2 leading-relaxed text-ink-600 italic">
                    “{item.snippet}”
                  </p>
                ) : null}
                {item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-flex items-center gap-1 break-all text-accent-600 hover:underline"
                  >
                    {item.sourceTitle ?? item.sourceUrl}
                    <ExternalLink size={11} className="shrink-0" aria-hidden />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function OutreachTab({ result, request }: { result: RankedVenue; request: SearchRequest }) {
  const [copied, setCopied] = useState(false);
  const draft = buildOutreachDraft(result, request);

  const copy = async () => {
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-ink-500">
        A first-contact email built from this search, with the questions this venue&rsquo;s record is
        actually missing. Nothing is sent from here — copy it, or open it in your mail client.
      </p>

      <div className="rounded-xl ring-1 ring-ink-200">
        <div className="border-b border-ink-100 px-3.5 py-2.5">
          <p className="text-[10px] font-semibold tracking-wider text-ink-400 uppercase">Subject</p>
          <p className="mt-0.5 text-[13px] font-medium text-ink-900">{draft.subject}</p>
        </div>
        <pre className="scroll-slim max-h-96 overflow-auto px-3.5 py-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-700">
          {draft.body}
        </pre>
      </div>

      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={copy}>
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? "Copied" : "Copy draft"}
        </Button>
        {result.venue.eventsEmail ? (
          <a
            href={`mailto:${result.venue.eventsEmail}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
          >
            <Button size="sm">
              <Mail size={13} aria-hidden />
              Open in mail client
            </Button>
          </a>
        ) : null}
      </div>
    </div>
  );
}
