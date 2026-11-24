import type { APIRoute } from 'astro';
import { getMediaAssetFallback } from '../../../lib/db/repository';

const SAFE_MEDIA_KEY_REGEX =
  /^prospects\/[a-zA-Z0-9_-]{2,80}\/[a-f0-9-]{8,64}\.(jpg|png|webp)$/;

function fallbackContentType(key: string): string {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const key = (params.key || '').replace(/^\/+/, '');
  if (!SAFE_MEDIA_KEY_REGEX.test(key)) {
    return new Response('Not found', { status: 404 });
  }

  const env = locals.runtime.env;
  const bucket = env.MEDIA_BUCKET;

  try {
    if (bucket) {
      const object = await bucket.get(key);
      if (object && object.body) {
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
      }
    }

    const asset = await getMediaAssetFallback(env.DB, key);
    if (!asset) {
      return new Response('Not found', { status: 404 });
    }

    const bytes = base64ToBytes(asset.dataBase64);
    const headers = new Headers();
    headers.set('Content-Type', asset.contentType || fallbackContentType(key));
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(bytes, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error('Error in GET /api/media/[...key]:', err);
    return new Response('Error reading media', { status: 500 });
  }
};
