/** The only two recorders accepted. See the guidelines page. */
export const RECORDERS = ["Mega Hack", "xdBot"] as const;

export type Recorder = (typeof RECORDERS)[number];

/**
 * One entry in `data/macros.json`.
 *
 * Everything up to `recorder` is required; the rest is optional polish.
 */
export interface MacroInput {
  /** The level the macro plays, e.g. "Society". */
  name: string;
  /** Who built the level. Shown as the green tab. */
  creator: string;
  /** Who recorded the macro. Shown as the blue tab. */
  macroAuthor: string;
  /** In-game level ID, used for the GD Browser link. */
  levelId: number | string;
  /** Where the file is hosted, e.g. "Google Drive". */
  downloadType: string;
  /** Direct link to the macro file. */
  downloadLink: string;
  /** Which tool the macro was recorded with. */
  recorder: Recorder;

  /** Optional YouTube URL, used for the embed and the list thumbnail. */
  video?: string;
  /** Optional image override: an absolute URL, or a path like "/thumbnails/x.svg". */
  thumbnail?: string;
  /** Optional URL override. Defaults to "<name>-<macroAuthor>" slugified. */
  slug?: string;
  /** Optional blurb shown on the detail page. */
  description?: string;
}

/** A macro after loading, with slug, thumbnail and search text resolved. */
export interface Macro extends MacroInput {
  slug: string;
  thumbnailUrl: string | null;
  youtubeId: string | null;
  /** Pre-lowercased haystack for the search box. */
  searchIndex: string;
}
