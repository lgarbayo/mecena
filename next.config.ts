import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phones on the LAN / tunnel to load dev assets.
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app", "192.168.*.*", "10.*.*.*"],
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
