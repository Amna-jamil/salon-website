import { isDeepStrictEqual } from "node:util";
import { paymentRecord } from "../src/admin/payments.js";
import { calculateBill, salonDay, validDay } from "../src/pricing.js";
import { randomUUID } from "node:crypto";

// Audit identity and timestamps always come from the authenticated server.
// Old clients/backups cannot silently erase an existing payment record.
export function stampPayments(
  incoming,
  current,
  currency,
  adminEmail,
  timeZone = "UTC",
) {
  const previous = new Map(current.map((item) => [item.id, item]));
  return incoming.map((item) => {
    const old = previous.get(item.id);
    const billing =
      item.billing ||
      old?.billing ||
      calculateBill(item.price, old?.payment?.currency || currency);
    if (!item.payment)
      return old?.payment
        ? { ...item, billing, payment: old.payment }
        : { ...item, billing };
    const payment = {
      method: item.payment.method,
      status: item.payment.status,
      amount: item.payment.amount,
      currency: item.payment.currency,
      reference: item.payment.reference.trim(),
      notes: item.payment.notes.trim(),
      receivedOn: item.payment.receivedOn || old?.payment?.receivedOn || "",
    };
    const before = paymentRecord(old || {}, currency);
    if (billing.currency !== payment.currency)
      throw Object.assign(
        new Error("Bill and payment must use the same currency."),
        { status: 400 },
      );
    if (
      item.billing &&
      (payment.amount > billing.total ||
        (payment.status === "Paid" && payment.amount !== billing.total) ||
        (payment.status === "Partial" && payment.amount >= billing.total))
    )
      throw Object.assign(
        new Error(
          "Check the amount received: Paid must match the final bill; Partial must be less than it.",
        ),
        { status: 400 },
      );
    const today = salonDay(timeZone);
    if (
      payment.receivedOn &&
      (!validDay(payment.receivedOn) || payment.receivedOn > today)
    )
      throw Object.assign(
        new Error("Use a valid payment date no later than today."),
        { status: 400 },
      );
    const restoring = !old && item.payment.entries?.length;
    if (
      restoring &&
      (Math.round(
        item.payment.entries.reduce((sum, receipt) => sum + receipt.amount, 0) *
          100,
      ) /
        100 !==
        payment.amount ||
        item.payment.entries.some(
          (receipt) => receipt.date && receipt.date > today,
        ))
    )
      throw Object.assign(
        new Error(
          "The imported payment history must match the amount received and cannot have future receipt dates.",
        ),
        { status: 400 },
      );
    const entries = restoring
      ? item.payment.entries.map((receipt) => ({
          id: randomUUID(),
          amount: receipt.amount,
          method: receipt.method,
          date: receipt.date,
          currency: receipt.currency,
          reference: receipt.reference,
          recordedBy: adminEmail,
          recordedAt: new Date().toISOString(),
          imported: true,
        }))
      : Array.isArray(before.entries)
        ? structuredClone(before.entries)
        : [];
    if (
      payment.amount === before.amount &&
      payment.receivedOn &&
      payment.receivedOn !== (before.receivedOn || "")
    ) {
      for (const receipt of entries)
        if (!receipt.date) {
          receipt.date = payment.receivedOn;
          receipt.datedBy = adminEmail;
          receipt.datedAt = new Date().toISOString();
        }
    }
    const entry = (amount, method, date) => ({
      id: randomUUID(),
      amount,
      method,
      date,
      currency: payment.currency,
      reference: payment.reference,
      recordedAt: new Date().toISOString(),
      recordedBy: adminEmail,
    });
    if (!entries.length && before.amount > 0)
      entries.push(
        entry(
          before.amount,
          before.method,
          before.receivedOn ||
            (before.amount === payment.amount ? payment.receivedOn : ""),
        ),
      );
    const delta = Math.round((payment.amount - before.amount) * 100) / 100;
    if (!restoring && delta !== 0) {
      payment.receivedOn ||= today;
      entries.push(
        entry(
          delta,
          payment.method === "Unrecorded" ? before.method : payment.method,
          payment.receivedOn,
        ),
      );
    } else if (
      !restoring &&
      payment.amount > 0 &&
      payment.method !== before.method
    ) {
      payment.receivedOn ||= today;
      entries.push(
        entry(-before.amount, before.method, payment.receivedOn),
        entry(payment.amount, payment.method, payment.receivedOn),
      );
    }
    if (entries.length > 200)
      throw Object.assign(
        new Error(
          "This payment has reached the 200-record limit. Export its records before further changes.",
        ),
        { status: 400 },
      );
    payment.entries = entries;
    if (old?.payment && payment.currency !== before.currency)
      throw Object.assign(
        new Error(
          "An existing appointment's payment currency cannot be changed.",
        ),
        { status: 400 },
      );
    const core = (value) =>
      Object.fromEntries(
        [
          "method",
          "status",
          "amount",
          "currency",
          "reference",
          "notes",
          "receivedOn",
        ].map((key) => [
          key,
          key === "receivedOn" ? value[key] || "" : value[key],
        ]),
      );
    if (isDeepStrictEqual(core(payment), core(before))) {
      payment.updatedAt = old?.payment?.updatedAt || "";
      payment.updatedBy = old?.payment?.updatedBy || "";
    } else {
      payment.updatedAt = new Date().toISOString();
      payment.updatedBy = adminEmail;
    }
    return { ...item, billing, payment };
  });
}
