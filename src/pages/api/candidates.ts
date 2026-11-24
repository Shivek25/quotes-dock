import type { APIRoute } from 'astro';
import {
  listLeadCandidates,
  updateLeadCandidateStatus,
  upsertLeadCandidatesBatch,
} from '../../lib/db/repository';
import {
  isSameOriginStudioRequest,
  isStudioAuthorized,
} from '../../lib/security/auth';
import {
  updateCandidateStatusSchema,
  upsertCandidatesBatchSchema,
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

export const GET: APIRoute = async ({ request, cookies, locals }) => {
  const env = locals.runtime.env;
  if (!(await isStudioAuthorized(request, cookies, env))) {
    return jsonResponse({ ok: false, error: 'Unauthorized studio access.' }, 401);
  }

  try {
    const candidates = await listLeadCandidates(env.DB);
    return jsonResponse({ ok: true, candidates });
  } catch (err) {
    console.error('Error in GET /api/candidates:', err);
    return jsonResponse(
      { ok: false, error: 'Could not load scouted candidates.' },
      500
    );
  }
};

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
    const parsed = upsertCandidatesBatchSchema.safeParse(rawBody);

    if (!parsed.success) {
      return jsonResponse(
        {
          ok: false,
          error: parsed.error.issues[0]?.message || 'Invalid candidate payload.',
        },
        400
      );
    }

    const result = await upsertLeadCandidatesBatch(env.DB, parsed.data.candidates, {
      replaceCity: parsed.data.replaceCity,
    });
    const candidates = await listLeadCandidates(env.DB);
    return jsonResponse({ ok: true, count: result.count, candidates });
  } catch (err) {
    console.error('Error in POST /api/candidates:', err);
    return jsonResponse(
      { ok: false, error: 'Could not save scouted candidates.' },
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
    const parsed = updateCandidateStatusSchema.safeParse(rawBody);

    if (!parsed.success) {
      return jsonResponse(
        {
          ok: false,
          error: parsed.error.issues[0]?.message || 'Invalid candidate status update.',
        },
        400
      );
    }

    const updated = await updateLeadCandidateStatus(
      env.DB,
      parsed.data.id,
      parsed.data.status
    );

    if (!updated) {
      return jsonResponse({ ok: false, error: 'Candidate not found.' }, 404);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('Error in PATCH /api/candidates:', err);
    return jsonResponse(
      { ok: false, error: 'Could not update candidate status.' },
      500
    );
  }
};
