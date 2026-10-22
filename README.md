# Luma salon application

One repository, one Node application, one origin and one deployment. The existing public website and admin design are retained. Vite builds the shared frontend; Express serves it alongside authenticated APIs. Supabase Postgres stores salon settings, appointments, admin accounts, sessions and website conversations. SQLite remains available for isolated local development when no cloud connection is configured.

The old version had no backend, admin account or database. Its browser-local storage has been replaced with server-backed persistence. No public admin sign-up or default password has been added.

## Run locally

Requires **Node.js 24 or newer**.

```sh
npm install
npm run admin:create -- owner@example.com
npm run dev
```

Choose your own email in the provisioning command. It prompts for a password of 12–256 characters, hides typed characters, and stores only a salted scrypt hash. Do not enter a password in command-line arguments or commit it. No real admin account is created automatically. Run provisioning with the same `.env` / `DATABASE_URL` as the application. Without cloud configuration, use the same `DATABASE_PATH`. On this workspace the existing owner account is already provisioned and promoted; do not recreate it.

Default URL: `http://127.0.0.1:5173`. Copy `.env.example` to `.env` if you need different server settings. Both the server and private admin commands load `.env`; it is ignored by Git.

| Route                   | Purpose                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `/`                     | Public salon website and customer chat                                                 |
| `/admin/login`          | Admin login, with a link back to the salon                                             |
| `/admin/`               | Protected dashboard                                                                    |
| `/admin/#appointments`  | Appointment inbox                                                                      |
| `/admin/#conversations` | Website conversations and replies                                                      |
| `/admin/#services`      | Services, categories and prices                                                        |
| `/admin/#gallery`       | Photos, captions and accessible descriptions                                           |
| `/admin/#locations`     | Branch names, full addresses, phones and hours                                         |
| `/admin/#settings`      | **Superadmin only:** identity, contact, WhatsApp, homepage, colors, SEO and data tools |

A discreet **Admin Login** link is always present in the public footer. Unauthenticated admin-page requests redirect to login. Admin APIs also verify the current account’s admin role; typing a URL or changing frontend state does not bypass access checks. Ordinary customer accounts cannot use admin pages or APIs. The dashboard includes **Sign out** and **View customer website**.

Reset an existing administrator’s password privately:

```sh
npm run admin:password -- owner@example.com
```

Resetting the password revokes that account’s existing sessions. There are no public registration, role-change or password-reset endpoints.

## Superadmin and permissions

The existing owner account in this workspace has been promoted in Supabase without changing its password. Sign in at `/admin/login`; superadmins land on `/admin/#settings`. No default or recoverable plaintext password exists. The private password reset command above also supports superadmins.

For another installation, privately promote an existing admin:

```sh
npm run superadmin:promote -- owner@example.com
```

Superadmins control Website Settings: identity, contact/WhatsApp, homepage, branding, SEO, configuration import and restoration. Regular admins retain services/pricing, gallery, branches, reviews, appointments and customer chat. The server rejects unauthorized setting changes even from crafted API requests. A superadmin marker does not override a revoked underlying admin role. Website Settings > Data & setup shows the connected database provider. Stored passwords and database credentials are never exposed in the dashboard. Superadmins can create normal admins from Admin accounts; superadmin promotion stays private.

### Add an admin from the dashboard

Sign in as a superadmin and open **Admin accounts** (`/admin/#accounts`) in the sidebar. Enter the new admin's email, a 12–256 character password and matching confirmation, then select **Create admin account**. The account is stored immediately in the same database and can sign in at `/admin/login`. Share credentials privately; no invitation email is sent. Passwords are hashed, never returned in account lists, and cleared from the form on success.

Only superadmins can list or create these accounts. The screen creates normal admins only; superadmin promotion remains a private CLI operation. Duplicate emails, invalid passwords and failed saves show clear errors. Existing CLI creation/reset commands remain available. There is still no public registration endpoint.

## Supabase connection and migration

The workspace is connected to project **salon-website**. Its private credential is in the ignored `.env`. Do not replace this file with `.env.example` on this machine.

