// Demo inbound channel: replies typed in the Telegram demo chat become the buyer's replies on the deal most recently
// messaged there; Autopilot answers and its reply is delivered back to the chat. Only one listener per bot can run.
//   npm run telegram:poll
try { process.loadEnvFile(".env"); } catch { /* shell env is enough */ }

async function main() {
  const { tgGetUpdates, tgSendText, demoChatId, isTelegramConfigured } = await import("../src/lib/providers/telegram");
  const { receiveTelegramReply } = await import("../src/lib/vyapar/server/conversation");
  const { db } = await import("../src/lib/db");
  // Accept replies from the default demo chat and every demo contact's chat (priority 1, 2, …).
  const allowed = async () => new Set([demoChatId(), ...(await db.demoContact.findMany()).map((c) => c.telegramChatId).filter((x): x is string => Boolean(x))]);
  if (!isTelegramConfigured()) throw new Error("Set TELEGRAM_BOT_TOKEN and VYAPAR_TELEGRAM_CHAT_ID in .env");
  const chat = demoChatId();
  let offset = 0;
  console.log(`[telegram] listening for replies (default chat ${chat} + demo contacts)…`);
  for (;;) {
    try {
      const updates = await tgGetUpdates(offset);
      for (const u of updates) {
        offset = u.update_id + 1;
        const m = u.message;
        if (!m?.text || !(await allowed()).has(String(m.chat.id))) continue;
        const from = String(m.chat.id);
        if (m.text.startsWith("/")) { await tgSendText("Vyapar AI demo: reply here as the merchant (e.g. \"Bhaiya rate zyada hai\"). Your reply goes to the latest deal in the app.", from); continue; }
        const r = await receiveTelegramReply(m.text, from);
        if (!r) await tgSendText("No conversation yet. Send a pitch from the Vyapar AI app first.", from);
        console.log(`[telegram] "${m.text.slice(0, 60)}" → deal ${r?.dealId ?? "-"} · ${r?.understanding.intent ?? "-"}${r?.sent ? " · autopilot replied" : ""}`);
      }
    } catch (error) {
      console.warn(`[telegram] ${error instanceof Error ? error.message : error}`);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}
main();
export {};
