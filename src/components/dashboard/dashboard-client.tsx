"use client";

import * as React from "react";
import Link from "next/link";
import type { AppProduct, DeploymentStatus, LaunchEngine, User } from "@prisma/client";
import {
  ArrowUpRight,
  Loader2,
  PlugZap,
  PlusCircle,
  ShieldCheck,
  Trash2,
  Unplug
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { LAUNCH_ENGINES, isLiveUrlEngine } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

type DeploymentWithApp = {
  id: string;
  instanceUrl: string;
  status: DeploymentStatus;
  createdAt: Date;
  app: AppProduct;
};

const ENGINE_SLUG: Record<LaunchEngine, string> = {
  OAUTH_CLOUD_FLY: "fly",
  GITHUB_CODESPACES: "github",
  OAUTH_CLOUD_SHELL: "google"
};

const STATUS_VARIANT: Record<DeploymentStatus, "success" | "warning" | "outline" | "destructive"> = {
  RUNNING: "success",
  PROVISIONING: "warning",
  STOPPED: "outline",
  ERROR: "destructive"
};

export function DashboardClient({
  user,
  deployments,
  connectedEngines
}: {
  user: User;
  deployments: DeploymentWithApp[];
  connectedEngines: LaunchEngine[];
}) {
  const { toast } = useToast();
  const [items, setItems] = React.useState(deployments);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [disconnecting, setDisconnecting] = React.useState<LaunchEngine | null>(null);
  const [openingId, setOpeningId] = React.useState<string | null>(null);

  const hasProvisioning = items.some((d) => d.status === "PROVISIONING");

  async function refreshDeployments() {
    const res = await fetch("/api/deployments");
    if (res.ok) {
      const data = await res.json();
      setItems(data.deployments);
    }
  }

  React.useEffect(() => {
    if (!hasProvisioning) return;
    const t = setInterval(refreshDeployments, 5000);
    return () => clearInterval(t);
  }, [hasProvisioning]);

  function repoFullNameFromUrl(repoUrl: string | null) {
    if (!repoUrl) return null;
    return repoUrl
      .trim()
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "")
      .replace(/^https?:\/\//, "")
      .replace(/^github\.com\//, "");
  }

  // The "Open app" button is only actionable once the deployment is RUNNING
  // with a real public URL. While still booting/exposing the app (PROVISIONING)
  // it stays disabled so users don't hit a not-yet-ready (404) page.
  function canOpen(d: DeploymentWithApp): boolean {
    if (d.status !== "RUNNING") return false;
    if (!d.instanceUrl || !/^https?:\/\//.test(d.instanceUrl)) return false;
    if (isLiveUrlEngine(d.app.engineType)) return true;
    return d.instanceUrl.includes("trycloudflare.com") || d.instanceUrl.includes("app.github.dev");
  }

  async function openApp(d: DeploymentWithApp) {
    if (!isLiveUrlEngine(d.app.engineType)) {
      // Live URL already known (e.g. Fly) — same-tab redirect.
      if (d.instanceUrl) {
        window.location.href = d.instanceUrl;
        return;
      }
    }
    if (d.instanceUrl) {
      // Same-tab redirect is reliable and never blocked by popup blockers.
      window.location.href = d.instanceUrl;
      return;
    }
    setOpeningId(d.id);
    try {
      const fresh = await resolveFreshAppUrl(d);
      if (fresh) {
        window.location.href = fresh;
        return;
      }
    } catch {
      // fall through
    } finally {
      setOpeningId(null);
    }
    if (d.instanceUrl) window.location.href = d.instanceUrl;
  }

  async function resolveFreshAppUrl(d: DeploymentWithApp): Promise<string | null> {
    const repo = repoFullNameFromUrl(d.app.gitHubRepoUrl);
    if (!repo || !d.app.targetPort) return null;
    const engineParam =
      d.app.engineType === "OAUTH_CLOUD_SHELL" ? "cloudshell" : "github";
    const res = await fetch(
      `/api/app-url?repo=${encodeURIComponent(repo)}&port=${d.app.targetPort}&engine=${engineParam}&slug=${encodeURIComponent(d.app.slug)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.url ?? null;
  }

  async function removeDeployment(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/deployments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error ?? "Failed to stop deployment", "error");
        return;
      }
      setItems((prev) => prev.filter((d) => d.id !== id));
      toast("Deployment stopped", "success");
    } catch {
      toast("Network error", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function disconnectEngine(engine: LaunchEngine) {
    setDisconnecting(engine);
    try {
      const res = await fetch(`/api/credentials/${ENGINE_SLUG[engine]}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Failed to disconnect engine", "error");
        return;
      }
      toast(`${LAUNCH_ENGINES[engine].label} disconnected`, "info");
      window.location.reload();
    } catch {
      toast("Network error", "error");
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="space-y-8 pt-8">
      <div>
        <h1 className="text-2xl font-bold">My Apps</h1>
        <p className="mt-1 text-muted-foreground">
          Signed in as {user.email}. Manage your running instances and cloud engines.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          CLOUD ENGINES
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(LAUNCH_ENGINES) as LaunchEngine[]).map((engine) => {
            const connected = connectedEngines.includes(engine);
            return (
              <Card key={engine}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {LAUNCH_ENGINES[engine].label}
                    </CardTitle>
                    {connected ? (
                      <Badge variant="success">
                        <PlugZap className="mr-1 h-3 w-3" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not connected</Badge>
                    )}
                  </div>
                  <CardDescription>{LAUNCH_ENGINES[engine].description}</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  {connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disconnectEngine(engine)}
                      disabled={disconnecting === engine}
                    >
                      {disconnecting === engine ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Unplug className="h-4 w-4" />
                      )}
                      Disconnect
                    </Button>
                  ) : (
                    <Button size="sm" asChild>
                      <Link href={`/api/oauth/${ENGINE_SLUG[engine]}`}>
                        <PlusCircle className="h-4 w-4" />
                        Connect
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          RUNNING INSTANCES
        </h2>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-14 text-center">
            <p className="text-muted-foreground">No running apps yet.</p>
            <Button className="mt-4" asChild>
              <Link href="/">Browse the marketplace</Link>
            </Button>
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Launched</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.app.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {LAUNCH_ENGINES[d.app.engineType].label}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(d.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openApp(d)}
                          disabled={!canOpen(d) || openingId === d.id}
                          title={canOpen(d) ? "Open app" : "App is still preparing — the public URL isn't ready yet"}
                        >
                          {openingId === d.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDeployment(d.id)}
                          disabled={deletingId === d.id}
                          title="Stop deployment"
                        >
                          {deletingId === d.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Engine credentials are encrypted at rest with AES-256-GCM.
      </p>
    </div>
  );
}
