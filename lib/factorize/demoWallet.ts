import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  findAssociatedTokenPda as findLegacyAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync as getLegacyCreateAssociatedTokenIdempotentInstructionAsync,
  getMintToInstruction as getLegacyMintToInstruction,
} from "@solana-program/token";
import {
  findAssociatedTokenPda as findToken2022AssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync as getToken2022CreateAssociatedTokenIdempotentInstructionAsync,
  getMintToInstruction as getToken2022MintToInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getServerRpcUrl,
  getUsdcMint,
  resolveTokenProgramForMint,
  USDC_DECIMALS,
} from "./constants";
import { DEMO_ISSUER_MIN_LAMPORTS, formatSol } from "./demoSolBudget";
import {
  sendInstruction,
  simulateThenSendInstruction,
} from "./sendInstruction";
import { withRpcRetry } from "./rpcRetry";

export function createDemoRpc() {
  return createSolanaRpc(getServerRpcUrl());
}

export async function signerFromSecretKey(secretKey: number[]) {
  return createKeyPairSignerFromBytes(Uint8Array.from(secretKey));
}

let mintAuthoritySigner: TransactionSigner | null = null;

export async function getUsdcMintAuthoritySigner() {
  if (mintAuthoritySigner) return mintAuthoritySigner;

  const envSecret = process.env.DEMO_USDC_MINT_AUTHORITY_SECRET;
  const bytes = envSecret
    ? Uint8Array.from(JSON.parse(envSecret) as number[])
    : Uint8Array.from(
        JSON.parse(
          fs.readFileSync(path.join(process.cwd(), "usdc_mint.json"), "utf8"),
        ) as number[],
      );

  mintAuthoritySigner = await createKeyPairSignerFromBytes(bytes);
  return mintAuthoritySigner;
}

/** Enough for demo tx fees; account rent must be prefunded (see demo page SOL mins). */
const DEMO_MIN_SOL_LAMPORTS = DEMO_ISSUER_MIN_LAMPORTS;

let cachedTokenProgram: Address | null = null;

export async function resolveDemoTokenProgram(): Promise<Address> {
  if (cachedTokenProgram) return cachedTokenProgram;

  const mint = getUsdcMint();
  if (!mint) throw new Error("NEXT_PUBLIC_USDC_MINT is not configured");

  const rpc = createDemoRpc();
  cachedTokenProgram = await withRpcRetry(() =>
    resolveTokenProgramForMint(rpc, mint),
  );
  return cachedTokenProgram;
}

export async function getDemoUsdcContext() {
  const usdcMint = getUsdcMint();
  if (!usdcMint) throw new Error("NEXT_PUBLIC_USDC_MINT is not configured");
  const tokenProgram = await resolveDemoTokenProgram();
  return { usdcMint, tokenProgram };
}

export async function findDemoTokenAta(
  owner: Address,
  mint: Address,
  tokenProgram: Address,
) {
  const findAssociatedTokenPda =
    tokenProgram === TOKEN_2022_PROGRAM_ADDRESS
      ? findToken2022AssociatedTokenPda
      : findLegacyAssociatedTokenPda;
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram });
  return { ata, tokenProgram };
}

export async function ensureDemoUsdcAta(owner: Address): Promise<Address> {
  const { usdcMint, tokenProgram } = await getDemoUsdcContext();
  const { ata } = await findDemoTokenAta(owner, usdcMint, tokenProgram);
  const rpc = createDemoRpc();
  // Token-2022 ATAs exceed the RPC base58 payload limit; use base64 for existence checks.
  const { value: existing } = await withRpcRetry(() =>
    rpc.getAccountInfo(ata, { encoding: "base64" }).send(),
  );
  if (existing) {
    return ata;
  }

  const mintAuthority = await getUsdcMintAuthoritySigner();
  await ensureSolBalance(mintAuthority.address);
  const getCreateAssociatedTokenIdempotentInstructionAsync =
    tokenProgram === TOKEN_2022_PROGRAM_ADDRESS
      ? getToken2022CreateAssociatedTokenIdempotentInstructionAsync
      : getLegacyCreateAssociatedTokenIdempotentInstructionAsync;
  const createAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer: mintAuthority,
    ata,
    owner,
    mint: usdcMint,
    tokenProgram,
  });

  await sendDemoInstructions(mintAuthority, [createAtaIx]);
  return ata;
}

