import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyReport } from "./reporting.js";
import { stampPayments } from "../../server/payments.js";
import { makeRequest } from "./store.js";
import { salon } from "../salon.config.js";

const request = () =>
  makeRequest(
    {
      name: "Reporting guest",
      phone: "+12025550147",
      service: "cut",
      branch: "garden",
      datetime: "2025-02-20T14:30",
    },
    salon,
  );
test("monthly collections use receipt dates, exclude samples, deduplicate completed clients and keep currencies separate", () => {
  const first = {
    ...request(),
    status: "Completed",
    payment: {
      currency: "USD",
      amount: 50,
      method: "Cash",
      entries: [
        { amount: 20, date: "2025-01-10", method: "Cash" },
        { amount: 30, date: "2025-02-10", method: "Online" },
      ],
    },
  };
  const second = {
    ...request(),
    status: "Completed",
    payment: { currency: "USD", amount: 10, method: "Cash" },
  };
  const other = {
    ...request(),
    phone: "2025550123",
    payment: {
      currency: "PKR",
      amount: 500,
      method: "Cash",
      receivedOn: "2025-02-11",
    },
    billing: undefined,
    status: "Cancelled",
  };
  const sample = { ...first, source: "Sample" };
  const report = monthlyReport([first, second, other, sample], "2025-02");
  assert.equal(report.visits, 2);
  assert.equal(report.clients, 1);
  assert.equal(report.booked, 3);
  assert.equal(report.cancelled, 1);
  const usd = report.currencies.find((item) => item.currency === "USD");
  assert.equal(usd.received, 30);
  assert.equal(usd.online, 30);
  assert.equal(usd.undated, 10);
  assert.equal(
    report.currencies.find((item) => item.currency === "PKR").received,
    500,
  );
  assert.equal(monthlyReport([first], "2025-01").currencies[0].received, 20);
});
test("partial receipts across months and later corrections are not double counted and metadata-only edits keep receipt dates", () => {
  const original = request();
  let incoming = structuredClone(original);
  incoming.payment = {
    ...incoming.payment,
    status: "Partial",
    method: "Cash",
    amount: 20,
    receivedOn: "2025-01-15",
  };
  let [saved] = stampPayments(
    [incoming],
    [original],
    "USD",
    "admin@example.test",
  );
  incoming = structuredClone(saved);
  incoming.payment = {
    ...incoming.payment,
    status: "Paid",
    method: "Online",
    amount: 55,
    receivedOn: "2025-02-15",
    reference: "BANK-1",
  };
  [saved] = stampPayments([incoming], [saved], "USD", "admin@example.test");
  assert.equal(saved.payment.entries.length, 2);
  assert.equal(monthlyReport([saved], "2025-01").currencies[0].received, 20);
  assert.equal(monthlyReport([saved], "2025-02").currencies[0].received, 35);
  incoming = structuredClone(saved);
  incoming.payment.notes = "Receipt checked";
  [saved] = stampPayments([incoming], [saved], "USD", "other@example.test");
  assert.equal(saved.payment.entries.length, 2);
  incoming = structuredClone(saved);
  incoming.payment.amount = 50;
  incoming.payment.status = "Partial";
  incoming.payment.receivedOn = "2025-03-15";
  [saved] = stampPayments([incoming], [saved], "USD", "admin@example.test");
  assert.equal(monthlyReport([saved], "2025-03").currencies[0].received, -5);
  const restored = stampPayments(
    [saved],
    [],
    "USD",
    "restorer@example.test",
  )[0];
  assert.equal(restored.payment.entries.length, 3);
  assert.ok(
    restored.payment.entries.every(
      (item) => item.imported && item.recordedBy === "restorer@example.test",
    ),
  );
});
test("legacy money stays undated until an admin supplies a date", () => {
  const old = request();
  delete old.billing;
  old.payment = { ...old.payment, method: "Cash", status: "Paid", amount: 55 };
  const saved = stampPayments(
    [structuredClone(old)],
    [old],
    "USD",
    "admin@example.test",
  )[0];
  assert.equal(monthlyReport([saved], "2025-01").currencies[0].received, 0);
  assert.equal(monthlyReport([saved], "2025-01").currencies[0].undated, 55);
  const changed = structuredClone(saved);
  changed.payment.receivedOn = "2025-01-10";
  const dated = stampPayments(
    [changed],
    [saved],
    "USD",
    "admin@example.test",
  )[0];
  assert.equal(monthlyReport([dated], "2025-01").currencies[0].received, 55);
});
