"use server";

import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getAllLevels } from "@/lib/macros";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

/** Records only a macro that still exists in the server-side catalog. */
export async function recordQualityCheck(
  downloadUrl: string,
  outcome: "good" | "issue",
  note: string,
): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "You do not have permission to do that." };
  const found = getAllLevels().flatMap((level) => level.macros.map((macro) => ({ level, macro })))
    .find(({ macro }) => macro.downloadLink === downloadUrl);
  if (!found) return { ok: false, error: "That macro is no longer in the catalog." };
  const cleanNote = note.trim();
  if (outcome === "issue" && cleanNote.length < 3) return { ok: false, error: "Describe the issue before saving." };
  if (cleanNote.length > 1000) return { ok: false, error: "Keep the note under 1,000 characters." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Quality checks are unavailable right now." };
  const { error } = await supabase.rpc("record_macro_quality_check", {
    p_download_url: found.macro.downloadLink,
    p_level_name: found.level.name,
    p_level_id: String(found.level.levelId),
    p_macro_author: found.macro.author,
    p_recorder: found.macro.recorder,
    p_outcome: outcome,
    p_note: cleanNote || null,
  });
  if (error) return { ok: false, error: "The result could not be recorded. Migration 0014 may not be applied yet." };
  revalidatePath("/admin/quality");
  return { ok: true };
}
