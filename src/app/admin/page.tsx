import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getUser, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ListIcon, MailIcon, GaugeIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The admin portal.
 *
 * Three tools, each on its own page. They are separated because they are
 * different jobs with different blast radii: reviewing one macro, emailing
 * every account holder, and reading a status board should not sit in one
 * scrolling column where the wrong button is one mis-click away.
 *
 * EVERY PAGE RE-CHECKS, AND SO DOES EVERY ACTION.
 *
 * This page having rendered is not a permission. Each of the three pages runs
 * the same server-side role check for itself, every server action behind them
 * checks again on each call, and every RPC underneath checks
 * `private.is_admin()` a third time. That is deliberate: a server action is a
 * POST endpoint anyone on the internet can call, so the only check that counts
 * is the one that runs on the request actually doing the work.
 *
 * A non-admin gets a 404 rather than a "forbidden" page. There is no reason to
 * confirm that this route exists.
 */

const TOOLS = [
  {
    href: "/admin/submissions",
    title: "Check submissions",
    description:
      "Review what people have sent in, correct the details, then accept or reject.",
    Icon: ListIcon,
  },
  {
    href: "/admin/notices",
    title: "Mail everyone",
    description:
      "Send an important Terms, Privacy or service notice to every account holder.",
    Icon: MailIcon,
  },
  {
    href: "/admin/status",
    title: "Statistics",
    description:
      "Whether every service the site depends on is responding, and how big the catalog is.",
    Icon: GaugeIcon,
  },
] as const;

export default async function AdminPage() {
  if (!isSupabaseConfigured) redirect("/login");

  const user = await getUser();
  if (!user) redirect("/login?next=/admin");
  if (!(await isCurrentUserAdmin())) notFound();

  // A count, so the queue card can say whether anything is waiting. RLS decides
  // what is countable; an admin sees every row because the 2C policy says so.
  let waiting: number | null = null;
  const supabase = await createClient();
  if (supabase) {
    const { count, error } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "processing"]);
    waiting = error ? null : (count ?? 0);
  }

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">Admin</h1>
      <p className="mt-1.5 mb-8 text-[13.5px] leading-relaxed text-muted">
        Pick a tool. Each one checks your permissions again on every action, so nothing here is
        unlocked just because this page loaded.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map(({ href, title, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="card group flex flex-col gap-2.5 p-5 transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40 active:translate-y-0 active:scale-[0.99]"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-text-dim transition-colors group-hover:text-accent-soft">
              <Icon className="h-[19px] w-[19px]" />
            </span>
            <span className="text-[16px] font-bold text-text">{title}</span>
            <span className="text-[13px] leading-relaxed text-muted">{description}</span>

            {href === "/admin/submissions" && waiting !== null && (
              <span
                className={`mt-1 w-fit rounded-md px-2 py-0.5 text-[11.5px] font-semibold tabular-nums ${
                  waiting > 0 ? "bg-accent/15 text-accent-soft" : "bg-surface-2 text-muted"
                }`}
              >
                {waiting === 0 ? "Nothing waiting" : `${waiting} waiting`}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
