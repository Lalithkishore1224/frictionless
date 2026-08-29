import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submissionReviewSchema } from "@/lib/validations";
import { handleApi, parseBody, type ApiContext } from "@/lib/api";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function uniqueSlug(base: string): Promise<string> {
  const clean = slugify(base);
  let candidate = clean;
  let i = 2;
  while (await prisma.appProduct.findUnique({ where: { slug: candidate } })) {
    candidate = `${clean}-${i}`;
    i += 1;
  }
  return candidate;
}

export const POST = handleApi(async (req, ctx: ApiContext) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const input = await parseBody(submissionReviewSchema, req);

  const submission = await prisma.appSubmission.findUnique({
    where: { id },
    include: { appProduct: true }
  });
  if (!submission) throw new Error("Submission not found");

  if (input.action === "reject") {
    const updated = await prisma.appSubmission.update({
      where: { id },
      data: { status: "REJECTED", adminNotes: input.notes || null }
    });
    return NextResponse.json({ submission: updated });
  }

  if (submission.appProductId) {
    return NextResponse.json(
      { error: "This submission is already approved." },
      { status: 409 }
    );
  }

  const repoName = submission.repoFullName.split("/")[1] ?? submission.repoFullName;
  const slug = await uniqueSlug(repoName);
  const product = await prisma.appProduct.create({
    data: {
      title: submission.title ?? repoName.replace(/[-_]/g, " "),
      slug,
      description: submission.description ?? `App submitted from ${submission.repoUrl}.`,
      gitHubRepoUrl: submission.repoUrl,
      engineType: input.engineType ?? "GITHUB_CODESPACES",
      targetPort: submission.detectedPort ?? 8080,
      developerId: submission.userId,
      submission: { connect: { id: submission.id } }
    }
  });

  const updated = await prisma.appSubmission.update({
    where: { id },
    data: {
      status: "APPROVED",
      appProductId: product.id,
      adminNotes: input.notes || null
    }
  });

  return NextResponse.json({ submission: updated, product });
});