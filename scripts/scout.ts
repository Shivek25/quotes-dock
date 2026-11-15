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
  position?: number;
}

type WebsiteStatus = 'none' | 'social' | 'linktree' | 'broken';

interface RawDiscoveredLead {
  businessName: string;
  city: string;
  country: CountryCode;
  coreBrandKey: string;
  phoneKey: string;
  websiteUrl: string;
  websiteStatus: WebsiteStatus;
  verifiedHandle: string | null;
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
  websiteStatus: WebsiteStatus;
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
  'threebestrated.',
  'hotfrog.',
  'fyple.',
  'localsearch.',
  'scoot.co.uk',
  'brownbook.net',
  'find-open.',
  'detaildirectory.',
  'localcarwash.',
  'ukcarwash.',
  'carwash.co.uk',
  'findacarwash.',
  'nearme.',
  '192.com',
  'endole.co.uk',
  'companieshouse.gov.uk',
  'checkacompany.',
  'birdeye.com',
  'nicelocal.',
  'opendi.',
  'cylex-uk.',
  'yably.',
  'tupalo.',
  'wheree.com',
];

const SOCIAL_BIO_DOMAINS = [
  'instagram.com',
  'instagr.am',
  'facebook.com',
  'fb.com',
  'linktr.ee',
  'tiktok.com',
];

const NON_CUSTOM_WEB_DOMAINS = [
  ...DIRECTORY_DOMAINS,
  ...SOCIAL_BIO_DOMAINS,
  'youtube.com',
  'youtu.be',
  'wa.me',
  'whatsapp.com',
  'google.com',
  'g.page',
  'maps.app.goo.gl',
  'goo.gl',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'bing.com',
  'threads.net',
  'apple.com',
];

const WEBMAIL_DOMAINS = new Set([
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'yahoo.com',
  'yahoo.co.uk',
  'icloud.com',
  'live.com',
  'live.co.uk',
  'aol.com',
  'btinternet.com',
  'sky.com',
  'virginmedia.com',
  'me.com',
  'proton.me',
  'protonmail.com',
]);

const STOP_WORDS = new Set([
  'mobile',
  'car',
  'cars',
  'auto',
  'automotive',
  'vehicle',
  'vehicles',
  'valeting',
  'valet',
  'detailing',
  'detail',
  'detailer',
  'detailers',
  'care',
  'cleaning',
  'clean',
  'wash',
  'washing',
  'services',
  'service',
  'solutions',
  'specialist',
  'specialists',
  'pro',
  'professional',
  'ltd',
  'limited',
  'llc',
  'inc',
  'co',
  'uk',
  'us',
  'the',
  'and',
  'cheltenham',
  'stroud',
  'tewkesbury',
  'cirencester',
  'coleford',
  'mitcheldean',
  'quedgeley',
  'churchdown',
  'glos',
]);

const PARKED_DOMAIN_MARKERS = [
  'sedoparking',
  'hugedomains',
  'domain for sale',
  'this domain is parked',
  'account suspended',
  'buy this domain',
  'parked free',
  'godaddy.com/forsale',
  'dan.com',
  'afternic',
  'coming soon',
];

const IGNORED_INSTAGRAM_SEGMENTS = new Set([
  'p',
  'reel',
  'reels',
  'explore',
  'stories',
  'accounts',
  'about',
  'login',
  'signup',
  'tv',
  'channel',
  'directory',
  'hashtag',
  'popular',
  'intent',
]);

const IGNORED_FACEBOOK_SEGMENTS = new Set([
  'groups',
  'events',
  'watch',
  'photo',
  'photo.php',
  'story.php',
  'permalink.php',
  'marketplace',
  'gaming',
  'help',
  'login',
  'sharer',
  'share',
  'share.php',
  'plugins',
  'tr',
  'dialog',
  'hashtag',
  'posts',
  'videos',
  'reel',
  'reels',
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
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractCoreBrandKey(name: string, city: string): string {
  const cityTokens = new Set<string>();
  for (const tok of city.toLowerCase().split(/[^a-z0-9]+/)) {
    if (tok) {
      cityTokens.add(tok);
      if (tok.length >= 3) {
        cityTokens.add(`${tok}shire`);
      }
    }
  }

  const normalized = name.toLowerCase().replace(/['’.\u2019]/g, '');
  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length > 0 && !STOP_WORDS.has(tok) && !cityTokens.has(tok));

  if (tokens.length > 0) {
    return tokens.join('');
  }
  return normalizeNameKey(name);
}

function normalizePhoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-9);
}

function isDirectoryUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (DIRECTORY_DOMAINS.some((domain) => lower.includes(domain))) {
    return true;
  }
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (host.includes('directory')) return true;
    return (
      pathname.includes('/listing/') ||
      pathname.includes('/listings/') ||
      pathname.includes('/directory/') ||
      pathname.includes('/businesses/') ||
      pathname.includes('/carwash/')
    );
  } catch {
    return false;
  }
}

function isSocialOrLinktreeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return SOCIAL_BIO_DOMAINS.some((domain) => lower.includes(domain));
}

function isCustomWebsiteUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (isDirectoryUrl(url)) return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || !host.includes('.')) return false;
    return !NON_CUSTOM_WEB_DOMAINS.some((domain) => host.includes(domain));
  } catch {
    return false;
  }
}

function normalizeUrlHref(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

async function checkWebsiteAlive(
  url: string
): Promise<{ alive: boolean; html: string; finalUrl: string }> {
  const targetUrl = normalizeUrlHref(url);
  if (!targetUrl) {
    return { alive: false, html: '', finalUrl: '' };
  }

  try {
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (res.status === 401 || res.status === 403 || res.status === 429) {
      return { alive: true, html: '', finalUrl: res.url || targetUrl };
    }

    if (!res.ok) {
      return { alive: false, html: '', finalUrl: res.url || targetUrl };
    }

    const finalUrl = res.url || targetUrl;
    if (isSocialOrLinktreeUrl(finalUrl) || isDirectoryUrl(finalUrl)) {
      return { alive: false, html: '', finalUrl };
    }

    const html = await res.text().catch(() => '');
    const lowerHtml = html.toLowerCase();
    const isParked = PARKED_DOMAIN_MARKERS.some((marker) => {
      if (!lowerHtml.includes(marker)) return false;
      if (marker === 'coming soon') {
        return lowerHtml.length < 8000;
      }
      return true;
    });

    if (isParked) {
      return { alive: false, html, finalUrl };
    }

    return { alive: true, html, finalUrl };
  } catch {
    return { alive: false, html: '', finalUrl: targetUrl };
  }
}

function isNonProfileSocialUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const parts = parsed.pathname
      .split('/')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);

    if (host.includes('instagram.com') || host.includes('instagr.am')) {
      const first = parts[0] || '';
      if (!first || IGNORED_INSTAGRAM_SEGMENTS.has(first)) return true;
      return false;
    }

    if (host.includes('facebook.com') || host.includes('fb.com')) {
      const first = parts[0] || '';
      if (!first || IGNORED_FACEBOOK_SEGMENTS.has(first)) return true;
      if (parts.some((p) => p === 'posts' || p === 'videos' || p === 'reel')) {
        return true;
      }
      return false;
    }

    return false;
  } catch {
    return false;
  }
}

function extractSocialHandleFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (isNonProfileSocialUrl(url)) return null;

    const parts = parsed.pathname
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);

    if (host.includes('instagram.com') || host.includes('instagr.am')) {
      const first = parts[0];
      if (!first || IGNORED_INSTAGRAM_SEGMENTS.has(first.toLowerCase())) {
        return null;
      }
      return normalizeInstagramHandle(first);
    }

    if (host.includes('facebook.com') || host.includes('fb.com')) {
      const first = parts[0];
      if (!first || IGNORED_FACEBOOK_SEGMENTS.has(first.toLowerCase())) {
        return null;
      }
      if (first.toLowerCase() === 'p' && parts[1]) {
        const cleanedSlug = parts[1].replace(/-\d{8,}$/, '').trim();
        return cleanedSlug ? normalizeInstagramHandle(cleanedSlug) : null;
      }
      if (first.toLowerCase() === 'pages' && parts[1]) {
        return normalizeInstagramHandle(parts[1]);
      }
      if (first.toLowerCase().endsWith('.php')) return null;
      return normalizeInstagramHandle(first);
    }

    return null;
  } catch {
    return null;
  }
}

function extractInlineHandleFromTitle(title: string): string | null {
  const match = /\(@([a-zA-Z0-9._]{2,40})\)/.exec(title);
  if (match && match[1]) {
    return normalizeInstagramHandle(match[1]);
  }
  return null;
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
    .split('•')[0]
    .replace(/\(@[^)]+\)/g, '')
    .replace(/Instagram photos and videos/gi, '')
    .replace(/on Instagram/gi, '')
    .replace(/Facebook/gi, '')
    .trim();
  return stripEmDashes(withoutSite).slice(0, 90);
}

