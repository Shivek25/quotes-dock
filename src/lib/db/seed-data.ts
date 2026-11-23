import type {
  CountryCode,
  DetailingAddon,
  DetailingPackage,
  JobProofItem,
  OutreachChannel,
} from './schema';

export interface SeedProspectBundle {
  prospect: {
    id: string;
    slug: string;
    businessName: string;
    niche: string;
    city: string;
    country: CountryCode;
    currencySymbol: string;
    postalLabel: string;
    serviceArea: string;
    phoneDisplay: string;
    instagramHandle: string;
    ratingScore: string;
    reviewCount: number;
    ratingSource: string;
    tagline: string;
    heroHeadline: string;
    heroSubheadline: string;
    turnaroundBadge: string;
    packages: DetailingPackage[];
    addons: DetailingAddon[];
    gallery: JobProofItem[];
    trustPoints: string[];
    personalizationNote: string;
    mode: 'preview' | 'live';
    ownerEmail: string | null;
    createdAt: string;
  };
  drafts: Array<{
    id: string;
    channel: OutreachChannel;
    recipientHandle: string;
    personalizationNote: string;
    messageBody: string;
    approvalStatus: 'draft' | 'approved' | 'sent_manually' | 'replied';
  }>;
}

export function buildPackagesForBasePrice(basePrice: number, country: CountryCode): DetailingPackage[] {
  const isUk = country === 'UK';
  const washBase = Math.max(45, Math.round(basePrice * 0.6));
  const fullBase = basePrice;
  const ceramicBase = Math.round(basePrice * 1.55);

  return [
    {
      id: 'pkg-refresh',
      name: isUk ? 'Maintenance Valet' : 'Driveway Express Refresh',
      tagline: 'Ideal for daily drivers kept in tidy condition',
      durationLabel: '1.5 - 2 hrs at your driveway',
      prices: {
        sedan: washBase,
        suv: washBase + 25,
        truck_xl: washBase + 45,
      },
      features: [
        'pH-neutral snow foam pre-wash & safe hand wash',
        'Deep wheel faces, barrels, and tire satin dressing',
        'Full cabin vacuum, floor mats, and dash wipe-down',
        'Streak-free interior & exterior glass polish',
      ],
    },
    {
      id: 'pkg-full-reset',
      name: isUk ? 'Full Deep Valet Reset' : 'Full Interior & Exterior Reset',
      tagline: 'Our most booked transformation for busy owners',
      durationLabel: '2.5 - 3.5 hrs at your driveway',
      popular: true,
      prices: {
        sedan: fullBase,
        suv: fullBase + 35,
        truck_xl: fullBase + 65,
      },
      features: [
        'Everything in Refresh plus iron & bug decontamination',
        'Heated upholstery/carpet extraction & leather conditioning',
        'Steam sanitization of vents, cupholders, and door cards',
        '3-month hydrophobic SiO2 spray sealant protection',
      ],
    },
    {
      id: 'pkg-gloss-ceramic',
      name: isUk ? 'Gloss Enhancement & Ceramic' : '1-Step Gloss & 12-Mo Ceramic',
      tagline: 'Swirl reduction & deep mirror gloss for prized vehicles',
      durationLabel: '4 - 5 hrs on-site',
      prices: {
        sedan: ceramicBase,
        suv: ceramicBase + 45,
        truck_xl: ceramicBase + 85,
      },
      features: [
        'Clay bar decontamination + 1-step machine polish',
        'Removes light wash swirls and restores wet-look depth',
        '12-month SiO2 ceramic paint & trim coating',
        'Full deep interior steam clean & UV dressing',
      ],
    },
  ];
}

export function buildAddons(country: CountryCode): DetailingAddon[] {
  const isUk = country === 'UK';
  return [
    {
      id: 'addon-sealant',
      name: isUk ? '6-Month Hydro Sealant' : '6-Month Ceramic Hydro Sealant',
      price: isUk ? 30 : 35,
      description: 'Adds intense water beading & UV paint shield',
    },
    {
      id: 'addon-headlights',
      name: 'Headlight Clarity Restoration',
      price: isUk ? 40 : 45,
      description: 'Sands, polishes & UV-seals oxidized cloudy lenses',
    },
    {
      id: 'addon-engine',
      name: 'Engine Bay Degrease & Dress',
      price: isUk ? 30 : 35,
      description: 'Safe low-pressure rinse + OEM matte finish',
    },
    {
      id: 'addon-odor',
      name: 'Cabin Odor & Ozone Neutralizer',
      price: isUk ? 35 : 40,
      description: 'Targets lingering smoke, food, or pet odors',
    },
  ];
}

