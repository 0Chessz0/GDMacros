"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { LANGUAGES, SUBMIT_URL, site } from "@/lib/site";
import { currentTranslateLang, setTranslateLang } from "./GoogleTranslate";
import ThemeToggle from "./ThemeToggle";
import {
  ChevronDownIcon,
  CompassIcon,
  GithubIcon,
  GlobeIcon,
  LanguagesIcon,
  ListIcon,
  MenuIcon,
  UserPlusIcon,
  XIcon,
} from "./icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface MenuItem {
  label: string;
  href: string;
  desc?: string;
  external?: boolean;
}

const MORE_ITEMS: MenuItem[] = [
  { label: "Guidelines", href: "/guidelines", desc: "What gets accepted, and how" },
  { label: "Submit a macro", href: SUBMIT_URL, desc: "Send one in through the form", external: true },
  { label: "About", href: "/about", desc: "What this site is" },
];

/* -------------------------------------------------------------------------- */

function useDismiss(onDismiss: () => void, active: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;

    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, onDismiss]);

  return ref;
}

function MenuLink({ item, onNavigate }: { item: MenuItem; onNavigate: () => void }) {
  const content = (
    <span className="min-w-0">
      <span className="block text-[13.5px] font-medium text-text">{item.label}</span>
      {item.desc && <span className="mt-0.5 block text-[12px] leading-snug text-muted">{item.desc}</span>}
    </span>
  );

  const className = "flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-surface-2";

  return item.external ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onNavigate}>
      {content}
    </a>
  ) : (
    <Link href={item.href} className={className} onClick={onNavigate}>
      {content}
    </Link>
  );
}

function NavMenu({ label, icon: NavIcon, items }: { label: string; icon: Icon; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(() => setOpen(false), open);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors ${
          open ? "bg-surface-2 text-text" : "text-text-dim hover:bg-surface-2 hover:text-text"
        }`}
      >
        <NavIcon className="h-4 w-4" />
        {label}
        <ChevronDownIcon
          className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-menu-in absolute top-[calc(100%+6px)] left-0 z-50 w-64 rounded-xl border border-border bg-nav p-1.5 shadow-2xl"
        >
          {items.map((item) => (
            <MenuLink key={item.label} item={item} onNavigate={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}

function LanguageMenu() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("en");
  const ref = useDismiss(() => setOpen(false), open);

  // Google's own cookie is the source of truth, so a reload keeps the choice.
  useEffect(() => {
    setLang(currentTranslateLang());
  }, []);

  function pick(code: string) {
    setLang(code);
    setOpen(false);
    setTranslateLang(code);
  }

  const active = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Language: ${active.label}`}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors ${
          open ? "bg-surface-2 text-text" : "text-text-dim hover:bg-surface-2 hover:text-text"
        }`}
      >
        <LanguagesIcon className="h-4 w-4" />
        <ChevronDownIcon
          className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-menu-in absolute top-[calc(100%+6px)] left-0 z-50 max-h-[70vh] w-48 overflow-y-auto rounded-xl border border-border bg-nav p-1.5 shadow-2xl"
        >
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => pick(l.code)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors hover:bg-surface-2 ${
                l.code === lang ? "font-medium text-accent-soft" : "text-text-dim"
              }`}
            >
              {l.label}
              <span className="font-mono text-[11px] text-muted uppercase">{l.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="animate-fade-in sticky top-0 z-40 border-b border-border-soft bg-nav/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-1 px-4 sm:px-6">
        <Link href="/" className="group mr-3 flex shrink-0 items-center gap-2.5 transition-transform duration-200 active:scale-95" onClick={() => setMobileOpen(false)}>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white shadow-lg shadow-accent/25 transition-transform duration-300 ease-out group-hover:rotate-[18deg]">
            <GlobeIcon className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[15px] font-extrabold tracking-[0.06em] text-text uppercase">{site.name}</span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
          >
            <ListIcon className="h-4 w-4" />
            Macros
          </Link>
          <NavMenu label="More" icon={CompassIcon} items={MORE_ITEMS} />
          <LanguageMenu />
        </nav>

        <div className="ml-auto flex items-center gap-0.5">
          <ThemeToggle />
          <a
            href={SUBMIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Submit a macro"
            title="Submit a macro"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-[color,background-color,transform] duration-200 hover:bg-surface-2 hover:text-text active:scale-90 active:duration-75"
          >
            <UserPlusIcon className="h-[18px] w-[18px]" />
          </a>
          <a
            href={site.repo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            title="GitHub"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-[color,background-color,transform] duration-200 hover:bg-surface-2 hover:text-text active:scale-90 active:duration-75"
          >
            <GithubIcon className="h-[17px] w-[17px]" />
          </a>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
            className="ml-0.5 grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text lg:hidden"
          >
            {mobileOpen ? <XIcon className="h-[18px] w-[18px]" /> : <MenuIcon className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border-soft bg-nav px-4 py-3 lg:hidden">
          <MenuLink item={{ label: "All macros", href: "/" }} onNavigate={() => setMobileOpen(false)} />
          {MORE_ITEMS.map((item) => (
            <MenuLink key={item.label} item={item} onNavigate={() => setMobileOpen(false)} />
          ))}
        </div>
      )}
    </header>
  );
}
