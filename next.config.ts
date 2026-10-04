import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These routes read prompts/*.md at runtime (the review API, and learning mode which runs
  // after "Save results" on a post page); make sure Vercel bundles them.
  outputFileTracingIncludes: {
    "/api/review": ["./prompts/**/*"],
    "/posts/\\[id\\]": ["./prompts/**/*"],
  },
};

export default nextConfig;
