import {
  getOnChainConfigAdmin,
  isAnalystWhitelistedOnChain,
} from "@/lib/factorize/protocolState";

export function getEnvAdminWallets(): string[] {
  return (
    process.env.FACTORIZE_ADMIN_WALLETS?.split(",").map((w) => w.trim()) ?? []
  ).filter(Boolean);
}

export async function isPlatformAdmin(wallet: string): Promise<boolean> {
  if (getEnvAdminWallets().includes(wallet)) return true;

  const onChainAdmin = await getOnChainConfigAdmin();
  return onChainAdmin === wallet;
}

export async function canAccessAdminPortal(wallet: string): Promise<boolean> {
  if (await isPlatformAdmin(wallet)) return true;
  return isAnalystWhitelistedOnChain(wallet);
}

/** @deprecated Prefer isPlatformAdmin or canAccessAdminPortal */
export async function isAdminWallet(wallet: string): Promise<boolean> {
  return canAccessAdminPortal(wallet);
}

export type WalletAdminStatus = {
  isPlatformAdmin: boolean;
  isWhitelistedAnalyst: boolean;
  canAccessAdminPortal: boolean;
  onChainAdmin: string | null;
  matchesOnChainAdmin: boolean;
  inEnvAdminList: boolean;
};

export async function getWalletAdminStatus(
  wallet: string,
): Promise<WalletAdminStatus> {
  const inEnvAdminList = getEnvAdminWallets().includes(wallet);
  const onChainAdmin = await getOnChainConfigAdmin();
  const matchesOnChainAdmin = onChainAdmin === wallet;
  const isPlatformAdminWallet =
    inEnvAdminList || matchesOnChainAdmin;
  const isWhitelistedAnalyst = await isAnalystWhitelistedOnChain(wallet);

  return {
    isPlatformAdmin: isPlatformAdminWallet,
    isWhitelistedAnalyst,
    canAccessAdminPortal:
      isPlatformAdminWallet || isWhitelistedAnalyst,
    onChainAdmin,
    matchesOnChainAdmin,
    inEnvAdminList,
  };
}
