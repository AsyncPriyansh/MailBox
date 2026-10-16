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
2. Apply `server/migrations/001_initial.sql` to a dedicated Supabase project. Insert a workspace row and configure its UUID.
3. Copy `server/.env.example` to `server/.env` and configure Supabase, Redis, a long random API token, the sheet sync token, and verified ZeptoMail sender credentials.
4. Configure the private API token and API URL for local development in `.env.local` (see root `.env.example`). Never expose a production shared token in a public Vite build; add a client login/session flow before public release.
5. Start Redis, then the backend and Vite client.

CSV import and automatic Google Sheets polling are implemented. Sync requires the server-side Google service account and spreadsheet settings below. Actual campaign delivery requires Supabase, Redis, and ZeptoMail configuration. The browser reports unavailable service state rather than displaying seeded leads as live data.

## Templates and scheduling

Saved templates are workspace-scoped records in `email_templates`. The campaign composer can select one, select recipients, and either enqueue immediately or choose a future date/time. Scheduled jobs are stored with `scheduled_at` and submitted to BullMQ with a delay; Redis must remain available so the delayed job can be released. Apply migration `002_templates_and_scheduling.sql` to an existing install. New installations can use the updated `001_initial.sql`.

## Google Sheets automatic sync

1. In Google Cloud, enable the Google Sheets API and create a service account with a JSON key.
2. Configure `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`, and (optionally) `GOOGLE_SHEETS_RANGE` / `GOOGLE_SHEETS_SYNC_INTERVAL_MINUTES` in `server/.env`. Keep the JSON private key on the server; never add it to Vite/client env.
3. Share the target Google Sheet with the service account email as a Viewer. The first row in the configured range must be headers and include an Email column. Supported aliases include name/full name, first/last name, phone/mobile, company/business, and campaign/ad name.
4. Apply the integration state table from migration `002_templates_and_scheduling.sql` (or the updated initial schema for a new database), then restart the API.

When configured, the server syncs immediately at startup and then at the configured interval (5 minutes by default). The app shows the last successful sync and has a manual **Sync now** action. Sync upserts by email and preserves each lead's existing status. This polling integration reads the sheet; it does not modify it.
