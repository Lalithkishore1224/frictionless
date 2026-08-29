"use client";

import * as React from "react";
import type { AppProduct, AppSubmission, LaunchEngine } from "@prisma/client";
import { ExternalLink, FolderGit2, Loader2, Pause, RefreshCw, Rocket, Send, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { LAUNCH_ENGINES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

interface SubmissionRow extends AppSubmission {
  appProduct?: { id: string; title: string; slug: string; launchCount: number } | null;
}

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive" | "success"> = {
  PENDING: "secondary",
  CHECKING: "secondary",
  VERIFIED: "default",
  UNDER_REVIEW: "default",
  APPROVED: "success",
  FAILED: "destructive",
  REJECTED: "destructive"
};

const ACTIVE_STATUSES = ["PENDING", "CHECKING"];
// If a submission has been stuck in an active state for longer than this,
// treat it as resolved (the background verification job may have been killed)
// so the submit button never stays disabled indefinitely.
const STALE_MS = 10 * 60 * 1000;

export function DevelopersClient({
  initialSubmissions,
  connectedEngines,
  initialApps
}: {
  initialSubmissions: SubmissionRow[];
  connectedEngines: LaunchEngine[];
  initialApps: Array<Pick<AppProduct, "id" | "title" | "slug" | "description" | "engineType" | "targetPort" | "launchCount" | "createdAt">>;
}) {
  const [submissions, setSubmissions] = React.useState(initialSubmissions);
  const [apps] = React.useState(initialApps);
  const [repoUrl, setRepoUrl] = React.useState("");
  const [engine, setEngine] = React.useState<"CODESPACES" | "CLOUD_SHELL">("CLOUD_SHELL");
  const [submitting, setSubmitting] = React.useState(false);
  const [connectPrompt, setConnectPrompt] = React.useState<string | null>(null);
  const { toast } = useToast();

  const hasCloudShell = connectedEngines.includes("OAUTH_CLOUD_SHELL");
  const hasCodespaces = connectedEngines.includes("GITHUB_CODESPACES");
  const availableEngines: Array<{ value: "CODESPACES" | "CLOUD_SHELL"; label: string; connected: boolean }> = [
    { value: "CLOUD_SHELL", label: "Google Cloud Shell", connected: hasCloudShell },
    { value: "CODESPACES", label: "GitHub Codespaces", connected: hasCodespaces }
  ];

  const totalLaunches = apps.reduce((s, a) => s + a.launchCount, 0);
  const now = Date.now();
  const checking = submissions.some(
    (s) => ACTIVE_STATUSES.includes(s.status) && now - new Date(s.updatedAt).getTime() < STALE_MS
  );

  const [codespaces, setCodespaces] = React.useState<Array<{
    name: string;
    state: string;
    repoFullName: string;
    webUrl: string;
  }>>([]);
  const [loadingCs, setLoadingCs] = React.useState(false);
  const [csBusy, setCsBusy] = React.useState<string | null>(null);

  async function loadCodespaces() {
    setLoadingCs(true);
    try {
      const res = await fetch("/api/developers/codespaces");
      if (res.ok) {
        const data = await res.json();
        setCodespaces(data.codespaces ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingCs(false);
    }
  }

  React.useEffect(() => {
    if (hasCodespaces) loadCodespaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function csAction(name: string, action: "stop" | "delete") {
    setCsBusy(name);
    try {
      const url = `/api/developers/codespaces/${name}${action === "stop" ? "/stop" : ""}`;
      const res = await fetch(url, { method: action === "stop" ? "POST" : "DELETE" });
      if (!res.ok) {
        toast(action === "stop" ? "Failed to stop codespace" : "Failed to delete codespace", "error");
        return;
      }
      toast(action === "stop" ? "Codespace stopped" : "Codespace deleted", "success");
      await loadCodespaces();
    } catch {
      toast("Network error", "error");
    } finally {
      setCsBusy(null);
    }
  }

  async function refresh() {
    const res = await fetch("/api/developers/submissions");
    if (res.ok) {
      const data = await res.json();
      setSubmissions(data.submissions);
    }
  }

  React.useEffect(() => {
    if (!checking) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [checking]);

  async function submit() {
    setSubmitting(true);
    setConnectPrompt(null);
    try {
      const res = await fetch("/api/developers/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, engine })
      });
      if (res.status === 428) {
        const data = await res.json();
        setConnectPrompt(data.oauthUrl as string);
        toast("Connect your engine first", "error");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast(data?.error ?? "Submission failed", "error");
        return;
      }
      setRepoUrl("");
      await refresh();
      toast("Submission queued — verifying runnability…", "success");
    } catch {
      toast("Network error", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const runUrl = (s: SubmissionRow) => {
    const report = s.runReport as { url?: string } | null;
    return report?.url ?? null;
  };

  return (
    <div className="space-y-8 pt-8">
      <div>
        <h1 className="text-2xl font-bold">Developer Portal</h1>
        <p className="mt-1 text-muted-foreground">
          Submit a public GitHub repo. Servelless verifies it actually runs on a free
          cloud engine, then an admin can approve it for the marketplace.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Submit an app
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="repo">GitHub repository URL</Label>
            <Input
              id="repo"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Verification engine</Label>
            <div className="flex flex-wrap gap-2">
              {availableEngines.map((e) => (
                <Button
                  key={e.value}
                  type="button"
                  variant={engine === e.value ? "default" : "outline"}
                  disabled={!e.connected}
                  onClick={() => setEngine(e.value)}
                  title={e.connected ? undefined : "Not connected yet"}
                >
                  {e.label}
                  {!e.connected && " (connect)"}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              The app is cloned and booted in your own free {availableEngines.find((e) => e.value === engine)?.label} instance.
            </p>
          </div>

          {connectPrompt && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              This engine is not connected.{" "}
              <a href={connectPrompt} className="font-medium underline">
                Connect it
              </a>{" "}
              to submit.
            </div>
          )}

          <Button onClick={submit} disabled={submitting || !repoUrl || checking}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {checking ? "Verifying…" : "Submit for verification"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Submitted apps</p>
            <p className="text-3xl font-bold">{submissions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Approved listings</p>
            <p className="text-3xl font-bold">{apps.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total launches</p>
            <p className="text-3xl font-bold">{totalLaunches}</p>
          </CardContent>
        </Card>
      </div>

      {hasCodespaces && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                My GitHub Codespaces
              </span>
              <Button variant="ghost" size="sm" onClick={loadCodespaces} disabled={loadingCs}>
                {loadingCs ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Repo</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Open</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codespaces.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No codespaces yet. GitHub free plans cap the number you can create — delete
                    unused ones here to free up slots.
                  </TableCell>
                </TableRow>
              ) : (
                codespaces.map((cs) => (
                  <TableRow key={cs.name}>
                    <TableCell>
                      <p className="font-medium">{cs.name}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{cs.repoFullName}</TableCell>
                    <TableCell>
                      <Badge variant={cs.state === "Running" || cs.state === "Available" ? "success" : "secondary"}>
                        {cs.state}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={cs.webUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Open
                        </a>
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {cs.state === "Running" || cs.state === "Available" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={csBusy === cs.name}
                            onClick={() => csAction(cs.name, "stop")}
                          >
                            {csBusy === cs.name ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Pause className="h-4 w-4" />
                            )}
                            Stop
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={csBusy === cs.name}
                          onClick={() => {
                            if (confirm(`Delete codespace "${cs.name}"? This frees up a GitHub plan slot.`)) {
                              csAction(cs.name, "delete");
                            }
                          }}
                          title="Delete (frees a plan slot)"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            My submissions
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Repo</TableHead>
              <TableHead>Engine</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Run</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  No submissions yet. Submit a repo above to get started.
                </TableCell>
              </TableRow>
            ) : (
              submissions.map((s) => {
                const url = runUrl(s);
                const report = s.runReport as { message?: string } | null;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{s.repoFullName}</p>
                        <p className="max-w-xs truncate text-xs text-muted-foreground">
                          {s.title ?? s.repoUrl}
                        </p>
                        {s.detectedPort && (
                          <p className="text-xs text-muted-foreground">
                            port {s.detectedPort}
                            {s.startCommand ? ` · ${s.startCommand}` : ""}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.engine}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[s.status] ?? "outline"}>{s.status}</Badge>
                      {s.adminNotes && (
                        <p className="mt-1 text-xs text-muted-foreground">{s.adminNotes}</p>
                      )}
                      {report?.message && s.status === "FAILED" && (
                        <p className="mt-1 max-w-[240px] text-xs text-destructive">
                          {report.message}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {url ? (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Open
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4" />
            My approved apps
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>App</TableHead>
              <TableHead>Engine</TableHead>
              <TableHead>Launches</TableHead>
              <TableHead>Listed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                  No approved listings yet.
                </TableCell>
              </TableRow>
            ) : (
              apps.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">/{a.slug}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{LAUNCH_ENGINES[a.engineType].label}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{a.launchCount}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(a.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}