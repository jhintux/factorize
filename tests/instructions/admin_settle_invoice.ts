import { expect } from "chai";
import { client } from "../factorize";
import {
  adminSettleInvoice,
  assertInvoiceStatus,
  assessInvoice,
  claimInvoiceAdvance,
  claimInvestment,
  fullyFundInvoice,
  setupInvoiceVault,
  setupProtocol,
} from "../helpers";
import { InvoiceStatus } from "@factorize/sdk";

describe("admin_settle_invoice", () => {
  it("admin settles in-progress invoice from admin treasury", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient, { protocolFeeBps: 500 });
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);

    const investor = await fullyFundInvoice(factorizeClient, protocol, invoice);
    await claimInvoiceAdvance(factorizeClient, protocol, invoice);

    await adminSettleInvoice(
      factorizeClient,
      protocol,
      invoice,
      invoice.repaymentAmount,
    );

    await assertInvoiceStatus(
      factorizeClient,
      invoice.invoiceVault,
      InvoiceStatus.Settled,
    );

    await claimInvestment(
      factorizeClient,
      protocol,
      invoice,
      investor,
      invoice.advanceAmount,
    );
  });

  it("rejects non-admin signer", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice);
    await claimInvoiceAdvance(factorizeClient, protocol, invoice);

    try {
      await factorizeClient.factorize.instructions
        .adminSettleInvoice({
          admin: invoice.sme,
          invoiceVault: invoice.invoiceVault,
          shares: invoice.shares,
          usdcMint: protocol.usdc.mint,
          treasury: protocol.treasury.address,
          invoiceId: invoice.invoiceId,
          repaymentAmount: invoice.repaymentAmount,
        })
        .sendTransaction();
      expect.fail("Expected unauthorized");
    } catch {
      // expected
    }
  });
});
