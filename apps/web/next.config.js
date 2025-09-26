/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  // Enable standalone output for Electron packaging
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  // Disable critters optimizeCss to avoid missing module during build
  experimental: {
    optimizeCss: false,
    scrollRestoration: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Configure for Electron environment
  assetPrefix: process.env.NODE_ENV === 'production' && process.env.ELECTRON ? '' : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true, // Disable Next.js image optimization for Electron
  },
};

module.exports = nextConfig;