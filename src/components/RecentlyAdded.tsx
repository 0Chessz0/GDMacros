import Link from "next/link";
import type { Level } from "@/lib/types";
import Thumb from "./Thumb";

/** "3 days ago", or the plain date once it stops being interesting. */
function relativeDay(iso: string, now: Date): string {
  const then = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(then.getTime())) return iso;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000);

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A short strip of the newest entries, above the catalog. The catalog itself
 * stays strictly alphabetical; this is the only place ordering is by date, and
 * it exists so a returning visitor can see what is new without scanning 102
 * rows for something they have not read before.
 */
export default function RecentlyAdded({ levels }: { levels: Level[] }) {
  if (levels.length === 0) return null;

  // Rendered on the server at build time, so every visitor sees the same text.
  const now = new Date();

  return (
    <section aria-labelledby="recently-added" className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2
          id="recently-added"
          className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase"
        >
          Recently added
        </h2>
        {/* levels is sorted newest first, so the head is the catalog's last update. */}
        <p className="text-[12px] text-muted">
          Catalog updated <time dateTime={levels[0].addedAt}>{relativeDay(levels[0].addedAt!, now)}</time>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {levels.map((level) => (
          <Link
            key={level.slug}
            href={`/macro/${level.slug}`}
            className="card group flex items-center gap-3 p-2.5 transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40"
          >
            <div className="h-[42px] w-[74px] shrink-0">
              <Thumb level={level} className="h-full w-full" rounded="rounded-md" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-text">{level.name}</p>
              <p className="mt-0.5 truncate text-[11.5px] text-muted">
                <span className="text-green">{level.creator}</span>
                <span className="mx-1.5 text-muted/40">·</span>
                <time dateTime={level.addedAt}>{relativeDay(level.addedAt!, now)}</time>
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
