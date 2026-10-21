import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";
import { salon } from "../salon.config.js";
import { localDateTime, validateBooking } from "../booking.js";
import * as validation from "./store.js";
const html = await readFile(
  new URL("../../admin/index.html", import.meta.url),
  "utf8",
);
const script = (
  await readFile(new URL("./admin.js", import.meta.url), "utf8")
).replace(/^import[\s\S]*?;\s*/gm, "");
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function page(route = "overview", original = salon) {
  let config = structuredClone(original);
  let requests = [];
  let revision = 1;
  let failure = "";
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error));
  const dom = new JSDOM(html, {
    url: `http://localhost:5173/admin/#${route}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  Object.assign(dom.window, {
    defaults: salon,
    structuredClone,
    localDateTime,
    validateBooking,
    ...validation,
    confirm: () => true,
    setCsrf: () => {},
    mountAdminChat: () => {},
    api: async (url, options) => {
      if (url === "/api/auth/session")
        return {
          user: { role: "admin", email: "demo@example.test" },
          csrf: "test-csrf",
        };
      if (options?.method === "PUT") {
        if (failure) throw new Error(failure);
        if (url.endsWith("/settings")) {
          validation.validateConfig(options.body.config);
          config = structuredClone(options.body.config);
        } else {
          validation.validateRequests(options.body.requests);
          requests = structuredClone(options.body.requests);
        }
        revision++;
      }
      return url.endsWith("/settings")
        ? { config: structuredClone(config), revision }
        : { requests: structuredClone(requests), revision };
    },
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  await dom.window.eval(`(async () => {${script}\n})()`);
  return {
    dom,
    doc: dom.window.document,
    saved: () => ({ config, requests }),
    fail: (message) => {
      failure = message;
    },
    close: () => {
      dom.window.close();
      assert.deepEqual(errors, []);
    },
  };
}
async function submit(dom, form) {
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await tick();
}
test("connected admin starts empty, loads sample requests and has logout and public navigation", async () => {
  const { doc, saved, close } = await page();
  assert.ok(
    doc
      .querySelector(".demo-notice")
      .textContent.includes("saved to your salon database"),
  );
  assert.ok(doc.querySelector('[data-action="logout"]'));
  assert.equal(doc.querySelector(".view-site").getAttribute("href"), "/");
  doc.querySelector('[data-action="samples"]').click();
  await tick();
  assert.equal(saved().requests.length, 5);
  assert.equal(doc.querySelectorAll(".diary-row").length, 5);
  close();
});
test("appointment status saves before closing and requests remain searchable", async () => {
  const { dom, doc, saved, close } = await page("appointments");
  doc.querySelector('[data-action="new-request"]').click();
  let form = doc.querySelector("#editor-form");
  for (const [key, value] of Object.entries({
    name: "Demo guest",
    phone: "2025550147",
    service: "cut",
    branch: "garden",
    datetime: "2099-02-20T14:30",
    notes: "Test note",
  }))
    form.elements[key].value = value;
  await submit(dom, form);
  assert.equal(saved().requests.length, 1);
  assert.equal(doc.querySelector("#editor").open, false);
  doc.querySelector("[data-request]").click();
  form = doc.querySelector("#editor-form");
  form.elements.status.value = "Confirmed";
  await submit(dom, form);
  assert.equal(saved().requests[0].status, "Confirmed");
  const search = doc.querySelector("#request-search");
  search.value = "No such guest";
  search.dispatchEvent(new dom.window.Event("input"));
  assert.ok(
    doc
      .querySelector("#request-rows")
      .textContent.includes("No matching appointments"),
  );
  close();
});
test("service editing preserves unsaved input and offers retry when the shared API fails", async () => {
  const { dom, doc, saved, fail, close } = await page("services");
  doc.querySelector('[data-edit-service="0:0"]').click();
  const form = doc.querySelector("#editor-form");
  form.elements.price.value = "82.5";
  fail("The server is unavailable. Try again.");
  await submit(dom, form);
  assert.equal(doc.querySelector("#editor").open, true);
  assert.equal(form.elements.price.value, "82.5");
  assert.ok(
    form.querySelector(".form-error").textContent.includes("unavailable"),
  );
  assert.equal(form.querySelector('[type="submit"]').disabled, false);
  fail("");
  await submit(dom, form);
  assert.equal(saved().config.services[0].items[0].price, 82.5);
  close();
});
test("branch editor saves full addresses and validates hours without a Maps API field", async () => {
  const { dom, doc, saved, close } = await page("locations");
  doc.querySelector('[data-edit-location="0"]').click();
  const form = doc.querySelector("#editor-form");
  form.elements.address.value = "Fictional full address, Test City";
  form.elements.hours.value = "Invalid row";
  assert.equal(form.elements.mapUrl, undefined);
  await submit(dom, form);
  assert.ok(
    form.querySelector(".form-error").textContent.includes("Days | Hours"),
  );
  form.elements.hours.value = "Tuesday | 10 AM - 6 PM";
  await submit(dom, form);
  assert.equal(
    saved().config.branches[0].address,
    "Fictional full address, Test City",
  );
  close();
});
test("website settings reject invalid WhatsApp numbers before saving shared settings", async () => {
  const { dom, doc, saved, close } = await page("settings");
  const form = doc.querySelector("#settings-form");
  form.elements["contact.whatsappNumber"].value = "+1 202";
  await submit(dom, form);
  assert.ok(
    form
      .querySelector(".form-error")
      .textContent.includes("international digits"),
  );
  form.elements["contact.whatsappNumber"].value = "12025550147";
  form.elements.name.value = "Connected Test Salon";
  await submit(dom, form);
  assert.equal(saved().config.name, "Connected Test Salon");
  close();
});
test("gallery creation persists accessible image data through the shared settings API", async () => {
  const { dom, doc, saved, close } = await page("gallery");
  doc.querySelector('[data-action="new-photo"]').click();
  const form = doc.querySelector("#editor-form");
  for (const [key, value] of Object.entries({
    label: "Demo gallery addition",
    category: "Hair",
    image: "/images/hair.jpg",
    alt: "Natural curls",
  }))
    form.elements[key].value = value;
  await submit(dom, form);
  assert.equal(saved().config.gallery.length, 5);
  close();
});
