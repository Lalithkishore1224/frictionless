"use client";

import * as React from "react";
import type { AppProduct, LaunchEngine } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { LAUNCH_ENGINES } from "@/lib/constants";

interface FormState {
  title: string;
  slug: string;
  description: string;
  iconUrl: string;
  dockerImage: string;
  gitHubRepoUrl: string;
  engineType: LaunchEngine;
  targetPort: string;
}

const emptyForm: FormState = {
  title: "",
  slug: "",
  description: "",
  iconUrl: "",
  dockerImage: "",
  gitHubRepoUrl: "",
  engineType: "OAUTH_CLOUD_FLY",
  targetPort: "8080"
};

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: AppProduct;
  onSaved: (product: AppProduct) => void;
}) {
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setError(null);
      setForm(
        product
          ? {
              title: product.title,
              slug: product.slug,
              description: product.description,
              iconUrl: product.iconUrl ?? "",
              dockerImage: product.dockerImage ?? "",
              gitHubRepoUrl: product.gitHubRepoUrl ?? "",
              engineType: product.engineType,
              targetPort: String(product.targetPort)
            }
          : emptyForm
      );
    }
  }, [open, product]);

  const engine = LAUNCH_ENGINES[form.engineType];
  const isDocker = form.engineType === "OAUTH_CLOUD_FLY";

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title,
        slug: form.slug || undefined,
        description: form.description,
        iconUrl: form.iconUrl || undefined,
        dockerImage: isDocker ? form.dockerImage || undefined : undefined,
        gitHubRepoUrl: isDocker ? undefined : form.gitHubRepoUrl || undefined,
        engineType: form.engineType,
        targetPort: Number(form.targetPort)
      };
      const res = await fetch(
        product ? `/api/admin/products/${product.id}` : "/api/admin/products",
        {
          method: product ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save app");
        return;
      }
      onSaved(data.product);
    } catch {
      setError("Network error while saving");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader
        title={product ? "Edit App" : "Register New App"}
        description="Configure how this app is launched and hosted."
        onClose={() => onOpenChange(false)}
      />
      <form onSubmit={submit}>
        <DialogContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="PDF Converter"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="pdf-converter"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="port">Target Port</Label>
              <Input
                id="port"
                type="number"
                min={1}
                max={65535}
                value={form.targetPort}
                onChange={(e) => set("targetPort", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Convert, merge and split PDF files in your browser."
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="iconUrl">Icon URL</Label>
            <Input
              id="iconUrl"
              value={form.iconUrl}
              onChange={(e) => set("iconUrl", e.target.value)}
              placeholder="https://…/icon.png"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="engine">Launch Engine</Label>
            <Select
              id="engine"
              value={form.engineType}
              onChange={(e) => set("engineType", e.target.value as LaunchEngine)}
            >
              {(Object.keys(LAUNCH_ENGINES) as LaunchEngine[]).map((key) => (
                <option key={key} value={key}>
                  {LAUNCH_ENGINES[key].label} — {LAUNCH_ENGINES[key].description}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{engine.blurb}</p>
          </div>

          {isDocker ? (
            <div className="space-y-1.5">
              <Label htmlFor="dockerImage">Docker Image</Label>
              <Input
                id="dockerImage"
                value={form.dockerImage}
                onChange={(e) => set("dockerImage", e.target.value)}
                placeholder="ghcr.io/myorg/pdf-converter:latest"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="repo">GitHub Repository</Label>
              <Input
                id="repo"
                value={form.gitHubRepoUrl}
                onChange={(e) => set("gitHubRepoUrl", e.target.value)}
                placeholder="https://github.com/myorg/pdf-converter"
              />
            </div>
          )}

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {product ? "Save changes" : "Register App"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
