/// <reference types="astro/client" />

type DrizzleD1Input = Parameters<typeof import('drizzle-orm/d1').drizzle>[0];

interface Env {
  DB: DrizzleD1Input;
  ADMIN_STUDIO_KEY?: string;
  RESEND_API_KEY?: string;
}

type CloudflareRuntime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends CloudflareRuntime {}
}
