# Mailbpox

Client lead and email workspace: Meta Lead Ads → client-owned Google Sheet → Mailbpox → ZeptoMail.

## Architecture

- `src/features/`: dashboard, lead workflow, CSV parsing/export and campaign UI.
- `src/services/`: typed API transport plus leads and campaigns endpoints.
- `server/src/routes/`: Fastify HTTP boundaries, request validation and sheet sync endpoint.
- `server/src/services/`: contacts repository, campaign orchestration, suppression lookup and Sheets adapter.
- `server/src/queues/` + `server/src/workers/`: BullMQ email queue, retries and persistence.
- `server/src/providers/`: ZeptoMail adapter; provider keys stay server-side.
- `server/migrations/`: isolated, workspace-scoped database schema.

## Setup

1. Install the frontend dependencies in the project root, and backend dependencies with `cd server && npm install`.
2. Apply `server/migrations/001_initial.sql` to a dedicated Supabase project. Insert a workspace row and configure its UUID. Apply migrations `002` through `007` in order for templates, integrations, welcome-email settings, and Meta lead form fields.
3. Copy `server/.env.example` to `server/.env` and configure Supabase, Redis, a long random API token, the sheet sync token, and verified ZeptoMail sender credentials.
4. Configure the private API token and API URL for local development in `.env.local` (see root `.env.example`). Never expose a production shared token in a public Vite build; add a client login/session flow before public release.
5. Start Redis, then the backend and Vite client.

CSV import and automatic Google Sheets polling are implemented. Sync requires the server-side Google service account and spreadsheet settings below. Actual campaign delivery requires Supabase, Redis, and ZeptoMail configuration. The browser reports unavailable service state rather than displaying seeded leads as live data.

## Templates and scheduling

Saved templates are workspace-scoped records in `email_templates`. The campaign composer can select one, select recipients, and either enqueue immediately or choose a future date/time. Scheduled jobs are stored with `scheduled_at` and submitted to BullMQ with a delay; Redis must remain available so the delayed job can be released. Apply migration `002_templates_and_scheduling.sql` to an existing install. New installations can use the updated `001_initial.sql`.

Apply `server/migrations/006_workspace_email_settings.sql` to existing databases to enable explicit welcome-template selection. In the Templates page, select the saved template for new leads and confirm that ZeptoMail shows as ready. New leads arriving through Sheets sync, CSV import, or the secure server-side form hook use this configured template. Delivery requires `ZEPTOMAIL_API_KEY` and a verified `ZEPTOMAIL_FROM_EMAIL`.

### Website form integration

For a website form, have its **server-side** handler call `POST /v1/integrations/leads/form` with `X-Sync-Token: <SHEETS_SYNC_TOKEN>` and JSON such as `{"lead":{"email":"person@example.com","name":"Person","phone":"+1 555 0100","company":"Example","campaign":"Contact form"}}`. The API uses `MAILBPOX_WORKSPACE_ID`, deduplicates by email, and runs the configured welcome-email flow for a new contact. Keep the token on the form server; never embed it in browser JavaScript. The hook requires `SHEETS_SYNC_TOKEN` and a configured workspace.

### ZeptoMail suppressions and delivery events

Apply `server/migrations/008_suppression_webhooks.sql` before enabling the webhook. Local suppression entries are checked before campaign and welcome sends, including again when queued jobs are picked up. Complaints are blocked locally as soon as their webhook arrives. Bounce events are recorded and update the matching email job; permanent addresses are imported from ZeptoMail's suppression list the next time the Suppression list is opened or refreshed. This follows ZeptoMail's behavior: temporary bounces are reports, while provider suppressions represent addresses that should not receive future mail.

For automatic provider-list sync and for manual add/remove to mirror into ZeptoMail, configure server-side OAuth credentials with suppression permissions: `ZEPTOMAIL_REFRESH_TOKEN`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, and the correct `ZOHO_ACCOUNTS_URL` for your Zoho region (India default: `https://accounts.zoho.in`). Also set `ZEPTOMAIL_MAIL_AGENT_KEY` to the Mail Agent key; suppression reads are filtered by this key and never fall back to the account-wide list. A direct `ZEPTOMAIL_OAUTH_TOKEN` can be used for short-lived setups. The send-only `ZEPTOMAIL_API_KEY` does not grant suppression-list access. Without OAuth or the agent key, the local list and send protection still work; the Suppression list page reports what is missing. Never put these credentials in client-side environment variables.

Set a long random `ZEPTOMAIL_WEBHOOK_TOKEN` in the API environment and restart the API. In ZeptoMail, configure delivery, bounce, and complaint events to `https://<your-api-host>/v1/webhooks/zeptomail` with custom header `X-ZeptoMail-Webhook-Token` set to the same secret. The handler authenticates the request, stores the raw payload, records normalized events, updates matching email jobs, and immediately adds complaint addresses to local suppression. See ZeptoMail's [webhook configuration guide](https://www.zoho.com/campaigns/help/emailapi/webhooks/create-webhook.html) and [suppression API](https://www.zoho.com/zeptomail/help/api/get-suppression-list.html).

## Google Sheets automatic sync

1. In Google Cloud, enable the Google Sheets API and create a service account with a JSON key.
2. Configure `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`, and (optionally) `GOOGLE_SHEETS_RANGE` / `GOOGLE_SHEETS_SYNC_INTERVAL_MINUTES` in `server/.env`. Keep the JSON private key on the server; never add it to Vite/client env.
3. Share the target Google Sheet with the service account email as a Viewer. The first row in the configured range must be headers and include an Email column. Supported aliases include name/full name, first/last name, phone/mobile, company/business, and campaign/ad name.
4. Apply the integration state table from migration `002_templates_and_scheduling.sql` (or the updated initial schema for a new database), then restart the API.

When configured, the server syncs immediately at startup and then at the configured interval (5 minutes by default). The app shows the last successful sync and has a manual **Sync now** action. Sync upserts by email and preserves each lead's existing status. This polling integration reads the sheet; it does not modify it.
