import type { LeadImportRow } from '../../services/leadsApi';

function parseDelimited(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/\t/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(value.trim()); value = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value.trim()); rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (value || row.length) { row.push(value.trim()); rows.push(row); }
  return rows.filter(item => item.some(cell => cell.trim()));
}

const normalize = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export function parseLeadCsv(text: string): LeadImportRow[] {
  const rows = parseDelimited(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalize);
  const find = (...aliases: string[]) => headers.findIndex(header => aliases.includes(header));
  const emailIdx = find('email', 'e_mail');
  if (emailIdx < 0) throw new Error('File needs an Email column.');
  const idx = {
    name: find('full_name', 'name', 'contact_name'), first: find('first_name'), last: find('last_name'),
    phone: find('phone_number', 'phone', 'mobile', 'telephone'), company: find('company', 'business'),
    campaign: find('campaign_name', 'campaign'), formName: find('form_name'), leadStatus: find('lead_status'),
  };
  const value = (row: string[], at: number) => at >= 0 ? (row[at] || '').trim() : '';
  return rows.slice(1).filter(row => value(row, emailIdx).includes('@')).map(row => {
    const fullName = value(row, idx.name) || [value(row, idx.first), value(row, idx.last)].filter(Boolean).join(' ');
    return {
      email: value(row, emailIdx), name: fullName || undefined, phone: value(row, idx.phone).replace(/^p:/i, '') || undefined,
      company: value(row, idx.company) || undefined, campaign: value(row, idx.campaign) || undefined,
      formName: value(row, idx.formName) || undefined,
      sourceLeadStatus: value(row, idx.leadStatus) || undefined,
      source: 'Meta Lead Ads',
    };
  });
}

export function downloadLeadCsv(leads: Array<{name:string;email:string;phone:string|null;company:string|null;campaign:string|null;status:string;formName?:string|null;sourceLeadStatus?:string|null}>) {
  const columns = ['Name','Email','Phone','Company','Campaign','Form','Meta lead status','Mailbox status'];
  const csv = [columns.join(','), ...leads.map(l => [l.name,l.email,l.phone||'',l.company||'',l.campaign||'',l.formName||'',l.sourceLeadStatus||'',l.status].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='mailbox-leads.csv';a.click();URL.revokeObjectURL(url);
}
