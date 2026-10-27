import type { NextConfig } from "next";

const internalApiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.thermocontrol.medicalthermo.com";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: internalApiUrl
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiUrl}/api/:path*`
      },
      {
        source: "/uploads/:path*",
        destination: `${internalApiUrl}/uploads/:path*`
      }
    ];
  },
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "**"
      },
      {
        protocol: "https",
        hostname: "**"
      }
    ]
  },
  turbopack: {
    root: __dirname
  }
};

export default nextConfig;

