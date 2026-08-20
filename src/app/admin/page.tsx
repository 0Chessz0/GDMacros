import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ReviewQueue, { type AdminRow } from "@/components/admin/ReviewQueue";
import SubmissionBans from "@/components/admin/SubmissionBans";
import { isCurrentUserAdmin } from "@/lib/admin";
import { listSubmissionBans } from "@/lib/actions/submissions";
import { getUser, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Review queue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUSES = new Set(["pending", "processing", "all"]);

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
 * The third is the one that matters. Even if the first two were removed, a
 * normal user reaching this page would render an empty queue, because the
 * database would hand them nothing. And every review RPC checks
 * private.is_admin() for itself, so seeing a button is not the same as being
 * able to use it.
 *
 * A non-admin gets a 404 rather than a "forbidden" page: there is no reason to
 * confirm that this route exists.
 *
 * Only ACTIVE submissions exist now. An accepted or rejected one is deleted and
 * replaced by a small notification to its submitter, so there is no history to
 * filter and no approved or rejected tab.
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
      "id,submitted_by,level_name,level_id,level_creator,video_url,recorder,macro_author,notes,status,created_at,file_size,processing_by,processing_started_at",
    )
    .order("created_at", { ascending: false });

  if (filter !== "all") query = query.eq("status", filter);

  const [{ data, error }, bans] = await Promise.all([query, listSubmissionBans()]);

  type Raw = Omit<AdminRow, "submitter" | "processor" | "mine"> & {
    submitted_by: string;
    processing_by: string | null;
  };
  const raw = (data ?? []) as unknown as Raw[];

  /*
   * Usernames are resolved in a SECOND query rather than a PostgREST embed.
   *
   * submissions.submitted_by references auth.users(id), not profiles(id), so
   * there is no foreign key between submissions and profiles and the embed
   * `profiles(username)` fails with PGRST200. Adding a foreign key purely to
   * enable an embed would couple two tables for a display concern, so the join
   * happens here.
   *
   * auth.users is never queried anywhere in this application, which is why an
   * email address cannot reach this page even by accident. Both id columns are
   * dropped below rather than handed to the client.
   */
  const ids = [
    ...new Set(raw.flatMap((r) => [r.submitted_by, r.processing_by].filter(Boolean) as string[])),
  ];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase!
      .from("profiles")
      .select("id,username")
      .in("id", ids);
    for (const p of profiles ?? []) names.set(p.id, p.username);
  }

  const rows: AdminRow[] = raw.map(({ submitted_by, processing_by, ...rest }) => ({
    ...rest,
    submitter: names.get(submitted_by) ?? "(no username)",
    processor: processing_by ? (names.get(processing_by) ?? "another admin") : null,
    // Lets the UI say "you" rather than a name, without sending an id.
    mine: processing_by === user.id,
  }));

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
        Review queue
      </h1>
      <p className="mt-1.5 mb-6 text-[13.5px] leading-relaxed text-muted">
        Accepting opens a publishing screen and claims the submission. Nothing is announced to the
        submitter until you press Done and Close, and nothing is ever uploaded or added to the
        catalog automatically.
      </p>

      {error ? (
        <div className="card px-6 py-10 text-center text-[13px] text-muted">
          The queue could not be loaded. Reload the page.
        </div>
      ) : (
        <ReviewQueue rows={rows} filter={filter} />
      )}

      <SubmissionBans initial={"bans" in bans ? bans.bans : []} />
    </div>
  );
}
