import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: output: "export" removed to support /api/parse-receipt route
  // Deploy to Vercel, Fly.io, or any Node.js host (not GitHub Pages anymore)
  images: {
    unoptimized: true,
  },
  // Production basePath for /top-up-lah repo (only used for static asset URLs)
  basePath: process.env.NODE_ENV === "production" ? "/top-up-lah" : "",
  assetPrefix: process.env.NODE_ENV === "production" ? "/top-up-lah" : "",
};

export default nextConfig;