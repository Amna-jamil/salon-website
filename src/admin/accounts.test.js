import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const source = (
  await readFile(new URL("./accounts.js", import.meta.url), "utf8")
)
  .replace(/^import .*;$/gm, "")
  .replace("export function", "function");
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function fixture() {
  const dom = new JSDOM('<div id="root"></div>', {
    runScripts: "outside-only",
  });
  let failure = "",
    loadFailure = "",
    submitted,
    calls = 0;
  dom.window.api = async (path, options) => {
    assert.equal(path, "/api/admin/accounts");
    if (!options) {
      if (loadFailure) throw new Error(loadFailure);
      return {
        accounts: [
          { id: "owner", email: "owner@example.test", role: "superadmin" },
        ],
      };
    }
    calls++;
    submitted = options.body;
    if (failure) throw new Error(failure);
    return { user: { id: "new", email: options.body.email, role: "admin" } };
  };
  const mount = dom.window.eval(`${source}\nmountAdminAccounts`);
  await mount(dom.window.document.querySelector("#root"));
  return {
    dom,
    doc: dom.window.document,
    calls: () => calls,
    submitted: () => submitted,
    fail: (value) => {
      failure = value;
    },
    failLoad: (value) => {
      loadFailure = value;
    },
  };
}

test("Add Admin validates passwords, saves only email and password, clears secrets and shows the new admin", async () => {
  const { dom, doc, calls, submitted } = await fixture();
  try {
    const form = doc.querySelector("form");
    assert.match(doc.querySelector(".accounts-list").textContent, /Superadmin/);
    form.elements.email.value = "new@example.test";
    form.elements.password.value = "new-admin-password";
    form.elements.confirmPassword.value = "does-not-match";
    const submit = () =>
      form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    submit();
    await tick();
    assert.match(doc.querySelector(".form-error").textContent, /do not match/);
    assert.equal(calls(), 0);
    form.elements.confirmPassword.value = "new-admin-password";
    submit();
    assert.equal(form.querySelector("button").disabled, true);
    await tick();
    assert.deepEqual(Object.keys(submitted()).sort(), ["email", "password"]);
    assert.equal(form.elements.password.value, "");
    assert.equal(form.elements.confirmPassword.value, "");
    assert.match(
      doc.querySelector(".account-success").textContent,
      /new@example.test/,
    );
    assert.ok(
      doc
        .querySelector(".accounts-list")
        .textContent.includes("new@example.test"),
    );
    assert.equal(form.querySelector("button").disabled, false);
    assert.ok(
      !doc
        .querySelector(".account-success")
        .textContent.includes("new-admin-password"),
    );
  } finally {
    dom.window.close();
  }
});

test("account creation and list loading failures display retry states without losing the form draft", async () => {
  const { dom, doc, fail, failLoad } = await fixture();
  try {
    const form = doc.querySelector("form");
    form.elements.email.value = "duplicate@example.test";
    form.elements.password.value = form.elements.confirmPassword.value =
      "new-admin-password";
    fail("An account already exists with this email.");
    form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    await tick();
    assert.match(
      doc.querySelector(".form-error").textContent,
      /already exists/,
    );
    assert.equal(form.elements.email.value, "duplicate@example.test");
    assert.equal(form.querySelector("button").disabled, false);
    failLoad("Unable to load accounts.");
    doc.querySelector("#reload-accounts").click();
    await tick();
    assert.match(
      doc.querySelector("#accounts-feedback").textContent,
      /Unable to load/,
    );
    assert.match(doc.querySelector("#reload-accounts").textContent, /Retry/);
    failLoad("");
    doc.querySelector("#reload-accounts").click();
    await tick();
    assert.equal(doc.querySelector("#accounts-feedback").textContent, "");
  } finally {
    dom.window.close();
  }
});
