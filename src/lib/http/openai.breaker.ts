import CircuitBreaker from 'opossum';
import { AxiosResponse } from 'axios';
import { openaiClient } from './openai.client';
import { withRetry } from './retry';
import { logger } from '../logger';
import { ServiceUnavailableError } from '../errors';

async function callOpenAI(path: string, body: unknown): Promise<AxiosResponse> {
  return withRetry(() => openaiClient.post(path, body));
}

// When OpenAI is down, fail fast instead of making every request wait for timeouts.
const breaker = new CircuitBreaker(callOpenAI, {
  timeout: 35000, // a little longer than the HTTP client timeout
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  rollingCountTimeout: 60000,
  rollingCountBuckets: 10,
});

breaker.on('open', () => logger.warn('OpenAI circuit breaker OPEN: failing fast'));
breaker.on('halfOpen', () => logger.warn('OpenAI circuit breaker HALF-OPEN: testing recovery'));
breaker.on('close', () => logger.info('OpenAI circuit breaker CLOSED: normal operation'));

/**
 * The only way the app talks to OpenAI.
 * Note: a breaker fallback would also swallow ordinary failures (a 400 from a bad
 * request would look like an outage), so only the open-circuit case is translated.
 */
export async function openaiRequest<T = any>(path: string, body: unknown): Promise<T> {
  try {
    const response = await breaker.fire(path, body);
    return response.data as T;
  } catch (error) {
    if ((error as { code?: string }).code === 'EOPENBREAKER') {
      throw new ServiceUnavailableError('The AI provider is temporarily unavailable. Please try again shortly.');
    }
    throw error;
  }
}

export { breaker as openaiBreaker };
