"use client";

import { useEffect } from "react";
import { recordView } from "@/lib/localStore";

/**
 * Records that this macro page was opened, into the visitor's own browser.
 * Renders nothing. Mounted on the detail page so the home page can offer a way
 * back to whatever they were just looking at.
 */
export default function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    recordView(slug);
  }, [slug]);

  return null;
}
