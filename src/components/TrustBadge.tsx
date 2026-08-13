"use client";

import { ExternalLink, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

import type { Evidence, TrustLevel } from "@/lib/types";
import { TRUST_DISPLAY } from "@/lib/trust/trust";
import { cn } from "@/lib/utils";
import { Popover } from "./ui/primitives";

const STYLES: Record<TrustLevel, string> = {
  verified: "bg-verified-100 text-verified-600 ring-verified-600/20",
  likely: "bg-likely-100 text-likely-600 ring-likely-600/20",
  unverified: "bg-unverified-100 text-unverified-600 ring-unverified-600/20",
};

const ICONS: Record<TrustLevel, typeof ShieldCheck> = {
  verified: ShieldCheck,
  likely: ShieldQuestion,
  unverified: ShieldAlert,
};

const SOURCE_LABELS: Record<Evidence["sourceKind"], string> = {
  venue_site: "Venue website",
  venue_document: "Venue document",
  phone_call: "Phone call",
  booking_platform: "Booking platform",
  directory: "Directory listing",
  editorial: "Editorial guide",
  inferred: "Our estimate",
};

export function TrustBadge({
  level,
  reason,
  evidence,
  label,
  className,
}: {
  level: TrustLevel;
  reason?: string;
  evidence?: Evidence[];
  label?: string;
  className?: string;
}) {
  const Icon = ICONS[level];
  const text = label ?? TRUST_DISPLAY[level].short;
  const sources = (evidence ?? []).filter((e) => e.sourceUrl || e.snippet);

  return (
    <Popover
      align="left"
      width="w-[22rem]"
      trigger={({ toggle, open, id }) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          aria-expanded={open}
          aria-controls={id}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
            "ring-1 ring-inset transition-opacity hover:opacity-80",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500",
            STYLES[level],
            className,
          )}
        >
          <Icon size={12} strokeWidth={2.4} aria-hidden />
          {text}
        </button>
      )}
    >
      <div className="space-y-2.5 text-left">
        <div>
          <p className="text-[13px] font-semibold text-ink-900">{TRUST_DISPLAY[level].label}</p>
          {reason ? <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{reason}</p> : null}
        </div>

        {sources.length > 0 ? (
          <div className="space-y-2 border-t border-ink-100 pt-2.5">
            <p className="text-[10px] font-semibold tracking-wider text-ink-400 uppercase">
              Sources
            </p>
            {sources.slice(0, 4).map((item, index) => (
              <div key={`${item.field}-${index}`} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-ink-700">
                    {SOURCE_LABELS[item.sourceKind]}
                  </span>
                  <span className="text-ink-400">·</span>
                  <span className="tnum text-ink-400">checked {item.observedAt}</span>
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
                    onClick={(event) => event.stopPropagation()}
                    className="mt-1 inline-flex items-center gap-1 text-accent-600 hover:underline"
                  >
                    {item.sourceTitle ?? new URL(item.sourceUrl).host}
                    <ExternalLink size={11} aria-hidden />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="border-t border-ink-100 pt-2.5 text-xs text-ink-500">
            Nothing published that we could find. Treat every number here as a question for the
            call.
          </p>
        )}
      </div>
    </Popover>
  );
}
