import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  createFactorizeRpc,
  getProtocolConfigSummary,
} from "./protocolState";
import { getUsdcMint, resolveTokenProgramForMint } from "./constants";

export async function getTreasuryUsdcBalance(): Promise<{
  treasury: string | null;
  balanceRaw: bigint;
  balanceFormatted: string;
}> {
  const protocol = await getProtocolConfigSummary();
  if (!protocol.treasury || !protocol.usdcMint) {
    return { treasury: protocol.treasury, balanceRaw: 0n, balanceFormatted: "0" };
  }

  const rpc = createFactorizeRpc();
  const mint = address(protocol.usdcMint);
  const tokenProgram = await resolveTokenProgramForMint(rpc, mint);
  const [ata] = await findAssociatedTokenPda({
    owner: address(protocol.treasury),
    mint,
    tokenProgram,
  });

  try {
    const { value } = await rpc.getTokenAccountBalance(ata).send();
    const balanceRaw = BigInt(value.amount);
    const decimals = value.decimals;
    const whole = balanceRaw / 10n ** BigInt(decimals);
    const fraction = balanceRaw % 10n ** BigInt(decimals);
    const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
    const balanceFormatted = fractionStr ? `${whole}.${fractionStr}` : whole.toString();
    return { treasury: protocol.treasury, balanceRaw, balanceFormatted };
  } catch {
    return { treasury: protocol.treasury, balanceRaw: 0n, balanceFormatted: "0" };
  }
}
