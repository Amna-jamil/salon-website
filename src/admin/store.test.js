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

test("payment validation keeps legacy records valid and rejects inconsistent received-payment records", () => {
  const [record] = sampleRequests(salon, "2099-02-20");
  const legacy = { ...record };
  delete legacy.payment;
  assert.equal(validateRequests([legacy]).length, 1);
  assert.equal(record.payment.status, "Pending");
  for (const change of [
    { amount: -1 },
    { amount: 1.001 },
    { status: "Verified by gateway" },
    { amount: 10 },
    { method: "Online", status: "Paid", amount: 10 },
    { method: "Unrecorded", status: "Paid", amount: 10 },
  ])
    assert.throws(() =>
      validateRequests([
        { ...record, payment: { ...record.payment, ...change } },
      ]),
    );
  assert.equal(
    validateRequests([
      {
        ...record,
        payment: {
          ...record.payment,
          method: "Cash",
          status: "Paid",
          amount: 50,
        },
      },
    ]).length,
    1,
  );
});
