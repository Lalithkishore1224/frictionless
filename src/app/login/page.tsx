"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Github, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

const HAS_GOOGLE = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
const HAS_GITHUB = Boolean(process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID);
const DEV_LOGIN = process.env.NEXT_PUBLIC_DEV_LOGIN === "true";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const oauthError = searchParams.get("error");

  React.useEffect(() => {
    if (oauthError === "oauth") {
      toast("Sign-in was cancelled or failed. Try again or use the dev sign-in.", "error");
    } else if (oauthError) {
      toast(decodeURIComponent(oauthError.replace("oauth:", "")), "error");
    }
  }, [oauthError, toast]);

  async function devLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed");
        return;
      }
      toast(`Signed in as ${data.user.email}`, "success");
      const next = searchParams.get("next") ?? "/";
      router.push(next);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Sign in to Servelless</CardTitle>
        <CardDescription>
          One click to access the marketplace, your apps, and admin tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(HAS_GOOGLE || HAS_GITHUB) && (
          <div className="space-y-2">
            {HAS_GOOGLE && (
              <Button className="w-full" asChild>
                <a href="/api/auth/login/google">Sign in with Google</a>
              </Button>
            )}
            {HAS_GITHUB && (
              <Button variant="outline" className="w-full" asChild>
                <a href="/api/auth/login/github">
                  <Github className="h-4 w-4" />
                  Sign in with GitHub
                </a>
              </Button>
            )}
          </div>
        )}

        {DEV_LOGIN && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
                <span className="bg-background px-2">Dev sign-in</span>
              </div>
            </div>
            <form onSubmit={devLogin} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@servelless.app"
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Continue
              </Button>
            </form>
          </>
        )}

        {!HAS_GOOGLE && !HAS_GITHUB && !DEV_LOGIN && (
          <p className="text-sm text-muted-foreground">
            No sign-in providers are configured. Add OAuth credentials or
            enable the dev sign-in to continue.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Suspense
        fallback={
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Sign in to Servelless</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
