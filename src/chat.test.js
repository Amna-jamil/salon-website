import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { salon } from "./salon.config.js";
import { chatWhatsAppLink } from "./chat-links.js";
const source = (await readFile(new URL("./chat.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?;\s*/gm, "")
  .replaceAll("export function", "function");
const adminSource = (
  await readFile(new URL("./admin/chat.js", import.meta.url), "utf8")
)
  .replace(/^import[\s\S]*?;\s*/gm, "")
  .replaceAll("export function", "function");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const message = (id, sender, body) => ({
  id,
  sender,
  body,
  createdAt: new Date().toISOString(),
});

test("WhatsApp handoff uses the configured number, customer name and conversation context", () => {
  const conversation = {
    id: "portal-test",
    name: "Demo & Guest",
    messages: [
      message(1, "customer", "Can I book hair & makeup?"),
      message(2, "admin", "What day would you prefer?"),
    ],
  };
  const url = new URL(chatWhatsAppLink(salon, conversation));
  assert.equal(url.hostname, "wa.me");
  assert.equal(url.pathname, `/${salon.contact.whatsappNumber}`);
  const text = url.searchParams.get("text");
  for (const value of [
    "Demo & Guest",
    "portal-test",
    "hair & makeup",
    "What day",
  ])
    assert.ok(text.includes(value));
  assert.equal(
    chatWhatsAppLink(
      { ...salon, contact: { ...salon.contact, whatsappNumber: "" } },
      conversation,
    ),
    "",
  );
});

test("customer chat sends messages, displays portal replies, escapes text and explains WhatsApp handoff", async () => {
  const dom = new JSDOM("<body></body>", {
    url: "http://localhost:5173",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  let conversation = null;
  Object.assign(dom.window, {
    salon,
    chatWhatsAppLink,
    api: async (path, options) => {
      if (path === "/api/chat/conversation")
        return { conversation: structuredClone(conversation) };
      conversation = {
        id: "portal-test",
        name: options.body.name,
        phone: "",
        messages: [message(1, "customer", options.body.message)],
      };
      return { conversation: structuredClone(conversation) };
    },
  });
  dom.window.eval(`${source}\nmountChat(salon);`);
  const doc = dom.window.document;
  doc.querySelector(".chat-launcher").click();
  await tick();
  const form = doc.querySelector(".chat-form");
  form.elements.name.value = "Demo guest";
  form.elements.message.value = "<img src=x onerror=alert(1)>";
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await tick();
  assert.equal(doc.querySelectorAll(".chat-message").length, 1);
  assert.equal(doc.querySelector(".chat-messages img"), null);
  assert.ok(
    doc
      .querySelector(".chat-handoff p")
      .textContent.includes("will not appear"),
  );
  assert.ok(
    new URL(doc.querySelector(".chat-handoff a").href).searchParams
      .get("text")
      .includes("Demo guest"),
  );
  conversation.messages.push(message(2, "admin", "Hello from the salon."));
  doc.querySelector(".chat-close").click();
  doc.querySelector(".chat-launcher").click();
  await tick();
  assert.ok(
    doc
      .querySelector(".chat-admin")
      .textContent.includes("Hello from the salon."),
  );
  dom.window.close();
});

test("chat send failure preserves the draft and re-enables retry", async () => {
  const dom = new JSDOM("<body></body>", {
    url: "http://localhost:5173",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  Object.assign(dom.window, {
    salon,
    chatWhatsAppLink,
    api: async (path) => {
      if (path === "/api/chat/conversation") return { conversation: null };
      throw new Error("Connection lost. Try again.");
    },
  });
  dom.window.eval(`${source}\nmountChat(salon);`);
  const doc = dom.window.document;
  doc.querySelector(".chat-launcher").click();
  await tick();
  const form = doc.querySelector(".chat-form");
  form.elements.name.value = "Demo guest";
  form.elements.message.value = "Please keep this draft.";
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await tick();
  assert.equal(form.elements.message.value, "Please keep this draft.");
  assert.equal(doc.querySelector(".chat-send").disabled, false);
  assert.ok(
    doc.querySelector(".chat-feedback").textContent.includes("Connection lost"),
  );
  dom.window.close();
});

test("admin conversation UI reads messages and sends website replies without pretending WhatsApp sync", async () => {
  const dom = new JSDOM('<body><section id="root"></section></body>', {
    url: "http://localhost:5173/admin/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const conversation = {
    id: "portal-test",
    name: "Demo chat guest",
    phone: "",
    messages: [message(1, "customer", "Can you help?")],
  };
  Object.assign(dom.window, {
    salon,
    chatWhatsAppLink,
    api: async (path, options) => {
      if (path === "/api/admin/conversations")
        return {
          conversations: [
            {
              id: conversation.id,
              name: conversation.name,
              unread: 1,
              lastMessage: "Can you help?",
            },
          ],
        };
      if (options?.method === "POST") {
        conversation.messages.push(message(2, "admin", options.body.message));
        return { messages: structuredClone(conversation.messages) };
      }
      return { conversation: structuredClone(conversation) };
    },
  });
  dom.window.eval(
    `${adminSource}\nmountAdminChat(document.querySelector('#root'), salon);`,
  );
  await tick();
  const doc = dom.window.document;
  doc.querySelector(".conversation-list-item").click();
  await tick();
  const form = doc.querySelector(".portal-reply");
  form.elements.message.value = "Happy to help.";
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await tick();
  assert.ok(
    doc
      .querySelector(".portal-messages")
      .textContent.includes("Happy to help."),
  );
  assert.ok(
    doc
      .querySelector(".portal-handoff")
      .textContent.includes("not synced here"),
  );
  dom.window.close();
});
