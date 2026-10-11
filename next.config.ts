import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone', // needed for the Docker image
  // resume parsing libraries must stay as plain Node requires, not bundled
  serverExternalPackages: ['pdf-parse', 'mammoth'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
}

export default nextConfig