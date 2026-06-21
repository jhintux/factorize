import { address, createSolanaRpc } from "@solana/kit";
import {
  fetchMaybeAnalystWhitelist,
  fetchMaybeConfig,
  findAnalystWhitelistPda,
  findConfigPda,
} from "@factorize/sdk";
import { getRpcUrl } from "./constants";

export function createFactorizeRpc() {
  return createSolanaRpc(getRpcUrl());
}

export type ProtocolConfigSummary = {
  configPda: string;
  admin: string | null;
  treasury: string | null;
  usdcMint: string | null;
  paused: boolean;
  protocolFeeBps: number;
  initialized: boolean;
};

export async function getProtocolConfigSummary(): Promise<ProtocolConfigSummary> {
  const rpc = createFactorizeRpc();
  const [configPda] = await findConfigPda();
  const config = await fetchMaybeConfig(rpc, configPda);

  if (!config.exists) {
    return {
      configPda,
      admin: null,
      treasury: null,
      usdcMint: null,
      paused: false,
      protocolFeeBps: 0,
      initialized: false,
    };
  }

  return {
    configPda,
    admin: config.data.admin,
    treasury: config.data.treasury,
    usdcMint: config.data.usdcMint,
    paused: config.data.paused,
    protocolFeeBps: config.data.protocolFeeBps,
    initialized: true,
  };
}

export async function getOnChainConfigAdmin(): Promise<string | null> {
  const summary = await getProtocolConfigSummary();
  return summary.admin;
}

export async function isAnalystWhitelistedOnChain(
  wallet: string,
): Promise<boolean> {
  const rpc = createFactorizeRpc();
  const [pda] = await findAnalystWhitelistPda({ analyst: address(wallet) });
  const account = await fetchMaybeAnalystWhitelist(rpc, pda);
  return account.exists;
}

export async function getAnalystWhitelistPda(
  wallet: string,
): Promise<string> {
  const [pda] = await findAnalystWhitelistPda({ analyst: address(wallet) });
  return pda;
}
