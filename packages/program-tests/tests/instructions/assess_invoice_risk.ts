import { generateKeyPairSigner, lamports } from "@solana/kit";
import {
  FACTORIZE_ERROR__ALREADY_ASSESSED,
  FACTORIZE_ERROR__FUNDING_PERIOD_ENDED,
  FACTORIZE_ERROR__PAUSED,
  InvoiceStatus,
} from "@factorize/sdk";
import { expect } from "chai";
import { client } from "../factorize";
import {
  assessInvoice,
  expectFactorizeError,
  setupInvoiceVault,
  setupProtocol,
  warpUnixTimestamp,
} from "../helpers";

describe("assessInvoiceRisk", () => {
  it("records analyst assessment on a funding invoice", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const invoiceHash = new Uint8Array(32).fill(9);

    await assessInvoice(factorizeClient, protocol, invoice, invoiceHash);

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.analyst).to.equal(protocol.analyst.address);
    expect(Buffer.from(vault.data.invoiceHash)).to.deep.equal(
      Buffer.from(invoiceHash),
    );
    expect(vault.data.verifiedAt).to.not.equal(0n);
    expect(vault.data.status).to.equal(InvoiceStatus.Funding);
  });

  it("fails when analyst is not whitelisted", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    const rogueAnalyst = await generateKeyPairSigner();
    await factorizeClient.airdrop(rogueAnalyst.address, lamports(10_000_000n));

    try {
      await factorizeClient.factorize.instructions
        .assessInvoiceRisk({
          analyst: rogueAnalyst,
          invoiceVault: invoice.invoiceVault,
          invoiceId: invoice.invoiceId,
          invoiceHash: new Uint8Array(32).fill(1),
        })
        .sendTransaction();
      expect.fail("Expected unwhitelisted analyst to fail");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("fails on second assessment", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);

    await expectFactorizeError(
      () => assessInvoice(factorizeClient, protocol, invoice),
      FACTORIZE_ERROR__ALREADY_ASSESSED,
    );
  });

  it("fails after due date and marks invoice expired", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);

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

    await expectFactorizeError(
      () => assessInvoice(factorizeClient, protocol, invoice),
      FACTORIZE_ERROR__FUNDING_PERIOD_ENDED,
    );
  });

  it("fails when protocol is paused", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);

    await factorizeClient.factorize.instructions
      .setPaused({ admin: factorizeClient.identity, paused: true })
      .sendTransaction();

    await expectFactorizeError(
      () => assessInvoice(factorizeClient, protocol, invoice),
      FACTORIZE_ERROR__PAUSED,
    );
  });
});
