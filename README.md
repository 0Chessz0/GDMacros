# GDMacros

A community catalog of Geometry Dash macros, styled after the Global Demonlist / AREDL layout.

The entire catalog lives in **one file**, [`data/macros.json`](data/macros.json). Adding a macro
means appending one object and opening a pull request; the site rebuilds from it.

- **Stack:** Next.js 15 (App Router) · React 19 · Tailwind CSS v4 · TypeScript
- **Output:** fully static. Every page is prerendered at build time, with no server and no database
- **Hosting:** deploys to Vercel with zero config, or to GitHub Pages via static export

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command            | What it does                                          |
| ------------------ | ----------------------------------------------------- |
| `npm run dev`      | Dev server with hot reload                            |
| `npm run build`    | Production build (prerenders a page per macro)        |
| `npm start`        | Serve the production build locally                    |
| `npm run validate` | Check `data/macros.json` for missing/invalid fields   |

---

## Adding a macro

[`data/macros.json`](data/macros.json) ships with **8 blank template rows**. Fill them in one at a
time. A row where every required field is still empty is skipped at build time, so the site builds
and deploys fine with half the slots blank. Add more rows (or delete spare ones) whenever you like.

A row with *some* fields filled is treated as a mistake, not a placeholder, and fails the build with
a message naming the missing field. That way a half-finished entry can't slip out silently.

Fill a row in like this:

```json
{
  "name": "Society",
  "creator": "Neomarbilan",
  "macroAuthor": "wPopoff",
  "levelId": 127323087,
  "recorder": "xdBot",
  "downloadType": "Google Drive",
  "downloadLink": "https://drive.google.com/file/d/YOUR_FILE_ID/view",
  "video": "https://www.youtube.com/watch?v=YOUR_VIDEO_ID"
}
```

Order doesn't matter, the site always sorts alphabetically by `name`.

### Field reference

| Field          | Required | Notes                                                                       |
| -------------- | -------- | --------------------------------------------------------------------------- |
| `name`         | **yes**  | The level the macro plays. This is what's sorted and searched                |
| `creator`      | **yes**  | Who built the level → the **green** tab                                      |
| `macroAuthor`  | **yes**  | Who recorded the macro → the **blue** tab                                    |
| `levelId`      | **yes**  | Powers the GD Browser button: `https://gdbrowser.com/<levelId>`               |
| `recorder`     | **yes**  | `"Mega Hack"` or `"xdBot"`. Anything else fails the build                    |
| `downloadType` | **yes**  | Where it's hosted: `"Google Drive"`, `"MediaFire"`, `"MEGA"`, `"Dropbox"`, etc. |
| `downloadLink` | **yes**  | Direct URL to the macro file                                                 |
| `video`        | no       | YouTube URL. Renders the embed *and* auto-generates the list thumbnail      |
| `thumbnail`    | no       | Image override: an absolute URL, or a path like `/thumbnails/x.png`          |
| `description`  | no       | Short blurb shown under the video on the detail page                        |
| `slug`         | no       | URL override. Defaults to `<name>-<macroAuthor>` slugified                   |

`recorder` is a closed set defined by `RECORDERS` in [`src/lib/types.ts`](src/lib/types.ts). The
guidelines only accept those two tools, and the home page filters on it. To allow another tool,
add it there and to the matching list in `scripts/validate-macros.mjs`.

`downloadType` is free text, so any host works. These get a tinted icon:
Google Drive, MediaFire, Dropbox, MEGA, GitHub, Discord, OneDrive.

### Thumbnails

Resolved in order, first match wins:

1. **`thumbnail`**: an absolute URL, or a file you drop in `public/` (e.g. `/thumbnails/society.png`).
2. **`video`**: the YouTube still is used automatically. *No image file needed.*
3. **Neither**: a generated gradient tile with the level's initial.

The easiest good-looking setup is to just fill in `video`.

### URLs

Each macro gets `/macro/<slug>`, where slug defaults to `<name>-<macroAuthor>` slugified.
`"Society"` + `"wPopoff"` → `/macro/society-wpopoff`. Two macros for the same level by different
authors won't collide. If you do hit a duplicate, the build fails with a message telling you to add
a `slug` field.

### Before committing

```bash
npm run validate
```

Errors (missing required fields, an invalid `recorder`, non-numeric `levelId`, duplicate URLs, a
`thumbnail` that isn't in `public/`) fail the check. Warnings (placeholder download link, no image
source) are informational. Blank template rows are counted separately and never fail anything.

