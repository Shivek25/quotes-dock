import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

export type D1Database = Parameters<typeof drizzle>[0];
import {
  outreachDrafts,
  prospects,
  quoteRequests,
  type ConditionLevel,
  type CountryCode,
  type DetailingAddon,
  type DetailingPackage,
  type JobProofItem,
  type OutreachApprovalStatus,
  type OutreachDraftRow,
  type ParsedProspect,
  type ProspectMode,
  type ProspectRow,
  type QuoteRequestRow,
  type VehicleSizeKey,
} from './schema';
import {
  buildDefaultDetailingConfig,
  buildPackagesForBasePrice,
  INITIAL_SEED_PROSPECTS,
  normalizeInstagramHandle,
  type SeedProspectBundle,
} from './seed-data';

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseProspectRow(row: ProspectRow): ParsedProspect {
  return {
    id: row.id,
    slug: row.slug,
    businessName: row.businessName,
    niche: row.niche,
    city: row.city,
    country: (row.country === 'UK' ? 'UK' : 'US') as CountryCode,
    currencySymbol: row.currencySymbol,
    postalLabel: row.postalLabel,
    serviceArea: row.serviceArea,
    phoneDisplay: row.phoneDisplay,
    instagramHandle: row.instagramHandle,
    ratingScore: row.ratingScore,
    reviewCount: row.reviewCount,
    ratingSource: row.ratingSource,
    tagline: row.tagline,
    heroHeadline: row.heroHeadline,
    heroSubheadline: row.heroSubheadline,
    turnaroundBadge: row.turnaroundBadge,
    packages: safeParseJson<DetailingPackage[]>(row.packagesJson, []),
    addons: safeParseJson<DetailingAddon[]>(row.addonsJson, []),
    gallery: safeParseJson<JobProofItem[]>(row.galleryJson, []),
    trustPoints: safeParseJson<string[]>(row.trustPointsJson, []),
    personalizationNote: row.personalizationNote,
    mode: (row.mode === 'live' ? 'live' : 'preview') as ProspectMode,
    ownerEmail: row.ownerEmail ?? null,
    createdAt: row.createdAt,
  };
}

let bootPromise: Promise<void> | null = null;

