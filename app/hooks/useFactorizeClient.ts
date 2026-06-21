"use client";

import { useParaSolanaSigner, useParaSolanaSignAndSend } from "@getpara/react-sdk/solana/hooks";
import type { ParaSolanaSigner } from "@getpara/solana-signers-v2-integration";
import { useWallet } from "@solana/wallet-adapter-react";
import { createSolanaRpc } from "@solana/kit";
import { useWallets } from "@wallet-standard/react";
import { useMemo } from "react";
import { getRpcUrl } from "@/lib/factorize/constants";
import {
  createWalletStandardTransactionSigner,
  findUiWalletAccount,
  getSolanaChain,
  isEmbeddedParaSigner,
} from "@/lib/factorize/walletStandardSigner";

/**
 * Solana client hook for Factorize program interactions.
 *
 * Signer resolution (Para docs: https://docs.getpara.com/v2/react/guides/web3-operations/solana/setup-libraries):
 * 1. Para embedded Solana wallet — `useParaSolanaSigner` (native Kit v2 signer).
 * 2. External wallet connected through Para (Phantom, etc.) — Wallet Standard bridge,
 *    because Para's wallet-adapter wrapper passes Kit transactions to web3.js adapters.
 *
 * Transaction sending follows Para's Codama/Anchor flow via `sendInstruction`:
 * https://docs.getpara.com/v2/react/guides/web3-operations/solana/interact-with-programs
 */
export function useFactorizeClient() {
  const chain = getSolanaChain();
  const rpcUrl = getRpcUrl();
  const rpc = useMemo(() => createSolanaRpc(rpcUrl), [rpcUrl]);
  const { solanaSigner: paraSigner, isLoading, error } = useParaSolanaSigner({ rpc });
  const embeddedSigner = isEmbeddedParaSigner(paraSigner)
    ? (paraSigner as ParaSolanaSigner)
    : null;
  const { signAndSendAsync, isPending: isSending } =
    useParaSolanaSignAndSend(embeddedSigner);
  const wallet = useWallet();
  const wallets = useWallets();

  const solanaSigner = useMemo(() => {
    if (embeddedSigner) {
      return embeddedSigner;
    }

    if (wallet.connected && wallet.publicKey) {
      const uiAccount = findUiWalletAccount(wallets, wallet.publicKey.toBase58());
      if (uiAccount) {
        try {
          return createWalletStandardTransactionSigner(uiAccount, chain);
        } catch {
          return paraSigner;
        }
      }
    }

    return paraSigner;
  }, [embeddedSigner, paraSigner, wallet.connected, wallet.publicKey, wallets, chain]);

  return {
    rpc,
    rpcUrl,
    solanaSigner,
    /** Para embedded wallet only — signs and sends compiled transactions. */
    signAndSendAsync,
    isLoading,
    isSending,
    error,
    isReady: Boolean(solanaSigner) && !isLoading,
  };
}
