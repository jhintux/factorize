import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const sdkRoot = path.join(process.cwd(), "clients/js");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: 10 * 1024 * 1024,
    },
  },
  transpilePackages: ["@factorize/sdk"],
  turbopack: {
    resolveAlias: {
      "@factorize/sdk": "./clients/js",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@factorize/sdk": sdkRoot,
    };
    return config;
  },
  allowedDevOrigins: ['*.ngrok-free.app']
};

export default withNextIntl(nextConfig);
