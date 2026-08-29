import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submissionSchema } from "@/lib/validations";
import { handleApi, parseBody } from "@/lib/api";
import { getCredential } from "@/lib/credentials";
import { ENGINE_OAUTH_ROUTE } from "@/lib/constants";
import { normalizeRepoUrl } from "@/lib/verification";

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

  // Verification now runs in a separate worker (Render Cron Job) so long-running
  // checks survive process restarts instead of being killed with the request.

  return NextResponse.json({ submission }, { status: 201 });
});