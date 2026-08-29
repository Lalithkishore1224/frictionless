import { z } from "zod";
import { LaunchEngine } from "@prisma/client";

export const appProductSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be kebab-case (e.g. pdf-converter)")
    .min(2)
    .max(60)
    .optional(),
  description: z.string().trim().min(3).max(500),
  iconUrl: z
    .string()
    .trim()
    .url("Icon must be a valid URL")
    .optional()
    .or(z.literal("")),
  dockerImage: z
    .string()
    .trim()
    .regex(/^[\w.\-/]+:[\w.\-]+$/, "Must be a Docker image ref like ghcr.io/org/app:tag")
    .optional()
    .or(z.literal("")),
  gitHubRepoUrl: z
    .string()
    .trim()
    .url("Must be a valid GitHub repository URL")
    .refine((v) => /github\.com/i.test(v), "Must point to a GitHub repository")
    .optional()
    .or(z.literal("")),
  engineType: z.nativeEnum(LaunchEngine),
  targetPort: z.coerce.number().int().min(1).max(65535).default(8080)
});

export type AppProductInput = z.infer<typeof appProductSchema>;

export const deploySchema = z.object({
  appId: z.string().uuid()
});

export const engineConsentSchema = z.object({
  engine: z.nativeEnum(LaunchEngine),
  appId: z.string().uuid()
});

export const submissionSchema = z.object({
  repoUrl: z
    .string()
    .trim()
    .url("Must be a valid repository URL")
    .refine((v) => /github\.com/i.test(v), "Must be a GitHub repository URL"),
  engine: z.enum(["CODESPACES", "CLOUD_SHELL"])
});

export type SubmissionInput = z.infer<typeof submissionSchema>;

export const submissionReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  engineType: z.nativeEnum(LaunchEngine).optional(),
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});

export const aiConfigSchema = z.object({
  provider: z.enum(["gemini", "openai-compatible"]),
  apiKey: z.string().trim().min(1, "API key is required"),
  model: z.string().trim().min(1, "Model is required"),
  baseUrl: z.string().trim().url().optional().or(z.literal("")),
  enabled: z.boolean().optional()
});

export type AiConfigInput = z.infer<typeof aiConfigSchema>;
