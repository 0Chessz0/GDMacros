"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * A segmented control whose active pill slides between options rather than
 * cutting. The movement is what carries the meaning: it shows which option you
 * came from and which you landed on, so the state change reads as one thing
 * moving instead of two things blinking.
 *
 * The pill animates `transform` (compositor-thread) plus `width`. Width does
 * force layout, but the pill is absolutely positioned and therefore out of flow,
 * so nothing else reflows. The alternative, scaleX on a fixed-width box, warps
 * the rounded corners, so this is the better trade at this size.
 */

/** useLayoutEffect warns when it runs on the server; measuring is client-only. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  ariaLabel?: string;
}

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef(new Map<T, HTMLButtonElement>());
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  // Suppresses the transition for the very first placement, so the pill does
  // not appear to fly in from the left edge on load.
  const [glide, setGlide] = useState(false);

  const measure = useCallback(() => {
    const el = buttonsRef.current.get(value);
    if (!el) return;
    setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value]);

  useIsoLayoutEffect(() => {
    measure();
  }, [measure, options.length]);

  useEffect(() => {
    if (glide) return;
    const id = requestAnimationFrame(() => setGlide(true));
    return () => cancelAnimationFrame(id);
  }, [glide]);

  // Re-measure when the control resizes, e.g. a font swap or a viewport change.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const pad = size === "sm" ? "p-1" : "p-1";
  const btn =
    size === "sm"
      ? "h-9 w-9 justify-center"
      : "px-2.5 py-1.5 text-[12.5px] font-medium";

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label={ariaLabel}
      className={`relative flex items-center gap-1 rounded-xl border border-border bg-surface ${pad}`}
    >
      {pill && (
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 left-0 rounded-lg bg-accent"
          style={{
            width: `${pill.w}px`,
            transform: `translate3d(${pill.x}px, 0, 0)`,
            transition: glide
              ? "transform var(--dur-base) var(--ease-inout), width var(--dur-base) var(--ease-inout)"
              : "none",
          }}
        />
      )}

      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el) buttonsRef.current.set(option.value, el);
              else buttonsRef.current.delete(option.value);
            }}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            aria-label={option.ariaLabel}
            title={option.title}
            className={`relative z-10 flex items-center gap-1.5 rounded-lg transition-colors duration-200 ${btn} ${
              active ? "text-white" : "text-text-dim hover:text-text"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
