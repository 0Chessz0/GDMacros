"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Tracks the pointer inside an element and publishes its position as --mx/--my.
 * The `.spotlight` rule in globals.css turns those into a soft glow that follows
 * the cursor across the card.
 *
 * Writes are throttled to one per animation frame, since pointermove fires far
 * more often than the screen refreshes.
 */
export function useSpotlight<T extends HTMLElement>() {
  const frame = useRef(0);

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    const el = event.currentTarget;
    const { clientX, clientY } = event;

    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${clientX - rect.left}px`);
      el.style.setProperty("--my", `${clientY - rect.top}px`);
    });
  }, []);

  return { onPointerMove };
}
