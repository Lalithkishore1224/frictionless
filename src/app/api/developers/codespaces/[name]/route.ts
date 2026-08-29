import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCredential } from "@/lib/credentials";
import { deleteCodespace } from "@/lib/engines/codespaces";
import { handleApi, type ApiContext } from "@/lib/api";

export const dynamic = "force-dynamic";

export const DELETE = handleApi(async (_req, ctx: ApiContext) => {
  const user = await requireUser();
  const { name } = await ctx.params;
  const credential = await getCredential(user.id, "GITHUB_CODESPACES");
  if (!credential) {
    return NextResponse.json({ error: "GitHub Codespaces is not connected." }, { status: 428 });
  }
  await deleteCodespace(credential.accessToken, name);
  return NextResponse.json({ ok: true });
});