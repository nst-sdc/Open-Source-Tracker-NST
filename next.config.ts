import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal, self-contained .next/standalone server bundle —
  // needed for the Docker/Kubernetes deployment (not used by the Vercel
  // deployment, which has its own build pipeline and ignores this).
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'github.com',
      },
    ],
  },
  // Security headers (issue #47). CSP keeps 'unsafe-inline' for scripts and
  // styles because the theme boot script in app/layout.tsx and Next.js's own
  // runtime chunks are inline — the policy still buys frame-ancestors,
  // object-src, and base-uri lockdown plus clickjacking/MIME protections.
  //
  // 'unsafe-eval' is added in development ONLY. React's dev build uses
  // eval() to rebuild component stacks, and with it blocked every page
  // logged "eval() is not supported in this environment": a permanent
  // "1 Issue" badge, and — because the dev overlay counts it as a runtime
  // error — a full page reload on every hot update instead of a refresh.
  // Production builds never call eval, so the production policy is unchanged.
  async headers() {
    const scriptSrc =
      process.env.NODE_ENV === 'development'
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'";
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.github.com https://github.com",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
