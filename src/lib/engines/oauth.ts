import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "../config";

export interface OAuthProvider {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  audience?: string;
  extraParams?: Record<string, string>;
}

export const USER_LOGIN_PROVIDERS = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
    scopes: "openid email profile"
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientId: config.github.clientId,
    clientSecret: config.github.clientSecret,
    scopes: "read:user user:email"
  }
} satisfies Record<string, OAuthProvider>;

export const ENGINE_PROVIDERS = {
  fly: {
    authorizeUrl: "https://auth.fly.io/authorize",
    tokenUrl: "https://auth.fly.io/oauth/token",
    clientId: config.fly.clientId,
    clientSecret: config.fly.clientSecret,
    scopes: "write",
    audience: "https://api.machines.dev"
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientId: config.githubEngine.clientId,
    clientSecret: config.githubEngine.clientSecret,
    scopes: "codespace workflow repo read:user"
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
    scopes:
      "openid email profile https://www.googleapis.com/auth/cloud-platform",
    extraParams: { access_type: "offline", prompt: "consent" }
  }
} satisfies Record<string, OAuthProvider>;

export const STATE_COOKIE = "oauth_state";

export async function issueOAuthState(context: string): Promise<string> {
  const state = randomBytes(24).toString("hex");
  const store = await cookies();
  store.set(STATE_COOKIE, `${state}.${context}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600
  });
  return state;
}

export async function consumeOAuthState(
  received: string | null,
  context: string
): Promise<boolean> {
  if (!received) return false;
  const store = await cookies();
  const stored = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  if (!stored) return false;
  const [state, ctx] = stored.split(".");
  return state === received && ctx === context;
}

/**
 * The origin the browser is actually using (handles Codespaces / port-forwarded
 * URLs automatically instead of relying on a hardcoded NEXT_PUBLIC_APP_URL).
 */
export function getOrigin(req: Request): string {
  try {
    return new URL(req.url).origin;
  } catch {
    return config.appUrl;
  }
}

export function hasConfiguredCredentials(provider: OAuthProvider): boolean {
  return Boolean(provider.clientId && provider.clientSecret);
}

export function buildAuthorizeUrl(
  provider: OAuthProvider,
  state: string,
  callbackPath: string,
  origin: string,
  extra?: Record<string, string>
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: provider.clientId,
    redirect_uri: `${origin}${callbackPath}`,
    scope: provider.scopes,
    state,
    ...(provider.audience ? { audience: provider.audience } : {}),
    ...extra
  });
  if (provider.extraParams) {
    for (const [k, v] of Object.entries(provider.extraParams)) {
      params.set(k, v);
    }
  }
  return `${provider.authorizeUrl}?${params.toString()}`;
}

export async function exchangeCode(
  provider: OAuthProvider,
  code: string,
  callbackPath: string,
  origin: string
): Promise<Record<string, string>> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    redirect_uri: `${origin}${callbackPath}`
  });
  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: body.toString()
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `Token exchange failed (${res.status}): ${JSON.stringify(json)}`
    );
  }
  return json as Record<string, string>;
}

export async function startOAuth(
  provider: OAuthProvider,
  context: string,
  callbackPath: string,
  req: Request,
  extra?: Record<string, string>
): Promise<never> {
  const state = await issueOAuthState(context);
  redirect(
    buildAuthorizeUrl(provider, state, callbackPath, getOrigin(req), extra)
  );
}

export function getAuthorizationCode(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("code");
}
