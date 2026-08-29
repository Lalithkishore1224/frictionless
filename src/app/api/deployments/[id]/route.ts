import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCredential } from "@/lib/credentials";
import { prisma } from "@/lib/prisma";
import { handleApi, type ApiContext } from "@/lib/api";
import { deleteMachine } from "@/lib/engines/fly";
import {
  ensureValidGoogleToken,
  getCloudShellEnvironment,
  stopCloudShellApp
} from "@/lib/engines/cloudshell";

export const dynamic = "force-dynamic";

export const DELETE = handleApi(async (_req, ctx: ApiContext) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const deployment = await prisma.deployment.findFirst({
    where: { id, userId: user.id },
    include: { app: true }
  });
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  if (deployment.app.engineType === "OAUTH_CLOUD_FLY") {
    const credential = await getCredential(user.id, deployment.app.engineType);
    try {
      const host = new URL(deployment.instanceUrl).hostname; // machine.app.fly.dev
      const [machineId, appName] = host.split(".");
      if (credential && machineId && appName) {
        await deleteMachine(appName, machineId, credential.accessToken);
      }
    } catch {
      // best-effort cleanup of the remote machine
    }
  }

  if (deployment.app.engineType === "OAUTH_CLOUD_SHELL") {
    try {
      const credential = await ensureValidGoogleToken(user.id);
      if (credential?.privateKey) {
        const env = await getCloudShellEnvironment(credential.accessToken);
        if (env && env.sshHost) {
          await stopCloudShellApp(env, credential.privateKey);
        }
      }
    } catch {
      // best-effort cleanup of the Cloud Shell processes
    }
  }

  await prisma.deployment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