export async function ensureSolBalance(
  wallet: Address,
  minLamports: bigint = DEMO_MIN_SOL_LAMPORTS,
) {
  const rpc = createDemoRpc();
  const balance = await withRpcRetry(() => rpc.getBalance(wallet).send());
  if (balance.value >= minLamports) return;

  throw new Error(
    `Insufficient SOL on ${wallet}: has ${formatSol(balance.value)} SOL, needs ${formatSol(minLamports)} SOL. Prefund this wallet on devnet (see SME min on /demo).`,
  );
}

export async function confirmDemoSignature(signature: string, attempts = 30) {
  const rpc = createDemoRpc();
  for (let i = 0; i < attempts; i++) {
    const { value } = await withRpcRetry(() =>
      rpc.getSignatureStatuses([signature as never]).send(),
    );
    const status = value[0];
    if (
      status &&
      (status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized")
    ) {
      return;
    }
    await sleep(1000);
  }
  throw new Error(`Transaction not confirmed: ${signature}`);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Validator unix time — anchors demo due/settle dates to the chain clock. */
export async function getDemoChainUnixTime(): Promise<number> {
  const rpc = createDemoRpc();
  const slot = await withRpcRetry(() => rpc.getSlot().send());
  const blockTime = await withRpcRetry(() => rpc.getBlockTime(slot).send());
  if (blockTime !== null) return Number(blockTime);
  return Math.floor(Date.now() / 1000);
}

export async function mintUsdcToOwner(
  owner: Address,
  amount: bigint,
): Promise<string> {
  const { usdcMint, tokenProgram } = await getDemoUsdcContext();
  const isToken2022 = tokenProgram === TOKEN_2022_PROGRAM_ADDRESS;

  const findAssociatedTokenPda = isToken2022
    ? findToken2022AssociatedTokenPda
    : findLegacyAssociatedTokenPda;
  const getCreateAssociatedTokenIdempotentInstructionAsync = isToken2022
    ? getToken2022CreateAssociatedTokenIdempotentInstructionAsync
    : getLegacyCreateAssociatedTokenIdempotentInstructionAsync;
  const getMintToInstruction = isToken2022
    ? getToken2022MintToInstruction
    : getLegacyMintToInstruction;

  const mintAuthority = await getUsdcMintAuthoritySigner();
  await ensureSolBalance(mintAuthority.address);

  const [destination] = await findAssociatedTokenPda({
    owner,
    mint: usdcMint,
    tokenProgram,
  });

  const createAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer: mintAuthority,
    ata: destination,
    owner,
    mint: usdcMint,
    tokenProgram,
  });

  const mintIx = getMintToInstruction({
    mint: usdcMint,
    token: destination,
    mintAuthority,
    amount,
  });

  return sendDemoInstructions(mintAuthority, [createAtaIx, mintIx]);
}

export async function sendDemoInstructions(
  feePayer: TransactionSigner,
  instructions: Instruction[],
): Promise<string> {
  const rpc = createDemoRpc();
  await ensureSolBalance(feePayer.address);

  let signature = "";
  for (const instruction of instructions) {
    signature = await sendInstruction({ rpc, signer: feePayer, instruction });
    await confirmDemoSignature(signature);
  }
  return signature;
}

export async function sendDemoInstructionSimulateThenSend(
  feePayer: TransactionSigner,
  instruction: Instruction,
): Promise<string> {
  const rpc = createDemoRpc();
  await ensureSolBalance(feePayer.address);
  const signature = await simulateThenSendInstruction({
    rpc,
    signer: feePayer,
    instruction,
  });
  await confirmDemoSignature(signature);
  return signature;
}

export function randomRepaymentMicro(): bigint {
  const min = 5_000n;
  const max = 20_000n;
  const whole = min + BigInt(Math.floor(Math.random() * Number(max - min + 1n)));
  return whole * 1_000_000n;
}

export function randomAdvanceMicro(repaymentMicro: bigint): bigint {
  const pct = 80 + Math.floor(Math.random() * 16);
  return (repaymentMicro * BigInt(pct)) / 100n;
}

export function formatMicroUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = amount % 1_000_000n;
  if (fraction === 0n) return `${whole} USDC`;
  return `${whole}.${fraction.toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "")} USDC`;
}

export function invoiceStatusLabel(status: number): string {
  return (
    ["Funding", "InProgress", "Settled", "Expired", "Defaulted"][status] ??
    `Unknown(${status})`
  );
}
