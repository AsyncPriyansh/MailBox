export interface TemplateBlock {
  id: string;
  type: 'heading' | 'text' | 'button' | 'image' | 'feature' | 'divider' | 'spacer' | 'social' | 'footer' | 'raw_html';
  content: Record<string, any>;
  style?: Record<string, any>;
}

export interface EmailSettings {
  subject: string;
  preheader: string;
  backgroundColor: string;
  cardColor: string;
  primaryColor: string;
  fontFamily: string;
}

export const STARTER_PRESETS: Record<string, { name: string; subject: string; preheader: string; blocks: TemplateBlock[] }> = {
  lead_welcome: {
    name: 'Lead Welcome & Follow-up',
    subject: 'Thanks for connecting, {{name}}! Here is your requested info',
    preheader: 'We received your inquiry and our team is ready to help.',
    blocks: [
      {
        id: 'block-brand',
        type: 'heading',
        content: { text: '{{company}}', level: 'h3', align: 'center', color: '#176b4b' }
      },
      {
        id: 'block-hero-title',
        type: 'heading',
        content: { text: 'Hi {{name}}, thanks for reaching out!', level: 'h1', align: 'left', color: '#1a241e' }
      },
      {
        id: 'block-hero-text',
        type: 'text',
        content: {
          text: 'Thank you for getting in touch with our team. We received your details and are preparing the information you requested.\n\nOur team will review your inquiry and follow up shortly with next steps.',
          align: 'left',
          color: '#46564c'
        }
      },
      {
        id: 'block-feature',
        type: 'feature',
        content: {
          badge: 'NEXT STEPS',
          title: 'What happens next?',
          description: '1. Our team reviews your inquiry.\n2. We reach out to understand your requirements.\n3. We share relevant information and answer your questions.',
          bg: '#f3f8f5'
        }
      },
      {
        id: 'block-cta',
        type: 'button',
        content: {
          text: 'Visit Our Website →',
          url: 'https://example.com',
          align: 'center',
          bgColor: '#176b4b',
          textColor: '#ffffff',
          borderRadius: 8
        }
      },
      {
        id: 'block-divider',
        type: 'divider',
        content: { color: '#e5eae6', margin: 20 }
      },
      {
        id: 'block-footer',
        type: 'footer',
        content: {
          company: '{{company}}',
          address: 'Sent to {{email}} because you requested information from us.',
          unsubscribeText: 'Unsubscribe from communications'
        }
      }
    ]
  },
  meeting_invite: {
    name: 'Consultation & Demo Invite',
    subject: 'Invitation: Schedule a consultation for {{company}}',
    preheader: 'Book a convenient time to connect with our team.',
    blocks: [
      {
        id: 'block-brand-2',
        type: 'heading',
        content: { text: '{{company}}', level: 'h3', align: 'left', color: '#176b4b' }
      },
      {
        id: 'block-title-2',
        type: 'heading',
        content: { text: 'Let’s discuss your goals, {{name}}', level: 'h1', align: 'left', color: '#1a241e' }
      },
      {
        id: 'block-text-2',
        type: 'text',
        content: {
          text: 'Hi {{name}},\n\nFollowing up on your recent inquiry, I would love to schedule a brief call to learn more about your requirements and explore how we can assist you.\n\nPlease choose a time on our calendar that works best for your schedule.',
          align: 'left',
          color: '#46564c'
        }
      },
      {
        id: 'block-cta-2',
        type: 'button',
        content: {
          text: 'Choose a Meeting Time →',
          url: 'https://example.com/schedule',
          align: 'left',
          bgColor: '#176b4b',
          textColor: '#ffffff',
          borderRadius: 8
        }
      },
      {
        id: 'block-divider-2',
        type: 'divider',
        content: { color: '#e5eae6', margin: 24 }
      },
      {
        id: 'block-footer-2',
        type: 'footer',
        content: {
          company: '{{company}}',
          address: 'Sent to {{email}} regarding your consultation request.',
          unsubscribeText: 'Manage communication preferences'
        }
      }
    ]
  }
};

