import type { APIRoute } from 'astro';
import { updateOutreachDraft } from '../../lib/db/repository';
import { isStudioAuthorized } from '../../lib/security/auth';
import { updateOutreachDraftSchema } from '../../lib/validation/schemas';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export const PATCH: APIRoute = async ({ request, cookies, locals }) => {
  const env = locals.runtime.env;
  if (!isStudioAuthorized(request, cookies, env)) {
    return jsonResponse({ ok: false, error: 'Unauthorized studio access.' }, 401);
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = updateOutreachDraftSchema.safeParse(rawBody);

    if (!parsed.success) {
      return jsonResponse(
        {
          ok: false,
          error: parsed.error.issues[0]?.message || 'Invalid outreach draft update.',
        },
        400
      );
    }

    const updated = await updateOutreachDraft(env.DB, parsed.data);
    if (!updated) {
      return jsonResponse({ ok: false, error: 'Outreach draft not found.' }, 404);
    }

    return jsonResponse({ ok: true, draft: updated });
  } catch (err) {
    console.error('Error in PATCH /api/outreach:', err);
    return jsonResponse(
      { ok: false, error: 'Could not update outreach draft.' },
      500
    );
  }
};
