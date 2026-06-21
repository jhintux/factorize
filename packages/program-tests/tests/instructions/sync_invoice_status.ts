import { InvoiceStatus } from "@factorize/sdk";
import { expect } from "chai";
import { client } from "../factorize";
import {
  assessInvoice,
  fullyFundInvoice,
  setupInvoiceVault,
  setupProtocol,
  warpUnixTimestamp,
} from "../helpers";

describe("syncInvoiceStatus", () => {
  it("expires underfunded invoices after due date", async () => {
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
  });

  it("does not expire fully funded invoices after due date", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessAndFund(factorizeClient, protocol, invoice);

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
    expect(vault.data.status).to.equal(InvoiceStatus.InProgress);
  });

  it("defaults in-progress invoices after settle date", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessAndFund(factorizeClient, protocol, invoice);

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
  });

  it("is idempotent when no transition applies", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);

    await factorizeClient.factorize.instructions
      .syncInvoiceStatus({
        invoiceVault: invoice.invoiceVault,
        invoiceId: invoice.invoiceId,
      })
      .sendTransaction();

    const before =
      await factorizeClient.factorize.accounts.invoiceVault.fetch(
        invoice.invoiceVault,
      );

    await factorizeClient.factorize.instructions
      .syncInvoiceStatus({
        invoiceVault: invoice.invoiceVault,
        invoiceId: invoice.invoiceId,
      })
      .sendTransaction();

    const after = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(after.data.status).to.equal(before.data.status);
  });

  it("does not transition at exact due date boundary", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);

    warpUnixTimestamp(factorizeClient, invoice.dueDate);

    await factorizeClient.factorize.instructions
      .syncInvoiceStatus({
        invoiceVault: invoice.invoiceVault,
        invoiceId: invoice.invoiceId,
      })
      .sendTransaction();

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.status).to.equal(InvoiceStatus.Funding);
  });
});

async function assessAndFund(
  factorizeClient: Awaited<ReturnType<typeof client>>,
  protocol: Awaited<ReturnType<typeof setupProtocol>>,
  invoice: Awaited<ReturnType<typeof setupInvoiceVault>>,
) {
  await assessInvoice(factorizeClient, protocol, invoice);
  await fullyFundInvoice(factorizeClient, protocol, invoice);
}
