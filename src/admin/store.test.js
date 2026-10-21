import { test } from "node:test";
import assert from "node:assert/strict";
import { salon } from "../salon.config.js";
import {
  CONFIG_KEY,
  BOOKINGS_KEY,
  loadConfig,
  saveConfig,
  loadRequests,
  saveRequests,
  makeRequest,
  sampleRequests,
  validateConfig,
} from "./store.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("website settings persist independently of the source configuration", () => {
  const browser = storage();
  const next = structuredClone(salon);
  next.name = "Demo Atelier";
  next.services[0].items[0].price = 72.5;
  saveConfig(next, browser);
  assert.equal(loadConfig(browser).config.name, "Demo Atelier");
  assert.equal(loadConfig(browser).config.services[0].items[0].price, 72.5);
  assert.equal(salon.name, "Luma");
});

test("invalid config imports cannot replace a previously saved configuration", () => {
  const browser = storage();
  saveConfig(salon, browser);
  const invalid = structuredClone(salon);
  invalid.services[1].items[0].id = invalid.services[0].items[0].id;
  assert.throws(() => saveConfig(invalid, browser), /unique ID/);
  assert.deepEqual(loadConfig(browser).config, salon);
  invalid.services = [];
  assert.throws(() => saveConfig(invalid, browser), /at least one category/);
});

test("configuration validates links, uploaded image types, timezone and currency", () => {
  for (const change of [
    (config) => {
      config.contact.socials[0].url = "javascript:alert(1)";
    },
    (config) => {
      config.gallery[0].image = "data:image/svg+xml,<svg/>";
    },
    (config) => {
      config.timeZone = "Unknown/Timezone";
    },
    (config) => {
      config.currency = "bad-currency";
    },
  ]) {
    const config = structuredClone(salon);
    change(config);
    assert.throws(() => validateConfig(config));
  }
});

test("corrupt and unavailable storage report an error without overwriting data", () => {
  const browser = storage();
  browser.setItem(CONFIG_KEY, "{broken");
  browser.setItem(BOOKINGS_KEY, "[{}]");
  assert.ok(loadConfig(browser).error);
  assert.ok(loadRequests(browser).error);
  assert.equal(browser.getItem(CONFIG_KEY), "{broken");
  assert.throws(
    () =>
      saveConfig(salon, {
        setItem: () => {
          throw new Error("Quota exceeded");
        },
      }),
    /storage may be full/,
  );
});

test("appointments keep their original service and branch labels after menu edits", () => {
  const browser = storage();
  const request = makeRequest(
    {
      name: "Demo guest",
      phone: "2025550147",
      service: "cut",
      branch: "garden",
      datetime: "2099-02-20T14:30",
    },
    salon,
    "Website demo",
  );
  saveRequests([request], browser);
  const config = structuredClone(salon);
  config.services[0].items[0].name = "A different name";
  saveConfig(config, browser);
  assert.equal(loadRequests(browser).requests[0].serviceName, "Cut & finish");
  const invalid = { ...request, status: "Sent to salon" };
  assert.throws(() => saveRequests([invalid], browser), /invalid fields/);
  assert.equal(loadRequests(browser).requests[0].status, "Pending");
});

test("sample requests are identifiable and duplicate request IDs are rejected", () => {
  const samples = sampleRequests(salon, "2099-02-20");
  assert.equal(samples.length, 5);
  assert.ok(
    samples.every(
      (item) => item.source === "Sample" && item.name.startsWith("Demo guest"),
    ),
  );
  assert.throws(
    () => saveRequests([samples[0], samples[0]], storage()),
    /invalid fields/,
  );
});
