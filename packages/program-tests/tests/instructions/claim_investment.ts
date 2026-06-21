import { generateKeyPairSigner, lamports } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  FACTORIZE_ERROR__INVOICE_DEFAULTED,
  FACTORIZE_ERROR__INVOICE_IN_PROGRESS,
  InvoiceStatus,
} from "@factorize/sdk";
import { expect } from "chai";
import { client } from "../factorize";
import {
  assessInvoice,
  claimInvoiceAdvance,
  claimInvestment,
  expectFactorizeError,
  fundInvoice,
  fullyFundInvoice,
  getUsdcBalance,
  settleInvoice,
  setupInvoiceVault,
  setupProtocol,
  warpUnixTimestamp,
} from "../helpers";

describe("claimInvestment", () => {
  it("refunds 1:1 on expired underfunded invoice", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const investor = await generateKeyPairSigner();
    await factorizeClient.airdrop(investor.address, lamports(10_000_000n));
    await assessInvoice(factorizeClient, protocol, invoice);

    const funded = invoice.advanceAmount / 2n;
    await fundInvoice(factorizeClient, protocol, invoice, investor, funded);

    warpUnixTimestamp(factorizeClient, invoice.dueDate + 1n);
    await factorizeClient.factorize.instructions
      .syncInvoiceStatus({
        invoiceVault: invoice.invoiceVault,
        invoiceId: invoice.invoiceId,
      })
      .sendTransaction();

    const before = await getUsdcBalance(
      factorizeClient,
      investor.address,
      protocol.usdc.mint,
    );
    await claimInvestment(
      factorizeClient,
      protocol,
      invoice,
      investor,
      funded,
    );
    const after = await getUsdcBalance(
      factorizeClient,
      investor.address,
      protocol.usdc.mint,
    );
    expect(after - before).to.equal(funded);
  });

  it("fails while invoice is InProgress", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const investor = await generateKeyPairSigner();
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice, investor);

    await expectFactorizeError(
      () =>
        claimInvestment(
          factorizeClient,
          protocol,
          invoice,
          investor,
          invoice.advanceAmount,
        ),
      FACTORIZE_ERROR__INVOICE_IN_PROGRESS,
    );
  });

  it("fails on defaulted invoice", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const investor = await generateKeyPairSigner();
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice, investor);

    warpUnixTimestamp(factorizeClient, invoice.settleDate + 1n);
    await factorizeClient.factorize.instructions
      .syncInvoiceStatus({
        invoiceVault: invoice.invoiceVault,
        invoiceId: invoice.invoiceId,
      })
      .sendTransaction();

    await expectFactorizeError(
      () =>
        claimInvestment(
          factorizeClient,
          protocol,
          invoice,
          investor,
          invoice.advanceAmount,
        ),
      FACTORIZE_ERROR__INVOICE_DEFAULTED,
    );
  });

  it("pays proportional yield after settlement", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient, {
      protocolFeeBps: 0,
    });
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const investor = await generateKeyPairSigner();
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice, investor);
    await claimInvoiceAdvance(factorizeClient, protocol, invoice);
    await settleInvoice(
      factorizeClient,
      protocol,
      invoice,
      invoice.repaymentAmount,
    );

    const before = await getUsdcBalance(
      factorizeClient,
      investor.address,
      protocol.usdc.mint,
    );
    await claimInvestment(
      factorizeClient,
      protocol,
      invoice,
      investor,
      invoice.advanceAmount,
    );
    const after = await getUsdcBalance(
      factorizeClient,
      investor.address,
      protocol.usdc.mint,
    );
    expect(after - before).to.equal(invoice.repaymentAmount);
  });

  it("last claimer absorbs rounding dust across multiple investors", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient, {
      protocolFeeBps: 0,
    });
    const invoice = await setupInvoiceVault(factorizeClient, protocol, {
      advanceAmount: 10_003n,
      repaymentAmount: 11_000n,
    });
    await assessInvoice(factorizeClient, protocol, invoice);

    const investorA = await generateKeyPairSigner();
    const investorB = await generateKeyPairSigner();
    const investorC = await generateKeyPairSigner();
    await factorizeClient.airdrop(investorA.address, lamports(10_000_000n));
    await factorizeClient.airdrop(investorB.address, lamports(10_000_000n));
    await factorizeClient.airdrop(investorC.address, lamports(10_000_000n));

    await fundInvoice(factorizeClient, protocol, invoice, investorA, 3_301n);
    await fundInvoice(factorizeClient, protocol, invoice, investorB, 3_301n);
    await fundInvoice(factorizeClient, protocol, invoice, investorC, 3_401n);

    await claimInvoiceAdvance(factorizeClient, protocol, invoice);
    await settleInvoice(
      factorizeClient,
      protocol,
      invoice,
      invoice.repaymentAmount,
    );

    await claimInvestment(factorizeClient, protocol, invoice, investorA, 3_301n);
    await claimInvestment(factorizeClient, protocol, invoice, investorB, 3_301n);

    const before = await getUsdcBalance(
      factorizeClient,
      investorC.address,
      protocol.usdc.mint,
    );
    await claimInvestment(factorizeClient, protocol, invoice, investorC, 3_401n);
    const after = await getUsdcBalance(
      factorizeClient,
      investorC.address,
      protocol.usdc.mint,
    );

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.claimedAmount).to.equal(invoice.repaymentAmount);
    expect(after - before > 3_300n).to.be.true;
  });

  it("closes shares ATA when burning all investor shares", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient, {
      protocolFeeBps: 0,
    });
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const investor = await generateKeyPairSigner();
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice, investor);
    await claimInvoiceAdvance(factorizeClient, protocol, invoice);
    await settleInvoice(
      factorizeClient,
      protocol,
      invoice,
      invoice.repaymentAmount,
    );

    const [sharesAta] = await findAssociatedTokenPda({
      owner: investor.address,
      mint: invoice.shares,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    await claimInvestment(
      factorizeClient,
      protocol,
      invoice,
      investor,
      invoice.advanceAmount,
    );

    const sharesAccount = factorizeClient.svm.getAccount(sharesAta);
    expect(sharesAccount.exists).to.equal(false);
  });

  it("works while protocol is paused", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient, {
      protocolFeeBps: 0,
    });
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const investor = await generateKeyPairSigner();
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice, investor);
    await claimInvoiceAdvance(factorizeClient, protocol, invoice);
    await settleInvoice(
      factorizeClient,
      protocol,
      invoice,
      invoice.repaymentAmount,
    );

    await factorizeClient.factorize.instructions
      .setPaused({ admin: factorizeClient.identity, paused: true })
      .sendTransaction();

    await claimInvestment(
      factorizeClient,
      protocol,
      invoice,
      investor,
      invoice.advanceAmount,
    );

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.status).to.equal(InvoiceStatus.Settled);
  });
});
