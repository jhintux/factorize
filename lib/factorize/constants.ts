import { address, type Address, type Rpc, type SolanaRpcApi } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";

export const FACTORIZE_PROGRAM_ID = address(
  "6YWgPX8CbreGMdPAkCnXxLG5xW9T8LiTQHqafP3C3GhT",
);

export const USDC_DECIMALS = 6;
export const ONE_USDC = 10n ** BigInt(USDC_DECIMALS);

/** Seconds before on-chain settle_date to fire settle_invoice (validator clock). */
export const DEMO_SETTLE_MARGIN_SEC = 60;

export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = address(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

export const SYSTEM_PROGRAM_ADDRESS = address(
  "11111111111111111111111111111111",
);

export async function resolveTokenProgramForMint(
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
): Promise<Address> {
  const { value: accountInfo } = await rpc
    .getAccountInfo(mint, { encoding: "base64" })
    .send();

  if (accountInfo?.owner === TOKEN_2022_PROGRAM_ADDRESS) {
    return TOKEN_2022_PROGRAM_ADDRESS;
  }

  return TOKEN_PROGRAM_ADDRESS;
}

/** Server-side reads/writes — no browser Origin, so avoid Helius domain-restricted keys. */
export function getServerRpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    "https://api.devnet.solana.com"
  );
}

/** Client-side RPC (browser sends Origin, so Helius domain allowlists apply). */
export function getClientRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    process.env.SOLANA_RPC_URL ??
    "https://api.devnet.solana.com"
  );
}

export function getRpcUrl(): string {
  if (typeof window === "undefined") {
    return getServerRpcUrl();
  }
  return getClientRpcUrl();
}

export function getUsdcMint(): Address | null {
  const mint = process.env.NEXT_PUBLIC_USDC_MINT;
  return mint ? address(mint) : null;
}
