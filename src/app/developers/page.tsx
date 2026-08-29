import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DevelopersClient } from "@/components/developers/developers-client";

export const dynamic = "force-dynamic";

export default async function DevelopersPage() {
  const user = await requireUser();
  const [submissions, credentials, apps] = await Promise.all([
    prisma.appSubmission.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        appProduct: { select: { id: true, title: true, slug: true, launchCount: true } }
      }
    }),
    prisma.userCredential.findMany({ where: { userId: user.id } }),
    prisma.appProduct.findMany({
      where: { developerId: user.id },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        engineType: true,
        targetPort: true,
        launchCount: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return (
    <DevelopersClient
      initialSubmissions={submissions}
      connectedEngines={credentials.map((c) => c.provider)}
      initialApps={apps}
    />
  );
}