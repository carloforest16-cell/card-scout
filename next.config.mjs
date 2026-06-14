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
};

export default nextConfig;
