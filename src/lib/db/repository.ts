import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

export type D1Database = Parameters<typeof drizzle>[0];
import {
  inboundInquiries,
  leadCandidates,
  mediaAssets,
  outreachDrafts,
  prospects,
  quoteRequests,
  type AvailabilityStatus,
  type CandidateStatus,
  type ConditionLevel,
  type CountryCode,
  type DetailingAddon,
  type DetailingPackage,
  type InboundInquiryRow,
  type InquiryStatus,
  type InquiryType,
  type JobProofItem,
  type LeadCandidateRow,
  type LeadStatus,
  type MediaAssetRow,
  type OutreachApprovalStatus,
  type OutreachDraftRow,
  type ParsedLeadCandidate,
  type ParsedProspect,
  type PlanTier,
  type ProspectMode,
  type ProspectRow,
  type QuoteDeliveryStatus,
  type QuoteRequestRow,
  type VehicleSizeKey,
} from './schema';

export class ProspectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProspectValidationError';
  }
}
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

export function generateOwnerPortalToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function badgeForAvailability(status: AvailabilityStatus): string {
  if (status === 'limited') return 'Limited Driveway Slots This Week';
  if (status === 'booked_out') return 'Booked This Week - Next-Week Waitlist Open';
  return 'Same-Week Driveway Slots Open';
}

export function parseProspectRow(row: ProspectRow): ParsedProspect {
  const availability: AvailabilityStatus =
    row.availabilityStatus === 'limited'
      ? 'limited'
      : row.availabilityStatus === 'booked_out'
        ? 'booked_out'
        : 'open';
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
    ownerPortalToken: row.ownerPortalToken ?? null,
    webhookUrl: row.webhookUrl ?? null,
    availabilityStatus: availability,
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
      ownerPortalToken: generateOwnerPortalToken(),
      webhookUrl: null,
      availabilityStatus: 'open',
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

async function createFallbackSchema(d1: D1Database): Promise<void> {
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
      owner_portal_token TEXT,
      webhook_url TEXT,
      availability_status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_slug ON prospects (slug)`),
    d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_owner_portal_token ON prospects (owner_portal_token)`),
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
      lead_status TEXT NOT NULL DEFAULT 'new',
      delivery_status TEXT NOT NULL DEFAULT 'not_applicable',
      delivery_error TEXT,
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
    d1.prepare(`CREATE TABLE IF NOT EXISTS lead_candidates (
      id TEXT PRIMARY KEY NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      business_name TEXT NOT NULL,
      city TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'US',
      service_area TEXT NOT NULL,
      phone_display TEXT NOT NULL DEFAULT '',
      instagram_handle TEXT NOT NULL,
      website_url TEXT NOT NULL DEFAULT '',
      rating_score TEXT NOT NULL DEFAULT '4.9',
      review_count INTEGER NOT NULL DEFAULT 35,
      fit_score INTEGER NOT NULL DEFAULT 75,
      fit_signals_json TEXT NOT NULL DEFAULT '[]',
      has_instant_quote INTEGER NOT NULL DEFAULT 0,
      personalization_note TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      scouted_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_candidates_dedupe ON lead_candidates (dedupe_key)`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS inbound_inquiries (
      id TEXT PRIMARY KEY NOT NULL,
      inquiry_type TEXT NOT NULL DEFAULT 'free_preview_request',
      prospect_id TEXT,
      slug TEXT,
      business_name TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      contact_info TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT 'US',
      plan_tier TEXT NOT NULL DEFAULT 'founding',
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      ip_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE INDEX IF NOT EXISTS idx_inbound_inquiries_status_created ON inbound_inquiries (status, created_at)`),
    d1.prepare(`CREATE INDEX IF NOT EXISTS idx_inbound_inquiries_ip_created ON inbound_inquiries (ip_hash, created_at)`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS media_assets (
      key TEXT PRIMARY KEY NOT NULL,
      prospect_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE INDEX IF NOT EXISTS idx_media_assets_prospect ON media_assets (prospect_id)`),
  ]);
}

