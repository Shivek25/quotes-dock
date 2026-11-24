import type { APIRoute } from 'astro';
import { saveMediaAssetFallback } from '../../../lib/db/repository';
import {
  isSameOriginStudioRequest,
  isStudioAuthorized,
} from '../../../lib/security/auth';

const MAX_R2_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB when R2 is bound
const MAX_D1_FALLBACK_BYTES = 750 * 1024; // 750 KB when using zero-card D1 fallback

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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
  const maxBytes = bucket ? MAX_R2_UPLOAD_BYTES : MAX_D1_FALLBACK_BYTES;

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

    if (fileEntry.size === 0 || fileEntry.size > maxBytes) {
      const limitLabel = bucket ? '5 MB' : '750 KB (compress photo or enable R2 for 5 MB)';
      return jsonResponse(
        { ok: false, error: `Image must be between 1 byte and ${limitLabel}.` },
        400
      );
    }

    const buffer = await fileEntry.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const detected = detectImageByMagicBytes(bytes);
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

    if (bucket) {
      await bucket.put(objectKey, buffer, {
        httpMetadata: {
          contentType: detected.contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });
    } else {
      await saveMediaAssetFallback(env.DB, {
        key: objectKey,
        prospectId: rawProspectId,
        contentType: detected.contentType,
        dataBase64: bytesToBase64(bytes),
        sizeBytes: fileEntry.size,
      });
    }

    return jsonResponse({
      ok: true,
      key: objectKey,
      url: `/api/media/${objectKey}`,
      storage: bucket ? 'r2' : 'd1',
      contentType: detected.contentType,
      bytes: fileEntry.size,
    });
  } catch (err) {
    console.error('Error in POST /api/media/upload:', err);
    return jsonResponse(
      { ok: false, error: 'Could not upload photo right now.' },
      500
    );
  }
};
