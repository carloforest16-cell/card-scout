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
