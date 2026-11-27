import { isSafePublicWebhookUrl } from '../validation/schemas';

export interface WebhookAlertParams {
  webhookUrl: string;
  text: string;
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
            text: params.text,
            content: params.text,
            subject: params.subject || 'QuotesDock Alert',
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

    if (res.ok) {
      return { ok: true };
    }
    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      error: `Webhook HTTP ${res.status}: ${errText.slice(0, 160)}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 160) : 'Webhook timed out',
    };
  }
}
