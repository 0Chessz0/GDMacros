"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

type Theme = "dark" | "light";

export default function ThemeToggle() {
  // Starts null so the first paint matches the server; the inline script in
  // layout.tsx has already applied the correct theme by then.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem("gdm-theme", next);
    } catch {
      /* private mode, so the choice just won't persist */
    }
  }

  const isLight = theme === "light";

  // Both icons are always mounted and cross-faded on a rotation arc, so the
  // swap reads as one control turning over rather than two icons blinking.
  const iconBase =
    "absolute h-[18px] w-[18px] transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title="Toggle theme"
      className="group grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-text active:scale-90 active:duration-75"
    >
      <span className="relative grid h-[18px] w-[18px] place-items-center">
        <SunIcon
          className={`${iconBase} ${isLight ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
        />
        <MoonIcon
          className={`${iconBase} ${isLight ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`}
        />
      </span>
    </button>
  );
}
