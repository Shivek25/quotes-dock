/// <reference types="astro/client" />

type DrizzleD1Input = Parameters<typeof import('drizzle-orm/d1').drizzle>[0];

interface R2ObjectLike {
  body: ReadableStream | null;
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  httpEtag?: string;
  size?: number;
}

interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string | ReadableStream,
    options?: {
      httpMetadata?: {
        contentType?: string;
        cacheControl?: string;
      };
    }
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
}

interface Env {
  DB: DrizzleD1Input;
  MEDIA_BUCKET?: R2BucketLike;
  ADMIN_STUDIO_KEY?: string;
  IP_HASH_SALT?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  FOUNDER_ALERT_EMAIL?: string;
  FOUNDER_WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
  FOUNDING_CHECKOUT_URL?: string;
  STANDARD_CHECKOUT_URL?: string;
}

type CloudflareRuntime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends CloudflareRuntime {}
}
