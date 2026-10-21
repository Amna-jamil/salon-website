import { validDay, validMoney } from "../pricing.js";
export const PAYMENT_METHODS = ["Unrecorded", "Cash", "Card", "Online"];
export const PAYMENT_STATUSES = ["Pending", "Partial", "Paid"];

export function paymentRecord(request, currency) {
  return (
    request.payment || {
      method: "Unrecorded",
      status: "Pending",
      amount: 0,
      currency: currency.toUpperCase(),
      reference: "",
      notes: "",
      updatedAt: "",
      updatedBy: "",
    }
  );
}

export function validatePayment(payment, { allowZeroPaid = false } = {}) {
  if (
    !payment ||
    typeof payment !== "object" ||
    Array.isArray(payment) ||
    !PAYMENT_METHODS.includes(payment.method) ||
    !PAYMENT_STATUSES.includes(payment.status) ||
    !Number.isFinite(payment.amount) ||
    payment.amount < 0 ||
    payment.amount > 1000000000 ||
    Math.abs(payment.amount * 100 - Math.round(payment.amount * 100)) >
      0.00001 ||
    !/^[A-Z]{3}$/.test(payment.currency) ||
    !["reference", "notes", "updatedAt", "updatedBy"].every(
      (key) => typeof payment[key] === "string",
    ) ||
    payment.reference.length > 120 ||
    payment.notes.length > 500 ||
    payment.updatedBy.length > 254 ||
    (payment.updatedAt !== "" &&
      (!/^\d{4}-\d{2}-\d{2}T/.test(payment.updatedAt) ||
        !Number.isFinite(Date.parse(payment.updatedAt))))
  )
    throw new Error(
      "Enter valid payment details, currency and an amount with up to two decimal places.",
    );
  if (payment.status === "Pending" && payment.amount !== 0)
    throw new Error(
      "Pending payments must have zero received. Use Partial or Paid after receiving money.",
    );
  if (
    payment.status !== "Pending" &&
    ((payment.amount <= 0 && !(allowZeroPaid && payment.status === "Paid")) ||
      (payment.method === "Unrecorded" && payment.amount > 0))
  )
    throw new Error(
      "Choose a payment method and enter the amount received for a Partial or Paid payment.",
    );
  if (
    payment.method === "Online" &&
    payment.status !== "Pending" &&
    !payment.reference.trim()
  )
    throw new Error(
      "Add a transaction or receipt reference for a received online payment.",
    );
  if (
    payment.receivedOn !== undefined &&
    payment.receivedOn !== "" &&
    !validDay(payment.receivedOn)
  )
    throw new Error("Enter a valid payment received date.");
  if (payment.entries !== undefined) {
    if (
      !Array.isArray(payment.entries) ||
      payment.entries.length > 200 ||
      !payment.entries.every(
        (entry) =>
          entry &&
          validMoney(Math.abs(entry.amount)) &&
          ["Cash", "Card", "Online"].includes(entry.method) &&
          entry.currency === payment.currency &&
          (entry.date === "" || validDay(entry.date)) &&
          typeof entry.reference === "string" &&
          entry.reference.length <= 120,
      )
    )
      throw new Error(
        "The payment history contains invalid receipts or adjustments.",
      );
  }
  return payment;
}