export async function ensureSchemaAndSeed(d1: D1Database): Promise<void> {
  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = (async () => {
    try {
      const db = drizzle(d1);
      let existingCount = 0;

      try {
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(prospects);
        existingCount = Number(countResult[0]?.count ?? 0);
      } catch (queryErr) {
        const msg = queryErr instanceof Error ? queryErr.message.toLowerCase() : String(queryErr).toLowerCase();
        if (!msg.includes('no such table')) {
          throw queryErr;
        }
        // Fallback only for unmigrated local environments; production relies on drizzle/migrations/*.sql
        await createFallbackSchema(d1);
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(prospects);
        existingCount = Number(countResult[0]?.count ?? 0);
      }

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

  const [prospectRows, allDrafts, recentQuoteRows, quoteCountRows] = await Promise.all([
    db.select().from(prospects).orderBy(desc(prospects.createdAt)).limit(200),
    db.select().from(outreachDrafts).orderBy(desc(outreachDrafts.createdAt)).limit(600),
    db.select().from(quoteRequests).orderBy(desc(quoteRequests.createdAt)).limit(400),
    db
      .select({
        prospectId: quoteRequests.prospectId,
        totalQuotes: sql<number>`count(*)`,
        previewTestQuotes: sql<number>`sum(case when ${quoteRequests.isPreviewTest} = 1 then 1 else 0 end)`,
      })
      .from(quoteRequests)
      .groupBy(quoteRequests.prospectId),
  ]);

  const draftsByProspect = new Map<string, OutreachDraftRow[]>();
  for (const draft of allDrafts) {
    const list = draftsByProspect.get(draft.prospectId);
    if (list) {
      list.push(draft);
    } else {
      draftsByProspect.set(draft.prospectId, [draft]);
    }
  }

  const recentQuotesByProspect = new Map<string, QuoteRequestRow[]>();
  for (const quote of recentQuoteRows) {
    const list = recentQuotesByProspect.get(quote.prospectId);
    if (list) {
      if (list.length < 5) list.push(quote);
    } else {
      recentQuotesByProspect.set(quote.prospectId, [quote]);
    }
  }

  const countsByProspect = new Map<string, { total: number; preview: number }>();
  for (const agg of quoteCountRows) {
    countsByProspect.set(agg.prospectId, {
      total: Number(agg.totalQuotes ?? 0),
      preview: Number(agg.previewTestQuotes ?? 0),
    });
  }

  return prospectRows.map((row) => {
    const parsed = parseProspectRow(row);
    const counts = countsByProspect.get(parsed.id);

    return {
      prospect: parsed,
      drafts: draftsByProspect.get(parsed.id) ?? [],
      recentQuotes: recentQuotesByProspect.get(parsed.id) ?? [],
      totalQuotes: counts?.total ?? 0,
      previewTestQuotes: counts?.preview ?? 0,
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
    deliveryStatus?: QuoteDeliveryStatus;
    deliveryError?: string | null;
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
    leadStatus: 'new',
    deliveryStatus:
      record.deliveryStatus ?? (record.isPreviewTest ? 'preview_only' : 'not_applicable'),
    deliveryError: record.deliveryError ?? null,
    ipHash: record.ipHash,
    createdAt: nowIso,
  };

  await db.insert(quoteRequests).values(values);
  return values;
}

export async function updateQuoteDeliveryStatus(
  d1: D1Database,
  quoteId: string,
  deliveryStatus: QuoteDeliveryStatus,
  deliveryError?: string | null
): Promise<void> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  await db
    .update(quoteRequests)
    .set({
      deliveryStatus,
      deliveryError: deliveryError ? deliveryError.slice(0, 300) : null,
    })
    .where(eq(quoteRequests.id, quoteId));
}

export function slugifyBusinessName(name: string, city: string): string {
  const cleanSegment = (val: string): string =>
    val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const nameSlug = cleanSegment(name);
  const primaryCity = city.split(',')[0] ?? '';
  const citySlug = cleanSegment(primaryCity);

  let combined = nameSlug;
  if (citySlug) {
    const nameAlreadyHasCity =
      nameSlug === citySlug ||
      nameSlug.endsWith(`-${citySlug}`) ||
      nameSlug.startsWith(`${citySlug}-`) ||
      nameSlug.includes(`-${citySlug}-`);
    if (!nameAlreadyHasCity) {
      combined = nameSlug ? `${nameSlug}-${citySlug}` : citySlug;
    }
  }

  return combined.slice(0, 64).replace(/-+$/g, '');
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
    webhookUrl?: string;
    availabilityStatus?: AvailabilityStatus;
    rotatePortalToken?: boolean;
    phoneDisplay?: string;
    serviceArea?: string;
    baseSedanPrice?: number;
    photoUrls?: string[];
    galleryItems?: Array<{
      id?: string;
      title: string;
      vehicleLabel: string;
      servicePerformed: string;
      resultSummary?: string;
      beforeNote?: string;
      afterNote?: string;
      imageUrl?: string;
      beforeImageUrl?: string;
    }>;
    trustPoints?: string[];
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
  const parsedGallery = safeParseJson<JobProofItem[]>(row.galleryJson, []);
  if (input.galleryItems !== undefined && input.galleryItems.length > 0) {
    const updatedGallery: JobProofItem[] = input.galleryItems.slice(0, 6).map((item, idx) => {
      const prev = parsedGallery[idx];
      const cleanedImg = item.imageUrl?.trim() || '';
      const cleanedBeforeImg = item.beforeImageUrl?.trim() || '';
      return {
        id: item.id || prev?.id || `job-${idx + 1}`,
        title: item.title.trim(),
        vehicleLabel: item.vehicleLabel.trim(),
        servicePerformed: item.servicePerformed.trim(),
        resultSummary: item.resultSummary?.trim() || prev?.resultSummary || '',
        beforeNote: item.beforeNote?.trim() || '',
        afterNote: item.afterNote?.trim() || '',
        accentHex: prev?.accentHex || '#0369A1',
        imageUrl: cleanedImg || undefined,
        beforeImageUrl: cleanedBeforeImg || undefined,
      };
    });
    nextGalleryJson = JSON.stringify(updatedGallery);
  } else if (input.photoUrls !== undefined) {
    const updatedGallery = parsedGallery.map((item, idx) => {
      const cleaned = input.photoUrls?.[idx]?.trim() || '';
      return {
        ...item,
        imageUrl: cleaned || undefined,
      };
    });
    nextGalleryJson = JSON.stringify(updatedGallery);
  }

  let nextTrustPointsJson = row.trustPointsJson;
  if (input.trustPoints !== undefined) {
    const cleanedPoints = input.trustPoints
      .map((pt) => pt.trim())
      .filter((pt) => pt.length >= 2)
      .slice(0, 6);
    if (cleanedPoints.length > 0) {
      nextTrustPointsJson = JSON.stringify(cleanedPoints);
    }
  }

  const nextPhone =
    input.phoneDisplay !== undefined
      ? input.phoneDisplay.trim() || 'Direct Text / DM'
      : row.phoneDisplay;

  const nextMode = input.mode ?? (row.mode === 'live' ? 'live' : 'preview');
  const nextOwnerEmail =
    input.ownerEmail !== undefined
      ? input.ownerEmail.trim() || null
      : row.ownerEmail;
  const nextWebhookUrl =
    input.webhookUrl !== undefined
      ? input.webhookUrl.trim() || null
      : row.webhookUrl;
  const nextAvailability: AvailabilityStatus =
    input.availabilityStatus ??
    (row.availabilityStatus === 'limited'
      ? 'limited'
      : row.availabilityStatus === 'booked_out'
        ? 'booked_out'
        : 'open');
  const nextTurnaroundBadge =
    input.availabilityStatus !== undefined
      ? badgeForAvailability(nextAvailability)
      : row.turnaroundBadge;
  const nextPortalToken =
    input.rotatePortalToken || !row.ownerPortalToken
      ? generateOwnerPortalToken()
      : row.ownerPortalToken;

  if (nextMode === 'live' && !nextOwnerEmail && !nextWebhookUrl) {
    throw new ProspectValidationError(
      'Add an Owner Alert Email or Instant Webhook URL before activating Live Mode so real customer leads are never lost.'
    );
  }

  await db
    .update(prospects)
    .set({
      mode: nextMode,
      ownerEmail: nextOwnerEmail,
      webhookUrl: nextWebhookUrl,
      ownerPortalToken: nextPortalToken,
      availabilityStatus: nextAvailability,
      turnaroundBadge: nextTurnaroundBadge,
      phoneDisplay: nextPhone,
      serviceArea:
        input.serviceArea !== undefined && input.serviceArea.trim()
          ? input.serviceArea.trim()
          : row.serviceArea,
      packagesJson: nextPackagesJson,
      galleryJson: nextGalleryJson,
      trustPointsJson: nextTrustPointsJson,
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
    d1.prepare('DELETE FROM media_assets WHERE prospect_id = ?').bind(prospectId),
    d1.prepare('DELETE FROM prospects WHERE id = ?').bind(prospectId),
  ]);

  return true;
}

export function buildCandidateDedupeKey(businessName: string, city: string): string {
  const cleanName = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const primaryCity = (city.split(',')[0] ?? city)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return `${cleanName}__${primaryCity}`.slice(0, 96);
}

export function parseLeadCandidateRow(row: LeadCandidateRow): ParsedLeadCandidate {
  const status: CandidateStatus =
    row.status === 'promoted'
      ? 'promoted'
      : row.status === 'dismissed'
        ? 'dismissed'
        : 'new';

  return {
    id: row.id,
    dedupeKey: row.dedupeKey,
    businessName: row.businessName,
    city: row.city,
    country: (row.country === 'UK' ? 'UK' : 'US') as CountryCode,
    serviceArea: row.serviceArea,
    phoneDisplay: row.phoneDisplay,
    instagramHandle: row.instagramHandle,
    websiteUrl: row.websiteUrl,
    ratingScore: row.ratingScore,
    reviewCount: row.reviewCount,
    fitScore: row.fitScore,
    fitSignals: safeParseJson<string[]>(row.fitSignalsJson, []),
    hasInstantQuote: row.hasInstantQuote === 1,
    personalizationNote: row.personalizationNote,
    status,
    scoutedAt: row.scoutedAt,
  };
}

export interface UpsertCandidateInput {
  businessName: string;
  city: string;
  country: CountryCode;
  serviceArea: string;
  phoneDisplay: string;
  instagramHandle: string;
  websiteUrl: string;
  ratingScore: string;
  reviewCount: number;
  fitScore: number;
  fitSignals: string[];
  hasInstantQuote: boolean;
  personalizationNote: string;
}

export async function listLeadCandidates(
  d1: D1Database
): Promise<ParsedLeadCandidate[]> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const rows = await db
    .select()
    .from(leadCandidates)
    .where(eq(leadCandidates.status, 'new'))
    .orderBy(desc(leadCandidates.fitScore), desc(leadCandidates.scoutedAt))
    .limit(25);

  return rows.map(parseLeadCandidateRow);
}

export async function upsertLeadCandidatesBatch(
  d1: D1Database,
  items: UpsertCandidateInput[],
  options?: { replaceCity?: boolean }
): Promise<{ count: number }> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const nowIso = new Date().toISOString();

  // Only wipe existing 'new' rows for these cities when explicitly requested via --replace-city
  if (options?.replaceCity) {
    const cities = Array.from(
      new Set(items.map((item) => item.city.trim()).filter(Boolean))
    );
    for (const city of cities) {
      await d1
        .prepare("DELETE FROM lead_candidates WHERE lower(city) = lower(?) AND status = 'new'")
        .bind(city)
        .run();
    }
  }

  for (const item of items) {
    const dedupeKey = buildCandidateDedupeKey(item.businessName, item.city);
    const id = `cand_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const normalizedHandle = normalizeInstagramHandle(item.instagramHandle);

    await db
      .insert(leadCandidates)
      .values({
        id,
        dedupeKey,
        businessName: item.businessName,
        city: item.city,
        country: item.country,
        serviceArea: item.serviceArea,
        phoneDisplay: item.phoneDisplay,
        instagramHandle: normalizedHandle,
        websiteUrl: item.websiteUrl,
        ratingScore: item.ratingScore,
        reviewCount: item.reviewCount,
        fitScore: item.fitScore,
        fitSignalsJson: JSON.stringify(item.fitSignals),
        hasInstantQuote: item.hasInstantQuote ? 1 : 0,
        personalizationNote: item.personalizationNote,
        status: 'new',
        scoutedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: leadCandidates.dedupeKey,
        set: {
          businessName: item.businessName,
          city: item.city,
          country: item.country,
          serviceArea: item.serviceArea,
          phoneDisplay: item.phoneDisplay,
          instagramHandle: normalizedHandle,
          websiteUrl: item.websiteUrl,
          ratingScore: item.ratingScore,
          reviewCount: item.reviewCount,
          fitScore: item.fitScore,
          fitSignalsJson: JSON.stringify(item.fitSignals),
          hasInstantQuote: item.hasInstantQuote ? 1 : 0,
          personalizationNote: item.personalizationNote,
          scoutedAt: nowIso,
          status: sql`CASE WHEN ${leadCandidates.status} = 'promoted' THEN 'promoted' ELSE 'new' END`,
        },
      });
  }

  return { count: items.length };
}

export async function updateLeadCandidateStatus(
  d1: D1Database,
  id: string,
  status: CandidateStatus
): Promise<boolean> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);

  const existing = await db
    .select({ id: leadCandidates.id })
    .from(leadCandidates)
    .where(eq(leadCandidates.id, id))
    .limit(1);

  if (existing.length === 0) return false;

  await db
    .update(leadCandidates)
    .set({ status })
    .where(eq(leadCandidates.id, id));

  return true;
}

export async function countRecentInquiriesByIp(
  d1: D1Database,
  ipHash: string,
  sinceIso: string
): Promise<number> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(inboundInquiries)
    .where(
      and(
        eq(inboundInquiries.ipHash, ipHash),
        gte(inboundInquiries.createdAt, sinceIso)
      )
    );
  return Number(rows[0]?.count ?? 0);
}

export async function createInboundInquiry(
  d1: D1Database,
  record: {
    id: string;
    inquiryType: InquiryType;
    prospectId?: string | null;
    slug?: string | null;
    businessName: string;
    ownerName: string;
    contactInfo: string;
    city: string;
    country: CountryCode;
    planTier: PlanTier;
    notes: string;
    ipHash: string;
  }
): Promise<InboundInquiryRow> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const nowIso = new Date().toISOString();

  const values: InboundInquiryRow = {
    id: record.id,
    inquiryType: record.inquiryType,
    prospectId: record.prospectId || null,
    slug: record.slug || null,
    businessName: record.businessName,
    ownerName: record.ownerName,
    contactInfo: record.contactInfo,
    city: record.city,
    country: record.country,
    planTier: record.planTier,
    notes: record.notes || null,
    status: 'new',
    ipHash: record.ipHash,
    createdAt: nowIso,
  };

  await db.insert(inboundInquiries).values(values);
  return values;
}

export async function listInboundInquiries(
  d1: D1Database
): Promise<InboundInquiryRow[]> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  return db
    .select()
    .from(inboundInquiries)
    .orderBy(desc(inboundInquiries.createdAt))
    .limit(50);
}

export async function updateInboundInquiryStatus(
  d1: D1Database,
  id: string,
  status: InquiryStatus
): Promise<boolean> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const existing = await db
    .select({ id: inboundInquiries.id })
    .from(inboundInquiries)
    .where(eq(inboundInquiries.id, id))
    .limit(1);
  if (existing.length === 0) return false;

  await db
    .update(inboundInquiries)
    .set({ status })
    .where(eq(inboundInquiries.id, id));
  return true;
}

export async function listExistingProspectSummaries(
  d1: D1Database
): Promise<Array<{ id: string; slug: string; businessName: string; city: string; phoneDisplay: string }>> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  return db
    .select({
      id: prospects.id,
      slug: prospects.slug,
      businessName: prospects.businessName,
      city: prospects.city,
      phoneDisplay: prospects.phoneDisplay,
    })
    .from(prospects)
    .limit(500);
}

export async function getProspectByOwnerToken(
  d1: D1Database,
  token: string
): Promise<ParsedProspect | null> {
  await ensureSchemaAndSeed(d1);
  const clean = token.trim();
  if (!clean || clean.length < 32) return null;
  const db = drizzle(d1);
  const rows = await db
    .select()
    .from(prospects)
    .where(eq(prospects.ownerPortalToken, clean))
    .limit(1);
  if (rows.length === 0) return null;
  return parseProspectRow(rows[0]);
}

export async function listQuotesForProspect(
  d1: D1Database,
  prospectId: string,
  limit = 100
): Promise<QuoteRequestRow[]> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  return db
    .select()
    .from(quoteRequests)
    .where(eq(quoteRequests.prospectId, prospectId))
    .orderBy(desc(quoteRequests.createdAt))
    .limit(limit);
}

export async function updateQuoteLeadStatusForProspect(
  d1: D1Database,
  input: { quoteId: string; prospectId: string; leadStatus: LeadStatus }
): Promise<boolean> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const existing = await db
    .select({ id: quoteRequests.id })
    .from(quoteRequests)
    .where(
      and(
        eq(quoteRequests.id, input.quoteId),
        eq(quoteRequests.prospectId, input.prospectId)
      )
    )
    .limit(1);

  if (existing.length === 0) return false;

  await db
    .update(quoteRequests)
    .set({ leadStatus: input.leadStatus })
    .where(
      and(
        eq(quoteRequests.id, input.quoteId),
        eq(quoteRequests.prospectId, input.prospectId)
      )
    );
  return true;
}

export async function updateOwnerSelfSettings(
  d1: D1Database,
  input: {
    prospectId: string;
    availabilityStatus: AvailabilityStatus;
    baseSedanPrice?: number;
    phoneDisplay?: string;
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
    nextPackagesJson = JSON.stringify(
      buildPackagesForBasePrice(input.baseSedanPrice, country)
    );
  }

  const nextPhone =
    input.phoneDisplay !== undefined
      ? input.phoneDisplay.trim() || 'Direct Text / DM'
      : row.phoneDisplay;

  await db
    .update(prospects)
    .set({
      availabilityStatus: input.availabilityStatus,
      turnaroundBadge: badgeForAvailability(input.availabilityStatus),
      packagesJson: nextPackagesJson,
      phoneDisplay: nextPhone,
    })
    .where(eq(prospects.id, input.prospectId));

  return getProspectById(d1, input.prospectId);
}

export async function saveMediaAssetFallback(
  d1: D1Database,
  record: {
    key: string;
    prospectId: string;
    contentType: string;
    dataBase64: string;
    sizeBytes: number;
  }
): Promise<void> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  await db
    .insert(mediaAssets)
    .values({
      key: record.key,
      prospectId: record.prospectId,
      contentType: record.contentType,
      dataBase64: record.dataBase64,
      sizeBytes: record.sizeBytes,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
}

export async function getMediaAssetFallback(
  d1: D1Database,
  key: string
): Promise<MediaAssetRow | null> {
  await ensureSchemaAndSeed(d1);
  const db = drizzle(d1);
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.key, key))
    .limit(1);
  return rows[0] ?? null;
}
