"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Environment, ParaProvider } from "@getpara/react-sdk";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import "@getpara/react-sdk/styles.css";

const API_KEY = process.env.NEXT_PUBLIC_PARA_API_KEY ?? "";
const ENVIRONMENT =
  (process.env.NEXT_PUBLIC_PARA_ENV as Environment) ||
  (process.env.NEXT_PUBLIC_PARA_ENVIRONMENT as Environment) ||
  Environment.BETA;

const queryClient = new QueryClient();

const solanaNetwork = WalletAdapterNetwork.Devnet;
const solanaEndpoint = clusterApiUrl(solanaNetwork);

export default function ParaWalletProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!API_KEY) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <h2>Missing API Key</h2>
        <p>Set NEXT_PUBLIC_PARA_API_KEY in .env.local</p>
        <p>
          Get your key at{" "}
          <a
            href="https://developer.getpara.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            developer.getpara.com
          </a>
        </p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ParaProvider
        paraClientConfig={{
          apiKey: API_KEY,
          env: ENVIRONMENT,
        }}
        config={{ appName: "Factorize" }}
        externalWalletConfig={{
          solanaConnector: {
            config: {
              endpoint: solanaEndpoint,
              chain: solanaNetwork,
              appIdentity: {
                uri:
                  typeof globalThis.window !== "undefined"
                    ? `${globalThis.window.location.protocol}//${globalThis.window.location.host}`
                    : "",
              },
            },
          },
        }}
        paraModalConfig={{
          authLayout: ["AUTH:FULL", "EXTERNAL:FULL"],
          theme: {
            foregroundColor: "#222222",
            backgroundColor: "#FFFFFF",
            accentColor: "#888888",
            mode: "light",
            borderRadius: "none",
            font: "Inter",
          },
        }}
      >
        {children}
      </ParaProvider>
    </QueryClientProvider>
  );
}
