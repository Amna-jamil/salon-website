import { salon as defaults } from "../salon.config.js";
import { paymentRecord, validatePayment } from "./payments.js";
import { validateOffers, bookingBill, validateBill } from "../pricing.js";

export const STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"];

export function validateConfig(config) {
  function shape(value, sample, path) {
    if (sample === null) return;
    if (Array.isArray(sample)) {
      if (!Array.isArray(value)) throw new Error(`${path} must be a list.`);
      if (value.length > 200) throw new Error(`${path} has too many entries.`);
      value.forEach((item, index) =>
        shape(item, sample[0], `${path}[${index}]`),
      );
    } else if (typeof sample === "object") {
      if (!value || Array.isArray(value) || typeof value !== "object")
        throw new Error(`${path} must be an object.`);
      for (const key of Object.keys(sample))
        shape(value[key], sample[key], `${path}.${key}`);
    } else if (
      typeof value !== typeof sample ||
      (typeof value === "number" && (!Number.isFinite(value) || value < 0))
    ) {
      throw new Error(`${path} has an invalid value.`);
    } else if (typeof value === "string" && value.length > 750000)
      throw new Error(`${path} is too long.`);
  }
  shape(config, defaults, "Salon");
  if (config.offers !== undefined) validateOffers(config.offers, config);
  if (
    !config.name.trim() ||
    config.hero.title.length !== 3 ||
    !config.services.length ||
    !config.branches.length
  )
    throw new Error(
      "Add a salon name, three hero title lines, at least one category and one location.",
    );
  const serviceIds = new Set();
  const categoryIds = new Set();
  const branchIds = new Set();
  for (const category of config.services) {
    if (
      !category.name.trim() ||
      !category.id ||
      categoryIds.has(category.id) ||
      !category.items.length
    )
      throw new Error(
        "Every category needs a unique ID, a name and at least one service.",
      );
    categoryIds.add(category.id);
    for (const item of category.items) {
      if (!item.name.trim() || !item.id || serviceIds.has(item.id))
        throw new Error("Every service needs a name and a unique ID.");
      serviceIds.add(item.id);
    }
  }
  for (const branch of config.branches) {
    if (!branch.name.trim() || !branch.id || branchIds.has(branch.id))
      throw new Error("Every location needs a name and a unique ID.");
    branchIds.add(branch.id);
    if (
      branch.seoAddress !== null &&
      (typeof branch.seoAddress !== "object" ||
        Array.isArray(branch.seoAddress) ||
        !Object.values(branch.seoAddress).every(
          (value) => typeof value === "string",
        ))
    )
      throw new Error("Location SEO addresses must be text fields or null.");
  }
  function checkLinks(value, key = "") {
    if (typeof value === "string") {
      if (
        ["url", "mapUrl", "website"].includes(key) &&
        value &&
        !/^https?:\/\/[^\s]+$/i.test(value)
      )
        throw new Error("Links must start with https:// or http://.");
      if (
        ["image", "detailImage", "logo", "favicon"].includes(key) &&
        value &&
        !/^(\/(?!\/)|https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(
          value,
        )
      )
        throw new Error(
          "Images must use a /images/ path, an HTTP(S) URL, or a supported uploaded image.",
        );
    } else if (value && typeof value === "object")
      Object.entries(value).forEach(([child, item]) => checkLinks(item, child));
  }
  checkLinks(config);
  if (
    Object.values(config.theme).some((color) => !/^#[\da-f]{6}$/i.test(color))
  )
    throw new Error("Use six-digit hex theme colors, such as #382335.");
  if (
    config.contact.whatsappNumber &&
    !/^\d{7,15}$/.test(config.contact.whatsappNumber)
  )
    throw new Error(
      "WhatsApp needs 7–15 international digits without spaces or +.",
    );
  try {
    new Intl.DateTimeFormat(config.locale, {
      timeZone: config.timeZone,
    }).format();
    new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.currency,
    }).format(0);
  } catch {
    throw new Error("Check the locale, currency code and salon timezone.");
  }
  return config;
}

export function validateRequests(requests) {
  const ids = new Set();
  if (!Array.isArray(requests) || requests.length > 2000)
    throw new Error("Use an appointment list with at most 2,000 requests.");
  for (const item of requests) {
    if (
      !item ||
      ![
        "id",
        "name",
        "phone",
        "serviceId",
        "serviceName",
        "branchId",
        "branchName",
        "datetime",
        "notes",
        "source",
        "createdAt",
      ].every(
        (key) => typeof item[key] === "string" && item[key].length < 10000,
      ) ||
      !item.id ||
      !item.name.trim() ||
      ids.has(item.id) ||
      !STATUSES.includes(item.status) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.datetime) ||
      !Number.isFinite(Date.parse(item.datetime)) ||
      !Number.isFinite(item.price) ||
      item.price < 0
    )
      throw new Error(
        "The appointment backup contains missing or invalid fields.",
      );
    ids.add(item.id);
    if (item.billing !== undefined) validateBill(item.billing);
    if (item.payment !== undefined)
      validatePayment(item.payment, {
        allowZeroPaid: item.billing?.total === 0,
      });
  }
  return requests;
}

export function makeRequest(values, config, source = "Manual") {
  const service = config.services
    .flatMap((category) => category.items)
    .find((item) => item.id === values.service);
  const branch = config.branches.find((item) => item.id === values.branch);
  if (!service || !branch)
    throw new Error("Choose a current service and location.");
  return {
    id: crypto.randomUUID(),
    name: values.name.trim(),
    phone: values.phone.trim(),
    serviceId: service.id,
    serviceName: service.name,
    price: service.price,
    branchId: branch.id,
    branchName: branch.name,
    datetime: values.datetime,
    status: "Pending",
    notes: "",
    source,
    createdAt: new Date().toISOString(),
    payment: paymentRecord({}, config.currency),
    billing: bookingBill(values, config),
  };
}

export function sampleRequests(config, day) {
  const names = [
    "Demo guest Avery",
    "Demo guest Noor",
    "Demo guest Maya",
    "Demo guest Sophia",
    "Demo guest Amara",
  ];
  const services = config.services.flatMap((category) => category.items);
  return names.map((name, index) => ({
    ...makeRequest(
      {
        name,
        phone: "+1 202 555 0147",
        service: services[index % services.length].id,
        branch: config.branches[index % config.branches.length].id,
        datetime: `${day}T${["10:00", "11:30", "13:00", "14:30", "16:00"][index]}`,
      },
      config,
      "Sample",
    ),
    status: ["Confirmed", "Pending", "Confirmed", "Pending", "Completed"][
      index
    ],
  }));
}
