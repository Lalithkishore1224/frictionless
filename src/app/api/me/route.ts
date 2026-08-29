import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });

  const [user, deployments, engines] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.sub } }),
    prisma.deployment.findMany({
      where: { userId: session.sub },
      select: { id: true, status: true }
    }),
    prisma.userCredential.findMany({
      where: { userId: session.sub },
      select: { provider: true }
    })
  ]);

  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isAdmin: session.isAdmin ?? false
    },
    connectedEngines: engines.map((e) => e.provider),
    deploymentCount: deployments.length
  });
});
