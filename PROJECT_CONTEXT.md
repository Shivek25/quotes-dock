# QuotesDock - Project Context & Living Memory

> **Maintainer Rule**: Read this file at the start of every new session to get full context. Update this document before committing any completed milestone or version branch (`SH_QD_V*`). Never use em dashes in documentation, copy, or code.

> **CLOUDFLARE PRODUCTION SAFETY GUARDRAIL (STRICT)**:
> On Cloudflare account `cacc7c265bab0b2a28df673386174fca` (`shiveksharma200225@gmail.com`), there is an active live production site: Pages/Worker `fall-asleep` and DNS zone `fallasleeep.com` (`www.fallasleeep.com`, `fall-asleep.pages.dev`).
> **NEVER modify, redeploy, delete, or touch any resource, DNS record, route, or setting related to `fall-asleep` or `fallasleeep.com`.**
> QuotesDock MUST stay 100% isolated under its own dedicated resources: Pages project `quotes-dock` (`quotes-dock.pages.dev`), D1 database `quotes-dock-db`, and (when R2 is enabled in the future) R2 bucket `quotes-dock-media`.

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
- **Media Storage**: Zero-card D1 fallback (`media_assets` table, 750 KB max per photo) served via `/api/media/[...key]`, automatically upgrading to Cloudflare R2 (`MEDIA_BUCKET` binding, 5 MB max per photo) as soon as R2 is enabled in the Cloudflare Dashboard and bound in `wrangler.jsonc`.
- **Client Retention & Alerts**: Private magic-link Client Lead Inbox (`/owner/[token]`) with tenant-scoped self-service status & availability controls, plus instant SSRF-safe HTTPS Webhook alerts (Discord / Slack / Make / Zapier / Telegram relay) alongside optional Resend email alerts.
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
- **P2 / V6 (`SH_QD_V6`, completed & deployed live at `https://quotes-dock.pages.dev`)**:
  - Replaced stock `public/images/hero-wetbay.jpg` with a brand-neutral obsidian/cyan mobile detailing photograph (zero wall signs, logos, or text).
  - Added migration `0003_owner_portal_webhooks_media.sql` (`owner_portal_token`, `webhook_url`, `availability_status` on `prospects`; `lead_status` on `quote_requests`; `media_assets` D1 fallback table).
  - Built private magic-link Client Lead Inbox (`/owner/[token]`, `PATCH /api/owner/leads`, `PATCH /api/owner/settings`) with strict per-shop tenant scoping, 1-tap SMS/Call customer links, lead status tracking (`new` / `contacted` / `booked` / `archived`), and live slot availability + base price controls.
  - Added SSRF-safe instant HTTPS Webhook alerts (Discord, Slack, Make, Zapier, generic JSON) in `POST /api/quotes` alongside Resend email, and updated Live Mode Guard to allow going live with either `ownerEmail` or `webhookUrl`.
  - Upgraded `/api/media/upload` and `/api/media/[...key]` with automatic zero-card D1 `media_assets` fallback when `MEDIA_BUCKET` is not bound (future R2 switch: enable R2 in Cloudflare Dashboard -> create `quotes-dock-media` -> re-add `r2_buckets` binding in `wrangler.jsonc` & Pages settings).
  - Upgraded Studio UI with Copy/Rotate Owner Inbox link and Webhook URL fields.
  - Upgraded Lead Scout CLI V2 (`scripts/scout.ts`): removed hardcoded Gloucestershire tokens, added prospect deduplication (`GET /api/prospects`), added opt-in `--replace-city` flag (default preserves unreviewed candidates), and parallelized Stage 2 cross-checks (`concurrency=3`).
  - Extended E2E regression suite to 32 cases (24 open + 8 locked, all passing).
  - Provisioned isolated Cloudflare D1 (`quotes-dock-db`, UUID `842889a2-8f3e-4ded-b6a0-586cc215bcf1`), applied migrations `0000` through `0003` remotely, created isolated Pages project `quotes-dock`, uploaded production secrets (`ADMIN_STUDIO_KEY`, `IP_HASH_SALT`), deployed live to `https://quotes-dock.pages.dev`, and verified `https://fallasleeep.com` untouched.
