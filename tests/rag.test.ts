import { describe, it, expect } from 'vitest';
import { assembleContext, buildMessages, estimateChatCost } from '../src/services/rag.service';
import type { SearchResult } from '../src/services/search.service';

const result = (over: Partial<SearchResult>): SearchResult => ({
  chunkId: 'c',
  documentId: 'doc-1',
  documentTitle: 'Handbook',
  content: 'text',
  chunkIndex: 0,
  tokenCount: 100,
  score: 0.8,
  ...over,
});

describe('assembleContext', () => {
  it('numbers sources and builds matching citations', () => {
    const ctx = assembleContext([
      result({ chunkId: 'a', chunkIndex: 0, content: 'Refunds within 30 days.' }),
      result({ chunkId: 'b', chunkIndex: 5, content: 'Receipts are required.' }),
    ]);
    expect(ctx.citations.map((c) => c.index)).toEqual([1, 2]);
    expect(ctx.contextText).toContain('[Source 1: "Handbook", Section 1]');
    expect(ctx.contextText).toContain('[Source 2: "Handbook", Section 6]');
  });

  it('skips chunks adjacent to an already selected chunk from the same document', () => {
    const ctx = assembleContext([
      result({ chunkId: 'a', chunkIndex: 4 }),
      result({ chunkId: 'b', chunkIndex: 5 }), // overlaps chunk 4
      result({ chunkId: 'c', chunkIndex: 5, documentId: 'doc-2' }), // other document: keep
    ]);
    expect(ctx.chunks.map((c) => c.chunkId)).toEqual(['a', 'c']);
  });

  it('respects the token budget but still fits a smaller later chunk', () => {
    const ctx = assembleContext(
      [
        result({ chunkId: 'a', chunkIndex: 0, tokenCount: 300 }),
        result({ chunkId: 'b', chunkIndex: 10, tokenCount: 300 }), // would exceed 500
        result({ chunkId: 'c', chunkIndex: 20, tokenCount: 150 }),
      ],
      500,
    );
    expect(ctx.chunks.map((c) => c.chunkId)).toEqual(['a', 'c']);
    expect(ctx.totalTokens).toBe(450);
  });

  it('returns an empty context for no results', () => {
    const ctx = assembleContext([]);
    expect(ctx.chunks).toEqual([]);
    expect(ctx.citations).toEqual([]);
  });
});

describe('buildMessages', () => {
  it('starts with the system prompt and ends with the question', () => {
    const ctx = assembleContext([result({ content: 'Refunds within 30 days.' })]);
    const messages = buildMessages('What is the refund window?', ctx);
    expect(messages[0].role).toBe('system');
    expect(messages.at(-1)!.content).toContain('My question: What is the refund window?');
    expect(messages.at(-1)!.content).toContain('Refunds within 30 days.');
  });

  it('keeps only the last 10 history messages', () => {
    const history = Array.from({ length: 14 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
    const messages = buildMessages('q', assembleContext([]), history);
    // system + 10 history + question
    expect(messages).toHaveLength(12);
    expect(messages[1].content).toBe('m4');
  });

  it('tells the model when no context was found', () => {
    const messages = buildMessages('q', assembleContext([]));
    expect(messages.at(-1)!.content).toContain('No relevant context was found');
  });
});

describe('estimateChatCost', () => {
  it('prices input and output tokens separately', () => {
    expect(estimateChatCost('gpt-4o-mini', 1_000_000, 1_000_000)).toBeCloseTo(0.75);
  });

  it('falls back to the more expensive price for unknown models', () => {
    expect(estimateChatCost('some-new-model', 1_000_000, 0)).toBeCloseTo(2.5);
  });
});
