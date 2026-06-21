"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

const INVOICE_DOCUMENT_BUCKET = "invoice-documents";
const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export async function listInvoicesForInvestor() {
  const supabase = createServiceClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("invoices")
    .select(
      `*, payer_company:companies!payer_company_id(*), invoice_assessments(rating)`,
    )
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getInvoiceById(id: string) {
  const supabase = createServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("invoices")
    .select(
      `*, payer_company:companies!payer_company_id(*, sectors:sector_id(name_es, name_en), activities:activity_code(name_es, name_en)), invoice_assessments(*, analysts(name)), seller_sme:smes!seller_sme_id(wallet)`,
    )
    .eq("id", id)
    .maybeSingle();

  return data;
}

export async function listSmeInvoices() {
  const session = await getSession();
  if (!session || session.role !== "sme") return [];

  const supabase = createServiceClient();
  if (!supabase) return [];

  const { data: sme } = await supabase
    .from("smes")
    .select("id")
    .eq("wallet", session.wallet)
    .maybeSingle();

  if (!sme) return [];

  const { data } = await supabase
    .from("invoices")
    .select(`*, payer_company:companies!payer_company_id(company_name, ruc)`)
    .eq("seller_sme_id", sme.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function createInvoiceDraft(input: {
  id: string;
  payer_company_id: string;
  invoice_number: string;
  operation_type: "factoring" | "confirming";
  collection_date: string;
  face_value_usdc: string;
  advance_amount_usdc: string;
  repayment_amount_usdc: string;
  due_date: string;
  settle_date: string;
  document_path?: string;
  vault_pda: string;
  shares_mint: string;
  seller_wallet: string;
}) {
  const session = await getSession();
  if (!session || session.role !== "sme") {
    return { ok: false as const, error: "unauthorized" };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" };

  const { data: sme } = await supabase
    .from("smes")
    .select("id")
    .eq("wallet", session.wallet)
    .maybeSingle();

  if (!sme) return { ok: false as const, error: "smeNotFound" };

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      id: input.id,
      invoice_id: input.id,
      seller_sme_id: sme.id,
      payer_company_id: input.payer_company_id,
      invoice_number: input.invoice_number,
      operation_type: input.operation_type,
      collection_date: input.collection_date,
      face_value_usdc: input.face_value_usdc,
      advance_amount_usdc: input.advance_amount_usdc,
      repayment_amount_usdc: input.repayment_amount_usdc,
      due_date: input.due_date,
      settle_date: input.settle_date,
      document_path: input.document_path ?? null,
      vault_pda: input.vault_pda,
      shares_mint: input.shares_mint,
      seller_wallet: input.seller_wallet,
      on_chain_status: "Funding",
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: "insertFailed" };
  return { ok: true as const, id: data.id };
}

export async function uploadInvoiceDocument(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "sme") {
    return { ok: false as const, error: "unauthorized" };
  }

  const invoiceId = formData.get("invoiceId");
  const file = formData.get("file");

  if (typeof invoiceId !== "string" || !invoiceId) {
    return { ok: false as const, error: "invalidInvoiceId" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "noFile" };
  }
  if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) {
    return { ok: false as const, error: "invalidType" };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false as const, error: "tooLarge" };
  }

  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${invoiceId}/${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(INVOICE_DOCUMENT_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (error) return { ok: false as const, error: "uploadFailed" };
  return { ok: true as const, path };
}

export async function updateInvoiceFromChain(
  vaultPda: string,
  fields: {
    on_chain_status?: string;
    funding_amount_usdc?: string;
    assessed_at?: string;
    settled_at?: string;
  },
) {
  const supabase = createServiceClient();
  if (!supabase) return;

  await supabase.from("invoices").update(fields).eq("vault_pda", vaultPda);
}
