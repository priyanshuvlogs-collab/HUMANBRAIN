import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The review API reads prompts/*.md at runtime; make sure Vercel bundles them.
  outputFileTracingIncludes: {
    "/api/review": ["./prompts/**/*"],
  },
};

export default nextConfig;
