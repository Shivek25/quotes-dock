import type { APIRoute } from 'astro';
import {
  createProspectWithDrafts,
  updateProspectMode,
} from '../../lib/db/repository';
import { isStudioAuthorized } from '../../lib/security/auth';
import {
  newProspectSchema,
  updateProspectModeSchema,
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

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const env = locals.runtime.env;
  if (!isStudioAuthorized(request, cookies, env)) {
    return jsonResponse({ ok: false, error: 'Unauthorized studio access.' }, 401);
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = newProspectSchema.safeParse(rawBody);

    if (!parsed.success) {
      return jsonResponse(
        {
          ok: false,
          error: parsed.error.issues[0]?.message || 'Invalid prospect details.',
        },
        400
      );
    }

    const data = parsed.data;
    const bundle = await createProspectWithDrafts(env.DB, {
      businessName: data.businessName,
      slug: data.slug || undefined,
      city: data.city,
      country: data.country,
      serviceArea: data.serviceArea,
      phoneDisplay: data.phoneDisplay,
      instagramHandle: data.instagramHandle,
      ratingScore: data.ratingScore,
      reviewCount: data.reviewCount,
      personalizationNote: data.personalizationNote,
      baseSedanPrice: data.baseSedanPrice,
    });

    return jsonResponse({
      ok: true,
      prospect: bundle.prospect,
      drafts: bundle.drafts,
      previewUrl: `/p/${bundle.prospect.slug}`,
    });
  } catch (err) {
    console.error('Error in POST /api/prospects:', err);
    return jsonResponse(
      { ok: false, error: 'Could not create prospect. Please try again.' },
      500
    );
  }
};

export const PATCH: APIRoute = async ({ request, cookies, locals }) => {
  const env = locals.runtime.env;
  if (!isStudioAuthorized(request, cookies, env)) {
    return jsonResponse({ ok: false, error: 'Unauthorized studio access.' }, 401);
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = updateProspectModeSchema.safeParse(rawBody);

    if (!parsed.success) {
      return jsonResponse(
        {
          ok: false,
          error: parsed.error.issues[0]?.message || 'Invalid prospect update.',
        },
        400
      );
    }

    const updated = await updateProspectMode(env.DB, {
      prospectId: parsed.data.prospectId,
      mode: parsed.data.mode,
      ownerEmail: parsed.data.ownerEmail,
    });

    if (!updated) {
      return jsonResponse({ ok: false, error: 'Prospect not found.' }, 404);
    }

    return jsonResponse({ ok: true, prospect: updated });
  } catch (err) {
    console.error('Error in PATCH /api/prospects:', err);
    return jsonResponse(
      { ok: false, error: 'Could not update prospect mode.' },
      500
    );
  }
};
