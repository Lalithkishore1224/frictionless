import type { LaunchEngine } from "@prisma/client";
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./crypto";

export interface DecryptedCredential {
  id: string;
  provider: LaunchEngine;
  accessToken: string;
  refreshToken?: string | null;
  privateKey?: string | null;
  expiresAt?: Date | null;
}

/**
 * Returns the user's stored engine credential with tokens decrypted,
 * or null when the user has never authorized the engine.
 */
export async function getCredential(
  userId: string,
  provider: LaunchEngine
): Promise<DecryptedCredential | null> {
  const row = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider } }
  });
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    accessToken: decryptSecret(row.accessToken),
    refreshToken: row.refreshToken ? decryptSecret(row.refreshToken) : null,
    privateKey: row.privateKey ? decryptSecret(row.privateKey) : null,
    expiresAt: row.expiresAt
  };
}

export async function saveCredential(
  userId: string,
  provider: LaunchEngine,
  input: {
    accessToken: string;
    refreshToken?: string | null;
    privateKey?: string | null;
    expiresAt?: Date | null;
  }
) {
  return prisma.userCredential.upsert({
    where: { userId_provider: { userId, provider } },
    update: {
      accessToken: encryptSecret(input.accessToken),
      refreshToken: input.refreshToken
        ? encryptSecret(input.refreshToken)
        : null,
      privateKey: input.privateKey ? encryptSecret(input.privateKey) : null,
      expiresAt: input.expiresAt ?? null
    },
    create: {
      userId,
      provider,
      accessToken: encryptSecret(input.accessToken),
      refreshToken: input.refreshToken
        ? encryptSecret(input.refreshToken)
        : null,
      privateKey: input.privateKey ? encryptSecret(input.privateKey) : null,
      expiresAt: input.expiresAt ?? null
    }
  });
}

export async function deleteCredential(userId: string, provider: LaunchEngine) {
  await prisma.userCredential.deleteMany({ where: { userId, provider } });
}
