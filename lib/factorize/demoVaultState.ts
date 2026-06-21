import { address } from "@solana/kit";
import { fetchInvoiceVault, InvoiceStatus } from "@factorize/sdk";
import {
  createDemoRpc,
  formatMicroUsdc,
  invoiceStatusLabel,
  sleep,
} from "./demoWallet";

export type DemoVaultSnapshot = {
  status: string;
  advanceAmount: string;
  fundingAmount: string;
  repaymentAmount: string;
  settlementPool: string;
  claimedAmount: string;
  dueDate: number;
  settleDate: number;
  analyst: string;
  summary: string;
};

export async function fetchDemoVaultSnapshot(
  vaultPda: string,
): Promise<DemoVaultSnapshot | null> {
  const rpc = createDemoRpc();
  try {
    const vault = await fetchInvoiceVault(rpc, address(vaultPda));
    const status = invoiceStatusLabel(vault.data.status);
    const summary = [
      `status=${status}`,
      `funding=${formatMicroUsdc(vault.data.fundingAmount)}/${formatMicroUsdc(vault.data.advanceAmount)}`,
      `repayment=${formatMicroUsdc(vault.data.repaymentAmount)}`,
      vault.data.status === InvoiceStatus.Settled
        ? `pool=${formatMicroUsdc(vault.data.settlementPool)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      status,
      advanceAmount: vault.data.advanceAmount.toString(),
      fundingAmount: vault.data.fundingAmount.toString(),
      repaymentAmount: vault.data.repaymentAmount.toString(),
      settlementPool: vault.data.settlementPool.toString(),
      claimedAmount: vault.data.claimedAmount.toString(),
      dueDate: Number(vault.data.dueDate),
      settleDate: Number(vault.data.settleDate),
      analyst: vault.data.analyst,
      summary,
    };
  } catch {
    return null;
  }
}

export async function waitForDemoVaultSnapshot(
  vaultPda: string,
  attempts = 30,
  intervalMs = 1000,
): Promise<DemoVaultSnapshot | null> {
  for (let i = 0; i < attempts; i++) {
    const snapshot = await fetchDemoVaultSnapshot(vaultPda);
    if (snapshot) return snapshot;
    await sleep(intervalMs);
  }
  return null;
}

export function describeVaultChange(
  before: DemoVaultSnapshot | null,
  after: DemoVaultSnapshot | null,
): string {
  if (!after) return "Could not read vault state.";
  if (!before) return after.summary;
  const parts = [`${before.status} → ${after.status}`];
  if (before.fundingAmount !== after.fundingAmount) {
    parts.push(
      `funding ${formatMicroUsdc(BigInt(before.fundingAmount))} → ${formatMicroUsdc(BigInt(after.fundingAmount))}`,
    );
  }
  if (before.settlementPool !== after.settlementPool) {
    parts.push(
      `settlement_pool ${formatMicroUsdc(BigInt(before.settlementPool))} → ${formatMicroUsdc(BigInt(after.settlementPool))}`,
    );
  }
  return parts.join(" · ");
}
