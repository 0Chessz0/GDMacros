"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AuthField, FormError, SubmitButton } from "@/components/auth/fields";
import { RECORDERS } from "@/lib/types";
import { isClean, validateFile, type FieldErrors } from "@/lib/submissions";

/**
 * The submission form.
 *
 * The level and the video are CHOSEN rather than typed. The level name, id and
 * creator come from GDBrowser, and the video from a real YouTube result, so a
 * submission arrives with data that already agrees with reality.
 *
 * None of that is a security boundary. The server re-fetches the level by id
 * and re-verifies the video before storing anything, and discards whatever the
 * browser claimed for the name and creator. This is here to make the form
 * pleasant, not to be trusted.
 *
 * Both searches are behind an explicit button. Neither fires on a keystroke:
 * one is somebody else's service and the other is an unofficial scrape.
 */

interface Level {
  levelId: string;
  name: string;
  creator: string;
  difficulty: string;
  downloads: number | null;
  likes: number | null;
  length: string;
  stars: number | null;
  songName: string;
}

interface Video {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  views: string;
  thumbnail: string;
  isLive: boolean;
}

export default function SubmitForm({ username }: { username: string }) {
  // Chosen values
  const [level, setLevel] = useState<Level | null>(null);
  const [video, setVideo] = useState<Video | null>(null);

  // Level search
  const [levelQuery, setLevelQuery] = useState("");
  const [levelResults, setLevelResults] = useState<Level[] | null>(null);
  const [levelSearching, setLevelSearching] = useState(false);
  const [levelError, setLevelError] = useState<string | null>(null);

  // Video search
  const [videoQuery, setVideoQuery] = useState("");
  const [videoResults, setVideoResults] = useState<Video[] | null>(null);
  const [videoSearching, setVideoSearching] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  // The rest
  const [recorder, setRecorder] = useState("");
  const [macroAuthor, setMacroAuthor] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function searchLevels() {
    const q = levelQuery.trim();
    if (!q) return;
    setLevelError(null);
    setLevelSearching(true);
    setLevelResults(null);
    try {
      const res = await fetch(`/api/search?kind=level&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) setLevelError(json.error ?? "That search did not work.");
      else if ((json.levels ?? []).length === 0) setLevelError("No Geometry Dash level matched that.");
      else setLevelResults(json.levels);
    } catch {
      setLevelError("Could not reach the level search. Check your connection.");
    } finally {
      setLevelSearching(false);
    }
  }

  function chooseLevel(l: Level) {
    setLevel(l);
    setLevelResults(null);
    setErrors((p) => ({ ...p, levelId: undefined, levelName: undefined }));
    // A useful starting point for the video search, which the user can edit.
    if (!videoQuery) setVideoQuery(`${l.name} Geometry Dash`);
  }

  async function searchVideos() {
    const q = videoQuery.trim();
    if (!q) return;
    setVideoError(null);
    setVideoSearching(true);
    setVideoResults(null);
    try {
      const res = await fetch(`/api/search?kind=video&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) setVideoError(json.error ?? "That search did not work.");
      else setVideoResults(json.videos ?? []);
    } catch {
      setVideoError("Could not reach the video search. You can paste a link instead.");
    } finally {
      setVideoSearching(false);
    }
  }

  /** The fallback for the day the search stops working. Still no API key. */
  async function useManualUrl() {
    const q = manualUrl.trim();
    if (!q) return;
    setVideoError(null);
    setManualBusy(true);
    try {
      const res = await fetch(`/api/search?kind=verify&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) {
        setVideoError(json.error ?? "That link could not be checked.");
        return;
      }
      const v = json.video;
      setVideo({
        videoId: v.videoId,
        title: v.title,
        channel: v.channel,
        duration: "",
        views: "",
        thumbnail: v.thumbnail,
        isLive: false,
      });
      setVideoResults(null);
      setManualUrl("");
    } catch {
      setVideoError("Could not check that link. Try again.");
    } finally {
      setManualBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const next: FieldErrors = {};
    if (!level) next.levelId = "Search for the level and choose it from the results.";
    if (!RECORDERS.includes(recorder as (typeof RECORDERS)[number]))
      next.recorder = "Choose which tool recorded this macro.";
    if (!macroAuthor.trim()) next.macroAuthor = "Enter who recorded the macro.";
    const fileProblem = validateFile(file);
    if (fileProblem) next.file = fileProblem;
    setErrors(next);
    if (!isClean(next)) return;

    setBusy(true);
    try {
      const body = new FormData();
      // The name and creator are sent for completeness, but the server refetches
      // the level by id and uses its own answer, so these cannot decide anything.
      body.append("levelName", level!.name);
      body.append("levelId", level!.levelId);
      body.append("levelCreator", level!.creator);
      body.append("videoUrl", video ? `https://www.youtube.com/watch?v=${video.videoId}` : "");
      body.append("recorder", recorder);
      body.append("macroAuthor", macroAuthor);
      body.append("notes", notes);
      if (file) body.append("file", file);

      const res = await fetch("/api/submissions", { method: "POST", body });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (json.fields) setErrors(json.fields);
        setFormError(json.error ?? "Something went wrong. Please try again.");
        return;
      }

      setDone(true);
      setLevel(null);
      setVideo(null);
      setLevelQuery("");
      setVideoQuery("");
      setRecorder("");
      setMacroAuthor("");
      setNotes("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setFormError("The upload could not be sent. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card mt-6 flex flex-col items-start gap-3 p-5">
        <p className="text-[15px] font-bold text-text">Submission received</p>
        <p className="text-[13px] leading-relaxed text-muted">
          It is now waiting for review. You can see its status, and withdraw it while it is still
          pending, on your submissions page.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/submissions"
            className="rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95"
          >
            Your submissions
          </Link>
          <button
            type="button"
            onClick={() => setDone(false)}
            className="rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40 hover:text-text active:translate-y-0 active:scale-95"
          >
            Send another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3" noValidate>
      <div className="card flex flex-wrap items-baseline justify-between gap-2 px-5 py-3.5">
        <span className="text-[12.5px] text-muted">Submitting as</span>
        <span translate="no" className="notranslate selectable text-[13.5px] font-semibold text-text">
          {username}
        </span>
      </div>

      {/* ---------------------------------------------------------- level */}
      <div className="card p-5">
        <h2 className="text-[15px] font-bold text-text">1. The level</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          Search by name or paste the level ID. The details come from GDBrowser, so they are always
          right.
        </p>

        {level ? (
          <div className="mt-3 rounded-xl border border-accent/40 bg-accent/5 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-text">{level.name}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  ID <span className="tabular-nums">{level.levelId}</span> &middot; by{" "}
                  {level.creator}
                  {level.difficulty ? <> &middot; {level.difficulty}</> : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLevel(null);
                  setLevelResults(null);
                }}
                className="text-[12.5px] text-muted transition-colors hover:text-text-dim"
              >
                Change
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={levelQuery}
                onChange={(e) => setLevelQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchLevels();
                  }
                }}
                maxLength={60}
                placeholder="Acheron, or 73667628"
                className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 text-[13.5px] text-text outline-none transition-colors placeholder:text-muted focus:border-accent"
              />
              <button
                type="button"
                onClick={searchLevels}
                disabled={levelSearching || !levelQuery.trim()}
                className="shrink-0 rounded-xl bg-accent px-4 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {levelSearching ? "..." : "Search"}
              </button>
            </div>

            {levelError && <p className="mt-2 text-[12px] text-rose">{levelError}</p>}
            {errors.levelId && !levelError && (
              <p className="mt-2 text-[12px] text-rose">{errors.levelId}</p>
            )}

            {levelResults && levelResults.length > 0 && (
              <div className="mt-3 flex max-h-[280px] flex-col gap-1.5 overflow-y-auto">
                {levelResults.map((l) => (
                  <button
                    key={l.levelId}
                    type="button"
                    onClick={() => chooseLevel(l)}
                    className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-surface-2"
                  >
                    <p className="text-[13.5px] font-semibold text-text">{l.name}</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      ID <span className="tabular-nums">{l.levelId}</span> &middot; by {l.creator}
                      {l.difficulty ? <> &middot; {l.difficulty}</> : null}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ---------------------------------------------------------- video */}
      <div className="card p-5">
        <h2 className="text-[15px] font-bold text-text">2. The video</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          Optional. Search YouTube for the completion, or paste a link.
        </p>

        {video ? (
          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent/5 p-3.5 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={video.thumbnail}
              alt=""
              className="h-[76px] w-[135px] shrink-0 rounded-lg border border-border object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-text">{video.title}</p>
              {video.channel && <p className="mt-0.5 text-[12px] text-muted">{video.channel}</p>}
              <button
                type="button"
                onClick={() => setVideo(null)}
                className="mt-1.5 text-[12.5px] text-muted transition-colors hover:text-text-dim"
              >
                Change
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={videoQuery}
                onChange={(e) => setVideoQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchVideos();
                  }
                }}
                maxLength={100}
                placeholder={level ? `${level.name} Geometry Dash` : "Search YouTube"}
                className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 text-[13.5px] text-text outline-none transition-colors placeholder:text-muted focus:border-accent"
              />
              <button
                type="button"
                onClick={searchVideos}
                disabled={videoSearching || !videoQuery.trim()}
                className="shrink-0 rounded-xl bg-accent px-4 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {videoSearching ? "..." : "Search"}
              </button>
            </div>

            {videoError && <p className="mt-2 text-[12px] text-rose">{videoError}</p>}
            {errors.videoUrl && !videoError && (
              <p className="mt-2 text-[12px] text-rose">{errors.videoUrl}</p>
            )}

            {videoResults && videoResults.length > 0 && (
              <div className="mt-3 flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
                {videoResults.map((v) => (
                  <button
                    key={v.videoId}
                    type="button"
                    onClick={() => {
                      setVideo(v);
                      setVideoResults(null);
                    }}
                    className="flex gap-3 rounded-xl border border-border bg-surface p-2 text-left transition-colors hover:border-accent/40 hover:bg-surface-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.thumbnail}
                      alt=""
                      loading="lazy"
                      className="h-[54px] w-[96px] shrink-0 rounded-md object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-[12.5px] font-semibold text-text">
                        {v.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                        {v.channel}
                        {v.duration ? ` · ${v.duration}` : ""}
                        {v.views ? ` · ${v.views}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3.5 border-t border-border-soft pt-3">
              <label htmlFor="manual-url" className="block text-[12px] text-muted">
                Or paste a YouTube link
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="manual-url"
                  type="text"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://youtu.be/..."
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-[13px] text-text outline-none transition-colors placeholder:text-muted focus:border-accent"
                />
                <button
                  type="button"
                  onClick={useManualUrl}
                  disabled={manualBusy || !manualUrl.trim()}
                  className="shrink-0 rounded-lg border border-border bg-surface px-3 text-[12.5px] font-semibold text-text-dim transition-colors hover:text-text disabled:opacity-60"
                >
                  {manualBusy ? "..." : "Use"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---------------------------------------------------------- macro */}
      <div className="card flex flex-col gap-4 p-5">
        <h2 className="text-[15px] font-bold text-text">3. The macro</h2>

        <div>
          <label htmlFor="recorder" className="block text-[12.5px] font-semibold text-text-dim">
            Recorded with
          </label>
          <select
            id="recorder"
            value={recorder}
            onChange={(e) => {
              setRecorder(e.target.value);
              setErrors((p) => ({ ...p, recorder: undefined }));
            }}
            className={`mt-1.5 h-10 w-full rounded-xl border bg-surface px-3.5 text-[13.5px] text-text outline-none transition-colors ${
              errors.recorder ? "border-rose/60" : "border-border focus:border-accent"
            }`}
          >
            <option value="">Choose one</option>
            {RECORDERS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {errors.recorder && <p className="mt-1.5 text-[12px] text-rose">{errors.recorder}</p>}
        </div>

        <AuthField
          label="Macro author"
          value={macroAuthor}
          onChange={(e) => {
            setMacroAuthor(e.target.value);
            setErrors((p) => ({ ...p, macroAuthor: undefined }));
          }}
          error={errors.macroAuthor}
          autoComplete="off"
          placeholder="Who recorded it"
          hint="Who recorded the macro. This is often not you, and it is shown on the site."
        />

        <div>
          <label htmlFor="notes" className="block text-[12.5px] font-semibold text-text-dim">
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Anything worth knowing about this macro"
            className={`mt-1.5 w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[13.5px] text-text outline-none transition-colors placeholder:text-muted ${
              errors.notes ? "border-rose/60" : "border-border focus:border-accent"
            }`}
          />
          {errors.notes ? (
            <p className="mt-1.5 text-[12px] text-rose">{errors.notes}</p>
          ) : (
            <p className="mt-1.5 text-[12px] text-muted">Optional.</p>
          )}
        </div>

        <div>
          <label htmlFor="file" className="block text-[12.5px] font-semibold text-text-dim">
            Macro file
          </label>
          <input
            id="file"
            ref={fileRef}
            type="file"
            accept=".gdr2"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setErrors((p) => ({ ...p, file: undefined }));
            }}
            className={`mt-1.5 w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[13px] text-text-dim outline-none transition-colors file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-text-dim ${
              errors.file ? "border-rose/60" : "border-border"
            }`}
          />
          {errors.file ? (
            <p className="mt-1.5 text-[12px] text-rose">{errors.file}</p>
          ) : (
            <p className="mt-1.5 text-[12px] text-muted">A .gdr2 file, up to 2 MB.</p>
          )}
        </div>

        <FormError>{formError}</FormError>
        <SubmitButton busy={busy}>Send for review</SubmitButton>
      </div>
    </form>
  );
}
