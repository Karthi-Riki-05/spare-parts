/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    proxyTimeout: 600_000, // 10 min — Format B/C normalize and verify can take >30s
  },
  async rewrites() {
    // All /api/* requests from the browser are handled server-side — Next.js
    // rewrites them to the backend container before the response leaves this
    // process. The browser never contacts the backend directly, so no
    // NEXT_PUBLIC_BACKEND_URL is needed or used.
    //
    // In production, CloudFront terminates TLS and forwards plain HTTP to port 80.
    // In development (docker-compose.yml), BACKEND_URL=http://backend:3001.
    // For local runs outside Docker, BACKEND_URL defaults to localhost:3001.
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
