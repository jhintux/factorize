import { generateKeyPairSigner, lamports } from "@solana/kit";
import {
  FACTORIZE_ERROR__INVALID_MINT,
  FACTORIZE_ERROR__PAUSED,
  InvoiceStatus,
} from "@factorize/sdk";
import { expect } from "chai";
import { client } from "../factorize";
import {
  createUsdcMint,
  expectFactorizeError,
  findInvoiceVaultPda,
  findSharesPda,
  setupInvoiceVault,
  setupProtocol,
} from "../helpers";

describe("initInvoiceVault", () => {
  it("creates vault, shares mint, and vault ATA", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);

    const vault = await factorizeClient.factorize.accounts.invoiceVault.fetch(
      invoice.invoiceVault,
    );
    expect(vault.data.advanceAmount).to.equal(invoice.advanceAmount);
    expect(vault.data.fundingAmount).to.equal(0n);
    expect(vault.data.repaymentAmount).to.equal(invoice.repaymentAmount);
    expect(vault.data.sme).to.equal(invoice.sme.address);
    expect(vault.data.status).to.equal(InvoiceStatus.Funding);
    expect(vault.data.analyst).to.equal(
      "11111111111111111111111111111111",
    );
    expect(vault.data.verifiedAt).to.equal(0n);

    const sharesMint = await factorizeClient.token.accounts.mint.fetch(
      invoice.shares,
    );
    expect(sharesMint.data.decimals).to.equal(6);
    expect(sharesMint.data.supply).to.equal(0n);
  });

  it("supports multiple invoice ids for the same SME", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const sme = await generateKeyPairSigner();
    await factorizeClient.airdrop(sme.address, lamports(50_000_000n));

    const first = await setupInvoiceVault(factorizeClient, protocol, {
      sme,
      invoiceId: "invoice-a",
    });
    const second = await setupInvoiceVault(factorizeClient, protocol, {
      sme,
      invoiceId: "invoice-b",
    });

    expect(first.invoiceVault).to.not.equal(second.invoiceVault);
    expect(first.shares).to.not.equal(second.shares);
  });

  it("fails with wrong usdc mint", async () => {
    const factorizeClient = await client();
    await setupProtocol(factorizeClient);
    const sme = await generateKeyPairSigner();
    const wrongMint = await createUsdcMint(factorizeClient);
    const invoiceId = "bad-mint-invoice";

    await factorizeClient.airdrop(sme.address, lamports(50_000_000n));
    const [invoiceVault] = await findInvoiceVaultPda(sme.address, invoiceId);
    const [shares] = await findSharesPda(sme.address, invoiceId);

    await expectFactorizeError(
      () =>
        factorizeClient.factorize.instructions
          .initInvoiceVault({
            sme,
            invoiceVault,
            shares,
            usdcMint: wrongMint.mint,
            advanceAmount: 1_000_000n,
            repaymentAmount: 1_100_000n,
            dueDate: BigInt(Math.floor(Date.now() / 1000) + 86_400),
            settleDate: BigInt(Math.floor(Date.now() / 1000) + 172_800),
            invoiceId,
          })
          .sendTransaction(),
      FACTORIZE_ERROR__INVALID_MINT,
    );
  });

  it("fails when protocol is paused", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const sme = await generateKeyPairSigner();
    const invoiceId = "paused-invoice";

    await factorizeClient.factorize.instructions
      .setPaused({ admin: factorizeClient.identity, paused: true })
      .sendTransaction();

    await factorizeClient.airdrop(sme.address, lamports(50_000_000n));
    const [invoiceVault] = await findInvoiceVaultPda(sme.address, invoiceId);
    const [shares] = await findSharesPda(sme.address, invoiceId);

    await expectFactorizeError(
      () =>
        factorizeClient.factorize.instructions
          .initInvoiceVault({
            sme,
            invoiceVault,
            shares,
            usdcMint: protocol.usdc.mint,
            advanceAmount: 1_000_000n,
            repaymentAmount: 1_100_000n,
            dueDate: BigInt(Math.floor(Date.now() / 1000) + 86_400),
            settleDate: BigInt(Math.floor(Date.now() / 1000) + 172_800),
            invoiceId,
          })
          .sendTransaction(),
      FACTORIZE_ERROR__PAUSED,
    );
  });

  it("fails when invoice id is reused", async () => {
    const factorizeClient = await client();
    const protocol = await setupProtocol(factorizeClient);
    const invoice = await setupInvoiceVault(factorizeClient, protocol);

    try {
      await factorizeClient.factorize.instructions
        .initInvoiceVault({
          sme: invoice.sme,
          invoiceVault: invoice.invoiceVault,
          shares: invoice.shares,
          usdcMint: protocol.usdc.mint,
          advanceAmount: invoice.advanceAmount,
          repaymentAmount: invoice.repaymentAmount,
          dueDate: invoice.dueDate,
          settleDate: invoice.settleDate,
          invoiceId: invoice.invoiceId,
        })
        .sendTransaction();
      expect.fail("Expected duplicate init to fail");
    } catch (error) {
      expect(error).to.exist;
    }
  });
});
