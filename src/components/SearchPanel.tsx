"use client";

import { useState } from "react";
import { Car, Footprints, Search, Sparkles } from "lucide-react";

import type { DietaryOption, EventStyle, SearchRequest, TravelMode } from "@/lib/types";
import { cn, titleise } from "@/lib/utils";
import { Button, Chip, Field, Input, Segmented } from "./ui/primitives";

export const PRESETS: { id: string; label: string; sub: string; request: SearchRequest }[] = [
  {
    id: "times-square",
    label: "Times Square, 50",
    sub: "Seated dinner · 20 min walk",
    request: {
      address: "Times Square, New York, NY",
      headcount: 50,
      maxCommuteMinutes: 20,
      travelMode: "walking",
      style: "seated_dinner",
      dietary: [],
      allowBuyout: true,
      includeUnverified: true,
      budgetPerPersonCents: null,
    },
  },
  {
    id: "salesforce-tower",
    label: "Salesforce Tower, 30",
    sub: "Seated dinner · 15 min walk",
    request: {
      address: "415 Mission St, San Francisco, CA 94105",
      headcount: 30,
      maxCommuteMinutes: 15,
      travelMode: "walking",
      style: "seated_dinner",
      dietary: [],
      allowBuyout: true,
      includeUnverified: true,
      budgetPerPersonCents: null,
    },
  },
  {
    id: "waikiki",
    label: "Hilton Hawaiian Village, 200",
    sub: "Reception · 15 min walk",
    request: {
      address: "Hilton Hawaiian Village Waikiki Beach Resort, Waikiki, HI",
      headcount: 200,
      maxCommuteMinutes: 15,
      travelMode: "walking",
      style: "reception",
      dietary: [],
      allowBuyout: true,
      includeUnverified: true,
      budgetPerPersonCents: null,
    },
  },
];

const STYLES: { value: EventStyle; label: string }[] = [
  { value: "seated_dinner", label: "Seated dinner" },
  { value: "reception", label: "Reception" },
  { value: "happy_hour", label: "Happy hour" },
  { value: "buffet", label: "Buffet" },
  { value: "meeting", label: "Meeting" },
];

const DIETARY: DietaryOption[] = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "dairy_free",
  "nut_allergy",
  "halal",
  "kosher",
  "shellfish_allergy",
];

export function SearchPanel({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: SearchRequest;
  onChange: (next: SearchRequest) => void;
  onSubmit: (request: SearchRequest) => void;
  loading: boolean;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const set = <K extends keyof SearchRequest>(key: K, next: SearchRequest[K]) =>
    onChange({ ...value, [key]: next });

  const toggleDietary = (option: DietaryOption) => {
    const current = value.dietary ?? [];
    set(
      "dietary",
      current.includes(option) ? current.filter((d) => d !== option) : [...current, option],
    );
  };

  const budgetDollars = value.budgetPerPersonCents ? value.budgetPerPersonCents / 100 : "";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
      className="space-y-4"
    >
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
          <Sparkles size={12} aria-hidden />
          Start from a brief
        </p>
        <div className="grid gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onChange(preset.request);
                onSubmit(preset.request);
              }}
              className={cn(
                "rounded-lg bg-white px-3 py-2 text-left ring-1 ring-inset ring-ink-200",
                "transition-colors hover:bg-accent-100 hover:ring-accent-500/40",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500",
              )}
            >
              <span className="block text-[13px] font-medium text-ink-900">{preset.label}</span>
              <span className="block text-[11px] text-ink-500">{preset.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <hr className="border-ink-200" />

      <Field label="Address or landmark">
        <Input
          value={value.address}
          onChange={(event) => set("address", event.target.value)}
          placeholder="e.g. 415 Mission St, San Francisco"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Headcount">
          <Input
            type="number"
            min={1}
            max={5000}
            value={value.headcount}
            onChange={(event) => set("headcount", Number(event.target.value))}
            className="tnum"
            required
          />
        </Field>
        <Field label="Max commute" hint="minutes">
          <Input
            type="number"
            min={1}
            max={120}
            value={value.maxCommuteMinutes}
            onChange={(event) => set("maxCommuteMinutes", Number(event.target.value))}
            className="tnum"
            required
          />
        </Field>
      </div>

      <Field label="Travel mode" hint="stated on every result">
        <Segmented<TravelMode>
          value={value.travelMode}
          onChange={(mode) => set("travelMode", mode)}
          options={[
            { value: "walking", label: "Walking" },
            { value: "driving", label: "Driving" },
          ]}
        />
      </Field>

      <Field label="Format">
        <div className="flex flex-wrap gap-1.5">
          {STYLES.map((style) => (
            <Chip
              key={style.value}
              active={value.style === style.value}
              onClick={() => set("style", style.value)}
            >
              {style.label}
            </Chip>
          ))}
        </div>
      </Field>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-xs font-medium text-accent-600 hover:underline"
      >
        {showAdvanced ? "Hide" : "Show"} budget and dietary filters
      </button>

      {showAdvanced ? (
        <div className="animate-fade-rise space-y-4">
          <Field label="Budget per head" hint="optional">
            <div className="relative">
              <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-400">
                $
              </span>
              <Input
                type="number"
                min={0}
                step={5}
                value={budgetDollars}
                placeholder="No limit"
                onChange={(event) =>
                  set(
                    "budgetPerPersonCents",
                    event.target.value === "" ? null : Math.round(Number(event.target.value) * 100),
                  )
                }
                className="tnum pl-7"
              />
            </div>
          </Field>

          <Field label="Dietary needs">
            <div className="flex flex-wrap gap-1.5">
              {DIETARY.map((option) => (
                <Chip
                  key={option}
                  active={(value.dietary ?? []).includes(option)}
                  onClick={() => toggleDietary(option)}
                >
                  {titleise(option)}
                </Chip>
              ))}
            </div>
          </Field>

          <div className="space-y-2 rounded-lg bg-ink-100 p-3">
            <Toggle
              label="Include full buyouts"
              hint="Venues that only work if you take the whole room"
              checked={value.allowBuyout ?? true}
              onChange={(next) => set("allowBuyout", next)}
            />
            <Toggle
              label="Include unverified capacity"
              hint="Venues whose room sizes we could not confirm"
              checked={value.includeUnverified ?? true}
              onChange={(next) => set("includeUnverified", next)}
            />
          </div>
        </div>
      ) : null}

      <Button type="submit" variant="primary" disabled={loading} className="w-full">
        <Search size={15} aria-hidden />
        {loading ? "Searching…" : "Find venues"}
      </Button>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
        {value.travelMode === "walking" ? (
          <Footprints size={13} className="mt-0.5 shrink-0" aria-hidden />
        ) : (
          <Car size={13} className="mt-0.5 shrink-0" aria-hidden />
        )}
        Commute times are door-to-door {value.travelMode === "walking" ? "walking" : "driving"}{" "}
        routes. This tool researches and ranks options — it does not hold or book anything.
      </p>
    </form>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-ink-300 text-accent-600 focus:ring-accent-500"
      />
      <span>
        <span className="block text-[13px] font-medium text-ink-900">{label}</span>
        <span className="block text-[11px] text-ink-500">{hint}</span>
      </span>
    </label>
  );
}
