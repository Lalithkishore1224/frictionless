import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApi } from "@/lib/api";
import { engineLabel } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const user = await requireUser();
  const credentials = await prisma.userCredential.findMany({
    where: { userId: user.id }
  });
  return NextResponse.json({
    engines: credentials.map((c) => ({
      provider: c.provider,
      label: engineLabel(c.provider)
    }))
  });
});