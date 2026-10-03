import { NextResponse } from "next/server";
import { z } from "zod";
import { DiscoveryCriteria } from "@/lib/schemas";
import { saveDiscoveryRun } from "@/lib/services/discovery";

const Input = z.object({ prompt: z.string().min(4).max(2000), criteria: DiscoveryCriteria });

export async function POST(request: Request) {
  const input = Input.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ ok: false, error: { code: "INVALID_PLAN", message: "The research plan is incomplete." } }, { status: 400 });
  const candidates = await saveDiscoveryRun(input.data.prompt, input.data.criteria);
  return NextResponse.json({ ok: true, data: { candidates, isDemo: true } });
}
