import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "https://esm.sh/@solana/web3.js@1.98.4";
import { buildSyncInvoiceStatusInstruction } from "../_shared/syncInstruction.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function loadKeeperKeypair(): Keypair | null {
  const raw = Deno.env.get("KEEPER_SECRET_KEY");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const rpcUrl = Deno.env.get("SOLANA_RPC_URL") ?? "https://api.devnet.solana.com";
  const keeper = loadKeeperKeypair();

  const { data: fundingExpired } = await supabase
    .from("invoices")
    .select("id, vault_pda, invoice_id, seller_wallet, on_chain_status")
    .eq("on_chain_status", "Funding")
    .lt("due_date", new Date().toISOString());

  const { data: inProgressDefault } = await supabase
    .from("invoices")
    .select("id, vault_pda, invoice_id, seller_wallet, on_chain_status")
    .eq("on_chain_status", "InProgress")
    .lt("settle_date", new Date().toISOString());

  const candidates = [...(fundingExpired ?? []), ...(inProgressDefault ?? [])];
  const results: { id: string; ok: boolean; signature?: string; error?: string }[] =
    [];

  if (keeper && candidates.length) {
    const connection = new Connection(rpcUrl, "confirmed");

    for (const row of candidates) {
      if (!row.vault_pda || !row.invoice_id) {
        results.push({ id: row.id, ok: false, error: "missing_vault" });
        continue;
      }

      try {
        const ixSpec = buildSyncInvoiceStatusInstruction(
          row.vault_pda,
          row.invoice_id,
        );
        const instruction = new TransactionInstruction({
          programId: new PublicKey(ixSpec.programId),
          keys: ixSpec.keys.map((key) => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable,
          })),
          data: ixSpec.data,
        });

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash();
        const transaction = new Transaction({
          feePayer: keeper.publicKey,
          blockhash,
          lastValidBlockHeight,
        }).add(instruction);
        transaction.sign(keeper);

        const signature = await connection.sendRawTransaction(
          transaction.serialize(),
        );
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );

        results.push({ id: row.id, ok: true, signature });
      } catch (error) {
        results.push({
          id: row.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      candidates: candidates.length,
      keeperConfigured: Boolean(keeper),
      synced: results.filter((r) => r.ok).length,
      results,
      rpcUrl,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
