# QuotesDock - Project Context & Living Memory

> **Maintainer Rule**: Read this file at the start of every new session to get full context. Update this document before committing any completed milestone or version branch (`SH_QD_V*`). Never use em dashes in documentation, copy, or code.

---

## 1. What We Are Building

**QuotesDock** is a preview-first lead-generation and micro-SaaS platform for **US and UK mobile car detailers and valeters**, running on a $0/month fixed Cloudflare stack.

### Core Business Workflow
1. **Scout (`npm run scout`)**: Discover mobile car detailers in a target US or UK city who lack an active custom website (no site, Instagram/Facebook-only, Linktree, or broken domain) and stage top candidates in D1 (`lead_candidates`).
2. **Generate Preview (`/studio`)**: Turn a scouted candidate (or manual entry) into an isolated `/p/[slug]` mobile quote page in `preview` mode plus 3 personalized outreach drafts (Instagram DM, Facebook Message, Email).
3. **Human-in-the-Loop Outreach**: Review, edit, approve, and copy ~10 manual messages/day with the live preview URL.
4. **Preview "Aha" Moment (`/p/[slug]`)**: When the shop owner tests their 60-second driveway quote calculator, the page logs the test in D1, displays an **Owner Lead Notification Simulator** modal, lets them **Claim & Activate** their page directly, and flags them as hot in `/studio`.
5. **Convert & Go Live**: Swap in up to 6 real job photos (hosted on Cloudflare R2), confirm real pricing, vehicle proof captions, rig specs, and Owner Alert Email, then activate `live` mode so real customer bookings route straight to the detailer.

### Tech Stack (Zero-Fixed-Cost Cloudflare)
- **Framework**: Astro 5 (`output: 'server'`, `@astrojs/cloudflare`, `session: { driver: 'memory' }`)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Database**: Cloudflare D1 (SQLite) + Drizzle ORM + SQL migrations in `drizzle/migrations/`
- **Media Storage**: Cloudflare R2 (`MEDIA_BUCKET` binding, served via `/api/media/[...key]`)
- **Validation & Security**: Zod schemas, HMAC-SHA256 Studio session cookie, CSRF Origin/Referer checks, salted SHA-256 IP hashing for rate limits, CSP + security headers middleware (`src/middleware.ts`)
- **Email Alerts**: Resend HTTP API (verified `RESEND_FROM_EMAIL` required; optional `FOUNDER_ALERT_EMAIL` fallback)
- **Lead Scout CLI**: `scripts/scout.ts` (Serper Places/Search + optional Gemini Interactions API via `@google/genai`)

---

## 2. End Goal & Progress Tracker

**End Goal**: A production-deployed, self-sustaining micro-SaaS on Cloudflare Pages/Workers where real US and UK mobile car detailers claim or request a private 60-second quote page, pay via Merchant-of-Record checkout, showcase real R2-hosted job photos and truthful shop specs, and receive reliable instant customer quote alerts without missing leads.

### Milestone Status

- **Phase 1 / V1-V3 (`main`, completed)**:
  - Initial Astro + D1 + Drizzle scaffold, Obsidian Hydro Studio dark UI theme, 3 pre-seeded sandbox demos (`/p/apex-gloss-austin`, `/p/velvet-foam-charlotte`, `/p/cotswold-valet-uk`), Founder Outreach Studio (`/studio`), and local Lead Scout CLI (`scripts/scout.ts`).
