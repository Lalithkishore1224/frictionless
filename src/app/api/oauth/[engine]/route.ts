import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ENGINE_PROVIDERS,
  startOAuth,
  hasConfiguredCredentials,
  getOrigin,
  type OAuthProvider
} from "@/lib/engines/oauth";
import { apiError } from "@/lib/api";

const ENGINES: Record<string, OAuthProvider> = ENGINE_PROVIDERS;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ engine: string }> }
) {
  const { engine } = await context.params;
  const conf = ENGINES[engine];
  if (!conf) return apiError(400, `Unknown engine "${engine}"`);

  if (!hasConfiguredCredentials(conf)) {
    const url = new URL("/", getOrigin(req));
    url.searchParams.set("error", "engine_not_configured");
    url.searchParams.set("engine", engine);
    return NextResponse.redirect(url);
  }

  // Remember which app the user was about to launch so the callback can
  // resume the flow with zero additional clicks.
  const appId = new URL(req.url).searchParams.get("appId");
  if (appId) {
    const store = await cookies();
    store.set("pending_launch", appId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600
    });
  }

  return startOAuth(
    conf,
    `engine:${engine}`,
    `/api/oauth/${engine}/callback`,
    req
  );
}
