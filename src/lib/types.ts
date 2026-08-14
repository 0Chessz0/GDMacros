/** The only two recorders accepted. See the guidelines page. */
export const RECORDERS = ["Mega Hack", "xdBot"] as const;

export type Recorder = (typeof RECORDERS)[number];

/** One downloadable macro. A level can carry any number of these. */
export interface MacroInput {
  /** Who recorded this particular macro. */
  author: string;
  /** Which tool it was recorded with. */
  recorder: Recorder;
  /** Where the file is hosted, e.g. "Google Drive". */
  downloadType: string;
  /** Direct link to the macro file. */
  downloadLink: string;
}

/**
 * One entry in `data/macros.json`: a level, plus every macro recorded for it.
 *
 * The older flat shape (a single macro's fields inline on the level) is still
 * accepted and normalised into `macros` on load, so existing entries keep working.
 */
export interface LevelInput {
  /** The level, e.g. "Acheron". */
  name: string;
  /** Who built the level. Shown as the green tab. */
  creator: string;
  /** In-game level ID, used for the GD Browser link. */
  levelId: number | string;

  /** Every macro for this level, in the order you want them numbered. */
  macros?: MacroInput[];

  /** Optional YouTube URL, used for the embed and the list thumbnail. */
  video?: string;
  /** Optional image override: an absolute URL, or a path like "/thumbnails/x.svg". */
  thumbnail?: string;
  /** Optional URL override. Defaults to the level name, slugified. */
  slug?: string;
  /** Optional blurb shown on the detail page. */
  description?: string;

  /** @deprecated Legacy single-macro fields, still read if `macros` is absent. */
  macroAuthor?: string;
  /** @deprecated */
  recorder?: Recorder;
  /** @deprecated */
  downloadType?: string;
  /** @deprecated */
  downloadLink?: string;
}

/** A macro after loading, with its 1-based position for the "Macro N" label. */
export interface Macro extends MacroInput {
  position: number;
}

/** A level after loading, with slug, thumbnail and search text resolved. */
export interface Level {
  name: string;
  creator: string;
  levelId: number | string;
  macros: Macro[];
  video?: string;
  description?: string;
  slug: string;
  thumbnailUrl: string | null;
  youtubeId: string | null;
  /** Pre-lowercased haystack for the search box. */
  searchIndex: string;
}
