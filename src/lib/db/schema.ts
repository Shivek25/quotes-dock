import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export type VehicleSizeKey = 'sedan' | 'suv' | 'truck_xl';
export type ConditionLevel = 'standard' | 'pet_hair' | 'heavy_soil';
export type CountryCode = 'US' | 'UK';
export type ProspectMode = 'preview' | 'live';
export type OutreachChannel = 'instagram_dm' | 'facebook_msg' | 'email';
export type OutreachApprovalStatus = 'draft' | 'approved' | 'sent_manually' | 'replied';

export interface DetailingPackage {
  id: string;
  name: string;
  tagline: string;
  durationLabel: string;
  prices: Record<VehicleSizeKey, number>;
  features: string[];
  popular?: boolean;
}

export interface DetailingAddon {
  id: string;
  name: string;
  price: number;
  description: string;
}

export interface JobProofItem {
  id: string;
  title: string;
  vehicleLabel: string;
  servicePerformed: string;
  resultSummary: string;
  beforeNote: string;
  afterNote: string;
  accentHex: string;
  imageUrl?: string;
  beforeImageUrl?: string;
}

export const prospects = sqliteTable('prospects', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  businessName: text('business_name').notNull(),
  niche: text('niche').notNull().default('mobile_detailing'),
  city: text('city').notNull(),
  country: text('country').notNull().default('US'),
  currencySymbol: text('currency_symbol').notNull().default('$'),
  postalLabel: text('postal_label').notNull().default('Zip Code'),
  serviceArea: text('service_area').notNull(),
  phoneDisplay: text('phone_display').notNull(),
  instagramHandle: text('instagram_handle').notNull(),
  ratingScore: text('rating_score').notNull(),
  reviewCount: integer('review_count').notNull(),
  ratingSource: text('rating_source').notNull(),
  tagline: text('tagline').notNull(),
  heroHeadline: text('hero_headline').notNull(),
  heroSubheadline: text('hero_subheadline').notNull(),
  turnaroundBadge: text('turnaround_badge').notNull(),
  packagesJson: text('packages_json').notNull(),
  addonsJson: text('addons_json').notNull(),
  galleryJson: text('gallery_json').notNull(),
  trustPointsJson: text('trust_points_json').notNull(),
  personalizationNote: text('personalization_note').notNull(),
  mode: text('mode').notNull().default('preview'),
  ownerEmail: text('owner_email'),
  createdAt: text('created_at').notNull(),
});

export const quoteRequests = sqliteTable('quote_requests', {
  id: text('id').primaryKey(),
  prospectId: text('prospect_id').notNull(),
  slug: text('slug').notNull(),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerPostal: text('customer_postal').notNull(),
  vehicleSize: text('vehicle_size').notNull(),
  packageId: text('package_id').notNull(),
  packageName: text('package_name').notNull(),
  conditionLevel: text('condition_level').notNull(),
  addonsSelectedJson: text('addons_selected_json').notNull(),
  estimatedMin: integer('estimated_min').notNull(),
  estimatedMax: integer('estimated_max').notNull(),
  preferredTiming: text('preferred_timing').notNull(),
  notes: text('notes'),
  isPreviewTest: integer('is_preview_test').notNull().default(1),
  ipHash: text('ip_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

export const outreachDrafts = sqliteTable('outreach_drafts', {
  id: text('id').primaryKey(),
  prospectId: text('prospect_id').notNull(),
  slug: text('slug').notNull(),
  channel: text('channel').notNull(),
  recipientHandle: text('recipient_handle').notNull(),
  personalizationNote: text('personalization_note').notNull(),
  messageBody: text('message_body').notNull(),
  approvalStatus: text('approval_status').notNull().default('draft'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type ProspectRow = typeof prospects.$inferSelect;
export type QuoteRequestRow = typeof quoteRequests.$inferSelect;
export type OutreachDraftRow = typeof outreachDrafts.$inferSelect;

export interface ParsedProspect extends Omit<
  ProspectRow,
  'packagesJson' | 'addonsJson' | 'galleryJson' | 'trustPointsJson' | 'country' | 'mode'
> {
  country: CountryCode;
  mode: ProspectMode;
  packages: DetailingPackage[];
  addons: DetailingAddon[];
  gallery: JobProofItem[];
  trustPoints: string[];
}
