import type { APIRoute } from 'astro';
import {
  getProspectByOwnerToken,
  updateOwnerSelfSettings,
} from '../../../lib/db/repository';
import { ownerSettingsUpdateSchema } from '../../../lib/validation/schemas';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function isSameOrigin(request: Request): boolean {
  let expectedOrigin = '';
  try {
    expectedOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }
  const origin = request.headers.get('origin')?.trim();
  if (origin) return origin === expectedOrigin;
  const referer = request.headers.get('referer')?.trim();
  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }
  return false;
}

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) {
    return jsonResponse({ ok: false, error: 'Invalid request origin.' }, 403);
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = ownerSettingsUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse(
        { ok: false, error: parsed.error.issues[0]?.message || 'Invalid shop settings.' },
        400
      );
    }

    const d1 = locals.runtime.env.DB;
    const prospect = await getProspectByOwnerToken(d1, parsed.data.ownerToken);
    if (!prospect) {
      return jsonResponse({ ok: false, error: 'Unauthorized portal link.' }, 401);
    }

    const updated = await updateOwnerSelfSettings(d1, {
      prospectId: prospect.id,
      availabilityStatus: parsed.data.availabilityStatus,
      baseSedanPrice: parsed.data.baseSedanPrice,
      phoneDisplay: parsed.data.phoneDisplay,
    });

    if (!updated) {
      return jsonResponse({ ok: false, error: 'Shop not found.' }, 404);
    }

    return jsonResponse({
      ok: true,
      turnaroundBadge: updated.turnaroundBadge,
      availabilityStatus: updated.availabilityStatus,
    });
  } catch (err) {
    console.error('Error in PATCH /api/owner/settings:', err);
    return jsonResponse({ ok: false, error: 'Could not save shop settings.' }, 500);
  }
};
