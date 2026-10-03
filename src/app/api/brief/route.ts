import { NextResponse } from "next/server";
import { getBrief } from "@/lib/services/brief";

export async function GET() {
  try { return NextResponse.json({ ok: true, data: await getBrief() }); }
  catch { return NextResponse.json({ ok: false, error: { code: "BRIEF_FAILED", message: "The daily brief could not be loaded." } }, { status: 500 }); }
}
