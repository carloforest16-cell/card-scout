import { NextResponse } from "next/server";

import { resolveFullName } from "@/lib/nhlPlayerLanding";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";
import { resolveEbayBearerToken } from "@/lib/ebayServer";

const EBAY_BROWSE_SEARCH =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";

export const dynamic = "force-dynamic";

/**
 * @param {string} name
 * @returns {Array<{ title: string; price: string; imageUrl: string | null; url: string }>}
 */
function buildMockCards(name) {
  const n = (name && name.trim()) || "Joueur NHL";
  return [
    {
      title: `${n} — Upper Deck Young Guns (RC)`,
      price: "412,99 $ CA",
      imageUrl: null,
      url: `https://www.ebay.ca/sch/i.html?_nkw=${encodeURIComponent(`${n} young guns rookie`)}`,
    },
    {
      title: `${n} — SP Authentic Future Watch /999`,
      price: "189,50 $ CA",
      imageUrl: null,
      url: `https://www.ebay.ca/sch/i.html?_nkw=${encodeURIComponent(`${n} future watch`)}`,
    },
    {
      title: `${n} — O-Pee-Chee Platinum Marquee Rookie`,
      price: "47,25 $ CA",
      imageUrl: null,
      url: `https://www.ebay.ca/sch/i.html?_nkw=${encodeURIComponent(`${n} opc platinum`)}`,
    },
  ];
}

function formatEbayPrice(value, currency) {
  if (value == null || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return `${value} ${currency ?? ""}`.trim();
  try {
    return new Intl.NumberFormat("fr-CA", {
      style: "currency",
      currency: currency || "CAD",
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${value} ${currency ?? ""}`.trim();
  }
}

function mapEbayItem(item) {
  const price = item.price;
  const priceStr = formatEbayPrice(price?.value, price?.currency);
  const imageUrl =
    item.image?.imageUrl ??
    item.thumbnailImages?.[0]?.imageUrl ??
    null;

  return {
    title: item.title ?? "—",
    price: priceStr,
    imageUrl,
    url: item.itemWebUrl ?? null,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const nameParam = searchParams.get("name")?.trim();
  const playerId = searchParams.get("playerId")?.trim();

  let name = nameParam;
  if (!name && playerId) {
    const landing = await getPlayerLandingCached(playerId);
    if (!landing) {
      return NextResponse.json(
        { error: "Joueur introuvable", mocked: false, cards: [] },
        { status: 404 }
      );
    }
    name = resolveFullName(landing);
  }

  if (!name) {
    return NextResponse.json(
      { error: "Paramètre requis : name ou playerId" },
      { status: 400 }
    );
  }

  const token = await resolveEbayBearerToken();

  if (!token) {
    return NextResponse.json({
      mocked: true,
      cards: buildMockCards(name),
    });
  }

  const marketplaceId =
    process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  const q = `${name} hockey card`;
  const ebayUrl = new URL(EBAY_BROWSE_SEARCH);
  ebayUrl.searchParams.set("q", q);
  ebayUrl.searchParams.set("limit", "5");

  let upstream;
  try {
    upstream = await fetch(ebayUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Impossible de joindre l’API eBay",
        detail: String(err?.message ?? err),
        mocked: false,
        cards: [],
      },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json(
      {
        error: "Réponse eBay invalide",
        status: upstream.status,
        detail: text.slice(0, 400),
        mocked: false,
        cards: [],
      },
      { status: 502 }
    );
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return NextResponse.json(
      { error: "Réponse eBay non JSON", mocked: false, cards: [] },
      { status: 502 }
    );
  }

  const summaries = Array.isArray(data.itemSummaries)
    ? data.itemSummaries
    : [];

  const cards = summaries.map(mapEbayItem).filter((c) => c.title && c.title !== "—");

  return NextResponse.json({
    mocked: false,
    cards,
  });
}
