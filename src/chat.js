import { chatWhatsAppLink } from "./chat-links.js";
import { api } from "./api.js";
import "./chat.css";

export function mountChat(salon) {
  let conversation = null;
  let loaded = false;
  let busy = false;
  let interval;
  const root = document.createElement("aside");
  root.className = "customer-chat";
  root.setAttribute("aria-label", "Customer chat");
  root.innerHTML = `<button type="button" class="chat-launcher" aria-expanded="false" aria-controls="chat-panel">✧ <span>Chat with the salon</span></button><section class="chat-panel" id="chat-panel" aria-labelledby="chat-title" hidden><header><div><h2 id="chat-title">A little hello.</h2><p>Website chat · Replies appear here</p></div><button type="button" class="chat-close" aria-label="Close chat">×</button></header><p class="chat-intro">Send a message to the salon. You can check replies here in this browser. Responses may take time.</p><div class="chat-messages" role="log" aria-label="Conversation messages" aria-live="polite"></div><p class="chat-feedback" role="status"></p><button type="button" class="chat-retry" hidden>Try loading again</button><form class="chat-form"><div class="chat-identity"><label>Your name<input name="name" required maxlength="100" autocomplete="name"></label><label>Phone <small>(optional)</small><input name="phone" type="tel" maxlength="30" autocomplete="tel"></label></div><label>Your message<textarea name="message" rows="3" maxlength="2000" required placeholder="How can we help?"></textarea></label><button type="submit" class="chat-send">Send message</button></form><div class="chat-handoff" hidden><a target="_blank" rel="noopener noreferrer">Continue on WhatsApp ↗</a><p>WhatsApp opens separately. WhatsApp replies will not appear in this website chat.</p></div><p class="chat-privacy">Messages are saved for the salon. A private cookie keeps your conversation accessible in this browser for 30 days. Use a private device.</p></section>`;
  document.body.append(root);
  const panel = root.querySelector(".chat-panel");
  const launcher = root.querySelector(".chat-launcher");
  const form = root.querySelector("form");
  const feedback = root.querySelector(".chat-feedback");
  const retry = root.querySelector(".chat-retry");
  const messages = root.querySelector(".chat-messages");
  function drawMessages() {
    root.querySelector(".chat-identity").hidden = Boolean(conversation);
    form.elements.name.required = !conversation;
    if (conversation) {
      form.elements.name.value = conversation.name;
      form.elements.phone.value = conversation.phone;
    }
    const existing = messages.dataset.last;
    const last = String(conversation?.messages.at(-1)?.id || "");
    if (last !== existing || !messages.children.length) {
      messages.replaceChildren();
      if (!conversation?.messages.length) {
        const note = document.createElement("p");
        note.className = "chat-empty";
        note.textContent =
          "Tell us what you have in mind. Your first message starts a private website conversation.";
        messages.append(note);
      }
      for (const message of conversation?.messages || []) {
        const bubble = document.createElement("article");
        bubble.className = `chat-message chat-${message.sender}`;
        const label = document.createElement("strong");
        label.textContent = message.sender === "admin" ? salon.name : "You";
        const body = document.createElement("p");
        body.textContent = message.body;
        const time = document.createElement("time");
        time.dateTime = message.createdAt;
        time.textContent = new Intl.DateTimeFormat(salon.locale, {
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(message.createdAt));
        bubble.append(label, body, time);
        messages.append(bubble);
      }
      messages.dataset.last = last;
      messages.scrollTop = messages.scrollHeight;
    }
    const handoff = root.querySelector(".chat-handoff");
    const link = chatWhatsAppLink(salon, conversation);
    handoff.hidden = !conversation || !link;
    if (link) handoff.querySelector("a").href = link;
  }
  async function load(showProgress = false) {
    if (busy) return;
    if (showProgress) feedback.textContent = "Loading your conversation…";
    try {
      const result = await api("/api/chat/conversation");
      conversation = result.conversation;
      loaded = true;
      retry.hidden = true;
      feedback.textContent = "";
      drawMessages();
    } catch (error) {
      feedback.textContent = error.message;
      retry.hidden = false;
    }
  }
  async function toggle(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    clearInterval(interval);
    if (open) {
      if (!loaded) await load(true);
      else await load();
      if (!panel.hidden) {
        form.elements.message.focus();
        interval = setInterval(() => {
          if (!document.hidden) load();
        }, 6000);
      }
    } else launcher.focus();
  }
  launcher.addEventListener("click", () => toggle(panel.hidden));
  root
    .querySelector(".chat-close")
    .addEventListener("click", () => toggle(false));
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") toggle(false);
  });
  retry.addEventListener("click", () => load(true));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(form));
    if (!values.message.trim() || (!conversation && !values.name.trim())) {
      feedback.textContent = "Please add your name and a message.";
      return;
    }
    const button = form.querySelector(".chat-send");
    busy = true;
    button.disabled = true;
    button.textContent = "Sending…";
    feedback.textContent = "";
    try {
      if (!conversation) {
        const result = await api("/api/chat/conversations", {
          method: "POST",
          body: values,
        });
        conversation = result.conversation;
      } else {
        const result = await api(
          `/api/chat/conversations/${encodeURIComponent(conversation.id)}/messages`,
          { method: "POST", body: { message: values.message } },
        );
        conversation.messages = result.messages;
      }
      form.elements.message.value = "";
      loaded = true;
      drawMessages();
      feedback.textContent = "Message sent. The salon can reply here.";
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = "Send message";
    }
  });
  window.addEventListener("pagehide", () => clearInterval(interval), {
    once: true,
  });
}
