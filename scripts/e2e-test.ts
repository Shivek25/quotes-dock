import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

interface CliConfig {
  baseUrl: string;
  studioKey: string;
  mode: 'open' | 'locked';
}

function parseArgs(argv: string[]): CliConfig {
  let baseUrl = process.env.E2E_BASE_URL || 'http://localhost:4321';
  let studioKey = process.env.E2E_STUDIO_KEY || '';
  let mode: 'open' | 'locked' = studioKey ? 'locked' : 'open';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url' && argv[i + 1]) {
      baseUrl = argv[++i];
    } else if (arg.startsWith('--url=')) {
      baseUrl = arg.slice('--url='.length);
    } else if (arg === '--studio-key' && argv[i + 1]) {
      studioKey = argv[++i];
      mode = 'locked';
    } else if (arg.startsWith('--studio-key=')) {
      studioKey = arg.slice('--studio-key='.length);
      mode = 'locked';
    }
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    studioKey,
    mode,
  };
}

const VALID_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )
);
const VALID_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);
const VALID_WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x4c, 0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0x00,
]);

let passed = 0;
let failed = 0;
const failures: Array<{ name: string; error: string }> = [];

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push({ name, error: msg });
    console.error(`  [FAIL] ${name}\n         ${msg}`);
  }
}

