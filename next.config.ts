import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables forbidden()/unauthorized() so denials return real 403/401 status codes.
  experimental: { authInterrupts: true },
  poweredByHeader: false,
};

export default nextConfig;
