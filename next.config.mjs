/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

export default nextConfig;
