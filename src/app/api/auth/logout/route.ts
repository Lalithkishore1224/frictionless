import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { config } from "@/lib/config";

export async function POST(_req: NextRequest) {
  const store = await cookies();
  store.delete(config.sessionCookie);
  return NextResponse.json({ ok: true });
}
