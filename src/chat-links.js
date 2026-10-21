export function chatWhatsAppLink(salon, conversation, draft = "") {
  const number = salon.contact.whatsappNumber.replace(/\D/g, "");
  if (!number) return "";
  const context =
    conversation?.messages
      .slice(-6)
      .map(
        (message) =>
          `${message.sender === "admin" ? salon.name : "Me"}: ${message.body}`,
      )
      .join("\n") || draft;
  const message = `Hello ${salon.name}, my name is ${conversation?.name || "a website visitor"}. I would like to continue my website conversation on WhatsApp.${conversation?.id ? `\nConversation: ${conversation.id}` : ""}\n${context}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message.slice(0, 6000))}`;
}
