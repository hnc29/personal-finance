import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.PF_NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "10.1.160.237",
    "192.168.*",
    "10.*",
  ],
};
export default nextConfig;
