/** Per-transaction fee assumed for demo budget estimates (0.00008 SOL). */
export const DEMO_TX_FEE_LAMPORTS = 80_000n;

const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Two-year rent-exempt minimums (lamports per byte-year ≈ 3_480). */
const RENT_INVOICE_VAULT = 2_129_760n; // 8-byte disc + InvoiceVault InitSpace (~170 B)
const RENT_MINT = 1_461_600n; // 82 B mint account
const RENT_TOKEN_ACCOUNT = 2_039_280n; // 165 B SPL token account

/** Issuer SME: init_invoice_vault (3 accounts) + claim_invoice + settle_invoice. */
export const DEMO_ISSUER_MIN_LAMPORTS =
  RENT_INVOICE_VAULT +
  RENT_MINT +
  RENT_TOKEN_ACCOUNT +
  3n * DEMO_TX_FEE_LAMPORTS;

/**
 * Investor SME: fund_invoice (USDC + shares ATAs may be created) + claim_investment.
 * Conservative — assumes both ATAs are created on first fund.
 */
export const DEMO_INVESTOR_MIN_LAMPORTS =
  2n * RENT_TOKEN_ACCOUNT + 2n * DEMO_TX_FEE_LAMPORTS;

export function formatSol(lamports: bigint, maxDecimals = 6): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = lamports % LAMPORTS_PER_SOL;
  if (fraction === 0n) return whole.toString();
  const fracStr = fraction
    .toString()
    .padStart(9, "0")
    .slice(0, maxDecimals)
    .replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

export function canInitDemoInvoice(solBalanceLamports: bigint): boolean {
  return (
    solBalanceLamports > 0n && solBalanceLamports >= DEMO_ISSUER_MIN_LAMPORTS
  );
}

export function canActAsDemoInvestor(solBalanceLamports: bigint): boolean {
  return (
    solBalanceLamports > 0n && solBalanceLamports >= DEMO_INVESTOR_MIN_LAMPORTS
  );
}

export function demoSolBudgetSummary() {
  return {
    txFeeSol: formatSol(DEMO_TX_FEE_LAMPORTS),
    issuerMinSol: formatSol(DEMO_ISSUER_MIN_LAMPORTS),
    investorMinSol: formatSol(DEMO_INVESTOR_MIN_LAMPORTS),
    issuerMinLamports: DEMO_ISSUER_MIN_LAMPORTS.toString(),
    investorMinLamports: DEMO_INVESTOR_MIN_LAMPORTS.toString(),
  };
}
