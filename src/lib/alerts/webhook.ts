import { isSafePublicWebhookUrl } from '../validation/schemas';

export interface WebhookAlertParams {
  webhookUrl: string;
  text: string;
  emailText?: string;
  html?: string;
  senderName?: string;
  subject?: string;
  to?: string;
  founderEmail?: string;
  secret?: string;
  payload: Record<string, unknown>;
}

/**
 * Dispatch an instant SSRF-safe JSON alert to Discord, Slack, Make, Zapier,
 * n8n, or a Google Apps Script Gmail relay (which uses 302 redirects).
 */
export async function sendWebhookAlert(
  params: WebhookAlertParams
): Promise<{ ok: boolean; error?: string }> {
  const url = params.webhookUrl.trim();
  if (!url || !isSafePublicWebhookUrl(url)) {
    return { ok: false, error: 'Blocked unsafe webhook URL.' };
  }

  const lower = url.toLowerCase();
  const body =
    lower.includes('discord.com/api/webhooks') ||
    lower.includes('discordapp.com/api/webhooks')
      ? { content: params.text }
      : lower.includes('hooks.slack.com')
        ? { text: params.text }
        : {
            text: params.emailText || params.text,
            html: params.html || '',
            senderName: params.senderName || 'QuotesDock',
            content: params.text,
            subject: params.subject || 'QuotesDock Notification',
            to: params.to || '',
            founderEmail: params.founderEmail || '',
            ...(params.secret ? { secret: params.secret } : {}),
            ...params.payload,
          };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(params.secret ? { 'X-QuotesDock-Secret': params.secret } : {}),
      },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    });

    const respText = await res.text().catch(() => '');
    if (!res.ok) {
      return {
        ok: false,
        error: `Webhook HTTP ${res.status}: ${respText.slice(0, 160)}`,
      };
    }

    const trimmed = respText.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as { ok?: unknown; error?: unknown };
        if (parsed && typeof parsed === 'object' && parsed.ok === false) {
          return {
            ok: false,
            error: String(
              parsed.error || 'Webhook returned ok:false (check WEBHOOK_SECRET or script logs).'
            ).slice(0, 180),
          };
        }
      } catch {
        // Non-JSON text body treated as ok
      }
    } else if (lower.includes('script.google.com') && trimmed.startsWith('<')) {
      const plain = trimmed
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const exIdx = plain.indexOf('Exception:');
      const snippet = exIdx >= 0 ? plain.slice(exIdx, exIdx + 170) : '';
      return {
        ok: false,
        error:
          snippet ||
          'Google Apps Script returned an HTML error page (check script permissions or Manage Deployments -> New version).',
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 160) : 'Webhook timed out',
    };
  }
}
