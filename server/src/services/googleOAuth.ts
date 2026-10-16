import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { google } from 'googleapis';

export function googleOAuthClient() {
  const { GOOGLE_OAUTH_CLIENT_ID: id, GOOGLE_OAUTH_CLIENT_SECRET: secret, GOOGLE_OAUTH_REDIRECT_URL: redirect } = process.env;
  if (!id || !secret || !redirect) throw new Error('Google sign-in is not configured on the server yet.');
  return new google.auth.OAuth2(id, secret, redirect);
}

function encryptionKey() {
  const value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error('Google token encryption is not configured.');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 32) return decoded;
  return createHash('sha256').update(value).digest();
}

export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptToken(value: string) {
  const [iv, tag, payload] = value.split('.');
  if (!iv || !tag || !payload) throw new Error('Stored Google connection is invalid. Reconnect Google.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64url')), decipher.final()]).toString('utf8');
}

export function googleSpreadsheetId(input: string) {
  const value = input.trim();
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = match?.[1] || ( /^[a-zA-Z0-9_-]{20,}$/.test(value) ? value : null );
  if (!id) throw new Error('Paste a valid Google Sheets URL or spreadsheet ID.');
  return id;
}
