"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Play,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle
} from "lucide-react";
import type { LaunchEngine } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { LAUNCH_ENGINES, isLiveUrlEngine, deploymentSteps } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface AppProduct {
  id: string;
  title: string;
  slug: string;
  description: string;
  iconUrl: string | null;
  dockerImage: string | null;
  gitHubRepoUrl: string | null;
  engineType: LaunchEngine;
  targetPort: number;
}

interface DeployResponse {
  deployment?: {
    id: string;
    instanceUrl: string;
    status: string;
    progress: string;
  };
  launchUrl?: string;
  appUrl?: string;
  needsEngineAuth?: boolean;
  engine?: LaunchEngine;
  oauthUrl?: string;
  error?: string;
}

const PENDING_LAUNCH_KEY = "servelless_pending_launch";

export function Storefront({ initialApps }: { initialApps: AppProduct[] }) {
  const [apps, setApps] = React.useState<AppProduct[]>(initialApps);
  const [query, setQuery] = React.useState("");
  const [launchingId, setLaunchingId] = React.useState<string | null>(null);

  const [consent, setConsent] = React.useState<{
    engine: LaunchEngine;
    oauthUrl: string;
    app: AppProduct;
  } | null>(null);

  const [success, setSuccess] = React.useState<{
    appTitle: string;
    deployment: { id: string; instanceUrl: string; status: string; progress: string };
    repoUrl?: string | null;
    port?: number;
    slug: string;
    engine: LaunchEngine;
  } | null>(null);

  const { toast } = useToast();

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.slug.includes(q)
    );
  }, [apps, query]);

  async function deploy(app: AppProduct) {
    setLaunchingId(app.id);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: app.id })
      });

      if (res.status === 401) {
        localStorage.setItem(PENDING_LAUNCH_KEY, app.id);
        window.location.href = "/login";
        return;
      }

      let data: DeployResponse = {};
      try {
        data = await res.json();
      } catch {
        // non-JSON response
      }

      if (res.status === 428 && data.needsEngineAuth && data.oauthUrl) {
        setConsent({ engine: data.engine!, oauthUrl: data.oauthUrl, app });
        return;
      }

      if (!res.ok) {
        toast(data.error ?? "Launch failed", "error");
        return;
      }

      if (data.deployment?.id) {
        setSuccess({
          appTitle: app.title,
          deployment: {
            id: data.deployment.id,
            instanceUrl: data.deployment.instanceUrl,
            status: data.deployment.status,
            progress: data.deployment.progress
          },
          repoUrl: app.gitHubRepoUrl,
          port: app.targetPort,
          slug: app.slug,
          engine: app.engineType
        });
      }
    } catch {
      toast("Network error while launching app", "error");
    } finally {
      setLaunchingId(null);
    }
  }

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const launchId = params.get("launch");
    const auth = params.get("auth");
    const login = params.get("login");
    const engine = params.get("engine");
    const error = params.get("error");
    const detail = params.get("detail");

    if (error === "engine_not_configured") {
      const engineLabel =
        engine === "fly"
          ? "Fly.io"
          : engine === "google"
            ? "Google Cloud Shell"
            : "GitHub";
      toast(
        `The ${engineLabel} engine is not configured yet — an admin needs to add its OAuth credentials`,
        "error"
      );
    } else if (error === "oauth_failed") {
      toast(
        detail
          ? `Engine authorization failed: ${detail}`
          : "Engine authorization failed or was cancelled",
        "error"
      );
    } else if (error) {
      toast("Something went wrong during sign-in", "error");
    }
    if (auth) {
      toast(
        auth === "admin-required"
          ? "Admin access is required to view that page"
          : "Please sign in to continue",
        "info"
      );
    }
    if (login === "success") {
      toast("Signed in successfully", "success");
    }
    if (engine === "connected") {
      toast("Cloud engine authorized successfully", "success");
    }

    if (launchId) {
      const app = apps.find((a) => a.id === launchId);
      if (app) deploy(app);
      params.delete("launch");
    }
    params.delete("auth");
    params.delete("login");
    params.delete("engine");
    params.delete("error");
    params.delete("detail");
    window.history.replaceState(null, "", params.toString() ? `?${params}` : window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const pending = localStorage.getItem(PENDING_LAUNCH_KEY);
    if (pending) {
      const app = apps.find((a) => a.id === pending);
      if (app) {
        localStorage.removeItem(PENDING_LAUNCH_KEY);
        deploy(app);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps]);

  return (
    <div className="space-y-8">
      <section className="pt-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          Utility apps. One click. Zero setup.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Launch pre-built utility tools on free cloud infrastructure with a
          single click. No tokens, no terminals, no configuration — your apps
          and data persist automatically.
        </p>
        <div className="mx-auto mt-6 flex max-w-md gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps…"
              className="pl-9"
            />
          </div>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-16 text-center text-muted-foreground">
          No apps match your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((app) => (
            <Card key={app.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  {app.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={app.iconUrl}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <Rocket className="h-5 w-5" />
                    </span>
                  )}
                  <Badge variant="outline">
                    {LAUNCH_ENGINES[app.engineType].label}
                  </Badge>
                </div>
                <CardTitle className="mt-3 text-lg">{app.title}</CardTitle>
                <CardDescription className="line-clamp-3">
                  {app.description}
                </CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto pt-4">
                <Button
                  className="w-full"
                  onClick={() => deploy(app)}
                  disabled={launchingId === app.id}
                >
                  {launchingId === app.id ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Provisioning…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Launch App
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <ConsentDialog
        consent={consent}
        onClose={() => setConsent(null)}
      />

      <SuccessDialog success={success} onClose={() => setSuccess(null)} />
    </div>
  );
}

function ConsentDialog({
  consent,
  onClose
}: {
  consent: { engine: LaunchEngine; oauthUrl: string; app: AppProduct } | null;
  onClose: () => void;
}) {
  if (!consent) return null;
  const engine = LAUNCH_ENGINES[consent.engine];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogHeader
        title="Authorize App Engine"
        description={`Launching ${consent.app.title} needs cloud access.`}
        onClose={onClose}
      />
      <DialogContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium">{engine.label} authorization</p>
            <p className="mt-1 text-muted-foreground">{engine.blurb}</p>
          </div>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>We store your credentials encrypted with AES-256-GCM.</li>
          <li>This is a one-time step — future launches need zero clicks.</li>
          <li>You can disconnect at any time from your dashboard.</li>
        </ul>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => (window.location.href = consent.oauthUrl)}>
          <ShieldCheck className="h-4 w-4" />
          Authorize {engine.label}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function SuccessDialog({
  success,
  onClose
}: {
  success: {
    appTitle: string;
    deployment: { id: string; instanceUrl: string; status: string; progress: string };
    repoUrl?: string | null;
    port?: number;
    slug: string;
    engine: LaunchEngine;
  } | null;
  onClose: () => void;
}) {
  const [opening, setOpening] = React.useState(false);
  const [status, setStatus] = React.useState<string>(
    success?.deployment.status ?? "PROVISIONING"
  );
  const [progress, setProgress] = React.useState<string>(
    success?.deployment.progress ?? "starting"
  );
  const [instanceUrl, setInstanceUrl] = React.useState<string>(
    success?.deployment.instanceUrl ?? ""
  );
  const [liveUrl, setLiveUrl] = React.useState<string | null>(null);

  const s = success ?? null;
  const steps = s ? deploymentSteps(s.engine) : [];

  function repoFullNameFromUrl(repoUrl: string | null | undefined) {
    if (!repoUrl) return null;
    return repoUrl
      .trim()
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "")
      .replace(/^https?:\/\//, "")
      .replace(/^github\.com\//, "");
  }

  React.useEffect(() => {
    if (!s) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/deployments/${s.deployment.id}/status`);
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setStatus(data.status);
          setProgress(data.progress);
          if (data.instanceUrl) setInstanceUrl(data.instanceUrl);
          if (data.status === "RUNNING") {
            if (isLiveUrlEngine(s.engine)) {
              const repo = repoFullNameFromUrl(s.repoUrl);
              if (repo && s.port) {
                const engineParam =
                  s.engine === "OAUTH_CLOUD_SHELL" ? "cloudshell" : "github";
                const appRes = await fetch(
                  `/api/app-url?repo=${encodeURIComponent(repo)}&port=${s.port}&engine=${engineParam}&slug=${encodeURIComponent(s.slug)}`
                );
                if (appRes.ok) {
                  const appData = await appRes.json();
                  if (appData.url) setLiveUrl(appData.url);
                }
              }
            } else {
              setLiveUrl(data.instanceUrl || null);
            }
          }
        }
      } catch {
        // keep polling
      }
    };
    poll();
    const timer = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  if (!s) return null;

  const ready = status === "RUNNING";
  const failed = status === "ERROR";
  const appUrl = liveUrl ?? instanceUrl;
  const canOpenApp = ready && !!appUrl;
  const currentIdx = steps.findIndex((st) => st.key === progress);

  const resolveFreshUrl = async (): Promise<string | null> => {
    if (!isLiveUrlEngine(s.engine)) return null;
    const repo = repoFullNameFromUrl(s.repoUrl);
    if (!repo || !s.port) return null;
    const engineParam = s.engine === "OAUTH_CLOUD_SHELL" ? "cloudshell" : "github";
    const res = await fetch(
      `/api/app-url?repo=${encodeURIComponent(repo)}&port=${s.port}&engine=${engineParam}&slug=${encodeURIComponent(s.slug)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.url ?? null;
  };

  const openApp = async () => {
    const known = liveUrl ?? instanceUrl;
    if (known) {
      // Same-tab redirect: reliable, never blocked by popup blockers.
      window.location.href = known;
      return;
    }
    setOpening(true);
    try {
      const fresh = await resolveFreshUrl();
      if (fresh) {
        window.location.href = fresh;
      }
    } catch {
      // no URL available yet
    }
    setOpening(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogHeader
        title={ready ? "Your app is ready" : failed ? "Launch failed" : "Starting your app"}
        onClose={onClose}
      />
      <DialogContent className="space-y-4">
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4",
            ready
              ? "border-emerald-200 bg-emerald-50"
              : failed
                ? "border-red-200 bg-red-50"
                : "border-amber-200 bg-amber-50"
          )}
        >
          {ready ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          ) : failed ? (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          ) : (
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-amber-600" />
          )}
          <div className="text-sm">
            <p className="font-medium">
              {ready
                ? `${s.appTitle} is ready`
                : failed
                  ? `We couldn't launch ${s.appTitle}`
                  : `Provisioning ${s.appTitle}…`}
            </p>
            {ready && liveUrl ? (
              <p className="mt-1 break-all text-emerald-700">{liveUrl}</p>
            ) : failed ? (
              <p className="mt-1 whitespace-pre-wrap text-red-700">
                {progress.startsWith("error:")
                  ? progress.slice("error:".length).trim()
                  : "Something went wrong while provisioning the cloud instance. Please try again."}
              </p>
            ) : (
              <p className="mt-1 text-amber-700">
                Your free cloud instance is booting — this usually takes about a
                minute.
              </p>
            )}
          </div>
        </div>

        <ol className="space-y-2">
          {steps.map((step, i) => {
            const done = ready || (currentIdx >= 0 && i < currentIdx);
            const active = !ready && !failed && i === currentIdx;
            const skipped = failed && !done;
            return (
              <li key={step.key} className="flex items-center gap-3 text-sm">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <Circle
                    className={cn(
                      "h-4 w-4 shrink-0",
                      skipped ? "text-red-400" : "text-muted-foreground/40"
                    )}
                  />
                )}
                <span
                  className={cn(
                    done
                      ? "text-foreground"
                      : active
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
                {canOpenApp && done && (
                  <ExternalLink
                    className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-600"
                    onClick={() => window.open(appUrl, "_blank", "noreferrer")}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" asChild>
          <Link href="/dashboard">View dashboard</Link>
        </Button>
        <Button onClick={openApp} disabled={!canOpenApp || opening}>
          {opening ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Locating…
            </>
          ) : (
            <>
              Open app
              <ArrowUpRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
