"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";

export interface SubmissionEmailPreferences {
  accepted: boolean;
  rejected: boolean;
}

type Result = { ok: true } | { ok: false; error: string };

/** Saves only the signed-in caller's private result-email preferences. */
export async function saveSubmissionEmailPreferences(
  preferences: SubmissionEmailPreferences,
): Promise<Result> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in again and retry." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Settings are unavailable right now." };

  const { error } = await supabase.rpc("set_submission_email_preferences", {
    p_accepted: Boolean(preferences.accepted),
    p_rejected: Boolean(preferences.rejected),
  });

  if (error) return { ok: false, error: "Your email preferences could not be saved." };

  revalidatePath("/settings");
  return { ok: true };
}

