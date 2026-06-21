"use server";

import { Keypair } from "@solana/web3.js";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getAnalystWhitelistPda,
  getProtocolConfigSummary,
  isAnalystWhitelistedOnChain,
} from "@/lib/factorize/protocolState";
import { getTreasuryUsdcBalance } from "@/lib/factorize/treasuryBalance";
import { isValidWallet } from "@/lib/auth/wallet";
import { listDemoInvoices } from "@/app/actions/demoInvoices";
import { getSolBalancesForWallets } from "@/lib/factorize/demoSolBalance";
import {
  canInitDemoInvoice,
  DEMO_ISSUER_MIN_LAMPORTS,
  demoSolBudgetSummary,
  formatSol,
} from "@/lib/factorize/demoSolBudget";

export type DemoAnalystEntry = {
  id: string;
  wallet: string;
  whitelistPda: string;
  onChainActive: boolean;
};

export type DemoSmeEntry = {
  id: string;
  label: string;
  wallet: string;
  solBalanceLamports: string;
  solBalanceFormatted: string;
  minSolRequiredLamports: string;
  minSolRequiredFormatted: string;
  canInitInvoice: boolean;
};

export type DemoSolBudget = ReturnType<typeof demoSolBudgetSummary>;

export type DemoInvoiceEntry = {
  id: string;
  invoice_id: string;
  sme_wallet: string;
  sme_label: string;
  vault_pda: string;
  flow_type: string;
  advance_amount_usdc: string;
  repayment_amount_usdc: string;
  due_date: string;
  settle_date: string;
  on_chain_status: string;
  funding_amount_usdc: string;
  settlement_pool: string;
};

async function assertOnChainAdmin(
  adminWallet: string,
): Promise<
  { ok: true } | { ok: false; error: "invalidWallet" | "notAdmin" }
> {
  if (!isValidWallet(adminWallet)) {
    return { ok: false as const, error: "invalidWallet" as const };
  }

  const protocol = await getProtocolConfigSummary();
  if (!protocol.initialized || protocol.admin !== adminWallet) {
    return { ok: false as const, error: "notAdmin" as const };
  }

  return { ok: true as const };
}

export async function getDemoPageData() {
  const supabase = createServiceClient();
  const [protocol, treasury, analystRows, smeRows, invoices] =
    await Promise.all([
      getProtocolConfigSummary(),
      getTreasuryUsdcBalance(),
      supabase
        ? supabase
            .from("analyst_demo")
            .select("id, wallet, confirmed")
            .eq("confirmed", true)
            .order("created_at")
        : Promise.resolve({ data: [] }),
      supabase
        ? supabase.from("sme_demo").select("id, label, wallet").order("created_at")
        : Promise.resolve({ data: [] }),
      listDemoInvoices(),
    ]);

  const analysts: DemoAnalystEntry[] = await Promise.all(
    (analystRows.data ?? []).map(async (row) => {
      const onChainActive = await isAnalystWhitelistedOnChain(row.wallet);
      const whitelistPda = await getAnalystWhitelistPda(row.wallet);
      return {
        id: row.id,
        wallet: row.wallet,
        whitelistPda,
        onChainActive,
      };
    }),
  );

  const smeRowsData = (smeRows.data ?? []) as Pick<
    DemoSmeEntry,
    "id" | "label" | "wallet"
  >[];
  const solBalances = await getSolBalancesForWallets(
    smeRowsData.map((row) => row.wallet),
  );

  const smes: DemoSmeEntry[] = smeRowsData.map((row) => {
    const balance = solBalances.get(row.wallet) ?? 0n;
    return {
      ...row,
      solBalanceLamports: balance.toString(),
      solBalanceFormatted: formatSol(balance),
      minSolRequiredLamports: DEMO_ISSUER_MIN_LAMPORTS.toString(),
      minSolRequiredFormatted: formatSol(DEMO_ISSUER_MIN_LAMPORTS),
      canInitInvoice: canInitDemoInvoice(balance),
    };
  });

  return {
    protocol,
    treasury: {
      treasury: treasury.treasury,
      balanceFormatted: treasury.balanceFormatted,
    },
    analysts,
    smes,
    invoices,
    solBudget: demoSolBudgetSummary(),
  };
}

