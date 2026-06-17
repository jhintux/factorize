import { generateKeyPairSigner, lamports } from "@solana/kit";
import {
  FACTORIZE_ERROR__INVOICE_DEFAULTED,
  FACTORIZE_ERROR__INVOICE_NOT_IN_PROGRESS,
  InvoiceStatus,
} from "@factorize/sdk";
import { expect } from "chai";
import { client } from "../factorize";
import {
  assessInvoice,
  claimInvestment,
  claimInvoiceAdvance,
  expectFactorizeError,
  fundInvoice,
  fullyFundInvoice,
  getUsdcBalance,
  settleInvoice,
  setupInvoiceVault,
  setupProtocol,
  warpUnixTimestamp,
} from "../helpers";

describe("flows", () => {
  it("full lifecycle: fund, claim advance, settle, claim yield", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient, {
      protocolFeeBps: 500,
    });
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const investor = await generateKeyPairSigner();
    await factorizeClient.airdrop(investor.address, lamports(10_000_000n));

    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice, investor);

    let vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.status).to.equal(InvoiceStatus.InProgress);

    const smeBeforeClaim = await getUsdcBalance(
      factorizeClient,
      invoice.sme.address,
      protocol.usdc.mint,
    );
    await claimInvoiceAdvance(factorizeClient, protocol, invoice);

    const smeAfterClaim = await getUsdcBalance(
      factorizeClient,
      invoice.sme.address,
      protocol.usdc.mint,
    );
    expect(smeAfterClaim - smeBeforeClaim).to.equal(invoice.advanceAmount);

    await settleInvoice(
      factorizeClient,
      protocol,
      invoice,
      invoice.repaymentAmount,
    );

    vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.status).to.equal(InvoiceStatus.Settled);

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

    const profit = invoice.repaymentAmount - invoice.advanceAmount;
    const fee = (profit * 500n) / 10_000n;
    const expectedPayout = invoice.repaymentAmount - fee;
    expect(after - before).to.equal(expectedPayout);
  });

  it("expire and refund path for underfunded invoice", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const investor = await generateKeyPairSigner();
    await factorizeClient.airdrop(investor.address, lamports(10_000_000n));

    await assessInvoice(factorizeClient, protocol, invoice);
    const partial = invoice.advanceAmount / 2n;
    await fundInvoice(factorizeClient, protocol, invoice, investor, partial);

    warpUnixTimestamp(factorizeClient, invoice.dueDate + 1n);
    await factorizeClient.factorize.instructions
      .syncInvoiceStatus({
        invoiceVault: invoice.invoiceVault,
        invoiceId: invoice.invoiceId,
      })
      .sendTransaction();

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.status).to.equal(InvoiceStatus.Expired);

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
      partial,
    );
    const after = await getUsdcBalance(
      factorizeClient,
      investor.address,
      protocol.usdc.mint,
    );
    expect(after - before).to.equal(partial);
  });

  it("default path blocks investor claims", async () => {
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

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.status).to.equal(InvoiceStatus.Defaulted);

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

  it("multi-investor settlement distributes fairly", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient, {
      protocolFeeBps: 0,
    });
    const invoice = await setupInvoiceVault(factorizeClient, protocol, {
      advanceAmount: 1_000_000n,
      repaymentAmount: 1_200_000n,
    });
    await assessInvoice(factorizeClient, protocol, invoice);

    const investorA = await generateKeyPairSigner();
    const investorB = await generateKeyPairSigner();
    await factorizeClient.airdrop(investorA.address, lamports(10_000_000n));
    await factorizeClient.airdrop(investorB.address, lamports(10_000_000n));

    await fundInvoice(factorizeClient, protocol, invoice, investorA, 600_000n);
    await fundInvoice(factorizeClient, protocol, invoice, investorB, 400_000n);

    await claimInvoiceAdvance(factorizeClient, protocol, invoice);
    await settleInvoice(
      factorizeClient,
      protocol,
      invoice,
      invoice.repaymentAmount,
    );

    const beforeA = await getUsdcBalance(
      factorizeClient,
      investorA.address,
      protocol.usdc.mint,
    );
    const beforeB = await getUsdcBalance(
      factorizeClient,
      investorB.address,
      protocol.usdc.mint,
    );

    await claimInvestment(
      factorizeClient,
      protocol,
      invoice,
      investorA,
      600_000n,
    );
    await claimInvestment(
      factorizeClient,
      protocol,
      invoice,
      investorB,
      400_000n,
    );

    const afterA = await getUsdcBalance(
      factorizeClient,
      investorA.address,
      protocol.usdc.mint,
    );
    const afterB = await getUsdcBalance(
      factorizeClient,
      investorB.address,
      protocol.usdc.mint,
    );

    expect(afterA - beforeA).to.equal(720_000n);
    expect(afterB - beforeB).to.equal(480_000n);
    expect(afterA - beforeA + (afterB - beforeB)).to.equal(
      invoice.repaymentAmount,
    );
  });
});
