import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { sarvamTranslate } from "@/lib/providers/sarvam";
import { isLanguage } from "@/lib/vyapar/languages";

export const maxDuration = 60;
const Input = z.object({ target: z.string(), texts: z.array(z.string().max(2000)).max(300) });
const key = (lang: string, text: string) => createHash("sha1").update(`${lang}\u0000${text}`).digest("hex");

/** App-wide language switch: translates UI strings with Sarvam, cached per string, so each one is translated once. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isLanguage(parsed.data.target)) return fail("INVALID_INPUT", "Pick a supported language.");
  const { target, texts } = parsed.data;
  if (target === "en-IN") return ok({ translations: texts });
  if (!process.env.SARVAM_API_KEY) return fail("TRANSLATE_UNAVAILABLE", "Translation needs a Sarvam API key.", 422);
  const unique = [...new Set(texts)];
  const ids = unique.map((t) => key(target, t));
  const cached = new Map((await db.translation.findMany({ where: { id: { in: ids } } })).map((r) => [r.source, r.text]));
  const missing = unique.filter((t) => !cached.has(t));
  let failed = 0;
  for (let i = 0; i < missing.length; i += 8) {
    await Promise.all(missing.slice(i, i + 8).map(async (source) => {
      try {
        const text = await sarvamTranslate(source, target);
        cached.set(source, text);
        await db.translation.upsert({ where: { id: key(target, source) }, create: { id: key(target, source), lang: target, source, text }, update: { text } });
      } catch (error) {
        failed++;
        if (failed === 1) console.warn(`[translate] ${error instanceof Error ? error.message : error}`);
      }
    }));
  }
  return ok({ translations: texts.map((t) => cached.get(t) ?? t), failed });
}
