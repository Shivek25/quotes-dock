import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import { buildCandidateDedupeKey } from '../src/lib/db/repository';
import type { CountryCode } from '../src/lib/db/schema';
import { normalizeInstagramHandle } from '../src/lib/db/seed-data';

interface CliOptions {
  city: string;
  country: CountryCode;
  limit: number;
}

interface SerperPlace {
  title?: string;
  address?: string;
  rating?: number;
  ratingCount?: number;
  reviews?: number;
  phoneNumber?: string;
  website?: string;
  category?: string;
}

interface SerperOrganic {
  title?: string;
  link?: string;
  snippet?: string;
}

interface RawDiscoveredLead {
  businessName: string;
  city: string;
  country: CountryCode;
  websiteUrl: string;
  phoneDisplay: string;
  ratingScore: string;
  reviewCount: number;
  snippet: string;
  source: 'places' | 'organic';
}

interface InspectedCandidate {
  index: number;
  businessName: string;
  city: string;
  country: CountryCode;
  serviceArea: string;
  phoneDisplay: string;
  instagramHandle: string;
  websiteUrl: string;
  ratingScore: string;
  reviewCount: number;
  baseFitScore: number;
  fitSignals: string[];
  hasInstantQuote: boolean;
  servicesObserved: string[];
  personalizationNote: string;
}

interface FinalCandidate {
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

const UK_CITY_HINTS = [
  'uk',
  'united kingdom',
  'england',
  'scotland',
  'wales',
  'london',
  'gloucester',
  'cheltenham',
  'manchester',
  'birmingham',
  'bristol',
  'leeds',
  'liverpool',
  'sheffield',
  'edinburgh',
  'glasgow',
  'cardiff',
  'oxford',
  'cambridge',
  'bath',
  'york',
  'reading',
  'brighton',
  'nottingham',
];

const DIRECTORY_DOMAINS = [
  'yelp.',
  'yell.',
  'checkatrade.',
  'bark.com',
  'thumbtack.',
  'reddit.',
  'nextdoor.',
  'autotrader.',
  'groupon.',
  'yellowpages.',
  'trustpilot.',
  'angi.com',
  'bbb.org',
  'mapquest.com',
  'tripadvisor.',
  'manta.com',
  'chamberofcommerce.',
  'foursquare.',
  'cylex',
  'thomsonlocal.',
  'freeindex.',
];

const EXCLUDED_SAAS_MARKERS = [
  'urable.com',
  'orbisx',
  'getjobber.com',
  'calendly.com',
  'squareup.com/appointments',
  'booksy.com',
  'fieldd.co',
];

const IGNORED_SOCIAL_SEGMENTS = new Set([
  'p',
  'reel',
  'reels',
  'explore',
  'stories',
  'accounts',
  'about',
  'login',
  'signup',
  'sharer',
  'share',
  'share.php',
  'groups',
  'pages',
  'events',
  'watch',
  'photo',
  'plugins',
  'tr',
  'dialog',
  'intent',
  'hashtag',
  'directory',
]);

function stripEmDashes(value: string): string {
  return value.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
}

function loadLocalEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let val = trimmed.slice(eqIndex + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function detectCountry(city: string, explicitCountry?: string): CountryCode {
  if (explicitCountry) {
    const upper = explicitCountry.trim().toUpperCase();
    if (upper === 'UK' || upper === 'GB') return 'UK';
    if (upper === 'US' || upper === 'USA') return 'US';
  }
  const lower = city.toLowerCase();
  if (UK_CITY_HINTS.some((hint) => lower.includes(hint))) {
    return 'UK';
  }
  return 'US';
}

function parseCliArgs(argv: string[]): CliOptions {
  let city = '';
  let explicitCountry: string | undefined;
  let limit = 5;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--city' && argv[i + 1]) {
      city = argv[i + 1].trim();
      i += 1;
    } else if (arg.startsWith('--city=')) {
      city = arg.slice('--city='.length).trim();
    } else if (arg === '--country' && argv[i + 1]) {
      explicitCountry = argv[i + 1].trim();
      i += 1;
    } else if (arg.startsWith('--country=')) {
      explicitCountry = arg.slice('--country='.length).trim();
    } else if (arg === '--limit' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (!Number.isNaN(parsed)) limit = parsed;
      i += 1;
    } else if (arg.startsWith('--limit=')) {
      const parsed = Number(arg.slice('--limit='.length));
      if (!Number.isNaN(parsed)) limit = parsed;
    } else if (!arg.startsWith('--') && !city) {
      city = arg.trim();
    }
  }

