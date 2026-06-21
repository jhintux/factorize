"use server";

import { Connection, PublicKey } from "@solana/web3.js";
import {
  getAssessInvoiceRiskInstructionAsync,
  getClaimInvestmentInstructionAsync,
  getClaimInvoiceInstructionAsync,
  getFundInvoiceInstructionAsync,
  getInitInvoiceVaultInstructionAsync,
  getSettleInvoiceInstructionAsync,
  getSyncInvoiceStatusInstruction,
} from "@factorize/sdk";
import { address } from "@solana/kit";
import { createServiceClient } from "@/lib/supabase/server";
import { findInvoiceVaultPda, findSharesPda } from "@/lib/factorize/pdas";
import { getProtocolConfigSummary } from "@/lib/factorize/protocolState";
import {
  ensureDemoUsdcAta,
  ensureSolBalance,
  formatMicroUsdc,
  getDemoChainUnixTime,
  getDemoUsdcContext,
  findDemoTokenAta,
  mintUsdcToOwner,
  randomAdvanceMicro,
  randomRepaymentMicro,
  sendDemoInstructions,
  sendDemoInstructionSimulateThenSend,
  signerFromSecretKey,
  sleep,
} from "@/lib/factorize/demoWallet";
import {
  describeVaultChange,
  fetchDemoVaultSnapshot,
  waitForDemoVaultSnapshot,
  type DemoVaultSnapshot,
} from "@/lib/factorize/demoVaultState";
import {
  DEMO_SETTLE_MARGIN_SEC,
  getServerRpcUrl,
  getUsdcMint,
} from "@/lib/factorize/constants";
import { getSolBalanceLamports } from "@/lib/factorize/demoSolBalance";
import {
  canActAsDemoInvestor,
  canInitDemoInvoice,
  DEMO_INVESTOR_MIN_LAMPORTS,
  DEMO_ISSUER_MIN_LAMPORTS,
  formatSol,
} from "@/lib/factorize/demoSolBudget";

export type DemoFlowType = "settle" | "expire" | "default";

export type DemoInvoiceListEntry = {
  id: string;
  invoice_id: string;
  sme_wallet: string;
  sme_label: string;
  vault_pda: string;
  flow_type: DemoFlowType;
  advance_amount_usdc: string;
  repayment_amount_usdc: string;
  due_date: string;
  settle_date: string;
  on_chain_status: string;
  funding_amount_usdc: string;
  settlement_pool: string;
};

export type DemoFlowContext = {
  invoiceDemoId: string;
  smeDemoId: string;
  smeWallet: string;
  invoiceId: string;
  vaultPda: string;
  sharesPda: string;
  advanceAmount: string;
  repaymentAmount: string;
  dueDate: number;
  settleDate: number;
  flowType: DemoFlowType;
  analystWallet: string;
  investorSmeIds: string[];
};

export type DemoStepResult = {
  ok: true;
  signature?: string;
  vaultBefore: DemoVaultSnapshot | null;
  vaultAfter: DemoVaultSnapshot | null;
  detail: string;
  invoiceDemoId?: string;
};

export type DemoInvoiceLogEntry = {
  id: string;
  step_order: number;
  title: string;
  description: string;
  signature: string | null;
  status: "complete" | "error";
  created_at: string;
};

type DemoStepError = {
  ok: false;
  error: string;
};

async function loadSmeSigner(smeDemoId: string) {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .from("sme_demo")
    .select("wallet, secret_key")
    .eq("id", smeDemoId)
    .single();

  if (error || !data) throw new Error("SME demo wallet not found");
  const signer = await signerFromSecretKey(data.secret_key);
  return { signer, wallet: data.wallet };
}

async function loadAnalystSigner() {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .from("analyst_demo")
    .select("wallet, secret_key")
    .eq("confirmed", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error("No confirmed analyst in analyst_demo. Add one first.");
  }

  const signer = await signerFromSecretKey(data.secret_key);
  return { signer, wallet: data.wallet };
}

