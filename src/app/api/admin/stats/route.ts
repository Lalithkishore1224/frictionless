import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await requireAdmin();
  const [users, deployments, runningInstances, products, runningByEngine] =
    await Promise.all([
      prisma.user.count(),
      prisma.deployment.count(),
      prisma.deployment.count({ where: { status: { in: ["RUNNING", "PROVISIONING"] } } }),
      prisma.appProduct.count(),
      prisma.deployment.groupBy({
        by: ["status"],
        _count: { _all: true }
      })
    ]);

  return NextResponse.json({
    stats: {
      users,
      deployments,
      runningInstances,
      products,
      statusBreakdown: runningByEngine.map((r) => ({
        status: r.status,
        count: r._count._all
      }))
    }
  });
});