  if (!city) {
    console.error(
      'Usage: npm run scout -- --city "Austin, TX" [--country US|UK] [--limit 5]'
    );
    process.exit(1);
  }

  return {
    city: stripEmDashes(city),
    country: detectCountry(city, explicitCountry),
    limit: Math.max(1, Math.min(10, Math.round(limit))),
  };
}

function normalizeNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isDirectoryUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return DIRECTORY_DOMAINS.some((domain) => lower.includes(domain));
}

function isSocialOrLinktreeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('instagram.com') ||
    lower.includes('instagr.am') ||
    lower.includes('linktr.ee') ||
    lower.includes('facebook.com') ||
    lower.includes('fb.com')
  );
}

function extractSocialHandleFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      !host.includes('instagram.com') &&
      !host.includes('instagr.am') &&
      !host.includes('facebook.com') &&
      !host.includes('fb.com')
    ) {
      return null;
    }
    const parts = parsed.pathname
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);
    const first = parts[0];
    if (!first || IGNORED_SOCIAL_SEGMENTS.has(first.toLowerCase())) {
      return null;
    }
    if (first.toLowerCase().endsWith('.php')) return null;
    return normalizeInstagramHandle(first);
  } catch {
    return null;
  }
}

function cleanBusinessSlugHandle(businessName: string): string {
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 26);
  return `@${slug || 'detailer'}`;
}

function cleanOrgBusinessName(rawTitle: string): string {
  const withoutSite = rawTitle
    .split('|')[0]
    .split(' - ')[0]
    .replace(/\(@[^)]+\)/g, '')
    .replace(/Instagram photos and videos/gi, '')
    .replace(/on Instagram/gi, '')
    .trim();
  return stripEmDashes(withoutSite).slice(0, 90);
}

