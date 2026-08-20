import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ReviewQueue, { type AdminRow } from "@/components/admin/ReviewQueue";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getUser, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Review queue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUSES = new Set(["pending", "approved", "rejected", "all"]);

/**
 * The review queue.
 *
 * Three independent things have to agree before any data appears:
 *
 *   1. middleware redirects an anonymous visitor to /login;
 *   2. this page checks the role server side, from the database;
 *   3. the row level security policy on `submissions` only returns other
 *      people's rows when private.is_admin() is true.
 *
 * The third is the one that actually matters. Even if the first two were
 * removed, a normal user reaching this page would render an empty queue,
 * because the database would hand them nothing. And the review RPCs check
 * private.is_admin() for themselves, so seeing a button is not the same as
 * being able to use it.
 *
 * A non-admin gets a 404 rather than a "forbidden" page: there is no reason to
 * confirm that this route exists.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/login");

  const user = await getUser();
  if (!user) redirect("/login?next=/admin");
  if (!(await isCurrentUserAdmin())) notFound();

  const params = await searchParams;
  const filter = params.status && STATUSES.has(params.status) ? params.status : "pending";

  const supabase = await createClient();

  let query = supabase!
    .from("submissions")
    .select(
      "id,submitted_by,level_name,level_id,level_creator,video_url,recorder,macro_author,notes,status,rejection_reason,created_at,reviewed_at",
    )
    .order("created_at", { ascending: false });

  if (filter !== "all") query = query.eq("status", filter);

  const { data, error } = await query;

  type Raw = Omit<AdminRow, "submitter"> & { submitted_by: string };
  const raw = (data ?? []) as unknown as Raw[];

  /*
   * The submitter's username is resolved in a SECOND query rather than a
   * PostgREST embed.
   *
   * submissions.submitted_by references auth.users(id), not profiles(id), so
   * there is no foreign key between submissions and profiles and the embed
   * `profiles(username)` fails with PGRST200. Adding an FK purely to enable the
   * embed would couple the two tables for a display concern, so the join is
   * done here instead. profiles is publicly readable, so this needs no extra
   * privilege.
   *
   * auth.users is never touched, which is why an email address cannot reach
   * this page even by accident, and submitted_by itself is dropped below rather
   * than being handed to the client.
   */
  const ids = [...new Set(raw.map((r) => r.submitted_by))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase!
      .from("profiles")
      .select("id,username")
      .in("id", ids);
    for (const p of profiles ?? []) names.set(p.id, p.username);
  }

  const rows: AdminRow[] = raw.map(({ submitted_by, ...rest }) => ({
    ...rest,
    submitter: names.get(submitted_by) ?? "(no username)",
  }));

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
        Review queue
      </h1>
      <p className="mt-1.5 mb-6 text-[13.5px] leading-relaxed text-muted">
        Approving marks a submission as having passed review. It does not upload anything or add it
        to the catalog: that is still done by hand.
      </p>

      {error ? (
        <div className="card px-6 py-10 text-center text-[13px] text-muted">
          The queue could not be loaded. Reload the page.
        </div>
      ) : (
        <ReviewQueue rows={rows} filter={filter} />
      )}
    </div>
  );
}
