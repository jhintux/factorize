export function truncateWallet(wallet: string): string {
  if (wallet.length <= 8) return wallet;
  return `${wallet.slice(0, 3)}…${wallet.slice(-3)}`;
}

export function isValidWallet(wallet: string): boolean {
  return typeof wallet === "string" && wallet.length >= 32 && wallet.length <= 64;
}
