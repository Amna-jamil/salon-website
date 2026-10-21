import "../chat.css";
import { api } from "../api.js";
import { chatWhatsAppLink } from "../chat-links.js";

export function mountAdminChat(root, salon) {
  let selected = null;
  let busy = false;
  let conversations = [];
  let interval;
  root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">CUSTOMER CONVERSATIONS</p><h1>A little hello, thoughtfully answered.</h1><p>Reply to website messages. WhatsApp conversations stay in WhatsApp.</p></div><button class="btn btn-secondary" id="refresh-conversations">Refresh inbox</button></div><p class="chat-admin-feedback" role="status"></p><div class="portal-chat-layout"><section class="panel conversation-list" aria-label="Conversations"><p class="chat-loading">Loading conversations…</p></section><section class="panel conversation-thread" aria-label="Selected conversation"><div class="empty-state"><h2>Make room for a conversation.</h2><p>Select a guest to read their messages and reply.</p></div></section></div>`;
  const feedback = root.querySelector(".chat-admin-feedback");
  const list = root.querySelector(".conversation-list");
  const thread = root.querySelector(".conversation-thread");
  function renderList() {
    list.replaceChildren();
    if (!conversations.length) {
      list.innerHTML =
        '<div class="empty-state"><h2>Your first hello is on its way.</h2><p>Website messages will appear here when visitors start a chat.</p></div>';
      return;
    }
    for (const conversation of conversations) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `conversation-list-item ${selected?.id === conversation.id ? "active" : ""}`;
      const name = document.createElement("strong");
      name.textContent = conversation.name;
      const preview = document.createElement("p");
      preview.textContent = conversation.lastMessage;
      const meta = document.createElement("small");
      meta.textContent = `Website chat${conversation.unread ? ` · ${conversation.unread} unread` : ""}`;
      button.append(name, preview, meta);
      button.addEventListener("click", () => select(conversation.id));
      list.append(button);
    }
  }
  function renderMessages(messages) {
    const log = thread.querySelector(".portal-messages");
    if (!log || log.dataset.last === String(messages.at(-1)?.id || "")) return;
    log.replaceChildren();
    for (const message of messages) {
      const item = document.createElement("article");
      item.className = `chat-message chat-${message.sender}`;
      const who = document.createElement("strong");
      who.textContent =
        message.sender === "admin" ? "Salon team" : selected.name;
      const body = document.createElement("p");
      body.textContent = message.body;
      const time = document.createElement("time");
      time.dateTime = message.createdAt;
      time.textContent = new Intl.DateTimeFormat(salon.locale, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(message.createdAt));
      item.append(who, body, time);
      log.append(item);
    }
    log.dataset.last = String(messages.at(-1)?.id || "");
    log.scrollTop = log.scrollHeight;
  }
  async function select(id) {
    if (busy) return;
    const draft = thread.querySelector("textarea")?.value.trim();
    if (
      draft &&
      selected?.id !== id &&
      !window.confirm("Discard the unsent reply and open this conversation?")
    )
      return;
    feedback.textContent = "Loading conversation…";
    try {
      const { conversation } = await api(
        `/api/admin/conversations/${encodeURIComponent(id)}`,
      );
      selected = conversation;
      thread.innerHTML = `<div class="panel-heading"><div><h2 class="guest-name"></h2><p class="guest-contact"></p></div><span class="status status-confirmed">Website chat</span></div><div class="portal-messages" role="log" aria-live="polite" aria-label="Conversation messages"></div><form class="portal-reply"><label for="admin-reply">Reply on the website</label><textarea id="admin-reply" name="message" maxlength="2000" rows="3" required></textarea><p class="form-error" role="alert"></p><button class="btn" type="submit">Send website reply</button></form><div class="portal-handoff"><a class="subtle-link" target="_blank" rel="noopener noreferrer">Continue on WhatsApp ↗</a><p>Opens the salon’s configured WhatsApp contact with context. WhatsApp replies are not synced here.</p></div>`;
      thread.querySelector(".guest-name").textContent = conversation.name;
      thread.querySelector(".guest-contact").textContent =
        conversation.phone || "No phone provided";
      const wa = chatWhatsAppLink(salon, conversation);
      thread.querySelector(".portal-handoff").hidden = !wa;
      if (wa) thread.querySelector(".portal-handoff a").href = wa;
      renderMessages(conversation.messages);
      renderList();
      feedback.textContent = "";
      thread.querySelector("form").addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const message = form.elements.message.value.trim();
        if (!message) return;
        busy = true;
        const button = form.querySelector("button");
        button.disabled = true;
        button.textContent = "Sending…";
        form.querySelector(".form-error").textContent = "";
        try {
          const result = await api(
            `/api/admin/conversations/${encodeURIComponent(selected.id)}/messages`,
            { method: "POST", body: { message } },
          );
          selected.messages = result.messages;
          renderMessages(result.messages);
          form.elements.message.value = "";
          feedback.textContent = "Reply sent to the website conversation.";
          thread.querySelector(".portal-handoff a").href = chatWhatsAppLink(
            salon,
            selected,
          );
        } catch (error) {
          form.querySelector(".form-error").textContent = error.message;
        } finally {
          busy = false;
          button.disabled = false;
          button.textContent = "Send website reply";
        }
      });
    } catch (error) {
      feedback.textContent = error.message;
    }
  }
  async function refresh() {
    if (!root.isConnected) {
      clearInterval(interval);
      return;
    }
    if (busy || document.hidden) return;
    try {
      const result = await api("/api/admin/conversations");
      conversations = result.conversations;
      renderList();
      if (selected) {
        const current = selected.id;
        const result = await api(
          `/api/admin/conversations/${encodeURIComponent(current)}`,
        );
        if (selected.id === current) {
          selected = result.conversation;
          renderMessages(selected.messages);
        }
      }
    } catch (error) {
      feedback.textContent = `${error.message} Use Refresh inbox to retry.`;
    }
  }
  root
    .querySelector("#refresh-conversations")
    .addEventListener("click", async () => {
      feedback.textContent = "Refreshing…";
      await refresh();
      if (feedback.textContent === "Refreshing…")
        feedback.textContent = "Inbox updated.";
    });
  refresh();
  interval = setInterval(refresh, 6000);
  window.addEventListener("pagehide", () => clearInterval(interval), {
    once: true,
  });
}
