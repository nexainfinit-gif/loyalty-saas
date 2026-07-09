import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Vercel : les lambdas n'ont AUCUNE police système — on embarque DejaVu
  // (texte des strips Wallet). Sans cette inclusion, le tracing exclurait
  // les .ttf et le texte SVG rendrait des carrés (tofu).
  outputFileTracingIncludes: {
    '/api/wallet/**': ['./assets/fonts/**'],
    '/api/scan/**':   ['./assets/fonts/**'],
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