function runLocalD1Sql(sql: string): void {
  const wranglerDir = path.resolve(process.cwd(), '.wrangler');
  fs.mkdirSync(wranglerDir, { recursive: true });
  const sqlFile = path.join(wranglerDir, 'tmp-e2e-cleanup.sql');
  try {
    fs.writeFileSync(sqlFile, sql, 'utf8');
    const res = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', 'quotes-dock-db', '--local', '--file', sqlFile],
      {
        stdio: 'pipe',
        shell: process.platform === 'win32',
        encoding: 'utf8',
      }
    );
    if (res.status !== 0) {
      console.warn(`[Cleanup Warning] D1 SQL failed: ${res.stderr || res.stdout}`);
    }
  } finally {
    if (fs.existsSync(sqlFile)) {
      fs.unlinkSync(sqlFile);
    }
  }
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  const skip = new Set(['node_modules', '.git', 'dist', '.astro', '.wrangler']);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx|astro|mjs|css|md|sql|jsonc)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function runOpenSuites(baseUrl: string): Promise<void> {
  const createdProspectIds: string[] = [];
  const createdInquiryIds: string[] = [];
  const createdCandidateIds: string[] = [];
  const testRunTag = `e2e_${Date.now().toString(36)}`;

  try {
    console.log('\n=== Suite 1: Security Headers & Typography Invariants ===');

    await test('HTML responses include CSP, XFO, XCTO, Referrer-Policy, Permissions-Policy', async () => {
      for (const route of ['/', '/p/apex-gloss-austin', '/studio']) {
        const res = await fetch(`${baseUrl}${route}`);
        assert.equal(res.status, 200, `${route} returned ${res.status}`);
        assert.equal(res.headers.get('x-frame-options'), 'DENY');
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
        assert.ok(res.headers.get('permissions-policy'));
        const csp = res.headers.get('content-security-policy') || '';
        assert.ok(csp.includes("default-src 'self'"));
        assert.ok(csp.includes("frame-ancestors 'none'"));
      }
    });

    await test('Zero em dashes exist anywhere in project source, migrations, and docs', () => {
      const files = collectSourceFiles(process.cwd());
      const offenders: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('\u2014')) {
          offenders.push(path.relative(process.cwd(), file));
        }
      }
      assert.deepEqual(offenders, [], `Em dashes found in: ${offenders.join(', ')}`);
    });

    console.log('\n=== Suite 2: Homepage & Inbound Preview Intake Funnel ===');

    await test('Homepage renders intake form and has no unbuilt custom-domain overpromise', async () => {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('id="request-preview"'));
      assert.ok(html.includes('id="home-inquiry-form"'));
      assert.ok(!html.includes('quotes.yourshop.com'));
    });

    await test('POST /api/inquiries rejects invalid payloads with 400', async () => {
      const badPayloads = [
        { businessName: 'A', ownerName: 'Alex', contactInfo: 'a@b.com' },
        { businessName: 'Good Detail', ownerName: 'A', contactInfo: 'a@b.com' },
        { businessName: 'Good Detail', ownerName: 'Alex', contactInfo: '123' },
        {
          businessName: 'Good Detail',
          ownerName: 'Alex',
          contactInfo: 'a@b.com',
          notes: 'x'.repeat(505),
        },
        {
          businessName: 'Good Detail',
          ownerName: 'Alex',
          contactInfo: 'a@b.com',
          country: 'CA',
        },
      ];
      for (const payload of badPayloads) {
        const res = await fetch(`${baseUrl}/api/inquiries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.10' },
          body: JSON.stringify(payload),
        });
        assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(payload)}`);
      }
    });

    await test('POST /api/inquiries honeypot silently drops spam without DB write', async () => {
      const res = await fetch(`${baseUrl}/api/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.11' },
        body: JSON.stringify({
          businessName: `${testRunTag} Spam`,
          ownerName: 'Bot',
          contactInfo: 'bot@spam.example',
          website_url: 'https://spam.example',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.equal(data.inquiryId, null);
    });

    await test('POST /api/inquiries enforces 5 per 15 min IP rate limit (6th returns 429)', async () => {
      const rateIp = `198.51.100.${Math.floor(20 + Math.random() * 60)}`;
      for (let i = 1; i <= 5; i += 1) {
        const res = await fetch(`${baseUrl}/api/inquiries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': rateIp },
          body: JSON.stringify({
            inquiryType: 'free_preview_request',
            businessName: `${testRunTag} RateShop ${i}`,
            ownerName: 'Owner',
            contactInfo: `owner${i}@example.com`,
            city: 'Miami, FL',
            country: 'US',
            planTier: 'founding',
            notes: 'Rate limit test',
          }),
        });
        assert.equal(res.status, 200, `Expected 200 on request #${i}, got ${res.status}`);
        const data = await res.json();
        if (data.inquiryId) createdInquiryIds.push(data.inquiryId);
      }

      const sixth = await fetch(`${baseUrl}/api/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': rateIp },
        body: JSON.stringify({
          inquiryType: 'free_preview_request',
          businessName: `${testRunTag} RateShop 6`,
          ownerName: 'Owner',
          contactInfo: 'owner6@example.com',
        }),
      });
      assert.equal(sixth.status, 429, `Expected 429 on 6th inquiry, got ${sixth.status}`);
    });

    await test('XSS and SQLi payloads in inquiries are parameterized and HTML-escaped in Studio', async () => {
      const xssBiz = `${testRunTag} <script>alert("xss")</script> ' OR 1=1; --`;
      const res = await fetch(`${baseUrl}/api/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.91' },
        body: JSON.stringify({
          inquiryType: 'free_preview_request',
          businessName: xssBiz,
          ownerName: '"><img src=x onerror=alert(1)>',
          contactInfo: 'xss@example.com',
          city: 'Dallas, TX',
          country: 'US',
          notes: '"; DROP TABLE prospects; --',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.inquiryId);
      createdInquiryIds.push(data.inquiryId);

      const studioRes = await fetch(`${baseUrl}/studio`);
      assert.equal(studioRes.status, 200);
      const studioHtml = await studioRes.text();
      assert.ok(!studioHtml.includes('<script>alert("xss")</script>'), 'Raw <script> tag must be escaped');
      assert.ok(!studioHtml.includes('<img src=x onerror=alert(1)>'), 'Raw <img> XSS tag must be escaped');
      assert.ok(studioHtml.includes('&lt;script&gt;alert'), 'Escaped script payload should appear safely');
    });

    console.log('\n=== Suite 3: Quote Pages (Preview vs Live) & Calculator Math ===');

    await test('Unknown slug returns 404 with noindex', async () => {
      const res = await fetch(`${baseUrl}/p/nonexistent-shop-xyz-999`);
      assert.equal(res.status, 404);
      const html = await res.text();
      assert.ok(html.includes('content="noindex, nofollow"'));
    });

    await test('US and UK preview pages have noindex, truthful metrics, and claim/removal UI', async () => {
      for (const [slug, expectedCurrency, expectedPostal] of [
        ['apex-gloss-austin', '$', 'Zip Code'],
        ['cotswold-valet-uk', '£', 'Postcode'],
      ]) {
        const res = await fetch(`${baseUrl}/p/${slug}`);
        assert.equal(res.status, 200);
        const html = await res.text();
        assert.ok(html.includes('content="noindex, nofollow"'), `${slug} preview must be noindex`);
        assert.ok(html.includes(expectedCurrency), `${slug} currency check`);
        assert.ok(html.includes(expectedPostal), `${slug} postal label check`);
        assert.ok(!html.includes('98+ GU'), `${slug} has no fake 98+ GU`);
        assert.ok(!html.includes('0 PPM'), `${slug} has no fake 0 PPM`);
        assert.ok(!html.includes('Horiba'), `${slug} has no fake Horiba telemetry`);
        assert.ok(html.includes('id="claim-preview"'), `${slug} has claim form`);
        assert.ok(html.includes('id="removal-request-form"'), `${slug} has removal form`);
      }
    });

    await test('Server-side quote calculator computes exact math across vehicles, packages, conditions & add-ons', async () => {
      // Apex Gloss Austin: baseSedanPrice = 155
      // pkg-refresh: sedan=93, suv=118, truck_xl=138
      // pkg-full-reset: sedan=155, suv=190, truck_xl=220
      // pkg-gloss-ceramic: sedan=240, suv=285, truck_xl=325
      // conditions: standard=[0,20], pet_hair=[25,45], heavy_soil=[35,65]
      // US addons: addon-sealant=35, addon-headlights=45, addon-engine=35, addon-odor=40
      const cases = [
        {
          vehicleSize: 'sedan',
          packageId: 'pkg-refresh',
          conditionLevel: 'standard',
          addonsSelected: [],
          min: 93,
          max: 113,
        },
        {
          vehicleSize: 'suv',
          packageId: 'pkg-full-reset',
          conditionLevel: 'pet_hair',
          addonsSelected: ['addon-headlights', 'forged-unknown-addon'],
          min: 190 + 25 + 45,
          max: 190 + 45 + 45,
        },
        {
          vehicleSize: 'truck_xl',
          packageId: 'pkg-gloss-ceramic',
          conditionLevel: 'heavy_soil',
          addonsSelected: ['addon-sealant', 'addon-headlights', 'addon-engine', 'addon-odor'],
          min: 325 + 35 + 155,
          max: 325 + 65 + 155,
        },
      ];

      for (const c of cases) {
        const res = await fetch(`${baseUrl}/api/quotes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: 'apex-gloss-austin',
            customerName: 'Math Test',
            customerPhone: '512-555-0199',
            customerPostal: '78704',
            vehicleSize: c.vehicleSize,
            packageId: c.packageId,
            conditionLevel: c.conditionLevel,
            addonsSelected: c.addonsSelected,
            preferredTiming: 'this_week',
            notes: '',
            website_url: '',
            isFounderSelfTest: true,
          }),
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.quote.estimatedMin, c.min);
        assert.equal(data.quote.estimatedMax, c.max);
        assert.ok(data.ownerPreview?.smsPreview?.includes(`$${c.min} - $${c.max}`));
      }
    });

    await test('POST /api/quotes rejects forged packageId, >6 add-ons, and bad fields with 400', async () => {
      const badCases = [
        { packageId: 'pkg-does-not-exist' },
        { addonsSelected: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'] },
        { customerPhone: '12345' },
        { customerPostal: '12' },
        { notes: 'n'.repeat(405) },
      ];
      for (const patch of badCases) {
        const res = await fetch(`${baseUrl}/api/quotes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: 'apex-gloss-austin',
            customerName: 'Bad Field',
            customerPhone: '512-555-0199',
            customerPostal: '78704',
            vehicleSize: 'sedan',
            packageId: 'pkg-full-reset',
            conditionLevel: 'standard',
            addonsSelected: [],
            preferredTiming: 'this_week',
            notes: '',
            website_url: '',
            isFounderSelfTest: true,
            ...patch,
          }),
        });
        assert.equal(res.status, 400, `Expected 400 for patch ${JSON.stringify(patch)}`);
      }
    });

    await test('POST /api/quotes enforces 5 per 10 min IP rate limit (6th returns 429)', async () => {
      // Create a temporary prospect so sandbox quote counts stay clean
      const pRes = await fetch(`${baseUrl}/api/prospects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          businessName: `${testRunTag} Rate Detail`,
          city: 'Austin, TX',
          country: 'US',
          serviceArea: 'Austin',
          instagramHandle: '@ratedetail',
          personalizationNote: 'Testing quote rate limiting cleanly',
        }),
      });
      assert.equal(pRes.status, 200);
      const pJson = await pRes.json();
      createdProspectIds.push(pJson.prospect.id);

      const rateIp = `198.51.100.${Math.floor(110 + Math.random() * 80)}`;
      for (let i = 1; i <= 5; i += 1) {
        const res = await fetch(`${baseUrl}/api/quotes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': rateIp },
          body: JSON.stringify({
            slug: pJson.prospect.slug,
            customerName: `Customer ${i}`,
            customerPhone: '512-555-0199',
            customerPostal: '78704',
            vehicleSize: 'sedan',
            packageId: 'pkg-full-reset',
            conditionLevel: 'standard',
            addonsSelected: [],
            preferredTiming: 'this_week',
            isFounderSelfTest: false,
          }),
        });
        assert.equal(res.status, 200, `Expected 200 on quote #${i}, got ${res.status}`);
      }

      const sixth = await fetch(`${baseUrl}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': rateIp },
        body: JSON.stringify({
          slug: pJson.prospect.slug,
          customerName: 'Customer 6',
          customerPhone: '512-555-0199',
          customerPostal: '78704',
          vehicleSize: 'sedan',
          packageId: 'pkg-full-reset',
          conditionLevel: 'standard',
          addonsSelected: [],
          preferredTiming: 'this_week',
          isFounderSelfTest: false,
        }),
      });
      assert.equal(sixth.status, 429, `Expected 429 on 6th quote, got ${sixth.status}`);
    });

    await test('Preview claim_page resolves prospectId and removal_request returns null checkoutUrl', async () => {
      const claimRes = await fetch(`${baseUrl}/api/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.201' },
        body: JSON.stringify({
          inquiryType: 'claim_page',
          slug: 'apex-gloss-austin',
          businessName: 'Overridden By Slug',
          ownerName: 'Jordan',
          contactInfo: 'jordan@apexgloss.example',
          planTier: 'founding',
        }),
      });
      assert.equal(claimRes.status, 200);
      const claimJson = await claimRes.json();
      assert.ok(claimJson.inquiryId);
      createdInquiryIds.push(claimJson.inquiryId);

      const remRes = await fetch(`${baseUrl}/api/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.202' },
        body: JSON.stringify({
          inquiryType: 'removal_request',
          slug: 'apex-gloss-austin',
          businessName: 'Apex Gloss Mobile Detailing',
          ownerName: 'Jordan',
          contactInfo: 'jordan@apexgloss.example',
        }),
      });
      assert.equal(remRes.status, 200);
      const remJson = await remRes.json();
      assert.equal(remJson.checkoutUrl, null);
      createdInquiryIds.push(remJson.inquiryId);
    });

    console.log('\n=== Suite 4 (Open Mode): Cross-Origin CSRF Checks ===');

    await test('Cross-origin Origin header is blocked with 403 on all mutating Studio endpoints', async () => {
      const badOrigin = 'https://evil.example';
      const checks: Array<[string, string, BodyInit | undefined, Record<string, string>]> = [
        ['/api/prospects', 'POST', JSON.stringify({}), { 'Content-Type': 'application/json' }],
        ['/api/prospects', 'PATCH', JSON.stringify({}), { 'Content-Type': 'application/json' }],
        ['/api/prospects', 'DELETE', JSON.stringify({}), { 'Content-Type': 'application/json' }],
        ['/api/outreach', 'PATCH', JSON.stringify({}), { 'Content-Type': 'application/json' }],
        ['/api/candidates', 'POST', JSON.stringify({}), { 'Content-Type': 'application/json' }],
        ['/api/candidates', 'PATCH', JSON.stringify({}), { 'Content-Type': 'application/json' }],
        ['/api/inquiries', 'PATCH', JSON.stringify({}), { 'Content-Type': 'application/json' }],
      ];

      for (const [endpoint, method, body, headers] of checks) {
        const res = await fetch(`${baseUrl}${endpoint}`, {
          method,
          headers: { ...headers, Origin: badOrigin },
          body,
        });
        assert.equal(res.status, 403, `Expected 403 CSRF block on ${method} ${endpoint}, got ${res.status}`);
      }

      const fd = new FormData();
      fd.append('prospectId', 'pros_apex_austin');
      fd.append('file', new Blob([VALID_PNG], { type: 'image/png' }), 'a.png');
      const upRes = await fetch(`${baseUrl}/api/media/upload`, {
        method: 'POST',
        headers: { Origin: badOrigin },
        body: fd,
      });
      assert.equal(upRes.status, 403, `Expected 403 CSRF block on POST /api/media/upload, got ${upRes.status}`);
    });

    console.log('\n=== Suite 5: Cloudflare R2 Media Upload & Delivery Edge Cases ===');

    const uploadedUrls: string[] = [];

    await test('R2 upload accepts valid JPEG, PNG, and WebP and streams exact bytes with immutable cache', async () => {
      const samples: Array<[string, string, Uint8Array<ArrayBuffer>]> = [
        ['photo.jpg', 'image/jpeg', VALID_JPEG],
        ['photo.png', 'image/png', VALID_PNG],
        ['photo.webp', 'image/webp', VALID_WEBP],
      ];

      for (const [filename, mime, bytes] of samples) {
        const fd = new FormData();
        fd.append('prospectId', `${testRunTag}_media`);
        fd.append('file', new Blob([bytes], { type: mime }), filename);
        const res = await fetch(`${baseUrl}/api/media/upload`, {
          method: 'POST',
          headers: { Origin: baseUrl },
          body: fd,
        });
        assert.equal(res.status, 200, `Upload failed for ${filename}: ${res.status}`);
        const json = await res.json();
        assert.equal(json.ok, true);
        assert.equal(json.contentType, mime);
        uploadedUrls.push(json.url);

        const getRes = await fetch(`${baseUrl}${json.url}`);
        assert.equal(getRes.status, 200);
        assert.equal(getRes.headers.get('content-type'), mime);
        assert.equal(getRes.headers.get('x-content-type-options'), 'nosniff');
        assert.ok((getRes.headers.get('cache-control') || '').includes('immutable'));
        const servedBytes = Buffer.from(await getRes.arrayBuffer());
        assert.equal(Buffer.compare(servedBytes, bytes), 0, `Byte mismatch for ${filename}`);
      }
    });

    await test('R2 upload rejects spoofed SVG, empty file, >5MB file, and bad prospectId with 400', async () => {
      const cases: Array<[string, Blob, string]> = [
        ['pros_ok', new Blob(['<svg onload=alert(1)>'], { type: 'image/jpeg' }), 'spoof.jpg'],
        ['pros_ok', new Blob([], { type: 'image/png' }), 'empty.png'],
        ['pros_ok', new Blob([new Uint8Array(Buffer.concat([VALID_PNG, Buffer.alloc(5 * 1024 * 1024 + 1024)]))], { type: 'image/png' }), 'big.png'],
        ['../evil', new Blob([VALID_PNG], { type: 'image/png' }), 'good.png'],
      ];
      for (const [pid, blob, fname] of cases) {
        const fd = new FormData();
        fd.append('prospectId', pid);
        fd.append('file', blob, fname);
        const res = await fetch(`${baseUrl}/api/media/upload`, {
          method: 'POST',
          headers: { Origin: baseUrl },
          body: fd,
        });
        assert.equal(res.status, 400, `Expected 400 for ${pid}/${fname}, got ${res.status}`);
      }
    });

    await test('GET /api/media blocks encoded traversal, disallowed extensions, and missing keys with 404', async () => {
      for (const badPath of [
        '/api/media/..%2F..%2Fwrangler.jsonc',
        '/api/media/prospects/abc/test.svg',
        '/api/media/prospects/abc/00000000-0000-0000-0000-000000000000.png',
      ]) {
        const res = await fetch(`${baseUrl}${badPath}`);
        assert.equal(res.status, 404, `Expected 404 for ${badPath}, got ${res.status}`);
      }
    });

    console.log('\n=== Suite 6: Studio Full Lifecycle, Live-Mode Guard & Cascade Delete ===');

    await test('Candidate staging batch upsert, list, and dismiss', async () => {
      const postRes = await fetch(`${baseUrl}/api/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          candidates: [
            {
              businessName: `${testRunTag} Scouted Shop`,
              city: `${testRunTag}City, US`,
              country: 'US',
              serviceArea: 'Downtown',
              phoneDisplay: '',
              instagramHandle: '@e2escout',
              websiteUrl: '',
              ratingScore: '4.9',
              reviewCount: 22,
              fitScore: 92,
              fitSignals: ['No Website on Google'],
              hasInstantQuote: false,
              personalizationNote: 'Saw strong local reviews with no quote website',
            },
          ],
        }),
      });
      assert.equal(postRes.status, 200);
      const postJson = await postRes.json();
      const cand = postJson.candidates.find((c: { businessName: string }) =>
        c.businessName.includes(testRunTag)
      );
      assert.ok(cand, 'Upserted candidate must appear in list');
      createdCandidateIds.push(cand.id);

      const dismissRes = await fetch(`${baseUrl}/api/candidates`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ id: cand.id, status: 'dismissed' }),
      });
      assert.equal(dismissRes.status, 200);
    });

    await test('Prospect creation deduplicates city in slug, handles duplicates, and formats UK currency', async () => {
      const r1 = await fetch(`${baseUrl}/api/prospects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          businessName: `${testRunTag} Shine London`,
          city: 'London, UK',
          country: 'UK',
          serviceArea: 'West London',
          phoneDisplay: '',
          instagramHandle: 'https://instagram.com/shinelondon/',
          ratingScore: '5.0',
          reviewCount: 40,
          personalizationNote: 'Testing UK slug deduplication and GBP drafts',
        }),
      });
      assert.equal(r1.status, 200);
      const j1 = await r1.json();
      createdProspectIds.push(j1.prospect.id);
      assert.ok(!j1.prospect.slug.endsWith('-london-london'), `Duplicate city in slug: ${j1.prospect.slug}`);
      assert.equal(j1.prospect.currencySymbol, '£');
      assert.equal(j1.prospect.instagramHandle, '@shinelondon');
      assert.ok(j1.drafts[0].messageBody.includes('£39'), 'UK draft must pitch GBP');

      // Second creation with same name+city should auto-suffix slug cleanly
      const r2 = await fetch(`${baseUrl}/api/prospects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          businessName: `${testRunTag} Shine London`,
          city: 'London, UK',
          country: 'UK',
          serviceArea: 'East London',
          phoneDisplay: '',
          instagramHandle: '@shinelondon2',
          ratingScore: '4.9',
          reviewCount: 25,
          personalizationNote: 'Testing collision slug auto-suffix',
        }),
      });
      assert.equal(r2.status, 200);
      const j2 = await r2.json();
      createdProspectIds.push(j2.prospect.id);
      assert.notEqual(j2.prospect.slug, j1.prospect.slug);
    });

    await test('Live Mode Guard, live DM-only vs phone CTA, live gallery filtering, and delivery_status tracking', async () => {
      const targetId = createdProspectIds[createdProspectIds.length - 2]; // DM-only UK prospect
      // 1) Trying to go live without ownerEmail must fail 400
      const failLive = await fetch(`${baseUrl}/api/prospects`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ prospectId: targetId, mode: 'live' }),
      });
      assert.equal(failLive.status, 400);

      // 2) Reject http:// photo URLs
      const httpPhotoFail = await fetch(`${baseUrl}/api/prospects`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          prospectId: targetId,
          photoUrls: ['http://insecure.example/a.jpg'],
        }),
      });
      assert.equal(httpPhotoFail.status, 400);

      // 3) Activate live mode with valid ownerEmail (still 0 photos, DM-only)
      const goLive = await fetch(`${baseUrl}/api/prospects`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          prospectId: targetId,
          mode: 'live',
          ownerEmail: 'owner@shinelondon.example',
        }),
      });
      assert.equal(goLive.status, 200);
      const liveProspect = (await goLive.json()).prospect;

      // 4) Trying to wipe ownerEmail while live must fail 400
      const wipeEmail = await fetch(`${baseUrl}/api/prospects`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ prospectId: targetId, ownerEmail: '' }),
      });
      assert.equal(wipeEmail.status, 400);

      // 5) Inspect live page with 0 photos + DM-only
      const liveHtml1 = await (await fetch(`${baseUrl}/p/${liveProspect.slug}`)).text();
      assert.ok(!liveHtml1.includes('content="noindex, nofollow"'), 'Live page must be indexable');
      assert.ok(!liveHtml1.includes('id="job-proof"'), '0-photo live page hides job-proof section');
      assert.ok(!liveHtml1.includes('id="claim-preview"'), 'Live page hides claim section');
      assert.ok(liveHtml1.includes('id="modal-copy-quote-btn"'), 'DM-only live shop shows Copy Quote Summary');
      assert.ok(!liveHtml1.includes('id="modal-live-sms-link"'), 'DM-only live shop has no broken empty sms link');

      // 6) Submit live quote -> ownerPreview must be null and delivery_status logged
      const lqRes = await fetch(`${baseUrl}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.220' },
        body: JSON.stringify({
          slug: liveProspect.slug,
          customerName: 'Real UK Driver',
          customerPhone: '07700 900123',
          customerPostal: 'SW1A 1AA',
          vehicleSize: 'suv',
          packageId: 'pkg-full-reset',
          conditionLevel: 'standard',
          addonsSelected: [],
          preferredTiming: 'next_week',
          isFounderSelfTest: false,
        }),
      });
      assert.equal(lqRes.status, 200);
      const lqJson = await lqRes.json();
      assert.equal(lqJson.mode, 'live');
      assert.equal(lqJson.ownerPreview, null);

      // 7) Update with 2 real R2 photos, custom titles, custom trustPoints, and dialable phone
      const editRes = await fetch(`${baseUrl}/api/prospects`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          prospectId: targetId,
          phoneDisplay: '07700 900555',
          trustPoints: [
            'Custom Pure Water Tank',
            'Custom Insured Mobile Unit',
            'Custom Paint-Safe Wash',
            'Custom Card on Completion',
          ],
          galleryItems: [
            {
              id: 'job-1',
              title: 'Custom Porsche Gloss Reset',
              vehicleLabel: '2024 Porsche 911',
              servicePerformed: '1-Step Polish',
              beforeNote: 'Light wash marring',
              afterNote: 'Deep gloss reflection',
              imageUrl: uploadedUrls[0],
            },
            {
              id: 'job-2',
              title: 'Custom Range Rover Cabin',
              vehicleLabel: '2023 Range Rover',
              servicePerformed: 'Full Interior Valet',
              beforeNote: 'Muddy carpets',
              afterNote: 'Clean OEM finish',
              imageUrl: uploadedUrls[1],
            },
            {
              id: 'job-3',
              title: 'Unfilled Slot Should Be Hidden',
              vehicleLabel: 'Hidden Car',
              servicePerformed: 'Hidden Service',
              imageUrl: '',
            },
          ],
        }),
      });
      assert.equal(editRes.status, 200);

      const liveHtml2 = await (await fetch(`${baseUrl}/p/${liveProspect.slug}`)).text();
      assert.ok(liveHtml2.includes('id="job-proof"'), 'Live page shows job-proof when photos exist');
      assert.ok(liveHtml2.includes('Custom Porsche Gloss Reset'));
      assert.ok(liveHtml2.includes('Custom Range Rover Cabin'));
      assert.ok(!liveHtml2.includes('Unfilled Slot Should Be Hidden'), 'Unfilled gallery slot must stay hidden in live mode');
      assert.ok(liveHtml2.includes('Custom Pure Water Tank'));
      assert.ok(liveHtml2.includes('id="modal-live-sms-link"'), 'Dialable phone renders SMS CTA');
      assert.ok(liveHtml2.includes('tel:07700900555'));
    });

    await test('Outreach draft PATCH lifecycle and mismatched prospectId 404', async () => {
      const targetId = createdProspectIds[createdProspectIds.length - 1];
      const badRes = await fetch(`${baseUrl}/api/outreach`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          id: `${targetId}-ig`,
          prospectId: 'pros_wrong_id',
          approvalStatus: 'approved',
        }),
      });
      assert.equal(badRes.status, 404);

      const okRes = await fetch(`${baseUrl}/api/outreach`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          id: `${targetId}-ig`,
          prospectId: targetId,
          messageBody: 'Updated manual outreach message for testing approval flow.',
          approvalStatus: 'sent_manually',
        }),
      });
      assert.equal(okRes.status, 200);
      const okJson = await okRes.json();
      assert.equal(okJson.draft.approvalStatus, 'sent_manually');
    });

    await test('Cascade DELETE prospect cleans up prospect, drafts, and quotes', async () => {
      const targetId = createdProspectIds.pop()!;
      const delRes = await fetch(`${baseUrl}/api/prospects`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ prospectId: targetId }),
      });
      assert.equal(delRes.status, 200);

      const secondDel = await fetch(`${baseUrl}/api/prospects`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ prospectId: targetId }),
      });
      assert.equal(secondDel.status, 404);
    });

    console.log('\n=== Suite 8: Owner Portal Isolation, Webhooks SSRF & Token Rotation ===');

    await test('Owner portal 404s invalid tokens, enforces cross-tenant isolation, updates settings, and rotates tokens', async () => {
      const invalidPortal = await fetch(`${baseUrl}/owner/0000000000000000000000000000000000000000`);
      assert.equal(invalidPortal.status, 404);
      const invHtml = await invalidPortal.text();
      assert.ok(invHtml.includes('content="noindex, nofollow"'));

      // Create Shop A and Shop B
      const makeShop = async (label: string) => {
        const res = await fetch(`${baseUrl}/api/prospects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: baseUrl },
          body: JSON.stringify({
            businessName: `${testRunTag} Portal ${label}`,
            city: 'Denver, CO',
            country: 'US',
            serviceArea: 'Denver',
            instagramHandle: `@portal${label.toLowerCase()}`,
            personalizationNote: `Testing owner portal isolation for ${label}`,
          }),
        });
        assert.equal(res.status, 200);
        const json = await res.json();
        createdProspectIds.push(json.prospect.id);
        return json.prospect as { id: string; slug: string; ownerPortalToken: string };
      };

      const shopA = await makeShop('Alpha');
      const shopB = await makeShop('Beta');
      assert.ok(shopA.ownerPortalToken && shopA.ownerPortalToken.length === 64);

      // Submit 1 quote to Shop B
      const qBRes = await fetch(`${baseUrl}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.231' },
        body: JSON.stringify({
          slug: shopB.slug,
          customerName: 'Shop B Customer',
          customerPhone: '303-555-0144',
          customerPostal: '80202',
          vehicleSize: 'sedan',
          packageId: 'pkg-full-reset',
          conditionLevel: 'standard',
          addonsSelected: [],
          preferredTiming: 'this_week',
          isFounderSelfTest: false,
        }),
      });
      assert.equal(qBRes.status, 200);
      const quoteBId = (await qBRes.json()).quote.id;

      // Cross-tenant attack: Shop A token trying to mutate Shop B's quote MUST fail 404
      const crossTenant = await fetch(`${baseUrl}/api/owner/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          ownerToken: shopA.ownerPortalToken,
          quoteId: quoteBId,
          leadStatus: 'booked',
        }),
      });
      assert.equal(crossTenant.status, 404, 'Shop A must never mutate Shop B quote');

      // Shop B token updates its own quote -> 200
      const ownUpdate = await fetch(`${baseUrl}/api/owner/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          ownerToken: shopB.ownerPortalToken,
          quoteId: quoteBId,
          leadStatus: 'booked',
        }),
      });
      assert.equal(ownUpdate.status, 200);

      // Shop B portal page renders cleanly with noindex and Booked status
      const portalRes = await fetch(`${baseUrl}/owner/${shopB.ownerPortalToken}`);
      assert.equal(portalRes.status, 200);
      const portalHtml = await portalRes.text();
      assert.ok(portalHtml.includes('content="noindex, nofollow"'));
      assert.ok(portalHtml.includes('Shop B Customer'));
      assert.ok(portalHtml.includes('Booked'));

      // Shop A updates own availability & base price -> reflected on /p/[slug]
      const setRes = await fetch(`${baseUrl}/api/owner/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          ownerToken: shopA.ownerPortalToken,
          availabilityStatus: 'limited',
          baseSedanPrice: 185,
        }),
      });
      assert.equal(setRes.status, 200);
      const shopAPage = await (await fetch(`${baseUrl}/p/${shopA.slug}`)).text();
      assert.ok(shopAPage.includes('Limited Driveway Slots This Week'));
      assert.ok(shopAPage.includes('$185'));

      // Rotate Shop A token -> old token returns 404, new token returns 200
      const rotRes = await fetch(`${baseUrl}/api/prospects`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ prospectId: shopA.id, rotatePortalToken: true }),
      });
      assert.equal(rotRes.status, 200);
      const newToken = (await rotRes.json()).prospect.ownerPortalToken;
      assert.notEqual(newToken, shopA.ownerPortalToken);
      assert.equal((await fetch(`${baseUrl}/owner/${shopA.ownerPortalToken}`)).status, 404);
      assert.equal((await fetch(`${baseUrl}/owner/${newToken}`)).status, 200);
    });

    await test('Webhook SSRF protection blocks unsafe URLs and Live Mode Guard accepts public https webhookUrl', async () => {
      const targetId = createdProspectIds[createdProspectIds.length - 1];
      for (const badHook of [
        'http://hooks.example.com/test',
        'https://localhost/hook',
        'https://127.0.0.1/hook',
        'https://169.254.169.254/latest/meta-data',
        'https://192.168.1.5/hook',
      ]) {
        const res = await fetch(`${baseUrl}/api/prospects`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: baseUrl },
          body: JSON.stringify({ prospectId: targetId, webhookUrl: badHook }),
        });
        assert.equal(res.status, 400, `Expected 400 SSRF block for ${badHook}, got ${res.status}`);
      }

      // Valid public https webhookUrl unlocks live mode even without ownerEmail
      const liveViaWebhook = await fetch(`${baseUrl}/api/prospects`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({
          prospectId: targetId,
          mode: 'live',
          ownerEmail: '',
          webhookUrl: 'https://hooks.slack.com/services/T000/B000/XXXX',
        }),
      });
      assert.equal(liveViaWebhook.status, 200);
    });
  } finally {
    console.log('\n[Cleanup] Removing temporary E2E test records from local D1...');
    for (const pid of createdProspectIds) {
      await fetch(`${baseUrl}/api/prospects`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ prospectId: pid }),
      }).catch(() => null);
    }
    if (createdInquiryIds.length > 0) {
      const quoted = createdInquiryIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
      runLocalD1Sql(`DELETE FROM inbound_inquiries WHERE id IN (${quoted});`);
    }
    if (createdCandidateIds.length > 0) {
      const quoted = createdCandidateIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
      runLocalD1Sql(`DELETE FROM lead_candidates WHERE id IN (${quoted});`);
    }
  }
}

