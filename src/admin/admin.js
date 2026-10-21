import "../fonts.css";
import "./admin.css";
import { salon as defaults } from "../salon.config.js";
import { localDateTime, validateBooking } from "../booking.js";
import {
  STATUSES,
  validateConfig,
  validateRequests,
  makeRequest,
  sampleRequests,
} from "./store.js";
import { api, setCsrf } from "../api.js";
import { mountAdminChat } from "./chat.js";

const esc = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-12 5h1m4 0h1"/>',
  scissors:
    '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m9 8 12 13M9 16 21 3"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  settings:
    '<path d="m10 3-1 3-3 1-3-1-1 4 2 2-1 3 2 3 3-1 3 1 1 3h4l1-3 3-1 1-4-2-2 1-3-3-2-3 1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  external:
    '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  edit: '<path d="m15 4 5 5M4 15 16 3a2 2 0 0 1 5 5L9 20l-6 1Z"/>',
  quote: '<path d="M4 11h6v8H3v-8c0-4 2-6 6-6m6 6h6v8h-7v-8c0-4 2-6 6-6"/>',
};
const icon = (name) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
const session = await api("/api/auth/session");
setCsrf(session.csrf);
const [configResult, requestsResult] = await Promise.all([
  api("/api/admin/settings"),
  api("/api/admin/appointments"),
]);
configResult.error = "";
requestsResult.error = "";
let config = configResult.config;
let requests = requestsResult.requests;
let storageError = configResult.error || requestsResult.error;
let route = location.hash.slice(1).split("?")[0] || "overview";
let search = "";
let statusFilter = "all";
let branchFilter = "all";
let selectedDay = localDateTime(config.timeZone).slice(0, 10);
let month = new Date(`${selectedDay.slice(0, 7)}-01T12:00:00Z`);
let viewTab = "identity";
let toastTimer;
const app = document.querySelector("#admin-app");
const dialog = document.querySelector("#editor");
const nav = [
  ["overview", "grid", "Overview"],
  ["appointments", "calendar", "Appointments"],
  ["conversations", "quote", "Customer conversations"],
  ["services", "scissors", "Services & pricing"],
  ["gallery", "image", "Gallery"],
  ["locations", "pin", "Locations"],
  ["reviews", "quote", "Demo reviews"],
  ["settings", "settings", "Website settings"],
];
const today = () => localDateTime(config.timeZone).slice(0, 10);
const money = (value) =>
  new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
