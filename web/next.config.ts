import type { NextConfig } from "next";

// Deployed on Vercel (Next.js preset) with Root Directory = web/. Not a static
// export: proxy.ts and server code read the Supabase session cookies. The site
// is served from the domain root there, so NEXT_BASE_PATH stays unset; set it
// only when hosting under a sub-path.
const nextConfig: NextConfig = {
  basePath: process.env.NEXT_BASE_PATH || undefined,
  // Client code needs the base path to build absolute auth redirect URLs.
  env: { NEXT_PUBLIC_BASE_PATH: process.env.NEXT_BASE_PATH || '' },
  images: { unoptimized: true },
};

export default nextConfig;
