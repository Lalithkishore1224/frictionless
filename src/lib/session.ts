import { SignJWT, jwtVerify } from "jose";

export interface SessionPayload {
  sub: string;
  email: string;
  name?: string | null;
  isAdmin?: boolean;
  [key: string]: unknown;
}

const ALG = "HS256";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET ?? "servelless-insecure-dev-secret"
  );
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALG]
    });
    if (!payload.sub || !payload.email) return null;
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: (payload.name as string) ?? null,
      isAdmin: Boolean(payload.isAdmin)
    };
  } catch {
    return null;
  }
}
