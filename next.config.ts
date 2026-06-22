import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pdfjs-dist', 'canvas'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
