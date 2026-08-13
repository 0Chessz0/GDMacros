"use client";

import { useCallback } from "react";
import { flushSync } from "react-dom";

/**
 * Runs a state update inside a View Transition so the browser animates between
 * the two rendered states instead of swapping them instantly.
 *
 * `flushSync` is the important part: startViewTransition snapshots the DOM
 * before and after the callback, so the React update has to commit *inside* it
 * rather than being batched until afterwards.
 *
 * Falls back to a plain update where the API is missing (Firefox, Safari at the
 * time of writing) or the user has asked for reduced motion.
 */
export function useViewTransition() {
  return useCallback((update: () => void) => {
    const supported = typeof document !== "undefined" && "startViewTransition" in document;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!supported || reduced) {
      update();
      return;
    }

    document.startViewTransition(() => {
      flushSync(update);
    });
  }, []);
}