export function buildDefaultGallery(city: string, country: CountryCode): JobProofItem[] {
  const isUk = country === 'UK';
  return [
    {
      id: 'job-1',
      title: 'Black Clear-Coat Swirl Removal',
      vehicleLabel: isUk ? '2023 Range Rover Sport' : '2023 Ford F-150 Lariat',
      servicePerformed: '1-Step Gloss & 12-Mo Ceramic',
      resultSummary: 'Removed heavy brush-wash hazing and restored deep obsidian mirror reflection in the owner driveway.',
      beforeNote: 'Dull haze + water spots across hood & doors',
      afterNote: 'High-gloss hydrophobic finish with 12-mo protection',
      accentHex: '#0369A1',
    },
    {
      id: 'job-2',
      title: 'Family SUV Spill & Seat Reset',
      vehicleLabel: isUk ? '2021 Volvo XC90' : '2022 Honda Pilot Touring',
      servicePerformed: 'Full Interior & Exterior Reset',
      resultSummary: 'Extracted coffee and snack stains from second-row upholstery and steam-cleaned all crevices.',
      beforeNote: 'Embedded kid snacks, sticky cupholders, salt marks',
      afterNote: 'Fresh matte OEM cabin, sanitized vents & extracted cloth',
      accentHex: '#0F766E',
    },
    {
      id: 'job-3',
      title: 'Stubborn Pet Hair & Mud Removal',
      vehicleLabel: isUk ? '2020 Audi Q5' : '2021 Subaru Outback',
      servicePerformed: 'Full Reset + Pet Hair Treatment',
      resultSummary: 'Lifted woven dog hair from rear cargo carpet and neutralized wet-dog odor completely.',
      beforeNote: 'Dense golden retriever hair woven into carpets',
      afterNote: 'Hair-free trunk & seats with neutral fresh scent',
      accentHex: '#1D4ED8',
    },
    {
      id: 'job-4',
      title: 'Brake Dust & Wheel Barrel Decontam',
      vehicleLabel: isUk ? '2022 BMW M340i' : '2022 Porsche Macan S',
      servicePerformed: 'Iron Decon + Wheel Sealant',
      resultSummary: 'Dissolved baked-on performance brake dust without harsh acids and sealed calipers.',
      beforeNote: 'Caked dark iron dust inside spoke barrels',
      afterNote: 'Bright metallic finish with satin tire dressing',
      accentHex: '#334155',
    },
    {
      id: 'job-5',
      title: 'Cream Leather Conditioning Reset',
      vehicleLabel: isUk ? '2021 Mercedes E-Class' : '2022 Lexus RX 350',
      servicePerformed: 'Gentle Leather Steam & Nourish',
      resultSummary: 'Lifted denim dye transfer from driver bolsters and left supple, non-greasy OEM matte leather.',
      beforeNote: 'Shiny oil buildup & blue denim dye on bolster',
      afterNote: 'Clean matte factory leather texture',
      accentHex: '#0369A1',
    },
    {
      id: 'job-6',
      title: 'Oxidation-Free Headlight Clarity',
      vehicleLabel: isUk ? '2018 VW Golf GTI' : '2018 Toyota 4Runner',
      servicePerformed: 'Multi-Stage Wet Sand & UV Coat',
      resultSummary: `Completed on-site in ${city} to restore night visibility and clean front-end appearance.`,
      beforeNote: 'Yellowed, hazy polycarbonate lenses',
      afterNote: 'Crystal clear clarity sealed against UV fade',
      accentHex: '#15803D',
    },
  ];
}

export const SANDBOX_DEMO_SLUGS = [
  'apex-gloss-austin',
  'velvet-foam-charlotte',
  'cotswold-valet-uk',
] as const;

export function isSandboxDemoSlug(slug: string): boolean {
  return (SANDBOX_DEMO_SLUGS as readonly string[]).includes(slug);
}

