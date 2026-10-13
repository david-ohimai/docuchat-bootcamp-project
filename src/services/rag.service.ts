import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { appEvents, EVENTS } from '../lib/events';
import { openaiRequest } from '../lib/http/openai.breaker';
import { RAG_SYSTEM_PROMPT } from '../config/prompts';
import type { SearchResult } from './search.service';

export interface Citation {
  index: number; // [Source 1], [Source 2], ...
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  score: number;
}

export interface AssembledContext {
  chunks: SearchResult[];
  contextText: string;
  totalTokens: number;
  citations: Citation[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RAGResponse {
  answer: string;
  citations: Citation[];
  tokensUsed: { prompt: number; completion: number; total: number };
  costUsd: number;
  model: string;
}

export const CONTEXT_TOKEN_BUDGET = 3500;
const HISTORY_MESSAGES = 10; // last 5 question/answer pairs

// USD per 1M tokens [input, output]. Unknown models fall back to gpt-4o pricing
// so cost is over- rather than under-estimated.
const PRICING: Record<string, [number, number]> = {
  'gpt-4o': [2.5, 10],
  'gpt-4o-mini': [0.15, 0.6],
};

export function estimateChatCost(model: string, promptTokens: number, completionTokens: number): number {
  const [input, output] = PRICING[model] ?? PRICING['gpt-4o'];
  return (promptTokens / 1_000_000) * input + (completionTokens / 1_000_000) * output;
}

// Overlapping chunking means neighbours share text; including both wastes budget.
function isRedundant(candidate: SearchResult, selected: SearchResult[]): boolean {
  return selected.some(
    (s) => s.documentId === candidate.documentId && Math.abs(s.chunkIndex - candidate.chunkIndex) <= 1,
  );
}

/** Picks the highest-scoring chunks that fit the token budget and numbers them for citation. */
export function assembleContext(results: SearchResult[], budget = CONTEXT_TOKEN_BUDGET): AssembledContext {
  const selected: SearchResult[] = [];
  let totalTokens = 0;

  for (const result of results) {
    if (isRedundant(result, selected)) continue;
    if (totalTokens + result.tokenCount > budget) continue; // a smaller chunk may still fit
    selected.push(result);
    totalTokens += result.tokenCount;
  }

  const citations = selected.map((chunk, i) => ({
    index: i + 1,
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    chunkIndex: chunk.chunkIndex,
    score: chunk.score,
  }));

  const contextText = selected
    .map((chunk, i) => `[Source ${i + 1}: "${chunk.documentTitle}", Section ${chunk.chunkIndex + 1}]\n${chunk.content}`)
    .join('\n\n---\n\n');

  return { chunks: selected, contextText, totalTokens, citations };
}

export function buildMessages(question: string, context: AssembledContext, history: ChatMessage[] = []): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: RAG_SYSTEM_PROMPT }, ...history.slice(-HISTORY_MESSAGES)];

  messages.push({
    role: 'user',
    content:
      context.chunks.length > 0
        ? ['Here is the relevant context from my documents:', '', context.contextText, '', '---', '', `My question: ${question}`].join('\n')
        : ['No relevant context was found in my documents for this question.', '', `My question: ${question}`].join('\n'),
  });

  return messages;
}

interface ChatCompletionResponse {
  choices: { message: { content: string | null } }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function generateRAGResponse(options: {
  question: string;
  context: AssembledContext;
  history?: ChatMessage[];
  userId: string;
  conversationId: string;
  correlationId?: string;
}): Promise<RAGResponse> {
  const { question, context, history, userId, conversationId, correlationId } = options;
  const model = config.CHAT_MODEL;
  const start = Date.now();

  const result = await openaiRequest<ChatCompletionResponse>('/chat/completions', {
    model,
    messages: buildMessages(question, context, history),
    temperature: 0.1, // factual, not creative
    max_tokens: 1500,
  });

  const usage = result.usage;
  const costUsd = estimateChatCost(model, usage.prompt_tokens, usage.completion_tokens);

  logger.info('RAG response generated', {
    correlationId,
    conversationId,
    model,
    contextChunks: context.chunks.length,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    costUsd: costUsd.toFixed(6),
    durationMs: Date.now() - start,
  });

  appEvents.emit(EVENTS.CHAT_COMPLETED, {
    userId,
    conversationId,
    correlationId,
    model,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    costUsd,
  });

  return {
    answer: result.choices[0]?.message.content ?? '',
    citations: context.citations,
    tokensUsed: { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens },
    costUsd,
    model,
  };
}
