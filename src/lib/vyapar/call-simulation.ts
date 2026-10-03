// Realistic simulated Sarvam call results (full transcript), ported from the teammate's vyapar-integration branch.
// The payload goes through the same processSarvamWebhook path as a live call.
import type { AgentVariables, SarvamOutboundWebhook } from "@/lib/providers/sarvam-agent";
export type Scenario = "objection" | "sample" | "callback" | "no_answer";
export function buildPayload(attemptId: string, scenario: Scenario, v: Partial<AgentVariables>): SarvamOutboundWebhook {
  const owner = (v.owner_name ?? "Karan").split(" ")[0];
  const biz = v.seller_business ?? "EcoPack Solutions";
  const seller = (v.seller_name ?? "Rahul").split(" ")[0];
  const km = v.distance_km ?? "2";
  const price = v.price ?? "₹5 per bag";
  const base = {
    attempt_id: attemptId,
    channel_info: { channel_type: "v2v", channel_provider: "exotel" },
    webhook_config: { url: "http://localhost:3000/api/vyapar/webhooks/sarvam", metadata: { simulated: true } },
  };
  if (scenario === "no_answer") {
    return { ...base, status: "no_answer", duration: null, interaction_id: null, failure_reason: null, final_agent_variables: null, interaction_transcript: null };
  }
  const opener = { role: "agent", en_text: `Namaste ${owner} ji, I'm calling from ${biz} on behalf of ${seller} ji. We are just ${km} km from your shop. ${v.rating_hook ? `${v.rating_hook} — ` : ""}Do you have one minute?` };
  const interaction_id = `sim/${attemptId}`;
  if (scenario === "objection") {
    return {
      ...base, status: "connected", duration: 58.4, interaction_id, failure_reason: null,
      interaction_transcript: [
        opener,
        { role: "user", en_text: "Yes, tell me, what is this about? I'm a little busy with the morning rush." },
        { role: "agent", en_text: `We make strong paper bags, ${price}, and we would like to give you ${v.offer ?? "a free sample pack"}.` },
        { role: "user", en_text: "Five rupees is too much, brother. My current supplier gives me cheaper. And I only buy in bulk, not in small lots." },
        { role: "agent", en_text: "Understood ji. If the price works for you in bulk, would you at least like to see a sample?" },
        { role: "user", en_text: "Not now. At this price it won't work. If you get a better bulk rate, call me again." },
        { role: "agent", en_text: `Sure ${owner} ji, I'll speak to ${seller} ji about a bulk rate. Thank you for your time!` },
      ],
      final_agent_variables: { ...v, outcome: "objection", objection_type: "price", objection_quote: "Five rupees is too much, I only buy in bulk", callback_time: "" },
    };
  }
  if (scenario === "callback") {
    return {
      ...base, status: "connected", duration: 21.7, interaction_id, failure_reason: null,
      interaction_transcript: [
        opener,
        { role: "user", en_text: "Brother, it's very busy right now. Call me in the evening after 6." },
        { role: "agent", en_text: `No problem ${owner} ji, I'll call you after 6 pm. Thank you!` },
      ],
      final_agent_variables: { ...v, outcome: "callback", objection_type: "timing", objection_quote: "Call me in the evening after 6", callback_time: "today after 6 pm" },
    };
  }
  const counter = v.counter_offer || price;
  return {
    ...base, status: "connected", duration: 64.2, interaction_id, failure_reason: null,
    interaction_transcript: [
      { role: "agent", en_text: `Namaste ${owner} ji, ${biz} here, calling for ${seller} ji. ${v.past_objections ? "Last time you told us the price was high — we remembered that. " : ""}We have a new offer: ${counter}.` },
      { role: "user", en_text: "Oh, you remembered! Okay, that rate sounds reasonable." },
      { role: "agent", en_text: `Shall I send you ${v.offer ?? "a free sample pack"} first so you can check the quality?` },
      { role: "user", en_text: "Yes, send the sample. If the quality is good I'll order a thousand bags." },
      { role: "agent", en_text: "Wonderful! What time is good for delivery at your shop?" },
      { role: "user", en_text: "Tomorrow morning around 11, at the shop." },
      { role: "agent", en_text: `Done ${owner} ji, sample will reach tomorrow 11 am. Thank you so much!` },
    ],
    final_agent_variables: { ...v, outcome: "sample_requested", objection_type: "none", objection_quote: "", callback_time: "tomorrow 11 am" },
  };
}
