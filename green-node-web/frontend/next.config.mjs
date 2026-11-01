/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Support output standalone for container or Vercel edge deployment
  output: process.env.NEXT_OUTPUT_STANDALONE ? 'standalone' : undefined,
};

export default nextConfig;
