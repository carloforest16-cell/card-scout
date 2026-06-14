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
 *
 * Memory cache (5 min TTL) sits in front of both backends to avoid hitting
 * Blob on every request within a warm serverless instance.
 */

// In-process memory cache — survives across requests within the same warm instance
const memCache = new Map(); // pathname → { value, expiresAt }
const MEM_TTL_MS = 5 * 60 * 1000; // 5 minutes

function memGet(pathname) {
  const entry = memCache.get(pathname);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memCache.delete(pathname);
    return null;
  }
  return entry.value;
}

function memSet(pathname, value) {
  memCache.set(pathname, { value, expiresAt: Date.now() + MEM_TTL_MS });
}

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
 * Checks in-process memory cache first to avoid Blob ops on warm instances.
 * @param {string} pathname
 * @returns {Promise<any | null>}
 */
export async function readJsonCache(pathname) {
  const cached = memGet(pathname);
  if (cached !== null) return cached;

  if (blobEnabled()) {
    try {
      const blob = await get(pathname, { access: "private" });
      if (!blob?.url) return null;
      const res = await fetch(blob.url);
      if (!res.ok) return null;
      const value = await res.json();
      memSet(pathname, value);
      return value;
    } catch {
      return null;
    }
  }
  try {
    const raw = await fs.readFile(diskFile(pathname), "utf8");
    const value = JSON.parse(raw);
    memSet(pathname, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * Write a JSON-serializable value for a logical pathname (best-effort).
 * Updates in-process memory cache immediately so subsequent reads are free.
 * @param {string} pathname
 * @param {unknown} value
 */
export async function writeJsonCache(pathname, value) {
  memSet(pathname, value);

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
