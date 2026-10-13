import { AxiosError } from 'axios';
import { logger } from '../logger';

// Transient failures are worth retrying; a 400 will still be a 400 in five seconds.
export function isRetryable(error: AxiosError): boolean {
  if (!error.response) return true; // timeout or network error
  const status = error.response.status;
  return status === 408 || status === 429 || status >= 500;
}

// Retry-After may be seconds ("12") or an HTTP date. Unparseable values fall back to backoff.
export function retryDelayMs(error: AxiosError, attempt: number, baseDelayMs: number): number {
  const header = error.response?.headers?.['retry-after'];
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(String(header));
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  return baseDelayMs * Math.pow(2, attempt - 1);
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000 } = options;

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof AxiosError) || !isRetryable(error) || attempt >= maxAttempts) {
        throw error;
      }
      const delayMs = retryDelayMs(error, attempt, baseDelayMs);
      logger.warn('Retrying external call', { attempt, delayMs, error: error.message });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
