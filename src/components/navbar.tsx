"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cloud, FolderGit2, LayoutDashboard, LogOut, Rocket, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface Me {
  user: {
    id: string;
    email: string;
    name?: string | null;
    avatarUrl?: string | null;
    isAdmin: boolean;
  } | null;
}

export function Navbar() {
  const [me, setMe] = React.useState<Me["user"] | null | undefined>(undefined);
  const router = useRouter();
  const { toast } = useToast();

  React.useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data: Me) => setMe(data.user))
      .catch(() => setMe(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast("Signed out", "info");
    router.refresh();
    setMe(null);
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Cloud className="h-4 w-4" />
          </span>
          Servelless
        </Link>

        <nav className="flex items-center gap-1">
          {me && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/developers">
                  <FolderGit2 className="h-4 w-4" />
                  Developers
                </Link>
              </Button>
              {me.isAdmin && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin">
                    <Shield className="h-4 w-4" />
                    Admin
                  </Link>
                </Button>
              )}
            </>
          )}

          {me ? (
            <div className="ml-2 flex items-center gap-2">
              {me.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase">
                  {me.email?.slice(0, 1) ?? "?"}
                </span>
              )}
              <span className="hidden text-sm text-muted-foreground md:inline">
                {me.name ?? me.email}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button size="sm" asChild>
              <Link href="/login">
                <Rocket className="h-4 w-4" />
                Sign in
              </Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
