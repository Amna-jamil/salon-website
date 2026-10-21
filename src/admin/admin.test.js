import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";
import { salon } from "../salon.config.js";
import { localDateTime, validateBooking } from "../booking.js";
import * as store from "./store.js";

const html = await readFile(
  new URL("../../admin/index.html", import.meta.url),
  "utf8",
);
const script = (
  await readFile(new URL("./admin.js", import.meta.url), "utf8")
).replace(/^import[\s\S]*?;\s*/gm, "");

function page(route = "overview", config = salon, requests = []) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error));
  const dom = new JSDOM(html, {
    url: `http://localhost:5173/admin/#${route}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  store.saveConfig(config, dom.window.localStorage);
  store.saveRequests(requests, dom.window.localStorage);
  Object.assign(dom.window, {
    defaults: salon,
    structuredClone,
    localDateTime,
    validateBooking,
    ...store,
    loadConfig: () => store.loadConfig(dom.window.localStorage),
    saveConfig: (config, browser) =>
      store.saveConfig(config, browser || dom.window.localStorage),
    loadRequests: () => store.loadRequests(dom.window.localStorage),
    saveRequests: (requests) =>
      store.saveRequests(requests, dom.window.localStorage),
    confirm: () => true,
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  dom.window.eval(script);
  return {
    dom,
    doc: dom.window.document,
    close: () => {
      dom.window.close();
      assert.deepEqual(errors, []);
    },
  };
}
function submit(dom, form) {
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
}
function fill(form, fields) {
  for (const [key, value] of Object.entries(fields))
    form.elements[key].value = value;
}

test("admin overview starts empty with working sample data and no invented revenue", () => {
  const { dom, doc, close } = page();
  assert.match(doc.querySelector("h1").textContent, /beautiful day/);
  assert.ok(
    doc.querySelector(".demo-notice").textContent.includes("No secure login"),
  );
  assert.equal(store.loadRequests(dom.window.localStorage).requests.length, 0);
  doc.querySelector('[data-action="samples"]').click();
  assert.equal(store.loadRequests(dom.window.localStorage).requests.length, 5);
  assert.equal(doc.querySelectorAll(".diary-row").length, 5);
  doc.querySelector('[data-action="samples"]')?.click();
  assert.equal(store.loadRequests(dom.window.localStorage).requests.length, 5);
  close();
});

test("a manually created request can be managed and filtered", () => {
  const { dom, doc, close } = page("appointments");
  doc.querySelector('[data-action="new-request"]').click();
  const form = doc.querySelector("#editor-form");
  fill(form, {
    name: "Demo test guest",
    phone: "2025550147",
    service: "cut",
    branch: "garden",
    datetime: "2099-02-20T14:30",
    notes: "Demo consultation",
  });
  submit(dom, form);
  assert.equal(doc.querySelector("#editor").open, false);
  assert.equal(
    store.loadRequests(dom.window.localStorage).requests[0].name,
    "Demo test guest",
  );
  doc.querySelector("[data-request]").click();
  const detail = doc.querySelector("#editor-form");
  detail.elements.status.value = "Confirmed";
  submit(dom, detail);
  assert.equal(
    store.loadRequests(dom.window.localStorage).requests[0].status,
    "Confirmed",
  );
  const search = doc.querySelector("#request-search");
  search.value = "no such guest";
  search.dispatchEvent(new dom.window.Event("input"));
  assert.ok(
    doc
      .querySelector("#request-rows")
      .textContent.includes("No matching appointments"),
  );
  doc.querySelector('[data-action="clear-filters"]').click();
  assert.ok(
    doc.querySelector("#request-rows").textContent.includes("Demo test guest"),
  );
  close();
});

test("service price updates persist and the last category service cannot be removed", () => {
  const config = structuredClone(salon);
  config.services[0].items = [config.services[0].items[0]];
  const { dom, doc, close } = page("services", config);
  doc.querySelector('[data-edit-service="0:0"]').click();
  doc.querySelector("#delete-item").click();
  assert.equal(doc.querySelector("#editor").open, true);
  assert.ok(
    doc
      .querySelector(".form-error")
      .textContent.includes("at least one service"),
  );
  const form = doc.querySelector("#editor-form");
  form.elements.price.value = "82.50";
  submit(dom, form);
  assert.equal(
    store.loadConfig(dom.window.localStorage).config.services[0].items[0].price,
    82.5,
  );
  close();
});

test("gallery add and removal persist with required accessible descriptions", () => {
  const { dom, doc, close } = page("gallery");
  doc.querySelector('[data-action="new-photo"]').click();
  const form = doc.querySelector("#editor-form");
  fill(form, {
    label: "Demo photo",
    category: "Hair",
    image: "/images/hair.jpg",
    alt: "Demo curly hairstyle",
  });
  submit(dom, form);
  assert.equal(
    store.loadConfig(dom.window.localStorage).config.gallery.length,
    5,
  );
  doc.querySelector('[data-edit-photo="4"]').click();
  doc.querySelector("#delete-item").click();
  assert.equal(
    store.loadConfig(dom.window.localStorage).config.gallery.length,
    4,
  );
  close();
});

test("locations validate opening hours before saving", () => {
  const { dom, doc, close } = page("locations");
  doc.querySelector('[data-edit-location="0"]').click();
  const form = doc.querySelector("#editor-form");
  form.elements.hours.value = "Tuesday 10 AM";
  submit(dom, form);
  assert.ok(
    doc.querySelector(".form-error").textContent.includes("Days | Hours"),
  );
  form.elements.hours.value = "Tuesday | 10 AM – 6 PM";
  form.elements.address.value = "Fictional test studio address";
  submit(dom, form);
  assert.equal(
    store.loadConfig(dom.window.localStorage).config.branches[0].hours[0].days,
    "Tuesday",
  );
  close();
});

test("website identity saves, while invalid WhatsApp input preserves prior data", () => {
  const { dom, doc, close } = page("settings");
  let form = doc.querySelector("#settings-form");
  form.elements["contact.whatsappNumber"].value = "+1 202";
  submit(dom, form);
  assert.ok(
    form
      .querySelector(".form-error")
      .textContent.includes("international digits"),
  );
  assert.equal(store.loadConfig(dom.window.localStorage).config.name, "Luma");
  form.elements["contact.whatsappNumber"].value = "12025550147";
  form.elements.name.value = "Demo Atelier";
  submit(dom, form);
  assert.equal(
    store.loadConfig(dom.window.localStorage).config.name,
    "Demo Atelier",
  );
  form = doc.querySelector("#settings-form");
  assert.equal(form.elements.name.value, "Demo Atelier");
  close();
});

test("cross-tab updates prevent stale admin saves and theme controls work", () => {
  const { dom, doc, close } = page("settings");
  doc.querySelector('[data-action="theme"]').click();
  assert.equal(doc.documentElement.classList.contains("dark"), true);
  dom.window.dispatchEvent(
    new dom.window.StorageEvent("storage", { key: store.CONFIG_KEY }),
  );
  const form = doc.querySelector("#settings-form");
  form.elements.name.value = "Stale overwrite";
  submit(dom, form);
  assert.ok(
    form
      .querySelector(".form-error")
      .textContent.includes("Another tab changed"),
  );
  assert.equal(store.loadConfig(dom.window.localStorage).config.name, "Luma");
  close();
});
