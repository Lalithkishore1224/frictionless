import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appProductSchema } from "@/lib/validations";
import { handleApi, parseBody, type ApiContext } from "@/lib/api";

export const dynamic = "force-dynamic";

export const PATCH = handleApi(async (req, ctx: ApiContext) => {
  await requireAdmin();
  const { id } = await ctx.params;

  const existing = await prisma.appProduct.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "App not found" }, { status: 404 });

  const input = await parseBody(appProductSchema.partial(), req);
  const product = await prisma.appProduct.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.iconUrl !== undefined ? { iconUrl: input.iconUrl || null } : {}),
      ...(input.dockerImage !== undefined ? { dockerImage: input.dockerImage || null } : {}),
      ...(input.gitHubRepoUrl !== undefined ? { gitHubRepoUrl: input.gitHubRepoUrl || null } : {}),
      ...(input.engineType !== undefined ? { engineType: input.engineType } : {}),
      ...(input.targetPort !== undefined ? { targetPort: input.targetPort } : {})
    }
  });
  return NextResponse.json({ product });
});

export const DELETE = handleApi(async (_req, ctx: ApiContext) => {
  await requireAdmin();
  const { id } = await ctx.params;

  const existing = await prisma.appProduct.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "App not found" }, { status: 404 });

  await prisma.appProduct.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
