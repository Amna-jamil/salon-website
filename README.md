# Luma salon website

An original, responsive fictional salon template. Vite + vanilla JavaScript + CSS; no runtime framework, database, accounts, or backend. Designed for easy adaptation to a real salon.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173`.

```sh
npm run lint
npm test
npm run build
npm run preview
```

`npm run build` generates the production website in `dist/`. Deploy that directory to a static web host. There are no API keys or environment variables to configure.

## Customize one file

**Edit `src/salon.config.js` for all business information, or use the new browser-local admin at `/admin/` to edit and export it.** Browser-saved overrides take precedence over the source file until you restore defaults in the admin.

| What to change                                           | Configuration field                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Salon name and wordmark                                  | `name`, `tagline`                                                                                                        |
| Logo and favicon                                         | `logo`, `favicon` (public asset paths)                                                                                   |
| Brand colors                                             | `theme`                                                                                                                  |
| Hero copy and photos                                     | `hero`                                                                                                                   |
| About text, values and photo                             | `about`                                                                                                                  |
| Service categories, names, starting prices and durations | `services[].items[]`                                                                                                     |
| Currency and formatting                                  | `currency`, `currencyLabel`, `locale`                                                                                    |
| Gallery photos, labels and accessible descriptions       | `gallery[]`                                                                                                              |
| Clearly marked demo testimonial text                     | `reviews[]`                                                                                                              |
| Add/remove locations                                     | `branches[]` (each needs a unique `id`)                                                                                  |
| Branch address, map URL and phone                        | `branches[].address`, `.mapUrl`, `.phone`                                                                                |
| Branch opening hours                                     | `branches[].hours`                                                                                                       |
| Main phone and email                                     | `contact.phone`, `contact.email`                                                                                         |
| **WhatsApp number**                                      | **`contact.whatsappNumber` — international digits only, e.g. country code + number, without `+`, spaces or punctuation** |
| Instagram / Facebook / other profiles                    | `contact.socials[]` with `label` and a complete `url`                                                                    |
| Main opening hours                                       | `contact.hours`                                                                                                          |
| Salon timezone                                           | `timeZone` (IANA name such as `Asia/Karachi`)                                                                            |
| Booking introduction and WhatsApp greeting               | `booking`                                                                                                                |
| Page title and description                               | `seo`                                                                                                                    |
| Production website address                               | `website`                                                                                                                |
| Demo notices and search indexing                         | `demoMode`                                                                                                               |

### Photos

Photos are bundled locally in `public/images/`. Add your own files there and update the paths in the configuration (e.g. `/images/my-salon.jpg`). Update the accompanying alt text as well. There is a graceful visual fallback for missing images. Use images you have permission to publish, especially real portfolio and customer photos. See `IMAGE_CREDITS.md` for the demo stock sources. Fonts are self-hosted in `public/fonts/`; the included DM Sans license is in that folder.

### Branches, maps and hours

The default studios are fictional concepts with no street addresses. Map links appear only when `mapUrl` is provided; branch call links appear only with a branch `phone`. Unconfigured social profiles and email links are omitted. One or more locations are supported by editing the array. Service IDs, service-item IDs, and branch IDs must remain unique.

Opening hours are editable display text. The appointment form accepts a preferred time, including times outside opening hours; it **does not check live availability, holidays, capacity, or staff schedules**. A real salon confirms the requested time separately.

## Booking behavior

- Required name, phone, service, branch and future date/time are validated.
- Preferred times are interpreted in the configured salon timezone, shown beside the field and in the summary.
- Form submission displays a clear request preview. **Nothing is sent or booked.** Storage is optional and explicit.
- The optional WhatsApp button opens a correctly encoded message containing the entered details and configured number. The visitor still has to send it in WhatsApp.
- The default phone/WhatsApp number is a reserved fictional demo number. Replace it before use.
- Form entries stay in page memory unless the visitor explicitly chooses **Save to this browser’s demo inbox** after the preview. This optional action saves the request in local storage, visible at `/admin/` in the same browser and origin. No data is transmitted to a salon or another device. There is no analytics, tracking, or appointment endpoint.

## Admin workspace

Run `npm run dev`, then open **`http://127.0.0.1:5173/admin/`** (use Vite’s actual port if different). The customer website remains at `/`. A "Studio admin" link also appears in the demo website footer.

The admin includes:

