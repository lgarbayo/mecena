import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phones on the LAN / tunnel to load dev assets.
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app", "*.lhr.life", "*.app.lhr.life", "192.168.*.*", "10.*.*.*"],
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
    // src/proxy.ts buffers request bodies and silently cuts them here (default 10 MB). A 20 MB dossier import is ~27 MB
    // as a base64 data URL. Keep in sync with PROXY_BODY_LIMIT_BYTES (src/server/http.ts).
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
