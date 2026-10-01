import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Parsers run on the server only and must not be bundled.
  serverExternalPackages: ["pdf-parse", "mammoth"],
  poweredByHeader: false,
};

export default nextConfig;
