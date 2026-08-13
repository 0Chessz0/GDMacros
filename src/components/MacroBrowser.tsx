"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RECORDERS, type Macro, type Recorder } from "@/lib/types";
import MacroCard from "./MacroCard";
import MacroRow from "./MacroRow";
import { BotIcon, GridIcon, RowsIcon, SearchIcon, XIcon } from "./icons";

type View = "list" | "grid";
type RecorderFilter = Recorder | "all";

export default function MacroBrowser({ macros }: { macros: Macro[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("list");
  const [recorder, setRecorder] = useState<RecorderFilter>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

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

  // `macros` arrives already sorted A-Z; filtering preserves that order.
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const terms = needle ? needle.split(/\s+/) : [];

    return macros.filter((m) => {
      if (recorder !== "all" && m.recorder !== recorder) return false;
      return terms.every((t) => m.searchIndex.includes(t));
    });
  }, [macros, query, recorder]);

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

        <div className="hidden items-center rounded-xl border border-border bg-surface p-1 sm:flex">
          {([
            { key: "list" as View, Icon: RowsIcon, label: "List view" },
            { key: "grid" as View, Icon: GridIcon, label: "Grid view" },
          ]).map(({ key, Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-label={label}
              aria-pressed={view === key}
              title={label}
              className={`grid h-10 w-10 place-items-center rounded-lg transition-colors ${
                view === key ? "bg-accent text-white" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <Icon className="h-[17px] w-[17px]" />
            </button>
          ))}
        </div>
      </div>

      {/* Recorder filter. The guidelines only accept these two tools. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 px-0.5">
        <div
          role="group"
          aria-label="Filter by recorder"
          className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
        >
          {(["all", ...RECORDERS] as RecorderFilter[]).map((value) => {
            const active = recorder === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setRecorder(value)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  active ? "bg-accent text-white" : "text-text-dim hover:bg-surface-2 hover:text-text"
                }`}
              >
                {value !== "all" && <BotIcon className="h-3.5 w-3.5 opacity-80" />}
                {value === "all" ? (
                  "All"
                ) : (
                  <span translate="no" className="notranslate">
                    {value}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <p className="text-[12.5px] text-muted">
            <span className="font-semibold text-text-dim tabular-nums">{results.length}</span>
            {results.length === macros.length ? " macros" : ` of ${macros.length} macros`}
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
            {macros.length === 0
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
              className="mt-1 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Reset search and filter
            </button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((m, i) => (
            <MacroCard key={m.slug} macro={m} index={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {results.map((m, i) => (
            <MacroRow key={m.slug} macro={m} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
