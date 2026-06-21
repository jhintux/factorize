import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: 10 * 1024 * 1024,
    },
  },
  transpilePackages: ["@factorize/sdk"],
  allowedDevOrigins: ['*.ngrok-free.app']
};

export default withNextIntl(nextConfig);
