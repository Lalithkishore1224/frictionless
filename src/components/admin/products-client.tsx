"use client";

import * as React from "react";
import type { AppProduct, LaunchEngine } from "@prisma/client";
import { Loader2, Pencil, Plus, Rocket, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { LAUNCH_ENGINES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { ProductFormDialog } from "@/components/admin/product-form";

export function ProductsClient({
  initialProducts
}: {
  initialProducts: AppProduct[];
}) {
  const [products, setProducts] = React.useState(initialProducts);
  const [editing, setEditing] = React.useState<AppProduct | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const { toast } = useToast();

  async function refresh() {
    const res = await fetch("/api/admin/products");
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products);
    }
  }

  async function removeProduct(product: AppProduct) {
    setDeletingId(product.id);
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        toast("Failed to delete app", "error");
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      toast(`Deleted ${product.title}`, "success");
    } catch {
      toast("Network error", "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">App Product Catalog</h2>
          <p className="text-sm text-muted-foreground">
            Register Docker images or devcontainer repositories for the marketplace.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New App
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>App</TableHead>
              <TableHead>Engine</TableHead>
              <TableHead>Image / Repo</TableHead>
              <TableHead>Port</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  No apps registered yet. Create your first listing.
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {p.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.iconUrl} alt="" className="h-8 w-8 rounded-md object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
                          <Rocket className="h-4 w-4" />
                        </span>
                      )}
                      <div>
                        <p className="font-medium">{p.title}</p>
                        <p className="text-xs text-muted-foreground">/{p.slug}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {LAUNCH_ENGINES[p.engineType].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">
                    {p.dockerImage ?? p.gitHubRepoUrl ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.targetPort}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(p.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(p)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProduct(p)}
                        disabled={deletingId === p.id}
                        title="Delete"
                      >
                        {deletingId === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <ProductFormDialog
        open={creating}
        onOpenChange={(o) => {
          setCreating(o);
          if (!o) refresh();
        }}
        onSaved={(product) => {
          setCreating(false);
          refresh();
          toast(`Created ${product.title}`, "success");
        }}
      />

      <ProductFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        product={editing ?? undefined}
        onSaved={(product) => {
          setEditing(null);
          refresh();
          toast(`Updated ${product.title}`, "success");
        }}
      />
    </div>
  );
}