- **Overview:** request counts, selectable monthly diary, launch checklist and shortcuts. The inbox starts empty; **Load sample requests** adds five clearly labeled fictional records.
- **Appointments:** create manual demo requests; search by guest, phone, service or studio; filter status/location; view details; change preferred time, status and internal notes; remove requests; export/restore JSON backups. Local status changes never notify guests.
- **Services & pricing:** add/edit categories and services, change starting prices and durations, move services between categories, and remove items. At least one category, one service per category and one location must remain.
- **Gallery:** add/edit/remove images and accessible captions. Use local asset paths or HTTP(S) URLs, or choose a JPG/PNG/WebP under 500 KB. Selected files are stored as local image data, not uploaded to a server.
- **Locations:** add/edit/remove studios, contact/map links and per-location opening hours.
- **Demo reviews:** manage illustrative testimonial copy; demo labels remain on the customer website.
- **Website settings:** salon identity, contact/WhatsApp, social links, timezone/currency, homepage text/photos, palette, SEO; configuration import/export; sample cleanup and default-settings restoration.
- **Light/dark mode** and responsive sidebar navigation.

Changes persist in this browser’s local storage. Refresh the customer website to preview saved edits. Open customer tabs show a refresh notice when another tab changes configuration. The admin blocks stale saves after another tab changes data; reload before editing further. Clearing browser data, using a different browser/device, changing port/hostname, or private browsing creates a different or empty workspace.

To make edits permanent in the codebase: open **Website settings > Data & setup > Export configuration .js**, replace `src/salon.config.js` with the downloaded file, and run `npm run build`. JSON export/import is also available for local settings backups. Browser-only changes do not update the source file, deployed files, or build-time SEO metadata. Uploaded gallery photos are included in exported configuration as embedded image data; for a real deployment, moving photos to hosted storage or `public/images/` is preferable.

**This admin has no secure login or authorization.** It is a functional local prototype, not a production management system. Anyone with access to this browser can open it and view saved requests. Use fictional guest data. There is no server, cross-device inbox, delivery of messages, calendar availability checking or authentication. A backend with authenticated admin access and authorization is needed before a real business uses customer information.

Local storage keys: `luma.salon.config.v1`, `luma.salon.requests.v1`, `luma.admin.theme`. Requests are limited to 2,000 per local inbox; export backups regularly. Website imports are validated before replacement; save failures leave previous stored data intact. Damaged inbox data is not overwritten by normal edits; restore a valid request backup under Data & setup to recover.

## Before using for a real salon

Replace fictional details, stock portfolio images, prices, phone/WhatsApp number, timezone, addresses, hours and social URLs. Add a real privacy policy appropriate to the final service. Reviews remain explicitly labeled demo content; replace the section with verified customer testimonials and update its demo labels only when you have real permissioned reviews.

Set `website` and `seo`, then set `demoMode: false` once the business details are real. The demo is intentionally `noindex`; production mode removes that directive at build time and enables `BeautySalon` JSON-LD. Supply each real location’s `seoAddress`, e.g.:

```js
seoAddress: {
  streetAddress: 'Your verified street address',
  addressLocality: 'Your city',
  addressRegion: 'Your region',
  postalCode: 'Your postal code',
  addressCountry: 'Your two-letter country code',
}
```

There are no fabricated ratings, awards or business performance claims. A booking backend, email delivery, payment processing, staff calendars and availability checking would be separate integrations. Without a backend, the website remains an honest enquiry preview with a manual WhatsApp handoff.

## Project structure

```text
admin/index.html     Separate admin entry point (/admin/)
src/admin/admin.js   Admin screens, editors and interactions
src/admin/admin.css  Admin design tokens and responsive styling
src/admin/store.js   Validated local settings and request persistence
src/admin/*.test.js  Admin interaction and persistence checks
src/salon.config.js   Default salon configuration and export target
src/main.js           Page sections and interactions
src/style.css         Responsive design, layout and focus states
src/fonts.css         Local font definitions
src/booking.js        Booking validation, timezone and WhatsApp helpers
src/*.test.js         Validation and DOM interaction tests
public/images/        Local demo photography
public/fonts/         Local fonts and license
public/favicon.svg    Default demo favicon
vite.config.js        Build-time metadata from salon configuration
```

Keyboard navigation, visible focus states, form labels and error descriptions, native dialog focus handling, reduced-motion support and responsive layouts are included. DOM tests do not replace a visual check in a real browser; inspect desktop and mobile widths before client handoff.
