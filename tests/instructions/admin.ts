import { generateKeyPairSigner, lamports } from "@solana/kit";
import {
  FACTORIZE_ERROR__UNAUTHORIZED,
  FACTORIZE_ERROR__PAUSED,
} from "@factorize/sdk";
import { expect } from "chai";
import { client } from "../factorize";
import {
  expectFactorizeError,
  fundInvoice,
  claimInvestment,
  getUsdcBalance,
  setupInvoiceVault,
  setupProtocol,
  assessInvoice,
  findInvoiceVaultPda,
  findSharesPda,
} from "../helpers";

describe("admin", () => {
  describe("addAnalyst", () => {
    it("whitelists an analyst", async () => {
      const factorizeClient = await client();
      const protocol = await setupProtocol(factorizeClient);
      const newAnalyst = await generateKeyPairSigner();

      await factorizeClient.factorize.instructions
        .addAnalyst({
          admin: factorizeClient.identity,
          analyst: newAnalyst.address,
        })
        .sendTransaction();

      const [whitelistPda] =
        await factorizeClient.factorize.pdas.analystWhitelist({
          analyst: newAnalyst.address,
        });
      const whitelist = factorizeClient.svm.getAccount(whitelistPda);
      expect(whitelist.exists).to.equal(true);
    });

    it("fails when caller is not admin", async () => {
      const factorizeClient = await client();
      await setupProtocol(factorizeClient);
      const impostor = await generateKeyPairSigner();
      const analyst = await generateKeyPairSigner();
      await factorizeClient.airdrop(impostor.address, lamports(10_000_000n));

      await expectFactorizeError(
        () =>
          factorizeClient.factorize.instructions
            .addAnalyst({
              admin: impostor,
              analyst: analyst.address,
            })
            .sendTransaction(),
        FACTORIZE_ERROR__UNAUTHORIZED,
      );
    });

    it("fails when analyst is already whitelisted", async () => {
      const factorizeClient = await client();
      const protocol = await setupProtocol(factorizeClient);

      try {
        await factorizeClient.factorize.instructions
          .addAnalyst({
            admin: factorizeClient.identity,
            analyst: protocol.analyst.address,
          })
          .sendTransaction();
        expect.fail("Expected duplicate whitelist to fail");
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe("removeAnalyst", () => {
    it("removes a whitelisted analyst", async () => {
      const factorizeClient = await client();
      const protocol = await setupProtocol(factorizeClient);

      await factorizeClient.factorize.instructions
        .removeAnalyst({
          admin: factorizeClient.identity,
          analyst: protocol.analyst.address,
        })
        .sendTransaction();

      const [whitelistPda] =
        await factorizeClient.factorize.pdas.analystWhitelist({
          analyst: protocol.analyst.address,
        });
      const account = factorizeClient.svm.getAccount(whitelistPda);
      expect(account.exists).to.equal(false);
    });

    it("fails when caller is not admin", async () => {
      const factorizeClient = await client();
      const protocol = await setupProtocol(factorizeClient);
      const impostor = await generateKeyPairSigner();
      await factorizeClient.airdrop(impostor.address, lamports(10_000_000n));

      await expectFactorizeError(
        () =>
          factorizeClient.factorize.instructions
            .removeAnalyst({
              admin: impostor,
              analyst: protocol.analyst.address,
            })
            .sendTransaction(),
        FACTORIZE_ERROR__UNAUTHORIZED,
      );
    });

    it("allows re-adding an analyst after removal", async () => {
      const factorizeClient = await client();
      const protocol = await setupProtocol(factorizeClient);

      await factorizeClient.factorize.instructions
        .removeAnalyst({
          admin: factorizeClient.identity,
          analyst: protocol.analyst.address,
        })
        .sendTransaction();

      await factorizeClient.factorize.instructions
        .addAnalyst({
          admin: factorizeClient.identity,
          analyst: protocol.analyst.address,
        })
        .sendTransaction();

      const [whitelistPda] =
        await factorizeClient.factorize.pdas.analystWhitelist({
          analyst: protocol.analyst.address,
        });
      const whitelist = factorizeClient.svm.getAccount(whitelistPda);
      expect(whitelist.exists).to.equal(true);
    });
  });

  describe("setPaused", () => {
    it("pauses and unpauses the protocol", async () => {
      const factorizeClient = await client();
      await setupProtocol(factorizeClient);
      const [configPda] = await factorizeClient.factorize.pdas.config();

      await factorizeClient.factorize.instructions
        .setPaused({ admin: factorizeClient.identity, paused: true })
        .sendTransaction();

      let config = await factorizeClient.factorize.accounts.config.fetch(
        configPda,
      );
      expect(config.data.paused).to.equal(true);

      await factorizeClient.factorize.instructions
        .setPaused({ admin: factorizeClient.identity, paused: false })
        .sendTransaction();

      config = await factorizeClient.factorize.accounts.config.fetch(configPda);
      expect(config.data.paused).to.equal(false);
    });

    it("fails when caller is not admin", async () => {
      const factorizeClient = await client();
      await setupProtocol(factorizeClient);
      const impostor = await generateKeyPairSigner();
      await factorizeClient.airdrop(impostor.address, lamports(10_000_000n));

      await expectFactorizeError(
        () =>
          factorizeClient.factorize.instructions
            .setPaused({ admin: impostor, paused: true })
            .sendTransaction(),
        FACTORIZE_ERROR__UNAUTHORIZED,
      );
    });

    it("blocks gated instructions while paused but not claimInvestment", async () => {
      const factorizeClient = await client();
      const protocol = await setupProtocol(factorizeClient);
      const invoice = await setupInvoiceVault(factorizeClient, protocol);
      await assessInvoice(factorizeClient, protocol, invoice);

      const investor = await generateKeyPairSigner();
      await factorizeClient.airdrop(investor.address, lamports(10_000_000n));
      const fundedAmount = invoice.advanceAmount / 2n;
      await fundInvoice(
        factorizeClient,
        protocol,
        invoice,
        investor,
        fundedAmount,
      );

      await factorizeClient.factorize.instructions
        .setPaused({ admin: factorizeClient.identity, paused: true })
        .sendTransaction();

      const sme = await generateKeyPairSigner();
      const invoiceId = "paused-second";
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
              advanceAmount: invoice.advanceAmount,
              repaymentAmount: invoice.repaymentAmount,
              dueDate: invoice.dueDate,
              settleDate: invoice.settleDate,
              invoiceId,
            })
            .sendTransaction(),
        FACTORIZE_ERROR__PAUSED,
      );

      const secondInvestor = await generateKeyPairSigner();
      await factorizeClient.airdrop(secondInvestor.address, lamports(10_000_000n));

      await expectFactorizeError(
        () =>
          fundInvoice(
            factorizeClient,
            protocol,
            invoice,
            secondInvestor,
            invoice.advanceAmount,
          ),
        FACTORIZE_ERROR__PAUSED,
      );

      const balanceBefore = await getUsdcBalance(
        factorizeClient,
        investor.address,
        protocol.usdc.mint,
      );
      await claimInvestment(
        factorizeClient,
        protocol,
        invoice,
        investor,
        fundedAmount,
      );
      const balanceAfter = await getUsdcBalance(
        factorizeClient,
        investor.address,
        protocol.usdc.mint,
      );
      expect(balanceAfter - balanceBefore).to.equal(fundedAmount);

      await factorizeClient.factorize.instructions
        .setPaused({ admin: factorizeClient.identity, paused: false })
        .sendTransaction();
    });
  });
});
