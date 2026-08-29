import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const apps = await prisma.appProduct.findMany({
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ apps });
});
