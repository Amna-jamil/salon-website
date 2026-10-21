import { api } from "../api.js";
import { salonDay } from "../pricing.js";
import { monthlyReport } from "./reporting.js";

export function mountReports(root, config) {
  const document = root.ownerDocument;
  root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">YOUR MONTH IN NUMBERS</p><h1>Clients & earnings.</h1><p>Track completed visits and payments received. Sample appointments are excluded.</p></div></div><section class="panel settings-panel"><div class="report-controls"><label class="field">Month<input type="month" id="report-month" value="${salonDay(config.timeZone).slice(0, 7)}" required></label><label class="field">Location<select id="report-branch"><option value="all">All locations</option></select></label><button class="btn btn-secondary" id="refresh-report" type="button">Refresh report</button><button class="btn btn-secondary" id="export-report" type="button" disabled>Export CSV</button></div><p id="report-feedback" role="status"></p><div id="report-results"></div></section>`;
  const branches = root.querySelector("#report-branch");
  config.branches.forEach((branch) => {
    const option = document.createElement("option");
    option.value = branch.id;
    option.textContent = branch.name;
    branches.append(option);
  });
  const results = root.querySelector("#report-results"),
    feedback = root.querySelector("#report-feedback");
  const refresh = root.querySelector("#refresh-report"),
    exportButton = root.querySelector("#export-report");
  let requests = [],
    current,
    loaded = false;
  const amount = (value, currency) =>
    new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency,
    }).format(value);
  function render() {
    if (!loaded) return;
    try {
      current = monthlyReport(
        requests,
        root.querySelector("#report-month").value,
        branches.value,
      );
      results.replaceChildren();
      const stats = document.createElement("div");
      stats.className = "report-stats";
      for (const [label, value] of [
        ["Unique clients served", current.clients],
        ["Completed visits", current.visits],
        ["Appointments", current.booked],
        ["Cancelled", current.cancelled],
      ]) {
        const card = document.createElement("div");
        const title = document.createElement("span"),
          number = document.createElement("strong");
        title.textContent = label;
        number.textContent = value;
        card.append(title, number);
        stats.append(card);
      }
      results.append(stats);
      if (current.unpriced) {
        const note = document.createElement("p");
        note.textContent = `${current.unpriced} older appointments have no saved currency. Their financial amounts are excluded until reviewed.`;
        results.append(note);
      }
      if (!current.currencies.length) {
        const empty = document.createElement("p");
        empty.textContent =
          "No recorded payments yet. Open an appointment to record a payment and its received date.";
        results.append(empty);
      }
      for (const item of current.currencies) {
        const section = document.createElement("section");
        section.className = "report-money";
        const title = document.createElement("h2");
        title.textContent = `${item.currency} · ${amount(item.received, item.currency)} received`;
        section.append(title);
        const dl = document.createElement("dl");
        dl.className = "detail-list";
        for (const [label, key] of [
          ["Cash", "cash"],
          ["Card / POS", "card"],
          ["Online", "online"],
          ["Negative adjustments included", "adjustments"],
          ["Discounts on this month's bookings", "discounts"],
          ["Outstanding on this month's bookings", "outstanding"],
        ]) {
          const row = document.createElement("div"),
            dt = document.createElement("dt"),
            dd = document.createElement("dd");
          dt.textContent = label;
          dd.textContent = amount(item[key], item.currency);
          row.append(dt, dd);
          dl.append(row);
        }
        section.append(dl);
        if (item.undated) {
          const note = document.createElement("p");
          note.textContent = `${amount(item.undated, item.currency)} in legacy payments has no received date and is excluded from monthly earnings. Open those appointments to add the date.`;
          section.append(note);
        }
        results.append(section);
      }
      const note = document.createElement("p");
      note.className = "helper-box";
      note.textContent = `Clients are unique phone numbers on Completed appointments in the selected month. Received payments use their payment dates in ${config.timeZone}, regardless of appointment date or cancellation. Totals are recorded collections, not profit. Currencies stay separate. Corrections can reduce a month's total.`;
      results.append(note);
      feedback.textContent = "";
      exportButton.disabled = false;
    } catch (error) {
      results.replaceChildren();
      feedback.textContent = error.message;
      exportButton.disabled = true;
    }
  }
  async function load() {
    loaded = false;
    results.replaceChildren();
    results.setAttribute("aria-busy", "true");
    refresh.disabled = true;
    exportButton.disabled = true;
    feedback.textContent = "Loading appointments and payments…";
    try {
      requests = (await api("/api/admin/appointments")).requests;
      loaded = true;
      refresh.textContent = "Refresh report";
      render();
    } catch (error) {
      feedback.textContent = error.message;
      refresh.textContent = "Retry report";
    } finally {
      refresh.disabled = false;
      results.setAttribute("aria-busy", "false");
    }
  }
  root.querySelector("#report-month").addEventListener("change", render);
  branches.addEventListener("change", render);
  refresh.addEventListener("click", load);
  exportButton.addEventListener("click", () => {
    const rows = [
      [
        "Month",
        "Location",
        "Currency",
        "Clients served",
        "Completed visits",
        "Appointments",
        "Cash",
        "Card",
        "Online",
        "Net received",
        "Discounts on bookings",
        "Outstanding on bookings",
        "Undated legacy payments",
      ],
      ...(current.currencies.length
        ? current.currencies
        : [
            {
              currency: "Not recorded",
              cash: 0,
              card: 0,
              online: 0,
              received: 0,
              discounts: 0,
              outstanding: 0,
              undated: 0,
            },
          ]
      ).map((item) => [
        current.month,
        branches.selectedOptions[0].textContent,
        item.currency,
        current.clients,
        current.visits,
        current.booked,
        item.cash,
        item.card,
        item.online,
        item.received,
        item.discounts,
        item.outstanding,
        item.undated,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map(
            (value) =>
              `"${(typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? "'" + value : String(value)).replaceAll('"', '""')}"`,
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `salon-report-${current.month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return load();
}
