"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-600 text-white hover:bg-accent-500 disabled:bg-ink-300 disabled:text-ink-50",
  secondary:
    "bg-white text-ink-900 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 disabled:text-ink-400",
  ghost: "text-ink-700 hover:bg-ink-100 disabled:text-ink-400",
  danger: "bg-white text-unverified-600 ring-1 ring-inset ring-ink-200 hover:bg-unverified-100",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
        "disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-ink-700 uppercase">{label}</span>
        {hint ? <span className="text-[11px] text-ink-400">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg bg-white px-3 text-sm text-ink-900 ring-1 ring-inset ring-ink-200",
        "placeholder:text-ink-400",
        "focus:ring-2 focus:ring-accent-500 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; title?: string }[];
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn("flex rounded-lg bg-ink-100 p-0.5 ring-1 ring-inset ring-ink-200", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-[7px] px-2 py-1.5 text-[13px] font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500",
              active
                ? "bg-white text-ink-900 shadow-[0_1px_2px_rgba(11,15,20,0.10)]"
                : "text-ink-500 hover:text-ink-700",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
  title,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500",
        active
          ? "bg-accent-600 text-white"
          : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Popover
// ---------------------------------------------------------------------------

const PopoverContext = createContext<{ close: () => void }>({ close: () => {} });
export const usePopover = () => useContext(PopoverContext);

/**
 * Click-to-open popover. Deliberately not hover-triggered: the trust badges it
 * carries hold source URLs a planner needs to click through to, and hover
 * popovers make that a game of skill.
 */
export function Popover({
  trigger,
  children,
  align = "left",
  width = "w-80",
}: {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((v) => !v), id })}
      {open ? (
        <PopoverContext.Provider value={{ close: () => setOpen(false) }}>
          <div
            id={id}
            role="dialog"
            className={cn(
              "animate-fade-rise absolute top-[calc(100%+6px)] z-40 rounded-xl bg-white p-3",
              "ring-1 ring-ink-200 shadow-[0_16px_40px_-16px_rgba(11,15,20,0.35)]",
              align === "left" ? "left-0" : "right-0",
              width,
            )}
          >
            {children}
          </div>
        </PopoverContext.Provider>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meter
// ---------------------------------------------------------------------------

export function Meter({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink-100", className)}>
      <div
        className="h-full rounded-full bg-accent-500 transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
