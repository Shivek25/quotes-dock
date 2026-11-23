import type { APIRoute } from 'astro';

const SAFE_MEDIA_KEY_REGEX =
  /^prospects\/[a-zA-Z0-9_-]{2,80}\/[a-f0-9-]{8,64}\.(jpg|png|webp)$/;

function fallbackContentType(key: string): string {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export const GET: APIRoute = async ({ params, locals }) => {
  const key = (params.key || '').replace(/^\/+/, '');
  if (!SAFE_MEDIA_KEY_REGEX.test(key)) {
    return new Response('Not found', { status: 404 });
  }

  const bucket = locals.runtime.env.MEDIA_BUCKET;
  if (!bucket) {
    return new Response('Media storage unavailable', { status: 503 });
  }

  try {
    const object = await bucket.get(key);
    if (!object || !object.body) {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers();
    headers.set(
      'Content-Type',
      object.httpMetadata?.contentType || fallbackContentType(key)
    );
    headers.set(
      'Cache-Control',
      object.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable'
    );
    headers.set('X-Content-Type-Options', 'nosniff');
    if (object.httpEtag) {
      headers.set('ETag', object.httpEtag);
    }

    return new Response(object.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error('Error in GET /api/media/[...key]:', err);
    return new Response('Error reading media', { status: 500 });
  }
};
