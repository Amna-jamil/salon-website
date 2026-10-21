import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { salon } from "../salon.config.js";
import { salonDay } from "../pricing.js";
import { monthlyReport } from "./reporting.js";
import { makeRequest } from "./store.js";
const source = (
  await readFile(new URL("./reports.js", import.meta.url), "utf8")
)
  .replace(/^import .*;$/gm, "")
  .replace("export function", "function");
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("monthly report loads real records, filters months, exports CSV and recovers from load failures", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    runScripts: "outside-only",
  });
  let failure = "",
    csv,
    filename;
  const record = {
    ...makeRequest(
      {
        name: "Report guest",
        phone: "2025550147",
        service: "cut",
        branch: "garden",
        datetime: "2025-02-20T14:30",
      },
      salon,
    ),
    status: "Completed",
  };
  record.payment = {
    ...record.payment,
    method: "Cash",
    amount: 55,
    status: "Paid",
    receivedOn: "2025-02-10",
  };
  Object.assign(dom.window, {
    monthlyReport,
    salonDay,
    Blob,
    api: async () => {
      if (failure) throw new Error(failure);
      return { requests: [record] };
    },
  });
  dom.window.URL.createObjectURL = (blob) => {
    csv = blob;
    return "blob:test";
  };
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () {
    filename = this.download;
  };
  try {
    const mount = dom.window.eval(`${source}\nmountReports`);
    await mount(dom.window.document.querySelector("#root"), salon);
    const doc = dom.window.document,
      month = doc.querySelector("#report-month");
    month.value = "2025-02";
    month.dispatchEvent(new dom.window.Event("change"));
    assert.equal(doc.querySelector(".report-stats strong").textContent, "1");
    assert.match(doc.querySelector(".report-money h2").textContent, /55/);
    doc.querySelector("#export-report").click();
    assert.equal(filename, "salon-report-2025-02.csv");
    assert.match(await csv.text(), /2025-02/);
    failure = "Temporary report failure";
    doc.querySelector("#refresh-report").click();
    await tick();
    assert.match(
      doc.querySelector("#report-feedback").textContent,
      /Temporary report failure/,
    );
    assert.equal(doc.querySelector("#export-report").disabled, true);
    failure = "";
    doc.querySelector("#refresh-report").click();
    await tick();
    assert.equal(doc.querySelector("#export-report").disabled, false);
  } finally {
    dom.window.close();
  }
});
