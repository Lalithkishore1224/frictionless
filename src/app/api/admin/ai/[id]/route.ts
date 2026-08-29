import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApi, type ApiContext } from "@/lib/api";

export const dynamic = "force-dynamic";

export const DELETE = handleApi(async (_req, ctx: ApiContext) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const existing = await prisma.aiConfig.findUnique({ where: { id } });
  if (!existing) throw new Error("AI config not found");
  await prisma.aiConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});