async function saveDemoInvoiceRow(input: {
  smeDemoId: string;
  invoiceId: string;
  vaultPda: string;
  sharesPda: string;
  advanceMicro: bigint;
  repaymentMicro: bigint;
  dueDate: number;
  settleDate: number;
  flowType: DemoFlowType;
}): Promise<string> {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data: existing } = await supabase
    .from("invoice_demo")
    .select("id")
    .eq("invoice_id", input.invoiceId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: inserted, error } = await supabase
    .from("invoice_demo")
    .insert({
      sme_demo_id: input.smeDemoId,
      invoice_id: input.invoiceId,
      vault_pda: input.vaultPda,
      shares_mint: input.sharesPda,
      advance_amount_usdc: input.advanceMicro.toString(),
      repayment_amount_usdc: input.repaymentMicro.toString(),
      due_date: new Date(input.dueDate * 1000).toISOString(),
      settle_date: new Date(input.settleDate * 1000).toISOString(),
      flow_type: input.flowType,
    })
    .select("id")
    .single();

  if (error || !inserted) throw new Error("Failed to save invoice_demo row");
  return inserted.id;
}

export async function saveDemoInvoiceLog(input: {
  invoiceDemoId: string;
  stepOrder: number;
  title: string;
  description: string;
  signature?: string;
  status: "complete" | "error";
}): Promise<{ ok: true } | DemoStepError> {
  try {
    const supabase = createServiceClient();
    if (!supabase) return { ok: false, error: "Supabase is not configured" };

    const { error } = await supabase.from("invoice_demo_log").upsert(
      {
        invoice_demo_id: input.invoiceDemoId,
        step_order: input.stepOrder,
        title: input.title,
        description: input.description,
        signature: input.signature ?? null,
        status: input.status,
      },
      { onConflict: "invoice_demo_id,step_order" },
    );

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save log",
    };
  }
}

const BACKFILL_STEP_TITLES: Record<DemoFlowType, string[]> = {
  settle: [
    "init_invoice_vault",
    "assess_invoice_risk",
    "fund_invoice (1/2)",
    "fund_invoice (2/2)",
    "claim_invoice",
    "settle_invoice",
    "claim_investment (1/2)",
    "claim_investment (2/2)",
  ],
  expire: [
    "init_invoice_vault",
    "assess_invoice_risk",
    "fund_invoice (1/1)",
    "sync_invoice_status",
    "claim_investment (refund)",
  ],
  default: [
    "init_invoice_vault",
    "assess_invoice_risk",
    "fund_invoice (1/2)",
    "fund_invoice (2/2)",
    "claim_invoice",
    "sync_invoice_status",
  ],
};

async function backfillDemoInvoiceLogs(invoiceDemoId: string) {
  const supabase = createServiceClient();
  if (!supabase) return;

  const { data: invoice } = await supabase
    .from("invoice_demo")
    .select("vault_pda, flow_type")
    .eq("id", invoiceDemoId)
    .single();

  if (!invoice) return;

  const connection = new Connection(getServerRpcUrl(), "confirmed");
  const signatures = await connection.getSignaturesForAddress(
    new PublicKey(invoice.vault_pda),
    { limit: 32 },
  );

  if (!signatures.length) return;

  const flowType = invoice.flow_type as DemoFlowType;
  const titles = BACKFILL_STEP_TITLES[flowType] ?? [];
  const ordered = [...signatures].reverse();

  const rows = ordered.map((entry, index) => ({
    invoice_demo_id: invoiceDemoId,
    step_order: index,
    title: titles[index] ?? `On-chain transaction (${index + 1})`,
    description: entry.err
      ? "Recovered from chain — transaction failed"
      : "Recovered from chain history",
    signature: entry.signature,
    status: entry.err ? ("error" as const) : ("complete" as const),
  }));

  await supabase.from("invoice_demo_log").upsert(rows, {
    onConflict: "invoice_demo_id,step_order",
  });
}

export async function getDemoInvoiceLogs(
  invoiceDemoId: string,
): Promise<
  { ok: true; logs: DemoInvoiceLogEntry[] } | DemoStepError
