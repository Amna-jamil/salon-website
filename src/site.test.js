import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { salon } from "./salon.config.js";
import { localDateTime, validateBooking, whatsappLink } from "./booking.js";
import { googleMapsLink } from "./locations.js";
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = (
  await readFile(new URL("./main.js", import.meta.url), "utf8")
).replace(/^import[\s\S]*?;\s*/gm, "");
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function page(config = salon, sendError = "") {
  const dom = new JSDOM(html, {
    url: "http://localhost:5173",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const calls = [];
  Object.assign(dom.window, {
    localDateTime,
    validateBooking,
    whatsappLink,
    googleMapsLink,
    mountChat: () => {},
    matchMedia: () => ({ addEventListener() {} }),
    api: async (url, options) => {
      calls.push({ url, options });
      if (url === "/api/salon") return { config: structuredClone(config) };
      if (sendError) throw new Error(sendError);
      return { id: "request-test", status: "Pending" };
    },
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  await dom.window.eval(`(async () => {${script}\n})()`);
  return { dom, doc: dom.window.document, calls };
}
const values = {
  name: "Demo guest",
  phone: "2025550147",
  service: "cut",
  branch: "garden",
  datetime: "2099-02-20T14:30",
};
function preview(dom) {
  const form = dom.window.document.querySelector("#booking-form");
  for (const [name, value] of Object.entries(values))
    form.elements[name].value = value;
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
}
test("public site renders shared identity, prices and a permanent admin login link", async () => {
  const config = structuredClone(salon);
  config.name = "Shared Test Salon";
  config.services[0].items[0].price = 82.5;
  const { dom, doc } = await page(config);
  assert.ok(
    doc.querySelector(".wordmark").textContent.includes("shared test salon"),
  );
  assert.ok(doc.querySelector(".service-list").textContent.includes("$82.5"));
  assert.equal(
    doc.querySelectorAll(".service-card").length,
    config.services.length,
  );
  assert.equal(
    doc.querySelector('.footer-bottom a[href="/admin/login"]').textContent,
    "Admin Login",
  );
  dom.window.close();
});
test("saved full addresses generate encoded Google Maps links; missing addresses hide them", async () => {
  const config = structuredClone(salon);
  config.branches[0].address = "Demo #12, Garden Road & Test Avenue";
  config.branches[0].mapUrl = "https://example.com/obsolete";
  const { dom, doc } = await page(config);
  const links = doc.querySelectorAll(
    '.branch-actions a[title="Open in Google Maps"]',
  );
  assert.equal(links.length, 1);
  assert.equal(
    new URL(links[0].href).searchParams.get("query"),
    config.branches[0].address,
  );
  assert.ok(
    doc
      .querySelector(".branch-address")
      .textContent.includes(config.branches[0].address),
  );
  assert.equal(googleMapsLink("   "), "");
  dom.window.close();
});
test("empty forms show accessible errors and service and location shortcuts populate fields", async () => {
  const { dom, doc } = await page();
  doc
    .querySelector("#booking-form")
    .dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  assert.equal(doc.querySelectorAll('[aria-invalid="true"]').length, 5);
  assert.equal(doc.activeElement.id, "name");
  doc.querySelector('[data-service="gel"]').click();
  doc.querySelector('[data-branch="atelier"]').click();
  assert.equal(doc.querySelector("#service").value, "gel");
  assert.equal(doc.querySelector("#branch").value, "atelier");
  dom.window.close();
});
test("appointments send only after confirmation and show success or recoverable server errors", async () => {
  for (const error of ["", "Server temporarily unavailable"]) {
    const { dom, doc, calls } = await page(salon, error);
    preview(dom);
    assert.equal(
      calls.filter((call) => call.url === "/api/appointments").length,
      0,
    );
    doc.querySelector(".send-appointment-request").click();
    await tick();
    assert.equal(calls.at(-1).url, "/api/appointments");
    if (error) {
      assert.ok(doc.querySelector("#confirmation").textContent.includes(error));
      assert.equal(
        doc.querySelector(".send-appointment-request").disabled,
        false,
      );
    } else {
      assert.ok(
        doc
          .querySelector("#confirmation")
          .textContent.includes("Request received"),
      );
      assert.equal(
        doc.querySelector(".send-appointment-request").disabled,
        true,
      );
    }
    dom.window.close();
  }
});
test("responsive navigation and gallery dialogs retain their interactions", async () => {
  const { dom, doc } = await page();
  doc.querySelector(".menu-toggle").click();
  assert.equal(doc.querySelector("#mobile-nav").hidden, false);
  doc.querySelector("#mobile-nav a").click();
  assert.equal(doc.querySelector("#mobile-nav").hidden, true);
  doc.querySelector('[data-gallery="0"]').click();
  assert.equal(doc.querySelector("#gallery-dialog").open, true);
  doc.querySelector("#gallery-dialog .dialog-close").click();
  assert.equal(doc.querySelector("#gallery-dialog").open, false);
  dom.window.close();
});
