import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SubmitForm from "@/components/submissions/SubmitForm";
import { getUserAndProfile } from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Submit a macro",
  description: "Send a .gdr2 macro to GDMacros for review.",
  robots: { index: false, follow: false },
};

/** Specific to one visitor, so it must never be prerendered or cached. */
export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  if (!isSupabaseConfigured) redirect("/login");

  // Middleware turns anonymous visitors away first, but this is the check that
  // actually guards the page: middleware can be bypassed by a configuration
  // mistake, a server-side getUser() cannot.
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/submit");
  // A submission is shown publicly under a username, so one is required first.
  if (!profile) redirect("/welcome");

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
        Submit a macro
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
        Send a .gdr2 recording in for review. Have a look at the{" "}
        <Link href="/guidelines" className="text-accent-soft hover:underline">
          guidelines
        </Link>{" "}
        first, so it does not get turned down for something avoidable.
      </p>

      <SubmitForm username={profile.username} />

      <p className="mt-5 text-[12.5px] leading-relaxed text-muted">
        Your file is private. Only the GDMacros team can open it, and only while it is being
        reviewed. Once a macro is accepted it is published to the site automatically, so it appears
        on its own shortly afterwards.
      </p>
    </div>
  );
}
