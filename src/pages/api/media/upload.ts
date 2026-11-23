import type { APIRoute } from 'astro';
import {
  isSameOriginStudioRequest,
  isStudioAuthorized,
} from '../../../lib/security/auth';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

type SupportedImage = {
  ext: 'jpg' | 'png' | 'webp';
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function detectImageByMagicBytes(bytes: Uint8Array): SupportedImage | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ext: 'png', contentType: 'image/png' };
  }

  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: 'webp', contentType: 'image/webp' };
  }

  return null;
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const env = locals.runtime.env;
  if (!(await isStudioAuthorized(request, cookies, env))) {
    return jsonResponse({ ok: false, error: 'Unauthorized studio access.' }, 401);
  }
  if (!isSameOriginStudioRequest(request, env)) {
    return jsonResponse({ ok: false, error: 'Invalid request origin.' }, 403);
  }

  const bucket = env.MEDIA_BUCKET;
  if (!bucket) {
    return jsonResponse(
      {
        ok: false,
        error:
          'Cloudflare R2 MEDIA_BUCKET binding is not configured in this environment.',
      },
      503
    );
  }

  try {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return jsonResponse({ ok: false, error: 'Expected multipart form data.' }, 400);
    }

    const fileEntry = formData.get('file');
    const rawProspectId = String(formData.get('prospectId') || '').trim();
    if (!(fileEntry instanceof File)) {
      return jsonResponse({ ok: false, error: 'Missing image file.' }, 400);
    }

    if (!rawProspectId || !/^[a-zA-Z0-9_-]{2,80}$/.test(rawProspectId)) {
      return jsonResponse({ ok: false, error: 'Invalid prospect ID.' }, 400);
    }

    if (fileEntry.size === 0 || fileEntry.size > MAX_UPLOAD_BYTES) {
      return jsonResponse(
        { ok: false, error: 'Image must be between 1 byte and 5 MB.' },
        400
      );
    }

    const buffer = await fileEntry.arrayBuffer();
    const detected = detectImageByMagicBytes(new Uint8Array(buffer));
    if (!detected) {
      return jsonResponse(
        {
          ok: false,
          error: 'Unsupported image format. Upload a valid JPG, PNG, or WebP photo.',
        },
        400
      );
    }

    const objectKey = `prospects/${rawProspectId}/${crypto.randomUUID()}.${detected.ext}`;
    await bucket.put(objectKey, buffer, {
      httpMetadata: {
        contentType: detected.contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    return jsonResponse({
      ok: true,
      key: objectKey,
      url: `/api/media/${objectKey}`,
      contentType: detected.contentType,
      bytes: fileEntry.size,
    });
  } catch (err) {
    console.error('Error in POST /api/media/upload:', err);
    return jsonResponse(
      { ok: false, error: 'Could not upload photo to R2 storage.' },
      500
    );
  }
};
