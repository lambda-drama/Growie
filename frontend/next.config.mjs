/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production'

// In development Next.js runs as a full server — proxy API calls to the
// Frappe backend so fetch('/api/method/...') works without Frappe's reverse
// proxy sitting in front.
// In production we emit a static export that Frappe serves; the Frappe server
// itself handles /api/* so no proxy is needed.
const nextConfig = {
  ...(isDev ? {} : { output: 'export' }),

  basePath: '/growie',

  // In production Frappe serves built chunks from its public/ directory.
  // In dev the Next.js dev server serves its own assets, so no prefix needed.
  assetPrefix: isDev ? '' : '/assets/growie_app/frontend',

  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },

  ...(isDev
    ? {
        async rewrites() {
          // Allow overriding the Frappe URL via env variable
          const frappeUrl = process.env.FRAPPE_URL || 'http://localhost:8000'
          return [
            {
              // Proxy all Frappe API calls to the backend
              source: '/api/:path*',
              destination: `${frappeUrl}/api/:path*`,
            },
            {
              // Proxy file uploads and Frappe asset downloads
              source: '/files/:path*',
              destination: `${frappeUrl}/files/:path*`,
            },
          ]
        },
      }
    : {}),
}

export default nextConfig
