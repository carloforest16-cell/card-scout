import "server-only";

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { get, put } from "@vercel/blob";

/**
 * Persistent JSON cache with two backends:
 *  - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production / Vercel).
 *  - Local disk (OS temp dir) otherwise — so the cache also persists in local
 *    dev without any token. This is what keeps pages fast: expensive builds
 *    (trending, hottest deals, AI scores) are written once and reused.
 *
 * The OS temp dir is used (not the project dir) to avoid triggering Next.js'
 * file watcher / Fast Refresh loops.
 */

function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

const DISK_DIR = path.join(os.tmpdir(), "card-scout-cache");

/** @param {string} pathname */
function diskFile(pathname) {
  const safe = String(pathname).replace(/[^a-zA-Z0-9._-]/g, "__");
  return path.join(DISK_DIR, safe);
}

/**
 * Read cached JSON for a logical pathname. Returns the parsed object or null.
 * @param {string} pathname
 * @returns {Promise<any | null>}
 */
export async function readJsonCache(pathname) {
  if (blobEnabled()) {
    try {
      const blob = await get(pathname, { access: "private" });
      if (!blob?.url) return null;
      const res = await fetch(blob.url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    const raw = await fs.readFile(diskFile(pathname), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write a JSON-serializable value for a logical pathname (best-effort).
 * @param {string} pathname
 * @param {unknown} value
 */
export async function writeJsonCache(pathname, value) {
  const body = JSON.stringify(value);
  if (blobEnabled()) {
    try {
      await put(pathname, body, {
        access: "private",
        allowOverwrite: true,
        contentType: "application/json",
      });
    } catch (err) {
      console.error(
        "[persistentCache] blob write failed:",
        err instanceof Error ? err.message : err
      );
    }
    return;
  }
  try {
    await fs.mkdir(DISK_DIR, { recursive: true });
    await fs.writeFile(diskFile(pathname), body, "utf8");
  } catch (err) {
    console.error(
      "[persistentCache] disk write failed:",
      err instanceof Error ? err.message : err
    );
  }
}