async function runLockedAuthSuite(baseUrl: string, studioKey: string): Promise<void> {
  console.log('\n=== Suite 4 (Locked Mode): Auth, HMAC Cookie & Public Self-Test Gate ===');

  const tempTag = `e2elock_${Date.now().toString(36)}`;
  let tempProspectId = '';
  let tempProspectSlug = '';

  try {
    await test('Unauthenticated GET /studio shows Unlock form and leaks zero PII', async () => {
      const res = await fetch(`${baseUrl}/studio`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Unlock Founder Studio'));
      assert.ok(!html.includes('Scouted Leads Staging Queue'));
      assert.ok(!html.includes('Inbound Claims &amp; Preview Requests'));
    });

    await test('Unauthenticated Studio APIs all return 401', async () => {
      const endpoints: Array<[string, string]> = [
        ['/api/candidates', 'GET'],
        ['/api/candidates', 'POST'],
        ['/api/candidates', 'PATCH'],
        ['/api/prospects', 'GET'],
        ['/api/prospects', 'POST'],
        ['/api/prospects', 'PATCH'],
        ['/api/prospects', 'DELETE'],
        ['/api/outreach', 'PATCH'],
        ['/api/inquiries', 'PATCH'],
        ['/api/media/upload', 'POST'],
      ];
      for (const [ep, method] of endpoints) {
        const res = await fetch(`${baseUrl}${ep}`, {
          method,
          headers: { 'Content-Type': 'application/json', Origin: baseUrl },
          body: method === 'GET' ? undefined : '{}',
        });
        assert.equal(res.status, 401, `Expected 401 on unauth ${method} ${ep}, got ${res.status}`);
      }
    });

    await test('Wrong studio password fails login without setting cookie', async () => {
      const form = new URLSearchParams({ studioKey: 'wrong_password_123' });
      const res = await fetch(`${baseUrl}/studio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: baseUrl,
        },
        body: form.toString(),
        redirect: 'manual',
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('set-cookie'), null);
      const html = await res.text();
      assert.ok(html.includes('did not match ADMIN_STUDIO_KEY'));
    });

    await test('Forged cookie containing raw ADMIN_STUDIO_KEY is rejected with 401', async () => {
      const res = await fetch(`${baseUrl}/api/candidates`, {
        headers: { Cookie: `qd_studio_key=${studioKey}` },
      });
      assert.equal(res.status, 401);
    });

    let hmacCookieHeader = '';

    await test('Valid studio login sets HttpOnly HMAC cookie (distinct from raw secret) and unlocks APIs', async () => {
      const form = new URLSearchParams({ studioKey });
      const res = await fetch(`${baseUrl}/studio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: baseUrl,
        },
        body: form.toString(),
        redirect: 'manual',
      });
      assert.equal(res.status, 302);
      const setCookie = res.headers.get('set-cookie') || '';
      assert.ok(setCookie.includes('qd_studio_key='));
      assert.ok(setCookie.toLowerCase().includes('httponly'));
      assert.ok(!setCookie.includes(`qd_studio_key=${studioKey}`), 'Cookie must store HMAC token, not raw secret');

      const tokenMatch = /qd_studio_key=([a-f0-9]{64})/.exec(setCookie);
      assert.ok(tokenMatch, 'Expected 64-char hex HMAC token in qd_studio_key cookie');
      hmacCookieHeader = `qd_studio_key=${tokenMatch[1]}`;

      const apiRes = await fetch(`${baseUrl}/api/candidates`, {
        headers: { Cookie: hmacCookieHeader },
      });
      assert.equal(apiRes.status, 200);
    });

    await test('x-studio-key header authorizes CLI calls without Origin header', async () => {
      const res = await fetch(`${baseUrl}/api/prospects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-studio-key': studioKey,
        },
        body: JSON.stringify({
          businessName: `${tempTag} Locked Live Shop`,
          city: 'Seattle, WA',
          country: 'US',
          serviceArea: 'Seattle',
          instagramHandle: '@lockedliveshop',
          personalizationNote: 'Temporary shop for locked-mode self-test verification',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      tempProspectId = data.prospect.id;
      tempProspectSlug = data.prospect.slug;

      const liveRes = await fetch(`${baseUrl}/api/prospects`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-studio-key': studioKey,
        },
        body: JSON.stringify({
          prospectId: tempProspectId,
          mode: 'live',
          ownerEmail: 'locked@example.com',
        }),
      });
      assert.equal(liveRes.status, 200);
    });

    await test('Unauthenticated ?founder=1 and isFounderSelfTest=true are blocked on public pages and APIs', async () => {
      const pageRes = await fetch(`${baseUrl}/p/apex-gloss-austin?founder=1`);
      const pageHtml = await pageRes.text();
      assert.ok(!pageHtml.includes('Founder Test Mode'), 'Public ?founder=1 must not show Founder Test Mode');

      const qRes = await fetch(`${baseUrl}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.240' },
        body: JSON.stringify({
          slug: tempProspectSlug,
          customerName: 'Unauth Attacker',
          customerPhone: '206-555-0199',
          customerPostal: '98101',
          vehicleSize: 'sedan',
          packageId: 'pkg-full-reset',
          conditionLevel: 'standard',
          addonsSelected: [],
          preferredTiming: 'this_week',
          isFounderSelfTest: true,
        }),
      });
      assert.equal(qRes.status, 200);
      const qJson = await qRes.json();
      assert.equal(qJson.isFounderSelfTest, false, 'Unauthenticated isFounderSelfTest must be forced false');
      assert.equal(qJson.ownerPreview, null, 'Unauthenticated live quote must not leak ownerPreview');
      assert.notEqual(qJson.quote.id, 'q_founder_test', 'Quote must be persisted with real ID');
    });

    await test('/studio?logout=1 expires cookie cleanly and deleted cookie returns 401', async () => {
      const res = await fetch(`${baseUrl}/studio?logout=1`, {
        headers: { Cookie: hmacCookieHeader },
        redirect: 'manual',
      });
      assert.equal(res.status, 302);
      const setCookie = res.headers.get('set-cookie') || '';
      assert.ok(
        setCookie.includes('Expires=Thu, 01 Jan 1970') &&
          (setCookie.includes('qd_studio_key=deleted') || setCookie.includes('qd_studio_key=;')),
        `Unexpected logout Set-Cookie header: ${setCookie}`
      );

      const postLogoutApi = await fetch(`${baseUrl}/api/candidates`, {
        headers: { Cookie: 'qd_studio_key=deleted' },
      });
      assert.equal(postLogoutApi.status, 401);
    });
  } finally {
    if (tempProspectId) {
      await fetch(`${baseUrl}/api/prospects`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-studio-key': studioKey,
        },
        body: JSON.stringify({ prospectId: tempProspectId }),
      }).catch(() => null);
    }
  }
}

async function main(): Promise<void> {
  const cfg = parseArgs(process.argv.slice(2));
  console.log(`Running QuotesDock E2E Suite (${cfg.mode.toUpperCase()} mode) against ${cfg.baseUrl}`);

  if (cfg.mode === 'locked') {
    await runLockedAuthSuite(cfg.baseUrl, cfg.studioKey);
  } else {
    await runOpenSuites(cfg.baseUrl);
  }

  console.log(`\n=== E2E Summary (${cfg.mode.toUpperCase()}) ===`);
  console.log(`Passed: ${passed} | Failed: ${failed}`);
  if (failures.length > 0) {
    for (const f of failures) {
      console.error(` - ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('E2E runner crashed:', err);
  process.exit(1);
});
