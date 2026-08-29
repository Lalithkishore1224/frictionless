import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApi, type ApiContext } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (_req, ctx: ApiContext) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const deployment = await prisma.deployment.findFirst({
    where: { id, userId: user.id },
    include: { app: { select: { engineType: true } } }
  });
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: deployment.id,
    status: deployment.status,
    progress: deployment.progress,
    instanceUrl: deployment.instanceUrl,
    engineType: deployment.app.engineType,
    ready: deployment.status === "RUNNING"
  });
});