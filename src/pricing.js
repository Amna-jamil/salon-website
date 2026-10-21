export const DISCOUNT_TYPES = ["None", "Percent", "Fixed"];
export const roundMoney = (value) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export const validMoney = (value) =>
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1000000000 &&
  Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;
export function salonDay(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (key) => parts.find((item) => item.type === key).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export const validDay = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
export function validateOffers(offers, config) {
  if (!Array.isArray(offers) || offers.length > 100)
    throw new Error("Use at most 100 offers.");
  const ids = new Set();
  const services = new Set(
    config.services.flatMap((category) =>
      category.items.map((item) => item.id),
    ),
  );
  const branches = new Set(config.branches.map((item) => item.id));
  for (const offer of offers) {
    if (
      !offer ||
      typeof offer.id !== "string" ||
      !offer.id ||
      ids.has(offer.id) ||
      typeof offer.title !== "string" ||
      !offer.title.trim() ||
      offer.title.length > 120 ||
      typeof offer.description !== "string" ||
      offer.description.length > 600 ||
      typeof offer.enabled !== "boolean" ||
      !["Percent", "Fixed"].includes(offer.type) ||
      !validMoney(offer.value) ||
      offer.value <= 0 ||
      (offer.type === "Percent" && offer.value > 100) ||
      !/^[A-Z]{3}$/.test(offer.currency) ||
      ![offer.startDate, offer.endDate].every(
        (day) => day === "" || validDay(day),
      ) ||
      (offer.startDate && offer.endDate && offer.startDate > offer.endDate) ||
      !Array.isArray(offer.serviceIds) ||
      !Array.isArray(offer.branchIds) ||
      !offer.serviceIds.every((id) => services.has(id)) ||
      !offer.branchIds.every((id) => branches.has(id))
    )
      throw new Error(
        "Check offer name, discount, dates, services and locations. Percent discounts cannot exceed 100%.",
      );
    ids.add(offer.id);
    if (offer.enabled && offer.type === "Fixed") {
      const eligible = config.services
        .flatMap((category) => category.items)
        .filter(
          (item) =>
            !offer.serviceIds.length || offer.serviceIds.includes(item.id),
        );
      if (eligible.some((item) => item.price < offer.value))
        throw new Error(
          "This fixed offer exceeds an eligible service's price. Reduce the discount or select higher-priced services.",
        );
    }
  }
}
export function activeOffers(config, day = salonDay(config.timeZone)) {
  return (config.offers || []).filter(
    (offer) =>
      offer.enabled &&
      (!offer.startDate || offer.startDate <= day) &&
      (!offer.endDate || offer.endDate >= day) &&
      (offer.type !== "Fixed" ||
        offer.currency === config.currency.toUpperCase()),
  );
}
export function calculateBill(subtotal, currency, discount = {}) {
  const type = discount.type || "None",
    value = discount.value ?? 0;
  if (
    !validMoney(subtotal) ||
    !DISCOUNT_TYPES.includes(type) ||
    !validMoney(value) ||
    (type === "Percent" && value > 100) ||
    (type === "Fixed" && value > subtotal) ||
    (type === "None" && value !== 0)
  )
    throw new Error(
      "Check the bill amount and discount. A discount cannot exceed the bill.",
    );
  const discountAmount =
    type === "None"
      ? 0
      : type === "Percent"
        ? roundMoney((subtotal * value) / 100)
        : value;
  return {
    subtotal,
    currency: currency.toUpperCase(),
    discountType: type,
    discountValue: value,
    discountAmount,
    total: roundMoney(subtotal - discountAmount),
    discountLabel: discount.label || "",
    offerId: discount.offerId || "",
  };
}
export function bookingBill(values, config) {
  const service = config.services
    .flatMap((category) => category.items)
    .find((item) => item.id === values.service);
  if (!service) throw new Error("Choose a current service.");
  if (!values.offerId) return calculateBill(service.price, config.currency);
  const offer = activeOffers(config).find((item) => item.id === values.offerId);
  const date = (values.datetime || "").slice(0, 10);
  if (
    !offer ||
    (offer.serviceIds.length && !offer.serviceIds.includes(service.id)) ||
    (offer.branchIds.length && !offer.branchIds.includes(values.branch)) ||
    (offer.startDate && date < offer.startDate) ||
    (offer.endDate && date > offer.endDate)
  )
    throw new Error(
      "This offer does not apply to the selected service, location or appointment date. Choose another offer or no offer.",
    );
  return calculateBill(service.price, config.currency, {
    type: offer.type,
    value: offer.value,
    label: offer.title,
    offerId: offer.id,
  });
}
export function validateBill(bill) {
  if (
    !bill ||
    !/^[A-Z]{3}$/.test(bill.currency) ||
    typeof bill.discountLabel !== "string" ||
    bill.discountLabel.length > 120 ||
    typeof bill.offerId !== "string" ||
    bill.offerId.length > 100
  )
    throw new Error("Enter valid billing details.");
  const calculated = calculateBill(bill.subtotal, bill.currency, {
    type: bill.discountType,
    value: bill.discountValue,
  });
  if (
    calculated.total !== bill.total ||
    calculated.discountAmount !== bill.discountAmount
  )
    throw new Error("The bill total does not match its discount.");
  return bill;
}
