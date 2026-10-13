import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { config } from '../config';
import { logger } from '../logger';

type TimedConfig = InternalAxiosRequestConfig & { metadata?: { startTime: number } };

// One configured client per external service: base URL, auth and timeout live here.
export const openaiClient: AxiosInstance = axios.create({
  baseURL: config.OPENAI_BASE_URL,
  timeout: 30000, // AI calls legitimately take a while; never wait forever
  headers: {
    Authorization: `Bearer ${config.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
    'User-Agent': 'DocuChat/1.0',
  },
});

openaiClient.interceptors.request.use((req: TimedConfig) => {
  req.metadata = { startTime: Date.now() };
  return req;
});

openaiClient.interceptors.response.use(
  (response) => {
    const start = (response.config as TimedConfig).metadata?.startTime;
    logger.debug('OpenAI request completed', {
      url: response.config.url,
      status: response.status,
      durationMs: start ? Date.now() - start : undefined,
    });
    return response;
  },
  (error) => {
    const start = (error.config as TimedConfig | undefined)?.metadata?.startTime;
    const durationMs = start ? Date.now() - start : undefined;
    // Three different failures, three different fixes: keep them apart in the logs.
    if (error.response) {
      logger.warn('OpenAI returned an error status', {
        url: error.config?.url,
        status: error.response.status,
        durationMs,
      });
    } else if (error.request) {
      logger.warn('OpenAI did not respond', { url: error.config?.url, durationMs, error: error.message });
    } else {
      logger.error('OpenAI request setup failed', { error: error.message });
    }
    return Promise.reject(error);
  },
);
