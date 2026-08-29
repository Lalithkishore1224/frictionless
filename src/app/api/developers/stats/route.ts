import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const user = await requireUser();
  const apps = await prisma.appProduct.findMany({
    where: { developerId: user.id },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      engineType: true,
      targetPort: true,
      launchCount: true,
      createdAt: true
    },
    orderBy: { createdAt: "desc" }
  });

  const total = apps.reduce((sum, a) => sum + a.launchCount, 0);

  return NextResponse.json({
    stats: {
      totalApps: apps.length,
      totalLaunches: total,
      apps
    }
  });
});