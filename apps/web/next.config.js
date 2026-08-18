/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    // Transforms `import { X } from 'lucide-react'` into direct-path
    // imports so only the icons actually used are bundled.
    optimizePackageImports: ['lucide-react'],
  },
};

module.exports = nextConfig;
