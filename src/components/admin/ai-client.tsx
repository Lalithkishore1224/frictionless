"use client";

import * as React from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";

interface AiRow {
  id: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  enabled: boolean;
  apiKeyMasked: string;
  updatedAt: string;
}

export function AiClient() {
  const [configs, setConfigs] = React.useState<AiRow[]>([]);
  const [provider, setProvider] = React.useState<"gemini" | "openai-compatible">("gemini");
  const [model, setModel] = React.useState("gemini-2.0-flash");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();

  async function load() {
    const res = await fetch("/api/admin/ai");
    if (res.ok) {
      const data = await res.json();
      setConfigs(data.configs);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          model,
          baseUrl: baseUrl || undefined,
          enabled: true
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast(data?.error ?? "Save failed", "error");
        return;
      }
      setApiKey("");
      await load();
      toast("AI configuration saved", "success");
    } catch {
      toast("Network error", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/admin/ai/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Delete failed", "error");
        return;
      }
      setConfigs((prev) => prev.filter((c) => c.id !== id));
      toast("AI config removed", "success");
    } catch {
      toast("Network error", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">AI Review Configuration</h2>
        <p className="text-sm text-muted-foreground">
          An admin-configured LLM helps evaluate submitted repos: it suggests the
          listing title, description, category, and flags runnability issues before
          the live run check. Deployments fall back to deterministic checks when AI
          is not configured or unreachable.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configure provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={provider === "gemini" ? "default" : "outline"}
                onClick={() => setProvider("gemini")}
              >
                Google Gemini
              </Button>
              <Button
                type="button"
                variant={provider === "openai-compatible" ? "default" : "outline"}
                onClick={() => setProvider("openai-compatible")}
              >
                OpenAI-compatible
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                placeholder="gemini-2.0-flash"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apikey">API key</Label>
              <Input
                id="apikey"
                type="password"
                placeholder="sk-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>

          {provider === "openai-compatible" && (
            <div className="space-y-1.5">
              <Label htmlFor="baseurl">Base URL (optional)</Label>
              <Input
                id="baseurl"
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Any OpenAI-compatible endpoint works (OpenAI, OpenRouter, Groq, LM Studio…).
              </p>
            </div>
          )}

          <Button onClick={save} disabled={saving || !model || !apiKey}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save configuration
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved configurations</CardTitle>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No AI provider configured yet.
            </p>
          ) : (
            <div className="space-y-3">
              {configs.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{c.model}</p>
                      <Badge variant="outline">{c.provider}</Badge>
                      {c.enabled && <Badge variant="success">active</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.apiKeyMasked}
                      {c.baseUrl ? ` · ${c.baseUrl}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)} title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}