- **P0 / V4 (`SH_QD_V4`, merged to `main` at `03ab6e6`, completed)**:
  - Fixed Cloudflare build warning (`SESSION` KV) via `session: { driver: 'memory' }` in `astro.config.mjs`.
  - Added `drizzle/migrations/0001_lead_candidates_and_delivery.sql` and eliminated per-cold-start DDL in `ensureSchemaAndSeed()`.
  - Hardened Studio auth with HMAC-SHA256 cookies, constant-time password verification, same-origin CSRF checks, env-salted IP hashes, security headers middleware (`src/middleware.ts`), and HTTPS-only photo URL validation.
  - Gated `isFounderSelfTest` strictly behind `isStudioAuthorized()` on both `/p/[slug]` and `/api/quotes`.
  - Enforced Live Mode Guard (cannot activate `live` mode without `ownerEmail`), removed hardcoded `onboarding@resend.dev` sender, added `delivery_status` + `delivery_error` tracking + `FOUNDER_ALERT_EMAIL` fallback, and fixed empty `sms:` modal CTA for DM-only live shops.
  - Fixed duplicate city slug bug (`slugifyBusinessName`), O(N*M) Studio scans, `pkg-full-reset` lookup, UK seed draft currency (`£39`), double-prefix copy URL bug, and mobile add-on `min-w-0` class loss.
- **P1 / V5 (`SH_QD_V5`, completed)**:
  - Removed fabricated Horiba gloss-meter telemetry (`64.2 -> 98.6 GU`), `0 PPM`, `98+ GU`, and unverified water/power rig claims from `/p/[slug]` and default generated previews (`seed-data.ts`).
  - Made all 6 job-proof cards (title, vehicle, service, before/after notes, real photo) and 4 service/rig highlights editable in `/studio`, and hid unfilled placeholder cards in `live` mode.
  - Added Cloudflare R2 media storage (`MEDIA_BUCKET` binding in `wrangler.jsonc`, Studio `POST /api/media/upload` with JPEG/PNG/WebP magic-byte validation, and cached same-origin `GET /api/media/[...key]`).
  - Built end-to-end conversion & claim funnel (`0002_inbound_inquiries.sql`, `POST`/`PATCH /api/inquiries`, homepage `#request-preview` intake + optional `FOUNDING_CHECKOUT_URL`/`STANDARD_CHECKOUT_URL` links, preview modal claim CTA + respectful removal request form, and Studio Inbound Claims inbox).
  - Removed unbuilt custom-domain overpromise from Standard Shop Plan on `/`.
  - Added permanent 30-case E2E & security regression suite (`scripts/e2e-test.ts`, `npm run test:e2e`) covering open mode (22 cases) and locked `ADMIN_STUDIO_KEY` mode (8 cases), with automatic D1 cleanup.
  - Fixed 3 Lead Scout CLI bugs caught during live `Bristol, UK` testing (`scripts/scout.ts`): `/places/` directory detection, brand-key substring false positives in cross-checks, and explicit `socialPlatform` grounding in the Stage 3 Gemini prompt.
  - Completed full Chrome Desktop (1280x800) + Mobile (390x844) visual/interactive QA (Suite 7) and applied polish fixes: added `public/favicon.svg`, immediate `#quote-calculator` fold visibility, consistent post-submit quote form reset, and Studio input `aria-label` accessibility attributes.
- **P2 / V6 (planned)**:
  - Replace stock `public/images/hero-wetbay.jpg` (which has a faint background wall sign) with a brand-neutral mobile detailing hero image.
  - Production Cloudflare deployment (provision real D1 database ID, R2 bucket `quotes-dock-media`, custom domain, Resend verified domain, Polar.sh / Lemon Squeezy checkout links & webhook sync).
  - Private magic-link Client Lead Inbox (`/owner/[token]`) so paying detailers can view leads and update availability/prices on mobile.
  - Instant SMS / WhatsApp / Telegram webhook lead alerts alongside email.
  - Lead Scout CLI upgrades (remove hardcoded Gloucestershire tokens, deduplicate against `prospects`, preserve unreviewed candidates across city re-runs, parallel Stage 2 checks).

---

## 3. Architecture Map (Key Files)

