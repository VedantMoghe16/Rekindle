import { z } from "zod";
import { ok, fail } from "@/lib/api";

const Input = z.object({ provider: z.enum(["greenhouse", "lever"]), token: z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/i) });

/** Checks that a public Greenhouse or Lever board answers and returns a few job titles. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Choose a provider and enter the board token.");
  const { provider, token } = parsed.data;
  const url = provider === "greenhouse" ? `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=false` : `https://api.lever.co/v0/postings/${token}?mode=json`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(Number(process.env.SOURCE_TIMEOUT_MS || 8000)) });
    if (!response.ok) return fail("BOARD_NOT_FOUND", `No public ${provider} board answered for “${token}”.`, 404);
    const body = await response.json() as { jobs?: { title: string }[] } | { text: string }[];
    const titles = Array.isArray(body) ? body.map((job) => job.text) : (body.jobs ?? []).map((job) => job.title);
    return ok({ jobCount: titles.length, sample: titles.slice(0, 5) });
  } catch {
    return fail("BOARD_TIMEOUT", "The job board did not answer in time.", 504);
  }
}
