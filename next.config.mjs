/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Évite un cache Webpack corrompu en dev (HMR / refresh → moduleId is not a function). */
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "i.ebayimg.com" },
      { protocol: "https", hostname: "assets.nhle.com" },
      { protocol: "https", hostname: "cms.nhl.bamgrid.com" },
      { protocol: "https", hostname: "*.bamgrid.com" },
    ],
  },

  experimental: {
    optimizeCss: false,
  },

  /**
   * En-têtes de sécurité sur toutes les réponses. Volontairement SANS
   * restriction des scripts/styles (script-src) : Next injecte des scripts
   * inline et une CSP stricte demanderait des nonces partout — risque de page
   * blanche. On verrouille ce qui ne casse rien : pas d'intégration du site
   * dans une iframe (clickjacking), pas de <base> ni de formulaire détourné,
   * pas de plugins, HTTPS forcé.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // /grading supprimée (tâche 5.1) — PSA/TAG ont fermé les soumissions,
      // déjà retirée de la nav/footer/sitemap.
      { source: "/grading", destination: "/analyse", permanent: true },
      // /compare fusionnée dans le mode comparaison de /deals (tâche 5.2).
      { source: "/compare", destination: "/deals", permanent: true },
      // /search était un stub placeholder jamais branché (la recherche nav
      // ouvre sa propre modale inline) — redirigé vers /deals (tâche 5.5).
      { source: "/search", destination: "/deals", permanent: true },
    ];
  },
};

export default nextConfig;
