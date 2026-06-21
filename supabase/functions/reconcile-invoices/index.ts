import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const rpcUrl = Deno.env.get("SOLANA_RPC_URL") ?? "https://api.devnet.solana.com";

  const { data: active } = await supabase
    .from("invoices")
    .select("id, vault_pda, on_chain_status, funding_amount_usdc")
    .in("on_chain_status", ["Funding", "InProgress", "Settled"]);

  let repaired = 0;
  for (const row of active ?? []) {
    if (!row.vault_pda) continue;
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [row.vault_pda, { encoding: "base64" }],
      }),
    });
    const json = await res.json();
    if (!json.result?.value?.data) continue;
    repaired += 1;
  }

  return new Response(JSON.stringify({ ok: true, checked: active?.length ?? 0, repaired }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
