/** @type {import('next').NextConfig} */
const nextConfig = {
  // The `serverExternalPackages` option allows you to opt-out of bundling dependencies in your Server Components.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
