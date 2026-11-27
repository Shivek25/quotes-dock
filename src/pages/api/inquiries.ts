import type { APIRoute } from 'astro';
import {
  countRecentInquiriesByIp,
  createInboundInquiry,
  getProspectBySlug,
  updateInboundInquiryStatus,
} from '../../lib/db/repository';
import {
  extractClientIp,
  hashClientIp,
  isSameOriginStudioRequest,
  isStudioAuthorized,
} from '../../lib/security/auth';
import { sendWebhookAlert } from '../../lib/alerts/webhook';
import {
  newInquirySchema,
  updateInquiryStatusSchema,
} from '../../lib/validation/schemas';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function getSafeCheckoutUrl(raw: string | undefined): string | null {
  const val = raw?.trim() || '';
  if (!val) return null;
  if (val.startsWith('https://')) return val;
  return null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const rawBody = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400);
    }

    // Silent honeypot
    const honeypot = (rawBody as Record<string, unknown>).website_url;
    if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
      return jsonResponse({ ok: true, inquiryId: null, checkoutUrl: null });
    }

    const parsed = newInquirySchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return jsonResponse(
        {
          ok: false,
          error: firstIssue?.message || 'Please check the required fields.',
          field: firstIssue?.path?.[0] || null,
        },
        400
      );
    }

    const env = locals.runtime.env;
    const d1 = env.DB;
    const data = parsed.data;

    const ipHash = await hashClientIp(extractClientIp(request), env);
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const recentCount = await countRecentInquiriesByIp(d1, ipHash, fifteenMinutesAgo);
    if (recentCount >= 5) {
      return jsonResponse(
        {
          ok: false,
          error: 'Too many requests in a short time. Please wait a few minutes and try again.',
        },
        429
      );
    }

    // Resolve prospectId cleanly if slug was supplied
    let resolvedProspectId = data.prospectId || null;
    let resolvedBusinessName = data.businessName;
    let resolvedCity = data.city;
    let resolvedCountry = data.country;

    if (data.slug) {
      const prospect = await getProspectBySlug(d1, data.slug);
      if (prospect) {
        resolvedProspectId = prospect.id;
        resolvedBusinessName = prospect.businessName;
        resolvedCity = resolvedCity || prospect.city;
        resolvedCountry = prospect.country;
      }
    }

    const inquiryId = `inq_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await createInboundInquiry(d1, {
      id: inquiryId,
      inquiryType: data.inquiryType,
      prospectId: resolvedProspectId,
      slug: data.slug || null,
      businessName: resolvedBusinessName,
      ownerName: data.ownerName,
      contactInfo: data.contactInfo,
      city: resolvedCity,
      country: resolvedCountry,
      planTier: data.planTier,
      notes: data.notes,
      ipHash,
    });

    // Notify founder via optional Resend email and/or FOUNDER_WEBHOOK_URL (Discord / Slack / Gmail relay)
    const resendApiKey = env.RESEND_API_KEY?.trim() || '';
    const resendFromEmail = env.RESEND_FROM_EMAIL?.trim() || '';
    const founderEmail = env.FOUNDER_ALERT_EMAIL?.trim() || '';
    const founderWebhookUrl = env.FOUNDER_WEBHOOK_URL?.trim() || '';
    const webhookSecret = env.WEBHOOK_SECRET?.trim() || '';

    const typeLabel =
      data.inquiryType === 'claim_page'
        ? 'PAGE CLAIM'
        : data.inquiryType === 'removal_request'
          ? 'REMOVAL REQUEST'
          : 'FREE PREVIEW REQUEST';

    const bodyLines = [
      `Type: ${typeLabel}`,
      `Business: ${resolvedBusinessName} (${resolvedCity || 'City not provided'}, ${resolvedCountry})`,
      `Owner: ${data.ownerName}`,
      `Contact: ${data.contactInfo}`,
      `Plan: ${data.planTier}`,
      data.slug ? `Preview Slug: /p/${data.slug}` : '',
      data.notes ? `Notes: ${data.notes}` : '',
    ].filter(Boolean);

    const inquirySubject = `[QuotesDock ${typeLabel}] ${resolvedBusinessName}`;
    const inquiryText = bodyLines.join('\n');

    if (founderWebhookUrl) {
      const whRes = await sendWebhookAlert({
        webhookUrl: founderWebhookUrl,
        text: `${inquirySubject}\n${inquiryText}`,
        subject: inquirySubject,
        to: founderEmail,
        founderEmail,
        secret: webhookSecret,
        payload: {
          event: 'inbound_inquiry',
          inquiryId,
          inquiryType: data.inquiryType,
          businessName: resolvedBusinessName,
          ownerName: data.ownerName,
          contactInfo: data.contactInfo,
          city: resolvedCity,
          country: resolvedCountry,
          planTier: data.planTier,
          slug: data.slug || null,
          notes: data.notes || '',
        },
      });
      if (!whRes.ok) {
        console.error('Founder webhook inquiry notification failed:', whRes.error);
      }
    }

    if (resendApiKey && resendFromEmail && founderEmail) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFromEmail,
          to: [founderEmail],
          subject: inquirySubject,
          text: inquiryText,
        }),
        signal: AbortSignal.timeout(4000),
      }).catch((err) => {
        console.error('Founder inquiry notification failed:', err);
      });
    }

    const checkoutUrl =
      data.inquiryType === 'removal_request'
        ? null
        : data.planTier === 'standard'
          ? getSafeCheckoutUrl(env.STANDARD_CHECKOUT_URL)
          : getSafeCheckoutUrl(env.FOUNDING_CHECKOUT_URL);

    return jsonResponse({
      ok: true,
      inquiryId,
      checkoutUrl,
    });
  } catch (err) {
    console.error('Error in POST /api/inquiries:', err);
    return jsonResponse(
      { ok: false, error: 'Could not submit your request right now. Please try again.' },
      500
    );
  }
};

export const PATCH: APIRoute = async ({ request, cookies, locals }) => {
  const env = locals.runtime.env;
  if (!(await isStudioAuthorized(request, cookies, env))) {
    return jsonResponse({ ok: false, error: 'Unauthorized studio access.' }, 401);
  }
  if (!isSameOriginStudioRequest(request, env)) {
    return jsonResponse({ ok: false, error: 'Invalid request origin.' }, 403);
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = updateInquiryStatusSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse(
        {
          ok: false,
          error: parsed.error.issues[0]?.message || 'Invalid inquiry status update.',
        },
        400
      );
    }

    const updated = await updateInboundInquiryStatus(
      env.DB,
      parsed.data.id,
      parsed.data.status
    );
    if (!updated) {
      return jsonResponse({ ok: false, error: 'Inquiry not found.' }, 404);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('Error in PATCH /api/inquiries:', err);
    return jsonResponse(
      { ok: false, error: 'Could not update inquiry status.' },
      500
    );
  }
};