async function fetchSerperJson<T>(
  endpoint: 'places' | 'search',
  apiKey: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`https://google.serper.dev/${endpoint}`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Serper /${endpoint} failed with HTTP ${response.status}: ${text.slice(0, 200)}`
    );
  }

  return (await response.json()) as T;
}

async function discoverCandidates(
  options: CliOptions,
  serperApiKey: string
): Promise<{
  leads: RawDiscoveredLead[];
  organicIgHandles: Array<{ nameTokens: string[]; handle: string }>;
}> {
  const gl = options.country === 'UK' ? 'gb' : 'us';
  const placesQuery =
    options.country === 'UK'
      ? `mobile car valeting detailing ${options.city}`
      : `mobile car detailing ${options.city}`;
  const searchQuery =
    options.country === 'UK'
      ? `mobile car valeting ${options.city} instagram quote`
      : `mobile car detailing ${options.city} instagram quote`;

  console.log(
    `[Stage 1] Querying Serper (${options.country}) for "${options.city}"...`
  );

  const [placesData, searchData] = await Promise.all([
    fetchSerperJson<{ places?: SerperPlace[] }>('places', serperApiKey, {
      q: placesQuery,
      gl,
      num: 15,
    }),
    fetchSerperJson<{ organic?: SerperOrganic[] }>('search', serperApiKey, {
      q: searchQuery,
      gl,
      num: 15,
    }).catch((err) => {
      console.warn(
        `[Stage 1 Warning] Serper /search skipped (${err instanceof Error ? err.message : String(err)}). Continuing with /places results.`
      );
      return { organic: [] as SerperOrganic[] };
    }),
  ]);

  const seen = new Map<string, RawDiscoveredLead>();
  const organicIgHandles: Array<{ nameTokens: string[]; handle: string }> = [];

  for (const place of placesData.places ?? []) {
    const title = stripEmDashes(place.title || '');
    if (!title || title.length < 3) continue;
    const website = (place.website || '').trim();
    if (website && isDirectoryUrl(website)) continue;

    const reviewCount = Number(place.ratingCount ?? place.reviews ?? 0) || 12;
    if (reviewCount > 180) continue;

    const key = normalizeNameKey(title);
    if (!key || seen.has(key)) continue;

    seen.set(key, {
      businessName: title,
      city: options.city,
      country: options.country,
      websiteUrl: website,
      phoneDisplay: stripEmDashes(place.phoneNumber || ''),
      ratingScore: place.rating ? Number(place.rating).toFixed(1) : '4.9',
      reviewCount,
      snippet: stripEmDashes(
        [place.category, place.address].filter(Boolean).join(', ')
      ),
      source: 'places',
    });
  }

  for (const org of searchData.organic ?? []) {
    const link = (org.link || '').trim();
    if (!link || isDirectoryUrl(link)) continue;

    const handleFromUrl = extractSocialHandleFromUrl(link);
    const title = cleanOrgBusinessName(org.title || '');
    if (handleFromUrl) {
      const tokens = title
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3);
      organicIgHandles.push({ nameTokens: tokens, handle: handleFromUrl });
    }

    if (!title || title.length < 3) continue;
    const lowerTitle = title.toLowerCase();
    const lowerSnippet = (org.snippet || '').toLowerCase();
    const looksRelevant =
      lowerTitle.includes('detail') ||
      lowerTitle.includes('valet') ||
      lowerTitle.includes('ceramic') ||
      lowerTitle.includes('gloss') ||
      lowerSnippet.includes('detail') ||
      lowerSnippet.includes('valet');
    if (!looksRelevant) continue;

    const key = normalizeNameKey(title);
    if (!key || seen.has(key)) continue;

    seen.set(key, {
      businessName: title,
      city: options.city,
      country: options.country,
      websiteUrl: link,
      phoneDisplay: '',
      ratingScore: '4.9',
      reviewCount: 25,
      snippet: stripEmDashes(org.snippet || ''),
      source: 'organic',
    });
  }

  return {
    leads: Array.from(seen.values()).slice(0, 15),
    organicIgHandles,
  };
}

function extractFirstSocialHandleFromHtml(html: string): string | null {
  const igRegex =
    /href=["']https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/([^/?#"'\s<>]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = igRegex.exec(html)) !== null) {
    const seg = match[1]?.trim() || '';
    if (seg && !IGNORED_SOCIAL_SEGMENTS.has(seg.toLowerCase())) {
      return normalizeInstagramHandle(seg);
    }
  }

  const fbRegex =
    /href=["']https?:\/\/(?:www\.)?(?:facebook\.com|fb\.com)\/([^/?#"'\s<>]+)/gi;
  while ((match = fbRegex.exec(html)) !== null) {
    const seg = match[1]?.trim() || '';
    if (
      seg &&
      !IGNORED_SOCIAL_SEGMENTS.has(seg.toLowerCase()) &&
      !seg.toLowerCase().endsWith('.php')
    ) {
      return normalizeInstagramHandle(seg);
    }
  }

  return null;
}

function extractPhoneFromHtml(html: string): string {
  const telMatch = /href=["']tel:([^"']+)["']/i.exec(html);
  if (telMatch && telMatch[1]) {
    const cleaned = telMatch[1].replace(/[^\d+\-()\s]/g, '').trim();
    if (cleaned.length >= 7 && cleaned.length <= 24) {
      return cleaned;
    }
  }
  return '';
}

function findMatchedOrganicHandle(
  businessName: string,
  organicIgHandles: Array<{ nameTokens: string[]; handle: string }>
): string | null {
  const bizTokens = businessName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (t) =>
        t.length >= 3 &&
        !['mobile', 'car', 'auto', 'detailing', 'detail', 'valeting', 'valet', 'ltd', 'llc'].includes(
          t
        )
    );

  if (bizTokens.length === 0) return null;

  for (const entry of organicIgHandles) {
    const cleanHandle = entry.handle.replace(/^@/, '').toLowerCase();
    if (
      bizTokens.some(
        (token) => cleanHandle.includes(token) || entry.nameTokens.includes(token)
      )
    ) {
      return entry.handle;
    }
  }
  return null;
}

function buildDeterministicNote(params: {
  businessName: string;
  city: string;
  country: CountryCode;
  servicesObserved: string[];
  hasWebsite: boolean;
  isSocialOnly: boolean;
  hasContactFriction: boolean;
  instagramHandle: string;
}): string {
  const cityShort = params.city.split(',')[0]?.trim() || params.city;
  const serviceText =
    params.servicesObserved.length > 0
      ? params.servicesObserved.slice(0, 2).join(' and ')
      : params.country === 'UK'
        ? 'mobile valeting'
        : 'mobile detailing';

  let note: string;
  if (params.isSocialOnly || !params.hasWebsite) {
    note = `Saw ${params.businessName} (${params.instagramHandle}) offering ${serviceText} in ${cityShort} with no instant quote calculator on the bio link`;
  } else if (params.hasContactFriction) {
    note = `Noticed ${params.businessName} offers ${serviceText} around ${cityShort} but visitors have to call or submit a manual contact form for pricing`;
  } else {
    note = `Saw ${params.businessName} serving ${cityShort} for ${serviceText} and built a 60-second vehicle-size quote flow tailored to your services`;
  }

  return stripEmDashes(note).slice(0, 220);
}

async function inspectCandidate(
  lead: RawDiscoveredLead,
  index: number,
  organicIgHandles: Array<{ nameTokens: string[]; handle: string }>
): Promise<InspectedCandidate | null> {
  const signals: string[] = [];
  let score = 15;

  if (lead.reviewCount >= 5 && lead.reviewCount <= 90) {
    score += 20;
    signals.push('Sweet-Spot Reviews');
  }

  const numericRating = Number.parseFloat(lead.ratingScore);
  if (!Number.isNaN(numericRating) && numericRating >= 4.5) {
    score += 15;
    signals.push('High Rating');
  }

  const hasWebsite = Boolean(lead.websiteUrl);
  const urlHandle = lead.websiteUrl ? extractSocialHandleFromUrl(lead.websiteUrl) : null;
  const isSocialOnly = !hasWebsite || isSocialOrLinktreeUrl(lead.websiteUrl);

  let html = '';
  let phoneDisplay = lead.phoneDisplay;
  let extractedHandle = urlHandle;
  let hasInstantQuote = false;
  let hasContactFriction = false;
  const servicesObserved: string[] = [];

  if (hasWebsite && !lead.websiteUrl.toLowerCase().includes('instagram.com') && !lead.websiteUrl.toLowerCase().includes('facebook.com')) {
    try {
      const res = await fetch(lead.websiteUrl, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
          html = await res.text();
        }
      }
    } catch {
      // Timed out or blocked: continue with deterministic fallback signals
    }
  }

  const lowerHtml = html.toLowerCase();
  const combinedText = `${lowerHtml} ${lead.snippet.toLowerCase()} ${lead.businessName.toLowerCase()}`;

  if (lowerHtml && EXCLUDED_SAAS_MARKERS.some((marker) => lowerHtml.includes(marker))) {
    console.log(`  [-] Skipping ${lead.businessName}: already uses booking SaaS`);
    return null;
  }

  if (lowerHtml) {
    if (!extractedHandle) {
      extractedHandle = extractFirstSocialHandleFromHtml(html);
    }
    if (!phoneDisplay) {
      phoneDisplay = extractPhoneFromHtml(html);
    }
  }

  const hasVehiclePicker =
    lowerHtml.includes('sedan') &&
    lowerHtml.includes('suv') &&
    (lowerHtml.includes('instant quote') ||
      lowerHtml.includes('estimate') ||
      lowerHtml.includes('calculator'));

  if (hasVehiclePicker) {
    hasInstantQuote = true;
  }

  const quoteFrictionPhrases = [
    'dm for',
    'call for',
    'request a quote',
    'free estimate',
    'get a quote',
    'contact us',
    'message for',
    'enquire now',
  ];
  if (
    !hasVehiclePicker &&
    quoteFrictionPhrases.some((phrase) => combinedText.includes(phrase))
  ) {
    hasContactFriction = true;
    score += 25;
    signals.push('Contact-Only Quote Friction');
  }

  if (isSocialOnly) {
    score += 30;
    signals.push('IG/Linktree Only - No Quote Site');
  }

  const highTicketTerms: Array<[string, string]> = [
    ['ceramic', 'ceramic coating'],
    ['paint correction', 'paint correction'],
    ['interior reset', 'interior reset'],
    ['machine polish', 'machine polishing'],
    ['valet', 'mobile valeting'],
  ];
  for (const [term, label] of highTicketTerms) {
    if (combinedText.includes(term)) {
      servicesObserved.push(label);
    }
  }

  if (servicesObserved.length > 0) {
    score += 10;
    signals.push('High-Ticket Detailing Menu');
  }

  if (!extractedHandle) {
    extractedHandle = findMatchedOrganicHandle(lead.businessName, organicIgHandles);
  }

  if (!extractedHandle) {
    extractedHandle = cleanBusinessSlugHandle(lead.businessName);
    signals.push('Verify IG Handle');
  }

  const cityBase = lead.city.split(',')[0]?.trim() || lead.city;
  const serviceArea = `${cityBase} & nearby areas`;
  const personalizationNote = buildDeterministicNote({
    businessName: lead.businessName,
    city: lead.city,
    country: lead.country,
    servicesObserved,
    hasWebsite,
    isSocialOnly,
    hasContactFriction,
    instagramHandle: extractedHandle,
  });

  return {
    index,
    businessName: lead.businessName,
    city: lead.city,
    country: lead.country,
    serviceArea,
    phoneDisplay,
    instagramHandle: extractedHandle,
    websiteUrl: lead.websiteUrl,
    ratingScore: lead.ratingScore,
    reviewCount: lead.reviewCount,
    baseFitScore: Math.max(1, Math.min(100, score)),
    fitSignals: signals.slice(0, 6),
    hasInstantQuote,
    servicesObserved: servicesObserved.slice(0, 4),
    personalizationNote,
  };
}

async function rankWithGeminiOrFallback(
  candidates: InspectedCandidate[],
  options: CliOptions,
  geminiApiKey: string
): Promise<FinalCandidate[]> {
  const deterministicTop = [...candidates]
    .sort((a, b) => b.baseFitScore - a.baseFitScore || a.reviewCount - b.reviewCount)
    .slice(0, options.limit);

  if (!geminiApiKey) {
    console.warn(
      '[Stage 3] GEMINI_API_KEY is empty. Using deterministic Stage 2 ranking and hooks.'
    );
    return deterministicTop.map((c) => ({
      businessName: c.businessName,
      city: c.city,
      country: c.country,
      serviceArea: c.serviceArea,
      phoneDisplay: c.phoneDisplay,
      instagramHandle: c.instagramHandle,
      websiteUrl: c.websiteUrl,
      ratingScore: c.ratingScore,
      reviewCount: c.reviewCount,
      fitScore: c.baseFitScore,
      fitSignals: c.fitSignals,
      hasInstantQuote: c.hasInstantQuote,
      personalizationNote: c.personalizationNote,
    }));
  }

  const candidateSummaries = candidates.map((c) => ({
    index: c.index,
    businessName: c.businessName,
    city: c.city,
    country: c.country,
    reviewCount: c.reviewCount,
    ratingScore: c.ratingScore,
    hasWebsite: Boolean(c.websiteUrl),
    baseFitScore: c.baseFitScore,
    fitSignals: c.fitSignals,
    servicesObserved: c.servicesObserved,
  }));

  const prompt = [
    `You are ranking mobile car detailing / valeting prospects in ${options.city} (${options.country}) for a 60-second instant quote calculator preview.`,
    `Pick the top ${Math.min(options.limit, candidates.length)} candidates by their exact "index".`,
    `For each selected candidate:`,
    `1) Return "fitScore" (integer 1-100).`,
    `2) Return "serviceArea" (3-4 real nearby suburbs/towns around ${options.city}, comma-separated).`,
    `3) Return a truthful 1-line "personalizationNote" (max 210 chars) grounded strictly in the candidate's observed services and quote friction. NEVER use em dashes (use hyphens or commas instead).`,
    `Candidates JSON:`,
    JSON.stringify(candidateSummaries),
  ].join('\n');

  const responseSchema = {
    type: 'object',
    properties: {
      selected: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            fitScore: { type: 'integer' },
            serviceArea: { type: 'string' },
            personalizationNote: { type: 'string' },
          },
          required: ['index', 'fitScore', 'serviceArea', 'personalizationNote'],
        },
      },
    },
    required: ['selected'],
  };

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.5-flash-lite'];
  let lastError: unknown = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Stage 3] Calling Gemini Interactions API (${model})...`);
      const interaction = await ai.interactions.create({
        model,
        input: prompt,
        store: false,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: responseSchema,
        },
      });

      const rawText = interaction.output_text || '';
      const parsed = JSON.parse(rawText) as {
        selected?: Array<{
          index: number;
          fitScore: number;
          serviceArea: string;
          personalizationNote: string;
        }>;
      };

      if (Array.isArray(parsed.selected) && parsed.selected.length > 0) {
        const byIndex = new Map(candidates.map((c) => [c.index, c]));
        const ranked: FinalCandidate[] = [];
        const usedIndexes = new Set<number>();

        for (const item of parsed.selected) {
          if (usedIndexes.has(item.index)) continue;
          const base = byIndex.get(item.index);
          if (!base) continue;
          usedIndexes.add(item.index);

          const cleanNote = stripEmDashes(item.personalizationNote || base.personalizationNote).slice(
            0,
            260
          );
          const cleanArea = stripEmDashes(item.serviceArea || base.serviceArea).slice(0, 160);
          const cleanScore = Math.max(
            1,
            Math.min(100, Math.round(Number(item.fitScore) || base.baseFitScore))
          );

          ranked.push({
            businessName: base.businessName,
            city: base.city,
            country: base.country,
            serviceArea: cleanArea || base.serviceArea,
            phoneDisplay: base.phoneDisplay,
            instagramHandle: base.instagramHandle,
            websiteUrl: base.websiteUrl,
            ratingScore: base.ratingScore,
            reviewCount: base.reviewCount,
            fitScore: cleanScore,
            fitSignals: base.fitSignals,
            hasInstantQuote: base.hasInstantQuote,
            personalizationNote:
              cleanNote.length >= 5 ? cleanNote : base.personalizationNote,
          });
        }

        if (ranked.length > 0) {
          return ranked.slice(0, options.limit);
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
  console.warn(
    `[Stage 3 Warning] Gemini call fell back to deterministic Stage 2 scoring (${errMsg.slice(0, 180)}).`
  );
  if (geminiApiKey.startsWith('AQ.')) {
    console.warn(
      'Tip: Your GEMINI_API_KEY starts with "AQ.", which looks like a short-lived Google Cloud token rather than a standard AIzaSy... Google AI Studio API key from https://aistudio.google.com/apikey.'
    );
  } else {
    console.warn(
      'Tip: To use AI ranking, set a standard AIzaSy... Google AI Studio API key in .env from https://aistudio.google.com/apikey.'
    );
  }

  return deterministicTop.map((c) => ({
    businessName: c.businessName,
    city: c.city,
    country: c.country,
    serviceArea: c.serviceArea,
    phoneDisplay: c.phoneDisplay,
    instagramHandle: c.instagramHandle,
    websiteUrl: c.websiteUrl,
    ratingScore: c.ratingScore,
    reviewCount: c.reviewCount,
    fitScore: c.baseFitScore,
    fitSignals: c.fitSignals,
    hasInstantQuote: c.hasInstantQuote,
    personalizationNote: c.personalizationNote,
  }));
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function persistCandidates(candidates: FinalCandidate[]): Promise<'api' | 'wrangler'> {
  const configuredUrl = (process.env.QUOTES_DOCK_URL || 'http://localhost:4321').replace(
    /\/+$/,
    ''
  );
  const studioKey = process.env.ADMIN_STUDIO_KEY || '';
  const urlsToTry = [configuredUrl];
  if (configuredUrl === 'http://localhost:4321') {
    urlsToTry.push('http://localhost:4322');
  }

  for (const baseUrl of urlsToTry) {
    try {
      const response = await fetch(`${baseUrl}/api/candidates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(studioKey ? { 'x-studio-key': studioKey } : {}),
        },
        body: JSON.stringify({ candidates }),
        signal: AbortSignal.timeout(4000),
      });

      if (response.ok) {
        const data = (await response.json().catch(() => null)) as { ok?: boolean } | null;
        if (data?.ok) {
          console.log(`[Stage 4] Saved ${candidates.length} candidates via ${baseUrl}/api/candidates`);
          return 'api';
        }
      }
    } catch {
      // Dev server not running on this port: continue to next option or Wrangler D1 fallback
    }
  }

  console.log(
    '[Stage 4] Local Astro server not running. Persisting directly to local D1 via wrangler...'
  );

  const wranglerDir = path.resolve(process.cwd(), '.wrangler');
  fs.mkdirSync(wranglerDir, { recursive: true });
  const sqlFile = path.join(wranglerDir, 'tmp-scout-upsert.sql');
  const nowIso = new Date().toISOString();

  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS lead_candidates (
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
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_candidates_dedupe ON lead_candidates (dedupe_key);`,
  ];

  for (const item of candidates) {
    const id = `cand_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const dedupeKey = buildCandidateDedupeKey(item.businessName, item.city);
    const normalizedHandle = normalizeInstagramHandle(item.instagramHandle);
    const signalsJson = JSON.stringify(item.fitSignals);
    const hasInstantInt = item.hasInstantQuote ? 1 : 0;

    statements.push(
      `INSERT INTO lead_candidates (
        id, dedupe_key, business_name, city, country, service_area,
        phone_display, instagram_handle, website_url, rating_score, review_count,
        fit_score, fit_signals_json, has_instant_quote, personalization_note, status, scouted_at
      ) VALUES (
        ${sqlQuote(id)}, ${sqlQuote(dedupeKey)}, ${sqlQuote(item.businessName)}, ${sqlQuote(item.city)}, ${sqlQuote(item.country)}, ${sqlQuote(item.serviceArea)},
        ${sqlQuote(item.phoneDisplay)}, ${sqlQuote(normalizedHandle)}, ${sqlQuote(item.websiteUrl)}, ${sqlQuote(item.ratingScore)}, ${Math.round(item.reviewCount)},
        ${Math.round(item.fitScore)}, ${sqlQuote(signalsJson)}, ${hasInstantInt}, ${sqlQuote(item.personalizationNote)}, 'new', ${sqlQuote(nowIso)}
      )
      ON CONFLICT(dedupe_key) DO UPDATE SET
        business_name = excluded.business_name,
        city = excluded.city,
        country = excluded.country,
        service_area = excluded.service_area,
        phone_display = excluded.phone_display,
        instagram_handle = excluded.instagram_handle,
        website_url = excluded.website_url,
        rating_score = excluded.rating_score,
        review_count = excluded.review_count,
        fit_score = excluded.fit_score,
        fit_signals_json = excluded.fit_signals_json,
        has_instant_quote = excluded.has_instant_quote,
        personalization_note = excluded.personalization_note,
        scouted_at = excluded.scouted_at,
        status = CASE WHEN lead_candidates.status = 'promoted' THEN 'promoted' ELSE 'new' END;`
    );
  }

  try {
    fs.writeFileSync(sqlFile, statements.join('\n'), 'utf8');
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', 'quotes-dock-db', '--local', '--file', sqlFile],
      {
        stdio: 'inherit',
        shell: true,
      }
    );
    if (result.status !== 0) {
      throw new Error(`wrangler d1 execute exited with code ${result.status}`);
    }
    return 'wrangler';
  } finally {
    if (fs.existsSync(sqlFile)) {
      fs.unlinkSync(sqlFile);
    }
  }
}

