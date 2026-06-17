import {
  address,
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  lamports,
  SolanaError,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  FACTORIZE_PROGRAM_ADDRESS,
  InvoiceStatus,
  type FactorizeError,
} from "@factorize/sdk";
import { expect } from "chai";
import type { FactorizeTestClient } from "./factorize";

export const USDC_DECIMALS = 6;
export const ONE_USDC = 10n ** BigInt(USDC_DECIMALS);
export const DEFAULT_PROTOCOL_FEE_BPS = 500;
export const DEFAULT_INVOICE_ID = "invoice-1";
export const DEFAULT_ADVANCE = ONE_USDC;
export const DEFAULT_REPAYMENT = ONE_USDC + ONE_USDC / 10n; // 1.1 USDC
export const SYSTEM_PROGRAM_ADDRESS = address(
  "11111111111111111111111111111111",
);

export type UsdcMintContext = {
  mint: Address;
  mintAuthority: TransactionSigner;
};

export type ProtocolContext = {
  treasury: TransactionSigner;
  analyst: TransactionSigner;
  configPda: Address;
  usdc: UsdcMintContext;
  protocolFeeBps: number;
};

export type InvoiceContext = {
  sme: TransactionSigner;
  invoiceId: string;
  invoiceVault: Address;
  shares: Address;
  dueDate: bigint;
  settleDate: bigint;
  advanceAmount: bigint;
  repaymentAmount: bigint;
};

export async function expectFactorizeError(
  fn: () => Promise<unknown>,
  code: FactorizeError,
): Promise<void> {
  try {
    await fn();
    expect.fail(`Expected factorize error #${code}`);
  } catch (error) {
    if (error instanceof SolanaError) {
      const causeMessage = error.context?.causeMessage ?? String(error);
      if (causeMessage.match(new RegExp(`#${code}\\b`))) {
        return;
      }
    }
    throw error;
  }
}

export async function assertInvoiceStatus(
  client: FactorizeTestClient,
  invoiceVault: Address,
  status: InvoiceStatus,
): Promise<void> {
  const vault = await client.factorize.accounts.invoiceVault.fetch(invoiceVault);
  expect(vault.data.status).to.equal(status);
}

export function now(client: FactorizeTestClient): bigint {
  return client.svm.getClock().unixTimestamp;
}

export function warpUnixTimestamp(
  client: FactorizeTestClient,
  unixTimestamp: bigint,
): void {
  const clock = client.svm.getClock();
  clock.unixTimestamp = unixTimestamp;
  client.svm.setClock(clock);
}

export async function findInvoiceVaultPda(
  sme: Address,
  invoiceId: string,
): Promise<readonly [Address, number]> {
  return getProgramDerivedAddress({
    programAddress: FACTORIZE_PROGRAM_ADDRESS,
    seeds: [
      new TextEncoder().encode("invoice_vault"),
      getAddressEncoder().encode(sme),
      new TextEncoder().encode(invoiceId),
    ],
  });
}

export async function findSharesPda(
  sme: Address,
  invoiceId: string,
): Promise<readonly [Address, number]> {
  return getProgramDerivedAddress({
    programAddress: FACTORIZE_PROGRAM_ADDRESS,
    seeds: [
      new TextEncoder().encode("shares"),
      getAddressEncoder().encode(sme),
      new TextEncoder().encode(invoiceId),
    ],
  });
}

export async function createUsdcMint(
  client: FactorizeTestClient,
): Promise<UsdcMintContext> {
  const mintAuthority = await generateKeyPairSigner();
  const newMint = await generateKeyPairSigner();

  await client.token.instructions
    .createMint({
      newMint,
      decimals: USDC_DECIMALS,
      mintAuthority: mintAuthority.address,
    })
    .sendTransaction();

  return { mint: newMint.address, mintAuthority };
}

