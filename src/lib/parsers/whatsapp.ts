export type WhatsAppMessage = { speaker: string; timestamp: string; text: string };

const android = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?\s*-\s*([^:]+):\s*(.*)$/i;
const ios = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?\]\s*([^:]+):\s*(.*)$/i;
const ignored = /end-to-end encrypted|<media omitted>|image omitted|this message was deleted|joined using this group's invite link/i;

export function parseWhatsApp(input: string) {
  const clean = input.replaceAll("\u202f", " ").replaceAll("\u200e", "");
  const lines = clean.split(/\r?\n/);
  const messages: WhatsAppMessage[] = [];
  for (const line of lines) {
    const match = line.match(android) ?? line.match(ios);
    if (match) {
      const [, day, month, rawYear, rawHour, minute, meridiem, speaker, text] = match;
      if (ignored.test(text)) continue;
      let hour = Number(rawHour);
      if (meridiem?.toLowerCase() === "pm" && hour < 12) hour += 12;
      if (meridiem?.toLowerCase() === "am" && hour === 12) hour = 0;
      const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
      const timestamp = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:00+05:30`).toISOString();
      messages.push({ speaker: speaker.trim(), timestamp, text: text.trim() });
    } else if (messages.length && line.trim() && !ignored.test(line)) {
      messages[messages.length - 1].text += `\n${line.trim()}`;
    }
  }
  return { messages, participants: [...new Set(messages.map((message) => message.speaker))] };
}
