import {
  createClient,
  generateKeyPairSigner,
  lamports,
  type Address,
} from "@solana/kit";
import { signer } from "@solana/kit-plugin-signer";
import { litesvm, litesvmAirdrop } from "@solana/kit-plugin-litesvm";
import { tokenProgram } from "@solana-program/token";
import { factorizeProgram, FACTORIZE_PROGRAM_ADDRESS } from "@factorize/sdk";
import * as fs from "node:fs";
import * as path from "node:path";

export type FactorizeTestClient = Awaited<ReturnType<typeof client>>;

export async function client() {
  const admin = await generateKeyPairSigner();
  const testClient = createClient()
    .use(signer(admin))
    .use(litesvm())
    .use(litesvmAirdrop())
    .use(tokenProgram())
    .use(factorizeProgram());

  testClient.svm
    .withSigverify(false)
    .withBlockhashCheck(false)
    .withSysvars()
    .withBuiltins()
    .withDefaultPrograms();

  const programId = FACTORIZE_PROGRAM_ADDRESS as Address;
  const soPath = path.resolve(__dirname, "../target/deploy/factorize.so");

  if (!fs.existsSync(soPath)) {
    throw new Error(
      `Program file ${soPath} does not exist. Run 'anchor build' first.`,
    );
  }

  testClient.svm.addProgramFromFile(programId, soPath);

  const clock = testClient.svm.getClock();
  if (clock.unixTimestamp < 1_000_000n) {
    clock.unixTimestamp = 1_700_000_000n;
    testClient.svm.setClock(clock);
  }

  await testClient.airdrop(testClient.identity.address, lamports(100_000_000_000n));

  return testClient;
}
