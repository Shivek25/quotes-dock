import { z } from 'zod';

export const quoteSubmissionSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Invalid business page link'),
  customerName: z
    .string()
    .trim()
    .min(2, 'Please enter your name (at least 2 characters)')
    .max(80),
  customerPhone: z
    .string()
    .trim()
    .min(7, 'Please enter a valid mobile number')
    .max(30),
  customerPostal: z
    .string()
    .trim()
    .min(3, 'Please enter your Zip Code or Postcode')
    .max(16),
  vehicleSize: z.enum(['sedan', 'suv', 'truck_xl']),
  packageId: z.string().trim().min(1).max(50),
  conditionLevel: z.enum(['standard', 'pet_hair', 'heavy_soil']),
  addonsSelected: z.array(z.string().trim().max(50)).max(6).default([]),
  preferredTiming: z.enum(['this_week', 'next_week', 'flexible']),
  notes: z.string().trim().max(400).optional().default(''),
  website_url: z.string().max(0).optional().default(''),
  isFounderSelfTest: z.boolean().optional().default(false),
});

export const newProspectSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required').max(90),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .min(2)
    .max(80)
    .optional()
    .or(z.literal('')),
  city: z.string().trim().min(2, 'City is required').max(80),
  country: z.enum(['US', 'UK']).default('US'),
  serviceArea: z.string().trim().min(3, 'Service area is required').max(160),
  phoneDisplay: z.string().trim().max(30).optional().default(''),
  instagramHandle: z.string().trim().min(2, 'Instagram or Facebook handle is required').max(160),
  ratingScore: z.string().trim().min(1).max(10).default('4.9'),
  reviewCount: z.coerce.number().int().min(1).max(10000).default(45),
  personalizationNote: z
    .string()
    .trim()
    .min(5, 'Add a short 1-line personalization note so your outreach feels genuine')
    .max(280),
  baseSedanPrice: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce.number().int().min(45).max(1000).optional()
  ),
});

export const updateOutreachDraftSchema = z.object({
  id: z.string().trim().min(2).max(80),
  prospectId: z.string().trim().min(2).max(80),
  messageBody: z
    .string()
    .trim()
    .min(10, 'Message cannot be empty')
    .max(2000)
    .optional(),
  approvalStatus: z
    .enum(['draft', 'approved', 'sent_manually', 'replied'])
    .optional(),
});

const safePhotoUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (val) =>
      val === '' ||
      val.startsWith('/') ||
      val.startsWith('https://'),
    'Photo URLs must start with https:// or /'
  );

export const galleryItemEditSchema = z.object({
  id: z.string().trim().min(1).max(40).optional(),
  title: z.string().trim().min(2, 'Job title is too short').max(100),
  vehicleLabel: z.string().trim().min(2, 'Vehicle label is too short').max(80),
  servicePerformed: z.string().trim().min(2, 'Service performed is too short').max(100),
  resultSummary: z.string().trim().max(260).optional().default(''),
  beforeNote: z.string().trim().max(160).optional().default(''),
  afterNote: z.string().trim().max(160).optional().default(''),
  imageUrl: safePhotoUrlSchema.optional().default(''),
  beforeImageUrl: safePhotoUrlSchema.optional().default(''),
});

export const updateProspectModeSchema = z.object({
  prospectId: z.string().trim().min(2).max(80),
  mode: z.enum(['preview', 'live']).optional(),
  ownerEmail: z
    .string()
    .trim()
    .email('Please enter a valid owner email address')
    .optional()
    .or(z.literal('')),
  phoneDisplay: z.string().trim().max(30).optional(),
  serviceArea: z.string().trim().min(3, 'Service area is too short').max(160).optional(),
  baseSedanPrice: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce.number().int().min(45).max(1000).optional()
  ),
  photoUrls: z.array(safePhotoUrlSchema).max(6).optional(),
  galleryItems: z.array(galleryItemEditSchema).max(6).optional(),
  trustPoints: z
    .array(z.string().trim().min(2).max(90))
    .min(1)
    .max(6)
    .optional(),
});

export const deleteProspectSchema = z.object({
  prospectId: z.string().trim().min(2).max(80),
});

export const candidateItemSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80),
  country: z.enum(['US', 'UK']).default('US'),
  serviceArea: z.string().trim().min(2).max(180),
  phoneDisplay: z.string().trim().max(40).optional().default(''),
  instagramHandle: z.string().trim().min(2).max(160),
  websiteUrl: z.string().trim().max(400).optional().default(''),
  ratingScore: z.string().trim().min(1).max(10).default('4.9'),
  reviewCount: z.coerce.number().int().min(0).max(50000).default(35),
  fitScore: z.coerce.number().int().min(1).max(100).default(75),
  fitSignals: z.array(z.string().trim().max(80)).max(8).default([]),
  hasInstantQuote: z.boolean().optional().default(false),
  personalizationNote: z.string().trim().min(5).max(280),
});

export const upsertCandidatesBatchSchema = z.object({
  candidates: z.array(candidateItemSchema).min(1).max(10),
});

export const updateCandidateStatusSchema = z.object({
  id: z.string().trim().min(2).max(80),
  status: z.enum(['new', 'promoted', 'dismissed']),
});

export const newInquirySchema = z.object({
  inquiryType: z
    .enum(['free_preview_request', 'claim_page', 'removal_request'])
    .default('free_preview_request'),
  prospectId: z.string().trim().max(80).optional().default(''),
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]*$/, 'Invalid page slug')
    .optional()
    .default(''),
  businessName: z
    .string()
    .trim()
    .min(2, 'Please enter your detailing business name')
    .max(120),
  ownerName: z
    .string()
    .trim()
    .min(2, 'Please enter your name')
    .max(80),
  contactInfo: z
    .string()
    .trim()
    .min(4, 'Please enter an email, mobile number, or Instagram handle')
    .max(160),
  city: z.string().trim().max(80).optional().default(''),
  country: z.enum(['US', 'UK']).default('US'),
  planTier: z.enum(['founding', 'standard']).default('founding'),
  notes: z.string().trim().max(500).optional().default(''),
  website_url: z.string().max(0).optional().default(''),
});

export const updateInquiryStatusSchema = z.object({
  id: z.string().trim().min(2).max(80),
  status: z.enum(['new', 'contacted', 'paid', 'archived']),
});
