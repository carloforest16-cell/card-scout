import "server-only";

import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";

const FEED_URL = "https://www.sportsnet.ca/hockey/nhl/feed/";
const CACHE_PATHNAME = "nhl-feed-cache-v4.json";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

let memCache = { fetchedAt: 0, items: null };

const TYPE_MAP = [
  {
    type: "TRADE",
    label: "Échange",
    color: "#60a5fa",
    re: /\btrad(e[sd]?|ing)\b|\bacquired?\b|\bswap(ped)?\b|\bsendsb|\bdealt\b/i,
  },
  {
    type: "INJURY",
    label: "Blessure",
    color: "#f87171",
    re: /\binju(ry|ries|red)\b|\bday-to-day\b|\b(upper|lower)\s+body\b|\bsidelined\b|\binjury\s+update\b|\bIR\b|\bplaced\s+on\b/i,
  },
  {
    type: "CONTRAT",
    label: "Contrat",
    color: "#34d399",
    re: /\bsign(s|ed|ing)?\b|\bcontract\b|\bextend(s|ed|ion)?\b|\$\d|\bfree\s+agent\b|\bUFA\b|\bRFA\b|\byear\s+deal\b/i,
  },
  {
    type: "DRAFT",
    label: "Repêchage",
    color: "#a78bfa",
    re: /\bdraft\b|\brepechage\b|\bpick(s)?\b|\bselect(ed|s)?\b|\bprospect\b/i,
  },
];

function classifyItem(title) {
  for (const { type, label, color, re } of TYPE_MAP) {
    if (re.test(title)) return { type, label, color };
  }
  return { type: "NEWS", label: "Nouvelles", color: "#94a3b8" };
}

const HTML_ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#8216;": "‘",
  "&#8217;": "’", "&#8220;": "“", "&#8221;": "”", "&#8230;": "…",
  "&nbsp;": " ", "&#038;": "&", "&apos;": "'",
};

function decodeEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z#0-9]+;/gi, (e) => HTML_ENTITIES[e] ?? e);
}

function extractCdata(chunk, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, "i");
  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const raw = (chunk.match(cdataRe)?.[1] ?? chunk.match(plainRe)?.[1] ?? "").trim();
  return decodeEntities(raw);
}

function parseRssItems(xml) {
  const items = [];
  const parts = xml.split("<item");
  for (let i = 1; i < parts.length && items.length < 25; i++) {
    const chunk = parts[i];

    const title = extractCdata(chunk, "title");
    if (!title || title.length < 15) continue;
    // Exclure les items CMS parasites (collections, section headers)
    if (/^NHL (Page Featured|Headlines|Featured|Top Videos)/i.test(title)) continue;
    if (/^\d+ Items?$/i.test(title)) continue;

    // Link — prefer CDATA href, fallback plain
    const linkMatch =
      chunk.match(/<link><!\[CDATA\[([\s\S]*?)\]\]>/) ||
      chunk.match(/<link>(https?:\/\/[^\s<]+)/) ;
    const link = linkMatch?.[1]?.trim() ?? null;

    const dateMatch = chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const rawDate = dateMatch?.[1]?.trim() ?? null;
    let pubDate = null;
    if (rawDate) {
      try { pubDate = new Date(rawDate).toISOString(); } catch {}
    }

    // Image from media:content url or enclosure url
    const imgMatch = chunk.match(/url="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i);
    const imageUrl = imgMatch?.[1] ?? null;

    const { type, label, color } = classifyItem(title);

    // Exclure les articles généraux (opinions, features, analyses)
    if (type === "NEWS") continue;

    items.push({ title, link, pubDate, imageUrl, type, label, color });
  }
  return items;
}

export async function getNHLFeed() {
  // Memory cache
  if (memCache.items && Date.now() - memCache.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, items: memCache.items, source: "memory" };
  }

  // Persistent cache
  try {
    const cached = await readJsonCache(CACHE_PATHNAME);
    const fetchedAt = Number(cached?.fetchedAt);
    if (cached?.items?.length && Date.now() - fetchedAt < CACHE_TTL_MS) {
      memCache = { fetchedAt, items: cached.items };
      return { ok: true, items: cached.items, source: "cache" };
    }
  } catch {}

  // Fresh fetch
  let xml;
  try {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": "CardMetrics/1.0 (+https://cardmetrics.io)" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e), items: [] };
  }

  const items = parseRssItems(xml);
  const entry = { fetchedAt: Date.now(), items };
  memCache = entry;
  try { await writeJsonCache(CACHE_PATHNAME, entry); } catch {}

  return { ok: true, items, source: "fresh" };
}
