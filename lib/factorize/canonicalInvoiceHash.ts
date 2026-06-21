export type CanonicalInvoiceFields = {
  advance_amount_usdc: string;
  collection_date: string;
  due_date: string;
  invoice_id: string;
  invoice_number: string;
  operation_type: "factoring" | "confirming";
  payer_ruc: string;
  repayment_amount_usdc: string;
  seller_wallet: string;
  settle_date: string;
};

export function buildCanonicalPayload(
  fields: CanonicalInvoiceFields,
): Record<string, string> {
  return {
    advance_amount_usdc: fields.advance_amount_usdc,
    collection_date: fields.collection_date,
    due_date: fields.due_date,
    invoice_id: fields.invoice_id,
    invoice_number: fields.invoice_number,
    operation_type: fields.operation_type,
    payer_ruc: fields.payer_ruc,
    repayment_amount_usdc: fields.repayment_amount_usdc,
    seller_wallet: fields.seller_wallet,
    settle_date: fields.settle_date,
  };
}

export function canonicalJsonString(fields: CanonicalInvoiceFields): string {
  const payload = buildCanonicalPayload(fields);
  const sortedKeys = Object.keys(payload).sort();
  const sorted: Record<string, string> = {};
  for (const key of sortedKeys) {
    sorted[key] = payload[key as keyof typeof payload];
  }
  return JSON.stringify(sorted);
}

export async function hashCanonicalInvoice(
  fields: CanonicalInvoiceFields,
): Promise<Uint8Array> {
  const json = canonicalJsonString(fields);
  const data = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

export function usdcToCanonicalString(amount: bigint): string {
  return amount.toString();
}

export function dateToIso(date: Date): string {
  return date.toISOString();
}

export function dateOnlyToString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
