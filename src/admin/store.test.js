import { test } from "node:test";
import assert from "node:assert/strict";
import { salon } from "../salon.config.js";
import { validateConfig, validateRequests, sampleRequests } from "./store.js";

test("default salon settings and sample appointments satisfy shared validation", () => {
  assert.equal(validateConfig(salon), salon);
  const samples = sampleRequests(salon, "2099-02-20");
  assert.equal(validateRequests(samples).length, 5);
  assert.ok(samples.every((item) => item.source === "Sample"));
});
test("unsafe URLs, invalid currency, duplicate IDs and empty menus are rejected", () => {
  for (const change of [
    (config) => {
      config.contact.socials[0].url = "javascript:alert(1)";
    },
    (config) => {
      config.gallery[0].image = "data:image/svg+xml,<svg/>";
    },
    (config) => {
      config.currency = "not-currency";
    },
    (config) => {
      config.services[1].items[0].id = "cut";
    },
    (config) => {
      config.services = [];
    },
  ]) {
    const config = structuredClone(salon);
    change(config);
    assert.throws(() => validateConfig(config));
  }
});
test("malformed appointment imports and duplicate IDs are rejected", () => {
  assert.throws(() => validateRequests([{}]));
  const records = sampleRequests(salon, "2099-02-20");
  assert.throws(() => validateRequests([records[0], records[0]]));
  assert.throws(() =>
    validateRequests([{ ...records[0], status: "Auto-booked" }]),
  );
});
