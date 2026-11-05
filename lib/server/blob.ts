// Small wrapper over Vercel Blob for append-only records (clickstream batches, eval runs).
// The app works without Blob: writes are skipped and reads return nothing.

import { get, list, put } from "@vercel/blob";

const access = (process.env.BLOB_ACCESS === "public" ? "public" : "private") as "public" | "private";

export function blobConfigured(): boolean {
  // A connected store provides either a read-write token or OIDC credentials (BLOB_STORE_ID).
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export async function putJson(pathname: string, data: unknown): Promise<boolean> {
  if (!blobConfigured()) return false;
  try {
    await put(pathname, JSON.stringify(data), { access, addRandomSuffix: true, contentType: "application/json" });
    return true;
  } catch (e) {
    console.error("blob put failed", (e as Error).message);
    return false;
  }
}

const cache = new Map<string, { at: number; value: unknown[] }>();

/** Reads up to `limit` newest JSON blobs under a prefix. Cached per instance to save operations. */
export async function readJsonList<T>(prefix: string, limit: number, ttlMs = 60_000): Promise<T[]> {
  if (!blobConfigured()) return [];
  const hit = cache.get(prefix);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T[];
  try {
    const res = await list({ prefix, limit: 1000 });
    const newest = res.blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt)).slice(0, limit);
    const out: T[] = [];
    for (const b of newest) {
      const r = await get(b.pathname, { access });
      if (r && r.statusCode === 200) out.push(JSON.parse(await new Response(r.stream).text()) as T);
    }
    cache.set(prefix, { at: Date.now(), value: out });
    return out;
  } catch (e) {
    console.error("blob read failed", (e as Error).message);
    return [];
  }
}

export function invalidate(prefix: string) {
  cache.delete(prefix);
}
