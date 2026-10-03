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
  // Spoken lines are Hinglish (as the agent and merchant actually talk); en_text is the English version.
  const turn = (role: "agent" | "user", text: string, en_text: string) => ({ role, text, en_text, language: "Hinglish" });
  const opener = turn("agent", `Namaste ${owner} ji, main ${biz} se, ${seller} ji ki taraf se bol rahi hoon. Hum aapki shop se sirf ${km} km door hain. Ek minute baat kar sakte hain?`, `Namaste ${owner} ji, I'm calling from ${biz} on behalf of ${seller} ji. We are just ${km} km from your shop. Do you have one minute?`);
  const interaction_id = `sim/${attemptId}`;
  if (scenario === "objection") {
    return {
      ...base, status: "connected", duration: 58.4, interaction_id, failure_reason: null,
      interaction_transcript: [
        opener,
        turn("user", "Haan boliye, kis baare mein hai? Subah ka rush hai thoda.", "Yes, tell me, what is this about? I'm a little busy with the morning rush."),
        turn("agent", `Hum strong paper bags banate hain, ${price}, aur aapko ${v.offer ?? "free sample pack"} dena chahte hain.`, `We make strong paper bags, ${price}, and we would like to give you ${v.offer ?? "a free sample pack"}.`),
        turn("user", "Paanch rupaye bahut zyada hai bhaiya. Abhi wala supplier sasta deta hai. Aur main bulk mein hi leta hoon, chhote lot nahi.", "Five rupees is too much, brother. My current supplier gives me cheaper. And I only buy in bulk, not in small lots."),
        turn("agent", "Samajh gayi ji. Bulk mein rate theek baithe toh kam se kam sample dekhna chahenge?", "Understood ji. If the price works for you in bulk, would you at least like to see a sample?"),
        turn("user", "Abhi nahi. Is rate pe nahi chalega. Bulk rate achha mile toh phir call karna.", "Not now. At this price it won't work. If you get a better bulk rate, call me again."),
        turn("agent", `Zaroor ${owner} ji, main ${seller} ji se bulk rate ki baat karti hoon. Dhanyavaad!`, `Sure ${owner} ji, I'll speak to ${seller} ji about a bulk rate. Thank you for your time!`),
      ],
      final_agent_variables: { ...v, outcome: "objection", objection_type: "price", objection_quote: "Paanch rupaye bahut zyada hai bhaiya", callback_time: "" },
    };
  }
  if (scenario === "callback") {
    return {
      ...base, status: "connected", duration: 21.7, interaction_id, failure_reason: null,
      interaction_transcript: [
        opener,
        turn("user", "Bhaiya abhi bahut busy hoon. Shaam ko 6 ke baad call karna.", "Brother, it's very busy right now. Call me in the evening after 6."),
        turn("agent", `Koi baat nahi ${owner} ji, main 6 baje ke baad call karti hoon. Dhanyavaad!`, `No problem ${owner} ji, I'll call you after 6 pm. Thank you!`),
      ],
      final_agent_variables: { ...v, outcome: "callback", objection_type: "timing", objection_quote: "Shaam ko 6 ke baad call karna", callback_time: "today after 6 pm" },
    };
  }
  const counter = v.counter_offer || price;
  return {
    ...base, status: "connected", duration: 64.2, interaction_id, failure_reason: null,
    interaction_transcript: [
      turn("agent", `Namaste ${owner} ji, ${biz} se, ${seller} ji ki taraf se. ${v.past_objections ? "Pichli baar aapne rate zyada bataya tha, humne yaad rakha. " : ""}Naya offer hai: ${counter}.`, `Namaste ${owner} ji, ${biz} here, calling for ${seller} ji. ${v.past_objections ? "Last time you told us the price was high — we remembered that. " : ""}We have a new offer: ${counter}.`),
      turn("user", "Arre, aapko yaad hai! Theek hai, yeh rate sahi lag raha hai.", "Oh, you remembered! Okay, that rate sounds reasonable."),
      turn("agent", `Pehle ${v.offer ?? "free sample pack"} bhej doon, quality check kar lijiye?`, `Shall I send you ${v.offer ?? "a free sample pack"} first so you can check the quality?`),
      turn("user", "Haan, sample bhejo. Quality achhi hui toh hazaar bag ka order dunga.", "Yes, send the sample. If the quality is good I'll order a thousand bags."),
      turn("agent", "Bahut badhiya! Shop pe delivery ke liye kaunsa time theek rahega?", "Wonderful! What time is good for delivery at your shop?"),
      turn("user", "Kal subah 11 baje ke aas paas, shop pe.", "Tomorrow morning around 11, at the shop."),
      turn("agent", `Done ${owner} ji, sample kal subah 11 baje pahunch jayega. Bahut dhanyavaad!`, `Done ${owner} ji, sample will reach tomorrow 11 am. Thank you so much!`),
    ],
    final_agent_variables: { ...v, outcome: "sample_requested", objection_type: "none", objection_quote: "", callback_time: "tomorrow 11 am" },
  };
}
