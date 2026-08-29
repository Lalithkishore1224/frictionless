import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { SubmissionsClient } from "@/components/admin/submissions-client";

export const dynamic = "force-dynamic";

export default async function AdminSubmissionsPage() {
  await requireAdmin();
  const submissions = await prisma.appSubmission.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, email: true, name: true } },
      appProduct: { select: { id: true, title: true, slug: true } }
    }
  });
  return <SubmissionsClient initialSubmissions={submissions} />;
}