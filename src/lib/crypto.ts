import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY ?? "";
  const decoded = Buffer.from(raw, "base64");
  cachedKey =
    decoded.length === 32
      ? decoded
      : createHash("sha256").update(raw).digest();
  return cachedKey;
}

/**
 * Encrypts a secret using AES-256-GCM.
 * Output layout: [12-byte IV][16-byte auth tag][ciphertext] -> base64.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypts a payload previously produced by encryptSecret.
 * Throws when the auth tag fails verification (tamper detection).
 */
export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}