- `DATABASE_URL`: server-only `salon_backend` Postgres credential, using the session pooler on port 5432.
- `SUPABASE_PROJECT_REF`: identifies the selected project; a missing connection URL fails rather than silently switching to SQLite.
- `DATABASE_CA_PATH=server/certs/supabase-ca.crt`: Supabase CA certificate. TLS verifies the certificate and hostname; verification is never disabled. This public certificate comes from the [Supabase CA download](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt); see [Supabase SSL guidance](https://supabase.com/docs/guides/platform/ssl-enforcement).

Authentication remains the application's scrypt-password and private-cookie system, backed by Supabase Postgres. This is **not Supabase Auth**: existing passwords remain valid, and users live in private `salon.users`, not the Supabase Auth users screen. All nine application tables have forced RLS with policies only for the dedicated backend role. Browser roles `anon` and `authenticated` have no access to schema `salon`. The backend role cannot create roles/schemas or bypass RLS. Guest ownership and admin permissions are enforced by the Node API. Never use database credentials in `VITE_*` variables.

Versioned SQL is in `supabase/migrations/`. For a **new project**, apply those migrations with the Supabase CLI or trusted SQL editor, privately set a strong password on `salon_backend`, and configure its encoded connection string in the server environment. Do not replay the initial migration on the current initialized project or put passwords in migration files.

Existing SQLite data has already been imported. The original `data/salon.sqlite` is retained but is no longer the active database. For another migration, point `DATABASE_URL` at an **empty migrated target** and `DATABASE_PATH` at the source, then run:

```sh
npm run db:migrate
```

The importer uses a consistent read-only source snapshot, preserves password hashes, settings, sessions, appointments and chat, checks counts and advances message IDs. Any nonempty target table cancels the import; failures roll back. It cannot overwrite live cloud data. Promote the owner privately after importing, if needed. Maintain private backups and test restoring them before launch.

## Shared website data

The first database initialization seeds fictional demo settings from `src/salon.config.js`. Thereafter, **saved database settings are the source of truth**. Changing the seed file does not silently overwrite existing business data.

Use the admin editors to change salon identity, text, services, prices, photos, phone/email/social links, WhatsApp number, timezone/currency and branch information. Saved changes are read by the public website on its next load. Existing public tabs check for changes on focus and every minute and offer a refresh without wiping a visitor’s form. Public page title, description and sharing metadata are generated from the saved settings by the server.

Loading failures show a retry state. Saving failures keep the draft and show an error. Revision checks reject conflicting edits rather than overwriting another admin’s settings or newly received requests; reload before retrying a conflicting edit.

Gallery images can use `/images/filename.jpg`, an HTTP(S) image URL, or a JPG/PNG/WebP uploaded through the editor (up to 500 KB each). Uploaded images are embedded in the persisted settings, not browser storage. Whole settings requests are limited to 6 MB. For larger portfolios, use hosted image URLs or add files to `public/images/`. Update alt text and use photos you have permission to publish. Demo image sources are in `IMAGE_CREDITS.md`; local font licensing is in `public/fonts/OFL.txt`.

Website settings → Data & setup retains validated configuration/appointment JSON import/export and explicit default-restoration tools. Existing JSON backups from the browser-local version can be imported after login. Old localStorage records are not silently uploaded or used as live website data. The only remaining localStorage value is the optional admin light/dark preference.

Demo reviews remain explicitly labeled. Replace fictional content, prices, contact details and photographs before launch. The first-run WhatsApp number is a reserved fictional number and must be replaced under **Website settings → Salon & contact**. Set the real business website, and use a configuration import with `demoMode: false` when the fictional content has been replaced. Demo mode keeps public search indexing disabled; admin and login pages are always excluded from indexing.

## Branch addresses and Google Maps

Open **Locations → Edit location** and enter the **Full branch address**. The saved address appears on the public branch card. Its **Open in Google Maps** link is generated from:

```text
https://www.google.com/maps/search/?api=1&query=<encoded saved address>
```

No Maps API key or separate map URL is required. Blank addresses hide the map link. Multiple branches remain supported, with their own phone numbers and opening hours. Keep at least one branch and one service per category.

## Appointments

Visitors choose a service, branch and preferred future date/time, preview their details, then explicitly **Send appointment request**. Requests are saved in the configured database and appear in the authorized admin inbox on any device. Sending a request does not guarantee availability or create an automatically confirmed appointment. Admins can add requests, search/filter, edit preferred time, record internal notes and change status. These status changes do not send notifications.

Hours are display information; staff capacity, holidays, calendar integrations, automatic reminders and payment processing are not implemented. The inbox accepts up to 2,000 records; archive/export and remove old records as appropriate.

## Payment records

Open **Appointments**, select a guest and use **Payment record**. Admins and superadmins can record **Cash**, **Card/POS (in salon)** or **Online transfer**, with **Pending**, **Partial** or **Paid** status, amount received, reference and notes. Pending means zero received; Partial/Paid normally requires a positive received amount and a known method (a fully discounted bill may be Paid at zero). Received online payments require a transaction/receipt reference. Amounts support up to two decimal places. Verify receipt with the actual cash/bank/provider record before recording money received.

The appointment list shows payment status/method/amount/reference, can filter by payment status, and searches transaction references. The existing **Export requests** JSON includes payment records. Saves use the same Supabase database and revision checks as appointments. The server assigns the last editor and timestamp; clients cannot forge those fields. Old appointments/backups without payment fields remain valid, and older-client saves preserve existing payment data. Each record retains its currency even if salon currency changes later.

Payment tracking now includes dated receipt/adjustment history. Enter the actual **Payment received / adjustment date**: increases to the received amount append a receipt, decreases append a negative correction, and note-only changes do not move old receipts into another month. History and editor metadata are maintained by the server. This is manual tracking, not a payment gateway or immutable accounting system. Corrections do not issue refunds. Appointments with received money or payment history cannot be deleted through the application; mark them Cancelled to retain their records.

## Monthly clients and earnings

Open **Clients & earnings** (`/admin/#reports`), select a month and optionally a location. **Unique clients served** means distinct normalized phone numbers on Completed appointments in that appointment month; repeat visits count separately under **Completed visits**. Pending/cancelled appointments are not visits. Sample appointments are excluded.

Monthly collections use **receipt dates**, so a deposit in January and balance received in February go into their respective months. Cash, Card/POS and Online are shown separately, with negative corrections included in net received. Different currencies are never added together. Discounts and outstanding amounts use the selected month's non-cancelled appointment bills, rather than receipt dates. Recorded collections are not profit; expenses and automatic bank reconciliation are not included.

Legacy amounts with no known received date are shown as **undated** and excluded from monthly earnings until an admin supplies the date. Older bookings with no currency snapshot are excluded from financial totals until reviewed. Do not guess historic payment dates. Reports read the same saved database records and include refresh, retry and CSV export. Appointment JSON backups retain receipt dates; restored new records are marked as imported and audited to the restoring admin. Existing records' history cannot be overwritten by supplying a different history array.

## Discounts, deals and offers

For one customer, open **Appointments → appointment → Bill & discount**. Set the bill subtotal and a **Percent** or **Fixed** discount plus a reason; the form previews discount, final bill and remaining amount. Use **None / 0** for no discount. A fixed discount cannot exceed the subtotal; percentages are capped at 100%. A fully discounted zero-value bill can be marked Paid with zero received, but creates no cash receipt. Paid must match the final bill; Partial must be positive and less than it.

For a promotion, open **Deals & offers** (`/admin/#offers`) and select **Add offer**. Set title/description, discount type/value, optional start/end dates and eligible services/locations. Leave scope checkboxes empty for all. Save as **Paused** while preparing it, or **Active** to publish during its date window. Both normal admins and superadmins can manage operational offers. Fixed discounts use their saved currency; change/review them if the salon currency changes.

Active offers appear on the public website with terms and a **Choose this offer** action. Customers select one offer in their appointment form; service, location and appointment date must qualify. The server recomputes the bill from saved prices and offer rules, ignoring customer-supplied prices/discount totals. One offer replaces any manual discount; discounts do not stack. Paused/expired offers cannot be used for new requests. Existing appointments retain their saved bill/offer snapshot after an offer changes or is removed. Service prices are starting-price estimates; admins can confirm the final bill. No campaign has been published automatically.

Online payments still require a separate official payment-provider integration for checkout, credentials and verified webhooks. Public customers cannot mark themselves paid. Neither cancellation nor payment corrections automatically refund money.

## Website chat and WhatsApp

Visitors start a chat with their name, optional phone and message. Messages and conversations are stored in the configured database. A random, HttpOnly, SameSite cookie authorizes access to that visitor’s conversation for up to 30 days. The token is stored hashed in the database. Other visitors cannot read or reply to it, even if they know a conversation ID. Clearing cookies loses browser access to the conversation, but does not erase the salon’s record. Admins see conversations only after authorized login.

Admins read and reply under **Customer conversations**. Portal replies appear back in the website widget. Both views poll while open every six seconds; they are website messages, not WhatsApp messages. Sending and loading have visible feedback, retry states and preserved drafts. A phone number alone does not give a visitor access to an existing conversation.

**Continue on WhatsApp** opens `wa.me` using the salon’s saved WhatsApp number and a prefilled message containing the customer’s name, conversation ID and recent context. The visitor still sends it in WhatsApp. The UI explicitly states that WhatsApp is separate and its replies do not appear in portal chat.

There is **no configured WhatsApp Business API account, access token, phone-number ID or webhook integration** in this project. Full syncing would need an official Meta Business/WhatsApp Business setup, registered phone-number ID, appropriate access token, webhook verification secret, app signing secret and public HTTPS webhook subscription, followed by a verified message-delivery integration. Adding credentials alone will not enable syncing; the current application intentionally supports only the handoff. Consult [Meta’s official Cloud API setup](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started).

## Deploy on Vercel

The repository includes `vercel.json` and an `api/index.js` function. Vite builds the frontend into `dist/`; Vercel serves images, fonts and JavaScript as static assets, and routes `/`, `/api/*` and `/admin/*` through the existing Express backend. The function includes the built HTML and database CA certificate. Admin page authorization and saved-settings metadata still run on the server.

In the Vercel project, use the repository root, the **Vite** framework preset, **Node.js 24.x**, build command **`npm run build`**, and output directory **`dist`**. The build command, output directory and framework preset are also recorded in `vercel.json`. Add these values under **Settings → Environment Variables** for **Production** before redeploying:

| Variable               | Value                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`           | `https://salon-website-five-iota.vercel.app` for the current production domain, without a trailing slash; update this when changing the production domain. |
| `DATABASE_URL`         | The private salon backend Postgres connection string from your local `.env`.                                                                               |
| `DATABASE_CA_PATH`     | `server/certs/supabase-ca.crt`                                                                                                                             |
| `SUPABASE_PROJECT_REF` | The project reference from your local `.env` (optional when `DATABASE_URL` is set).                                                                        |

Vercel does not receive your ignored local `.env`. Copy its private database values into the hosting environment, never into a `VITE_*` variable or Git. Do not add `DATABASE_PATH`: the function requires Postgres and will not create an ephemeral SQLite database. The Vercel entry point configures its trusted proxy automatically; local `HOST`, `PORT` and `TRUST_PROXY` settings are unnecessary there.

Push the code and redeploy after setting the variables. Check **`/api/health`**, which should return **`{"ok":true}`**, then the homepage and `/admin/login`. If an API returns 503, inspect the function's runtime logs for a missing environment variable or database connection error. If `/api/salon` returns Vercel's 404 instead, the backend function/routing configuration has not been included in that deployment. An older frontend-only deployment produces the “We couldn’t load this page” screen because it cannot fetch salon settings.

For preview deployments, use a separate environment/database and set `APP_ORIGIN` to the exact preview origin you intend to use. Requests that modify data must match this origin. In-memory rate limits apply per function instance, rather than globally across all instances. Request bodies are also subject to Vercel's function payload limit; keep large gallery images on hosted URLs.

## Deploy as a persistent Node service

```sh
npm ci
npm run build
# Existing account and cloud data are already configured.
npm start
```

Configure **`APP_ORIGIN=https://your-real-domain.example`**, without a trailing slash, before `npm start`. Production requires HTTPS at the public ingress, uses Secure cookies, and serves the built website, login, dashboard and all APIs from the same Node process. Set `HOST=0.0.0.0` when the host requires it, and set `PORT` to the host’s assigned port. `TRUST_PROXY=1` is available only for a topology with exactly one trusted reverse proxy; leave it unset otherwise.

For Supabase, configure the hosting service with the same private `DATABASE_URL`, `SUPABASE_PROJECT_REF` and `DATABASE_CA_PATH`. The CA is included in the server build. The Node service must be able to reach the session pooler. Do not upload just `dist/` to a static host; the API, authentication and chat require the backend. For Vercel, use the function setup above. In-memory request limiting is per process.

For SQLite-only local deployments, keep `DATABASE_PATH` on a private persistent volume and use SQLite-consistent backups. Never split production instances across separate local databases.

The included `Dockerfile` builds that single service:

```sh
docker build -t salon-website .
docker run -d --name salon -p 3000:3000 --env-file .env -e HOST=0.0.0.0 -e PORT=3000 -e APP_ORIGIN=https://your-domain.example salon-website
```

Place it behind your host’s HTTPS ingress. Docker uses an unprivileged application user. Application and private provisioning commands must use the same cloud environment. The local `.env` is excluded from the Docker image and Git; supply it securely at runtime. Deploying the code does not itself create an administrator or configure a domain. No live production hosting target was configured in the repository, so remote publication is not performed automatically.

For a local built-app check without HTTPS, run `npm run build` followed by `npm run preview`; this uses the same backend and database with local development cookies. Use `npm start` for production.

## Security and verification

Admin sessions use random tokens stored hashed in the configured database, HttpOnly/SameSite cookies, eight-hour expiry, session rotation on login and role checks on every admin API request. Mutations validate the request origin; admin mutations additionally require the session’s CSRF token. Login and public message/request submissions are rate-limited. Inputs are validated, SQL uses bound parameters, and chat content is rendered as text. Password changes revoke sessions. Credentials and database files are ignored by Git; the Vite development server denies backend source, database files and environment files.

```sh
npm run lint
npm test
npm run build
```

Tests cover real HTTP authorization, superadmin permissions, private promotion and password preservation, ordinary-account denial, session expiry, CSRF/origin checks, persistent database writes, public/admin data sharing, concurrent-edit rejection, appointments, private portal chat and replies, rendered DOM interactions, WhatsApp context and address-derived map links. Browser visual checks still require a real browser; DOM tests do not verify visual layout. Privacy text describes actual storage and channels; replace it with the salon’s final privacy policy and retention process before handling real customer data.

For an explicit live Supabase HTTP check:

```sh
npm run check:cloud
```

This creates a temporary account, guest conversation and appointment, exercises login, role restrictions, cloud settings persistence, public sharing and two-way portal chat, then removes its own records. It saves the current website configuration without changing its content (the revision advances). Use it when nobody is editing settings. It does not change or print the owner password. Normal `npm test` uses isolated temporary SQLite databases and never requires cloud secrets.

Still required for a real launch: one Node hosting service with HTTPS and private environment variables, final salon details/images/prices/WhatsApp number, accurate privacy and retention policies, database backups/restore checks, and later domain/DNS plus the matching `APP_ORIGIN` and website URL. A domain purchase alone does not deploy the application. WhatsApp remains a separate handoff until an official API/webhook integration is built. Payments, capacity scheduling and automated customer notifications remain outside the current implementation.