async function insertSeedBundle(d1: D1Database, bundle: SeedProspectBundle): Promise<void> {
  const db = drizzle(d1);
  const p = bundle.prospect;

  await db
    .insert(prospects)
    .values({
      id: p.id,
      slug: p.slug,
      businessName: p.businessName,
      niche: p.niche,
      city: p.city,
      country: p.country,
      currencySymbol: p.currencySymbol,
      postalLabel: p.postalLabel,
      serviceArea: p.serviceArea,
      phoneDisplay: p.phoneDisplay,
      instagramHandle: p.instagramHandle,
      ratingScore: p.ratingScore,
      reviewCount: p.reviewCount,
      ratingSource: p.ratingSource,
      tagline: p.tagline,
      heroHeadline: p.heroHeadline,
      heroSubheadline: p.heroSubheadline,
      turnaroundBadge: p.turnaroundBadge,
      packagesJson: JSON.stringify(p.packages),
      addonsJson: JSON.stringify(p.addons),
      galleryJson: JSON.stringify(p.gallery),
      trustPointsJson: JSON.stringify(p.trustPoints),
      personalizationNote: p.personalizationNote,
      mode: p.mode,
      ownerEmail: p.ownerEmail,
      createdAt: p.createdAt,
    })
    .onConflictDoNothing();

  const nowIso = new Date().toISOString();
  for (const draft of bundle.drafts) {
    await db
      .insert(outreachDrafts)
      .values({
        id: draft.id,
        prospectId: p.id,
        slug: p.slug,
        channel: draft.channel,
        recipientHandle: draft.recipientHandle,
        personalizationNote: draft.personalizationNote,
        messageBody: draft.messageBody,
        approvalStatus: draft.approvalStatus,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoNothing();
  }
}

export async function ensureSchemaAndSeed(d1: D1Database): Promise<void> {
  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = (async () => {
    try {
      await d1.batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS prospects (
          id TEXT PRIMARY KEY NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          business_name TEXT NOT NULL,
          niche TEXT NOT NULL DEFAULT 'mobile_detailing',
          city TEXT NOT NULL,
          country TEXT NOT NULL DEFAULT 'US',
          currency_symbol TEXT NOT NULL DEFAULT '$',
          postal_label TEXT NOT NULL DEFAULT 'Zip Code',
          service_area TEXT NOT NULL,
          phone_display TEXT NOT NULL,
          instagram_handle TEXT NOT NULL,
          rating_score TEXT NOT NULL,
          review_count INTEGER NOT NULL,
          rating_source TEXT NOT NULL,
          tagline TEXT NOT NULL,
          hero_headline TEXT NOT NULL,
          hero_subheadline TEXT NOT NULL,
          turnaround_badge TEXT NOT NULL,
          packages_json TEXT NOT NULL,
          addons_json TEXT NOT NULL,
          gallery_json TEXT NOT NULL,
          trust_points_json TEXT NOT NULL,
          personalization_note TEXT NOT NULL,
          mode TEXT NOT NULL DEFAULT 'preview',
          owner_email TEXT,
          created_at TEXT NOT NULL
        )`),
        d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_slug ON prospects (slug)`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS quote_requests (
          id TEXT PRIMARY KEY NOT NULL,
          prospect_id TEXT NOT NULL,
          slug TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          customer_postal TEXT NOT NULL,
          vehicle_size TEXT NOT NULL,
          package_id TEXT NOT NULL,
          package_name TEXT NOT NULL,
          condition_level TEXT NOT NULL,
          addons_selected_json TEXT NOT NULL,
          estimated_min INTEGER NOT NULL,
          estimated_max INTEGER NOT NULL,
          preferred_timing TEXT NOT NULL,
          notes TEXT,
          is_preview_test INTEGER NOT NULL DEFAULT 1,
          ip_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`),
        d1.prepare(`CREATE INDEX IF NOT EXISTS idx_quote_requests_prospect_created ON quote_requests (prospect_id, created_at)`),
        d1.prepare(`CREATE INDEX IF NOT EXISTS idx_quote_requests_ip_created ON quote_requests (ip_hash, created_at)`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS outreach_drafts (
          id TEXT PRIMARY KEY NOT NULL,
          prospect_id TEXT NOT NULL,
          slug TEXT NOT NULL,
          channel TEXT NOT NULL,
          recipient_handle TEXT NOT NULL,
          personalization_note TEXT NOT NULL,
          message_body TEXT NOT NULL,
          approval_status TEXT NOT NULL DEFAULT 'draft',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`),
        d1.prepare(`CREATE INDEX IF NOT EXISTS idx_outreach_drafts_prospect_status ON outreach_drafts (prospect_id, approval_status)`),
      ]);

      const db = drizzle(d1);
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(prospects);
      const existingCount = Number(countResult[0]?.count ?? 0);

      if (existingCount === 0) {
        for (const seedBundle of INITIAL_SEED_PROSPECTS) {
          await insertSeedBundle(d1, seedBundle);
        }
      }
    } catch (err) {
      bootPromise = null;
      throw err;
    }
  })();

  return bootPromise;
}

export async function getProspectBySlug(
  d1: D1Database,
  slug: string
): Promise<ParsedProspect | null> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const rows = await db
    .select()
    .from(prospects)
    .where(eq(prospects.slug, slug))
    .limit(1);

  if (rows.length === 0) return null;
  return parseProspectRow(rows[0]);
}

export async function getProspectById(
  d1: D1Database,
  prospectId: string
): Promise<ParsedProspect | null> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const rows = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);

  if (rows.length === 0) return null;
  return parseProspectRow(rows[0]);
}

export interface ProspectWithStats {
  prospect: ParsedProspect;
  drafts: OutreachDraftRow[];
  recentQuotes: QuoteRequestRow[];
  totalQuotes: number;
  previewTestQuotes: number;
}

export async function listProspectsWithStats(
  d1: D1Database
): Promise<ProspectWithStats[]> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);

  const prospectRows = await db
    .select()
    .from(prospects)
    .orderBy(desc(prospects.createdAt));

  const allDrafts = await db
    .select()
    .from(outreachDrafts)
    .orderBy(desc(outreachDrafts.createdAt));

  const allQuotes = await db
    .select()
    .from(quoteRequests)
    .orderBy(desc(quoteRequests.createdAt));

  return prospectRows.map((row) => {
    const parsed = parseProspectRow(row);
    const scopedDrafts = allDrafts.filter((d) => d.prospectId === parsed.id);
    const scopedQuotes = allQuotes.filter((q) => q.prospectId === parsed.id);
    const previewTestQuotes = scopedQuotes.filter((q) => q.isPreviewTest === 1).length;

    return {
      prospect: parsed,
      drafts: scopedDrafts,
      recentQuotes: scopedQuotes.slice(0, 5),
      totalQuotes: scopedQuotes.length,
      previewTestQuotes,
    };
  });
}

