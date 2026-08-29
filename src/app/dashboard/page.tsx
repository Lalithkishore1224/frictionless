import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [deployments, credentials] = await Promise.all([
    prisma.deployment.findMany({
      where: { userId: user.id },
      include: { app: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.userCredential.findMany({ where: { userId: user.id } })
  ]);

  return (
    <DashboardClient
      user={user}
      deployments={deployments}
      connectedEngines={credentials.map((c) => c.provider)}
    />
  );
}
