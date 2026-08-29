import { prisma } from "@/lib/prisma";
import { ProductsClient } from "@/components/admin/products-client";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await prisma.appProduct.findMany({
    orderBy: { createdAt: "desc" }
  });
  return <ProductsClient initialProducts={products} />;
}
