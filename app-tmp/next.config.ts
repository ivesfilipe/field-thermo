import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const apiOrigin = new URL(apiUrl);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: apiUrl
  },
  images: {
    dangerouslyAllowLocalIP: apiOrigin.hostname === "localhost" || apiOrigin.hostname === "127.0.0.1",
    remotePatterns: [
      {
        protocol: apiOrigin.protocol.replace(":", "") as "http" | "https",
        hostname: apiOrigin.hostname,
        ...(apiOrigin.port ? { port: apiOrigin.port } : {})
      }
    ]
  },
  turbopack: {
    root: __dirname
  }
};

export default nextConfig;
