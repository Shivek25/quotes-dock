import type { APIRoute } from 'astro';
import {
  calculateServerQuoteEstimate,
  countRecentQuotesByIp,
  createQuoteRequest,
  getProspectBySlug,
} from '../../lib/db/repository';
import type { VehicleSizeKey } from '../../lib/db/schema';
import { extractClientIp, hashClientIp } from '../../lib/security/auth';
import { quoteSubmissionSchema } from '../../lib/validation/schemas';

const VEHICLE_LABELS: Record<VehicleSizeKey, string> = {
  sedan: 'Coupe / Sedan',
  suv: 'Mid-Size SUV / Crossover',
  truck_xl: '3-Row SUV / Pickup Truck',
};

const CONDITION_LABELS = {
  standard: 'Standard Daily Condition',
  pet_hair: 'Pet Hair Removal Needed',
  heavy_soil: 'Heavy Mud / Interior Soil',
} as const;

const TIMING_LABELS = {
  this_week: 'This Week',
  next_week: 'Next Week',
  flexible: 'Flexible Schedule',
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const rawBody = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400);
    }

    // Honeypot check: silently acknowledge bots without writing to D1
    const honeypot = (rawBody as Record<string, unknown>).website_url;
    if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
      return jsonResponse({
        ok: true,
        mode: 'preview',
        quote: null,
        ownerPreview: null,
      });
    }

    const parsed = quoteSubmissionSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return jsonResponse(
        {
          ok: false,
          error: firstIssue?.message || 'Please check the highlighted form fields.',
          field: firstIssue?.path?.[0] || null,
        },
        400
      );
    }

    const data = parsed.data;
    const d1 = locals.runtime.env.DB;
    const prospect = await getProspectBySlug(d1, data.slug);

    if (!prospect) {
      return jsonResponse(
        { ok: false, error: 'This detailing preview page could not be found.' },
        404
      );
    }

    const ipHash = await hashClientIp(extractClientIp(request));
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recentCount = await countRecentQuotesByIp(d1, ipHash, tenMinutesAgo);

    if (recentCount >= 5) {
      return jsonResponse(
        {
          ok: false,
          error: 'Too many quote requests in a short time. Please wait a few minutes before submitting again.',
        },
        429
      );
    }

    const estimate = calculateServerQuoteEstimate(prospect, {
      vehicleSize: data.vehicleSize,
      packageId: data.packageId,
      conditionLevel: data.conditionLevel,
      addonsSelected: data.addonsSelected,
    });

    if (!estimate) {
      return jsonResponse(
        { ok: false, error: 'Selected service package is not valid for this detailer.' },
        400
      );
    }

    const isFounderSelfTest = Boolean(data.isFounderSelfTest);
    const quoteId = isFounderSelfTest
      ? 'q_founder_test'
      : `q_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const addonNames = estimate.selectedAddons.map((a) => a.name);

    if (!isFounderSelfTest) {
      await createQuoteRequest(d1, {
        id: quoteId,
        prospectId: prospect.id,
        slug: prospect.slug,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerPostal: data.customerPostal,
        vehicleSize: data.vehicleSize,
        packageId: estimate.packageObj.id,
        packageName: estimate.packageObj.name,
        conditionLevel: data.conditionLevel,
        addonsSelectedNames: addonNames,
        estimatedMin: estimate.estimatedMin,
        estimatedMax: estimate.estimatedMax,
        preferredTiming: data.preferredTiming,
        notes: data.notes,
        isPreviewTest: prospect.mode === 'preview',
        ipHash,
      });
    }

    const priceRange = `${prospect.currencySymbol}${estimate.estimatedMin} - ${prospect.currencySymbol}${estimate.estimatedMax}`;
    const addonsSummary = addonNames.length > 0 ? addonNames.join(', ') : 'None';
    const timingLabel = TIMING_LABELS[data.preferredTiming];
    const vehicleLabel = VEHICLE_LABELS[data.vehicleSize];
    const conditionLabel = CONDITION_LABELS[data.conditionLevel];

    const smsPreview =
      `NEW QUOTE LEAD (${prospect.businessName})\n` +
      `Customer: ${data.customerName} (${data.customerPhone})\n` +
      `${prospect.postalLabel}: ${data.customerPostal} | Timing: ${timingLabel}\n` +
      `Job: ${vehicleLabel} - ${estimate.packageObj.name}\n` +
      `Condition: ${conditionLabel}\n` +
      `Add-ons: ${addonsSummary}\n` +
      `Est. Shown: ${priceRange}` +
      (data.notes ? `\nNotes: ${data.notes}` : '');

    const emailSubject = `New ${priceRange} Mobile Detail Lead in ${data.customerPostal} (${data.customerName})`;
    let emailDispatched = false;

    const resendApiKey = locals.runtime.env.RESEND_API_KEY?.trim();
    if (
      prospect.mode === 'live' &&
      !isFounderSelfTest &&
      resendApiKey &&
      prospect.ownerEmail
    ) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'QuotesDock Alerts <onboarding@resend.dev>',
            to: [prospect.ownerEmail],
            subject: emailSubject,
            text: smsPreview,
          }),
          signal: AbortSignal.timeout(4000),
        });
        emailDispatched = res.ok;
      } catch (emailErr) {
        console.error('Resend notification failed:', emailErr);
      }
    }

    return jsonResponse({
      ok: true,
      mode: prospect.mode,
      isFounderSelfTest,
      emailDispatched,
      quote: {
        id: quoteId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerPostal: data.customerPostal,
        vehicleLabel,
        packageName: estimate.packageObj.name,
        durationLabel: estimate.packageObj.durationLabel,
        conditionLabel,
        addons: addonNames,
        estimatedMin: estimate.estimatedMin,
        estimatedMax: estimate.estimatedMax,
        priceRange,
        timingLabel,
        notes: data.notes,
      },
      ownerPreview:
        prospect.mode === 'preview' || isFounderSelfTest
          ? {
              smsPreview,
              emailSubject,
            }
          : null,
    });
  } catch (err) {
    console.error('Error in POST /api/quotes:', err);
    return jsonResponse(
      { ok: false, error: 'Unable to submit quote right now. Please try again.' },
      500
    );
  }
};