export function normalizeInstagramHandle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '@detailer';

  // Extract handle if user pasted a full Instagram or Facebook profile URL
  const cleanedUrl = trimmed
    .replace(/^https?:\/\/(www\.)?(instagram\.com|instagr\.am|facebook\.com|fb\.com)\//i, '')
    .split(/[?#]/)[0]
    .replace(/^\/+|\/+$/g, '');

  const firstSegment = cleanedUrl.split('/')[0]?.trim() || trimmed;
  if (!firstSegment) return '@detailer';
  return firstSegment.startsWith('@') ? firstSegment : `@${firstSegment}`;
}

export function buildOutreachDrafts(params: {
  prospectId: string;
  slug: string;
  businessName: string;
  city: string;
  country?: CountryCode;
  instagramHandle: string;
  personalizationNote: string;
}): Array<{
  id: string;
  channel: OutreachChannel;
  recipientHandle: string;
  personalizationNote: string;
  messageBody: string;
  approvalStatus: 'draft';
}> {
  const previewPath = `/p/${params.slug}`;
  const cleanHandle = normalizeInstagramHandle(params.instagramHandle);
  const isUk = params.country === 'UK';
  const setupLabel = isUk ? '£39 one-time founding setup' : '$50 one-time founding setup';
  const fullOfferLabel = isUk ? '£39 one-time (+ £12/mo)' : '$50 one-time (+ $15/mo)';

  return [
    {
      id: `${params.prospectId}-ig`,
      channel: 'instagram_dm',
      recipientHandle: cleanHandle,
      personalizationNote: params.personalizationNote,
      approvalStatus: 'draft',
      messageBody:
        `Hey ${params.businessName} team - ${params.personalizationNote}. ` +
        `I put together a quick mobile quote page preview for your ${params.city} jobs so customers can pick their vehicle size, see an estimate range, and send you a job request in 60 seconds: ${previewPath}\n\n` +
        `Try submitting a test quote on it to see the instant notification summary. Zero obligation - if you like it, I can swap in 6 of your real job photos and make it live this week for a ${setupLabel}.`,
    },
    {
      id: `${params.prospectId}-fb`,
      channel: 'facebook_msg',
      recipientHandle: `${params.businessName} (${params.city})`,
      personalizationNote: params.personalizationNote,
      approvalStatus: 'draft',
      messageBody:
        `Hi there! ${params.personalizationNote}. ` +
        `Instead of sending a cold pitch, I built a live mobile-first "60-Second Quote" page preview specifically for ${params.businessName}: ${previewPath}\n\n` +
        `Customers tap Sedan/SUV/Truck + package and send their postal code straight to you. Feel free to run a test quote on the preview link - happy to drop in your actual job photos if you want to launch it.`,
    },
    {
      id: `${params.prospectId}-email`,
      channel: 'email',
      recipientHandle: `${params.businessName} Owner`,
      personalizationNote: params.personalizationNote,
      approvalStatus: 'draft',
      messageBody:
        `Subject: Built a 60-second driveway quote preview for ${params.businessName}\n\n` +
        `Hi ${params.businessName} team,\n\n` +
        `${params.personalizationNote}, so I put together a working mobile quote-page preview for you in ${params.city}:\n` +
        `${previewPath}\n\n` +
        `When a customer picks their vehicle size and package, it shows an estimated price range and sends the lead directly to you. You can test the form right on that link to preview how leads arrive.\n\n` +
        `If it looks useful, our founding-client launch setup is ${fullOfferLabel} including up to 6 of your real job photos and custom edits in 24 hours. Want me to swap your photos in?\n\n` +
        `Best,\nQuotesDock`,
    },
  ];
}

export function buildDefaultDetailingConfig(input: {
  id: string;
  slug: string;
  businessName: string;
  city: string;
  country: CountryCode;
  serviceArea: string;
  phoneDisplay: string;
  instagramHandle: string;
  ratingScore: string;
  reviewCount: number;
  personalizationNote: string;
  baseSedanPrice?: number;
}): SeedProspectBundle {
  const isUk = input.country === 'UK';
  const currencySymbol = isUk ? '£' : '$';
  const postalLabel = isUk ? 'Postcode' : 'Zip Code';
  const basePrice = input.baseSedanPrice ?? (isUk ? 115 : 145);

  return {
    prospect: {
      id: input.id,
      slug: input.slug,
      businessName: input.businessName,
      niche: 'mobile_detailing',
      city: input.city,
      country: input.country,
      currencySymbol,
      postalLabel,
      serviceArea: input.serviceArea,
      phoneDisplay: input.phoneDisplay,
      instagramHandle: input.instagramHandle,
      ratingScore: input.ratingScore,
      reviewCount: input.reviewCount,
      ratingSource: 'Public customer reviews',
      tagline: `Self-contained mobile ${isUk ? 'valeting & ' : ''}detailing brought to your driveway in ${input.city}`,
      heroHeadline: `Showroom Gloss at Your Driveway in ${input.city}`,
      heroSubheadline: `We bring deionized water, quiet power, and studio-grade detailing straight to your home or office. Select your vehicle below for an instant price estimate in 60 seconds.`,
      turnaroundBadge: 'Same-Week Driveway Slots Open',
      packages: buildPackagesForBasePrice(basePrice, input.country),
      addons: buildAddons(input.country),
      gallery: buildDefaultGallery(input.city, input.country),
      trustPoints: [
        '100% Self-Contained Water & Power',
        'pH-Neutral & Clear-Coat Safe',
        'Insured Mobile Technician',
        'No Upfront Card Required',
      ],
      personalizationNote: input.personalizationNote,
      mode: 'preview',
      ownerEmail: null,
      createdAt: new Date().toISOString(),
    },
    drafts: buildOutreachDrafts({
      prospectId: input.id,
      slug: input.slug,
      businessName: input.businessName,
      city: input.city,
      country: input.country,
      instagramHandle: normalizeInstagramHandle(input.instagramHandle),
      personalizationNote: input.personalizationNote,
    }),
  };
}

export const INITIAL_SEED_PROSPECTS: SeedProspectBundle[] = [
  {
    prospect: {
      id: 'pros_apex_austin',
      slug: 'apex-gloss-austin',
      businessName: 'Apex Gloss Mobile Detailing',
      niche: 'mobile_detailing',
      city: 'Austin, TX',
      country: 'US',
      currencySymbol: '$',
      postalLabel: 'Zip Code',
      serviceArea: 'Greater Austin, Round Rock, Cedar Park & Westlake',
      phoneDisplay: '(512) 555-0148',
      instagramHandle: '@apexgloss.atx',
      ratingScore: '4.9',
      reviewCount: 94,
      ratingSource: 'Verified public review summary',
      tagline: 'Deionized spot-free mobile detailing & ceramic protection in Austin',
      heroHeadline: 'Spot-Free Ceramic Gloss at Your Austin Driveway',
      heroSubheadline: 'Zero swirl marks, zero drop-off hassle. Our mobile rig arrives with spot-free water and studio lighting to reset your car at home or work.',
      turnaroundBadge: 'Austin & Westlake Slots Open',
      packages: buildPackagesForBasePrice(155, 'US'),
      addons: buildAddons('US'),
      gallery: buildDefaultGallery('Austin, TX', 'US'),
      trustPoints: [
        'Spot-Free Deionized Water Tank',
        'Self-Powered Quiet Mobile Rig',
        'Ceramic & PPF Safe Products',
        'Fully Insured in Travis County',
      ],
      personalizationNote: 'Noticed your @apexgloss.atx ceramic coating reels get great engagement, and your bio currently goes straight to a generic Linktree without a quick quote form',
      mode: 'preview',
      ownerEmail: null,
      createdAt: '2026-11-12T10:00:00.000Z',
    },
    drafts: buildOutreachDrafts({
      prospectId: 'pros_apex_austin',
      slug: 'apex-gloss-austin',
      businessName: 'Apex Gloss Mobile Detailing',
      city: 'Austin, TX',
      instagramHandle: '@apexgloss.atx',
      personalizationNote: 'Noticed your @apexgloss.atx ceramic coating reels get great engagement, and your bio currently goes straight to a generic Linktree without a quick quote form',
    }),
  },
  {
    prospect: {
      id: 'pros_velvet_charlotte',
      slug: 'velvet-foam-charlotte',
      businessName: 'Velvet Foam Auto Care',
      niche: 'mobile_detailing',
      city: 'Charlotte, NC',
      country: 'US',
      currencySymbol: '$',
      postalLabel: 'Zip Code',
      serviceArea: 'South End, Myers Park, Ballantyne & Lake Norman',
      phoneDisplay: '(704) 555-0192',
      instagramHandle: '@velvetfoam.clt',
      ratingScore: '5.0',
      reviewCount: 68,
      ratingSource: 'Verified public review summary',
      tagline: 'Deep interior resets, pet hair removal & showroom shine in Charlotte',
      heroHeadline: 'Family SUV & Daily Driver Resets Done at Your Home',
      heroSubheadline: 'Built for busy Charlotte families and commuters. We steam-sanitize interiors, lift stubborn pet hair, and lock in crisp gloss while you work from home.',
      turnaroundBadge: 'Next-Day Interior Slots Available',
      packages: buildPackagesForBasePrice(140, 'US'),
      addons: buildAddons('US'),
      gallery: buildDefaultGallery('Charlotte, NC', 'US'),
      trustPoints: [
        'Non-Toxic Interior Steam Sanitizing',
        'Specialist Pet Hair Extraction',
        'Water & Power Included On Board',
        'Upfront Estimate Before We Arrive',
      ],
      personalizationNote: 'Saw your recent Facebook interior transformation posts around South End and noticed your website link currently shows an expired domain screen',
      mode: 'preview',
      ownerEmail: null,
      createdAt: '2026-11-12T11:30:00.000Z',
    },
    drafts: buildOutreachDrafts({
      prospectId: 'pros_velvet_charlotte',
      slug: 'velvet-foam-charlotte',
      businessName: 'Velvet Foam Auto Care',
      city: 'Charlotte, NC',
      instagramHandle: '@velvetfoam.clt',
      personalizationNote: 'Saw your recent Facebook interior transformation posts around South End and noticed your website link currently shows an expired domain screen',
    }),
  },
  {
    prospect: {
      id: 'pros_cotswold_uk',
      slug: 'cotswold-valet-uk',
      businessName: 'Cotswold Mobile Valet & Detail',
      niche: 'mobile_detailing',
      city: 'Cheltenham, UK',
      country: 'UK',
      currencySymbol: '£',
      postalLabel: 'Postcode',
      serviceArea: 'Cheltenham, Gloucester, Cirencester & Tewkesbury',
      phoneDisplay: '01242 555 017',
      instagramHandle: '@cotswoldvalet.uk',
      ratingScore: '4.9',
      reviewCount: 112,
      ratingSource: 'Verified public review summary',
      tagline: 'Pure-water mobile valeting, machine polishing & ceramic sealants across Gloucestershire',
      heroHeadline: 'Studio-Standard Mobile Valeting Across Cheltenham',
      heroSubheadline: 'Pure filtered water, safe two-bucket contact washing, and deep cabin extraction on your driveway or workplace car park.',
      turnaroundBadge: 'Gloucestershire Mobile Unit Ready',
      packages: buildPackagesForBasePrice(115, 'UK'),
      addons: buildAddons('UK'),
      gallery: buildDefaultGallery('Cheltenham, UK', 'UK'),
      trustPoints: [
        'Pure Filtered Spotless Water Tank',
        'Fully Insured Motor Trade Policy',
        'Safe Microfibre & pH-Neutral Chemistry',
        'Instant Postcode Quote Check',
      ],
      personalizationNote: 'Loved the Range Rover machine polish clip on @cotswoldvalet.uk and noticed prospects currently have to DM back and forth just to get a rough valet price',
      mode: 'preview',
      ownerEmail: null,
      createdAt: '2026-11-12T13:00:00.000Z',
    },
    drafts: buildOutreachDrafts({
      prospectId: 'pros_cotswold_uk',
      slug: 'cotswold-valet-uk',
      businessName: 'Cotswold Mobile Valet & Detail',
      city: 'Cheltenham, UK',
      country: 'UK',
      instagramHandle: '@cotswoldvalet.uk',
      personalizationNote: 'Loved the Range Rover machine polish clip on @cotswoldvalet.uk and noticed prospects currently have to DM back and forth just to get a rough valet price',
    }),
  },
];
