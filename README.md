# Local Visibility Audit Bot

Audits a local business's online presence (starting vertical: flower shops) against nearby
competitors and produces a shareable, cited report with concrete, ranked fixes.

Input: a business URL, or "Business Name, City". Output: a report page at `/report/[slug]`
plus a PDF download — no accounts, no payments.

## How it works

1. **Resolve** — the submitted URL (or name/city) is matched to a Google Place via the Places
   API (New). If a URL was given, the homepage is fetched and parsed (JSON-LD, `og:site_name`,
   `<title>`) to help find the right listing.
2. **Collect**, in parallel:
   - **Google Places** (`src/lib/collectors/places.ts`) — target + 3-5 nearby same-category
     competitors: rating, review count, most recent review date, photo count, hours
     completeness. (Owner-response rate and exact photo counts are *not* exposed by the public
     Places API — the report says "couldn't verify" for these rather than guessing.)
   - **Static website checks** (`src/lib/collectors/website.ts`) — PageSpeed Insights score,
     mobile-friendliness (viewport audit), SSL, visible phone/email, online-ordering detection,
     visible delivery fee. Run against the target *and* every competitor — this is passive,
     read-only fetching, the same as what a search-engine crawler does.
   - **Deep ordering-flow walk** (`src/lib/collectors/siteWalk.ts`) — a headless-browser walk
     through catalog → product → add-to-cart → cart → checkout, on both mobile and desktop
     viewports. **This only ever runs against the target's own site, and only after the
     submitter has proven ownership** (see Domain verification below). It never touches a
     competitor's site interactively, and it never fills in any form field — it only clicks
     pre-existing navigation elements, so it can't submit real or fake customer/payment data
     anywhere.
   - **AI visibility** (`src/lib/collectors/aiVisibility.ts`) — 8 "customer-style" prompts
     (e.g. "best flower delivery in {city}") run 3x each against OpenAI, tracking which
     businesses get named and how often.
3. **Synthesize** (`src/lib/synthesizer.ts`) — one `gpt-4o` call takes all collected JSON and
   produces a structured report: a side-by-side comparison table, the top 5 gaps ranked by
   impact vs. effort, and concrete non-technical steps for each. Every claim must cite collected
   data; missing data is reported as "couldn't verify X", never guessed.
4. **Serve** — the report renders at a shareable `/report/[slug]` URL with live status polling
   while the pipeline runs in the background, plus a PDF export (`@react-pdf/renderer`).

### Domain verification

The deep checkout-walk is invasive enough that it should only ever run against a site the
submitter actually controls. `ownsWebsite` is **never trusted from the client** — `/api/audit`
derives it server-side by checking whether the submitted domain has passed verification
(`isDomainVerified` in `src/lib/db.ts`). Verification itself is a simple meta-tag challenge
(`/api/verify` issues a token + tag, `/api/verify/check` fetches the homepage and confirms the
tag is present), the same mechanism Google Search Console uses. Unverified domains still get
every passive/public check — just not the interactive walk.

### Rate limiting & caching

Since there's no account gate and every audit costs money across three paid APIs, `/api/audit`:
- caches: an identical input submitted again within 24h reuses the existing report instead of
  re-running the pipeline
- rate-limits: max 5 new audits per hour per IP

## Local development

```bash
npm install
npx playwright install chromium   # one-time, for the local site-walk collector
cp .env.example .env              # then fill in real values
npm run dev
```

### Environment variables

See `.env.example` for the full list with explanations. You need, at minimum:

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Yes | Places API (New) must be enabled on the key |
| `PAGESPEED_API_KEY` | No | Falls back to `GOOGLE_PLACES_API_KEY`; PageSpeed also works unauthenticated at a lower rate limit |
| `OPENAI_API_KEY` | Yes | Used for both the AI-visibility probes and the synthesizer |
| `AI_VISIBILITY_MODEL` | No | Default `gpt-4o-mini` |
| `SYNTHESIS_MODEL` | No | Default `gpt-4o` |
| `DATABASE_URL` | Yes | Any standard Postgres connection string |

## Deploying (Render)

This app needs a **persistent Node server**, not a serverless/edge runtime — the deep site-walk
collector runs a real headless Chromium instance, which doesn't fit Lambda-style execution
limits without extra workarounds. Render's Web Service (Docker-based) is the deploy target this
repo is set up for.

**Why Docker, not Render's native Node buildpack:** Playwright's `--with-deps` browser
installer needs root to run `apt-get`, which Render's native Node build container doesn't
allow (`su: Authentication failure`). The `Dockerfile` in this repo sidesteps that entirely by
building on Microsoft's official Playwright image (`mcr.microsoft.com/playwright:v1.61.1-jammy`),
which already has Chromium and every OS-level dependency preinstalled — no `apt-get` needed at
build or run time.

> The Docker base image tag must stay in sync with the exact `playwright`/`playwright-core`
> version pinned in `package.json` (currently `1.61.1`, pinned exactly — not a caret range — so
> `npm install` can't silently drift out of sync with the Docker tag). If you bump the
> Playwright version, update both.

Steps:

1. **Create a Postgres instance** first (Render → New → Postgres). Grab its **Internal Database
   URL** once created (same region as the web service = free, fast, private network).
2. **Create a Web Service**, connect this repo, and pick **Docker** as the environment/language
   (Render should auto-detect the `Dockerfile`). With Docker selected, the Build/Start Command
   fields disappear — everything's defined in the `Dockerfile`.
3. Set the **instance type to at least Standard (2GB RAM)**. Free/Starter tiers (512MB) are too
   tight for a headless Chromium instance alongside the Node process and concurrent API calls,
   and free instances also spin down on idle (bad cold-start UX for this workload).
4. Add environment variables (same keys as `.env.example`), pointing `DATABASE_URL` at the
   Internal Database URL from step 1.
5. Deploy. `next start` automatically binds to Render's injected `PORT` env var — no extra
   config needed there.

## Known limitations (v1)

- Owner-response rate is never populated — not exposed by the public Places API.
- Photo counts reflect what the Places API returns (capped around 10), not necessarily the
  true total on the listing.
- AI-visibility prompts reflect the model's training-data knowledge, not a live-browsing
  assistant (e.g. ChatGPT with browsing, Perplexity) — the report should be read as one signal,
  not a definitive measure of all AI-assistant visibility.
- The deep site-walk is heuristic (link-text/href pattern matching across arbitrary site
  builders) and will often stop at "reached checkout" rather than confirming a completed order,
  by design — it never fills in any form field, so multi-step checkouts that require entering
  delivery/payment details before proceeding will simply stop there. That's expected, not a bug.
