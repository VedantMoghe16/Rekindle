/**
 * The voice that speaks for the seller: voice notes, in-app playback and the AI calling agent all match the
 * seller's gender (chosen in AI team → Your AI's voice). Hindi verbs agree with the speaker too
 * ("bol raha hoon" / "bol rahi hoon"), so a male owner never sounds like a woman and vice versa.
 */
export type Gender = "male" | "female";

export type Persona = {
  gender: Gender;
  /** The calling agent's name in transcripts and the UI. */
  agentName: string;
  /** Sarvam Bulbul v3 speaker for voice notes. */
  speaker: string;
  /** Picks the Hindi form that agrees with the speaker: g("raha", "rahi"). */
  g: (male: string, female: string) => string;
};

export function persona(gender: string | null | undefined): Persona {
  const male = gender === "male";
  return {
    gender: male ? "male" : "female",
    agentName: male ? process.env.SARVAM_AGENT_NAME_MALE || "Arjun" : process.env.SARVAM_AGENT_NAME_FEMALE || "Priya",
    speaker: male ? process.env.SARVAM_TTS_SPEAKER_MALE || "aditya" : process.env.SARVAM_TTS_SPEAKER_FEMALE || process.env.SARVAM_TTS_SPEAKER || "priya",
    g: (m, f) => (male ? m : f),
  };
}

/**
 * Makes first-person Hinglish agree with the speaker: "sakta hoon" ⇄ "sakti hoon", "dunga" ⇄ "dungi",
 * "samajh gaya" ⇄ "samajh gayi", "bol raha hoon" ⇄ "bol rahi hoon". Only for lines the seller or their agent
 * says; never apply it to the buyer's words.
 */
export function speakAs(text: string, gender: Gender): string {
  const male = gender === "male";
  return text
    // Present continuous / habitual with "hoon": raha/rahi hoon, karta/karti hoon, jaata/jaati hoon…
    .replace(/\b(\w+?)(ta|ti) hoon\b/gi, (_m, stem: string, end: string) => `${stem}${male ? matchCase(end, "ta") : matchCase(end, "ti")} hoon`)
    .replace(/\b(raha|rahi) hoon\b/gi, (m) => matchCase(m.split(" ")[0], male ? "raha" : "rahi") + " hoon")
    // Future: dunga/dungi, karunga/karungi, lunga/lungi, chahunga/chahungi…
    .replace(/\b(\w+?)(unga|ungi)\b/gi, (_m, stem: string, end: string) => `${stem}${matchCase(end, male ? "unga" : "ungi")}`)
    // Past: "samajh gaya/gayi", "aa gaya/gayi" when it's the speaker ("main … gaya/gayi" or "samajh gaya/gayi").
    .replace(/\b(samajh|aa|pahunch) (gaya|gayi)\b/gi, (_m, verb: string, end: string) => `${verb} ${matchCase(end, male ? "gaya" : "gayi")}`);
}
const matchCase = (sample: string, word: string) => (sample[0] === sample[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word);
