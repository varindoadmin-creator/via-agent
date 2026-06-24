import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pdfjs-dist', 'canvas'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        // Never cache HTML pages — ensures browsers always get the latest chunk URLs after deployment.
        // Static assets under /_next/static/ are already content-addressed (hash in filename) so they
        // are safe to cache forever at the CDN; only the HTML shell needs to stay fresh.
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