export async function ensureDemoSmesSeeded() {
  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" as const };

  const { count } = await supabase
    .from("sme_demo")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) >= 5) {
    return { ok: true as const, seeded: false as const };
  }

  const existing = count ?? 0;
  const toCreate = 5 - existing;

  for (let i = 0; i < toCreate; i++) {
    const kp = Keypair.generate();
    const label = `SME ${existing + i + 1}`;

    const { error } = await supabase.from("sme_demo").insert({
      label,
      wallet: kp.publicKey.toBase58(),
      secret_key: Array.from(kp.secretKey),
    });

    if (error) return { ok: false as const, error: "seedFailed" as const };
  }

  return { ok: true as const, seeded: true as const };
}

export async function prepareDemoAnalyst(adminWallet: string) {
  const adminCheck = await assertOnChainAdmin(adminWallet);
  if (adminCheck.ok === false) {
    return { ok: false as const, error: adminCheck.error };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" as const };

  const kp = Keypair.generate();
  const wallet = kp.publicKey.toBase58();
  const whitelistPda = await getAnalystWhitelistPda(wallet);

  const { error } = await supabase.from("analyst_demo").insert({
    wallet,
    secret_key: Array.from(kp.secretKey),
    confirmed: false,
  });

  if (error) {
    return { ok: false as const, error: "insertFailed" as const };
  }

  return {
    ok: true as const,
    wallet,
    whitelistPda,
  };
}

export async function confirmDemoAnalyst(input: {
  wallet: string;
  adminWallet: string;
}) {
  const { wallet, adminWallet } = input;
  const adminCheck = await assertOnChainAdmin(adminWallet);
  if (adminCheck.ok === false) {
    return { ok: false as const, error: adminCheck.error };
  }

  if (!isValidWallet(wallet)) {
    return { ok: false as const, error: "invalidWallet" as const };
  }

  const onChain = await isAnalystWhitelistedOnChain(wallet);
  if (!onChain) {
    return { ok: false as const, error: "notOnChain" as const };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" as const };

  const { error } = await supabase
    .from("analyst_demo")
    .update({ confirmed: true })
    .eq("wallet", wallet);

  if (error) return { ok: false as const, error: "updateFailed" as const };

  const whitelistPda = await getAnalystWhitelistPda(wallet);
  return { ok: true as const, wallet, whitelistPda };
}

export async function removeDemoAnalyst(input: {
  wallet: string;
  adminWallet: string;
}) {
  const { wallet, adminWallet } = input;
  const adminCheck = await assertOnChainAdmin(adminWallet);
  if (adminCheck.ok === false) {
    return { ok: false as const, error: adminCheck.error };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" as const };

  const onChain = await isAnalystWhitelistedOnChain(wallet);

  const { error } = await supabase.from("analyst_demo").delete().eq("wallet", wallet);
  if (error) return { ok: false as const, error: "deleteFailed" as const };

  return { ok: true as const, wasOnChain: onChain };
}

export async function addDemoSme(adminWallet: string) {
  const adminCheck = await assertOnChainAdmin(adminWallet);
  if (adminCheck.ok === false) {
    return { ok: false as const, error: adminCheck.error };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" as const };

  const { count } = await supabase
    .from("sme_demo")
    .select("id", { count: "exact", head: true });

  const kp = Keypair.generate();
  const label = `SME ${(count ?? 0) + 1}`;

  const { data, error } = await supabase
    .from("sme_demo")
    .insert({
      label,
      wallet: kp.publicKey.toBase58(),
      secret_key: Array.from(kp.secretKey),
    })
    .select("id, label, wallet")
    .single();

  if (error || !data) return { ok: false as const, error: "insertFailed" as const };

  return {
    ok: true as const,
    sme: {
      ...data,
      solBalanceLamports: "0",
      solBalanceFormatted: "0",
      minSolRequiredLamports: DEMO_ISSUER_MIN_LAMPORTS.toString(),
      minSolRequiredFormatted: formatSol(DEMO_ISSUER_MIN_LAMPORTS),
      canInitInvoice: false,
    } as DemoSmeEntry,
  };
}

export async function removeDemoSme(input: {
  id: string;
  adminWallet: string;
}) {
  const { id, adminWallet } = input;
  const adminCheck = await assertOnChainAdmin(adminWallet);
  if (adminCheck.ok === false) {
    return { ok: false as const, error: adminCheck.error };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" as const };

  const { error } = await supabase.from("sme_demo").delete().eq("id", id);
  if (error) return { ok: false as const, error: "deleteFailed" as const };

  return { ok: true as const };
}

export async function cleanupPendingDemoAnalyst(wallet: string) {
  const supabase = createServiceClient();
  if (!supabase) return;

  await supabase
    .from("analyst_demo")
    .delete()
    .eq("wallet", wallet)
    .eq("confirmed", false);
}
