import 'dotenv/config';
import { supabase } from '../dist/supabase.js';
import { decryptToken, googleOAuthClient } from '../dist/services/googleOAuth.js';
import { google } from 'googleapis';

async function backfillTimestamps() {
  if (!supabase) throw new Error('Supabase is not configured.');
  const workspaceId = process.env.MAILBPOX_WORKSPACE_ID;
  if (!workspaceId) throw new Error('MAILBPOX_WORKSPACE_ID is missing.');

  console.log(`Starting timestamp backfill for workspace: ${workspaceId}`);

  // 1. Fetch sheet connection
  const { data: conn, error: connErr } = await supabase
    .from('google_sheet_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single();

  if (connErr || !conn?.spreadsheet_id) {
    throw new Error(`Google Sheet connection not found: ${connErr?.message}`);
  }

  console.log(`Found sheet: "${conn.spreadsheet_title}" (${conn.spreadsheet_id})`);

  // 2. Fetch rows from Google Sheet
  const oauth = googleOAuthClient();
  oauth.setCredentials({ refresh_token: decryptToken(conn.encrypted_refresh_token) });
  const sheets = google.sheets({ version: 'v4', auth: oauth });

  const sheetRes = await sheets.spreadsheets.values.get({
    spreadsheetId: conn.spreadsheet_id,
    range: conn.sheet_range || 'Sheet1!A1:Z500'
  });

  const values = sheetRes.data.values || [];
  if (values.length < 2) {
    console.log('No data rows found in Google Sheet.');
    return;
  }

  const headers = values[0].map(h => String(h || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_'));
  const emailIdx = headers.findIndex(h => h === 'email' || h === 'e_mail');
  const timeIdx = headers.findIndex(h => ['created_time', 'created_at', 'timestamp', 'date', 'lead_time'].includes(h));

  if (emailIdx < 0 || timeIdx < 0) {
    throw new Error(`Could not locate columns: emailIdx=${emailIdx}, timeIdx=${timeIdx}`);
  }

  console.log(`Column indices: email=${emailIdx}, created_time=${timeIdx}`);

  // Build map of email -> earliest arrival timestamp
  const emailToTimestamp = new Map();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const email = String(row[emailIdx] || '').toLowerCase().trim();
    const rawTime = String(row[timeIdx] || '').trim();
    if (!email || !email.includes('@') || !rawTime) continue;

    const d = new Date(rawTime);
    if (isNaN(d.getTime())) continue;

    const iso = d.toISOString();
    if (!emailToTimestamp.has(email)) {
      emailToTimestamp.set(email, iso);
    }
  }

  console.log(`Mapped ${emailToTimestamp.size} unique lead emails to their real Meta creation timestamps.`);

  // 3. Fetch all current contacts for this workspace
  const contacts = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, primary_email, created_at')
      .eq('workspace_id', workspaceId)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    contacts.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  console.log(`Found ${contacts.length} total contacts in database.`);

  // 4. Update contacts whose timestamps differ
  let updatedCount = 0;
  let skippedCount = 0;
  let notInSheetCount = 0;

  for (const contact of contacts) {
    const email = String(contact.primary_email || '').toLowerCase().trim();
    const realTime = emailToTimestamp.get(email);

    if (!realTime) {
      notInSheetCount++;
      continue;
    }

    // Compare timestamps (ignoring minor sub-millisecond precision differences)
    const currentMs = new Date(contact.created_at).getTime();
    const realMs = new Date(realTime).getTime();

    if (Math.abs(currentMs - realMs) > 1000) {
      const { error: updateErr } = await supabase
        .from('contacts')
        .update({ created_at: realTime })
        .eq('id', contact.id);

      if (updateErr) {
        console.error(`Failed to update contact ${contact.id} (${email}):`, updateErr.message);
      } else {
        updatedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  console.log('\n=== BACKFILL SUMMARY ===');
  console.log(`Successfully updated timestamps: ${updatedCount}`);
  console.log(`Already matched / up-to-date:    ${skippedCount}`);
  console.log(`Contacts not found in sheet:      ${notInSheetCount}`);
  console.log('Zero emails were triggered or enqueued during this process.');
}

backfillTimestamps().catch(err => {
  console.error('Fatal backfill error:', err);
  process.exit(1);
});
