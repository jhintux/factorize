import { address } from "@solana/addresses";
import { bytesEqual } from "@solana/codecs-core";
import {
  SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED,
  SolanaError,
} from "@solana/errors";
import type { TransactionModifyingSigner } from "@solana/signers";
import { getCompiledTransactionMessageDecoder } from "@solana/transaction-messages";
import {
  SolanaSignTransaction,
  type SolanaSignTransactionFeature,
} from "@solana/wallet-standard-features";
import {
  assertIsTransactionWithinSizeLimit,
  getTransactionCodec,
  getTransactionLifetimeConstraintFromCompiledTransactionMessage,
  type Transaction,
  type TransactionWithLifetime,
  type TransactionWithinSizeLimit,
} from "@solana/transactions";
import {
  WALLET_STANDARD_ERROR__FEATURES__WALLET_ACCOUNT_CHAIN_UNSUPPORTED,
  WalletStandardError,
} from "@wallet-standard/errors";
import type { UiWallet, UiWalletAccount } from "@wallet-standard/ui";
import { getWalletAccountFeature } from "@wallet-standard/ui";
import { getWalletAccountForUiWalletAccount_DO_NOT_USE_OR_YOU_WILL_BE_FIRED } from "@wallet-standard/ui-registry";

export function getSolanaChain(): `solana:${string}` {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  return `solana:${cluster}`;
}

export function findUiWalletAccount(
  wallets: readonly UiWallet[],
  walletAddress: string,
): UiWalletAccount | null {
  for (const wallet of wallets) {
    const account = wallet.accounts.find((entry) => entry.address === walletAddress);
    if (account) {
      return account;
    }
  }
  return null;
}

export function isEmbeddedParaSigner(
  signer: TransactionModifyingSigner | null | undefined,
): signer is TransactionModifyingSigner & {
  signAndSendTransactions: NonNullable<unknown>;
} {
  return (
    signer != null &&
    "signAndSendTransactions" in signer &&
    typeof signer.signAndSendTransactions === "function"
  );
}

/**
 * Kit-compatible signer for Wallet Standard wallets (Phantom, Backpack, etc.).
 * Mirrors {@link useWalletAccountTransactionSigner} from `@solana/react` without
 * requiring a React hook, so it can be created inside `useMemo`.
 */
export function createWalletStandardTransactionSigner(
  uiWalletAccount: UiWalletAccount,
  chain: `solana:${string}`,
): TransactionModifyingSigner {
  if (!uiWalletAccount.chains.includes(chain)) {
    throw new WalletStandardError(
      WALLET_STANDARD_ERROR__FEATURES__WALLET_ACCOUNT_CHAIN_UNSUPPORTED,
      {
        address: uiWalletAccount.address,
        chain,
        featureName: SolanaSignTransaction,
        supportedChains: [...uiWalletAccount.chains],
        supportedFeatures: [...uiWalletAccount.features],
      },
    );
  }

  const signTransactionFeature = getWalletAccountFeature(
    uiWalletAccount,
    SolanaSignTransaction,
  ) as SolanaSignTransactionFeature[typeof SolanaSignTransaction];
  const standardAccount =
    getWalletAccountForUiWalletAccount_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(uiWalletAccount);
  const transactionCodec = getTransactionCodec();

  return {
    address: address(uiWalletAccount.address),
    async modifyAndSignTransactions(transactions, config = {}) {
      const { abortSignal, ...options } = config;
      abortSignal?.throwIfAborted();

      if (transactions.length > 1) {
        throw new SolanaError(SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED);
      }
      if (transactions.length === 0) {
        return transactions as readonly (Transaction &
          TransactionWithinSizeLimit &
          TransactionWithLifetime)[];
      }

      const [transaction] = transactions;
      const wireTransactionBytes = transactionCodec.encode(transaction);
      const minContextSlot = options.minContextSlot;

      const [{ signedTransaction }] = await signTransactionFeature.signTransaction({
        transaction: wireTransactionBytes as Uint8Array,
        account: standardAccount,
        chain,
        ...(minContextSlot != null
          ? { options: { minContextSlot: Number(minContextSlot) } }
          : null),
      });

      const decodedSignedTransaction = transactionCodec.decode(
        signedTransaction,
      ) as (typeof transactions)[number];
      assertIsTransactionWithinSizeLimit(decodedSignedTransaction);

      const existingLifetime =
        "lifetimeConstraint" in transaction
          ? (transaction as TransactionWithLifetime).lifetimeConstraint
          : undefined;

      if (existingLifetime) {
        if (bytesEqual(decodedSignedTransaction.messageBytes, transaction.messageBytes)) {
          return Object.freeze([
            {
              ...decodedSignedTransaction,
              lifetimeConstraint: existingLifetime,
            },
          ]);
        }

        const compiledTransactionMessage = getCompiledTransactionMessageDecoder().decode(
          decodedSignedTransaction.messageBytes,
        );
        const currentToken =
          "blockhash" in existingLifetime
            ? existingLifetime.blockhash
            : existingLifetime.nonce;

        if (compiledTransactionMessage.lifetimeToken === currentToken) {
          return Object.freeze([
            {
              ...decodedSignedTransaction,
              lifetimeConstraint: existingLifetime,
            },
          ]);
        }
      }

      const compiledTransactionMessage = getCompiledTransactionMessageDecoder().decode(
        decodedSignedTransaction.messageBytes,
      );
      const lifetimeConstraint =
        await getTransactionLifetimeConstraintFromCompiledTransactionMessage(
          compiledTransactionMessage,
        );

      return Object.freeze([
        {
          ...decodedSignedTransaction,
          lifetimeConstraint,
        },
      ]);
    },
  };
}
