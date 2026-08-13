"use client";

import {
  AlertTriangle,
  Car,
  Check,
  Footprints,
  Mail,
  Phone,
  Ruler,
  Star,
  Users,
} from "lucide-react";

import type { RankedVenue } from "@/lib/types";
import { formatDistance, formatDuration } from "@/lib/geo/distance";
import { formatMoney } from "@/lib/rank/price";
import { cn } from "@/lib/utils";
import { TrustBadge } from "./TrustBadge";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { Button, Popover } from "./ui/primitives";

export function ResultCard({
  result,
  rank,
  selected,
  compared,
  shortlisted,
  onSelect,
  onToggleCompare,
  onToggleShortlist,
  onOpenDetail,
}: {
  result: RankedVenue;
  rank: number;
  selected: boolean;
  compared: boolean;
  shortlisted: boolean;
  onSelect: () => void;
  onToggleCompare: () => void;
  onToggleShortlist: () => void;
  onOpenDetail: () => void;
}) {
  const { venue, commute, fit, price } = result;
  const ModeIcon = commute.mode === "walking" ? Footprints : Car;

  const capacityEvidence = venue.evidence.filter(
    (e) => e.field === "space.capacity" && (e.spaceId === null || fit.spaceIds.includes(e.spaceId)),
  );
  const priceEvidence = venue.evidence.filter((e) => e.field.endsWith("min_spend") || e.field.endsWith("per_person") || e.field === "menu.price");

  return (
    <article
      onClick={onSelect}
      className={cn(
        "group animate-fade-rise cursor-pointer rounded-xl bg-white p-4 transition-all",
        "ring-1 ring-ink-200 hover:ring-ink-300",
        selected && "ring-2 ring-accent-500",
        !result.withinCommute && "bg-ink-50/60",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "tnum mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold",
            rank <= 3 ? "bg-accent-600 text-white" : "bg-ink-100 text-ink-600",
          )}
          aria-label={`Rank ${rank}`}
        >
          {rank}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] leading-tight font-semibold text-ink-900">{venue.name}</h3>
            <TrustBadge
              level={result.trust}
              reason={result.trustReason}
              evidence={capacityEvidence}
            />
            {shortlisted ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-100 px-1.5 py-0.5 text-[11px] font-semibold text-accent-600">
                <Star size={11} fill="currentColor" aria-hidden />
                Shortlisted
              </span>
            ) : null}
          </div>

          <p className="mt-0.5 truncate text-xs text-ink-500">
            {venue.addressLine1}
            {venue.neighborhood ? ` · ${venue.neighborhood}` : ""}
            {venue.cuisines.length > 0 ? ` · ${venue.cuisines.slice(0, 2).join(", ")}` : ""}
          </p>
        </div>

        <Popover
          align="right"
          width="w-[21rem]"
          trigger={({ toggle, open, id }) => (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={id}
              onClick={(event) => {
                event.stopPropagation();
                toggle();
              }}
              className={cn(
                "tnum shrink-0 rounded-lg px-2 py-1 text-right transition-colors hover:bg-ink-100",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500",
              )}
              title="How this was scored"
            >
              <span className="block text-lg leading-none font-semibold text-ink-900">
                {result.score.toFixed(0)}
              </span>
              <span className="block text-[10px] tracking-wide text-ink-400 uppercase">fit</span>
            </button>
          )}
        >
          <ScoreBreakdown result={result} />
        </Popover>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Stat
          icon={ModeIcon}
          label={commute.mode === "walking" ? "Walk" : "Drive"}
          value={formatDuration(commute.durationMinutes)}
          sub={`${formatDistance(commute.distanceMeters)}${commute.estimated ? " · estimated" : ""}`}
          tone={result.withinCommute ? "default" : "warn"}
        />
        <Stat
          icon={Users}
          label={fit.arrangement === "full_buyout" ? "Buyout" : "Room"}
          value={`${fit.capacity} cap`}
          sub={fit.label}
        />
        <Stat
          icon={Ruler}
          label="Price signal"
          value={
            price.perPersonCents != null ? `${formatMoney(price.perPersonCents)}/head` : "Unknown"
          }
          sub={price.label}
          badge={
            <TrustBadge
              level={price.trust}
              reason={
                price.kind === "min_spend" || price.kind === "per_person"
                  ? "Published figure, normalised to a per-head number for this headcount."
                  : "No minimum spend published — this is a tier hint, not a quote."
              }
              evidence={priceEvidence}
              label={price.trust === "verified" ? "Verified" : price.trust === "likely" ? "Likely" : "Ask"}
            />
          }
        />
      </div>

      <p className="mt-2.5 text-[13px] leading-relaxed text-ink-700">{fit.explanation}</p>

      {result.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {result.warnings.slice(0, 2).map((warning) => (
            <li key={warning} className="flex items-start gap-1.5 text-[12px] text-likely-600">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-3">
        <Button
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail();
          }}
        >
          Rooms, menus &amp; sources
        </Button>
        <Button
          size="sm"
          variant={compared ? "primary" : "ghost"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCompare();
          }}
        >
          {compared ? <Check size={13} aria-hidden /> : null}
          Compare
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            onToggleShortlist();
          }}
        >
          <Star size={13} fill={shortlisted ? "currentColor" : "none"} aria-hidden />
          {shortlisted ? "Shortlisted" : "Shortlist"}
        </Button>

        <span className="ml-auto flex items-center gap-2.5">
          {venue.eventsEmail ? (
            <a
              href={`mailto:${venue.eventsEmail}`}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 text-[12px] text-accent-600 hover:underline"
            >
              <Mail size={12} aria-hidden />
              Email
            </a>
          ) : null}
          {venue.phone ? (
            <a
              href={`tel:${venue.phone.replace(/[^\d+]/g, "")}`}
              onClick={(event) => event.stopPropagation()}
              className="tnum inline-flex items-center gap-1 text-[12px] text-ink-600 hover:underline"
            >
              <Phone size={12} aria-hidden />
              {venue.phone}
            </a>
          ) : null}
        </span>
      </div>
    </article>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  badge,
  tone = "default",
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  badge?: React.ReactNode;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-2.5 py-2",
        tone === "warn" ? "bg-likely-100/60" : "bg-ink-50",
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-ink-400 uppercase">
        <Icon size={11} aria-hidden />
        {label}
        {badge ? <span className="ml-auto">{badge}</span> : null}
      </div>
      <p className="tnum mt-0.5 text-[13px] font-semibold text-ink-900">{value}</p>
      {sub ? <p className="truncate text-[11px] text-ink-500" title={sub}>{sub}</p> : null}
    </div>
  );
}
