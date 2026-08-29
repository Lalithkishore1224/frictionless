import { createHash } from "crypto";

function required(name: string): string {
  const value = process.env[name];
  if (!value) return "";
  return value;
}

function csv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  ),
  sessionCookie: "session",
  sessionMaxAgeSeconds: 60 * 60 * 24 * 30,

  admins: csv("ADMIN_EMAILS"),

  google: {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET")
  },
  github: {
    clientId: required("GITHUB_CLIENT_ID"),
    clientSecret: required("GITHUB_CLIENT_SECRET")
  },

  fly: {
    clientId: required("FLY_OAUTH_CLIENT_ID"),
    clientSecret: required("FLY_OAUTH_CLIENT_SECRET"),
    org: process.env.FLY_ORG ?? "personal"
  },

  githubEngine: {
    clientId: required("GITHUB_ENGINE_CLIENT_ID"),
    clientSecret: required("GITHUB_ENGINE_CLIENT_SECRET")
  },

  encryptionKeySha: createHash("sha256").update(required("ENCRYPTION_KEY")).digest("hex").slice(0, 8)
};

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return config.admins.includes(email.trim().toLowerCase());
}
