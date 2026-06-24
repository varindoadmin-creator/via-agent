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
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        // The webpack runtime maps route segments → chunk filenames. Its URL hash can stay the same
        // across builds even when page chunks change, causing the CDN to serve a stale mapping that
        // references deleted chunk files. Force fresh fetch on every request.
        source: '/_next/static/chunks/webpack-:hash.js',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
