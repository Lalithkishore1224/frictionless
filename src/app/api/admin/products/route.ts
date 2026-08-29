import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appProductSchema } from "@/lib/validations";
import { handleApi, parseBody } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await requireAdmin();
  const products = await prisma.appProduct.findMany({
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ products });
});

export const POST = handleApi(async (req) => {
  await requireAdmin();
  const input = await parseBody(appProductSchema, req);
  const slug = input.slug ?? input.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const product = await prisma.appProduct.create({
    data: {
      title: input.title,
      slug,
      description: input.description,
      iconUrl: input.iconUrl || null,
      dockerImage: input.dockerImage || null,
      gitHubRepoUrl: input.gitHubRepoUrl || null,
      engineType: input.engineType,
      targetPort: input.targetPort
    }
  });
  return NextResponse.json({ product }, { status: 201 });
});
