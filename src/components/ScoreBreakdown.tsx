"use client";

import type { RankedVenue } from "@/lib/types";
import { Meter } from "./ui/primitives";

export function ScoreBreakdown({ result }: { result: RankedVenue }) {
  const sorted = [...result.components].sort(
    (a, b) => b.score * b.weight - a.score * a.weight,
  );

  return (
    <div className="space-y-3 text-left">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-semibold text-ink-900">Overall fit</p>
        <p className="tnum text-lg leading-none font-semibold text-ink-900">
          {result.score.toFixed(1)}
          <span className="text-xs text-ink-400"> / 100</span>
        </p>
      </div>

      <div className="space-y-2.5">
        {sorted.map((component) => (
          <div key={component.key}>
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="font-medium text-ink-700">{component.label}</span>
              <span className="tnum shrink-0 text-ink-400">
                {Math.round(component.score * 100)}
                <span className="text-ink-300"> × {Math.round(component.weight * 100)}%</span>
              </span>
            </div>
            <Meter value={component.score} className="mt-1" />
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{component.detail}</p>
          </div>
        ))}
      </div>

      {result.highlights.length > 0 ? (
        <div className="border-t border-ink-100 pt-2.5">
          <p className="text-[10px] font-semibold tracking-wider text-ink-400 uppercase">
            Working in its favour
          </p>
          <ul className="mt-1 space-y-0.5">
            {result.highlights.map((highlight) => (
              <li key={highlight} className="text-[11px] text-ink-600">
                · {highlight}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
