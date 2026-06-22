function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_MAX_ATTEMPTS = 8;
const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;

/** Detects HTTP 429 / Solana Kit rate-limit errors from public devnet RPC. */
export function isRpcRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("429") ||
    msg.includes("Too Many") ||
    msg.includes("8100002") ||
    msg.toLowerCase().includes("rate limit")
  );
}

/**
 * Retries an RPC call with exponential backoff when the provider returns 429.
 * Used for server-side demo flows on the public devnet endpoint.
 */
export async function withRpcRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; initialBackoffMs?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const initialBackoffMs = options?.initialBackoffMs ?? INITIAL_BACKOFF_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRpcRateLimitError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      const backoff = Math.min(initialBackoffMs * 2 ** attempt, MAX_BACKOFF_MS);
      await sleep(backoff);
    }
  }

  throw lastError;
}
