import { cookies } from "next/headers";
import { config, isAdminEmail } from "./config";
import { signSession, verifySession, type SessionPayload } from "./session";
import { prisma } from "./prisma";
import type { User } from "@prisma/client";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(config.sessionCookie)?.value;
  if (!token) return null;
  return verifySession(token);
}

export function isDevLoginEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.DEV_LOGIN === "true"
  );
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.sub } });
}

export async function requireUser(): Promise<User> {
  const session = await getSession();
  if (!session) {
    throw new SessionError("Not authenticated", "UNAUTHENTICATED");
  }
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) {
    throw new SessionError("Account not found", "UNAUTHENTICATED");
  }
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) {
    throw new SessionError("Admin access required", "FORBIDDEN");
  }
  return user;
}

export class SessionError extends Error {
  code: "UNAUTHENTICATED" | "FORBIDDEN";
  constructor(message: string, code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(message);
    this.code = code;
  }
}

export async function createSessionCookie(email: string) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email }
  });
  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    isAdmin: isAdminEmail(user.email)
  });
  const store = await cookies();
  store.set(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: config.sessionMaxAgeSeconds
  });
  return user;
}