export function calculateServerQuoteEstimate(
  prospect: ParsedProspect,
  input: {
    vehicleSize: VehicleSizeKey;
    packageId: string;
    conditionLevel: ConditionLevel;
    addonsSelected: string[];
  }
): {
  packageObj: DetailingPackage;
  selectedAddons: DetailingAddon[];
  estimatedMin: number;
  estimatedMax: number;
} | null {
  const pkg = prospect.packages.find((item) => item.id === input.packageId);
  if (!pkg) return null;

  const base = pkg.prices[input.vehicleSize];
  const conditionRanges: Record<ConditionLevel, [number, number]> = {
    standard: [0, 20],
    pet_hair: [25, 45],
    heavy_soil: [35, 65],
  };

  const [condMin, condMax] = conditionRanges[input.conditionLevel];
  const selectedAddons = prospect.addons.filter((addon) =>
    input.addonsSelected.includes(addon.id)
  );
  const addonsSum = selectedAddons.reduce((sum, addon) => sum + addon.price, 0);

  return {
    packageObj: pkg,
    selectedAddons,
    estimatedMin: base + condMin + addonsSum,
    estimatedMax: base + condMax + addonsSum,
  };
}

export async function countRecentQuotesByIp(
  d1: D1Database,
  ipHash: string,
  sinceIso: string
): Promise<number> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(quoteRequests)
    .where(and(eq(quoteRequests.ipHash, ipHash), gte(quoteRequests.createdAt, sinceIso)));
  return Number(rows[0]?.count ?? 0);
}

export async function createQuoteRequest(
  d1: D1Database,
  record: {
    id: string;
    prospectId: string;
    slug: string;
    customerName: string;
    customerPhone: string;
    customerPostal: string;
    vehicleSize: VehicleSizeKey;
    packageId: string;
    packageName: string;
    conditionLevel: ConditionLevel;
    addonsSelectedNames: string[];
    estimatedMin: number;
    estimatedMax: number;
    preferredTiming: string;
    notes: string;
    isPreviewTest: boolean;
    ipHash: string;
  }
): Promise<QuoteRequestRow> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const nowIso = new Date().toISOString();

  const values = {
    id: record.id,
    prospectId: record.prospectId,
    slug: record.slug,
    customerName: record.customerName,
    customerPhone: record.customerPhone,
    customerPostal: record.customerPostal,
    vehicleSize: record.vehicleSize,
    packageId: record.packageId,
    packageName: record.packageName,
    conditionLevel: record.conditionLevel,
    addonsSelectedJson: JSON.stringify(record.addonsSelectedNames),
    estimatedMin: record.estimatedMin,
    estimatedMax: record.estimatedMax,
    preferredTiming: record.preferredTiming,
    notes: record.notes || null,
    isPreviewTest: record.isPreviewTest ? 1 : 0,
    ipHash: record.ipHash,
    createdAt: nowIso,
  };

  await db.insert(quoteRequests).values(values);
  return values;
}

