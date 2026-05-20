/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Évite un cache Webpack corrompu en dev (HMR / refresh → moduleId is not a function). */
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