export async function mintUsdcTo(
  client: FactorizeTestClient,
  usdc: UsdcMintContext,
  owner: Address,
  amount: bigint,
): Promise<void> {
  client.svm.expireBlockhash();
  await client.token.instructions
    .mintToATA({
      mint: usdc.mint,
      owner,
      mintAuthority: usdc.mintAuthority,
      amount,
      decimals: USDC_DECIMALS,
    })
    .sendTransaction();
}

export async function getUsdcBalance(
  client: FactorizeTestClient,
  owner: Address,
  mint: Address,
): Promise<bigint> {
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const raw = client.svm.getAccount(ata);
  if (!raw.exists) {
    return 0n;
  }
  const account = await client.token.accounts.token.fetch(ata);
  return account.data.amount;
}

export async function ensureUsdcAta(
  client: FactorizeTestClient,
  usdc: UsdcMintContext,
  owner: Address,
): Promise<void> {
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint: usdc.mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const raw = client.svm.getAccount(ata);
  if (!raw.exists) {
    client.svm.expireBlockhash();
    await mintUsdcTo(client, usdc, owner, 1n);
  }
}

export async function setupProtocol(
  client: FactorizeTestClient,
  options?: { protocolFeeBps?: number },
): Promise<ProtocolContext> {
  const treasury = await generateKeyPairSigner();
  const analyst = await generateKeyPairSigner();
  const usdc = await createUsdcMint(client);
  const protocolFeeBps = options?.protocolFeeBps ?? DEFAULT_PROTOCOL_FEE_BPS;

  await client.airdrop(treasury.address, lamports(10_000_000n));
  await client.airdrop(analyst.address, lamports(10_000_000n));

  await client.factorize.instructions
    .initConfig({
      admin: client.identity,
      treasury: treasury.address,
      usdcMint: usdc.mint,
      protocolFeeBps,
    })
    .sendTransaction();

  await client.factorize.instructions
    .addAnalyst({
      admin: client.identity,
      analyst: analyst.address,
    })
    .sendTransaction();

  const [configPda] = await client.factorize.pdas.config();

  await mintUsdcTo(client, usdc, treasury.address, 1n);

  return { treasury, analyst, configPda, usdc, protocolFeeBps };
}

export async function setupInvoiceVault(
  client: FactorizeTestClient,
  protocol: ProtocolContext,
  options?: {
    invoiceId?: string;
    advanceAmount?: bigint;
    repaymentAmount?: bigint;
    dueDate?: bigint;
    settleDate?: bigint;
    sme?: TransactionSigner;
  },
): Promise<InvoiceContext> {
  const sme = options?.sme ?? (await generateKeyPairSigner());
  const invoiceId = options?.invoiceId ?? DEFAULT_INVOICE_ID;
  const advanceAmount = options?.advanceAmount ?? DEFAULT_ADVANCE;
  const repaymentAmount = options?.repaymentAmount ?? DEFAULT_REPAYMENT;
  const current = now(client);
  const dueDate = options?.dueDate ?? current + 86_400n;
  const settleDate = options?.settleDate ?? current + 172_800n;

  await client.airdrop(sme.address, lamports(50_000_000n));
  await ensureUsdcAta(client, protocol.usdc, sme.address);

  const [invoiceVault] = await findInvoiceVaultPda(sme.address, invoiceId);
  const [shares] = await findSharesPda(sme.address, invoiceId);

  await client.factorize.instructions
    .initInvoiceVault({
      sme,
      invoiceVault,
      shares,
      usdcMint: protocol.usdc.mint,
      advanceAmount,
      repaymentAmount,
      dueDate,
      settleDate,
      invoiceId,
    })
    .sendTransaction();

  return {
    sme,
    invoiceId,
    invoiceVault,
    shares,
    dueDate,
    settleDate,
    advanceAmount,
    repaymentAmount,
  };
}

export async function assessInvoice(
  client: FactorizeTestClient,
  protocol: ProtocolContext,
  invoice: InvoiceContext,
  invoiceHash: Uint8Array = new Uint8Array(32).fill(1),
): Promise<void> {
  await client.factorize.instructions
    .assessInvoiceRisk({
      analyst: protocol.analyst,
      invoiceVault: invoice.invoiceVault,
      invoiceId: invoice.invoiceId,
      invoiceHash,
    })
    .sendTransaction();
}

