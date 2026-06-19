import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module (Rust/N-API) -- can't be bundled by Turbopack, needs
  // native Node require instead.
  serverExternalPackages: ["@napi-rs/canvas"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
