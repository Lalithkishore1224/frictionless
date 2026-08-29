import Link from "next/link";
import { Gauge, Inbox, Package, Sparkles } from "lucide-react";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <div className="space-y-8 pt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Control Panel</h1>
          <p className="mt-1 text-muted-foreground">
            Manage the app catalog, cloud engines, and platform fleet.
          </p>
        </div>
        <nav className="flex gap-1">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Gauge className="h-4 w-4" />
            Fleet Dashboard
          </Link>
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Package className="h-4 w-4" />
            App Catalog
          </Link>
          <Link
            href="/admin/submissions"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Inbox className="h-4 w-4" />
            Submissions
          </Link>
          <Link
            href="/admin/ai"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Sparkles className="h-4 w-4" />
            AI Review
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
