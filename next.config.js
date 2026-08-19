/** @type {import('next').NextConfig} */

// Which site(s) may embed the buyer flow in an <iframe>. Comma-separated.
// e.g. EMBED_ORIGIN="https://mallige.org,https://www.mallige.org"
// Set EMBED_ORIGIN="*" to allow embedding on ANY site (public buyer page only).
// NOTE: next.config runs at BUILD time, so after changing EMBED_ORIGIN you must redeploy.
const raw = (process.env.EMBED_ORIGIN || '').trim();
const buyerAncestors = raw === '*'
  ? '*'
  : ["'self'", ...raw.split(',').map((s) => s.trim()).filter(Boolean)].join(' ');

const nextConfig = {
  async headers() {
    return [
      // Buyer flow (/) — embeddable by the configured site(s).
      { source: '/', headers: [{ key: 'Content-Security-Policy', value: `frame-ancestors ${buyerAncestors || "'self'"};` }] },
      // Staff & admin — never embeddable by third parties.
      { source: '/admin', headers: [{ key: 'Content-Security-Policy', value: `frame-ancestors 'self';` }] },
      { source: '/gate',  headers: [{ key: 'Content-Security-Policy', value: `frame-ancestors 'self';` }] },
      { source: '/stall', headers: [{ key: 'Content-Security-Policy', value: `frame-ancestors 'self';` }] },
    ];
  },
};

module.exports = nextConfig;
