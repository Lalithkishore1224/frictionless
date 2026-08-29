import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submissionSchema } from "@/lib/validations";
import { handleApi, parseBody } from "@/lib/api";
import { getCredential } from "@/lib/credentials";
import { ENGINE_OAUTH_ROUTE } from "@/lib/constants";
import {
  detectRunnable,
  evaluateWithAi,
  inspectRepo,
  markSubmissionStatus,
  normalizeRepoUrl,
  runVerification
} from "@/lib/verification";

export const dynamic = "force-dynamic";

const ENGINE_CREDENTIAL: Record<string, "GITHUB_CODESPACES" | "OAUTH_CLOUD_SHELL"> = {
  CODESPACES: "GITHUB_CODESPACES",
  CLOUD_SHELL: "OAUTH_CLOUD_SHELL"
};

export const GET = handleApi(async () => {
  const user = await requireUser();
  const submissions = await prisma.appSubmission.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { appProduct: { select: { id: true, title: true, slug: true } } }
  });
  return NextResponse.json({ submissions });
});

export const POST = handleApi(async (req) => {
  const user = await requireUser();
  const input = await parseBody(submissionSchema, req);

  const repoFullName = normalizeRepoUrl(input.repoUrl);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoFullName)) {
    throw new Error("Could not parse the GitHub owner/repo from that URL.");
  }

  const engineCredential = ENGINE_CREDENTIAL[input.engine];
  const credential = await getCredential(user.id, engineCredential);
  if (!credential) {
    return NextResponse.json(
      {
        needsEngineAuth: true,
        engine: engineCredential,
        oauthUrl: `${ENGINE_OAUTH_ROUTE[engineCredential]}?next=/developers`
      },
      { status: 428 }
    );
  }

  const submission = await prisma.appSubmission.create({
    data: {
      userId: user.id,
      repoUrl: input.repoUrl.trim(),
      repoFullName,
      engine: input.engine,
      status: "PENDING"
    }
  });

  void (async () => {
    try {
      await markSubmissionStatus(submission.id, "CHECKING");

      const ghCredential =
        engineCredential === "GITHUB_CODESPACES"
          ? credential
          : await getCredential(user.id, "GITHUB_CODESPACES");
      const inspected = await inspectRepo(repoFullName, ghCredential?.accessToken);
      if (!inspected) {
        await markSubmissionStatus(submission.id, "FAILED", {
          runReport: {
            ok: false,
            message: "Repo not found, private, or unreachable on GitHub.",
            engine: input.engine
          }
        });
        return;
      }
      if (inspected.private) {
        await markSubmissionStatus(submission.id, "FAILED", {
          runReport: {
            ok: false,
            message: "The repo is private. Public repos can be verified automatically."
          }
        });
        return;
      }

      const staticReport = detectRunnable(inspected);
      const aiEval = await evaluateWithAi(inspected);
      await markSubmissionStatus(submission.id, "CHECKING", {
        staticReport: { ...staticReport, ai: aiEval ?? null }
      });

      const run = await runVerification(
        user.id,
        repoFullName,
        aiEval?.port ?? staticReport.port ?? 3000,
        input.engine,
        aiEval?.startCommand ?? staticReport.startCommand
      );

      if (run.ok) {
        const fallbackTitle = repoFullName
          .split("/")[1]
          .replace(/[-_]/g, " ");
        await markSubmissionStatus(submission.id, "UNDER_REVIEW", {
          title: aiEval?.title ?? fallbackTitle,
          description: aiEval?.description ?? `App submitted from ${repoFullName}.`,
          category: aiEval?.category ?? null,
          detectedPort: run.port ?? staticReport.port,
          startCommand: run.startCommand ?? staticReport.startCommand,
          runReport: { ...run, message: run.message }
        });
      } else {
        await markSubmissionStatus(submission.id, "FAILED", {
          runReport: run
        });
      }
    } catch (err) {
      console.error("submission verification failed:", err);
      await markSubmissionStatus(submission.id, "FAILED", {
        runReport: {
          ok: false,
          message:
            err instanceof Error ? err.message : "Verification failed unexpectedly."
        }
      });
    }
  })();

  return NextResponse.json({ submission }, { status: 201 });
});