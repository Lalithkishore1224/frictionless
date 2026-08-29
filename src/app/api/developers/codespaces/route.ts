import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCredential } from "@/lib/credentials";
import { listCodespaces } from "@/lib/engines/codespaces";
import { handleApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const user = await requireUser();
  const credential = await getCredential(user.id, "GITHUB_CODESPACES");
  if (!credential) {
    return NextResponse.json({ codespaces: [] });
  }
  const codespaces = await listCodespaces(credential.accessToken);
  return NextResponse.json({ codespaces });
});