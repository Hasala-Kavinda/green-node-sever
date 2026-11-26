import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @type {import('next').NextConfig} */
const createNextConfig = (phase) => ({
  reactStrictMode: true,
  // Keep dev server cache separate from production builds so `next build` does not break a running `next dev`
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  // Support output standalone for container or Vercel edge deployment
  output: process.env.NEXT_OUTPUT_STANDALONE ? 'standalone' : undefined,
});

export default createNextConfig;
