import { prisma } from "@/lib/prisma";
import { Storefront } from "@/components/storefront";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const apps = await prisma.appProduct.findMany({
    orderBy: { createdAt: "desc" }
  });
  return <Storefront initialApps={apps} />;
}
