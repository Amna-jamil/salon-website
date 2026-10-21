import "./fonts.css";
import "./style.css";
import { api } from "./api.js";
import { googleMapsLink } from "./locations.js";
import { mountChat } from "./chat.js";
import { localDateTime, validateBooking, whatsappLink } from "./booking.js";

const { config: salon, revision: salonRevision } = await api("/api/salon");

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const icon = (name, extra = "") => {
  const paths = {
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    diagonal: '<path d="M6 18 18 6M6 6h12v12"/>',
    spark:
      '<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    phone:
      '<path d="m7 3 3 5-3 3c1.5 3 3 4.5 6 6l3-3 5 3c0 3-2 5-5 4C8 19 5 16 3 8 2 5 4 3 7 3Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    whatsapp:
      '<path d="M21 11.5a9 9 0 0 1-13.3 7.9L3 21l1.5-4.6A9 9 0 1 1 21 11.5Z"/><path d="m8 7 2 3-1 1c1 2 2 3 4 3l1-1 3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
  };
  return `<svg class="icon ${extra}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
};
const photo = (src, alt, className = "", eager = false) =>
  `<img src="${escape(src)}" alt="${escape(alt)}" class="${className}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="900" height="1100">`;
const formatPrice = (price) =>
  new Intl.NumberFormat(salon.locale, {
    style: "currency",
    currency: salon.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
const hours = (items) =>
  `<dl class="hours">${items.map((item) => `<div><dt>${escape(item.days)}</dt><dd>${escape(item.time)}</dd></div>`).join("")}</dl>`;
const phoneHref = (phone) => `tel:${phone.replace(/[^\d+]/g, "")}`;
const wordmark = salon.logo
  ? `<img class="logo-image" src="${escape(salon.logo)}" alt="${escape(salon.name)}">`
  : `<span class="wordmark">${escape(salon.name.toLowerCase())}<span class="wordmark-star">✧</span></span>`;
const navLinks = [
  ["About", "about"],
  ["Services", "services"],
  ["Our work", "work"],
  ["Studios", "locations"],
  ["Contact", "contact"],
];
const waLink = whatsappLink(salon);
const socials = salon.contact.socials.filter((social) => social.url);

for (const [key, value] of Object.entries(salon.theme))
  document.documentElement.style.setProperty(
    `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
    value,
  );
document.title = salon.seo.title;
document.querySelector('meta[name="description"]').content =
  salon.seo.description;
document.querySelector('meta[name="theme-color"]').content = salon.theme.ink;
document.querySelector('link[rel="icon"]').href = salon.favicon;
if (salon.website) {
  const canonical = document.createElement("link");
  canonical.rel = "canonical";
  canonical.href = salon.website;
  document.head.append(canonical);
}
// Demo businesses are deliberately excluded from local-business rich results.
if (!salon.demoMode) {
  const schema = document.createElement("script");
  schema.type = "application/ld+json";
  schema.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BeautySalon",
    name: salon.name,
    description: salon.seo.description,
    ...(salon.website && { url: salon.website }),
    ...(salon.contact.phone && { telephone: salon.contact.phone }),
    ...(socials.length && { sameAs: socials.map((social) => social.url) }),
    branch: salon.branches
      .filter((branch) => branch.seoAddress)
      .map((branch) => ({
        "@type": "BeautySalon",
        name: `${salon.name} — ${branch.name}`,
        address: { "@type": "PostalAddress", ...branch.seoAddress },
        ...(branch.phone && { telephone: branch.phone }),
        ...(googleMapsLink(branch.address) && {
          hasMap: googleMapsLink(branch.address),
        }),
      })),
  });
  document.head.append(schema);
}

document.querySelector("#app").innerHTML = `
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="#" aria-label="${escape(salon.name)} home">${wordmark}<span class="brand-tagline">${escape(salon.tagline)}</span></a>
      <nav class="desktop-nav" aria-label="Main navigation">${navLinks.map(([name, id]) => `<a href="#${id}">${name}</a>`).join("")}</nav>
      <a class="button button-small header-book" href="#book">Book an appointment ${icon("diagonal")}</a>
      <button class="menu-toggle" aria-label="Open navigation" aria-expanded="false" aria-controls="mobile-nav"><span></span><span></span></button>
    </div>
    <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile navigation" hidden>${navLinks.map(([name, id]) => `<a href="#${id}">${name}${icon("diagonal")}</a>`).join("")}<a href="#book">Book an appointment ${icon("diagonal")}</a></nav>
  </header>
  <main id="main">
    <section class="hero" aria-labelledby="hero-title">
      <div class="container hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">${icon("spark")} ${escape(salon.hero.eyebrow)}</p>
          <h1 id="hero-title">${escape(salon.hero.title[0])}<br>${escape(salon.hero.title[1])}<br><em>${escape(salon.hero.title[2])}</em></h1>
          <p class="hero-description">${escape(salon.hero.description)}</p>
          <div class="hero-actions"><a class="button button-dark" href="#book">Book an Appointment ${icon("diagonal")}</a><a class="text-link" href="#services">Explore services ${icon("arrow")}</a></div>
          <div class="hero-note"><span class="tiny-spark">✧</span> A little time for yourself looks good on you.</div>
        </div>
        <div class="hero-visual">
          <div class="hero-image-wrap">${photo(salon.hero.image, salon.hero.imageAlt, "hero-image", true)}<span class="image-caption">EFFORTLESS BEAUTY. EVERYDAY YOU.</span></div>
          <div class="hero-detail">${photo(salon.hero.detailImage, salon.hero.detailAlt, "", true)}<span>Your new happy place ${icon("spark")}</span></div>
          <div class="hero-seal" aria-hidden="true"><span>MAKE TIME</span>${icon("spark")}<span>FOR YOU</span></div>
          <span class="visual-index">01 / THE ${escape(salon.name.toUpperCase())} FEELING</span>
        </div>
      </div>
      <div class="container ritual-strip"><span>Thoughtful care</span>${icon("spark")}<span>Beautiful little rituals</span>${icon("spark")}<span>Uniquely you</span></div>
    </section>

    <section class="section services-section" id="services" aria-labelledby="services-title">
      <div class="container">
        <div class="section-heading"><div><p class="eyebrow">THE BEAUTY MENU</p><h2 id="services-title">Your kind of <em>self-care.</em></h2></div><p>From a subtle refresh to a whole new feeling.<br>Find the little ritual that’s right for you.</p></div>
        <div class="services-grid">${salon.services
          .map(
            (category, index) => `
          <article class="service-card">
            <a class="service-image" href="#book" data-service="${escape(category.items[0].id)}" aria-label="Book ${escape(category.name)}">${photo(category.image, category.alt)}<span class="service-number">0${index + 1}</span><span class="round-arrow">${icon("diagonal")}</span></a>
            <h3>${escape(category.name)}</h3><p class="service-subtitle">${escape(category.subtitle)}</p>
            <ul class="service-list">${category.items.map((item) => `<li><a href="#book" data-service="${escape(item.id)}"><span>${escape(item.name)}<small>${escape(item.duration)}</small></span><span class="price">${formatPrice(item.price)}<span class="sr-only"> starting price. Book this service</span></span></a></li>`).join("")}</ul>
          </article>`,
          )
          .join("")}</div>
        <p class="price-note">${salon.demoMode ? "Sample menu · " : ""}Prices from, in ${escape(salon.currencyLabel)}. Final price and appointment length confirmed after consultation.</p>
      </div>
    </section>

    <section class="about-section" id="about" aria-labelledby="about-title"><div class="container about-grid">
      <div class="about-visual">${photo(salon.about.image, salon.about.imageAlt)}<span class="about-image-label">A SPACE TO SIMPLY BE.</span></div>
      <div class="about-copy"><p class="eyebrow">${escape(salon.about.eyebrow)}</p><h2 id="about-title">${escape(salon.about.title).replace("\n", "<br>")}</h2><p>${escape(salon.about.description)}</p><p>${escape(salon.about.detail)}</p><ul class="values">${salon.about.values.map((value) => `<li>${icon("spark")}${escape(value)}</li>`).join("")}</ul><a class="text-link light-link" href="#book">Find your moment ${icon("arrow")}</a></div>
    </div></section>

    <section class="section work-section" id="work" aria-labelledby="work-title"><div class="container">
      <div class="section-heading"><div><p class="eyebrow">THE INSPIRATION EDIT</p><h2 id="work-title">A little look at <em>the glow.</em></h2></div><p>${salon.demoMode ? "Stock photography for this demo.<br>A space for your salon’s own beautiful work." : "A few favorite details.<br>Find inspiration for your next visit."}</p></div>
      <div class="gallery">${salon.gallery.map((item, i) => `<button class="gallery-item gallery-item-${i}" data-gallery="${i}" aria-label="View ${escape(item.label)}">${photo(item.image, item.alt)}<span class="gallery-caption"><span><small>${escape(item.category)}</small>${escape(item.label)}</span><span class="round-arrow">${icon("plus")}</span></span></button>`).join("")}</div>
      <div class="gallery-footnote"><span>${icon("spark")} Beauty is in the little details.</span><span>${salon.demoMode ? "DEMO IMAGE COLLECTION" : escape(salon.name.toUpperCase()) + " IN FOCUS"}</span></div>
    </div></section>

    <section class="reviews-section section" aria-labelledby="reviews-title"><div class="container">
      <div class="center-heading"><p class="eyebrow">KIND WORDS, GOOD FEELINGS</p><h2 id="reviews-title">The afterglow, <em>in words.</em></h2><p class="demo-pill">Demo testimonials · Illustrative copy, not real customer reviews</p></div>
      <div class="review-grid">${salon.reviews.map((review) => `<figure class="review-card"><span class="quote-mark" aria-hidden="true">“</span><blockquote>${escape(review.quote)}</blockquote><figcaption><span class="review-avatar" aria-hidden="true">${icon("spark")}</span><span>${escape(review.name)}<small>${escape(review.service)} · Demo</small></span></figcaption></figure>`).join("")}</div>
    </div></section>

    <section class="section locations-section" id="locations" aria-labelledby="locations-title"><div class="container">
      <div class="section-heading"><div><p class="eyebrow">FIND YOUR LITTLE ESCAPE</p><h2 id="locations-title">A space to <em>settle in.</em></h2></div><p>${salon.demoMode ? "Two imagined studios. One lovely feeling.<br>Real locations can be added before launch." : "Choose your studio.<br>We’ll make you feel at home."}</p></div>
      <div class="branch-grid">${salon.branches.map((branch) => `<article class="branch-card">${photo(branch.image, branch.imageAlt)}<div class="branch-content"><p class="eyebrow">${escape(branch.label)}</p><h3>${escape(branch.name)}</h3><p>${escape(branch.description)}</p>${branch.address ? `<p class="branch-address">${icon("pin")}${escape(branch.address)}</p>` : '<p class="unconfigured">Demo studio · Address to be added</p>'}<details><summary>Studio opening hours ${icon("plus")}</summary>${hours(branch.hours || salon.contact.hours)}</details><div class="branch-actions"><a class="text-link" href="#book" data-branch="${escape(branch.id)}">Choose this studio ${icon("arrow")}</a>${googleMapsLink(branch.address) ? `<a class="icon-link" href="${escape(googleMapsLink(branch.address))}" target="_blank" rel="noopener noreferrer" aria-label="Open in Google Maps: ${escape(branch.name)} (opens new tab)" title="Open in Google Maps">${icon("pin")}</a>` : ""}${branch.phone ? `<a class="icon-link" href="${phoneHref(branch.phone)}" aria-label="Call ${escape(branch.name)}">${icon("phone")}</a>` : ""}</div></div></article>`).join("")}</div>
    </div></section>

    <section class="booking-section section" id="book" aria-labelledby="booking-title"><div class="container booking-grid">
      <div class="booking-copy"><p class="eyebrow">YOUR NEXT GOOD HAIR DAY STARTS HERE</p><h2 id="booking-title">Let’s make<br>time for <em>you.</em></h2><p>${escape(salon.booking.introduction)}</p><div class="booking-detail">${icon("clock")}<span>Choose your preferred time.<br>Availability is confirmed by the salon.</span></div>${waLink ? `<a class="text-link" href="${escape(waLink)}" target="_blank" rel="noopener noreferrer">${icon("whatsapp")} Prefer WhatsApp? Let’s chat ${icon("diagonal")}</a>` : ""}${salon.demoMode ? '<p class="booking-disclaimer">You’re exploring a fictional salon demo. You can preview a request, then send it to the salon inbox. The WhatsApp number is a demo number.</p>' : ""}</div>
      <div class="booking-panel"><div class="form-heading"><h3>A moment, reserved for you.</h3><span>APPOINTMENT ENQUIRY</span></div><p class="form-note">${salon.demoMode ? "Try the form. Nothing is sent or booked." : "Prepare an enquiry below, then send it on WhatsApp. This form does not submit to a booking system."}</p>
        <form id="booking-form" novalidate>
          <div class="form-row"><div class="field"><label for="name">Your name <span aria-hidden="true">*</span></label><input id="name" name="name" autocomplete="name" placeholder="Full name" required maxlength="100" aria-describedby="name-error"><span class="field-error" id="name-error"></span></div><div class="field"><label for="phone">Phone number <span aria-hidden="true">*</span></label><input id="phone" name="phone" type="tel" autocomplete="tel" placeholder="Your phone number" required maxlength="30" aria-describedby="phone-error"><span class="field-error" id="phone-error"></span></div></div>
          <div class="form-row"><div class="field"><label for="service">Your service <span aria-hidden="true">*</span></label><select id="service" name="service" required aria-describedby="service-error"><option value="">Choose a little self-care</option>${salon.services.map((category) => `<optgroup label="${escape(category.name)}">${category.items.map((item) => `<option value="${escape(item.id)}">${escape(item.name)} — from ${formatPrice(item.price)}</option>`).join("")}</optgroup>`).join("")}</select><span class="field-error" id="service-error"></span></div><div class="field"><label for="branch">Preferred studio <span aria-hidden="true">*</span></label><select id="branch" name="branch" required aria-describedby="branch-error"><option value="">Choose your studio</option>${salon.branches.map((branch) => `<option value="${escape(branch.id)}">${escape(branch.name)}</option>`).join("")}</select><span class="field-error" id="branch-error"></span></div></div>
          <div class="field"><label for="datetime">Preferred date & time <span aria-hidden="true">*</span></label><input id="datetime" name="datetime" type="datetime-local" required aria-describedby="datetime-hint datetime-error"><small id="datetime-hint">Salon timezone: ${escape(salon.timeZone)}. All fields are required.</small><span class="field-error" id="datetime-error"></span></div>
          <button class="button button-dark submit-button" type="submit">${salon.demoMode ? "Preview appointment request" : "Prepare appointment request"} ${icon("diagonal")}</button><p class="privacy-note">Your details are shared with the salon when you send your request. Availability is confirmed separately.</p>
        </form>
        <div class="confirmation" id="confirmation" role="status" aria-live="polite" tabindex="-1" hidden></div>
      </div>
    </div></section>

    <section class="section contact-section" id="contact" aria-labelledby="contact-title"><div class="container contact-grid"><div><p class="eyebrow">WE’D LOVE TO HEAR FROM YOU</p><h2 id="contact-title">Say <em>hello.</em></h2><p>A question, a special occasion, or just not sure<br>where to start? Let’s find your kind of care.</p>${salon.demoMode ? '<p class="unconfigured">Fictional demo contact details · Replace before launch</p>' : ""}</div><div class="contact-links">${salon.contact.phone ? `<a href="${phoneHref(salon.contact.phone)}">${icon("phone")}<span><small>GIVE US A CALL</small>${escape(salon.contact.phone)}</span>${icon("diagonal")}</a>` : ""}${waLink ? `<a href="${escape(waLink)}" target="_blank" rel="noopener noreferrer">${icon("whatsapp")}<span><small>A LITTLE HELLO ON WHATSAPP</small>Let’s chat</span>${icon("diagonal")}</a>` : ""}${salon.contact.email ? `<a href="mailto:${escape(salon.contact.email)}">${icon("arrow")}<span><small>EMAIL THE STUDIO</small>${escape(salon.contact.email)}</span>${icon("diagonal")}</a>` : ""}${socials.map((social) => `<a href="${escape(social.url)}" target="_blank" rel="noopener noreferrer">${icon("diagonal")}<span><small>FOLLOW ALONG</small>${escape(social.label)}</span>${icon("diagonal")}</a>`).join("")}</div><div class="contact-hours"><h3>${icon("clock")} Studio hours</h3>${hours(salon.contact.hours)}<p>${salon.demoMode ? "Sample opening hours. " : ""}See each studio for its schedule.</p></div></div></section>
  </main>
  <footer class="site-footer"><div class="container"><div class="footer-top"><a class="brand" href="#" aria-label="${escape(salon.name)} home">${wordmark}<span class="brand-tagline">${escape(salon.tagline)}</span></a><p>A little care. A little confidence.<br>A little more you.</p><a class="footer-cta" href="#book">Your moment awaits ${icon("diagonal")}</a></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} ${escape(salon.name)}. ${salon.demoMode ? "A fictional salon concept." : "All rights reserved."}</span><nav aria-label="Footer navigation"><a href="#services">Services</a><a href="#locations">Studios</a><a href="#contact">Contact</a><button class="privacy-trigger" type="button">Privacy</button></nav><span>MADE FOR YOUR KIND OF BEAUTIFUL</span></div></div></footer>
  <dialog id="gallery-dialog" class="gallery-dialog" aria-labelledby="gallery-dialog-title"><button class="dialog-close" aria-label="Close image">${icon("close")}</button><img id="gallery-full-image" alt=""><p id="gallery-dialog-title"></p></dialog>
  <dialog id="privacy-dialog" class="privacy-dialog" aria-labelledby="privacy-title"><button class="dialog-close" aria-label="Close privacy information">${icon("close")}</button><p class="eyebrow">YOUR INFORMATION</p><h2 id="privacy-title">A little privacy.</h2><p>Appointment requests and website conversations are stored in the salon database and are accessible only to authorized salon administrators. A private browser cookie keeps your website conversation accessible in this browser for up to 30 days. Clearing the cookie removes your access, but does not delete the salon record. Contact the salon to request deletion. No marketing tracking is used.</p><p>Choosing WhatsApp opens an external service with your prepared message. WhatsApp’s own privacy terms apply. No message is sent automatically.</p><p>A real salon should replace this notice with its own accurate privacy policy before launch.</p></dialog>
`;

// Local image fallbacks keep the layout usable without a network or a valid photo.
function registerImageFallback(img) {
  const showFallback = () => {
    img.classList.add("image-failed");
    img.removeAttribute("src");
    img.style.visibility = "hidden";
    img.parentElement.classList.add("photo-fallback");
    img.parentElement.setAttribute(
      "data-fallback",
      img.alt || "A moment of beauty",
    );
  };
  img.addEventListener("error", showFallback, { once: true });
  if (img.complete && !img.naturalWidth && img.getAttribute("src"))
    showFallback();
}
document.querySelectorAll("img[src]").forEach(registerImageFallback);

const menuButton = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector("#mobile-nav");
function closeMenu() {
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Open navigation");
  mobileNav.hidden = true;
}
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!open));
  menuButton.setAttribute(
    "aria-label",
    open ? "Open navigation" : "Close navigation",
  );
  mobileNav.hidden = open;
});
mobileNav.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !mobileNav.hidden) {
    closeMenu();
    menuButton.focus();
  }
});
matchMedia("(min-width: 901px)").addEventListener("change", (event) => {
  if (event.matches) closeMenu();
});

const form = document.querySelector("#booking-form");
const confirmation = document.querySelector("#confirmation");
const dateInput = form.elements.datetime;
dateInput.min = localDateTime(salon.timeZone);
dateInput.addEventListener("focus", () => {
  dateInput.min = localDateTime(salon.timeZone);
});
function setFieldError(name, error = "") {
  form.elements[name].setAttribute("aria-invalid", String(Boolean(error)));
  document.querySelector(`#${name}-error`).textContent = error;
}
form.addEventListener("input", (event) => {
  if (event.target.name) setFieldError(event.target.name);
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const errors = validateBooking(values, salon);
  for (const name of ["name", "phone", "service", "branch", "datetime"])
    setFieldError(name, errors[name]);
  if (Object.keys(errors).length) {
    form.elements[Object.keys(errors)[0]].focus();
    return;
  }
  const selectedService = salon.services
    .flatMap((category) => category.items)
    .find((item) => item.id === values.service);
  const selectedBranch = salon.branches.find(
    (branch) => branch.id === values.branch,
  );
  const dateLabel = new Intl.DateTimeFormat(salon.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(`${values.datetime}:00Z`));
  confirmation.innerHTML = `<span class="confirmation-icon">${icon("check")}</span><p class="eyebrow">${salon.demoMode ? "DEMO PREVIEW COMPLETE" : "YOUR ENQUIRY IS READY"}</p><h3>Lovely choice, ${escape(values.name.trim().split(" ")[0])}.</h3><p>Your request is prepared below. <strong>Nothing has been sent and no appointment is booked.</strong></p><dl class="request-summary"><div><dt>Service</dt><dd>${escape(selectedService.name)}</dd></div><div><dt>Studio</dt><dd>${escape(selectedBranch.name)}</dd></div><div><dt>Preferred time</dt><dd>${escape(dateLabel)}<small>${escape(salon.timeZone)}</small></dd></div></dl>${waLink ? `<a class="button button-dark" href="${escape(whatsappLink(salon, values))}" target="_blank" rel="noopener noreferrer">Continue on WhatsApp ${icon("whatsapp")}</a>` : ""}${salon.demoMode && waLink ? '<p class="privacy-note">The configured WhatsApp number is fictional. Replace it before sending an enquiry.</p>' : ""}<button class="edit-request text-link" type="button">Edit your request ${icon("arrow")}</button>`;
  form.hidden = true;
  confirmation.hidden = false;
  confirmation.focus();
  const send = document.createElement("button");
  send.type = "button";
  send.className = "button button-local send-appointment-request";
  send.textContent = "Send appointment request";
  const status = document.createElement("p");
  status.className = "privacy-note";
  status.setAttribute("role", "status");
  status.textContent =
    "Send this request to the salon. Your preferred time still needs confirmation.";
  confirmation.querySelector(".edit-request").before(send, status);
  send.addEventListener("click", async () => {
    send.disabled = true;
    send.textContent = "Sending request...";
    try {
      await api("/api/appointments", { method: "POST", body: values });
      send.textContent = "Request sent to the salon";
      status.textContent =
        "Your request is in the salon inbox. Your preferred time is awaiting confirmation; no appointment is confirmed yet.";
      confirmation.querySelector("strong").textContent =
        "Request received. Your appointment is not confirmed yet.";
      confirmation.querySelector(".edit-request").hidden = true;
    } catch (error) {
      status.textContent = error.message;
      send.disabled = false;
      send.textContent = "Try sending again";
    }
  });
  confirmation.querySelector(".edit-request").addEventListener("click", () => {
    confirmation.hidden = true;
    form.hidden = false;
    form.elements.name.focus();
  });
});
document.querySelectorAll("[data-service], [data-branch]").forEach((link) =>
  link.addEventListener("click", () => {
    confirmation.hidden = true;
    form.hidden = false;
    if (link.dataset.service) {
      form.elements.service.value = link.dataset.service;
      setFieldError("service");
    }
    if (link.dataset.branch) {
      form.elements.branch.value = link.dataset.branch;
      setFieldError("branch");
    }
  }),
);

const galleryDialog = document.querySelector("#gallery-dialog");
document.querySelectorAll("[data-gallery]").forEach((button) =>
  button.addEventListener("click", () => {
    const item = salon.gallery[Number(button.dataset.gallery)];
    const fullImage = document.querySelector("#gallery-full-image");
    fullImage.style.visibility = "";
    fullImage.src = item.image;
    fullImage.alt = item.alt;
    fullImage.onerror = () => {
      fullImage.style.visibility = "hidden";
    };
    document.querySelector("#gallery-dialog-title").textContent =
      `${item.label}${salon.demoMode ? " · Demo stock photography" : ""}`;
    galleryDialog.showModal();
  }),
);
const privacyDialog = document.querySelector("#privacy-dialog");
document
  .querySelector(".privacy-trigger")
  .addEventListener("click", () => privacyDialog.showModal());
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog
    .querySelector(".dialog-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    }
  });
});

const adminLink = document.createElement("a");
adminLink.href = "/admin/login";
adminLink.textContent = "Admin Login";
document.querySelector(".footer-bottom nav").append(adminLink);
mountChat(salon);

async function checkSalonUpdates() {
  if (
    document.hidden ||
    !salonRevision ||
    document.querySelector(".content-update-notice")
  )
    return;
  try {
    const latest = await api("/api/salon/version");
    if (latest.revision === salonRevision) return;
    const notice = document.createElement("div");
    notice.className = "content-update-notice";
    notice.setAttribute("role", "status");
    notice.append("The salon has updated its website details. ");
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.textContent = "Refresh website";
    refresh.addEventListener("click", () => location.reload());
    notice.append(refresh);
    document.body.append(notice);
  } catch {
    /* Existing page and form stay available when an update check is offline. */
  }
}
const updateTimer = setInterval(checkSalonUpdates, 60000);
window.addEventListener("focus", checkSalonUpdates);
window.addEventListener("pagehide", () => clearInterval(updateTimer), {
  once: true,
});
