export interface QuoteAlertEmailParams {
  businessName: string;
  customerName: string;
  customerPhone: string;
  postalLabel: string;
  customerPostal: string;
  vehicleLabel: string;
  packageName: string;
  durationLabel: string;
  conditionLabel: string;
  addonsSummary: string;
  priceRange: string;
  timingLabel: string;
  notes: string;
  ownerPortalUrl: string;
}

export interface InquiryAlertEmailParams {
  headingLabel: string;
  businessName: string;
  ownerName: string;
  contactInfo: string;
  city: string;
  country: string;
  planTier: string;
  slug: string | null;
  notes: string;
  studioUrl: string;
}

export interface BuiltAlertEmail {
  subject: string;
  senderName: string;
  plainText: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildDetailRow(label: string, valueHtml: string): string {
  return (
    '<tr>' +
    `<td style="padding:10px 0;border-bottom:1px solid #1E293B;color:#94A3B8;font-size:13px;width:38%;vertical-align:top;">${escapeHtml(label)}</td>` +
    `<td style="padding:10px 0;border-bottom:1px solid #1E293B;color:#F8FAFC;font-size:13px;font-weight:600;text-align:right;vertical-align:top;">${valueHtml}</td>` +
    '</tr>'
  );
}

export function buildQuoteAlertEmail(params: QuoteAlertEmailParams): BuiltAlertEmail {
  const dialDigits = params.customerPhone.replace(/[^+\d]/g, '');
  const hasDialablePhone = dialDigits.replace(/\D/g, '').length >= 7;

  // Avoid currency symbols and spam-trigger words like "Lead" in the subject line
  const subject = `Quote Request for ${params.businessName}: ${params.customerName} (${params.vehicleLabel})`;
  const senderName = `${params.businessName} (QuotesDock)`;

  const plainLines = [
    `Hi,`,
    ``,
    `${params.customerName} just submitted a driveway quote request for ${params.businessName}.`,
    ``,
    `Estimate Shown: ${params.priceRange} (${params.durationLabel})`,
    `Vehicle: ${params.vehicleLabel}`,
    `Package: ${params.packageName}`,
    `Condition: ${params.conditionLabel}`,
    `Upgrades: ${params.addonsSummary}`,
    `Customer: ${params.customerName}`,
    `Mobile Phone: ${params.customerPhone}`,
    `${params.postalLabel}: ${params.customerPostal}`,
    `Preferred Timing: ${params.timingLabel}`,
    params.notes ? `Vehicle / Driveway Notes: ${params.notes}` : '',
    ``,
    params.ownerPortalUrl
      ? `Open your private Lead Inbox to update booking status or adjust pricing: ${params.ownerPortalUrl}`
      : `Call or text ${params.customerName} directly to confirm their driveway slot.`,
    ``,
    `Sent via QuotesDock for ${params.businessName} (zero commission).`,
  ].filter((line, idx, arr) => line !== '' || (idx > 0 && arr[idx - 1] !== ''));

  const phoneHtml = hasDialablePhone
    ? `<a href="tel:${escapeHtml(dialDigits)}" style="color:#38BDF8;text-decoration:none;font-weight:700;">${escapeHtml(params.customerPhone)}</a>`
    : escapeHtml(params.customerPhone);

  const rowsHtml = [
    buildDetailRow('Customer', escapeHtml(params.customerName)),
    buildDetailRow('Mobile Phone', phoneHtml),
    buildDetailRow(params.postalLabel, escapeHtml(params.customerPostal)),
    buildDetailRow('Preferred Timing', escapeHtml(params.timingLabel)),
    buildDetailRow('Vehicle Condition', escapeHtml(params.conditionLabel)),
    buildDetailRow('Selected Upgrades', escapeHtml(params.addonsSummary)),
    params.notes ? buildDetailRow('Vehicle / Notes', escapeHtml(params.notes)) : '',
  ]
    .filter(Boolean)
    .join('');

  const buttonsHtml = [
    params.ownerPortalUrl
      ? `<a href="${escapeHtml(params.ownerPortalUrl)}" style="display:inline-block;background-color:#0EA5E9;color:#041019;font-size:13px;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;margin-right:10px;margin-bottom:8px;">Open Private Lead Inbox</a>`
      : '',
    hasDialablePhone
      ? `<a href="tel:${escapeHtml(dialDigits)}" style="display:inline-block;background-color:#1E293B;color:#F8FAFC;border:1px solid #334155;font-size:13px;font-weight:600;text-decoration:none;padding:11px 18px;border-radius:8px;margin-bottom:8px;">Call ${escapeHtml(params.customerName)}</a>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0B0F17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#F1F5F9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0B0F17;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#111827;border:1px solid #1E293B;border-top:3px solid #0EA5E9;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:26px 26px 18px 26px;">
              <div style="display:inline-block;background-color:#0C2438;border:1px solid #0284C7;color:#7DD3FC;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:999px;">
                New Driveway Quote Request
              </div>
              <h1 style="margin:14px 0 4px 0;font-size:21px;line-height:1.25;color:#F8FAFC;font-weight:700;">
                ${escapeHtml(params.businessName)}
              </h1>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#CBD5E1;">
                ${escapeHtml(params.customerName)} requested a booking window for ${escapeHtml(params.timingLabel)}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 26px 18px 26px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#090D16;border:1px solid #1E293B;border-radius:10px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94A3B8;">
                      Estimated Range Shown to Customer
                    </div>
                    <div style="margin-top:4px;font-size:26px;line-height:1.2;font-weight:800;color:#38BDF8;">
                      ${escapeHtml(params.priceRange)}
                    </div>
                    <div style="margin-top:6px;font-size:13px;color:#E2E8F0;font-weight:600;">
                      ${escapeHtml(params.vehicleLabel)} &middot; ${escapeHtml(params.packageName)}
                    </div>
                    <div style="margin-top:2px;font-size:12px;color:#94A3B8;">
                      ${escapeHtml(params.durationLabel)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 26px 20px 26px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                ${rowsHtml}
              </table>
            </td>
          </tr>
          ${
            buttonsHtml
              ? `<tr><td style="padding:0 26px 22px 26px;">${buttonsHtml}</td></tr>`
              : ''
          }
          <tr>
            <td style="padding:16px 26px;background-color:#090D16;border-top:1px solid #1E293B;font-size:12px;line-height:1.5;color:#94A3B8;">
              Sent via QuotesDock for ${escapeHtml(params.businessName)}. Zero commission - call or text ${escapeHtml(params.customerName)} directly to confirm their driveway slot.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    senderName,
    plainText: plainLines.join('\n'),
    html,
  };
}

export function buildInquiryAlertEmail(params: InquiryAlertEmailParams): BuiltAlertEmail {
  const locationLabel = params.city || params.country;
  const subject = `QuotesDock ${params.headingLabel}: ${params.businessName} (${locationLabel})`;
  const senderName = 'QuotesDock Studio';

  const plainLines = [
    `New ${params.headingLabel} on QuotesDock:`,
    ``,
    `Business: ${params.businessName}`,
    `Location: ${locationLabel} (${params.country})`,
    `Owner Name: ${params.ownerName}`,
    `Contact: ${params.contactInfo}`,
    `Plan Interest: ${params.planTier}`,
    params.slug ? `Preview Page: /p/${params.slug}` : '',
    params.notes ? `Notes: ${params.notes}` : '',
    ``,
    `Review and respond in Operator Studio: ${params.studioUrl}`,
  ].filter((line, idx, arr) => line !== '' || (idx > 0 && arr[idx - 1] !== ''));

  const rowsHtml = [
    buildDetailRow('Business', escapeHtml(params.businessName)),
    buildDetailRow('Location', `${escapeHtml(locationLabel)} (${escapeHtml(params.country)})`),
    buildDetailRow('Owner Name', escapeHtml(params.ownerName)),
    buildDetailRow('Contact', escapeHtml(params.contactInfo)),
    buildDetailRow('Plan Tier', escapeHtml(params.planTier)),
    params.slug ? buildDetailRow('Preview Slug', `/p/${escapeHtml(params.slug)}`) : '',
    params.notes ? buildDetailRow('Notes', escapeHtml(params.notes)) : '',
  ]
    .filter(Boolean)
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0B0F17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#F1F5F9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0B0F17;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#111827;border:1px solid #1E293B;border-top:3px solid #10B981;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:26px 26px 14px 26px;">
              <div style="display:inline-block;background-color:#0B2E26;border:1px solid #10B981;color:#6EE7B7;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:999px;">
                ${escapeHtml(params.headingLabel)}
              </div>
              <h1 style="margin:14px 0 4px 0;font-size:21px;line-height:1.25;color:#F8FAFC;font-weight:700;">
                ${escapeHtml(params.businessName)}
              </h1>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#CBD5E1;">
                Submitted by ${escapeHtml(params.ownerName)} (${escapeHtml(locationLabel)}).
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 26px 20px 26px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                ${rowsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 26px 24px 26px;">
              <a href="${escapeHtml(params.studioUrl)}" style="display:inline-block;background-color:#38BDF8;color:#041019;font-size:13px;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;">
                Open Operator Studio
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    senderName,
    plainText: plainLines.join('\n'),
    html,
  };
}
