import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCredential } from "@/lib/credentials";
import { handleApi } from "@/lib/api";
import {
  findCodespace,
  startCodespace,
  resolvePublicTunnel
} from "@/lib/engines/codespaces";
import {
  ensureCloudShellStarted,
  ensureValidGoogleToken,
  getOrCreateCloudShellKey,
  resolveCloudShellTunnel
} from "@/lib/engines/cloudshell";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const repo = url.searchParams.get("repo");
  const port = Number(url.searchParams.get("port") ?? 0);
  const engine = url.searchParams.get("engine") ?? "github";
  const slug =
    url.searchParams.get("slug") ?? (repo ? repo.split("/").pop() : undefined) ?? "app";

  if (!repo || !port) {
    return NextResponse.json({ error: "Missing repo or port" }, { status: 400 });
  }

  if (engine === "cloudshell") {
    return resolveCloudShell(req, repo, slug, port);
  }

  const credential = await getCredential(user.id, "GITHUB_CODESPACES");
  if (!credential) {
    return NextResponse.json({ url: null, ready: false });
  }

  const codespace = await findCodespace(credential.accessToken, repo);
  if (!codespace) {
    return NextResponse.json({ url: null, ready: false, state: "none" });
  }

  if (codespace.state === "Shutdown") {
    await startCodespace(credential.accessToken, codespace.name);
  }

  // Prefer the public Cloudflare tunnel URL the app publishes back to the repo.
  // It needs no GitHub session, so it works in any browser.
  const publicTunnel = await resolvePublicTunnel(repo, codespace.name, port, credential.accessToken);
  if (publicTunnel) {
    const ready = await probeUrl(publicTunnel.url);
    return NextResponse.json({
      url: publicTunnel.url,
      ready,
      state: codespace.state,
      provider: "public"
    });
  }

  const appUrl = `https://${codespace.name}-${port}.app.github.dev`;

  let ready = false;
  try {
    // Probe the forwarded port. A 401/404 during boot means the tunnel relay is
    // still starting; 2xx/3xx (including the auto pf-signin redirect) means a
    // browser will land on the app for the logged-in user.
    for (let attempt = 0; attempt < 3 && !ready; attempt += 1) {
      const res = await fetch(appUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15000)
      });
      const status = res.status;
      ready =
        status >= 200 &&
        status < 400 &&
        status !== 401 &&
        status !== 403 &&
        status !== 404;
      if (!ready) await new Promise((r) => setTimeout(r, 4000));
    }
  } catch {
    ready = false;
  }

  return NextResponse.json({
    url: appUrl,
    ready,
    state: codespace.state
  });
});

async function resolveCloudShell(
  req: Request,
  repo: string,
  slug: string,
  port: number
): Promise<NextResponse> {
  const user = await requireUser();
  let credential;
  try {
    credential = await ensureValidGoogleToken(user.id);
  } catch (err) {
    return NextResponse.json(
      { url: null, ready: false, error: err instanceof Error ? err.message : "Google Cloud Shell not connected" },
      { status: 400 }
    );
  }

  let env = null;
  try {
    const key = await getOrCreateCloudShellKey(user.id);
    env = await ensureCloudShellStarted(
      credential.accessToken,
      key.publicKey,
      key.privateKey
    );
  } catch {
    env = null;
  }

  // Wait for the app's public tunnel URL to appear in the repo.
  let tunnelUrl: string | null = null;
  let ready = false;
  for (let i = 0; i < 20; i += 1) {
    tunnelUrl = await resolveCloudShellTunnel(repo, slug, port);
    if (!tunnelUrl) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    ready = await probeUrl(tunnelUrl);
    if (ready) break;
    await new Promise((r) => setTimeout(r, 5000));
  }

  return NextResponse.json({
    url: tunnelUrl,
    ready,
    state: env?.state ?? "unknown",
    provider: "public"
  });
}

async function probeUrl(target: string): Promise<boolean> {
  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000)
    });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}