import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/portfolio",
        destination: "/#dashboard",
        permanent: false,
      },
      {
        source: "/investor",
        destination: "/#sandbox",
        permanent: false,
      },
      {
        source: "/auditor",
        destination: "/#compliance",
        permanent: false,
      },
      {
        source: "/agent",
        destination: "/#rebalancing",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