function printSummaryTable(candidates: FinalCandidate[]): void {
  console.log('\n=== QuotesDock Scout Results ===');
  const rows = candidates.map((c, idx) => ({
    Rank: idx + 1,
    Business: c.businessName,
    Fit: `${c.fitScore}%`,
    Handle: c.instagramHandle,
    Phone: c.phoneDisplay || 'DM Only',
    Signals: c.fitSignals.join(', '),
  }));
  console.table(rows);
  candidates.forEach((c, idx) => {
    console.log(
      `#${idx + 1} ${c.businessName} (${c.fitScore}% Fit) [${c.instagramHandle}]`
    );
    console.log(`   Area: ${c.serviceArea}`);
    console.log(`   Note: ${c.personalizationNote}`);
  });
}

async function main(): Promise<void> {
  loadLocalEnv();
  const options = parseCliArgs(process.argv.slice(2));
  const serperApiKey = process.env.SERPER_API_KEY?.trim() || '';
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || '';

  if (!serperApiKey) {
    console.error('Missing SERPER_API_KEY in .env or environment.');
    process.exit(1);
  }

  const { leads, organicIgHandles } = await discoverCandidates(options, serperApiKey);
  if (leads.length === 0) {
    console.log(`No detailing candidates found for "${options.city}".`);
    return;
  }

  console.log(`[Stage 2] Inspecting ${leads.length} candidate websites deterministically...`);
  const inspectedList: InspectedCandidate[] = [];
  for (let i = 0; i < leads.length; i += 1) {
    const inspected = await inspectCandidate(leads[i], i, organicIgHandles);
    if (inspected) {
      inspectedList.push(inspected);
    }
  }

  if (inspectedList.length === 0) {
    console.log('All discovered candidates were disqualified (existing booking SaaS).');
    return;
  }

  const topCandidates = await rankWithGeminiOrFallback(
    inspectedList,
    options,
    geminiApiKey
  );

  await persistCandidates(topCandidates);
  printSummaryTable(topCandidates);
}

main().catch((err) => {
  console.error('Scout CLI failed:', err);
  process.exit(1);
});
