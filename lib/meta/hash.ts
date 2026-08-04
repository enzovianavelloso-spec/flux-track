import { createHash } from "node:crypto";

// Meta CAPI requires PII fields SHA-256 hashed, lowercased + trimmed first.
export function hashPii(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
