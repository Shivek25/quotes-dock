# QuotesDock

Preview-First Quote & Job-Proof Page system built for US and UK Mobile Car Detailers on a $0/month fixed Cloudflare stack (Astro + Cloudflare Pages/Workers + Cloudflare D1).

## What Phase 1 Includes

1. **Dynamic Preview & Quote Pages (`/p/[slug]`)**:
   - Mobile-first 1-page site tailored per detailing business.
   - Interactive **60-Second Driveway Quote Calculator** where customers pick Vehicle Size, Detailing Package, and Condition/Add-ons to see an instant price estimate before requesting a quote.
   - Safe **`preview` vs `live` mode**: When a business owner tests their unclaimed preview link, the form saves the test lead in D1, displays an instant **Owner Lead Notification Simulator** modal, and flags the prospect in `/studio`.
2. **3 Pre-Seeded Realistic Demos**:
   - `/p/apex-gloss-austin` (Austin, TX - US `$` / Zip Code)
   - `/p/velvet-foam-charlotte` (Charlotte, NC - US `$` / Zip Code)
   - `/p/cotswold-valet-uk` (Cheltenham, UK - UK `£` / Postcode)
3. **Founder Outreach Studio (`/studio`)**:
   - Add a new detailing prospect in under 60 seconds and auto-generate their `/p/[slug]` page plus 3 personalized outreach drafts (Instagram DM, Facebook Message, Email).
   - **Human Approval Draft Queue**: Review, edit, approve, and copy messages manually (~10/day) with zero automated bulk emailing or scraping.

## Local Setup & Daily Workflow

```powershell
# 1. Install packages
npm install

# 2. Apply local D1 SQLite migrations
npm run db:migrate:local

# 3. Start local dev server (Astro + local Cloudflare D1 binding)
npm run dev
```

Open `http://localhost:4321/` for the overview and demo links, or `http://localhost:4321/studio` to create prospects and manage your outreach queue.

## Deploying to Cloudflare ($0/month Fixed Cost)

1. Create a D1 database in Cloudflare: `npx wrangler d1 create quotes-dock-db` and paste the real `database_id` into `wrangler.jsonc`.
2. Apply migrations to production D1: `npx wrangler d1 migrations apply quotes-dock-db --remote`.
3. Set your production Studio key secret: `npx wrangler pages secret put ADMIN_STUDIO_KEY` (or via the Cloudflare dashboard).
4. Build and deploy: `npm run build` and `npx wrangler pages deploy dist`.
