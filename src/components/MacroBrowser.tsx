"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useViewTransition } from "@/lib/useViewTransition";
import { RECORDERS, type Level, type Recorder } from "@/lib/types";
import MacroCard from "./MacroCard";
import MacroRow from "./MacroRow";
import Segmented from "./Segmented";
import { BotIcon, DiceIcon, GridIcon, RowsIcon, SearchIcon, XIcon } from "./icons";

type View = "list" | "grid";
type RecorderFilter = Recorder | "all";

/**
 * Past this many rows the entrance delay stops growing. Without a cap, row 60
 * would wait over a second and a half before appearing, which reads as broken
 * rather than as staggered.
 */
const STAGGER_CAP = 12;

export default function MacroBrowser({ levels }: { levels: Level[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("list");
  const [recorder, setRecorder] = useState<RecorderFilter>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);
  const router = useRouter();

  // Filter and layout changes rearrange the whole list, so they are worth
  // animating. Typing is not: a transition per keystroke would fight the user.
  const withTransition = useViewTransition();

  // Seed from the URL after mount so server and first client paint agree.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQuery(p.get("q") ?? "");
    if (p.get("view") === "grid") setView("grid");

    const r = p.get("recorder");
    const matched = RECORDERS.find((v) => v.toLowerCase() === r?.toLowerCase());
    if (matched) setRecorder(matched);

    hydrated.current = true;
  }, []);

  // Keep the URL shareable.
  useEffect(() => {
    if (!hydrated.current) return;
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (view !== "list") p.set("view", view);
    if (recorder !== "all") p.set("recorder", recorder);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [query, view, recorder]);

  // "/" focuses search, Escape clears it. Standard for a search-first page.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && el === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // `levels` arrives already sorted A-Z; filtering preserves that order.
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const terms = needle ? needle.split(/\s+/) : [];

    return levels.filter((level) => {
      // A level matches when *any* of its macros used the selected recorder.
      if (recorder !== "all" && !level.macros.some((m) => m.recorder === recorder)) return false;
      return terms.every((t) => level.searchIndex.includes(t));
    });
  }, [levels, query, recorder]);

  /**
   * Jumps to a random level from whatever is currently on screen, so an active
   * search or recorder filter narrows the pool instead of being ignored.
   */
  function goRandom() {
    if (results.length === 0) return;
    const pick = results[Math.floor(Math.random() * results.length)];
    router.push(`/macro/${pick.slug}`);
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <div className="group relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-[19px] w-[19px] -translate-y-1/2 text-muted transition-colors group-focus-within:text-accent" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by level, creator, macro author or level ID..."
            aria-label="Search macros"
            className="h-12 w-full rounded-xl border border-border bg-surface pr-12 pl-12 text-[14.5px] text-text shadow-sm transition-[border-color,box-shadow] outline-none placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15 [&::-webkit-search-cancel-button]:hidden"
          />

          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-3.5 -translate-y-1/2 rounded text-muted transition-colors hover:text-text"
            >
              <XIcon className="h-[18px] w-[18px]" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute top-1/2 right-3.5 hidden -translate-y-1/2 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted sm:block">
              /
            </kbd>
          )}
        </div>

        <div className="hidden sm:block">
          <Segmented<View>
            ariaLabel="View mode"
            size="sm"
            value={view}
            onChange={(next) => withTransition(() => setView(next))}
            options={[
              {
                value: "list",
                label: <RowsIcon className="h-[17px] w-[17px]" />,
                ariaLabel: "List view",
                title: "List view",
              },
              {
                value: "grid",
                label: <GridIcon className="h-[17px] w-[17px]" />,
                ariaLabel: "Grid view",
                title: "Grid view",
              },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={goRandom}
          disabled={results.length === 0}
          aria-label="Open a random macro"
          title={
            results.length === levels.length
              ? "Open a random macro"
              : "Open a random macro from these results"
          }
          className="group grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-text-dim transition-[color,background-color,transform] duration-200 ease-out hover:bg-surface-2 hover:text-text active:scale-90 active:duration-75 disabled:pointer-events-none disabled:opacity-40"
        >
          <DiceIcon className="h-[18px] w-[18px] transition-transform duration-300 ease-out group-hover:rotate-[18deg]" />
        </button>
      </div>

      {/* Recorder filter. The guidelines only accept these two tools. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 px-0.5">
        <Segmented<RecorderFilter>
          ariaLabel="Filter by recorder"
          value={recorder}
          onChange={(next) => withTransition(() => setRecorder(next))}
          options={(["all", ...RECORDERS] as RecorderFilter[]).map((value) => ({
            value,
            label:
              value === "all" ? (
                "All"
              ) : (
                <>
                  <BotIcon className="h-3.5 w-3.5 opacity-80" />
                  <span translate="no" className="notranslate">
                    {value}
                  </span>
                </>
              ),
          }))}
        />

        <div className="flex items-center gap-3">
          <p className="text-[12.5px] text-muted">
            <span className="font-semibold text-text-dim tabular-nums">{results.length}</span>
            {results.length === levels.length
              ? ` level${results.length === 1 ? "" : "s"}`
              : ` of ${levels.length} level${levels.length === 1 ? "" : "s"}`}
          </p>
          <span className="text-muted/40">·</span>
          <p className="text-[12.5px] text-muted">Sorted A-Z</p>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted">
            <SearchIcon className="h-5 w-5" />
          </span>
          <p className="text-[15px] font-semibold text-text">No macros found</p>
          <p className="max-w-sm text-[13px] text-muted">
            {levels.length === 0
              ? "The catalog is empty. Add an entry to data/macros.json to get started."
              : query
                ? `Nothing matches "${query}"${recorder !== "all" ? ` for ${recorder}` : ""}.`
                : `No macros recorded with ${recorder}.`}
          </p>
          {(query || recorder !== "all") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setRecorder("all");
              }}
              className="mt-1 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75"
            >
              Reset search and filter
            </button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((m, i) => (
            <MacroCard key={m.slug} level={m} index={Math.min(i, STAGGER_CAP)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {results.map((m, i) => (
            <MacroRow key={m.slug} level={m} index={Math.min(i, STAGGER_CAP)} />
          ))}
        </div>
      )}
    </div>
  );
}
