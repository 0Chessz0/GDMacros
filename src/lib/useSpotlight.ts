"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Tracks the pointer inside an element and publishes its position as --mx/--my.
 * The `.spotlight` rule in globals.css turns those into a soft glow that follows
 * the cursor across the card.
 *
 * Two things keep this cheap enough for a weak phone:
 *
 * 1. Writes are throttled to one per animation frame, since pointermove fires
 *    far more often than the screen refreshes.
 * 2. The element's box is measured once on entry and reused. Calling
 *    getBoundingClientRect inside the frame forces a synchronous layout on
 *    every single frame of every hover, which is exactly the kind of work that
 *    turns a smooth effect into a stuttering one on low end hardware.
 */
export function useSpotlight<T extends HTMLElement>() {
  const frame = useRef(0);
  const rect = useRef<DOMRect | null>(null);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const onPointerEnter = useCallback((event: React.PointerEvent<T>) => {
    // Touch reports itself as a pointer but has no meaningful hover, so the
    // glow would flash on tap and cost a repaint for nothing.
    if (event.pointerType !== "mouse") return;
    rect.current = event.currentTarget.getBoundingClientRect();
  }, []);

  const onPointerLeave = useCallback(() => {
    rect.current = null;
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    if (event.pointerType !== "mouse") return;

    const el = event.currentTarget;
    const { clientX, clientY } = event;

    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      // Measured on entry. A missing box means the pointer arrived without an
      // enter event, so fall back rather than skip the effect entirely.
      const box = rect.current ?? el.getBoundingClientRect();
      rect.current = box;
      el.style.setProperty("--mx", `${clientX - box.left}px`);
      el.style.setProperty("--my", `${clientY - box.top}px`);
    });
  }, []);

  return { onPointerEnter, onPointerLeave, onPointerMove };
}
