import { NextRequest, NextResponse } from "next/server";
import {
  USER_LOGIN_PROVIDERS,
  exchangeCode,
  consumeOAuthState,
  getOrigin,
  type OAuthProvider
} from "@/lib/engines/oauth";
import { createSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";

interface ProviderProfile {
  email: string;
  name?: string;
  avatarUrl?: string;
}

async function fetchGoogleProfile(accessToken: string): Promise<ProviderProfile> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Google profile fetch failed (${res.status})`);
  const json = await res.json();
  return {
    email: json.email,
    name: json.name ?? undefined,
    avatarUrl: json.picture ?? undefined
  };
}

async function fetchGithubProfile(accessToken: string): Promise<ProviderProfile> {
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "servelless",
      Accept: "application/vnd.github+json"
    }
  });
  if (!userRes.ok) throw new Error(`GitHub profile fetch failed (${userRes.status})`);
  const user = await userRes.json();

  let email: string | null = user.email ?? null;
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "servelless",
        Accept: "application/vnd.github+json"
      }
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as Array<{ email: string; primary?: boolean; verified?: boolean }>;
      email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? null;
    }
  }
  if (!email) throw new Error("No email address available on this GitHub account");

  return {
    email,
    name: user.name ?? user.login ?? undefined,
    avatarUrl: user.avatar_url ?? undefined
  };
}

const profileFetchers: Record<string, (token: string) => Promise<ProviderProfile>> = {
  google: fetchGoogleProfile,
  github: fetchGithubProfile
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  const conf: OAuthProvider | undefined =
    USER_LOGIN_PROVIDERS[provider as keyof typeof USER_LOGIN_PROVIDERS];
  if (!conf) return apiError(400, `Unknown login provider "${provider}"`);

  const url = new URL(req.url);

  // The provider bailed (user denied consent, or an upstream error).
  if (url.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/login?error=oauth", req.url));
  }

  const state = url.searchParams.get("state");
  if (!(await consumeOAuthState(state, `login:${provider}`))) {
    return apiError(400, "Invalid or expired OAuth state");
  }

  const code = url.searchParams.get("code");
  if (!code) return apiError(400, "Missing authorization code");

  try {
    const origin = getOrigin(req);
    const tokens = await exchangeCode(
      conf,
      code,
      `/api/auth/callback/${provider}`,
      origin
    );
    const profile = await profileFetchers[provider](tokens.access_token);
    const user = await createSessionCookie(profile.email);
    if (profile.name || profile.avatarUrl) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(profile.name ? { name: profile.name } : {}),
          ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {})
        }
      });
    }
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.redirect(
        new URL(`/login?error=oauth:${encodeURIComponent(err.message)}`, req.url)
      );
    }
    return NextResponse.redirect(new URL("/login?error=oauth", req.url));
  }

  return NextResponse.redirect(new URL("/?login=success", req.url));
}
