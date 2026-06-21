import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@factorize/sdk"],
  experimental: {
    serverActions: {
      bodySizeLimit: 10 * 1024 * 1024,
    },
  },
  allowedDevOrigins: ['1e8a-2800-e2-b480-2244-38e7-20d3-765e-8483.ngrok-free.app']
};

export default withNextIntl(nextConfig);
