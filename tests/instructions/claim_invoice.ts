import { generateKeyPairSigner, lamports } from "@solana/kit";
import {
  FACTORIZE_ERROR__INVOICE_NOT_IN_PROGRESS,
  FACTORIZE_ERROR__PAUSED,
  FACTORIZE_ERROR__UNAUTHORIZED,
} from "@factorize/sdk";
import { expect } from "chai";
import { client } from "../factorize";
import {
  assessInvoice,
  claimInvoiceAdvance,
  ensureUsdcAta,
  expectFactorizeError,
  fullyFundInvoice,
  getUsdcBalance,
  setupInvoiceVault,
  setupProtocol,
} from "../helpers";

describe("claimInvoice", () => {
  it("lets SME withdraw the full vault balance during InProgress", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice);

    const before = await getUsdcBalance(
      factorizeClient,
      invoice.sme.address,
      protocol.usdc.mint,
    );

    await claimInvoiceAdvance(factorizeClient, protocol, invoice);

    const after = await getUsdcBalance(
      factorizeClient,
      invoice.sme.address,
      protocol.usdc.mint,
    );
    expect(after - before).to.equal(invoice.advanceAmount);
  });

  it("fails when signer is not the SME", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    const impostor = await generateKeyPairSigner();
    await factorizeClient.airdrop(impostor.address, lamports(10_000_000n));
    await ensureUsdcAta(factorizeClient, protocol.usdc, impostor.address);
    await fullyFundInvoice(factorizeClient, protocol, invoice);

    await expectFactorizeError(
      () =>
        factorizeClient.factorize.instructions
          .claimInvoice({
            sme: impostor,
            invoiceVault: invoice.invoiceVault,
            usdcMint: protocol.usdc.mint,
            invoiceId: invoice.invoiceId,
          })
          .sendTransaction(),
      FACTORIZE_ERROR__UNAUTHORIZED,
    );
  });

  it("fails when invoice is not InProgress", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await ensureUsdcAta(factorizeClient, protocol.usdc, invoice.sme.address);

    await expectFactorizeError(
      () => claimInvoiceAdvance(factorizeClient, protocol, invoice),
      FACTORIZE_ERROR__INVOICE_NOT_IN_PROGRESS,
    );
  });

  it("fails when protocol is paused", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);
    await assessInvoice(factorizeClient, protocol, invoice);
    await fullyFundInvoice(factorizeClient, protocol, invoice);

    await factorizeClient.factorize.instructions
      .setPaused({ admin: factorizeClient.identity, paused: true })
      .sendTransaction();

    await expectFactorizeError(
      () => claimInvoiceAdvance(factorizeClient, protocol, invoice),
      FACTORIZE_ERROR__PAUSED,
    );
  });
});
