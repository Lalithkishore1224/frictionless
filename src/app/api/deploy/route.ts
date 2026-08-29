import { NextResponse } from "next/server";
import { DeploymentStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getCredential } from "@/lib/credentials";
import { prisma } from "@/lib/prisma";
import { deploySchema } from "@/lib/validations";
import { handleApi, parseBody } from "@/lib/api";
import { config } from "@/lib/config";
import {
  ensureFlyApp,
  provisionVolume,
  createMachine,
  listVolumes,
  sanitizeAppName,
  publicUrlForMachine
} from "@/lib/engines/fly";
import {
  buildCodespacesLaunch,
  findCodespace,
  createCodespace,
  deleteCodespace,
  ensureVerificationDevcontainer,
  startCodespace,
  resolvePublicTunnel
} from "@/lib/engines/codespaces";
import {
  ensureCloudShellStarted,
  ensureValidGoogleToken,
  getOrCreateCloudShellKey,
  runRemoteCommand,
  cloudshellBootstrapScript,
  resolveCloudShellTunnel
} from "@/lib/engines/cloudshell";
import { ENGINE_OAUTH_ROUTE } from "@/lib/constants";

export const dynamic = "force-dynamic";

async function setProgress(id: string, progress: string) {
  await prisma.deployment.update({ where: { id }, data: { progress } });
}

async function finishDeploy(
  id: string,
  instanceUrl: string,
  status: DeploymentStatus,
  progress = "ready"
) {
  await prisma.deployment.update({
    where: { id },
    data: { instanceUrl, status, progress }
  });
}

export const POST = handleApi(async (req) => {
  const user = await requireUser();
  const { appId } = await parseBody(deploySchema, req);

  const app = await prisma.appProduct.findUnique({ where: { id: appId } });
  if (!app) throw new Error("App not found");

  const credential = await getCredential(user.id, app.engineType);

  if (!credential) {
    return NextResponse.json(
      {
        needsEngineAuth: true,
        engine: app.engineType,
        oauthUrl: `${ENGINE_OAUTH_ROUTE[app.engineType]}?appId=${app.id}`
      },
      { status: 428 }
    );
  }

  const deployment = await prisma.deployment.create({
    data: {
      userId: user.id,
      appId,
      instanceUrl: "",
      status: "PROVISIONING",
      progress: "starting"
    }
  });

  await prisma.appProduct.update({
    where: { id: app.id },
    data: { launchCount: { increment: 1 } }
  });

  void (async () => {
    try {
      if (app.engineType === "OAUTH_CLOUD_FLY") {
        await runFlyDeploy(
          deployment.id,
          user.id,
          app.slug,
          app.dockerImage!,
          app.targetPort,
          credential.accessToken
        );
      } else if (app.engineType === "OAUTH_CLOUD_SHELL") {
        await runCloudShellDeploy(
          deployment.id,
          user.id,
          app.slug,
          app.gitHubRepoUrl!,
          app.targetPort
        );
      } else {
        await runCodespacesDeploy(
          deployment.id,
          app.gitHubRepoUrl!,
          app.targetPort,
          credential.accessToken
        );
      }
    } catch (err) {
      console.error("deploy failed:", err);
      const message = err instanceof Error ? err.message : "Deployment failed";
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: "ERROR", progress: `error: ${message}` }
      });
    }
  })();

  return NextResponse.json({ deployment }, { status: 201 });
});

function normalizeRepo(repoUrl: string): string {
  return repoUrl
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "");
}

/**
 * Polls a public-URL resolver (the app repo's published Cloudflare tunnel)
 * until the app responds with a 2xx/3xx, or the attempt budget runs out.
 */
async function waitForPublicUrl(
  resolver: () => Promise<string | null>,
  attempts = 40
): Promise<{ url: string | null; ready: boolean }> {
  for (let i = 0; i < attempts; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const url = await resolver();
    if (!url) continue;
    try {
      const probe = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(12000)
      });
      if (probe.status >= 200 && probe.status < 400) {
        return { url, ready: true };
      }
    } catch {
      // keep polling
    }
  }
  return { url: null, ready: false };
}