export async function fundInvoice(
  client: FactorizeTestClient,
  protocol: ProtocolContext,
  invoice: InvoiceContext,
  investor: TransactionSigner,
  fundAmount: bigint,
): Promise<void> {
  await mintUsdcTo(client, protocol.usdc, investor.address, fundAmount);

  await client.factorize.instructions
    .fundInvoice({
      investor,
      invoiceVault: invoice.invoiceVault,
      shares: invoice.shares,
      usdcMint: protocol.usdc.mint,
      invoiceId: invoice.invoiceId,
      fundAmount,
    })
    .sendTransaction();
}

export async function fullyFundInvoice(
  client: FactorizeTestClient,
  protocol: ProtocolContext,
  invoice: InvoiceContext,
  investor?: TransactionSigner,
): Promise<TransactionSigner> {
  const funder = investor ?? (await generateKeyPairSigner());
  await client.airdrop(funder.address, lamports(10_000_000n));
  await fundInvoice(
    client,
    protocol,
    invoice,
    funder,
    invoice.advanceAmount,
  );
  return funder;
}

export async function claimInvoiceAdvance(
  client: FactorizeTestClient,
  protocol: ProtocolContext,
  invoice: InvoiceContext,
): Promise<void> {
  await client.factorize.instructions
    .claimInvoice({
      sme: invoice.sme,
      invoiceVault: invoice.invoiceVault,
      usdcMint: protocol.usdc.mint,
      invoiceId: invoice.invoiceId,
    })
    .sendTransaction();
}

export async function settleInvoice(
  client: FactorizeTestClient,
  protocol: ProtocolContext,
  invoice: InvoiceContext,
  repaymentAmount: bigint,
): Promise<void> {
  const smeBalance = await getUsdcBalance(
    client,
    invoice.sme.address,
    protocol.usdc.mint,
  );
  if (repaymentAmount > smeBalance) {
    await mintUsdcTo(
      client,
      protocol.usdc,
      invoice.sme.address,
      repaymentAmount - smeBalance,
    );
  }

  await client.factorize.instructions
    .settleInvoice({
      sme: invoice.sme,
      invoiceVault: invoice.invoiceVault,
      shares: invoice.shares,
      usdcMint: protocol.usdc.mint,
      treasury: protocol.treasury.address,
      invoiceId: invoice.invoiceId,
      repaymentAmount,
    })
    .sendTransaction();
}

export async function adminSettleInvoice(
  client: FactorizeTestClient,
  protocol: ProtocolContext,
  invoice: InvoiceContext,
  repaymentAmount: bigint,
): Promise<void> {
  await ensureUsdcAta(client, protocol.usdc, client.identity.address);

  const adminBalance = await getUsdcBalance(
    client,
    client.identity.address,
    protocol.usdc.mint,
  );
  if (repaymentAmount > adminBalance) {
    await mintUsdcTo(
      client,
      protocol.usdc,
      client.identity.address,
      repaymentAmount - adminBalance,
    );
  }

  await client.factorize.instructions
    .adminSettleInvoice({
      admin: client.identity,
      invoiceVault: invoice.invoiceVault,
      shares: invoice.shares,
      usdcMint: protocol.usdc.mint,
      treasury: protocol.treasury.address,
      invoiceId: invoice.invoiceId,
      repaymentAmount,
    })
    .sendTransaction();
}

export async function claimInvestment(
  client: FactorizeTestClient,
  protocol: ProtocolContext,
  invoice: InvoiceContext,
  investor: TransactionSigner,
  shareAmount: bigint,
): Promise<void> {
  await client.factorize.instructions
    .claimInvestment({
      investor,
      invoiceVault: invoice.invoiceVault,
      shares: invoice.shares,
      usdcMint: protocol.usdc.mint,
      invoiceId: invoice.invoiceId,
      sharesArg: shareAmount,
    })
    .sendTransaction();
}
