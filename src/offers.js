import { activeOffers } from "./pricing.js";

export function mountPublicOffers(root, config, choose) {
  const document = root.ownerDocument;
  const offers = activeOffers(config);
  if (!offers.length) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  root.innerHTML =
    '<div class="container"><div class="section-heading"><div><p class="eyebrow">A LITTLE EXTRA, FOR YOU</p><h2>Current <em>offers.</em></h2></div><p>Choose an offer with your appointment enquiry.<br>The salon confirms the final service and availability.</p></div><div class="public-offers-grid"></div></div>';
  for (const offer of offers) {
    const card = document.createElement("article");
    card.className = "public-offer-card";
    const saving = document.createElement("p");
    saving.className = "eyebrow";
    saving.textContent =
      offer.type === "Percent"
        ? `${offer.value}% OFF`
        : `${new Intl.NumberFormat(config.locale, { style: "currency", currency: offer.currency }).format(offer.value)} OFF`;
    const title = document.createElement("h3");
    title.textContent = offer.title;
    const description = document.createElement("p");
    description.textContent = offer.description;
    const scope = document.createElement("p");
    scope.className = "offer-terms";
    const services = offer.serviceIds.length
      ? config.services
          .flatMap((category) => category.items)
          .filter((item) => offer.serviceIds.includes(item.id))
          .map((item) => item.name)
          .join(", ")
      : "All services";
    const locations = offer.branchIds.length
      ? config.branches
          .filter((item) => offer.branchIds.includes(item.id))
          .map((item) => item.name)
          .join(", ")
      : "All locations";
    scope.textContent = `${services}. ${locations}. ${offer.startDate ? `From ${offer.startDate}. ` : ""}${offer.endDate ? `Until ${offer.endDate}. ` : ""}Applies to eligible appointment dates. One discount per booking.`;
    const link = document.createElement("a");
    link.className = "text-link";
    link.href = "#book";
    link.textContent = "Choose this offer →";
    link.addEventListener("click", () => choose(offer));
    card.append(saving, title, description, scope, link);
    root.querySelector(".public-offers-grid").append(card);
  }
}
