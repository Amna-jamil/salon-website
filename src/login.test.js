import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { salon } from "./salon.config.js";

test("admin login uses shared salon data, has no sign-up and preserves fields on a failed login", async () => {
  const html = await readFile(
    new URL("../admin/login/index.html", import.meta.url),
    "utf8",
  );
  const source = (
    await readFile(new URL("./login.js", import.meta.url), "utf8")
  ).replace(/^import[\s\S]*?;\s*/gm, "");
  const dom = new JSDOM(html, {
    url: "http://localhost:5173/admin/login",
    runScripts: "outside-only",
  });
  let submitted;
  dom.window.api = async (path, options) => {
    if (path === "/api/salon") return { config: salon };
    submitted = options.body;
    throw new Error("Email or password was not accepted.");
  };
  await dom.window.eval(`(async () => {${source}\n})()`);
  const doc = dom.window.document;
  const form = doc.querySelector("#login-form");
  form.elements.email.value = "demo@example.test";
  form.elements.password.value = "Not-a-real-password";
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  assert.equal(form.querySelector("button").disabled, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(submitted.email, "demo@example.test");
  assert.equal(form.querySelector("button").disabled, false);
  assert.ok(
    doc.querySelector("#login-error").textContent.includes("not accepted"),
  );
  assert.equal(form.elements.email.value, "demo@example.test");
  assert.ok(
    doc.querySelector("#salon-login-name").textContent.includes(salon.name),
  );
  assert.equal(doc.querySelector("a").getAttribute("href"), "/");
  assert.equal(doc.querySelector('a[href*="signup"]'), null);
  dom.window.close();
});