export function slugifyBusinessName(name: string, city: string): string {
  const combined = `${name} ${city.split(',')[0] ?? ''}`;
  return combined
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export async function createProspectWithDrafts(
  d1: D1Database,
  input: {
    businessName: string;
    slug?: string;
    city: string;
    country: CountryCode;
    serviceArea: string;
    phoneDisplay: string;
    instagramHandle: string;
    ratingScore: string;
    reviewCount: number;
    personalizationNote: string;
    baseSedanPrice?: number;
  }
): Promise<ProspectWithStats> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);

  const baseSlug = input.slug || slugifyBusinessName(input.businessName, input.city);
  let candidateSlug = baseSlug || `detailer-${Date.now()}`;

  const existing = await db
    .select({ id: prospects.id })
    .from(prospects)
    .where(eq(prospects.slug, candidateSlug))
    .limit(1);

  if (existing.length > 0) {
    candidateSlug = `${candidateSlug}-${Math.floor(100 + Math.random() * 900)}`;
  }

  const prospectId = `pros_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const bundle = buildDefaultDetailingConfig({
    id: prospectId,
    slug: candidateSlug,
    businessName: input.businessName,
    city: input.city,
    country: input.country,
    serviceArea: input.serviceArea,
    phoneDisplay: input.phoneDisplay.trim() || 'Direct Text / DM',
    instagramHandle: normalizeInstagramHandle(input.instagramHandle),
    ratingScore: input.ratingScore,
    reviewCount: input.reviewCount,
    personalizationNote: input.personalizationNote,
    baseSedanPrice: input.baseSedanPrice,
  });

  await insertSeedBundle(d1, bundle);

  const created = await getProspectById(d1, prospectId);
  const drafts = await db
    .select()
    .from(outreachDrafts)
    .where(eq(outreachDrafts.prospectId, prospectId));

  if (!created) {
    throw new Error('Failed to load created prospect');
  }

  return {
    prospect: created,
    drafts,
    recentQuotes: [],
    totalQuotes: 0,
    previewTestQuotes: 0,
  };
}

export async function updateOutreachDraft(
  d1: D1Database,
  input: {
    id: string;
    prospectId: string;
    messageBody?: string;
    approvalStatus?: OutreachApprovalStatus;
  }
): Promise<OutreachDraftRow | null> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const nowIso = new Date().toISOString();

  const existing = await db
    .select()
    .from(outreachDrafts)
    .where(
      and(
        eq(outreachDrafts.id, input.id),
        eq(outreachDrafts.prospectId, input.prospectId)
      )
    )
    .limit(1);

  if (existing.length === 0) return null;

  const updatedValues = {
    messageBody: input.messageBody ?? existing[0].messageBody,
    approvalStatus: input.approvalStatus ?? existing[0].approvalStatus,
    updatedAt: nowIso,
  };

  await db
    .update(outreachDrafts)
    .set(updatedValues)
    .where(
      and(
        eq(outreachDrafts.id, input.id),
        eq(outreachDrafts.prospectId, input.prospectId)
      )
    );

  return {
    ...existing[0],
    ...updatedValues,
  };
}

export async function updateProspectMode(
  d1: D1Database,
  input: {
    prospectId: string;
    mode?: ProspectMode;
    ownerEmail?: string;
    phoneDisplay?: string;
    serviceArea?: string;
    baseSedanPrice?: number;
    photoUrls?: string[];
  }
): Promise<ParsedProspect | null> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);

  const existing = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1);

  if (existing.length === 0) return null;
  const row = existing[0];
  const country = (row.country === 'UK' ? 'UK' : 'US') as CountryCode;

  let nextPackagesJson = row.packagesJson;
  if (input.baseSedanPrice !== undefined) {
    nextPackagesJson = JSON.stringify(buildPackagesForBasePrice(input.baseSedanPrice, country));
  }

  let nextGalleryJson = row.galleryJson;
  if (input.photoUrls !== undefined) {
    const parsedGallery = safeParseJson<JobProofItem[]>(row.galleryJson, []);
    const updatedGallery = parsedGallery.map((item, idx) => {
      const cleaned = input.photoUrls?.[idx]?.trim() || '';
      return {
        ...item,
        imageUrl: cleaned || undefined,
      };
    });
    nextGalleryJson = JSON.stringify(updatedGallery);
  }

  const nextPhone =
    input.phoneDisplay !== undefined
      ? input.phoneDisplay.trim() || 'Direct Text / DM'
      : row.phoneDisplay;

  await db
    .update(prospects)
    .set({
      mode: input.mode ?? row.mode,
      ownerEmail:
        input.ownerEmail !== undefined
          ? input.ownerEmail.trim() || null
          : row.ownerEmail,
      phoneDisplay: nextPhone,
      serviceArea:
        input.serviceArea !== undefined && input.serviceArea.trim()
          ? input.serviceArea.trim()
          : row.serviceArea,
      packagesJson: nextPackagesJson,
      galleryJson: nextGalleryJson,
    })
    .where(eq(prospects.id, input.prospectId));

  return getProspectById(d1, input.prospectId);
}

export async function deleteProspectById(
  d1: D1Database,
  prospectId: string
): Promise<boolean> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);

  const existing = await db
    .select({ id: prospects.id })
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);

  if (existing.length === 0) return false;

  await d1.batch([
    d1.prepare('DELETE FROM quote_requests WHERE prospect_id = ?').bind(prospectId),
    d1.prepare('DELETE FROM outreach_drafts WHERE prospect_id = ?').bind(prospectId),
    d1.prepare('DELETE FROM prospects WHERE id = ?').bind(prospectId),
  ]);

  return true;
}
