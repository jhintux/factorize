import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import idl from "../_shared/idl.json" assert { type: "json" };
import { BorshCoder, EventParser } from "https://esm.sh/@coral-xyz/anchor@0.32.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-helius-signature",
};

const PROGRAM_ID = "6YWgPX8CbreGMdPAkCnXxLG5xW9T8LiTQHqafP3C3GhT";
const coder = new BorshCoder(idl as never);
const parser = new EventParser(PROGRAM_ID, coder);

function invoiceStatusFromEvent(status: unknown): string {
  if (typeof status === "object" && status !== null) {
    const keys = Object.keys(status as object);
    if (keys.length === 1) return keys[0]!;
  }
  return String(status);
}

async function applyEvent(
  supabase: ReturnType<typeof createClient>,
  signature: string,
  slot: number,
  name: string,
  data: Record<string, unknown>,
) {
  const { error: insertError } = await supabase.from("chain_events").insert({
    signature,
    slot,
    event_name: name,
    payload: data,
  });
  if (insertError?.code === "23505") return;

  const invoiceId = data.invoice_id as string | undefined;
  const sme = data.sme as string | undefined;
  if (!invoiceId || !sme) return;

  const updates: Record<string, unknown> = {};
  if (name === "InvoiceFunded") {
    updates.funding_amount_usdc = String(data.funding_amount);
    updates.on_chain_status = invoiceStatusFromEvent(data.status);
  }
  if (name === "InvoiceRiskAssessed") {
    updates.assessed_at = new Date(Number(data.verified_at) * 1000).toISOString();
    updates.invoice_hash = data.invoice_hash;
  }
  if (name === "InvoiceVaultInitialized") {
    updates.on_chain_status = "Funding";
    updates.vault_pda = data.vault;
    updates.shares_mint = data.shares_mint;
  }
  if (name === "InvoiceAdminSettled" || name === "InvoiceSettled") {
    updates.on_chain_status = "Settled";
    updates.settled_at = new Date().toISOString();
  }
  if (name === "InvoiceStatusSynced") {
    updates.on_chain_status = invoiceStatusFromEvent(data.status);
  }

  if (Object.keys(updates).length) {
    await supabase
      .from("invoices")
      .update(updates)
      .eq("invoice_id", invoiceId)
      .eq("seller_wallet", sme);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const secret = Deno.env.get("HELIUS_WEBHOOK_SECRET");
  const auth = req.headers.get("authorization") ?? req.headers.get("x-helius-signature");
  if (secret && auth !== secret && auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json();
  const transactions = Array.isArray(body) ? body : [body];

  for (const tx of transactions) {
    const signature = tx.signature as string;
    const slot = Number(tx.slot ?? 0);
    const logs: string[] =
      tx.meta?.logMessages ?? tx.transaction?.meta?.logMessages ?? [];

    for (const event of parser.parseLogs(logs)) {
      await applyEvent(
        supabase,
        signature,
        slot,
        event.name,
        event.data as Record<string, unknown>,
      );
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
