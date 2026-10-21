import { test } from "node:test";
import assert from "node:assert/strict";
import { salon } from "./salon.config.js";
import {
  activeOffers,
  bookingBill,
  calculateBill,
  validateOffers,
} from "./pricing.js";

export const testOffer = {
  id: "offer-test",
  title: "Demo 20% off",
  description: "Illustrative offer",
  enabled: true,
  type: "Percent",
  value: 20,
  currency: "USD",
  serviceIds: ["cut"],
  branchIds: ["garden"],
  startDate: "",
  endDate: "",
};
test("offers enforce eligibility and discounts produce reproducible currency totals", () => {
  const config = { ...structuredClone(salon), offers: [testOffer] };
  validateOffers(config.offers, config);
  const values = {
    service: "cut",
    branch: "garden",
    datetime: "2099-02-20T14:30",
    offerId: testOffer.id,
  };
  const bill = bookingBill(values, config);
  assert.equal(bill.subtotal, 55);
  assert.equal(bill.discountAmount, 11);
  assert.equal(bill.total, 44);
  assert.equal(
    calculateBill(100, "PKR", { type: "Fixed", value: 25 }).total,
    75,
  );
  assert.equal(
    calculateBill(100, "PKR", { type: "Percent", value: 100 }).total,
    0,
  );
  assert.throws(() =>
    calculateBill(100, "PKR", { type: "Percent", value: 101 }),
  );
  assert.throws(() => calculateBill(100, "PKR", { type: "Fixed", value: 101 }));
  assert.throws(
    () => bookingBill({ ...values, service: "color" }, config),
    /does not apply/,
  );
  config.offers[0] = { ...testOffer, enabled: false };
  assert.equal(activeOffers(config).length, 0);
  assert.throws(() => bookingBill(values, config), /does not apply/);
  assert.throws(() => validateOffers([{ ...testOffer, value: 120 }], config));
  assert.throws(() =>
    validateOffers([{ ...testOffer, startDate: "2026-02-30" }], config),
  );
});
