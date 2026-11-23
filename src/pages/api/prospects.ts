import type { APIRoute } from 'astro';
import {
  createProspectWithDrafts,
  deleteProspectById,
  ProspectValidationError,
  updateProspectMode,
} from '../../lib/db/repository';
import {
  isSameOriginStudioRequest,
  isStudioAuthorized,
} from '../../lib/security/auth';
import {
  deleteProspectSchema,
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
  if (!(await isStudioAuthorized(request, cookies, env))) {
    return jsonResponse({ ok: false, error: 'Unauthorized studio access.' }, 401);
  }
  if (!isSameOriginStudioRequest(request, env)) {
    return jsonResponse({ ok: false, error: 'Invalid request origin.' }, 403);
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
  if (!(await isStudioAuthorized(request, cookies, env))) {
    return jsonResponse({ ok: false, error: 'Unauthorized studio access.' }, 401);
  }
  if (!isSameOriginStudioRequest(request, env)) {
    return jsonResponse({ ok: false, error: 'Invalid request origin.' }, 403);
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
      phoneDisplay: parsed.data.phoneDisplay,
      serviceArea: parsed.data.serviceArea,
      baseSedanPrice: parsed.data.baseSedanPrice,
      photoUrls: parsed.data.photoUrls,
    });

    if (!updated) {
      return jsonResponse({ ok: false, error: 'Prospect not found.' }, 404);
    }

    return jsonResponse({ ok: true, prospect: updated });
  } catch (err) {
    if (err instanceof ProspectValidationError) {
      return jsonResponse({ ok: false, error: err.message }, 400);
    }
    console.error('Error in PATCH /api/prospects:', err);
    return jsonResponse(
      { ok: false, error: 'Could not update prospect details.' },
      500
    );
  }
};

export const DELETE: APIRoute = async ({ request, cookies, locals }) => {
  const env = locals.runtime.env;
  if (!(await isStudioAuthorized(request, cookies, env))) {
    return jsonResponse({ ok: false, error: 'Unauthorized studio access.' }, 401);
  }
  if (!isSameOriginStudioRequest(request, env)) {
    return jsonResponse({ ok: false, error: 'Invalid request origin.' }, 403);
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = deleteProspectSchema.safeParse(rawBody);

    if (!parsed.success) {
      return jsonResponse({ ok: false, error: 'Invalid prospect ID.' }, 400);
    }

    const deleted = await deleteProspectById(env.DB, parsed.data.prospectId);
    if (!deleted) {
      return jsonResponse({ ok: false, error: 'Prospect not found.' }, 404);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('Error in DELETE /api/prospects:', err);
    return jsonResponse(
      { ok: false, error: 'Could not delete prospect.' },
      500
    );
  }
};
