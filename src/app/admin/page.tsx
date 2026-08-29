import { prisma } from "@/lib/prisma";
import type { DeploymentStatus } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Boxes, Rocket, AppWindow } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminFleetDashboard() {
  const [users, deployments, runningInstances, products, byStatus, recentDeployments] =
    await Promise.all([
      prisma.user.count(),
      prisma.deployment.count(),
      prisma.deployment.count({ where: { status: { in: ["RUNNING", "PROVISIONING"] } } }),
      prisma.appProduct.count(),
      prisma.deployment.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.deployment.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { user: true, app: true }
      })
    ]);

  const statusMap = new Map(byStatus.map((s) => [s.status, s._count._all]));

  const cards = [
    { label: "Registered Users", value: users, icon: Users },
    { label: "Total Deployments", value: deployments, icon: Boxes },
    { label: "Active Instances", value: runningInstances, icon: Rocket },
    { label: "Catalog Apps", value: products, icon: AppWindow }
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deployment Status Breakdown</CardTitle>
            <CardDescription>
              All deployments across the platform by lifecycle state.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(["RUNNING", "PROVISIONING", "STOPPED", "ERROR"] as DeploymentStatus[]).map(
              (status) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm">{status}</span>
                <span className="text-sm font-medium">
                  {statusMap.get(status) ?? 0}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Deployments</CardTitle>
            <CardDescription>Latest activity across the fleet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentDeployments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deployments yet.</p>
            ) : (
              recentDeployments.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {d.app.title}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {d.user.email}
                      </span>
                    </p>
                  </div>
                  <span
                    className={`ml-3 shrink-0 rounded-md border px-2 py-0.5 text-xs ${
                      d.status === "RUNNING"
                        ? "border-transparent bg-emerald-100 text-emerald-800"
                        : d.status === "PROVISIONING"
                          ? "border-transparent bg-amber-100 text-amber-800"
                          : d.status === "ERROR"
                            ? "border-transparent bg-red-100 text-red-800"
                            : "text-foreground"
                    }`}
                  >
                    {d.status}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
