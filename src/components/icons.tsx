import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Shared stroke setup, matching the light 1.75px line weight of the reference UI. */
function Base({ children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const GlobeIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
  </Base>
);

export const ListIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </Base>
);

export const CompassIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5z" />
  </Base>
);

/** Die face, for the "surprise me" control. */
export const DiceIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" strokeWidth={2.6} />
  </Base>
);

export const CopyIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5" />
  </Base>
);

/** Controller glyph for the GD Browser button. */
export const GamepadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 12h4M9 10v4M15.5 11.5h.01M18 13.5h.01" />
    <path d="M17.5 6h-11A4.5 4.5 0 0 0 2 10.5v3A4.5 4.5 0 0 0 6.5 18c1.5 0 2.2-.6 3-1.4l.6-.6h3.8l.6.6c.8.8 1.5 1.4 3 1.4a4.5 4.5 0 0 0 4.5-4.5v-3A4.5 4.5 0 0 0 17.5 6Z" />
  </Base>
);

export const LanguagesIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5h9M8.5 5v1.5c0 3.5-2 6.5-5 8M6 9c0 2.5 2.5 5 6.5 6.5M12 20l4.5-10 4.5 10M14.2 17h5.6" />
  </Base>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);

export const SunIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Base>
);

export const MoonIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </Base>
);

export const LoginIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
  </Base>
);

export const UserPlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <circle cx="9" cy="7.5" r="3.5" />
    <path d="M18 8v6M21 11h-6" />
  </Base>
);

export const SlidersIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="16" cy="18" r="2" />
  </Base>
);

export const SearchIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </Base>
);

export const RowsIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="6" rx="1.5" />
    <rect x="3" y="14" width="18" height="6" rx="1.5" />
  </Base>
);

export const GridIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Base>
);

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Base>
);

export const DownloadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Base>
);

export const PlayIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" />
  </Base>
);

export const ExternalIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </Base>
);

export const XIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Base>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 12H4M10 6l-6 6 6 6" />
  </Base>
);

export const BotIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 4v4M9 14h.01M15 14h.01M2 13v2M22 13v2" />
  </Base>
);

export const MenuIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);

/** Brand mark: solid fill rather than stroked, like the real GitHub logo. */
export const GithubIcon = (p: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49l-.01-1.9c-2.78.62-3.37-1.22-3.37-1.22-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.35 4.8-4.58 5.05.36.32.68.94.68 1.9l-.01 2.82c0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
  </svg>
);

export const YoutubeIcon = (p: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.75 19 12 19 12 19s6.25 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15.02V8.98L15.2 12 10 15.02Z" />
  </svg>
);

export const GaugeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 9V5M3.5 18a9.5 9.5 0 1 1 17 0" />
  </Base>
);
