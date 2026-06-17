import { generateKeyPairSigner, lamports } from "@solana/kit";
import {
  FACTORIZE_ERROR__INSUFFICIENT_SETTLEMENT,
  FACTORIZE_ERROR__INVOICE_NOT_IN_PROGRESS,
  FACTORIZE_ERROR__PAUSED,
  FACTORIZE_ERROR__UNAUTHORIZED,
  InvoiceStatus,
} from "@factorize/sdk";
import { expect } from "chai";
import { client } from "../factorize";
import {
  assessInvoice,
  claimInvoiceAdvance,
  expectFactorizeError,
  fullyFundInvoice,
  getUsdcBalance,
  settleInvoice,
  setupInvoiceVault,
  setupProtocol,
} from "../helpers";

describe("settleInvoice", () => {
  it("settles with protocol fee on profit", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient, {
      protocolFeeBps: 500,
    });
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    const investor = await fullyFundInvoice(factorizeClient, protocol, invoice);
    await claimInvoiceAdvance(factorizeClient, protocol, invoice);

    const repayment = invoice.repaymentAmount;
    await settleInvoice(factorizeClient, protocol, invoice, repayment);

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    const profit = repayment - invoice.advanceAmount;
    const fee = (profit * 500n) / 10_000n;
    const investorPool = repayment - fee;

    expect(vault.data.status).to.equal(InvoiceStatus.Settled);
    expect(vault.data.settlementPool).to.equal(investorPool);
    expect(vault.data.settledShareSupply).to.equal(invoice.advanceAmount);
    expect(vault.data.claimedAmount).to.equal(0n);

    const treasuryBalance = await getUsdcBalance(
      factorizeClient,
      protocol.treasury.address,
      protocol.usdc.mint,
    );
    expect(treasuryBalance).to.equal(1n + fee);
  });

  it("settles with zero fee when repayment equals funding", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice);
    await claimInvoiceAdvance(factorizeClient, protocol, invoice);

    await settleInvoice(
      factorizeClient,
      protocol,
      invoice,
      invoice.advanceAmount,
    );

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.settlementPool).to.equal(invoice.advanceAmount);
  });

  it("fails when repayment is below funded principal", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice);
    await claimInvoiceAdvance(factorizeClient, protocol, invoice);

    await expectFactorizeError(
      () =>
        settleInvoice(
          factorizeClient,
          protocol,
          invoice,
          invoice.advanceAmount - 1n,
        ),
      FACTORIZE_ERROR__INSUFFICIENT_SETTLEMENT,
    );
  });

  it("fails when invoice is not InProgress", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);

    await expectFactorizeError(
      () =>
        settleInvoice(
          factorizeClient,
          protocol,
          invoice,
          invoice.repaymentAmount,
        ),
      FACTORIZE_ERROR__INVOICE_NOT_IN_PROGRESS,
    );
  });

  it("fails when signer is not the SME", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    const impostor = await generateKeyPairSigner();
    await factorizeClient.airdrop(impostor.address, lamports(10_000_000n));
    const { ensureUsdcAta, mintUsdcTo } = await import("../helpers");
    await ensureUsdcAta(factorizeClient, protocol.usdc, impostor.address);
    await fullyFundInvoice(factorizeClient, protocol, invoice);
    await mintUsdcTo(
      factorizeClient,
      protocol.usdc,
      impostor.address,
      invoice.repaymentAmount,
    );

    await expectFactorizeError(
      () =>
        factorizeClient.factorize.instructions
          .settleInvoice({
            sme: impostor,
            invoiceVault: invoice.invoiceVault,
            shares: invoice.shares,
            usdcMint: protocol.usdc.mint,
            treasury: protocol.treasury.address,
            invoiceId: invoice.invoiceId,
            repaymentAmount: invoice.repaymentAmount,
          })
          .sendTransaction(),
      FACTORIZE_ERROR__UNAUTHORIZED,
    );
  });

  it("fails with wrong treasury account", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    const wrongTreasury = await generateKeyPairSigner();
    const { ensureUsdcAta } = await import("../helpers");
    await ensureUsdcAta(factorizeClient, protocol.usdc, wrongTreasury.address);
    await fullyFundInvoice(factorizeClient, protocol, invoice);
    await claimInvoiceAdvance(factorizeClient, protocol, invoice);

    await expectFactorizeError(
      () =>
        factorizeClient.factorize.instructions
          .settleInvoice({
            sme: invoice.sme,
            invoiceVault: invoice.invoiceVault,
            shares: invoice.shares,
            usdcMint: protocol.usdc.mint,
            treasury: wrongTreasury.address,
            invoiceId: invoice.invoiceId,
            repaymentAmount: invoice.repaymentAmount,
          })
          .sendTransaction(),
      FACTORIZE_ERROR__UNAUTHORIZED,
    );
  });

  it("fails when protocol is paused", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice);
    await claimInvoiceAdvance(factorizeClient, protocol, invoice);

    await factorizeClient.factorize.instructions
      .setPaused({ admin: factorizeClient.identity, paused: true })
      .sendTransaction();

    await expectFactorizeError(
      () =>
        settleInvoice(
          factorizeClient,
          protocol,
          invoice,
          invoice.repaymentAmount,
        ),
      FACTORIZE_ERROR__PAUSED,
    );
  });
});
