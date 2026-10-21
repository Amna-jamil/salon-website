import { calculateBill } from "../pricing.js";

export function monthlyReport(requests, month, branch = "all") {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Choose a valid month.");
  const records = requests.filter(
    (item) =>
      item.source !== "Sample" &&
      (branch === "all" || item.branchId === branch),
  );
  const appointments = records.filter((item) =>
    item.datetime.startsWith(month),
  );
  const visited = appointments.filter((item) => item.status === "Completed");
  const clients = new Set(
    visited.map(
      (item) => item.phone.replace(/\D/g, "").replace(/^00/, "") || item.id,
    ),
  );
  const currencies = new Map();
  const group = (currency) => {
    if (!currencies.has(currency))
      currencies.set(currency, {
        currency,
        received: 0,
        cash: 0,
        card: 0,
        online: 0,
        adjustments: 0,
        discounts: 0,
        outstanding: 0,
        undated: 0,
      });
    return currencies.get(currency);
  };
  for (const item of records) {
    const payment = item.payment;
    if (!payment) continue;
    const bucket = group(payment.currency);
    const entries =
      Array.isArray(payment.entries) && payment.entries.length
        ? payment.entries
        : payment.amount > 0
          ? [
              {
                amount: payment.amount,
                method: payment.method,
                date: payment.receivedOn || "",
              },
            ]
          : [];
    for (const receipt of entries) {
      if (!receipt.date) {
        bucket.undated += receipt.amount;
        continue;
      }
      if (!receipt.date.startsWith(month)) continue;
      bucket.received += receipt.amount;
      if (receipt.method === "Cash") bucket.cash += receipt.amount;
      if (receipt.method === "Card") bucket.card += receipt.amount;
      if (receipt.method === "Online") bucket.online += receipt.amount;
      if (receipt.amount < 0) bucket.adjustments += receipt.amount;
    }
  }
  for (const item of appointments.filter(
    (record) => record.status !== "Cancelled",
  )) {
    const currency = item.billing?.currency || item.payment?.currency;
    if (!currency) continue;
    const bill = item.billing || calculateBill(item.price, currency);
    const bucket = group(currency);
    bucket.outstanding += Math.max(0, bill.total - (item.payment?.amount || 0));
    bucket.discounts += bill.discountAmount;
  }
  return {
    month,
    booked: appointments.length,
    cancelled: appointments.filter((item) => item.status === "Cancelled")
      .length,
    visits: visited.length,
    clients: clients.size,
    unpriced: appointments.filter(
      (item) => !item.billing?.currency && !item.payment?.currency,
    ).length,
    currencies: [...currencies.values()].map((item) =>
      Object.fromEntries(
        Object.entries(item).map(([key, value]) => [
          key,
          typeof value === "number" ? Math.round(value * 100) / 100 : value,
        ]),
      ),
    ),
  };
}
