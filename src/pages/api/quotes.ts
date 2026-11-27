import type { APIRoute } from 'astro';
import {
  calculateServerQuoteEstimate,
  countRecentQuotesByIp,
  createQuoteRequest,
  getProspectBySlug,
  updateQuoteDeliveryStatus,
} from '../../lib/db/repository';
import type { QuoteDeliveryStatus, VehicleSizeKey } from '../../lib/db/schema';
import {
  extractClientIp,
  hashClientIp,
  isStudioAuthorized,
} from '../../lib/security/auth';
import { sendWebhookAlert } from '../../lib/alerts/webhook';
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

async function sendResendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
      signal: AbortSignal.timeout(4500),
    });

    if (res.ok) {
      return { ok: true };
    }

    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      error: `Resend HTTP ${res.status}: ${errText.slice(0, 180)}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 180) : 'Email request timed out',
    };
  }
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
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
    const env = locals.runtime.env;
    const d1 = env.DB;
    const prospect = await getProspectBySlug(d1, data.slug);

    if (!prospect) {
      return jsonResponse(
        { ok: false, error: 'This detailing preview page could not be found.' },
        404
      );
    }

    // Only honor founder self-test mode for authenticated Studio sessions
    const studioAuthed = await isStudioAuthorized(request, cookies, env);
    const isFounderSelfTest = Boolean(data.isFounderSelfTest) && studioAuthed;

    const ipHash = await hashClientIp(extractClientIp(request), env);
    if (!isFounderSelfTest) {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const recentCount = await countRecentQuotesByIp(d1, ipHash, tenMinutesAgo);

      if (recentCount >= 5) {
        return jsonResponse(
          {
            ok: false,
            error:
              'Too many quote requests in a short time. Please wait a few minutes before submitting again.',
          },
          429
        );
      }
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

    const quoteId = isFounderSelfTest
      ? 'q_founder_test'
      : `q_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const addonNames = estimate.selectedAddons.map((a) => a.name);

    let deliveryStatus: QuoteDeliveryStatus =
      prospect.mode === 'preview' ? 'preview_only' : 'not_applicable';
    let deliveryError: string | null = null;

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
        deliveryStatus,
        deliveryError: null,
        ipHash,
      });
    }

    const priceRange = `${prospect.currencySymbol}${estimate.estimatedMin} - ${prospect.currencySymbol}${estimate.estimatedMax}`;
    const addonsSummary = addonNames.length > 0 ? addonNames.join(', ') : 'None';
    const timingLabel = TIMING_LABELS[data.preferredTiming];
    const vehicleLabel = VEHICLE_LABELS[data.vehicleSize];
    const conditionLabel = CONDITION_LABELS[data.conditionLevel];
    const origin = new URL(request.url).origin;
    const ownerPortalUrl = prospect.ownerPortalToken
      ? `${origin}/owner/${prospect.ownerPortalToken}`
      : '';

    const smsPreview =
      `NEW QUOTE LEAD (${prospect.businessName})\n` +
      `Customer: ${data.customerName} (${data.customerPhone})\n` +
      `${prospect.postalLabel}: ${data.customerPostal} | Timing: ${timingLabel}\n` +
      `Job: ${vehicleLabel} - ${estimate.packageObj.name}\n` +
      `Condition: ${conditionLabel}\n` +
      `Add-ons: ${addonsSummary}\n` +
      `Est. Shown: ${priceRange}` +
      (data.notes ? `\nNotes: ${data.notes}` : '') +
      (ownerPortalUrl && prospect.mode === 'live' ? `\nManage Lead: ${ownerPortalUrl}` : '');

    const emailSubject = `New ${priceRange} Mobile Detail Lead in ${data.customerPostal} (${data.customerName})`;
    let emailDispatched = false;
    let webhookDispatched = false;

    if (prospect.mode === 'live' && !isFounderSelfTest) {
      const resendApiKey = env.RESEND_API_KEY?.trim() || '';
      const resendFromEmail = env.RESEND_FROM_EMAIL?.trim() || '';
      const founderAlertEmail = env.FOUNDER_ALERT_EMAIL?.trim() || '';
      const founderWebhookUrl = env.FOUNDER_WEBHOOK_URL?.trim() || '';
      const webhookSecret = env.WEBHOOK_SECRET?.trim() || '';
      const errors: string[] = [];

      const quoteWebhookPayload: Record<string, unknown> = {
        event: 'new_quote_lead',
        quoteId,
        businessName: prospect.businessName,
        slug: prospect.slug,
        ownerEmail: prospect.ownerEmail || null,
        customer: {
          name: data.customerName,
          phone: data.customerPhone,
          postal: data.customerPostal,
        },
        job: {
          vehicle: vehicleLabel,
          packageName: estimate.packageObj.name,
          condition: conditionLabel,
          addons: addonNames,
          estimatedMin: estimate.estimatedMin,
          estimatedMax: estimate.estimatedMax,
          priceRange,
          timing: timingLabel,
          notes: data.notes,
        },
        ownerPortalUrl: ownerPortalUrl || null,
      };

      // 1) Shop-level Webhook Alert (Discord / Slack / Make / Zapier)
      if (prospect.webhookUrl) {
        const whRes = await sendWebhookAlert({
          webhookUrl: prospect.webhookUrl,
          subject: emailSubject,
          to: prospect.ownerEmail || '',
          text: smsPreview,
          payload: quoteWebhookPayload,
        });
        if (whRes.ok) {
          webhookDispatched = true;
        } else if (whRes.error) {
          errors.push(whRes.error);
          console.error(`Webhook alert failed for ${quoteId}:`, whRes.error);
        }
      }

      // 2) Global Founder Webhook / Zero-Domain Gmail Relay (FOUNDER_WEBHOOK_URL)
      if (founderWebhookUrl && founderWebhookUrl !== prospect.webhookUrl) {
        const fwhRes = await sendWebhookAlert({
          webhookUrl: founderWebhookUrl,
          subject: emailSubject,
          to: prospect.ownerEmail || founderAlertEmail,
          founderEmail: founderAlertEmail,
          secret: webhookSecret,
          text: smsPreview,
          payload: quoteWebhookPayload,
        });
        if (fwhRes.ok) {
          webhookDispatched = true;
        } else if (fwhRes.error) {
          errors.push(fwhRes.error);
          console.error(`Founder webhook failed for ${quoteId}:`, fwhRes.error);
        }
      }

      // 3) Direct Email Alert via Resend (when verified domain keys exist)
      if (prospect.ownerEmail) {
        if (!resendApiKey || !resendFromEmail) {
          if (!webhookDispatched) {
            deliveryStatus = 'config_missing';
          }
        } else {
          const emailRes = await sendResendEmail({
            apiKey: resendApiKey,
            from: resendFromEmail,
            to: prospect.ownerEmail,
            subject: emailSubject,
            text: smsPreview,
          });
          if (emailRes.ok) {
            emailDispatched = true;
          } else if (emailRes.error) {
            errors.push(emailRes.error);
            console.error(`Resend notification failed for ${quoteId}:`, emailRes.error);
          }
        }
      }

      if (emailDispatched || webhookDispatched) {
        deliveryStatus = 'sent';
        deliveryError = errors.length > 0 ? errors.join(' | ') : null;
      } else if (deliveryStatus === 'config_missing') {
        deliveryError = null;
      } else if (!prospect.ownerEmail && !prospect.webhookUrl && !founderWebhookUrl) {
        deliveryStatus = 'no_owner_email';
        deliveryError = 'No alert destination configured for this live shop.';
      } else {
        deliveryStatus = 'failed';
        deliveryError = errors.join(' | ') || 'Lead alert delivery failed.';
      }

      if (
        deliveryStatus === 'failed' &&
        founderAlertEmail &&
        resendApiKey &&
        resendFromEmail
      ) {
        await sendResendEmail({
          apiKey: resendApiKey,
          from: resendFromEmail,
          to: founderAlertEmail,
          subject: `[DELIVERY FAILED] ${emailSubject}`,
          text:
            `Failed to deliver live lead ${quoteId} for ${prospect.businessName}.\n` +
            `Reason: ${deliveryError}\n\n${smsPreview}`,
        });
      }

      await updateQuoteDeliveryStatus(d1, quoteId, deliveryStatus, deliveryError);
    }

    return jsonResponse({
      ok: true,
      mode: prospect.mode,
      isFounderSelfTest,
      emailDispatched,
      webhookDispatched,
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
