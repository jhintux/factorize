import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  getBase58Decoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  signTransactionMessageWithSigners,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
} from "@solana/kit";
import { isTransactionSendingSigner } from "@solana/signers";
import {
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
} from "@solana/transactions";

type SendInstructionParams = {
  rpc: Rpc<SolanaRpcApi>;
  signer: TransactionSigner;
  instruction: Instruction;
};

/**
 * Builds a version-0 transaction message for a Codama/Anchor program instruction.
 * Matches the Para + Kit program-interaction pattern:
 * https://docs.getpara.com/v2/react/guides/web3-operations/solana/interact-with-programs
 */
export async function buildProgramTransactionMessage({
  rpc,
  signer,
  instruction,
}: SendInstructionParams) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  return pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(signer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstruction(instruction, tx),
  );
}

/**
 * Signs and sends a single program instruction.
 *
 * - Para embedded wallets (`signAndSendTransactions`): uses Kit's
 *   `signAndSendTransactionMessageWithSigners`, as in Para's Anchor/Codama docs.
 * - External Wallet Standard wallets: sign via `signTransactionMessageWithSigners`,
 *   then broadcast through RPC.
 */
export async function sendInstruction({
  rpc,
  signer,
  instruction,
}: SendInstructionParams): Promise<string> {
  const transactionMessage = await buildProgramTransactionMessage({
    rpc,
    signer,
    instruction,
  });

  if (isTransactionSendingSigner(signer)) {
    const signatureBytes =
      await signAndSendTransactionMessageWithSigners(transactionMessage);
    return getBase58Decoder().decode(signatureBytes);
  }

  return sendSignedProgramTransactionMessage(rpc, transactionMessage);
}

/** Simulate first, then send immediately — minimizes latency after time-sensitive waits. */
export async function simulateThenSendInstruction({
  rpc,
  signer,
  instruction,
}: SendInstructionParams): Promise<string> {
  const transactionMessage = await buildProgramTransactionMessage({
    rpc,
    signer,
    instruction,
  });

  const signedTransaction =
    await signTransactionMessageWithSigners(transactionMessage);
  const wireTx = getBase64EncodedWireTransaction(signedTransaction);

  const { value: simulation } = await rpc
    .simulateTransaction(wireTx, {
      encoding: "base64",
      sigVerify: false,
      replaceRecentBlockhash: true,
    })
    .send();

  if (simulation.err) {
    const logs = simulation.logs?.join("\n") ?? "";
    throw new Error(
      `Simulation failed: ${JSON.stringify(simulation.err)}${logs ? `\n${logs}` : ""}`,
    );
  }

  return sendSignedProgramTransactionMessage(rpc, transactionMessage);
}

export async function sendSignedProgramTransactionMessage(
  rpc: Rpc<SolanaRpcApi>,
  transactionMessage: Awaited<ReturnType<typeof buildProgramTransactionMessage>>,
): Promise<string> {
  const signedTransaction =
    await signTransactionMessageWithSigners(transactionMessage);
  const signature = getSignatureFromTransaction(signedTransaction);

  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signedTransaction), {
      preflightCommitment: "confirmed",
      encoding: "base64",
    })
    .send();

  return signature;
}
