const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://cardmetrics.io";

/**
 * robots.txt — autorise le crawl du contenu public, bloque les zones privées
 * et les routes API. Pointe vers le sitemap dynamique.
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        // /api/og/ reste accessible : ce sont les images de partage, et les
        // robots des réseaux (X notamment) respectent robots.txt.
        allow: ["/", "/api/og/"],
        disallow: ["/api/", "/auth/", "/dashboard", "/portfolio", "/parametres", "/notifications", "/admin"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
