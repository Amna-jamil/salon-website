import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { salon } from "./salon.config.js";
import { localDateTime, validateBooking, whatsappLink } from "./booking.js";
import {
  loadConfig,
  saveConfig,
  loadRequests,
  saveRequests,
  makeRequest,
} from "./admin/store.js";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = (
  await readFile(new URL("./main.js", import.meta.url), "utf8")
).replace(/^import[\s\S]*?;\s*/gm, "");

function createPage(config = salon, savedConfig = null) {
  const dom = new JSDOM(html, {
    url: "http://localhost:5173",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  if (savedConfig) saveConfig(savedConfig, dom.window.localStorage);
  Object.assign(dom.window, {
    salon: structuredClone(config),
    loadConfig: () =>
      savedConfig
        ? loadConfig(dom.window.localStorage)
        : { config: structuredClone(config), error: "" },
    loadRequests: () => loadRequests(dom.window.localStorage),
    saveRequests: (requests) => saveRequests(requests, dom.window.localStorage),
    makeRequest,
    CONFIG_KEY: "luma.salon.config.v1",
    localDateTime,
    validateBooking,
    whatsappLink,
    matchMedia: () => ({ addEventListener() {} }),
    fetch: () => {
      throw new Error("The demo must not submit data to a network service.");
    },
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  dom.window.eval(script);
  return dom;
}

test("saved admin configuration updates the customer website identity and service prices", () => {
  const saved = structuredClone(salon);
  saved.name = "Demo Atelier";
  saved.services[0].items[0].price = 82.5;
  const dom = createPage(salon, saved);
  const doc = dom.window.document;
  assert.ok(
    doc.querySelector(".wordmark").textContent.includes("demo atelier"),
  );
  assert.ok(doc.querySelector(".service-list").textContent.includes("$82.5"));
  dom.window.close();
});

test("page renders all configured services and branches without fake map/social links", () => {
  const dom = createPage();
  const doc = dom.window.document;
  assert.equal(doc.querySelectorAll("h1").length, 1);
  assert.equal(
    doc.querySelectorAll(".service-card").length,
    salon.services.length,
  );
  assert.equal(
    doc.querySelectorAll(".branch-card").length,
    salon.branches.length,
  );
  assert.equal(doc.querySelectorAll(".branch-actions .icon-link").length, 0);
  assert.equal(doc.querySelector('script[type="application/ld+json"]'), null);
  for (const section of [
    "about",
    "services",
    "work",
    "locations",
    "book",
    "contact",
  ])
    assert.ok(doc.getElementById(section));
  dom.window.close();
});

test("service and branch shortcuts populate the booking form", () => {
  const dom = createPage();
  const doc = dom.window.document;
  doc.querySelector('[data-service="gel"]').click();
  doc.querySelector('[data-branch="atelier"]').click();
  assert.equal(doc.querySelector("#service").value, "gel");
  assert.equal(doc.querySelector("#branch").value, "atelier");
  dom.window.close();
});

test("empty form submission shows accessible errors and focuses the first field", () => {
  const dom = createPage();
  const doc = dom.window.document;
  doc
    .querySelector("#booking-form")
    .dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  assert.equal(doc.querySelectorAll('[aria-invalid="true"]').length, 5);
  assert.equal(doc.activeElement.id, "name");
  assert.equal(doc.querySelector("#confirmation").hidden, true);
  dom.window.close();
});

test("valid form shows an honest confirmation, escapes input and builds WhatsApp enquiry", () => {
  const dom = createPage();
  const doc = dom.window.document;
  const form = doc.querySelector("#booking-form");
  const values = {
    name: "<img src=x> Guest",
    phone: "+1 202 555 0147",
    service: "cut",
    branch: "garden",
    datetime: "2099-01-15T14:30",
  };
  for (const [key, value] of Object.entries(values))
    form.elements[key].value = value;
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  const result = doc.querySelector("#confirmation");
  assert.equal(result.hidden, false);
  assert.equal(form.hidden, true);
  assert.ok(
    result.textContent.includes(
      "Nothing has been sent and no appointment is booked.",
    ),
  );
  assert.equal(result.querySelector("img"), null);
  const link = new URL(result.querySelector("a").href);
  assert.ok(link.searchParams.get("text").includes("The Garden Studio"));
  doc.querySelector(".edit-request").click();
  assert.equal(form.hidden, false);
  assert.equal(form.elements.name.value, values.name);
  dom.window.close();
});

test("navigation disclosure and gallery viewer open and close", () => {
  const dom = createPage();
  const doc = dom.window.document;
  const toggle = doc.querySelector(".menu-toggle");
  toggle.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(doc.querySelector("#mobile-nav").hidden, false);
  doc.querySelector("#mobile-nav a").click();
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  doc.querySelector('[data-gallery="0"]').click();
  assert.equal(doc.querySelector("#gallery-dialog").open, true);
  doc.querySelector("#gallery-dialog .dialog-close").click();
  assert.equal(doc.querySelector("#gallery-dialog").open, false);
  dom.window.close();
});

test("a customer only enters the local admin inbox after explicitly choosing to save", () => {
  const dom = createPage();
  const doc = dom.window.document;
  const form = doc.querySelector("#booking-form");
  for (const [name, value] of Object.entries({
    name: "Demo local guest",
    phone: "2025550147",
    service: "cut",
    branch: "garden",
    datetime: "2099-02-20T14:30",
  }))
    form.elements[name].value = value;
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  assert.equal(loadRequests(dom.window.localStorage).requests.length, 0);
  doc.querySelector(".save-local-request").click();
  const saved = loadRequests(dom.window.localStorage).requests;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].source, "Website demo");
  assert.equal(doc.querySelector(".save-local-request").disabled, true);
  dom.window.close();
});

test("real details enable branch maps, social links and local-business schema", () => {
  const config = structuredClone(salon);
  config.demoMode = false;
  config.branches = [
    {
      ...config.branches[0],
      address: "Test address for automated checks",
      mapUrl: "https://maps.google.com/?q=test",
      phone: "+1 202 555 0147",
      seoAddress: {
        streetAddress: "Test address",
        addressLocality: "Test city",
        addressCountry: "US",
      },
    },
  ];
  config.contact.socials[0].url = "https://www.instagram.com/";
  const dom = createPage(config);
  const doc = dom.window.document;
  assert.equal(doc.querySelectorAll(".branch-actions .icon-link").length, 2);
  const schema = JSON.parse(
    doc.querySelector('script[type="application/ld+json"]').textContent,
  );
  assert.equal(schema["@type"], "BeautySalon");
  assert.equal(schema.branch[0].address.addressLocality, "Test city");
  assert.ok(schema.sameAs.includes("https://www.instagram.com/"));
  dom.window.close();
});