| Path | Purpose |
| :--- | :--- |
| `astro.config.mjs` | Astro SSR + `@astrojs/cloudflare` + Tailwind v4 + memory session config |
| `wrangler.jsonc` | Cloudflare D1 (`DB`) and R2 (`MEDIA_BUCKET`) bindings |
| `src/middleware.ts` | Global security headers + Content-Security-Policy |
| `src/lib/db/schema.ts` | Drizzle SQLite tables: `prospects`, `quote_requests`, `outreach_drafts`, `lead_candidates`, `inbound_inquiries` |
| `src/lib/db/repository.ts` | All D1 queries, pricing calculation, slug generation, live-mode guards, stats aggregation |
| `src/lib/db/seed-data.ts` | Default packages/add-ons/gallery builders, outreach draft templates, 3 sandbox demos |
| `src/lib/security/auth.ts` | HMAC Studio cookie derivation, constant-time verify, CSRF origin validation, salted IP hashing |
| `src/lib/validation/schemas.ts` | Zod schemas for quotes, prospects, drafts, candidates, and inbound inquiries |
| `src/pages/index.astro` | Public marketing landing page, interactive sandbox links, pricing, and free preview / claim intake form |
| `src/pages/p/[slug].astro` | Dynamic private detailer 60-second quote configurator, job-proof gallery, and preview claim flow |
| `src/pages/studio.astro` | Founder Outreach Studio: inbound inquiries, scout queue, prospect creator, full client editor + R2 uploader, outreach approval queue |
| `src/pages/api/quotes.ts` | Public quote submission endpoint (Zod, honeypot, rate limit, server math, Resend delivery tracking) |
| `src/pages/api/prospects.ts` | Studio CRUD for prospects + live-mode email guard |
| `src/pages/api/outreach.ts` | Studio PATCH for outreach draft edits & approval status |
| `src/pages/api/candidates.ts` | Studio GET/POST/PATCH for scouted lead candidates |
| `src/pages/api/inquiries.ts` | Public POST (preview requests, page claims, removal requests) + Studio PATCH status updates |
| `src/pages/api/media/upload.ts` | Studio R2 image upload with MIME + magic-byte validation |
| `src/pages/api/media/[...key].ts` | Cached same-origin R2 image delivery |
| `scripts/scout.ts` | Local CLI lead discovery & scoring script |
| `scripts/e2e-test.ts` | Automated 30-case E2E & security regression suite (`npm run test:e2e`) |

---

## 4. Production Deployment Checklist (Before Going Live)

1. Provision real D1 database (`npx wrangler d1 create quotes-dock-db`) and replace placeholder `database_id` in `wrangler.jsonc`.
2. Provision Cloudflare R2 bucket (`npx wrangler r2 bucket create quotes-dock-media`).
3. Apply all migrations remotely: `npx wrangler d1 migrations apply quotes-dock-db --remote`.
4. Set Cloudflare Pages / Workers secrets:
   - `ADMIN_STUDIO_KEY` (strong random 32+ char key)
   - `IP_HASH_SALT` (distinct random 32+ char secret)
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL` (verified sender domain, e.g. `QuotesDock Alerts <alerts@quotesdock.com>`)
   - `FOUNDER_ALERT_EMAIL` (founder inbox for inbound claims + delivery failure alerts)
   - Optional: `FOUNDING_CHECKOUT_URL` and `STANDARD_CHECKOUT_URL` (Polar.sh / Lemon Squeezy checkout links)
5. Build and deploy (`npm run build` + `npx wrangler pages deploy dist`).

---

## 5. Local Commands & Conventions

```powershell
npm run db:migrate:local   # Apply local D1 migrations
npm run dev                # Start local Astro + Cloudflare proxy server (http://localhost:4321)
npm run check              # Astro + TypeScript diagnostics (must pass with 0 errors/warnings/hints)
npm run build              # Production SSR build check
npm run test:e2e           # Full 22-case open-mode E2E suite (or pass --studio-key for locked auth suite)
npm run scout -- --city "Austin, TX" --country US
```

- **Branching**: Branch new versions off updated `main` as `SH_QD_V<n>` and merge back to `main` once verified.
- **Formatting**: Never use em dashes in prose, docs, UI copy, or code.
