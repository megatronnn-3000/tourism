# CMS & Guest Reviews — Implementation Plan

Turning the static one-page site into a CMS-backed site with an admin panel
Govind can use himself, plus guest-submitted reviews that he moderates.

## Context

Today the site is a single static `index.html` (~2,400 lines) deployed to Vercel
from GitHub. All content is hardcoded twice: once as German text in the markup,
and once in a `TRANSLATIONS` object holding ~200 DE/EN key pairs. Images are
hand-optimised JPEGs in `images/`. Changing any word or photo requires editing
HTML and pushing a commit.

The goal is that Govind can change text, swap photos, and approve guest reviews
himself, without touching code or git.

### Decisions already made

| Question | Decision |
|---|---|
| CMS | Sanity |
| Reviews | Guest-submitted, open to anyone |
| Moderation | Nothing publishes without Govind approving it |
| Content injection | Build-time, not runtime fetch |

**Why build-time injection:** the German copy ships inside the HTML, so SEO is
unaffected and there is no flash of stale text on load. Visitor traffic never
touches Sanity's API quota. If Sanity is ever down or over quota, the live site
keeps serving normally because it is static files on Vercel — only new publishes
would fail.

### Working rule

Do this on a branch (`git checkout -b cms`), not `master`, so the live Vercel
deployment keeps serving the current site throughout.

---

## Phase A — Sanity setup

No changes to the live site. Work happens on the `cms` branch.

> **Status:** scaffolding done. Schemas, Studio config and both scripts are
> written and the migration dry-run passes (148 keys, 21 images). What remains
> needs a Sanity account: Step 1 below, then `npm run migrate`.

### Step 1. Create the Sanity project

Run `npx sanity login` then `npx sanity projects create`, or sign up at
sanity.io/manage. Free plan, default `production` dataset. Note the **project
ID** — it goes in both `.env` and `studio/.env`.

### Step 2. Define schemas

In `studio/schemas/`, three document types:

- **`siteContent`** — singleton holding every translatable string as paired
  DE/EN fields, mirroring the existing `TRANSLATIONS` keys in `index.html`.
  Grouped by section (hero, about, journeys, info, form) so the Studio does not
  present 200 flat fields.
- **`siteImage`** — a named slot (`hero`, `portrait`, `tourRajasthan`, gallery
  entries) with a Sanity image field plus alt text in DE and EN.
- **`review`** — `author`, `city`, `rating` (1–5), `quoteOriginal`, `language`,
  `quoteDe`, `quoteEn`, `status` (pending/approved/rejected, defaults to
  pending), `submittedAt`.

**Why two quote fields:** a German guest submits German; the English page needs
English. Govind writes the second language at approval time, so moderation and
translation become a single action.

### Step 3. Migrate existing content in

A throwaway script reads the current `TRANSLATIONS` object and uploads it as one
`siteContent` document, then uploads the 21 files in `images/` as `siteImage`
documents. Run once, then delete.

**Verify:** open the Studio locally (`npm run dev` in `studio/`) and confirm
every string and image is present and readable.

---

## Phase B — Build pipeline

Goal: a build that reproduces the current site from CMS content. Nothing visual
changes. This phase de-risks everything that follows.

> **Status:** done except Step 7 (Vercel env vars, needs the dashboard).
> `npm run build` produces `dist/`, `npm run verify` confirms no key or string
> was lost. `vercel.json` pins the build command and output directory so the
> dashboard only needs the environment variables.

### Step 4. Restructure the repo

```
├── package.json
├── build.mjs
├── src/template.html     ← today's index.html, with markers
├── api/submit-review.js  ← Phase C
├── studio/               ← its own package
├── images/  video-gast.mp4
└── dist/                 ← build output, gitignored
```

Move `index.html` → `src/template.html` unchanged for now.

### Step 5. Write `build.mjs`

Dependencies: `@sanity/client`, `@sanity/image-url`, `cheerio`.

1. GROQ-fetch `siteContent`, `siteImage`, and approved reviews
2. Load `src/template.html` into cheerio
3. For each `[data-i18n]` element, set its text to the **German** value — this is
   what Google indexes