---

## Deploying

### Vercel (recommended)

Push to GitHub, then import the repo at [vercel.com/new](https://vercel.com/new). Vercel detects
Next.js automatically, so there are no settings to change. Every push redeploys, so merging a macro PR publishes it.

Then set your real domain in [`src/lib/site.ts`](src/lib/site.ts) so metadata and share cards use
absolute URLs.

### GitHub Pages (optional, and not needed if you use Vercel)

The site uses no server-side features, so it also exports to plain HTML. No config edit is needed:
static export is switched on by environment variables, so the same repo builds for both hosts.

```bash
NEXT_OUTPUT=export NEXT_BASE_PATH=/GDMacros npm run build   # writes out/
```

[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) does exactly this. It is
**manual-only** (Actions tab → Run workflow) so it never runs, and never fails, unless you ask for
it. To use it, set **Settings → Pages → Source: GitHub Actions**, then run it once.

`NEXT_BASE_PATH` must match the repo name when serving from `<user>.github.io/<repo>`. Drop it if
you point a custom domain at Pages.

---

## Translation

The navbar language menu is wired to Google's free **website translate widget**
([`src/components/GoogleTranslate.tsx`](src/components/GoogleTranslate.tsx)).

This is deliberately *not* the Google Cloud Translation API. That one needs a paid API key, and on a
static site there is nowhere to hide a key. It would sit in the page source for anyone to lift and
bill to your account. The widget needs no key, costs nothing, and works on pure static hosting.

Two details worth knowing:

- Google's own banner and tooltip are suppressed in `globals.css`. The `body { top: 0 !important }`
  rule matters, because without it Google pushes the page down 40px and breaks the sticky navbar.
- Level names, creator handles, macro author handles, recorder names and download hosts are all
  marked `translate="no"`, so "Bloodbath" doesn't become "Baño de sangre". **If you add new UI that
  renders a proper noun, mark it the same way.**

Edit the offered languages in `LANGUAGES` in [`src/lib/site.ts`](src/lib/site.ts). Any code Google
Translate accepts works.

---

## Customising

**Branding and links:** [`src/lib/site.ts`](src/lib/site.ts): `name`, `url`, `repo`.

**Colours:** [`src/app/globals.css`](src/app/globals.css). The palette is two blocks at the top:
`:root` (dark, the default) and `[data-theme="light"]`. Change a value in both and it propagates
everywhere, including Tailwind utilities like `bg-surface` and `text-muted`. The green and blue
credit tabs use `--green` and `--accent`.

**Download host colours:** the `HOST_ACCENT` map in [`src/lib/format.ts`](src/lib/format.ts).

---

## Project structure

```
data/macros.json            the entire catalog
public/thumbnails/          optional images referenced by `thumbnail`
scripts/validate-macros.mjs pre-commit sanity check
.github/ISSUE_TEMPLATE/     the macro submission form
src/
  app/
    page.tsx                catalog + search
    macro/[slug]/page.tsx   macro detail (statically generated per entry)
    guidelines/ about/      static content pages
    sitemap.ts robots.ts    generated /sitemap.xml and /robots.txt
    globals.css             design tokens + base styles
  components/
    MacroBrowser.tsx        search + view state
    MacroRow.tsx MacroCard.tsx  list and grid presentations
    CreditTabs.tsx          the green/blue credit tabs
    CopyButton.tsx          "Click to copy" on the download card
    Navbar.tsx Footer.tsx Background.tsx VideoEmbed.tsx Thumb.tsx
  lib/
    macros.ts               reads + sorts data/macros.json at build time
    types.ts format.ts site.ts
```

### Ordering and ranking

Ordering is **alphabetical by level name, always**. It isn't configurable from the UI, and nothing
is ranked. Discovery is the search box, which matches level name, level creator, macro author,
level ID, recorder and download host. Press <kbd>/</kbd> to jump to it, <kbd>Esc</kbd> to clear.

The only filter is **recorder** (All / Mega Hack / xdBot), which is linkable as `?recorder=xdBot`.
Search and view mode are in the URL too (`?q=`, `?view=grid`).

> The Next.js badge you may see in the bottom-left corner during `npm run dev` is the framework's
> dev-tools indicator. It never appears in production builds, so it won't show on Vercel, and
> `devIndicators: false` in `next.config.mjs` now hides it locally as well.

---

Not affiliated with, endorsed by, or connected to RobTop Games.
