import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiConfigSchema } from "@/lib/validations";
import { handleApi, parseBody } from "@/lib/api";
import { encryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `••••${key.slice(-4)}`;
}

export const GET = handleApi(async () => {
  await requireAdmin();
  const configs = await prisma.aiConfig.findMany({
    orderBy: { updatedAt: "desc" }
  });
  return NextResponse.json({
    configs: configs.map((c) => ({
      id: c.id,
      provider: c.provider,
      model: c.model,
      baseUrl: c.baseUrl,
      enabled: c.enabled,
      apiKeyMasked: maskKey(c.apiKey),
      updatedAt: c.updatedAt
    }))
  });
});

export const POST = handleApi(async (req) => {
  await requireAdmin();
  const input = await parseBody(aiConfigSchema, req);

  // Keep a single active config: update the latest row if one exists,
  // otherwise create it.
  const latest = await prisma.aiConfig.findFirst({
    orderBy: { updatedAt: "desc" }
  });

  const data = {
    provider: input.provider,
    apiKey: encryptSecret(input.apiKey),
    model: input.model,
    baseUrl: input.baseUrl || null,
    enabled: input.enabled ?? true
  };

  const config = latest
    ? await prisma.aiConfig.update({ where: { id: latest.id }, data })
    : await prisma.aiConfig.create({ data });

  return NextResponse.json({ config: { id: config.id, ...data } });
});