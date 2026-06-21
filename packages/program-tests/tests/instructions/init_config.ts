import { generateKeyPairSigner, lamports } from "@solana/kit";
import {
  FACTORIZE_ERROR__INVALID_MINT,
  FACTORIZE_ERROR__UNAUTHORIZED,
} from "@factorize/sdk";
import { expect } from "chai";
import { client } from "../factorize";
import {
  createUsdcMint,
  expectFactorizeError,
  setupProtocol,
  SYSTEM_PROGRAM_ADDRESS,
} from "../helpers";

describe("initConfig", () => {
  it("initializes config with valid parameters", async () => {
    const factorizeClient = await client();
    const treasury = await generateKeyPairSigner();
    const usdc = await createUsdcMint(factorizeClient);

    await factorizeClient.airdrop(treasury.address, lamports(10_000_000n));

    await factorizeClient.factorize.instructions
      .initConfig({
        admin: factorizeClient.identity,
        treasury: treasury.address,
        usdcMint: usdc.mint,
        protocolFeeBps: 500,
      })
      .sendTransaction();

    const [configPda, bump] = await factorizeClient.factorize.pdas.config();
    const config =
      await factorizeClient.factorize.accounts.config.fetch(configPda);

    expect(config.data.admin).to.equal(factorizeClient.identity.address);
    expect(config.data.treasury).to.equal(treasury.address);
    expect(config.data.usdcMint).to.equal(usdc.mint);
    expect(config.data.protocolFeeBps).to.equal(500);
    expect(config.data.paused).to.equal(false);
    expect(config.data.bump).to.equal(bump);
  });

  it("accepts protocol fee at 0 bps", async () => {
    const factorizeClient = await client();
    const treasury = await generateKeyPairSigner();
    const usdc = await createUsdcMint(factorizeClient);
    await factorizeClient.airdrop(treasury.address, lamports(10_000_000n));

    await factorizeClient.factorize.instructions
      .initConfig({
        admin: factorizeClient.identity,
        treasury: treasury.address,
        usdcMint: usdc.mint,
        protocolFeeBps: 0,
      })
      .sendTransaction();

    const [configPda] = await factorizeClient.factorize.pdas.config();
    const config =
      await factorizeClient.factorize.accounts.config.fetch(configPda);
    expect(config.data.protocolFeeBps).to.equal(0);
  });

  it("accepts protocol fee at 10000 bps", async () => {
    const factorizeClient = await client();
    const treasury = await generateKeyPairSigner();
    const usdc = await createUsdcMint(factorizeClient);
    await factorizeClient.airdrop(treasury.address, lamports(10_000_000n));

    await factorizeClient.factorize.instructions
      .initConfig({
        admin: factorizeClient.identity,
        treasury: treasury.address,
        usdcMint: usdc.mint,
        protocolFeeBps: 10_000,
      })
      .sendTransaction();

    const [configPda] = await factorizeClient.factorize.pdas.config();
    const config =
      await factorizeClient.factorize.accounts.config.fetch(configPda);
    expect(config.data.protocolFeeBps).to.equal(10_000);
  });

  it("fails when protocol fee is greater than 10000", async () => {
    const factorizeClient = await client();
    const treasury = await generateKeyPairSigner();
    const usdc = await createUsdcMint(factorizeClient);
    await factorizeClient.airdrop(treasury.address, lamports(10_000_000n));

    await expectFactorizeError(
      () =>
        factorizeClient.factorize.instructions
          .initConfig({
            admin: factorizeClient.identity,
            treasury: treasury.address,
            usdcMint: usdc.mint,
            protocolFeeBps: 10_001,
          })
          .sendTransaction(),
      FACTORIZE_ERROR__UNAUTHORIZED,
    );
  });

  it("fails when usdc mint is the default pubkey", async () => {
    const factorizeClient = await client();
    const treasury = await generateKeyPairSigner();
    await factorizeClient.airdrop(treasury.address, lamports(10_000_000n));

    await expectFactorizeError(
      () =>
        factorizeClient.factorize.instructions
          .initConfig({
            admin: factorizeClient.identity,
            treasury: treasury.address,
            usdcMint: SYSTEM_PROGRAM_ADDRESS,
            protocolFeeBps: 500,
          })
          .sendTransaction(),
      FACTORIZE_ERROR__INVALID_MINT,
    );
  });

  it("fails when config is already initialized", async () => {
    const factorizeClient = await client();
    await setupProtocol(factorizeClient);

    const treasury = await generateKeyPairSigner();
    const usdc = await createUsdcMint(factorizeClient);
    await factorizeClient.airdrop(treasury.address, lamports(10_000_000n));

    try {
      await factorizeClient.factorize.instructions
        .initConfig({
          admin: factorizeClient.identity,
          treasury: treasury.address,
          usdcMint: usdc.mint,
          protocolFeeBps: 500,
        })
        .sendTransaction();
      expect.fail("Expected second init to fail");
    } catch (error) {
      expect(error).to.exist;
    }
  });
});