export function compileEmailHtml(blocks: TemplateBlock[], settings: EmailSettings): string {
  const { backgroundColor, cardColor, fontFamily, preheader } = settings;

  const renderedBlocks = blocks.map(block => {
    switch (block.type) {
      case 'heading': {
        const { text = '', level = 'h2', align = 'left', color = '#1a241e' } = block.content;
        const fontSize = level === 'h1' ? '26px' : level === 'h2' ? '20px' : '15px';
        const fontWeight = level === 'h3' ? '700' : '800';
        const letterSpacing = level === 'h3' ? '0.08em' : '-0.02em';
        const cleanedText = String(text).replace(/\u00A0/g, ' ');
        return `
          <tr>
            <td style="padding: 10px 0; text-align: ${align}; word-break: break-word; overflow-wrap: anywhere;">
              <${level} style="margin: 0; font-family: ${fontFamily}; font-size: ${fontSize}; font-weight: ${fontWeight}; color: ${color}; letter-spacing: ${letterSpacing}; line-height: 1.3; word-break: break-word; overflow-wrap: anywhere;">
                ${escapeHtml(cleanedText)}
              </${level}>
            </td>
          </tr>
        `;
      }
      case 'text': {
        const { text = '', align = 'left', color = '#4a574f' } = block.content;
        const paragraphs = String(text)
          .replace(/\u00A0/g, ' ')
          .split(/\n{2,}|\n/)
          .filter(Boolean)
          .map(p => `<p style="margin: 0 0 12px 0; font-family: ${fontFamily}; font-size: 15px; line-height: 1.65; color: ${color}; text-align: ${align}; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(p)}</p>`)
          .join('');
        return `
          <tr>
            <td style="padding: 8px 0; word-break: break-word; overflow-wrap: anywhere;">
              ${paragraphs || '<p style="margin:0;">&nbsp;</p>'}
            </td>
          </tr>
        `;
      }
      case 'button': {
        const { text = 'Click here', url = '#', align = 'center', bgColor = '#176b4b', textColor = '#ffffff', borderRadius = 8 } = block.content;
        const cleanedBtnText = String(text).replace(/\u00A0/g, ' ');
        return `
          <tr>
            <td style="padding: 16px 0; text-align: ${align};">
              <table border="0" cellspacing="0" cellpadding="0" style="margin: ${align === 'center' ? '0 auto' : align === 'right' ? '0 0 0 auto' : '0'};">
                <tr>
                  <td align="center" style="border-radius: ${borderRadius}px; background-color: ${bgColor};">
                    <a href="${escapeHtml(url)}" target="_blank" style="font-family: ${fontFamily}; font-size: 15px; font-weight: 700; color: ${textColor}; text-decoration: none; padding: 13px 26px; border-radius: ${borderRadius}px; display: inline-block; border: 1px solid ${bgColor}; word-break: break-word; overflow-wrap: anywhere;">
                      ${escapeHtml(cleanedBtnText)}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        `;
      }
      case 'image': {
        const { url = '', alt = 'Email image', align = 'center', width = '100%' } = block.content;
        if (!url) return '';
        return `
          <tr>
            <td style="padding: 14px 0; text-align: ${align};">
              <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="max-width: ${width}; height: auto; border-radius: 8px; display: inline-block; border: 0;" />
            </td>
          </tr>
        `;
      }
      case 'feature': {
        const { badge = 'NOTE', title = 'Feature highlight', description = '', bg = '#f4f8f5' } = block.content;
        const cleanedBadge = badge ? String(badge).replace(/\u00A0/g, ' ') : '';
        const cleanedTitle = String(title).replace(/\u00A0/g, ' ');
        const cleanedDesc = String(description).replace(/\u00A0/g, ' ');
        return `
          <tr>
            <td style="padding: 14px 0;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${bg}; border-radius: 10px; border: 1px solid #e1ece5; table-layout: fixed;">
                <tr>
                  <td style="padding: 20px 22px; word-break: break-word; overflow-wrap: anywhere;">
                    ${cleanedBadge ? `<div style="font-family: ${fontFamily}; font-size: 11px; font-weight: 800; color: #176b4b; letter-spacing: 0.08em; margin-bottom: 6px; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(cleanedBadge)}</div>` : ''}
                    <div style="font-family: ${fontFamily}; font-size: 16px; font-weight: 700; color: #1b2820; margin-bottom: 6px; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(cleanedTitle)}</div>
                    <div style="font-family: ${fontFamily}; font-size: 14px; line-height: 1.55; color: #48584e; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(cleanedDesc)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        `;
      }
      case 'divider': {
        const { color = '#e5ebe6', margin = 20 } = block.content;
        return `
          <tr>
            <td style="padding: ${margin}px 0;">
              <hr style="border: 0; border-top: 1px solid ${color}; margin: 0;" />
            </td>
          </tr>
        `;
      }
      case 'spacer': {
        const { height = 24 } = block.content;
        return `
          <tr>
            <td height="${height}" style="font-size: 0px; line-height: 0px; height: ${height}px;">&nbsp;</td>
          </tr>
        `;
      }
      case 'footer': {
        const { company = '', address = '', unsubscribeText = 'Unsubscribe' } = block.content;
        return `
          <tr>
            <td style="padding: 24px 0 10px 0; text-align: center;">
              <div style="font-family: ${fontFamily}; font-size: 13px; font-weight: 700; color: #536459; margin-bottom: 4px;">${escapeHtml(company)}</div>
              <div style="font-family: ${fontFamily}; font-size: 12px; color: #87958b; line-height: 1.5; margin-bottom: 10px;">${escapeHtml(address)}</div>
              <div style="font-family: ${fontFamily}; font-size: 11px; color: #a0aca3;">
                <a href="{{unsubscribe_url}}" style="color: #6a7c70; text-decoration: underline;">${escapeHtml(unsubscribeText)}</a>
              </div>
            </td>
          </tr>
        `;
      }
      case 'raw_html': {
        const { html = '' } = block.content;
        return `
          <tr>
            <td style="padding: 10px 0;">
              ${html}
            </td>
          </tr>
        `;
      }
      default:
        return '';
    }
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(settings.subject || 'Email')}</title>
  ${preheader ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ''}
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; font-family: ${fontFamily}; }
    p, div, span, h1, h2, h3, td { overflow-wrap: anywhere !important; word-break: break-word !important; }
    @media screen and (max-width: 620px) {
      .email-container { width: 100% !important; padding: 12px !important; }
      .email-card { padding: 22px 18px !important; }
    }
  </style>
</head>
<body style="background-color: ${backgroundColor}; margin: 0; padding: 30px 10px;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center">
        <table class="email-container" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; table-layout: fixed;">
          <tr>
            <td class="email-card" style="background-color: ${cardColor}; border-radius: 14px; padding: 36px 32px; border: 1px solid #e1e7e2; box-shadow: 0 4px 18px rgba(0,0,0,0.03);">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                ${renderedBlocks}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
