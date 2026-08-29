import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApi, type ApiContext } from "@/lib/api";

export const dynamic = "force-dynamic";

export const DELETE = handleApi(async (_req, ctx: ApiContext) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const existing = await prisma.appSubmission.findUnique({ where: { id } });
  if (!existing) throw new Error("Submission not found");
  await prisma.appSubmission.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});