> {
  try {
    const supabase = createServiceClient();
    if (!supabase) return { ok: false, error: "Supabase is not configured" };

    let { data, error } = await supabase
      .from("invoice_demo_log")
      .select("id, step_order, title, description, signature, status, created_at")
      .eq("invoice_demo_id", invoiceDemoId)
      .order("step_order");

    if (error) return { ok: false, error: error.message };

    if (!data?.length) {
      await backfillDemoInvoiceLogs(invoiceDemoId);
      const refetch = await supabase
        .from("invoice_demo_log")
        .select("id, step_order, title, description, signature, status, created_at")
        .eq("invoice_demo_id", invoiceDemoId)
        .order("step_order");
      data = refetch.data;
      error = refetch.error;
      if (error) return { ok: false, error: error.message };
    }

    return {
      ok: true,
      logs: (data ?? []).map((row) => ({
        id: row.id,
        step_order: row.step_order,
        title: row.title,
        description: row.description,
        signature: row.signature,
        status: row.status as "complete" | "error",
        created_at: row.created_at,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load logs",
    };
  }
}

async function wrapStep(
  vaultPda: string | null,
  fn: () => Promise<{ signature?: string; detail: string; invoiceDemoId?: string }>,
): Promise<DemoStepResult | DemoStepError> {
  try {
    const vaultBefore = vaultPda ? await fetchDemoVaultSnapshot(vaultPda) : null;
    const result = await fn();
    const vaultAfter = vaultPda
      ? await waitForDemoVaultSnapshot(vaultPda)
      : null;
    const change = describeVaultChange(vaultBefore, vaultAfter);

    return {
      ok: true,
      signature: result.signature,
      vaultBefore,
      vaultAfter,
      detail: `${result.detail}${change ? ` · ${change}` : ""}`,
      invoiceDemoId: result.invoiceDemoId,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Step failed",
    };
  }
}

export async function listDemoInvoices(): Promise<DemoInvoiceListEntry[]> {
  const supabase = createServiceClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("invoice_demo")
    .select("*, sme_demo:sme_demo_id(label, wallet)")
    .order("created_at", { ascending: false });

  const rows = await Promise.all(
    (data ?? []).map(async (row) => {
      const vault = await fetchDemoVaultSnapshot(row.vault_pda);
      const sme = row.sme_demo as { label: string; wallet: string } | null;
      return {
        id: row.id,
        invoice_id: row.invoice_id,
        sme_wallet: sme?.wallet ?? "",
        sme_label: sme?.label ?? "",
        vault_pda: row.vault_pda,
        flow_type: row.flow_type as DemoFlowType,
        advance_amount_usdc: row.advance_amount_usdc.toString(),
        repayment_amount_usdc: row.repayment_amount_usdc.toString(),
        due_date: row.due_date,
        settle_date: row.settle_date,
        on_chain_status: vault?.status ?? "Unknown",
        funding_amount_usdc: vault?.fundingAmount ?? "0",
        settlement_pool: vault?.settlementPool ?? "0",
      };
    }),
  );

  return rows;
}

export async function startDemoInvoiceFlow(input: {
  smeDemoId: string;
  flowType: DemoFlowType;
}): Promise<{ ok: true; context: DemoFlowContext } | DemoStepError> {
  try {
    const supabase = createServiceClient();
    if (!supabase) return { ok: false, error: "Supabase is not configured" };

    const protocol = await getProtocolConfigSummary();
    if (!protocol.initialized || !protocol.usdcMint) {
      return { ok: false, error: "Protocol is not initialized on-chain" };
    }

    const { data: sme } = await supabase
      .from("sme_demo")
      .select("id, wallet, label")
      .eq("id", input.smeDemoId)
      .single();
    if (!sme) return { ok: false, error: "SME not found" };

    const issuerBalance = await getSolBalanceLamports(sme.wallet);
    if (issuerBalance === 0n) {
      return {
        ok: false,
        error: `${sme.label} has 0 SOL. Prefund the SME wallet on devnet before starting a flow.`,
      };
    }
    if (!canInitDemoInvoice(issuerBalance)) {
      return {
        ok: false,
        error: `${sme.label} has ${formatSol(issuerBalance)} SOL but needs at least ${formatSol(DEMO_ISSUER_MIN_LAMPORTS)} SOL to issue an invoice (account rent + tx fees).`,
      };
    }

    const { data: otherSmes } = await supabase
      .from("sme_demo")
      .select("id, wallet, label")
      .neq("id", input.smeDemoId)
      .order("created_at");

    if ((otherSmes ?? []).length < 1) {
      return {
        ok: false,
        error: "Need at least one other SME wallet to simulate investors",
      };
    }

    const participatingInvestorIds = getParticipatingInvestorIds(
      input.flowType,
      (otherSmes ?? []).map((s) => s.id),
    );

    for (const investorId of participatingInvestorIds) {
      const investor = (otherSmes ?? []).find((s) => s.id === investorId);
      if (!investor) continue;
      const investorBalance = await getSolBalanceLamports(investor.wallet);
      if (investorBalance === 0n) {
        return {
          ok: false,
          error: `Investor ${investor.label} has 0 SOL. Prefund all participating SME wallets on devnet.`,
        };
      }
      if (!canActAsDemoInvestor(investorBalance)) {
        return {
          ok: false,
          error: `Investor ${investor.label} has ${formatSol(investorBalance)} SOL but needs at least ${formatSol(DEMO_INVESTOR_MIN_LAMPORTS)} SOL (token account rent + tx fees).`,
        };
      }
    }

    const analyst = await loadAnalystSigner();

    const repaymentMicro = randomRepaymentMicro();
    const advanceMicro = randomAdvanceMicro(repaymentMicro);
    const nowSec = await getDemoChainUnixTime();
    const dueDate = nowSec + 60;
    const settleDate =
      input.flowType === "default"
        ? nowSec + 75
        : input.flowType === "settle"
          ? dueDate + 180
          : dueDate + 30;

    const invoiceId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [vaultPda] = await findInvoiceVaultPda(address(sme.wallet), invoiceId);
    const [sharesPda] = await findSharesPda(address(sme.wallet), invoiceId);

    return {
      ok: true,
      context: {
        invoiceDemoId: "",
        smeDemoId: input.smeDemoId,
        smeWallet: sme.wallet,
        invoiceId,
        vaultPda,
        sharesPda,
        advanceAmount: advanceMicro.toString(),
        repaymentAmount: repaymentMicro.toString(),
        dueDate,
        settleDate,
        flowType: input.flowType,
        analystWallet: analyst.wallet,
        investorSmeIds: (otherSmes ?? []).map((s) => s.id),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to start flow",
    };
  }
}

export async function stepInitDemoInvoiceVault(
  context: DemoFlowContext,
): Promise<DemoStepResult | DemoStepError> {
  const result = await wrapStep(null, async () => {
    const protocol = await getProtocolConfigSummary();
    const usdcMint = getUsdcMint();
    if (!protocol.initialized || !usdcMint) {
      throw new Error("Protocol or USDC mint not configured");
    }

    const existingVault = await fetchDemoVaultSnapshot(context.vaultPda);
    if (existingVault) {
      const invoiceDemoId = await saveDemoInvoiceRow({
        smeDemoId: context.smeDemoId,
        invoiceId: context.invoiceId,
        vaultPda: context.vaultPda,
        sharesPda: context.sharesPda,
        advanceMicro: BigInt(context.advanceAmount),
        repaymentMicro: BigInt(context.repaymentAmount),
        dueDate: context.dueDate,
        settleDate: context.settleDate,
        flowType: context.flowType,
      });
      context.invoiceDemoId = invoiceDemoId;
      return {
        detail: `Vault already initialized · status=${existingVault.status} · skipped init_invoice_vault`,
        invoiceDemoId,
      };
    }

    const { signer } = await loadSmeSigner(context.smeDemoId);
    await ensureSolBalance(signer.address);

    const { tokenProgram } = await getDemoUsdcContext();
    const { ata: vaultAta } = await findDemoTokenAta(
      address(context.vaultPda),
      usdcMint,
      tokenProgram,
    );

    const instruction = await getInitInvoiceVaultInstructionAsync({
      sme: signer,
      invoiceVault: address(context.vaultPda),
      shares: address(context.sharesPda),
      invoiceVaultAta: vaultAta,
      usdcMint,
      tokenProgram,
      advanceAmount: BigInt(context.advanceAmount),
      repaymentAmount: BigInt(context.repaymentAmount),
      dueDate: BigInt(context.dueDate),
      settleDate: BigInt(context.settleDate),
      invoiceId: context.invoiceId,
    });

    const signature = await sendDemoInstructions(signer, [instruction]);

    const invoiceDemoId = await saveDemoInvoiceRow({
      smeDemoId: context.smeDemoId,
      invoiceId: context.invoiceId,
      vaultPda: context.vaultPda,
      sharesPda: context.sharesPda,
      advanceMicro: BigInt(context.advanceAmount),
      repaymentMicro: BigInt(context.repaymentAmount),
      dueDate: context.dueDate,
      settleDate: context.settleDate,
      flowType: context.flowType,
    });
    context.invoiceDemoId = invoiceDemoId;

    return {
      signature,
      detail: `Created InvoiceVault PDA · advance=${formatMicroUsdc(BigInt(context.advanceAmount))} · repayment=${formatMicroUsdc(BigInt(context.repaymentAmount))} · status=Funding`,
      invoiceDemoId,
    };
  });

  if (result.ok && result.invoiceDemoId) {
    context.invoiceDemoId = result.invoiceDemoId;
  }

  return result;
}

export async function stepAssessDemoInvoice(
  context: DemoFlowContext,
): Promise<DemoStepResult | DemoStepError> {
  return wrapStep(context.vaultPda, async () => {
    const { signer, wallet } = await loadAnalystSigner();
    await ensureSolBalance(signer.address);

    const invoiceHash = new Uint8Array(32);
    crypto.getRandomValues(invoiceHash);

    const instruction = await getAssessInvoiceRiskInstructionAsync({
      analyst: signer,
      invoiceVault: address(context.vaultPda),
      invoiceId: context.invoiceId,
      invoiceHash,
    });

    const signature = await sendDemoInstructions(signer, [instruction]);
    return {
      signature,
      detail: `Analyst ${wallet.slice(0, 6)}… attested invoice_hash · verified_at set on vault`,
    };
  });
}

export async function stepFundDemoInvoice(input: {
  context: DemoFlowContext;
  investorSmeId: string;
  fundAmount: string;
}): Promise<DemoStepResult | DemoStepError> {
  return wrapStep(input.context.vaultPda, async () => {
    const usdcMint = getUsdcMint();
    if (!usdcMint) throw new Error("USDC mint not configured");

    const { tokenProgram } = await getDemoUsdcContext();
    const { signer, wallet } = await loadSmeSigner(input.investorSmeId);
    await ensureSolBalance(signer.address);
    await mintUsdcToOwner(signer.address, BigInt(input.fundAmount));

    const instruction = await getFundInvoiceInstructionAsync({
      investor: signer,
      invoiceVault: address(input.context.vaultPda),
      shares: address(input.context.sharesPda),
      usdcMint,
      tokenProgram,
      invoiceId: input.context.invoiceId,
      fundAmount: BigInt(input.fundAmount),
    });

    const signature = await sendDemoInstructions(signer, [instruction]);
    return {
      signature,
      detail: `Investor ${wallet.slice(0, 6)}… deposited ${formatMicroUsdc(BigInt(input.fundAmount))} · minted shares 1:1`,
    };
  });
}

export async function stepClaimDemoInvoiceAdvance(
  context: DemoFlowContext,
): Promise<DemoStepResult | DemoStepError> {
  return wrapStep(context.vaultPda, async () => {
    const usdcMint = getUsdcMint();
    if (!usdcMint) throw new Error("USDC mint not configured");

    const { tokenProgram } = await getDemoUsdcContext();
    const { signer, wallet } = await loadSmeSigner(context.smeDemoId);
    await ensureSolBalance(signer.address);
    await ensureDemoUsdcAta(signer.address);

    const instruction = await getClaimInvoiceInstructionAsync({
      sme: signer,
      invoiceVault: address(context.vaultPda),
      usdcMint,
      tokenProgram,
      invoiceId: context.invoiceId,
    });

    const signature = await sendDemoInstructions(signer, [instruction]);
    return {
      signature,
      detail: `SME ${wallet.slice(0, 6)}… withdrew advance from vault escrow · status remains InProgress`,
    };
  });
}

export async function prepareDemoSettleFunds(
  context: DemoFlowContext,
): Promise<{ ok: true } | DemoStepError> {
  try {
    const protocol = await getProtocolConfigSummary();
    if (!protocol.initialized || !protocol.treasury) {
      throw new Error("Protocol treasury or USDC mint not configured");
    }

    const { signer } = await loadSmeSigner(context.smeDemoId);
    await ensureSolBalance(signer.address);
    await ensureDemoUsdcAta(signer.address);

    const repayment = BigInt(context.repaymentAmount);
    await mintUsdcToOwner(signer.address, repayment);
    await ensureDemoUsdcAta(address(protocol.treasury));

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to prepare settle funds",
    };
  }
}

export async function stepSettleDemoInvoice(
  context: DemoFlowContext,
): Promise<DemoStepResult | DemoStepError> {
  return wrapStep(context.vaultPda, async () => {
    const protocol = await getProtocolConfigSummary();
    const usdcMint = getUsdcMint();
    if (!protocol.initialized || !protocol.treasury || !usdcMint) {
      throw new Error("Protocol treasury or USDC mint not configured");
    }

    const { tokenProgram } = await getDemoUsdcContext();
    const { signer, wallet } = await loadSmeSigner(context.smeDemoId);
    await ensureSolBalance(signer.address);

    const targetSec = context.settleDate - DEMO_SETTLE_MARGIN_SEC;
    let chainNow = await getDemoChainUnixTime();

    while (chainNow < targetSec) {
      await sleep(1000);
      chainNow = await getDemoChainUnixTime();
    }

    if (chainNow >= context.settleDate) {
      throw new Error(
        `Missed settle window: chain_now (${chainNow}) >= settle_date (${context.settleDate})`,
      );
    }

    const repayment = BigInt(context.repaymentAmount);
    const instruction = await getSettleInvoiceInstructionAsync({
      sme: signer,
      invoiceVault: address(context.vaultPda),
      shares: address(context.sharesPda),
      usdcMint,
      tokenProgram,
      treasury: address(protocol.treasury),
      invoiceId: context.invoiceId,
      repaymentAmount: repayment,
    });

    const signature = await sendDemoInstructionSimulateThenSend(signer, instruction);

    return {
      signature,
      detail: `SME ${wallet.slice(0, 6)}… repaid ${formatMicroUsdc(repayment)} · protocol fee to treasury · status=Settled`,
    };
  });
}

export async function stepSyncDemoInvoiceStatus(
  context: DemoFlowContext,
): Promise<DemoStepResult | DemoStepError> {
  return wrapStep(context.vaultPda, async () => {
    const { signer } = await loadSmeSigner(context.smeDemoId);
    await ensureSolBalance(signer.address);

    const instruction = getSyncInvoiceStatusInstruction({
      invoiceVault: address(context.vaultPda),
      invoiceId: context.invoiceId,
    });

    const signature = await sendDemoInstructions(signer, [instruction]);
    const vault = await fetchDemoVaultSnapshot(context.vaultPda);
    return {
      signature,
      detail: `Keeper sync_invoice_status applied due_date/settle_date rules · status=${vault?.status ?? "?"}`,
    };
  });
}

export async function stepClaimDemoInvestment(input: {
  context: DemoFlowContext;
  investorSmeId: string;
  shareAmount: string;
}): Promise<DemoStepResult | DemoStepError> {
  return wrapStep(input.context.vaultPda, async () => {
    const usdcMint = getUsdcMint();
    if (!usdcMint) throw new Error("USDC mint not configured");

    const { tokenProgram } = await getDemoUsdcContext();
    const { signer, wallet } = await loadSmeSigner(input.investorSmeId);
    await ensureSolBalance(signer.address);
    await ensureDemoUsdcAta(signer.address);

    const instruction = await getClaimInvestmentInstructionAsync({
      investor: signer,
      invoiceVault: address(input.context.vaultPda),
      shares: address(input.context.sharesPda),
      usdcMint,
      tokenProgram,
      invoiceId: input.context.invoiceId,
      sharesArg: BigInt(input.shareAmount),
    });

    const signature = await sendDemoInstructions(signer, [instruction]);
    return {
      signature,
      detail: `Investor ${wallet.slice(0, 6)}… burned ${formatMicroUsdc(BigInt(input.shareAmount))} shares · USDC payout/refund from vault`,
    };
  });
}

export async function getSecondsUntil(timestampSec: number) {
  return Math.max(0, timestampSec - Math.floor(Date.now() / 1000));
}

export async function getSecondsUntilChain(timestampSec: number) {
  const chainNow = await getDemoChainUnixTime();
  return Math.max(0, timestampSec - chainNow);
}

export async function computeFundingPlan(context: DemoFlowContext) {
  const advance = BigInt(context.advanceAmount);
  const investorIds = getParticipatingInvestorIds(
    context.flowType,
    context.investorSmeIds,
  );

  if (context.flowType === "expire") {
    const partial = advance / 2n;
    return [{ smeId: investorIds[0], amount: partial.toString() }];
  }

  const count = investorIds.length;
  const base = advance / BigInt(count);
  const remainder = advance % BigInt(count);

  return Array.from({ length: count }, (_, index) => ({
    smeId: investorIds[index],
    amount: (index === count - 1 ? base + remainder : base).toString(),
  }));
}

function getParticipatingInvestorIds(
  flowType: DemoFlowType,
  investorSmeIds: string[],
): string[] {
  const pool = investorSmeIds.slice(0, Math.min(3, investorSmeIds.length));
  if (flowType === "expire") {
    return pool.slice(0, 1);
  }
  const count = Math.max(1, Math.min(pool.length, 2));
  return pool.slice(0, count);
}