const dateLabel = (value, options = { month: "short", day: "numeric" }) =>
  new Intl.DateTimeFormat(config.locale, {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${value.length === 10 ? value + "T12:00" : value}:00Z`));
const timeLabel = (value) =>
  dateLabel(value, { hour: "numeric", minute: "2-digit" });
const badge = (status) =>
  `<span class="status status-${status.toLowerCase()}"><span></span>${esc(status)}</span>`;
const empty = (title, detail, button = "") =>
  `<div class="empty-state">${icon("calendar")}<h3>${title}</h3><p>${detail}</p>${button}</div>`;
const action = (name, label, symbol = "plus", extra = "") =>
  `<button class="btn" data-action="${name}" ${extra}>${icon(symbol)}${label}</button>`;
const initials = (name) =>
  esc(
    name
      .replace(/^Demo guest /, "")
      .split(" ")
      .filter(Boolean)
      .map((word) => word[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
  );

function notify(message, error = false) {
  const toast = document.querySelector("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = error ? "toast-error" : "";
  toast.hidden = false;
  toastTimer = setTimeout(
    () => {
      toast.hidden = true;
    },
    error ? 9000 : 4500,
  );
}
async function persistConfig(next) {
  validateConfig(next);
  const saved = await api("/api/admin/settings", {
    method: "PUT",
    body: { config: next, revision: configResult.revision },
  });
  configResult.revision = saved.revision;
  config = saved.config;
  render();
}
async function persistRequests(next) {
  validateRequests(next);
  const saved = await api("/api/admin/appointments", {
    method: "PUT",
    body: { requests: next, revision: requestsResult.revision },
  });
  requestsResult.revision = saved.revision;
  requests = saved.requests;
  render();
}

function render() {
  if (!nav.some(([id]) => id === route)) route = "overview";
  document.title = `${config.name} · Salon admin`;
  const pending = requests.filter((item) => item.status === "Pending").length;
  const title = nav.find(([id]) => id === route)[2];
  app.innerHTML = `
    <aside class="sidebar" id="sidebar"><a class="admin-brand" href="#overview"><span>${esc(config.name.toLowerCase())}<i>✧</i></span><small>THE STUDIO MANAGER</small></a><div class="workspace"><span class="workspace-icon">${icon("scissors")}</span><span>${esc(config.name)} beauty studio<small>Connected salon workspace</small></span><span class="workspace-dot"></span></div><p class="nav-label">WORKSPACE</p><nav aria-label="Admin navigation">${nav.map(([id, symbol, label]) => `<a href="#${id}" class="nav-item ${id === route ? "active" : ""}" ${id === route ? 'aria-current="page"' : ""}>${icon(symbol)}<span>${label}</span>${id === "appointments" && pending ? `<span class="nav-count">${pending}</span>` : ""}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="sidebar-note">${icon("sun")}<strong>A little care, behind the scenes.</strong><p>A calm space to keep your salon beautifully organized.</p></div><a class="view-site" href="/" target="_blank" rel="noopener">${icon("external")}View customer website${icon("arrow")}</a><div class="owner"><span class="owner-avatar">${esc(config.name[0].toUpperCase())}</span><span>Studio owner<small>Authorized salon admin</small></span></div></div></aside>
    <div class="app-shell"><header class="topbar"><div class="breadcrumb"><button class="icon-btn mobile-menu" aria-label="Toggle admin navigation" aria-expanded="false" aria-controls="sidebar" data-action="menu">${icon("grid")}</button><span>Workspace</span>${icon("chevron")}<strong>${title}</strong></div><div class="topbar-actions"><button class="btn btn-secondary" data-action="logout">Sign out</button><button class="icon-btn" data-action="theme" aria-label="Switch light or dark theme">${icon("sun")}</button><span class="topbar-avatar">${esc(config.name[0].toUpperCase())}</span></div></header>
    <main id="admin-main" tabindex="-1"><div class="demo-notice">${icon("sun")}<span><strong>Your salon, connected.</strong> Website settings, appointments and portal conversations are saved to your salon database.</span><a href="#settings" data-settings-tab="data">Data & setup ${icon("arrow")}</a></div>${storageError ? `<div class="error-banner" role="alert">${esc(storageError)}</div>` : ""}${route === "overview" ? overview() : route === "appointments" ? appointments() : route === "conversations" ? '<section id="admin-conversations" aria-label="Website conversations"></section>' : route === "services" ? services() : route === "gallery" ? gallery() : route === "locations" ? locations() : route === "reviews" ? reviews() : settings()}</main>
    <footer class="admin-footer"><span>${esc(config.name)} studio manager</span><span>Shared salon workspace <i>✧</i> Thoughtfully organized</span></footer></div>`;
  bindPage();
  if (route === "conversations")
    mountAdminChat(document.querySelector("#admin-conversations"), config);
}

function pageHeading(kicker, title, description, controls = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${controls}</div></div>`;
}

function overview() {
  const day = today();
  const dayRequests = requests.filter(
    (item) => item.datetime.startsWith(day) && item.status !== "Cancelled",
  );
  const pending = requests.filter((item) => item.status === "Pending");
  const confirmed = requests.filter((item) => item.status === "Confirmed");
  const count = config.services.reduce(
    (sum, category) => sum + category.items.length,
    0,
  );
  const stats = [
    [
      "Today’s appointments",
      dayRequests.length,
      "In the salon inbox",
      "calendar",
      "lavender",
    ],
    [
      "Awaiting confirmation",
      pending.length,
      "Requests to review",
      "clock",
      "peach",
    ],
    [
      "Confirmed appointments",
      confirmed.length,
      "Across all dates",
      "check",
      "sage",
    ],
    [
      "Services on your menu",
      count,
      `${config.services.length} beauty categories`,
      "scissors",
      "rose",
    ],
  ];
  const list = requests
    .filter((item) => item.datetime.startsWith(selectedDay))
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  return `${pageHeading("YOUR STUDIO AT A GLANCE", "A beautiful day starts here.", `Welcome to ${esc(config.name)}. Let’s take care of the little details.`, `<span class="today-label">${icon("calendar")}${dateLabel(day, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>${action("new-request", "New appointment")}`)}
    <div class="stats-grid">${stats.map(([label, value, detail, symbol, color]) => `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${color}">${icon(symbol)}</span></div><strong>${value.toString().padStart(2, "0")}</strong><small>${detail}</small></article>`).join("")}</div>
    <div class="overview-grid"><div class="overview-main"><section class="panel schedule-panel"><div class="panel-heading"><div><h2>Your appointment diary</h2><p>${dateLabel(selectedDay, { weekday: "long", month: "long", day: "numeric" })} <span class="count-label">${list.length} ${list.length === 1 ? "appointment" : "appointments"}</span></p></div><a class="subtle-link" href="#appointments">View all ${icon("arrow")}</a></div>${list.length ? `<div class="diary-list">${list.map((item) => `<button class="diary-row" data-request="${esc(item.id)}"><time>${timeLabel(item.datetime)}</time><span class="diary-marker ${item.status.toLowerCase()}"></span><span class="guest-avatar">${initials(item.name)}</span><span class="diary-person"><strong>${esc(item.name)}</strong><small>${esc(item.serviceName)} <span>·</span> ${esc(item.branchName)}</small></span>${badge(item.status)}${icon("chevron")}</button>`).join("")}</div>` : empty("Room for a little self-care.", "No appointments for this date. Add a request or load clearly marked samples to explore the diary.", `${action("new-request", "Add an appointment")}${!requests.length ? '<button class="btn btn-secondary" data-action="samples">Load sample requests</button>' : ""}`)}</section>
    <section class="quick-start"><div><p class="eyebrow">YOUR WEBSITE, YOUR WAY</p><h2>Keep the glow going.</h2><p>A fresh service, a beautiful new photo, a little update.<br>Your next change is just a moment away.</p><a class="subtle-link" href="/" target="_blank" rel="noopener">Preview your customer website ${icon("external")}</a></div><div class="quick-actions"><button data-action="new-service">${icon("scissors")}<span>Add a service<small>Keep your menu fresh</small></span>${icon("plus")}</button><button data-action="new-photo">${icon("image")}<span>Add a gallery photo<small>Let your work shine</small></span>${icon("plus")}</button><a href="#settings">${icon("settings")}<span>Update website details<small>Make it feel like you</small></span>${icon("arrow")}</a></div></section></div>
    <div class="overview-aside">${calendar()}<section class="panel setup-panel"><div class="panel-heading"><h2>A little launch checklist</h2><span class="setup-spark">✧</span></div>${[
      [!config.demoMode, "Replace fictional demo content"],
      [
        Boolean(config.contact.whatsappNumber) &&
          config.contact.whatsappNumber !== defaults.contact.whatsappNumber,
        "Add your WhatsApp number",
      ],
      [
        config.branches.every((branch) => branch.address),
        "Add your studio addresses",
      ],
      [Boolean(config.website), "Set your production website URL"],
    ]
      .map(
        ([done, label]) =>
          `<a href="#settings"><span class="check-circle ${done ? "done" : ""}">${done ? icon("check") : ""}</span><span>${label}</span>${icon("chevron")}</a>`,
      )
      .join(
        "",
      )}<p>Admin access is protected. Replace the fictional salon information before a real launch.</p></section></div></div>`;
}

function calendar() {
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const offset = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat(config.locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(month);
  return `<section class="panel calendar-panel" aria-label="Appointment calendar"><div class="calendar-heading"><h2>${label}</h2><div><button class="icon-btn previous-month" aria-label="Previous month" data-month="-1">${icon("chevron")}</button><button class="icon-btn" aria-label="Next month" data-month="1">${icon("chevron")}</button></div></div><div class="calendar-grid"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>${"<span></span>".repeat(offset)}${Array.from(
    { length: days },
    (_, i) => {
      const day = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      const hasAppointments = requests.some((item) =>
        item.datetime.startsWith(day),
      );
      return `<button class="calendar-day ${day === selectedDay ? "selected" : ""} ${day === today() ? "is-today" : ""}" data-day="${day}" aria-label="${day}${hasAppointments ? ", has appointments" : ""}" aria-pressed="${day === selectedDay}">${i + 1}${hasAppointments ? "<i></i>" : ""}</button>`;
    },
  ).join(
    "",
  )}</div><div class="calendar-foot"><span><i></i> Has appointments</span><button class="subtle-link" data-action="today">Today</button></div></section>`;
}

function filteredRequests() {
  const query = search.toLowerCase().trim();
  return requests
    .filter(
      (item) =>
        (statusFilter === "all" || item.status === statusFilter) &&
        (branchFilter === "all" || item.branchId === branchFilter) &&
        (!query ||
          [item.name, item.phone, item.serviceName, item.branchName].some(
            (text) => text.toLowerCase().includes(query),
          )),
    )
    .sort((a, b) => b.datetime.localeCompare(a.datetime));
}
function appointmentRows() {
  const list = filteredRequests();
  if (!list.length)
    return `<td colspan="6">${empty(requests.length ? "No matching appointments." : "Your inbox has room to grow.", requests.length ? "Try another search or clear the filters." : "Add a request manually or receive an enquiry from the customer website.", requests.length ? '<button class="btn btn-secondary" data-action="clear-filters">Clear filters</button>' : action("new-request", "Add an appointment"))}</td>`;
  return list
    .map(
      (item) =>
        `<tr><td><button class="guest-cell" data-request="${esc(item.id)}"><span class="guest-avatar">${initials(item.name)}</span><span><strong>${esc(item.name)}</strong><small>${esc(item.phone)}</small></span></button></td><td><strong>${esc(item.serviceName)}</strong><small>${esc(item.branchName)}</small></td><td><strong>${dateLabel(item.datetime)}</strong><small>${timeLabel(item.datetime)}</small></td><td>${badge(item.status)}</td><td><span class="source-label">${esc(item.source)}</span></td><td><button class="icon-btn" data-request="${esc(item.id)}" aria-label="Manage appointment for ${esc(item.name)}">${icon("chevron")}</button></td></tr>`,
    )
    .join("");
}
function appointments() {
  return `${pageHeading("THE APPOINTMENT BOOK", "A little time, well organized.", "Review requests and keep every appointment detail in one place.", `${action("export-requests", "Export requests", "download")}${action("new-request", "New appointment")}`)}<section class="panel"><div class="filter-bar"><label class="search-field">${icon("search")}<input id="request-search" type="search" aria-label="Search appointments" placeholder="Search names, services, phone…" value="${esc(search)}"></label><label class="filter-select"><span class="sr-only">Filter by status</span><select id="status-filter"><option value="all">All statuses</option>${STATUSES.map((status) => `<option ${status === statusFilter ? "selected" : ""}>${status}</option>`).join("")}</select></label><label class="filter-select"><span class="sr-only">Filter by location</span><select id="branch-filter"><option value="all">All locations</option>${config.branches.map((branch) => `<option value="${esc(branch.id)}" ${branch.id === branchFilter ? "selected" : ""}>${esc(branch.name)}</option>`).join("")}</select></label><span id="result-count">${filteredRequests().length} requests</span></div><div class="table-scroll"><table><thead><tr><th>Guest</th><th>Service & studio</th><th>Preferred time</th><th>Status</th><th>Source</th><th><span class="sr-only">Manage</span></th></tr></thead><tbody id="request-rows">${appointmentRows()}</tbody></table></div><div class="table-foot"><span>Times shown in ${esc(config.timeZone)}. Status changes do not automatically notify guests.</span>${action("samples", "Load sample requests", "plus")}</div></section>`;
}

function services() {
  return `${pageHeading("THE BEAUTY MENU", "Good care starts with the details.", "Manage your service names, starting prices and appointment lengths.", `${action("new-category", "New category")}${action("new-service", "New service")}`)}<div class="category-grid">${config.services.map((category, index) => `<section class="panel category-panel"><div class="category-cover"><img src="${esc(category.image)}" alt="${esc(category.alt)}"><div><span>${category.items.length} SERVICES</span><h2>${esc(category.name)}</h2></div><button class="icon-btn" data-edit-category="${index}" aria-label="Edit ${esc(category.name)} category">${icon("edit")}</button></div><p class="category-description">${esc(category.subtitle)}</p><div class="service-admin-list">${category.items.map((item, itemIndex) => `<button data-edit-service="${index}:${itemIndex}"><span><strong>${esc(item.name)}</strong><small>${esc(item.duration)}</small></span><strong>${money(item.price)}</strong>${icon("edit")}</button>`).join("")}</div><button class="category-add" data-add-service="${index}">${icon("plus")}Add a service</button></section>`).join("")}</div>`;
}
function gallery() {
  return `${pageHeading("YOUR WORK, IN FOCUS", "Let the little details shine.", "Manage the images and captions on your customer website.", action("new-photo", "Add a photo"))}<div class="info-line">${icon("image")} Demo stock photos are illustrative. Use your own permissioned work before launch.</div><div class="photo-grid">${config.gallery.map((photo, index) => `<article class="panel photo-card"><div class="photo-card-image"><img src="${esc(photo.image)}" alt="${esc(photo.alt)}" loading="lazy"><span>${esc(photo.category)}</span></div><div class="photo-card-copy"><div><h2>${esc(photo.label)}</h2><p>${esc(photo.alt)}</p></div><button class="icon-btn" data-edit-photo="${index}" aria-label="Edit ${esc(photo.label)}">${icon("edit")}</button></div></article>`).join("")}</div>${!config.gallery.length ? empty("Make room for your beautiful work.", "Add your first gallery image to show it on the customer website.", action("new-photo", "Add a photo")) : ""}`;
}
function locations() {
  return `${pageHeading("YOUR STUDIO SPACES", "A place for every little ritual.", "Keep location details, directions and opening hours up to date.", action("new-location", "Add a location"))}<div class="location-grid">${config.branches.map((branch, index) => `<article class="panel location-card"><img src="${esc(branch.image)}" alt="${esc(branch.imageAlt)}"><div><span class="eyebrow">${esc(branch.label)}</span><h2>${esc(branch.name)}</h2><p>${esc(branch.description)}</p><p class="location-address">${icon("pin")}${esc(branch.address || "No address added · Demo location")}</p><dl>${branch.hours.map((hour) => `<div><dt>${esc(hour.days)}</dt><dd>${esc(hour.time)}</dd></div>`).join("")}</dl><button class="btn btn-secondary" data-edit-location="${index}">${icon("edit")}Edit location</button></div></article>`).join("")}</div>`;
}
function reviews() {
  return `${pageHeading("WORDS AFTER THE GLOW", "Kind words, thoughtfully kept.", "These testimonials remain clearly marked as demo content on the website.", action("new-review", "Add demo review"))}<div class="review-admin-grid">${config.reviews.map((review, index) => `<article class="panel review-admin-card"><span class="review-quote">“</span><blockquote>${esc(review.quote)}</blockquote><strong>${esc(review.name)}</strong><p>${esc(review.service)} · Demo</p><button class="btn btn-secondary" data-edit-review="${index}">${icon("edit")}Edit review</button></article>`).join("")}</div>${!config.reviews.length ? empty("A space for kind words.", "Add illustrative copy here, clearly marked as demo content.", action("new-review", "Add demo review")) : ""}`;
}

function field(
  label,
  name,
  value = "",
  type = "text",
  required = false,
  help = "",
) {
  const id = `field-${name.replaceAll(".", "-")}`;
  const attrs = `id="${id}" name="${name}" ${required ? "required" : ""} ${help ? `aria-describedby="${id}-help"` : ""}`;
  return `<div class="field ${type === "textarea" ? "field-wide" : ""}"><label for="${id}">${label}${required ? " <span>*</span>" : ""}</label>${type === "textarea" ? `<textarea ${attrs} rows="3">${esc(value)}</textarea>` : `<input ${attrs} type="${type}" value="${esc(value)}" ${type === "number" ? 'min="0" step="0.01"' : ""}>`}${help ? `<small id="${id}-help">${help}</small>` : ""}</div>`;
}
const hoursText = (hours) =>
  hours.map((hour) => `${hour.days} | ${hour.time}`).join("\n");
function parseHours(value) {
  const result = value
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length !== 2 || parts.some((part) => !part))
        throw new Error("Use one opening-hours row per line: Days | Hours.");
      return { days: parts[0], time: parts[1] };
    });
  if (!result.length) throw new Error("Add at least one opening-hours row.");
  return result;
}
function settings() {
  const tabs = [
    ["identity", "Salon & contact"],
    ["homepage", "Homepage"],
    ["brand", "Brand & SEO"],
    ["data", "Data & setup"],
  ];
  let fields = "";
  if (viewTab === "identity")
    fields = `${field("Salon name", "name", config.name, "text", true)}${field("Tagline", "tagline", config.tagline)}${field("Main phone", "contact.phone", config.contact.phone)}${field("WhatsApp number", "contact.whatsappNumber", config.contact.whatsappNumber, "text", false, "International digits only; no spaces or +.")}${field("Email", "contact.email", config.contact.email, "email")}${field("Salon timezone", "timeZone", config.timeZone, "text", true, "For example, Asia/Karachi or America/New_York.")}${field("Currency code", "currency", config.currency, "text", true)}${field("Currency label", "currencyLabel", config.currencyLabel)}${field("Locale", "locale", config.locale, "text", true)}${field("Logo path or image URL", "logo", config.logo)}${field("Instagram URL", "instagram", config.contact.socials.find((social) => social.label === "Instagram")?.url || "", "url")}${field("Facebook URL", "facebook", config.contact.socials.find((social) => social.label === "Facebook")?.url || "", "url")}${field("Opening hours", "hours", hoursText(config.contact.hours), "textarea", true, "One row per line: Tuesday – Saturday | 10:00 AM – 7:00 PM")}`;
  if (viewTab === "homepage")
    fields = `${field("Hero eyebrow", "hero.eyebrow", config.hero.eyebrow)}${field("Hero heading — line 1", "hero.title.0", config.hero.title[0], "text", true)}${field("Hero heading — line 2", "hero.title.1", config.hero.title[1], "text", true)}${field("Hero heading — line 3", "hero.title.2", config.hero.title[2], "text", true)}${field("Hero description", "hero.description", config.hero.description, "textarea")}${field("Hero image", "hero.image", config.hero.image)}${field("Hero image description", "hero.imageAlt", config.hero.imageAlt)}${field("Detail image", "hero.detailImage", config.hero.detailImage)}${field("Detail image description", "hero.detailAlt", config.hero.detailAlt)}${field("About eyebrow", "about.eyebrow", config.about.eyebrow)}${field("About heading", "about.title", config.about.title, "textarea")}${field("About introduction", "about.description", config.about.description, "textarea")}${field("About detail", "about.detail", config.about.detail, "textarea")}${field("About photo", "about.image", config.about.image)}${field("About photo description", "about.imageAlt", config.about.imageAlt)}${field("Values — one per line", "values", config.about.values.join("\n"), "textarea")}${field("Booking introduction", "booking.introduction", config.booking.introduction, "textarea")}`;
  if (viewTab === "brand")
    fields = `${Object.entries(config.theme)
      .map(([key, color]) =>
        field(
          key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (char) => char.toUpperCase()),
          `theme.${key}`,
          color,
          "color",
        ),
      )
      .join(
        "",
      )}${field("Page title", "seo.title", config.seo.title, "text", true)}${field("Meta description", "seo.description", config.seo.description, "textarea", true)}${field("Production website URL", "website", config.website, "url")}${field("Favicon path", "favicon", config.favicon)}<p class="field-wide helper-box">Saved edits update the shared database immediately. The public website reads these settings when it loads. Demo content and review notices are preserved.</p>`;
  return `${pageHeading("MAKE THE STUDIO YOURS", "The details behind the glow.", "Manage the shared settings used by your public website and salon dashboard.")}<div class="settings-layout"><nav class="settings-nav" aria-label="Settings sections">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${id === viewTab ? "active" : ""}" aria-pressed="${id === viewTab}">${label}${icon("chevron")}</button>`).join("")}</nav><section class="panel settings-panel"><h2>${tabs.find(([id]) => id === viewTab)[1]}</h2>${viewTab === "data" ? `<p>Your salon settings, appointment requests and portal conversations are stored in the application database. Only signed-in authorized admins can access this workspace.</p><div class="data-callout">${icon("settings")}<div><strong>Ready for a real salon?</strong><p>Keep database backups and use HTTPS in production. Website conversations are connected. WhatsApp is a handoff only; no WhatsApp Business API credentials or webhook integration are configured.</p></div></div><div class="data-actions"><div><strong>Export website configuration</strong><p>Download the current database settings as a configuration file or importable JSON backup. No export or rebuild is needed to publish saved admin changes.</p><button class="btn" data-action="export-config">${icon("download")}Export configuration .js</button><button class="btn btn-secondary" data-action="export-json">Export JSON</button></div><div><strong>Import website configuration</strong><p>Import a previously exported JSON file. Existing settings will be replaced only after validation and your confirmation.</p><label class="btn btn-secondary file-label">Choose JSON file<input id="import-config" type="file" accept="application/json,.json"></label></div><div><strong>Appointment backup</strong><p>Download the salon inbox as JSON. Keep guest information private. This file is a backup, not a server submission.</p><button class="btn btn-secondary" data-action="export-requests">${icon("download")}Export requests</button><label class="btn btn-secondary file-label">Restore request backup<input id="import-requests" type="file" accept="application/json,.json"></label></div><div><strong>Sample data</strong><p>Load clearly labeled fictional requests to explore the dashboard. Removing samples preserves your other requests.</p><button class="btn btn-secondary" data-action="samples">Load sample requests</button><button class="btn btn-danger" data-action="remove-samples">Remove sample requests</button></div><div><strong>Restore original website settings</strong><p>Restores the original website settings in the database. Appointment requests are preserved. Export your edits first if you need them.</p><button class="btn btn-danger" data-action="reset-config">Restore default settings</button></div></div>` : `<form id="settings-form"><div class="fields-grid">${fields}</div><p class="form-error" role="alert"></p><div class="settings-save"><span>Saved changes appear on the public website on its next load.</span><button class="btn" type="submit">${icon("check")}Save website changes</button></div></form>`}</section></div>`;
}

function openEditor(
  title,
  description,
  fields,
  onSave,
  deleteAction,
  submitLabel = "Save changes",
) {
  dialog.innerHTML = `<form id="editor-form"><div class="modal-heading"><div><p class="eyebrow">STUDIO DETAILS</p><h2 id="editor-title">${title}</h2></div><button class="icon-btn" type="button" data-close aria-label="Close editor">${icon("close")}</button></div><p class="modal-description">${description}</p><div class="fields-grid">${fields}</div><p class="form-error" role="alert"></p><div class="modal-actions">${deleteAction ? '<button type="button" class="btn btn-danger" id="delete-item">Remove</button>' : ""}<button type="button" class="btn btn-secondary" data-close>Cancel</button><button class="btn" type="submit">${icon("check")}${submitLabel}</button></div></form>`;
  dialog.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => {
      if (dialog.querySelector("form")?.dataset.saving) return;
      if (
        dialog.querySelector("form")?.dataset.dirty &&
        !window.confirm("Discard the unsaved changes in this editor?")
      )
        return;
      dialog.close();
    }),
  );
  dialog.querySelector("form").addEventListener("input", (event) => {
    event.currentTarget.dataset.dirty = "true";
  });
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (event.currentTarget.dataset.saving) return;
    event.currentTarget.dataset.saving = "true";
    try {
      const button = event.currentTarget.querySelector('[type="submit"]');
      button.disabled = true;
      button.textContent = "Saving...";
      await onSave(Object.fromEntries(new FormData(event.currentTarget)));
      dialog.close();
      notify("Saved to the salon database.");
    } catch (error) {
      dialog.querySelector(".form-error").textContent = error.message;
    } finally {
      delete dialog.querySelector("form").dataset.saving;
      const button = dialog.querySelector('[type="submit"]');
      button.disabled = false;
      button.innerHTML = submitLabel;
    }
  });
  dialog.querySelector("#delete-item")?.addEventListener("click", async () => {
    if (
      !window.confirm(
        "Remove this item? Export your configuration first if you want a backup.",
      )
    )
      return;
    try {
      await deleteAction();
      dialog.close();
      notify("Item removed.");
    } catch (error) {
      dialog.querySelector(".form-error").textContent = error.message;
    }
  });
  dialog
    .querySelector("[data-image-upload]")
    ?.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const editorForm = event.target.closest("form");
      const saveButton = editorForm.querySelector('[type="submit"]');
      try {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 500000
        )
          throw new Error(
            "Choose a JPG, PNG or WebP image smaller than 500 KB.",
          );
        const reader = new FileReader();
        saveButton.disabled = true;
        editorForm.querySelector(".upload-note").textContent = "Reading image…";
        const result = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = () =>
            reject(new Error("Could not read this image. Try another file."));
          reader.readAsDataURL(file);
        });
        editorForm.querySelector('[name="image"]').value = result;
        editorForm.dataset.dirty = "true";
        editorForm.querySelector(".upload-note").textContent =
          `${file.name} selected. Save to add it to the salon database.`;
        editorForm.querySelector(".form-error").textContent = "";
      } catch (error) {
        editorForm.querySelector(".form-error").textContent = error.message;
      } finally {
        saveButton.disabled = false;
      }
    });
  dialog.showModal();
}
function selectField(label, name, options, value = "") {
  return `<div class="field"><label for="select-${name}">${label} <span>*</span></label><select id="select-${name}" name="${name}" required><option value="">Choose ${label.toLowerCase()}</option>${options.map(([id, name]) => `<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></div>`;
}
function editRequest(id) {
  const request = requests.find((item) => item.id === id);
  const isNew = !request;
  const fields = request
    ? `<div class="request-detail field-wide"><span class="guest-avatar">${initials(request.name)}</span><div><h3>${esc(request.name)}</h3><p>${esc(request.phone)} · ${esc(request.source)}</p></div></div><dl class="detail-list field-wide"><div><dt>Service</dt><dd>${esc(request.serviceName)}</dd></div><div><dt>Studio</dt><dd>${esc(request.branchName)}</dd></div></dl>${field("Preferred date & time", "datetime", request.datetime, "datetime-local", true, `Salon timezone: ${esc(config.timeZone)}`)}${selectField(
        "Status",
        "status",
        STATUSES.map((status) => [status, status]),
        request.status,
      )}${field("Internal notes", "notes", request.notes, "textarea", false, "Saved in the salon database. Status changes do not notify the guest.")}`
    : `${field("Guest name", "name", "", "text", true)}${field("Phone number", "phone", "", "tel", true)}${selectField(
        "Service",
        "service",
        config.services.flatMap((category) =>
          category.items.map((item) => [
            item.id,
            `${category.name} · ${item.name}`,
          ]),
        ),
      )}${selectField(
        "Studio",
        "branch",
        config.branches.map((branch) => [branch.id, branch.name]),
      )}${field("Preferred date & time", "datetime", `${selectedDay}T10:00`, "datetime-local", true, `Salon timezone: ${esc(config.timeZone)}`)}${field("Internal notes", "notes", "", "textarea")}`;
  openEditor(
    isNew ? "A new moment of care." : "Appointment details",
    isNew
      ? "Create an appointment request. This does not contact the guest or reserve a real appointment."
      : "Review the request and update your salon diary. No notification is sent.",
    fields,
    async (values) => {
      if (isNew) {
        const errors = validateBooking(values, config);
        if (Object.keys(errors).length)
          throw new Error(Object.values(errors).join(" "));
        await persistRequests([
          ...requests,
          { ...makeRequest(values, config), notes: values.notes },
        ]);
      } else {
        if (!values.datetime || !Number.isFinite(Date.parse(values.datetime)))
          throw new Error("Choose a valid date and time.");
        if (!STATUSES.includes(values.status))
          throw new Error("Choose a valid appointment status.");
        await persistRequests(
          requests.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: values.status,
                  datetime: values.datetime,
                  notes: values.notes,
                }
              : item,
          ),
        );
      }
    },
    request
      ? () => persistRequests(requests.filter((item) => item.id !== id))
      : null,
    isNew ? "Create request" : "Save appointment",
  );
}
function editService(categoryIndex = 0, itemIndex = -1) {
  const category = config.services[categoryIndex];
  const item = category.items[itemIndex];
  openEditor(
    item ? "Edit a little ritual." : "Add a little ritual.",
    "Starting prices and lengths appear on your customer website.",
    `${field("Service name", "name", item?.name || "", "text", true)}${selectField(
      "Category",
      "category",
      config.services.map((category, index) => [String(index), category.name]),
      String(categoryIndex),
    )}${field(`Starting price (${config.currency})`, "price", item?.price ?? 0, "number", true)}${field("Duration", "duration", item?.duration || "60 min", "text", true)}`,
    async (values) => {
      const next = structuredClone(config);
      if (
        !values.name.trim() ||
        !Number.isFinite(Number(values.price)) ||
        Number(values.price) < 0
      )
        throw new Error("Add a service name and a valid nonnegative price.");
      const updated = {
        id: item?.id || crypto.randomUUID(),
        name: values.name.trim(),
        price: Number(values.price),
        duration: values.duration,
      };
      if (!next.services[Number(values.category)])
        throw new Error("Choose a valid category.");
      if (item && Number(values.category) === categoryIndex) {
        next.services[categoryIndex].items[itemIndex] = updated;
      } else {
        if (item) next.services[categoryIndex].items.splice(itemIndex, 1);
        next.services[Number(values.category)].items.push(updated);
      }
      await persistConfig(next);
    },
    item
      ? async () => {
          const next = structuredClone(config);
          next.services[categoryIndex].items.splice(itemIndex, 1);
          await persistConfig(next);
        }
      : null,
  );
}
function editCategory(index = -1) {
  const item = config.services[index];
  openEditor(
    item ? "Edit a beauty category." : "Create a beauty category.",
    item
      ? "Each category must keep at least one service."
      : "Add a category and its first service. You can add more services afterwards.",
    `${field("Category name", "name", item?.name || "", "text", true)}${field("Short description", "subtitle", item?.subtitle || "")}${field("Cover image path or URL", "image", item?.image || "/images/hair.jpg", "text", true)}${field("Image description", "alt", item?.alt || "", "text", true)}${!item ? `${field("First service name", "serviceName", "", "text", true)}${field("First service starting price", "price", 0, "number", true)}` : ""}`,
    async (values) => {
      const next = structuredClone(config);
      const updated = {
        id: item?.id || crypto.randomUUID(),
        name: values.name.trim(),
        subtitle: values.subtitle,
        image: values.image,
        alt: values.alt,
        items: item?.items || [
          {
            id: crypto.randomUUID(),
            name: values.serviceName.trim(),
            price: Number(values.price),
            duration: "60 min",
          },
        ],
      };
      if (item) next.services[index] = updated;
      else next.services.push(updated);
      await persistConfig(next);
    },
    item
      ? async () => {
          const next = structuredClone(config);
          next.services.splice(index, 1);
          await persistConfig(next);
        }
      : null,
  );
}
function editPhoto(index = -1) {
  const item = config.gallery[index];
  openEditor(
    item ? "Edit your gallery photo." : "Add a little inspiration.",
    "Use your own work with permission. Uploaded images are saved with your salon settings in the database.",
    `${field("Caption", "label", item?.label || "", "text", true)}${field("Category", "category", item?.category || "Hair", "text", true)}${field("Image path or URL", "image", item?.image || "", "text", true, "Use /images/your-file.jpg or a full HTTPS image URL.")}${field("Accessible image description", "alt", item?.alt || "", "text", true)}<div class="field-wide upload-box"><label class="btn btn-secondary file-label">${icon("image")}Choose image<input type="file" data-image-upload accept="image/jpeg,image/png,image/webp"></label><small class="upload-note">JPG, PNG or WebP · Up to 500 KB · Saved to the salon database</small></div>`,
    async (values) => {
      const next = structuredClone(config);
      const updated = {
        label: values.label.trim(),
        category: values.category.trim(),
        image: values.image,
        alt: values.alt.trim(),
      };
      if (!updated.label || !updated.alt || !updated.image)
        throw new Error("Add a caption, image and accessible description.");
      if (item) next.gallery[index] = updated;
      else next.gallery.push(updated);
      await persistConfig(next);
    },
    item
      ? async () => {
          const next = structuredClone(config);
          next.gallery.splice(index, 1);
          await persistConfig(next);
        }
      : null,
  );
}
function editLocation(index = -1) {
  const item = config.branches[index];
  openEditor(
    item ? "Edit your studio." : "A new place for care.",
    "Add the full street address to show it publicly and generate a Google Maps link. Call links use the branch phone number.",
    `${field("Location name", "name", item?.name || "", "text", true)}${field("Eyebrow label", "label", item?.label || "YOUR NEIGHBORHOOD STUDIO")}${field("Description", "description", item?.description || "", "textarea")}${field("Full branch address", "address", item?.address || "", "textarea", false, "Google Maps links are generated automatically from this address. No API key is needed.")}${field("Phone number", "phone", item?.phone || "", "tel")}${field("Studio photo", "image", item?.image || "/images/interior.jpg")}${field("Photo description", "imageAlt", item?.imageAlt || "", "text", true)}${field("Opening hours", "hours", hoursText(item?.hours || config.contact.hours), "textarea", true, "One row per line: Days | Hours")}`,
    async (values) => {
      const next = structuredClone(config);
      const updated = {
        ...item,
        id: item?.id || crypto.randomUUID(),
        name: values.name.trim(),
        label: values.label,
        description: values.description,
        address: values.address,
        phone: values.phone,
        mapUrl: "",
        image: values.image,
        imageAlt: values.imageAlt,
        hours: parseHours(values.hours),
        seoAddress: item?.seoAddress || null,
      };
      if (item) next.branches[index] = updated;
      else next.branches.push(updated);
      await persistConfig(next);
    },
    item
      ? async () => {
          const next = structuredClone(config);
          next.branches.splice(index, 1);
          await persistConfig(next);
        }
      : null,
  );
}
function editReview(index = -1) {
  const item = config.reviews[index];
  openEditor(
    item ? "Edit a demo review." : "Add a demo review.",
    "The customer website clearly labels these illustrative testimonials as demo content.",
    `${field("Guest label", "name", item?.name || "Demo guest", "text", true)}${field("Service description", "service", item?.service || "", "text", true)}${field("Review copy", "quote", item?.quote || "", "textarea", true)}`,
    async (values) => {
      const next = structuredClone(config);
      const updated = {
        name: values.name.trim(),
        service: values.service.trim(),
        quote: values.quote.trim(),
      };
      if (item) next.reviews[index] = updated;
      else next.reviews.push(updated);
      await persistConfig(next);
    },
    item
      ? async () => {
          const next = structuredClone(config);
          next.reviews.splice(index, 1);
          await persistConfig(next);
        }
      : null,
  );
}

function download(filename, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify("Download prepared. Check your browser downloads.");
}

function bindPage() {
  app
    .querySelectorAll("[data-request]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        editRequest(button.dataset.request),
      ),
    );
  app.querySelectorAll("[data-settings-tab]").forEach((link) =>
    link.addEventListener("click", () => {
      viewTab = link.dataset.settingsTab;
      if (route === "settings") render();
    }),
  );
  app.querySelectorAll("[data-action]").forEach((button) =>
    button.addEventListener("click", async () => {
      try {
        const action = button.dataset.action;
        if (action === "logout") {
          await api("/api/auth/logout", { method: "POST", body: {} });
          location.assign("/admin/login");
          return;
        }
        if (action === "new-request") editRequest();
        if (action === "new-service") editService();
        if (action === "new-category") editCategory();
        if (action === "new-photo") editPhoto();
        if (action === "new-location") editLocation();
        if (action === "new-review") editReview();
        if (action === "menu") {
          const isOpen = document.body.classList.toggle("nav-open");
          button.setAttribute("aria-expanded", String(isOpen));
        }
        if (action === "theme") {
          document.documentElement.classList.toggle("dark");
          try {
            localStorage.setItem(
              "luma.admin.theme",
              document.documentElement.classList.contains("dark")
                ? "dark"
                : "light",
            );
          } catch {
            /* Theme still works for this visit when storage is disabled. */
          }
        }
        if (action === "today") {
          selectedDay = today();
          month = new Date(`${selectedDay.slice(0, 7)}-01T12:00:00Z`);
          render();
        }
        if (action === "samples") {
          if (requests.some((item) => item.source === "Sample")) {
            notify("Sample requests are already in your inbox.");
            return;
          }
          await persistRequests([
            ...requests,
            ...sampleRequests(config, today()),
          ]);
          notify("Five clearly labeled sample requests added.");
        }
        if (action === "clear-filters") {
          search = "";
          statusFilter = "all";
          branchFilter = "all";
          render();
        }
        if (action === "export-config")
          download(
            "salon.config.js",
            `// Exported from the shared salon database.\nexport const salon = ${JSON.stringify(config, null, 2)};\n`,
            "text/javascript",
          );
        if (action === "export-json")
          download("salon-config.json", JSON.stringify(config, null, 2));
        if (action === "export-requests")
          download("salon-requests.json", JSON.stringify(requests, null, 2));
        if (
          action === "remove-samples" &&
          window.confirm(
            "Remove sample requests? Your other requests will be kept.",
          )
        ) {
          await persistRequests(
            requests.filter((item) => item.source !== "Sample"),
          );
          notify("Sample requests removed.");
        }
        if (
          action === "reset-config" &&
          window.confirm(
            "Restore the original website settings? Export your edits first if you need to keep them. Requests will be preserved.",
          )
        ) {
          await persistConfig(structuredClone(defaults));
          notify("Default website settings restored.");
        }
      } catch (error) {
        notify(error.message, true);
      }
    }),
  );
  app.querySelectorAll("[data-month]").forEach((button) =>
    button.addEventListener("click", () => {
      month.setUTCMonth(month.getUTCMonth() + Number(button.dataset.month));
      render();
    }),
  );
  app.querySelectorAll("[data-day]").forEach((button) =>
    button.addEventListener("click", () => {
      selectedDay = button.dataset.day;
      render();
    }),
  );
  app
    .querySelectorAll("[data-edit-service]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        editService(...button.dataset.editService.split(":").map(Number)),
      ),
    );
  app
    .querySelectorAll("[data-add-service]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        editService(Number(button.dataset.addService)),
      ),
    );
  app
    .querySelectorAll("[data-edit-category]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        editCategory(Number(button.dataset.editCategory)),
      ),
    );
  app
    .querySelectorAll("[data-edit-photo]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        editPhoto(Number(button.dataset.editPhoto)),
      ),
    );
  app
    .querySelectorAll("[data-edit-location]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        editLocation(Number(button.dataset.editLocation)),
      ),
    );
  app
    .querySelectorAll("[data-edit-review]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        editReview(Number(button.dataset.editReview)),
      ),
    );
  app.querySelectorAll("[data-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      const form = document.querySelector("#settings-form");
      if (
        form?.dataset.dirty &&
        !window.confirm("Discard the unsaved changes in this section?")
      )
        return;
      viewTab = button.dataset.tab;
      render();
    }),
  );
  const updateTable = () => {
    document.querySelector("#request-rows").innerHTML = appointmentRows();
    document.querySelector("#result-count").textContent =
      `${filteredRequests().length} requests`;
    document
      .querySelectorAll("#request-rows [data-request]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          editRequest(button.dataset.request),
        ),
      );
    document
      .querySelector('#request-rows [data-action="clear-filters"]')
      ?.addEventListener("click", () => {
        search = "";
        statusFilter = "all";
        branchFilter = "all";
        render();
      });
    document
      .querySelector('#request-rows [data-action="new-request"]')
      ?.addEventListener("click", () => editRequest());
  };
  app.querySelector("#request-search")?.addEventListener("input", (event) => {
    search = event.target.value;
    updateTable();
  });
  app.querySelector("#status-filter")?.addEventListener("change", (event) => {
    statusFilter = event.target.value;
    updateTable();
  });
  app.querySelector("#branch-filter")?.addEventListener("change", (event) => {
    branchFilter = event.target.value;
    updateTable();
  });
  const settingsForm = app.querySelector("#settings-form");
  settingsForm?.addEventListener("input", () => {
    settingsForm.dataset.dirty = "true";
  });
  settingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      settingsForm.querySelector('[type="submit"]').disabled = true;
      settingsForm.querySelector('[type="submit"]').textContent = "Saving...";
      const next = structuredClone(config);
      for (const [path, value] of new FormData(settingsForm)) {
        if (path === "hours") {
          next.contact.hours = parseHours(value);
          continue;
        }
        if (path === "values") {
          next.about.values = value
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          continue;
        }
        if (["instagram", "facebook"].includes(path)) {
          const label = path === "instagram" ? "Instagram" : "Facebook";
          const social = next.contact.socials.find(
            (social) => social.label === label,
          );
          if (social) social.url = value;
          else next.contact.socials.push({ label, url: value });
          continue;
        }
        const parts = path.split(".");
        let target = next;
        for (const key of parts.slice(0, -1)) target = target[key];
        target[parts.at(-1)] = value.trim();
      }
      await persistConfig(next);
      notify(
        "Website changes saved. They are now available on the public website.",
      );
    } catch (error) {
      settingsForm.querySelector(".form-error").textContent = error.message;
    } finally {
      const button = settingsForm.querySelector('[type="submit"]');
      button.disabled = false;
      button.textContent = "Save website changes";
    }
  });
  for (const name of ["config", "requests"]) {
    app
      .querySelector(`#import-${name}`)
      ?.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        try {
          if (file.size > 4500000)
            throw new Error("Choose a JSON backup smaller than 4.5 MB.");
          const data = JSON.parse(await file.text());
          if (name === "requests") {
            validateRequests(data);
            if (
              window.confirm(
                "Replace the shared appointment inbox with this backup? Export your current inbox first if needed.",
              )
            ) {
              await persistRequests(data);
              requestsResult.error = "";
              storageError = configResult.error;
              requests = data;
              render();
              notify("Appointment backup restored.");
            }
          } else {
            // Validate before asking to replace anything, then validate again on save.
            saveConfigValidation(data);
            if (
              window.confirm(
                "Replace website settings with this backup? Your appointment inbox will be preserved.",
              )
            ) {
              await persistConfig(data);
              notify("Website configuration imported.");
            }
          }
        } catch (error) {
          notify(`Import failed: ${error.message}`, true);
        } finally {
          event.target.value = "";
        }
      });
  }
  app.querySelectorAll("img").forEach((image) =>
    image.addEventListener(
      "error",
      () => {
        image.style.visibility = "hidden";
        image.parentElement.classList.add("missing-photo");
      },
      { once: true },
    ),
  );
}

