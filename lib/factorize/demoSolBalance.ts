import { address, type Address } from "@solana/kit";
import { createDemoRpc } from "./demoWallet";

export async function getSolBalanceLamports(wallet: string): Promise<bigint> {
  const rpc = createDemoRpc();
  const { value } = await rpc.getBalance(address(wallet)).send();
  return value;
}

export async function getSolBalancesForWallets(
  wallets: string[],
): Promise<Map<string, bigint>> {
  const rpc = createDemoRpc();
  const unique = [...new Set(wallets)];

  const entries = await Promise.all(
    unique.map(async (wallet) => {
      const { value } = await rpc.getBalance(address(wallet)).send();
      return [wallet, value] as const;
    }),
  );

  return new Map(entries);
}

export async function getSolBalanceForWallet(wallet: Address): Promise<bigint> {
  const rpc = createDemoRpc();
  const { value } = await rpc.getBalance(wallet).send();
  return value;
}
