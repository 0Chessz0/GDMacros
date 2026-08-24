import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SuggestionForm from "@/components/support/SuggestionForm";
import { getUserAndProfile } from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Send a suggestion", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewSupportTicketPage() {
  if (!isSupabaseConfigured) redirect("/login");
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/support/new");
  if (!profile) redirect("/welcome");

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/support" className="text-[12.5px] text-muted hover:text-accent-soft">← Your support tickets</Link>
      <h1 className="mt-5 text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">Send a suggestion</h1>
      <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-muted">Open a private thread with the admins. You can continue the conversation after sending it.</p>
      <SuggestionForm />
    </div>
  );
}