4. Same for `data-i18n-alt`, `-placeholder`, `-aria-label`, `-href`, `-content`
   (the attribute mapping already exists in the page's script)
5. Replace image `src` attributes with Sanity CDN URLs
   (`?w=1080&q=75&auto=format`)
6. Generate review cards into `.testimonials-grid`, using the existing
   `reviews.N.quote` / `reviews.N.author` key convention
7. Rewrite the `TRANSLATIONS = {...}` block with the fetched DE/EN dictionaries
8. Copy `images/` and `video-gast.mp4` into `dist/`, write `dist/index.html`

### Step 6. Prove the output matches — do not skip

```bash
npm run build
npm run verify
```

A plain `diff` is useless here: image URLs change by design and the
`TRANSLATIONS` block gets reformatted. `scripts/verify-build.mjs` compares
semantically instead — every key in both dictionaries, every string baked into
the markup, and that no image is still pointing at a local path. It exits
non-zero if anything was lost.

### Step 7. Point Vercel at the build

Project → Settings → Build & Development:

- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variables: `SANITY_PROJECT_ID`, `SANITY_DATASET`

Push the branch; open the Vercel preview URL side by side with production and
confirm they are indistinguishable.

---

## Phase C — Guest reviews

### Step 8. Studio moderation view

Use Sanity's Structure Builder to replace the default document list with three
sidebar items: **Pending Reviews**, **Published Reviews**, **Site Content**. Add
a custom document action button, **Approve**, that sets `status: "approved"` and
publishes in one click.

This is what makes the Studio usable by someone non-technical.

### Step 9. Submission form on the page

New block inside `#bewertungen`: name, city, star rating, review text, consent
checkbox, plus a hidden honeypot field — reuse the pattern already in the
enquiry form. Add matching `data-i18n` keys in both dictionaries so it
translates like everything else.

### Step 10. `api/submit-review.js`

A Vercel serverless function:

- Reject if the honeypot is filled
- Validate: rating 1–5, text length bounds, required fields, consent given
- Write to Sanity via `@sanity/client` with `status: "pending"` and a
  server-generated `submittedAt`
- Return JSON; the page shows a "thank you, pending review" message

**The one rule that cannot be bent:** `SANITY_WRITE_TOKEN` lives in Vercel
environment variables and is read only inside this function. A write token in
browser JavaScript lets anyone delete the entire dataset.

Add Cloudflare Turnstile here too — free and invisible. Real IP rate-limiting
needs a state store (Vercel KV or Upstash); honeypot + Turnstile + mandatory
moderation is adequate for launch, and nothing spammy can reach the live site
regardless.

### Step 11. End-to-end test

Submit a review from the preview URL → confirm it appears as Pending in the
Studio → approve it → confirm it appears on the site after rebuild.

---

## Phase D — Automation and launch

### Step 12. Auto-rebuild on publish

Vercel → Settings → Git → **Deploy Hooks** → create one, copy the URL.
Sanity → API → Webhooks → fire on publish of `siteContent`, `siteImage`,
`review` → POST to that URL. Publish-to-live becomes ~60 seconds, hands-off.

### Step 13. Legal copy

Add the UWG §5b review-disclosure line near the reviews stating they are not
verified, and fill the Impressum placeholder still in the footer.

### Step 14. Launch

Merge to `master`. Then the pre-launch items outstanding regardless of this
work: `robots.txt`, `sitemap.xml`, favicon, Open Graph image, 404 page.

---

## Effort estimate

| Phase | Time |
|---|---|
| A — Sanity setup & migration | 2–3 h |
| B — Build pipeline | 3–4 h |
| C — Guest reviews | 3–4 h |
| D — Automation & launch | 1–2 h |

A full day, two if content migration is fiddly. Phase B is the hard part;
Phase C is mostly familiar form work.

---

## Free tier headroom

| | Sanity free plan |
|---|---|
| Seats | 20, of which 2 non-admin editors |
| Datasets | 2 |
| API CDN requests | 500,000 / month |
| Bandwidth | 10 GB |
| Asset storage | 20 GB |

Because content is baked in at build time, API requests are consumed by builds
and review submissions only — a few hundred a month against a 500,000 limit.
Limits are hard (blocked, not billed), which is safe here since the live site
does not depend on Sanity at runtime.
