import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  basePath: process.env.NODE_ENV === "production" ? "/top-up-lah" : "",
  assetPrefix: process.env.NODE_ENV === "production" ? "/top-up-lah" : "",
};

export default nextConfig;