- **P3 / V7 (`SH_QD_V7`, completed & deployed live at `https://quotes-dock.pages.dev`)**:
  - Activated Stitch *Obsidian Hydro Studio* design tokens (`#090C12` void obsidian, `#00F2FE` ionized hydro-cyan, `Space Grotesk` display headings at `-0.03em` tracking) across `src/styles/global.css` and `src/layouts/BaseLayout.astro`.
  - Added full-viewport `.studio-backdrop` (56px architectural grid + micro-dot matrix + ambient cyan/emerald gutter orbs + wide-screen frame rails), desktop-only (`hover: hover` + `pointer: fine`) `requestAnimationFrame`-throttled pointer physics (global GPU-translated `#studio-cursor-glow` torch, `--mx`/`--my` anisotropic border spotlights, `--stage-x`/`--stage-y` wet-bay overhead light-tunnel tracking, subtle `data-tilt-card` perspective, and `data-magnetic` hero CTAs) plus top `.scroll-laser` progress bar and full `prefers-reduced-motion` support.
  - Upgraded `/` (`src/pages/index.astro`) with a floating glassmorphic pill navbar, kinetic `.text-hydro-sheen` hero headline, playable Hero 60s Quote Micro-Simulator (live Sedan / SUV / 3-Row Truck SVG silhouettes + rolling price + simulated instant owner alert), asymmetric 12-column Bento grid, and connected 24-hour setup timeline.
  - Upgraded `/p/[slug]` (`src/pages/p/[slug].astro`) with wet-bay light-tunnel hero, 4-step interactive telemetry bar, illuminated SVG studio bays, `240ms` smooth rolling price counters, Before/After proof crossfades, recessed carbon inputs, and optical sticky quote dock polish (keeping `/studio` and `/owner/[token]` stationary operational UIs).
- **P3 / V8 (`SH_QD_V8`, completed & deployed live at `https://quotes-dock.pages.dev`)**:
  - Upgraded `/p/[slug]` quote confirmation modal (`src/pages/p/[slug].astro`) into 3 distinct context-aware modes using `isSandboxDemoSlug()`: clean white-labeled customer confirmation in `live` mode, friendly shop-owner software demo copy + `/#request-preview` CTA on public sandbox demos, and personalized activation copy + `#claim-preview` scroll CTA on custom outreach previews.
  - Redesigned the Owner Lead Alert Preview inside the modal as a sleek recessed notification card (`whitespace-nowrap` status badge, crisp sender header, fixed price/city parentheses spacing, and mobile-aligned CTA buttons) and refined Step 04 preview helper copy.
- **P3 / V10 (`SH_QD_V10`, completed & deployed live at `https://quotes-dock.pages.dev`)**:
  - Extracted SSRF-safe `sendWebhookAlert()` (`src/lib/alerts/webhook.ts`) with `redirect: 'follow'` support for Discord, Slack, Make/Zapier, and zero-domain Google Apps Script Gmail relays (`FOUNDER_WEBHOOK_URL` + optional `WEBHOOK_SECRET`).
  - Wired `FOUNDER_WEBHOOK_URL` into both `POST /api/quotes` (for live shop quote alerts, including `ownerEmail` in relay payloads) and `POST /api/inquiries` (for free preview requests, claims, and removals).
  - Updated `/studio` (`src/pages/studio.astro`) so unconfigured Resend setups show a calm `Saved in Owner Inbox` badge instead of an alarming red error, relabeled `sent` to `Alert Sent`, added inline `Owner Alert Email` delivery readiness hints, and added a collapsible zero-domain Gmail relay & webhook setup guide.
- **P3 / V11 (`SH_QD_V11`, completed & deployed live at `https://quotes-dock.pages.dev`)**:
  - Added Obsidian HTML & anti-spam email builder (`src/lib/alerts/email-templates.ts`) with table-based dark UI cards, clickable phone/inbox CTAs, HTML escaping, and spam-safe subjects (no currency amounts or raw 64-char hex URLs in plain sight).
  - Updated `sendWebhookAlert()`, `POST /api/quotes`, `POST /api/inquiries`, and the `/studio` Apps Script snippet to send multipart `text/plain` + `text/html` (`htmlBody`) and custom `senderName` via `GmailApp.sendEmail`.
