import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { LaunchEngine } from "@prisma/client";
import {
  ENGINE_PROVIDERS,
  exchangeCode,
  consumeOAuthState,
  getOrigin,
  type OAuthProvider
} from "@/lib/engines/oauth";
import { requireUser } from "@/lib/auth";
import { saveCredential } from "@/lib/credentials";
import { apiError } from "@/lib/api";

const ENGINE_ENUM: Record<string, LaunchEngine> = {
  fly: "OAUTH_CLOUD_FLY",
  github: "GITHUB_CODESPACES",
  google: "OAUTH_CLOUD_SHELL"
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ engine: string }> }
) {
  const { engine } = await context.params;
  const conf: OAuthProvider | undefined =
    ENGINE_PROVIDERS[engine as keyof typeof ENGINE_PROVIDERS];
  const engineEnum = ENGINE_ENUM[engine];
  if (!conf || !engineEnum) return apiError(400, `Unknown engine "${engine}"`);

  const url = new URL(req.url);

  // The provider bailed (user denied consent, or an upstream error).
  if (url.searchParams.get("error")) {
    const target = new URL("/", req.url);
    target.searchParams.set("error", "oauth_failed");
    target.searchParams.set("engine", engine);
    return NextResponse.redirect(target);
  }

  const state = url.searchParams.get("state");
  if (!(await consumeOAuthState(state, `engine:${engine}`))) {
    return apiError(400, "Invalid or expired OAuth state");
  }

  const code = url.searchParams.get("code");
  if (!code) return apiError(400, "Missing authorization code");

  let user;
  try {
    user = await requireUser();
  } catch {
    return apiError(401, "You must be signed in before authorizing an app engine");
  }

  try {
    const tokens = await exchangeCode(
      conf,
      code,
      `/api/oauth/${engine}/callback`,
      getOrigin(req)
    );
    const expiresIn = Number(tokens.expires_in);
    await saveCredential(user.id, engineEnum, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt:
        expiresIn && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000)
          : null
    });
  } catch (err) {
    const target = new URL("/", req.url);
    target.searchParams.set("error", "oauth_failed");
    target.searchParams.set("engine", engine);
    if (err instanceof Error) {
      target.searchParams.set("detail", err.message);
    }
    return NextResponse.redirect(target);
  }

  const store = await cookies();
  const pendingLaunch = store.get("pending_launch")?.value;
  store.delete("pending_launch");

  const target = new URL("/", req.url);
  target.searchParams.set("engine", "connected");
  if (pendingLaunch) target.searchParams.set("launch", pendingLaunch);
  return NextResponse.redirect(target);
}
