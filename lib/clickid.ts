import { randomBytes } from "node:crypto";

// 12 bytes -> 16-char base64url token. Non-human-readable, URL-safe. Native crypto, no dep.
export function generateClickId(): string {
  return randomBytes(12).toString("base64url");
}
