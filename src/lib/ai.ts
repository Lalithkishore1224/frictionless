import { prisma } from "./prisma";
import { decryptSecret } from "./crypto";

export interface AiConfig {
  id: string;
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string | null;
  enabled: boolean;
}

export async function getAiConfig(): Promise<AiConfig | null> {
  const rows = await prisma.aiConfig.findMany({
    orderBy: { updatedAt: "desc" }
  });
  const row = rows.find((r) => r.enabled);
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    apiKey: decryptSecret(row.apiKey),
    model: row.model,
    baseUrl: row.baseUrl,
    enabled: row.enabled
  };
}

/**
 * Calls the configured LLM provider (Google Gemini or any OpenAI-compatible
 * endpoint). Returns the raw text content, or null when the call fails so
 * callers can degrade gracefully to deterministic checks.
 */
export async function callLLM(
  cfg: AiConfig,
  input: { system: string; user: string; json?: boolean }
): Promise<string | null> {
  const { system, user, json } = input;
  try {
    if (cfg.provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        cfg.model
      )}:generateContent`;
      const body: Record<string, unknown> = {
        contents: [
          {
            role: "user",
            parts: [{ text: `${system}\n\n${user}` }]
          }
        ]
      };
      if (json) {
        body.generationConfig = {
          responseMimeType: "application/json",
          temperature: 0.2
        };
      }
      const res = await fetch(`${url}?key=${encodeURIComponent(cfg.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const text = data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("");
      return text && text.trim() ? text : null;
    }

    // OpenAI-compatible chat completions (OpenAI, OpenRouter, Groq, etc.)
    const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    return text && text.trim() ? text : null;
  } catch {
    return null;
  }
}

/** Extracts a JSON object from an LLM response (handles markdown fences). */
export function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}