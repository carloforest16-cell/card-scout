import "server-only";

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

// In-process memory cache — survives across requests within the same warm instance
const memCache = new Map(); // key → { value, expiresAt }
const MEM_TTL_MS = 5 * 60 * 1000; // 5 minutes

function memGet(key) {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key, value) {
  memCache.set(key, { value, expiresAt: Date.now() + MEM_TTL_MS });
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const DISK_DIR = path.join(os.tmpdir(), "card-metrics-cache");

function diskFile(pathname) {
  const safe = String(pathname).replace(/[^a-zA-Z0-9._-]/g, "__");
  return path.join(DISK_DIR, safe);
}

/**
 * Read cached JSON for a logical key. Returns the parsed object or null.
 * @param {string} key
 * @returns {Promise<any | null>}
 */
export async function readJsonCache(key) {
  const cached = memGet(key);
  if (cached !== null) return cached;

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from("cache_generic")
        .select("payload")
        .eq("key", key)
        .single();
      if (data?.payload) {
        memSet(key, data.payload);
        return data.payload;
      }
    } catch {
      // fall through to disk
    }
  }

  try {
    const raw = await fs.readFile(diskFile(key), "utf8");
    const value = JSON.parse(raw);
    memSet(key, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * Write a JSON-serializable value for a logical key (best-effort).
 * @param {string} key
 * @param {unknown} value
 */
export async function writeJsonCache(key, value) {
  memSet(key, value);

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("cache_generic").upsert(
        { key, fetched_at: new Date().toISOString(), payload: value },
        { onConflict: "key" }
      );
    } catch (err) {
      console.error(
        "[persistentCache] supabase write failed:",
        err instanceof Error ? err.message : err
      );
    }
    return;
  }

  try {
    await fs.mkdir(DISK_DIR, { recursive: true });
    await fs.writeFile(diskFile(key), JSON.stringify(value), "utf8");
  } catch (err) {
    console.error(
      "[persistentCache] disk write failed:",
      err instanceof Error ? err.message : err
    );
  }
}
