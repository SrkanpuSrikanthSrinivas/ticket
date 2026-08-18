/** @type {import('next').NextConfig} */
const EMBED = process.env.EMBED_ORIGIN || 'https://mkant.org';

// Allowing the MKANT origin as a frame-ancestor is what actually lets the buyer
// flow render inside their <iframe>. Without this, browsers block the embed.
// Next.js sends no X-Frame-Options by default, so this CSP is the only gate.
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-ancestors 'self' ${EMBED} https://*.mkant.org` },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
