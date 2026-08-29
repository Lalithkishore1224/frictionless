import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await requireAdmin();
  const submissions = await prisma.appSubmission.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, email: true, name: true } },
      appProduct: { select: { id: true, title: true, slug: true } }
    }
  });
  return NextResponse.json({ submissions });
});