function saveConfigValidation(data) {
  validateConfig(data);
}
window.addEventListener("hashchange", () => {
  const form = document.querySelector("#settings-form");
  if (
    form?.dataset.dirty &&
    !window.confirm("Discard the unsaved website changes?")
  ) {
    history.replaceState(null, "", `#${route}`);
    return;
  }
  route = location.hash.slice(1).split("?")[0] || "overview";
  document.body.classList.remove("nav-open");
  render();
  document.querySelector("#admin-main").focus({ preventScroll: true });
});
window.addEventListener("beforeunload", (event) => {
  if (
    document.querySelector("#settings-form")?.dataset.dirty ||
    (dialog.open && dialog.querySelector("form")?.dataset.dirty)
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
});
dialog.addEventListener("cancel", (event) => {
  if (dialog.querySelector("form")?.dataset.saving) {
    event.preventDefault();
    return;
  }
  if (
    dialog.querySelector("form")?.dataset.dirty &&
    !window.confirm("Discard the unsaved changes in this editor?")
  )
    event.preventDefault();
});
dialog.addEventListener("close", () => {
  if (
    document.activeElement === document.body ||
    dialog.contains(document.activeElement)
  )
    document.querySelector("#admin-main").focus({ preventScroll: true });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.body.classList.remove("nav-open");
    app.querySelector(".mobile-menu")?.setAttribute("aria-expanded", "false");
  }
});
try {
  if (localStorage.getItem("luma.admin.theme") === "dark")
    document.documentElement.classList.add("dark");
} catch {
  /* The default theme does not require storage. */
}
render();
