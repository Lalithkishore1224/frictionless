import { prisma } from "@/lib/prisma";
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
import { promoteAutoStartToMain } from "@/lib/engines/codespaces";

const ENGINE_CREDENTIAL: Record<string, "GITHUB_CODESPACES" | "OAUTH_CLOUD_SHELL"> = {
  CODESPACES: "GITHUB_CODESPACES",
  CLOUD_SHELL: "OAUTH_CLOUD_SHELL"
};

export async function processSubmission(submissionId: string): Promise<void> {
  const submission = await prisma.appSubmission.findUnique({
    where: { id: submissionId }
  });
  if (!submission) return;

  try {
    await markSubmissionStatus(submission.id, "CHECKING");

    const engineCredential = ENGINE_CREDENTIAL[submission.engine];
    const credential = await getCredential(submission.userId, engineCredential);
    if (!credential) {
      await markSubmissionStatus(submission.id, "FAILED", {
        runReport: {
          ok: false,
          message: "The required engine is no longer connected. Reconnect it and resubmit.",
          engine: submission.engine
        }
      });
      return;
    }

    const ghCredential =
      engineCredential === "GITHUB_CODESPACES"
        ? credential
        : await getCredential(submission.userId, "GITHUB_CODESPACES");
    const inspected = await inspectRepo(submission.repoFullName, ghCredential?.accessToken);
    if (!inspected) {
      await markSubmissionStatus(submission.id, "FAILED", {
        runReport: {
          ok: false,
          message: "Repo not found, private, or unreachable on GitHub.",
          engine: submission.engine
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
      submission.userId,
      submission.repoFullName,
      aiEval?.port ?? staticReport.port ?? 3000,
      submission.engine,
      aiEval?.startCommand ?? staticReport.startCommand
    );

    if (run.ok) {
      const fallbackTitle = submission.repoFullName
        .split("/")[1]
        .replace(/[-_]/g, " ");
      await markSubmissionStatus(submission.id, "UNDER_REVIEW", {
        title: aiEval?.title ?? fallbackTitle,
        description:
          aiEval?.description ?? `App submitted from ${submission.repoFullName}.`,
        category: aiEval?.category ?? null,
        detectedPort: run.port ?? staticReport.port,
        startCommand: run.startCommand ?? staticReport.startCommand,
        runReport: { ...run, message: run.message }
      });
      // Permanently commit the auto-start devcontainer into the submitting
      // developer's repo (main) so ANY user can later launch it from their own
      // Codespaces account without needing write access to the repo.
      if (ghCredential?.accessToken) {
        await promoteAutoStartToMain(
          ghCredential.accessToken,
          submission.repoFullName,
          run.port ?? staticReport.port ?? 3000,
          aiEval?.startCommand ?? staticReport.startCommand
        ).catch((err) =>
          console.error("promoteAutoStartToMain failed:", err)
        );
      }
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
}

export { ENGINE_OAUTH_ROUTE };
