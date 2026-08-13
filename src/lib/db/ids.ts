import { createHash } from "node:crypto";

const NAMESPACE = "6f2c0a1e-2f7b-4a1e-9a3c-1f0f3b7d5c21";

function namespaceBytes(): Buffer {
  return Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
}

export function deterministicId(name: string): string {
  const hash = createHash("sha1");
  hash.update(namespaceBytes());
  hash.update(name, "utf8");
  const bytes = hash.digest();

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export const venueId = (slug: string) => deterministicId(`venue:${slug}`);
export const spaceId = (slug: string, spaceName: string) =>
  deterministicId(`space:${slug}:${spaceName}`);
export const menuId = (slug: string, menuName: string) =>
  deterministicId(`menu:${slug}:${menuName}`);
