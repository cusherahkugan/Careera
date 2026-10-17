import { randomUUID } from 'crypto'
import type { NextConfig } from 'next'

// One id per server run. Child workers inherit it; reloading this file inside
// the same process keeps the existing value. lib/auth.ts uses it to sign
// everyone out when the server restarts.
process.env.APP_BOOT_ID = process.env.APP_BOOT_ID || randomUUID()

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