import { generateKeyPairSigner, lamports } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  FACTORIZE_ERROR__FUNDING_PERIOD_ENDED,
  FACTORIZE_ERROR__NOT_ASSESSED,
  FACTORIZE_ERROR__PAUSED,
  InvoiceStatus,
} from "@factorize/sdk";
import { expect } from "chai";
import { client } from "../factorize";
import {
  assessInvoice,
  expectFactorizeError,
  fundInvoice,
  fullyFundInvoice,
  getUsdcBalance,
  setupInvoiceVault,
  setupProtocol,
  warpUnixTimestamp,
} from "../helpers";

describe("fundInvoice", () => {
  it("partially funds and mints shares 1:1 with USDC", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const investor = await generateKeyPairSigner();
    await factorizeClient.airdrop(investor.address, lamports(10_000_000n));
    await assessInvoice(factorizeClient, protocol, invoice);

    const partial = invoice.advanceAmount / 2n;
    await fundInvoice(factorizeClient, protocol, invoice, investor, partial);

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.fundingAmount).to.equal(partial);
    expect(vault.data.status).to.equal(InvoiceStatus.Funding);

    const [sharesAta] = await findAssociatedTokenPda({
      owner: investor.address,
      mint: invoice.shares,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const sharesAccount =
      await factorizeClient.token.accounts.token.fetch(sharesAta);
    expect(sharesAccount.data.amount).to.equal(partial);
  });

  it("fully funds and transitions to InProgress", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice);

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.fundingAmount).to.equal(invoice.advanceAmount);
    expect(vault.data.status).to.equal(InvoiceStatus.InProgress);
  });

  it("caps fund amount to remaining availability", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const investor = await generateKeyPairSigner();
    await factorizeClient.airdrop(investor.address, lamports(10_000_000n));
    await assessInvoice(factorizeClient, protocol, invoice);

    const first = invoice.advanceAmount / 2n;
    await fundInvoice(factorizeClient, protocol, invoice, investor, first);

    const secondInvestor = await generateKeyPairSigner();
    await factorizeClient.airdrop(secondInvestor.address, lamports(10_000_000n));
    await fundInvoice(
      factorizeClient,
      protocol,
      invoice,
      secondInvestor,
      invoice.advanceAmount,
    );

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.fundingAmount).to.equal(invoice.advanceAmount);
  });

  it("supports multiple investors", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);

    const investorA = await generateKeyPairSigner();
    const investorB = await generateKeyPairSigner();
    await factorizeClient.airdrop(investorA.address, lamports(10_000_000n));
    await factorizeClient.airdrop(investorB.address, lamports(10_000_000n));

    const half = invoice.advanceAmount / 2n;
    await fundInvoice(factorizeClient, protocol, invoice, investorA, half);
    await fundInvoice(factorizeClient, protocol, invoice, investorB, half);

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.fundingAmount).to.equal(invoice.advanceAmount);
    expect(vault.data.status).to.equal(InvoiceStatus.InProgress);
  });

  it("fails before assessment", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const investor = await generateKeyPairSigner();
    await factorizeClient.airdrop(investor.address, lamports(10_000_000n));

    await expectFactorizeError(
      () =>
        fundInvoice(
          factorizeClient,
          protocol,
          invoice,
          investor,
          invoice.advanceAmount,
        ),
      FACTORIZE_ERROR__NOT_ASSESSED,
    );
  });

  it("fails when already fully funded", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    const investor = await fullyFundInvoice(factorizeClient, protocol, invoice);

    await expectFactorizeError(
      () =>
        fundInvoice(
          factorizeClient,
          protocol,
          invoice,
          investor,
          1n,
        ),
      FACTORIZE_ERROR__FUNDING_PERIOD_ENDED,
    );
  });

  it("fails after funding period ended", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);

    warpUnixTimestamp(factorizeClient, invoice.dueDate + 1n);

    const investor = await generateKeyPairSigner();
    await factorizeClient.airdrop(investor.address, lamports(10_000_000n));

    await expectFactorizeError(
      () =>
        fundInvoice(
          factorizeClient,
          protocol,
          invoice,
          investor,
          invoice.advanceAmount,
        ),
      FACTORIZE_ERROR__FUNDING_PERIOD_ENDED,
    );
  });

  it("fails when protocol is paused", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);

    await factorizeClient.factorize.instructions
      .setPaused({ admin: factorizeClient.identity, paused: true })
      .sendTransaction();

    const investor = await generateKeyPairSigner();
    await factorizeClient.airdrop(investor.address, lamports(10_000_000n));

    await expectFactorizeError(
      () =>
        fundInvoice(
          factorizeClient,
          protocol,
          invoice,
          investor,
          invoice.advanceAmount,
        ),
      FACTORIZE_ERROR__PAUSED,
    );
  });

});
