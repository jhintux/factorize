"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import {
  canAccessAdminPortal,
  isPlatformAdmin,
} from "@/lib/auth/admin";
import {
  getAnalystWhitelistPda,
  getProtocolConfigSummary,
  isAnalystWhitelistedOnChain,
} from "@/lib/factorize/protocolState";
import { isValidWallet } from "@/lib/auth/wallet";

async function requireAdminPortal() {
  const session = await getSession();
  if (!session) return null;
  const ok = await canAccessAdminPortal(session.wallet);
  if (!ok) return null;
  return session;
}

async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session) return null;
  const ok = await isPlatformAdmin(session.wallet);
  if (!ok) return null;
  return session;
}

export async function listAssessmentQueue() {
  if (!(await requireAdminPortal())) return [];

  const supabase = createServiceClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("invoices")
    .select(
      `*, payer_company:companies!payer_company_id(*), invoice_assessments(id)`,
    )
    .eq("on_chain_status", "Funding")
    .is("assessed_at", null)
    .order("created_at", { ascending: true });

  return (data ?? []).filter((row) => !row.invoice_assessments?.length);
}

export async function listSettlementQueue() {
  if (!(await requirePlatformAdmin())) return [];

  const supabase = createServiceClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("invoices")
    .select(`*, payer_company:companies!payer_company_id(company_name, ruc)`)
    .eq("on_chain_status", "InProgress")
    .not("payment_verified_at", "is", null)
    .is("settled_at", null)
    .order("settle_date", { ascending: true });

  return data ?? [];
}

export async function saveAssessment(input: {
  invoiceId: string;
  rating: string;
  notes?: string;
}) {
  const session = await requireAdminPortal();
  if (!session) return { ok: false as const, error: "unauthorized" };

  const whitelisted = await isAnalystWhitelistedOnChain(session.wallet);
  if (!whitelisted) {
    return { ok: false as const, error: "notWhitelisted" };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" };

  const { data: analyst } = await supabase
    .from("analysts")
    .select("id")
    .eq("wallet", session.wallet)
    .maybeSingle();

  if (!analyst) return { ok: false as const, error: "notAnalyst" };

  const { error: assessmentError } = await supabase
    .from("invoice_assessments")
    .insert({
      invoice_id: input.invoiceId,
      analyst_id: analyst.id,
      rating: input.rating,
      notes: input.notes ?? null,
    });

  if (assessmentError) return { ok: false as const, error: "insertFailed" };

  await supabase
    .from("invoices")
    .update({ assessed_at: new Date().toISOString() })
    .eq("id", input.invoiceId);

  return { ok: true as const };
}

export async function markPaymentVerified(invoiceId: string) {
  if (!(await requirePlatformAdmin())) {
    return { ok: false as const, error: "unauthorized" };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" };

  const { error } = await supabase
    .from("invoices")
    .update({ payment_verified_at: new Date().toISOString() })
    .eq("id", invoiceId);

  if (error) return { ok: false as const, error: "updateFailed" };
  return { ok: true as const };
}

export async function isCurrentWalletAdmin(wallet: string) {
  return canAccessAdminPortal(wallet);
}

export async function isCurrentWalletPlatformAdmin(wallet: string) {
  return isPlatformAdmin(wallet);
}

export async function getInvoiceDocumentUrl(documentPath: string) {
  if (!(await requireAdminPortal())) {
    return { ok: false as const, error: "unauthorized" };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" };

  const { data, error } = await supabase.storage
    .from("invoice-documents")
    .createSignedUrl(documentPath, 60 * 60);

  if (error || !data?.signedUrl) {
    return { ok: false as const, error: "urlFailed" };
  }

  return { ok: true as const, url: data.signedUrl };
}

export type AnalystListEntry = {
  id: string;
  name: string;
  wallet: string;
  whitelistPda: string;
  onChainActive: boolean;
  inconsistent: boolean;
};

export async function listAnalystsWithStatus() {
  if (!(await requirePlatformAdmin())) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" as const };

  const [protocol, { data: dbAnalysts }] = await Promise.all([
    getProtocolConfigSummary(),
    supabase.from("analysts").select("id, name, wallet").order("created_at"),
  ]);

  const analysts: AnalystListEntry[] = await Promise.all(
    (dbAnalysts ?? []).map(async (row) => {
      const onChainActive = await isAnalystWhitelistedOnChain(row.wallet);
      const whitelistPda = await getAnalystWhitelistPda(row.wallet);
      return {
        id: row.id,
        name: row.name,
        wallet: row.wallet,
        whitelistPda,
        onChainActive,
        inconsistent: !onChainActive,
      };
    }),
  );

  return {
    ok: true as const,
    protocol,
    analysts,
  };
}

export async function registerAnalystInDb(input: {
  name: string;
  wallet: string;
}) {
  if (!(await requirePlatformAdmin())) {
    return { ok: false as const, error: "unauthorized" };
  }

  const { name, wallet } = input;
  if (!isValidWallet(wallet)) {
    return { ok: false as const, error: "invalidWallet" };
  }
  if (!name.trim()) {
    return { ok: false as const, error: "missingName" };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" };

  const { error } = await supabase.from("analysts").upsert(
    { name: name.trim(), wallet },
    { onConflict: "wallet" },
  );

  if (error) return { ok: false as const, error: "insertFailed" };
  return { ok: true as const };
}

export async function removeAnalystFromDb(wallet: string) {
  if (!(await requirePlatformAdmin())) {
    return { ok: false as const, error: "unauthorized" };
  }

  if (!isValidWallet(wallet)) {
    return { ok: false as const, error: "invalidWallet" };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" };

  const { error } = await supabase.from("analysts").delete().eq("wallet", wallet);

  if (error) return { ok: false as const, error: "deleteFailed" };
  return { ok: true as const };
}

export async function deleteStaleAnalystFromDb(analystId: string) {
  if (!(await requirePlatformAdmin())) {
    return { ok: false as const, error: "unauthorized" };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" };

  const { data: analyst } = await supabase
    .from("analysts")
    .select("wallet")
    .eq("id", analystId)
    .maybeSingle();

  if (!analyst) return { ok: false as const, error: "notFound" };

  const onChainActive = await isAnalystWhitelistedOnChain(analyst.wallet);
  if (onChainActive) {
    return { ok: false as const, error: "stillActiveOnChain" };
  }

  const { error } = await supabase.from("analysts").delete().eq("id", analystId);

  if (error) return { ok: false as const, error: "deleteFailed" };
  return { ok: true as const };
}

export async function checkAnalystOnChain(wallet: string) {
  if (!(await requirePlatformAdmin())) {
    return { ok: false as const, error: "unauthorized" };
  }

  if (!isValidWallet(wallet)) {
    return { ok: false as const, error: "invalidWallet" };
  }

  const onChainActive = await isAnalystWhitelistedOnChain(wallet);
  const whitelistPda = await getAnalystWhitelistPda(wallet);

  return {
    ok: true as const,
    onChainActive,
    whitelistPda,
  };
}
