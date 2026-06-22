import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Local development only
  reactStrictMode: true,

  // Keep pdfjs-dist as a server-side require, not bundled by webpack
  serverExternalPackages: ['pdfjs-dist', 'canvas'],
};

export default nextConfig;
