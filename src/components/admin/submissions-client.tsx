"use client";

import * as React from "react";
import type { AppSubmission, LaunchEngine } from "@prisma/client";
import { Check, ExternalLink, Loader2, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { LAUNCH_ENGINES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

interface SubmissionRow extends AppSubmission {
  user?: { id: string; email: string; name?: string | null };
  appProduct?: { id: string; title: string; slug: string } | null;
}

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive" | "success" | "warning"> = {
  PENDING: "secondary",
  CHECKING: "secondary",
  VERIFIED: "default",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  FAILED: "destructive",
  REJECTED: "destructive"
};

const REVIEWABLE = ["VERIFIED", "UNDER_REVIEW"];

export function SubmissionsClient({
  initialSubmissions
}: {
  initialSubmissions: SubmissionRow[];
}) {
  const [submissions, setSubmissions] = React.useState(initialSubmissions);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const { toast } = useToast();

  async function refresh() {
    const res = await fetch("/api/admin/submissions");
    if (res.ok) {
      const data = await res.json();
      setSubmissions(data.submissions);
    }
  }

  async function review(s: SubmissionRow, action: "approve" | "reject", engineType?: LaunchEngine) {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/admin/submissions/${s.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, engineType })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast(data?.error ?? "Action failed", "error");
        return;
      }
      await refresh();
      toast(action === "approve" ? `Approved ${s.repoFullName} → marketplace` : "Submission rejected", "success");
    } catch {
      toast("Network error", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(s: SubmissionRow) {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/admin/submissions/${s.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Delete failed", "error");
        return;
      }
      setSubmissions((prev) => prev.filter((x) => x.id !== s.id));
      toast("Deleted submission", "success");
    } catch {
      toast("Network error", "error");
    } finally {
      setBusyId(null);
    }
  }

  const runUrl = (s: SubmissionRow) => {
    const report = s.runReport as { url?: string } | null;
    return report?.url ?? null;
  };

  const aiTitle = (s: SubmissionRow) => {
    const staticReport = s.staticReport as { ai?: { title?: string } | null } | null;
    return staticReport?.ai?.title ?? s.title;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Developer Submissions</h2>
        <p className="text-sm text-muted-foreground">
          Repos are auto-verified (run + reachable). Approve to list on the marketplace.
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Repo</TableHead>
              <TableHead>Developer</TableHead>
              <TableHead>Engine</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detect</TableHead>
              <TableHead>Run</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  No developer submissions yet.
                </TableCell>
              </TableRow>
            ) : (
              submissions.map((s) => {
                const url = runUrl(s);
                const report = s.runReport as { message?: string } | null;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p className="font-medium">{s.repoFullName}</p>
                      <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                        {aiTitle(s)}
                      </p>
                      <a
                        href={s.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                      >
                        view repo
                      </a>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{s.user?.name ?? s.user?.email}</p>
                      <p className="text-xs text-muted-foreground">{s.user?.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.engine}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[s.status] ?? "outline"}>{s.status}</Badge>
                      {report?.message && s.status === "FAILED" && (
                        <p className="mt-1 max-w-[240px] text-xs text-destructive">
                          {report.message}
                        </p>
                      )}
                      {s.adminNotes && (
                        <p className="mt-1 text-xs text-muted-foreground">{s.adminNotes}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.detectedPort ? (
                        <span className="text-sm">
                          port {s.detectedPort}
                          {s.startCommand ? (
                            <span className="block max-w-[180px] truncate text-xs text-muted-foreground">
                              {s.startCommand}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
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
                        <span className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-2">
                        {REVIEWABLE.includes(s.status) && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Engine</Label>
                            <select
                              className="rounded-md border bg-transparent px-2 py-1 text-xs"
                              defaultValue={s.engine === "CLOUD_SHELL" ? "OAUTH_CLOUD_SHELL" : "GITHUB_CODESCAPES"}
                              id={`engine-${s.id}`}
                            >
                              {(
                                Object.keys(LAUNCH_ENGINES) as LaunchEngine[]
                              ).map((engineId) => (
                                <option key={engineId} value={engineId}>
                                  {LAUNCH_ENGINES[engineId].label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="flex justify-end gap-1">
                          {REVIEWABLE.includes(s.status) && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busyId === s.id}
                                onClick={() => {
                                  const select = document.getElementById(
                                    `engine-${s.id}`
                                  ) as HTMLSelectElement | null;
                                  review(s, "approve", (select?.value ?? "GITHUB_CODESCAPES") as LaunchEngine);
                                }}
                              >
                                {busyId === s.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                                Approve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busyId === s.id}
                                onClick={() => review(s, "reject")}
                              >
                                <X className="h-4 w-4" />
                                Reject
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busyId === s.id}
                            onClick={() => remove(s)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}