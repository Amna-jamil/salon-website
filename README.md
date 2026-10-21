# Luma salon application

One repository, one Node application, one origin and one deployment. The existing public website and admin design are retained. Vite builds the shared frontend; Express serves it alongside authenticated APIs. SQLite stores salon settings, appointments, admin accounts, sessions and website conversations on persistent disk.

The old version had no backend, admin account or database. Its browser-local storage has been replaced with server-backed persistence. No public admin sign-up or default password has been added.

## Run locally

Requires **Node.js 24 or newer**.

```sh
npm install
npm run admin:create -- owner@example.com
npm run dev
```

Choose your own email in the provisioning command. It prompts for a password of 12–256 characters, hides typed characters, and stores only a salted scrypt hash. Do not enter a password in command-line arguments or commit it. No real admin account is created automatically. Run provisioning against the same `DATABASE_PATH` used by the application.

Default URL: `http://127.0.0.1:5173`. Copy `.env.example` to `.env` if you need different server settings. Both the server and private admin commands load `.env`; it is ignored by Git.

| Route                   | Purpose                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| `/`                     | Public salon website and customer chat                                           |
| `/admin/login`          | Admin login, with a link back to the salon                                       |
| `/admin/`               | Protected dashboard                                                              |
| `/admin/#appointments`  | Appointment inbox                                                                |
| `/admin/#conversations` | Website conversations and replies                                                |
| `/admin/#services`      | Services, categories and prices                                                  |
| `/admin/#gallery`       | Photos, captions and accessible descriptions                                     |
| `/admin/#locations`     | Branch names, full addresses, phones and hours                                   |
| `/admin/#settings`      | Shared identity, contact details, WhatsApp, homepage, colors, SEO and data tools |

A discreet **Admin Login** link is always present in the public footer. Unauthenticated admin-page requests redirect to login. Admin APIs also verify the current account’s admin role; typing a URL or changing frontend state does not bypass access checks. Ordinary customer accounts cannot use admin pages or APIs. The dashboard includes **Sign out** and **View customer website**.

Reset an existing administrator’s password privately:

```sh
npm run admin:password -- owner@example.com
```

Resetting the password revokes that account’s existing sessions. There are no public registration, role-change or password-reset endpoints.

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

Visitors choose a service, branch and preferred future date/time, preview their details, then explicitly **Send appointment request**. Requests are saved in SQLite and appear in the authorized admin inbox on any device. Sending a request does not guarantee availability or create an automatically confirmed appointment. Admins can add requests, search/filter, edit preferred time, record internal notes and change status. These status changes do not send notifications.

Hours are display information; staff capacity, holidays, calendar integrations, automatic reminders and payment processing are not implemented. The inbox accepts up to 2,000 records; archive/export and remove old records as appropriate.

## Website chat and WhatsApp

Visitors start a chat with their name, optional phone and message. Messages and conversations are stored in SQLite. A random, HttpOnly, SameSite cookie authorizes access to that visitor’s conversation for up to 30 days. The token is stored hashed in the database. Other visitors cannot read or reply to it, even if they know a conversation ID. Clearing cookies loses browser access to the conversation, but does not erase the salon’s record. Admins see conversations only after authorized login.

Admins read and reply under **Customer conversations**. Portal replies appear back in the website widget. Both views poll while open every six seconds; they are website messages, not WhatsApp messages. Sending and loading have visible feedback, retry states and preserved drafts. A phone number alone does not give a visitor access to an existing conversation.

**Continue on WhatsApp** opens `wa.me` using the salon’s saved WhatsApp number and a prefilled message containing the customer’s name, conversation ID and recent context. The visitor still sends it in WhatsApp. The UI explicitly states that WhatsApp is separate and its replies do not appear in portal chat.

There is **no configured WhatsApp Business API account, access token, phone-number ID or webhook integration** in this project. Full syncing would need an official Meta Business/WhatsApp Business setup, registered phone-number ID, appropriate access token, webhook verification secret, app signing secret and public HTTPS webhook subscription, followed by a verified message-delivery integration. Adding credentials alone will not enable syncing; the current application intentionally supports only the handoff. Consult [Meta’s official Cloud API setup](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started).

## One production deployment

```sh
npm ci
npm run build
npm run admin:create -- owner@example.com
npm start
```

Configure **`APP_ORIGIN=https://your-real-domain.example`**, without a trailing slash, before `npm start`. Production requires HTTPS at the public ingress, uses Secure cookies, and serves the built website, login, dashboard and all APIs from the same Node process. Set `HOST=0.0.0.0` when the host requires it, and set `PORT` to the host’s assigned port. `TRUST_PROXY=1` is available only for a topology with exactly one trusted reverse proxy; leave it unset otherwise.

**Keep `DATABASE_PATH` on persistent, private storage**, for example `/app/data/salon.sqlite`. Do not deploy this as a static-only `dist/` upload, an ephemeral serverless filesystem or multiple instances with separate local disks. Database files must not be served as web assets. Back up the database using a SQLite-consistent snapshot; do not copy only the `.sqlite` file while ignoring active WAL contents. The supported deployment is one Node service with one mounted database volume. No external database, second app, repository or separate frontend deployment is required.

The included `Dockerfile` builds that single service:

```sh
docker build -t salon-website .
docker run -d --name salon -p 3000:3000 -e APP_ORIGIN=https://your-domain.example -v salon-data:/app/data salon-website
docker exec -it salon npm run admin:create -- owner@example.com
```

Place it behind your host’s HTTPS ingress. Docker uses an unprivileged application user. Application and private provisioning commands must point at the same mounted volume. Deploying the code does not itself create an administrator or configure a domain. No live production hosting target was configured in the repository, so remote publication is not performed automatically.

For a local built-app check without HTTPS, run `npm run build` followed by `npm run preview`; this uses the same backend and database with local development cookies. Use `npm start` for production.

## Security and verification

Admin sessions use random tokens stored hashed in SQLite, HttpOnly/SameSite cookies, eight-hour expiry, session rotation on login and role checks on every admin API request. Mutations validate the request origin; admin mutations additionally require the session’s CSRF token. Login and public message/request submissions are rate-limited. Inputs are validated, SQL uses bound parameters, and chat content is rendered as text. Password changes revoke sessions. Credentials and database files are ignored by Git; the Vite development server denies backend source, database files and environment files.

```sh
npm run lint
npm test
npm run build
```

Tests cover real HTTP authorization, ordinary-account denial, session expiry, CSRF/origin checks, persistent database writes, public/admin data sharing, concurrent-edit rejection, appointments, private portal chat and replies, rendered DOM interactions, WhatsApp context and address-derived map links. Browser visual checks still require a real browser; DOM tests do not verify visual layout. Privacy text describes actual storage and channels; replace it with the salon’s final privacy policy and retention process before handling real customer data.
