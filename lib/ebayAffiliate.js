const CAMPAIGN_ID = "5339155833";
const ROTATION_ID = "706-53473-19255-0"; // eBay CA

/**
 * Transforme un lien eBay standard en lien affilié eBay Partner Network.
 * Retourne null si l'URL est invalide ou non-eBay.
 */
export function toAffiliateUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("ebay.")) return null;
    u.searchParams.set("mkevt", "1");
    u.searchParams.set("mkcid", "1");
    u.searchParams.set("mkrid", ROTATION_ID);
    u.searchParams.set("campid", CAMPAIGN_ID);
    u.searchParams.set("toolid", "10001");
    return u.toString();
  } catch {
    return null;
  }
}
