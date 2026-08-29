import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const user = await requireUser();
  const deployments = await prisma.deployment.findMany({
    where: { userId: user.id },
    include: { app: true },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ deployments });
});
