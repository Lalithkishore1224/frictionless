import { NextRequest } from "next/server";
import {
  USER_LOGIN_PROVIDERS,
  startOAuth,
  hasConfiguredCredentials,
  type OAuthProvider
} from "@/lib/engines/oauth";
import { apiError } from "@/lib/api";

const PROVIDERS: Record<string, OAuthProvider> = USER_LOGIN_PROVIDERS;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  const conf = PROVIDERS[provider];
  if (!conf) {
    return apiError(400, `Unknown login provider "${provider}"`);
  }
  if (!hasConfiguredCredentials(conf)) {
    return apiError(
      503,
      `${provider === "google" ? "Google" : "GitHub"} sign-in is not configured yet — use the dev sign-in or ask the admin to set credentials`
    );
  }
  return startOAuth(
    conf,
    `login:${provider}`,
    `/api/auth/callback/${provider}`,
    req
  );
}