async function runFlyDeploy(
  id: string,
  userId: string,
  slug: string,
  dockerImage: string,
  targetPort: number,
  accessToken: string
) {
  const appName = sanitizeAppName(`${slug}-${userId.slice(0, 8)}`);

  await setProgress(id, "creating");
  await ensureFlyApp(appName, accessToken, config.fly.org);

  await setProgress(id, "storage");
  const existingVolumes = await listVolumes(appName, accessToken);
  const volume =
    existingVolumes.find((v) => v.status === "available" || v.status === "created") ??
    (await provisionVolume(appName, accessToken, {
      sizeGb: 1,
      name: `${appName}-data`
    }));

  await setProgress(id, "booting");
  const machine = await createMachine(appName, accessToken, {
    image: dockerImage,
    targetPort,
    volumeId: volume.id,
    appName
  });

  // Poll until the machine boots, so the UI can show a live "ready" state.
  let state = machine.state;
  for (let i = 0; i < 15 && state !== "started"; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const res = await fetch(
        `https://api.machines.dev/v1/apps/${appName}/machines/${machine.id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const m = (await res.json()) as { state?: string };
      state = m.state ?? state;
    } catch {
      // keep polling
    }
  }

  const instanceUrl = publicUrlForMachine(appName, machine.name);
  await finishDeploy(
    id,
    instanceUrl,
    state === "started" ? "RUNNING" : "PROVISIONING"
  );
}

async function runCloudShellDeploy(
  id: string,
  userId: string,
  slug: string,
  repoUrl: string,
  targetPort: number
) {
  const repo = normalizeRepo(repoUrl);

  const googleCred = await ensureValidGoogleToken(userId);
  const githubCred = await getCredential(userId, "GITHUB_CODESPACES");
  if (!googleCred || !githubCred) {
    throw new Error(
      "Google Cloud Shell needs a GitHub connection too, so the app's public URL can be published. Connect GitHub Codespaces from your dashboard first."
    );
  }

  await setProgress(id, "starting");

  // Ensure we have a usable (RSA) SSH key registered for the Cloud Shell VM.
  const { privateKey, publicKey } = await getOrCreateCloudShellKey(userId);

  const env = await ensureCloudShellStarted(
    googleCred.accessToken,
    publicKey,
    privateKey
  );
  if (!env) {
    throw new Error(
      "Could not reach the Google Cloud Shell session over SSH. Open https://shell.cloud.google.com once and check it, then retry."
    );
  }

  await setProgress(id, "booting");
  const script = cloudshellBootstrapScript({
    repo,
    slug,
    port: targetPort,
    token: githubCred.accessToken
  });

  await runRemoteCommand(env, privateKey, "cat > /tmp/servelless-bootstrap.sh", {
    stdin: script,
    timeoutMs: 30000
  });
  await runRemoteCommand(
    env,
    privateKey,
    "pkill -f 'cloudflar[e]d' 2>/dev/null; [ -f /tmp/servelless-bootstrap.pid ] && kill \"$(cat /tmp/servelless-bootstrap.pid 2>/dev/null)\" 2>/dev/null; sleep 1; chmod +x /tmp/servelless-bootstrap.sh && setsid nohup /tmp/servelless-bootstrap.sh > /tmp/servelless-bootstrap.log 2>&1 < /dev/null & echo started",
    { timeoutMs: 30000 }
  );

  await setProgress(id, "tunnel");
  const { url, ready } = await waitForPublicUrl(
    () => resolveCloudShellTunnel(repo, slug, targetPort)
  );

  await finishDeploy(id, url ?? "", ready ? "RUNNING" : "PROVISIONING");
}

async function runCodespacesDeploy(
  id: string,
  repoUrl: string,
  targetPort: number,
  accessToken: string
) {
  const repo = normalizeRepo(repoUrl);
  const launch = buildCodespacesLaunch(repoUrl, { targetPort });

  await setProgress(id, "creating");

  // Inject an auto-start devcontainer (same as verification) so the app
  // actually boots and publishes a tunnel — a bare `main` codespace never
  // forwards its port, so its `app.github.dev` URL 404s.
  const verifyRef = await ensureVerificationDevcontainer(
    accessToken,
    repo,
    targetPort,
    null
  );

  let codespace = await findCodespace(accessToken, repo);
  if (verifyRef.injected) {
    // Existing codespaces were created from `main` and don't run the app;
    // delete them so the fresh codespace is created from the injected branch.
    if (codespace) {
      await deleteCodespace(accessToken, codespace.name);
      codespace = null;
    }
    codespace = await createCodespace(accessToken, repo, verifyRef.ref);
  } else if (codespace && codespace.state === "Shutdown") {
    await startCodespace(accessToken, codespace.name);
  } else if (!codespace) {
    codespace = await createCodespace(accessToken, repo, verifyRef.ref);
  }

  if (!codespace) {
    throw new Error(
      "Could not provision a Codespace automatically (check your GitHub plan limits). You can still start it manually: " +
        launch.launchUrl
    );
  }

  await setProgress(id, "booting");
  const { url, ready } = await waitForPublicUrl(
    () =>
      resolvePublicTunnel(repo, codespace.name, targetPort, accessToken).then(
        (t) => t?.url ?? null
      ),
    60
  );
  await setProgress(id, "tunnel");

  const appUrl = `https://${codespace.name}-${targetPort}.app.github.dev`;
  await finishDeploy(id, url ?? appUrl, ready ? "RUNNING" : "PROVISIONING");
}