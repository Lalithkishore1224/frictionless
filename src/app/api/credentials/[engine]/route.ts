import { NextResponse } from "next/server";
import type { LaunchEngine } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { deleteCredential } from "@/lib/credentials";
import { handleApi, type ApiContext } from "@/lib/api";

const ENGINE_ENUM: Record<string, LaunchEngine> = {
  fly: "OAUTH_CLOUD_FLY",
  github: "GITHUB_CODESPACES",
  google: "OAUTH_CLOUD_SHELL"
};

export const DELETE = handleApi(async (_req, ctx: ApiContext) => {
  const user = await requireUser();
  const { engine } = await ctx.params;
  const engineEnum = ENGINE_ENUM[engine];
  if (!engineEnum) return NextResponse.json({ error: "Unknown engine" }, { status: 400 });
  await deleteCredential(user.id, engineEnum);
  return NextResponse.json({ ok: true });
});
