/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    proxyTimeout: 600_000, // 10 min — Format B/C normalize and verify can take >30s
  },
  async rewrites() {
    // In production, Caddy terminates TLS and proxies to this Next.js container.
    // All /api/* requests from the browser are handled here on the server side —
    // Next.js rewrites them to the backend container before the response leaves
    // this process. The browser never contacts the backend directly, so no
    // NEXT_PUBLIC_BACKEND_URL is needed or used.
    //
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