- **P3 / V12 (`SH_QD_V12`, completed & deployed live at `https://quotes-dock.pages.dev`)**:
  - Hardened `sendWebhookAlert()` (`src/lib/alerts/webhook.ts`) to inspect response bodies and catch `{ ok: false }` JSON or Google Apps Script HTML exception pages (`<!DOCTYPE html>`) instead of falsely reporting `Alert Sent`.
  - Updated the `/studio` Apps Script relay snippet (`src/pages/studio.astro`) to use `MailApp.sendEmail({ to, subject, body, htmlBody, name })` with `Session.getEffectiveUser().getEmail()` and structured `try / catch` JSON error reporting, keeping the user's already-authorized `MailApp` permission scope intact.
- **P3 / V13 (deployed directly on `main`)**:
  - Upgraded `/owner/[token]` (`src/pages/owner/[token].astro`) to the full Obsidian Hydro Studio visual system (`showScrollLaser={true}` `.studio-backdrop` grid + orbs + desktop cursor glow, floating glassmorphic header bar with `Copy Bio Link` and `.btn-hydro-primary`, `.spotlight-card` hover borders, `.input-carbon` quick controls, clean vehicle/condition/timing/add-on spec chips, and live animated KPI counter updates + smooth archive transitions without tilting operational buttons).
- **Future Upgrades (Post-Launch / P3+)**:
  - Enable Cloudflare R2 in Cloudflare Dashboard, create `quotes-dock-media`, and re-enable `r2_buckets` in `wrangler.jsonc` to lift photo uploads from 750 KB (D1 fallback) to 5 MB (R2).
  - Attach a dedicated QuotesDock custom domain + verified Resend sending domain (`RESEND_FROM_EMAIL`) + Polar.sh / Lemon Squeezy checkout URLs (`FOUNDING_CHECKOUT_URL`, `STANDARD_CHECKOUT_URL`).

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
| `src/pages/owner/[token].astro` | Private magic-link Client Lead Inbox (1-tap SMS/Call, lead statuses, availability & price self-controls) |
| `src/pages/api/owner/leads.ts` | Tenant-scoped `PATCH` for owner lead status updates |
| `src/pages/api/owner/settings.ts` | Tenant-scoped `PATCH` for owner availability badge, base price, and phone updates |
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

## 4. Production Environment & Future Upgrades

- **Live Production URL**: `https://quotes-dock.pages.dev` (Cloudflare Pages project `quotes-dock`)
- **Production D1 Database**: `quotes-dock-db` (`842889a2-8f3e-4ded-b6a0-586cc215bcf1`, region APAC)
- **Active Production Secrets**: `ADMIN_STUDIO_KEY`, `IP_HASH_SALT` (set via `wrangler pages secret`)
- **Optional Future Secrets (Add Whenever Ready)**:
  - `RESEND_API_KEY` + verified `RESEND_FROM_EMAIL` (for email alerts alongside instant webhooks)
  - `FOUNDER_ALERT_EMAIL` (founder inbox for inbound claims + delivery failure alerts)
  - `FOUNDING_CHECKOUT_URL` / `STANDARD_CHECKOUT_URL` (Polar.sh / Lemon Squeezy checkout links)
- **Future R2 Storage Upgrade**:
  1. Enable R2 once in Cloudflare Dashboard.
  2. Run `npx wrangler r2 bucket create quotes-dock-media`.
  3. Add `r2_buckets: [{ binding: "MEDIA_BUCKET", bucket_name: "quotes-dock-media" }]` back to `wrangler.jsonc` and redeploy (`npm run build` + `npx wrangler pages deploy dist --project-name=quotes-dock --branch=main`). Existing D1 fallback photos continue serving automatically via `/api/media/[...key]`.

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
