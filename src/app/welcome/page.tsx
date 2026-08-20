import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import ChooseUsernameForm from "@/components/auth/ChooseUsernameForm";
import { getUserAndProfile } from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Choose your username",
  robots: { index: false, follow: false },
};

/** Depends on who is asking, so it must never be prerendered. */
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  if (!isSupabaseConfigured) redirect("/login");

  const { user, profile } = await getUserAndProfile();

  // Signed out: nothing to name.
  if (!user) redirect("/login?next=/welcome");
  // Already chosen: this page has no purpose, and set_username would refuse.
  if (profile) redirect("/account");

  return (
    <AuthShell
      title="Choose your username"
      intro="This is how you appear on GDMacros. Your email address stays private and is never shown to anyone."
    >
      <ChooseUsernameForm />
    </AuthShell>
  );
}