function extractCustomDomainsFromSnippet(text: string): string[] {
  const domains: string[] = [];
  const regex =
    /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]{2,}\.(?:co\.uk|org\.uk|me\.uk|ltd\.uk|uk|com|net|org|io|biz|info))\b/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const candidate = (match[1] || '').toLowerCase();
    if (!candidate) continue;

    // Skip email addresses on free webmail hosts
    const charBefore = match.index > 0 ? text[match.index - 1] : '';
    if (charBefore === '@' && WEBMAIL_DOMAINS.has(candidate)) {
      continue;
    }
    if (WEBMAIL_DOMAINS.has(candidate)) continue;
    if (NON_CUSTOM_WEB_DOMAINS.some((d) => candidate.includes(d))) continue;

    if (!domains.includes(candidate)) {
      domains.push(candidate);
    }
  }

  return domains;
}

function extractPhoneFromText(text: string, country: CountryCode): string {
  if (!text) return '';
  if (country === 'UK') {
    const ukMatch =
      /(?:\+44\s?(?:\(0\)\s?)?0?\s?(?:7\d{3}|1\d{3}|2\d{2})|\b0(?:7\d{3}|1\d{3}|2\d{2}))[\s.-]?\d{3}[\s.-]?\d{3,4}\b/.exec(
        text
      );
    if (ukMatch && ukMatch[0]) {
      return ukMatch[0].replace(/\s+/g, ' ').trim();
    }
  } else {
    const usMatch =
      /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/.exec(text);
    if (usMatch && usMatch[0]) {
      return usMatch[0].replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

function isDetailingRelevantText(text: string): boolean {
  const lower = text.toLowerCase();
  const negativeHints = ['top 10', 'best ', 'looking for', 'anyone recommend', 'hiring', 'job '];
  if (negativeHints.some((bad) => lower.includes(bad))) {
    return false;
  }
  return (
    lower.includes('detail') ||
    lower.includes('valet') ||
    lower.includes('ceramic') ||
    lower.includes('gloss') ||
    lower.includes('polish') ||
    lower.includes('car wash') ||
    lower.includes('auto care')
  );
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
  knownWebsiteBrandKeys: Map<string, string>;
  knownWebsitePhones: Map<string, string>;
}> {
  const gl = options.country === 'UK' ? 'gb' : 'us';
  const placesQuery =
    options.country === 'UK'
      ? `mobile car valeting detailing ${options.city}`
      : `mobile car detailing ${options.city}`;
  const igSearchQuery =
    options.country === 'UK'
      ? `instagram.com mobile valeting detailing ${options.city}`
      : `instagram.com mobile car detailing ${options.city}`;
  const fbSearchQuery =
    options.country === 'UK'
      ? `facebook.com mobile valeting detailing ${options.city}`
      : `facebook.com mobile car detailing ${options.city}`;

  console.log(
    `[Stage 1] Querying Serper (${options.country}) for no-website/social detailers in "${options.city}"...`
  );

  const [placesP1, placesP2, igSearch, fbSearch] = await Promise.all([
    fetchSerperJson<{ places?: SerperPlace[] }>('places', serperApiKey, {
      q: placesQuery,
      gl,
      page: 1,
    }),
    fetchSerperJson<{ places?: SerperPlace[] }>('places', serperApiKey, {
      q: placesQuery,
      gl,
      page: 2,
    }).catch(() => ({ places: [] as SerperPlace[] })),
    fetchSerperJson<{ organic?: SerperOrganic[] }>('search', serperApiKey, {
      q: igSearchQuery,
      gl,
      num: 15,
    }).catch((err) => {
      console.warn(
        `[Stage 1 Warning] IG search skipped (${err instanceof Error ? err.message : String(err)})`
      );
      return { organic: [] as SerperOrganic[] };
    }),
    fetchSerperJson<{ organic?: SerperOrganic[] }>('search', serperApiKey, {
      q: fbSearchQuery,
      gl,
      num: 15,
    }).catch((err) => {
      console.warn(
        `[Stage 1 Warning] FB search skipped (${err instanceof Error ? err.message : String(err)})`
      );
      return { organic: [] as SerperOrganic[] };
    }),
  ]);

  let allPlaces = [...(placesP1.places ?? []), ...(placesP2.places ?? [])];
  const knownWebsiteBrandKeys = new Map<string, string>();
  const knownWebsitePhones = new Map<string, string>();
  const leadsByKey = new Map<string, RawDiscoveredLead>();
  const brokenUrlCache = new Map<string, boolean>();

  async function processPlacesBatch(placesList: SerperPlace[]): Promise<void> {
    // Check custom websites on Maps places concurrently
    const checks = await Promise.all(
      placesList.map(async (place) => {
        const rawWebsite = (place.website || '').trim();
        if (!rawWebsite || !isCustomWebsiteUrl(rawWebsite)) {
          return { place, alive: false, checkedCustom: false };
        }
        const status = await checkWebsiteAlive(rawWebsite);
        return { place, alive: status.alive, checkedCustom: true };
      })
    );

    // Pass 1: record all Maps businesses that already own active custom websites
    for (const { place, alive, checkedCustom } of checks) {
      if (!checkedCustom || !alive) continue;
      const title = stripEmDashes(place.title || '');
      const website = (place.website || '').trim();
      if (!title) continue;

      const coreKey = extractCoreBrandKey(title, options.city);
      const phoneKey = normalizePhoneKey(place.phoneNumber || '');
      if (coreKey) knownWebsiteBrandKeys.set(coreKey, website);
      if (phoneKey) knownWebsitePhones.set(phoneKey, website);
      console.log(`  [-] Skipping ${title}: already has active website (${website})`);
    }

    // Pass 2: admit only Maps places with no website, social/Linktree URL, or dead domain
    for (const { place, alive, checkedCustom } of checks) {
      if (checkedCustom && alive) continue;

      const title = stripEmDashes(place.title || '');
      if (!title || title.length < 3) continue;

      const website = (place.website || '').trim();
      if (website && isDirectoryUrl(website)) {
        // Treat pure directory link on Maps as no standalone website
      }

      const reviewCount = Number(place.ratingCount ?? place.reviews ?? 0) || 12;
      if (reviewCount > 180) continue;

      const coreKey = extractCoreBrandKey(title, options.city);
      const phoneDisplay = stripEmDashes(place.phoneNumber || '');
      const phoneKey = normalizePhoneKey(phoneDisplay);

      const knownSite =
        (coreKey && knownWebsiteBrandKeys.get(coreKey)) ||
        (phoneKey && knownWebsitePhones.get(phoneKey));
      if (knownSite) {
        console.log(`  [-] Skipping ${title}: matches known website owner (${knownSite})`);
        continue;
      }

      let websiteStatus: WebsiteStatus = 'none';
      let normalizedSite = website;
      if (website && isDirectoryUrl(website)) {
        websiteStatus = 'none';
        normalizedSite = '';
      } else if (website && website.toLowerCase().includes('linktr.ee')) {
        websiteStatus = 'linktree';
      } else if (website && isSocialOrLinktreeUrl(website)) {
        websiteStatus = 'social';
      } else if (checkedCustom && !alive) {
        websiteStatus = 'broken';
        brokenUrlCache.set(website, true);
      }

      const dedupeKey = coreKey || normalizeNameKey(title);
      if (!dedupeKey || leadsByKey.has(dedupeKey)) continue;

      leadsByKey.set(dedupeKey, {
        businessName: title,
        city: options.city,
        country: options.country,
        coreBrandKey: coreKey,
        phoneKey,
        websiteUrl: normalizedSite,
        websiteStatus,
        verifiedHandle: normalizedSite ? extractSocialHandleFromUrl(normalizedSite) : null,
        phoneDisplay,
        ratingScore: place.rating ? Number(place.rating).toFixed(1) : '4.9',
        reviewCount,
        snippet: stripEmDashes(
          [place.category, place.address].filter(Boolean).join(', ')
        ),
        source: 'places',
      });
    }
  }

  await processPlacesBatch(allPlaces);

  // If fewer than limit + 4 candidates from Maps, broaden /places query once before social merge
  if (leadsByKey.size < options.limit + 4) {
    const broadQuery =
      options.country === 'UK'
        ? `car detailing valeting near ${options.city}`
        : `car detailing near ${options.city}`;
    const extraPlaces = await fetchSerperJson<{ places?: SerperPlace[] }>(
      'places',
      serperApiKey,
      { q: broadQuery, gl, page: 1 }
    ).catch(() => ({ places: [] as SerperPlace[] }));

    if (extraPlaces.places && extraPlaces.places.length > 0) {
      await processPlacesBatch(extraPlaces.places);
    }
  }

  // Merge organic social search results (Instagram & Facebook)
  const organicResults = [
    ...(igSearch.organic ?? []),
    ...(fbSearch.organic ?? []),
  ];

  for (const org of organicResults) {
    const link = (org.link || '').trim();
    if (!link || isDirectoryUrl(link) || isNonProfileSocialUrl(link)) continue;
    if (!isSocialOrLinktreeUrl(link)) continue;

    const rawTitle = org.title || '';
    const title = cleanOrgBusinessName(rawTitle);
    const snippet = stripEmDashes(org.snippet || '');
    if (!title || title.length < 3) continue;
    if (!isDetailingRelevantText(`${title} ${snippet}`)) continue;

    const coreKey = extractCoreBrandKey(title, options.city);
    const extractedPhone = extractPhoneFromText(`${rawTitle} ${snippet}`, options.country);
    const phoneKey = normalizePhoneKey(extractedPhone);

    const knownSite =
      (coreKey && knownWebsiteBrandKeys.get(coreKey)) ||
      (phoneKey && knownWebsitePhones.get(phoneKey));
    if (knownSite) {
      console.log(`  [-] Skipping ${title}: matches known website owner (${knownSite})`);
      continue;
    }

    // Check if the social snippet itself advertises a custom website domain
    const snippetDomains = extractCustomDomainsFromSnippet(snippet);
    let activeBioWebsite = '';
    for (const domain of snippetDomains) {
      const siteCheck = await checkWebsiteAlive(`https://${domain}`);
      if (siteCheck.alive) {
        activeBioWebsite = `https://${domain}`;
        break;
      }
    }

    if (activeBioWebsite) {
      if (coreKey) knownWebsiteBrandKeys.set(coreKey, activeBioWebsite);
      if (phoneKey) knownWebsitePhones.set(phoneKey, activeBioWebsite);
      console.log(`  [-] Skipping ${title}: social bio lists active website (${activeBioWebsite})`);
      continue;
    }

    const handleFromTitle = extractInlineHandleFromTitle(rawTitle);
    const handleFromUrl = extractSocialHandleFromUrl(link);
    const bestHandle = handleFromTitle || handleFromUrl;

    // Match existing lead by core brand key or phone key
    let existingLead = coreKey ? leadsByKey.get(coreKey) : undefined;
    if (!existingLead && phoneKey) {
      for (const candidate of leadsByKey.values()) {
        if (candidate.phoneKey && candidate.phoneKey === phoneKey) {
          existingLead = candidate;
          break;
        }
      }
    }

    if (existingLead) {
      if (!existingLead.phoneDisplay && extractedPhone) {
        existingLead.phoneDisplay = extractedPhone;
        existingLead.phoneKey = phoneKey;
      }
      if (!existingLead.verifiedHandle && bestHandle) {
        existingLead.verifiedHandle = bestHandle;
      } else if (
        bestHandle &&
        link.toLowerCase().includes('instagram.com') &&
        existingLead.websiteUrl.toLowerCase().includes('facebook.com')
      ) {
        existingLead.verifiedHandle = bestHandle;
      }
      if (!existingLead.websiteUrl) {
        existingLead.websiteUrl = link;
        existingLead.websiteStatus = link.toLowerCase().includes('linktr.ee')
          ? 'linktree'
          : 'social';
      }
      if (snippet && !existingLead.snippet.includes(snippet.slice(0, 24))) {
        existingLead.snippet = `${existingLead.snippet} | ${snippet}`.slice(0, 320);
      }
      continue;
    }

    const dedupeKey = coreKey || normalizeNameKey(title);
    if (!dedupeKey) continue;

    leadsByKey.set(dedupeKey, {
      businessName: title,
      city: options.city,
      country: options.country,
      coreBrandKey: coreKey,
      phoneKey,
      websiteUrl: link,
      websiteStatus: link.toLowerCase().includes('linktr.ee') ? 'linktree' : 'social',
      verifiedHandle: bestHandle,
      phoneDisplay: extractedPhone,
      ratingScore: '4.9',
      reviewCount: 25,
      snippet,
      source: 'organic',
    });
  }

  // Prioritize Maps no-website / broken-website / Linktree and IG-backed leads first
  const sortedLeads = Array.from(leadsByKey.values()).sort((a, b) => {
    const scorePriority = (item: RawDiscoveredLead): number => {
      let p = 0;
      if (item.source === 'places') p += 30;
      if (item.websiteStatus === 'none' || item.websiteStatus === 'broken') p += 20;
      if (item.verifiedHandle) p += 15;
      if (item.phoneDisplay) p += 10;
      return p;
    };
    return scorePriority(b) - scorePriority(a);
  });

  return {
    leads: sortedLeads.slice(0, 14),
    knownWebsiteBrandKeys,
    knownWebsitePhones,
  };
}

function buildDeterministicNote(params: {
  businessName: string;
  city: string;
  country: CountryCode;
  servicesObserved: string[];
  websiteStatus: WebsiteStatus;
  instagramHandle: string;
  hasPhone: boolean;
}): string {
  const cityShort = params.city.split(',')[0]?.trim() || params.city;
  const serviceText =
    params.servicesObserved.length > 0
      ? params.servicesObserved.slice(0, 2).join(' and ')
      : params.country === 'UK'
        ? 'mobile valeting'
        : 'mobile detailing';

  let note: string;
  if (params.websiteStatus === 'broken') {
    note = `Saw ${params.businessName} serving ${cityShort} for ${serviceText} with an offline website domain, so we built a working 60-second quote page`;
  } else if (params.websiteStatus === 'linktree') {
    note = `Saw ${params.businessName} (${params.instagramHandle}) offering ${serviceText} in ${cityShort} with a Linktree bio only and no vehicle quote calculator`;
  } else if (params.websiteStatus === 'social') {
    note = `Saw ${params.businessName} (${params.instagramHandle}) taking ${serviceText} enquiries via social DMs in ${cityShort} with no instant quote website`;
  } else {
    note = `Noticed ${params.businessName} has strong local reviews for ${serviceText} in ${cityShort} with ${params.hasPhone ? 'phone-only' : 'manual'} enquiries and no website`;
  }

  return stripEmDashes(note).slice(0, 220);
}

function doesOrganicResultBelongToCandidate(
  org: SerperOrganic,
  lead: RawDiscoveredLead,
  city: string,
  organicIndex: number
): boolean {
  const title = org.title || '';
  const snippet = org.snippet || '';
  const link = org.link || '';
  const combined = `${title} ${snippet}`.toLowerCase();

  // Check phone number match first
  if (lead.phoneKey) {
    const digits = `${title} ${snippet}`.replace(/\D/g, '');
    if (digits.includes(lead.phoneKey)) {
      return true;
    }
  }

  // Must at least look automotive/detailing related so another industry doesn't collide
  if (!isDetailingRelevantText(combined) && !link.toLowerCase().includes('detail') && !link.toLowerCase().includes('valet')) {
    return false;
  }

  const orgCoreKey = extractCoreBrandKey(title, city);
  const leadCoreKey = lead.coreBrandKey;

  let hostnameBase = '';
  try {
    hostnameBase = new URL(link).hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/[^a-z0-9]/g, '');
  } catch {
    hostnameBase = '';
  }

  const brandMatch =
    (leadCoreKey.length >= 2 && orgCoreKey === leadCoreKey) ||
    (leadCoreKey.length >= 4 &&
      (orgCoreKey.includes(leadCoreKey) || leadCoreKey.includes(orgCoreKey))) ||
    (leadCoreKey.length >= 3 && hostnameBase.includes(leadCoreKey));

  if (!brandMatch) return false;

  const cityShort = (city.split(',')[0] || city).trim().toLowerCase();
  const mentionsLocalCity =
    (cityShort.length >= 3 && combined.includes(cityShort)) ||
    combined.includes('gloucestershire');

  return mentionsLocalCity || organicIndex < 3;
}

async function inspectCandidateWithCrossCheck(
  lead: RawDiscoveredLead,
  index: number,
  options: CliOptions,
  serperApiKey: string,
  knownWebsiteBrandKeys: Map<string, string>,
  knownWebsitePhones: Map<string, string>
): Promise<InspectedCandidate | null> {
  // Check against keys discovered during earlier Stage 1/2 iterations
  const alreadyKnown =
    (lead.coreBrandKey && knownWebsiteBrandKeys.get(lead.coreBrandKey)) ||
    (lead.phoneKey && knownWebsitePhones.get(lead.phoneKey));
  if (alreadyKnown) {
    console.log(`  [-] Skipping ${lead.businessName}: linked to active website (${alreadyKnown})`);
    return null;
  }

  const cityShort = (options.city.split(',')[0] || options.city).trim();
  const cleanBizQuery = lead.businessName.replace(/[^\w\s.'-]/g, ' ').replace(/\s+/g, ' ').trim();
  const crossCheckQuery = `${cleanBizQuery} ${cityShort}`;
  const gl = options.country === 'UK' ? 'gb' : 'us';

  const crossCheckData = await fetchSerperJson<{ organic?: SerperOrganic[] }>(
    'search',
    serperApiKey,
    { q: crossCheckQuery, gl, num: 6 }
  ).catch(() => ({ organic: [] as SerperOrganic[] }));

  const organicResults = crossCheckData.organic ?? [];
  let hiddenCustomWebsite = '';
  let verifiedIgHandle: string | null = null;
  let verifiedFbHandle: string | null = null;
  let verifiedSocialUrl = lead.websiteStatus === 'social' || lead.websiteStatus === 'linktree' ? lead.websiteUrl : '';
  let phoneDisplay = lead.phoneDisplay;
  let combinedSearchText = `${lead.businessName} ${lead.snippet}`;

  for (let rIdx = 0; rIdx < organicResults.length; rIdx += 1) {
    const org = organicResults[rIdx];
    const link = (org.link || '').trim();
    const title = org.title || '';
    const snippet = org.snippet || '';
    if (!link) continue;

    const orgCore = extractCoreBrandKey(cleanOrgBusinessName(title), options.city);
    const digitsInOrg = `${title} ${snippet}`.replace(/\D/g, '');
    const phoneMatch = Boolean(lead.phoneKey && digitsInOrg.includes(lead.phoneKey));
    const coreMatch =
      Boolean(lead.coreBrandKey && orgCore) &&
      (orgCore === lead.coreBrandKey ||
        (lead.coreBrandKey.length >= 4 &&
          (orgCore.includes(lead.coreBrandKey) || lead.coreBrandKey.includes(orgCore))));
    const inlineHandle = extractInlineHandleFromTitle(title) || extractSocialHandleFromUrl(link);
    const handleClean = (inlineHandle || '').replace(/[^a-z0-9]/g, '');
    const handleMatchesBrand = Boolean(
      lead.coreBrandKey.length >= 3 && handleClean.includes(lead.coreBrandKey)
    );

    // Check A1: Did Serper return a live custom website belonging to this candidate?
    if (isCustomWebsiteUrl(link) && doesOrganicResultBelongToCandidate(org, lead, options.city, rIdx)) {
      const aliveCheck = await checkWebsiteAlive(link);
      if (aliveCheck.alive) {
        hiddenCustomWebsite = link;
        break;
      }
    }

    // Check A2: Did this candidate's social/directory listing mention a live custom domain in snippet?
    if (coreMatch || phoneMatch || handleMatchesBrand) {
      combinedSearchText += ` ${title} ${snippet}`;

      if (!phoneDisplay) {
        const foundPhone = extractPhoneFromText(`${title} ${snippet}`, options.country);
        if (foundPhone) phoneDisplay = foundPhone;
      }

      const snippetDomains = extractCustomDomainsFromSnippet(snippet);
      for (const domain of snippetDomains) {
        const siteCheck = await checkWebsiteAlive(`https://${domain}`);
        if (siteCheck.alive) {
          hiddenCustomWebsite = `https://${domain}`;
          break;
        }
      }
      if (hiddenCustomWebsite) break;

      // Check B: Extract verified Instagram / Facebook / Linktree handle & URL
      if (!isNonProfileSocialUrl(link)) {
        const lowerLink = link.toLowerCase();
        if (lowerLink.includes('instagram.com') || lowerLink.includes('instagr.am')) {
          const handle = inlineHandle;
          if (handle) {
            verifiedIgHandle = handle;
            verifiedSocialUrl = link;
          }
        } else if (lowerLink.includes('linktr.ee')) {
          if (!verifiedSocialUrl) verifiedSocialUrl = link;
        } else if (lowerLink.includes('facebook.com') || lowerLink.includes('fb.com')) {
          const fbHandle = extractSocialHandleFromUrl(link);
          if (fbHandle && !verifiedFbHandle) {
            verifiedFbHandle = fbHandle;
          }
          if (!verifiedSocialUrl) verifiedSocialUrl = link;
        }
      }
    }
  }

  if (hiddenCustomWebsite) {
    if (lead.coreBrandKey) knownWebsiteBrandKeys.set(lead.coreBrandKey, hiddenCustomWebsite);
    if (lead.phoneKey) knownWebsitePhones.set(lead.phoneKey, hiddenCustomWebsite);
    console.log(
      `  [-] Skipping ${lead.businessName}: Google cross-check found active website (${hiddenCustomWebsite})`
    );
    return null;
  }

  // Recompute final handle preference: Instagram handle > Stage 1 verified handle > Facebook handle > slug
  let extractedHandle = verifiedIgHandle || lead.verifiedHandle || verifiedFbHandle;
  let hasVerifiedSocial = Boolean(extractedHandle);

  const signals: string[] = [];
  let score = 20;

  if (lead.websiteStatus === 'broken') {
    score += 35;
    signals.push('Broken/Dead Website Domain');
  } else if (lead.websiteStatus === 'none') {
    score += 35;
    signals.push('No Website on Google');
  }

  if (lead.websiteStatus === 'linktree' || verifiedSocialUrl.toLowerCase().includes('linktr.ee')) {
    score += 25;
    signals.push('Linktree Bio - No Quote Site');
  } else if (
    lead.websiteStatus === 'social' ||
    verifiedSocialUrl.toLowerCase().includes('instagram.com') ||
    verifiedSocialUrl.toLowerCase().includes('facebook.com')
  ) {
    score += 25;
    signals.push('Social-Only (IG/FB) Presence');
  }

  if (lead.reviewCount >= 5 && lead.reviewCount <= 90) {
    score += 15;
    signals.push('Sweet-Spot Reviews');
  }

  const numericRating = Number.parseFloat(lead.ratingScore);
  if (!Number.isNaN(numericRating) && numericRating >= 4.5) {
    score += 10;
    signals.push('High Rating');
  }

  if (hasVerifiedSocial) {
    score += 10;
    signals.push('Verified Social Profile');
  } else {
    extractedHandle = cleanBusinessSlugHandle(lead.businessName);
    signals.push('Verify IG Handle');
  }

  const servicesObserved: string[] = [];
  const lowerCombined = combinedSearchText.toLowerCase();
  const highTicketTerms: Array<[string, string]> = [
    ['ceramic', 'ceramic coating'],
    ['paint correction', 'paint correction'],
    ['interior reset', 'interior reset'],
    ['machine polish', 'machine polishing'],
    ['valet', 'mobile valeting'],
    ['detail', 'full detailing'],
  ];
  for (const [term, label] of highTicketTerms) {
    if (lowerCombined.includes(term) && !servicesObserved.includes(label)) {
      servicesObserved.push(label);
    }
  }

  if (servicesObserved.length > 0) {
    score += 10;
    signals.push('High-Ticket Detailing Menu');
  }

  const finalWebsiteUrl =
    verifiedSocialUrl ||
    (lead.websiteStatus === 'social' || lead.websiteStatus === 'linktree'
      ? lead.websiteUrl
      : '');

  const effectiveWebsiteStatus: WebsiteStatus =
    lead.websiteStatus === 'broken'
      ? 'broken'
      : finalWebsiteUrl.toLowerCase().includes('linktr.ee')
        ? 'linktree'
        : finalWebsiteUrl
          ? 'social'
          : 'none';

  const serviceArea = `${cityShort} & nearby areas`;
  const personalizationNote = buildDeterministicNote({
    businessName: lead.businessName,
    city: lead.city,
    country: lead.country,
    servicesObserved,
    websiteStatus: effectiveWebsiteStatus,
    instagramHandle: extractedHandle!,
    hasPhone: Boolean(phoneDisplay),
  });

  return {
    index,
    businessName: lead.businessName,
    city: lead.city,
    country: lead.country,
    serviceArea,
    phoneDisplay,
    instagramHandle: extractedHandle!,
    websiteUrl: finalWebsiteUrl,
    websiteStatus: effectiveWebsiteStatus,
    ratingScore: lead.ratingScore,
    reviewCount: lead.reviewCount,
    baseFitScore: Math.max(1, Math.min(100, score)),
    fitSignals: signals.slice(0, 6),
    hasInstantQuote: false,
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
    websiteStatus: c.websiteStatus,
    socialOrPhoneOnly: true,
    instagramHandle: c.instagramHandle,
    baseFitScore: c.baseFitScore,
    fitSignals: c.fitSignals,
    servicesObserved: c.servicesObserved,
  }));

  const prompt = [
    `You are ranking verified NO-WEBSITE / SOCIAL-ONLY mobile car detailing or valeting prospects in ${options.city} (${options.country}) for a 60-second instant quote calculator preview.`,
    `Every candidate below has been verified to lack an active custom quote website (relying on Google Maps phone, Instagram, Facebook, Linktree, or an offline domain).`,
    `Pick the top ${Math.min(options.limit, candidates.length)} candidates by their exact "index".`,
    `For each selected candidate:`,
    `1) Return "fitScore" (integer 1-100).`,
    `2) Return "serviceArea" (3-4 real nearby suburbs/towns around ${options.city}, comma-separated).`,
    `3) Return a truthful 1-line "personalizationNote" (max 210 chars) highlighting their social/phone enquiry workflow and lack of an instant quote site. NEVER claim they have a website. NEVER use em dashes (use hyphens or commas instead).`,
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

  const distinctCities = Array.from(
    new Set(candidates.map((c) => c.city.trim()).filter(Boolean))
  );
  for (const city of distinctCities) {
    statements.push(
      `DELETE FROM lead_candidates WHERE lower(city) = lower(${sqlQuote(city)}) AND status = 'new';`
    );
  }

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
  console.log('\n=== QuotesDock No-Website / Social-Only Scout Results ===');
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
    console.log(`   Link: ${c.websiteUrl || 'No Website Listed (Maps/Phone Only)'}`);
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

  const { leads, knownWebsiteBrandKeys, knownWebsitePhones } =
    await discoverCandidates(options, serperApiKey);
  if (leads.length === 0) {
    console.log(`No no-website detailing candidates found for "${options.city}".`);
    return;
  }

  console.log(
    `[Stage 2] Running Google cross-checks on up to ${leads.length} candidates to eliminate hidden websites...`
  );
  const inspectedList: InspectedCandidate[] = [];
  const targetPoolSize = Math.max(options.limit + 2, 7);

  for (let i = 0; i < leads.length; i += 1) {
    if (inspectedList.length >= targetPoolSize) break;
    const inspected = await inspectCandidateWithCrossCheck(
      leads[i],
      i,
      options,
      serperApiKey,
      knownWebsiteBrandKeys,
      knownWebsitePhones
    );
    if (inspected) {
      inspectedList.push(inspected);
    }
  }

  if (inspectedList.length === 0) {
    console.log('All discovered candidates were disqualified (active websites detected).');
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
