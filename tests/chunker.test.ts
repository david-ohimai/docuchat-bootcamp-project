import { describe, it, expect } from 'vitest';
import { chunkDocument, estimateTokens } from '../src/lib/chunker';

const paragraph = (n: number, words = 120) =>
  Array.from({ length: words }, (_, i) => `p${n}w${i}`).join(' ') + '.';

describe('chunkDocument', () => {
  it('returns nothing for empty text', () => {
    expect(chunkDocument('   ')).toEqual([]);
  });

  it('keeps a short document as one chunk instead of dropping it', () => {
    const chunks = chunkDocument('Refunds are accepted within 30 days.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Refunds are accepted within 30 days.');
  });

  it('never exceeds maxTokens before overlap is added', () => {
    const text = Array.from({ length: 12 }, (_, i) => paragraph(i)).join('\n\n');
    const chunks = chunkDocument(text, { maxTokens: 300, overlapTokens: 0, minChunkTokens: 1 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(estimateTokens(c.text)).toBeLessThanOrEqual(300);
  });

  it('splits on paragraph boundaries first', () => {
    const text = [paragraph(1), paragraph(2), paragraph(3)].join('\n\n');
    const chunks = chunkDocument(text, { maxTokens: 400, overlapTokens: 0, minChunkTokens: 1 });
    for (const c of chunks) {
      expect(c.text.startsWith('p')).toBe(true);
      expect(c.text.endsWith('.')).toBe(true);
    }
  });

  it('falls back to sentences when a single paragraph is too long', () => {
    const sentences = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about refunds and returns`).join('. ');
    const chunks = chunkDocument(sentences, { maxTokens: 100, overlapTokens: 0, minChunkTokens: 1 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(estimateTokens(c.text)).toBeLessThanOrEqual(100);
  });

  it('prepends the tail of the previous chunk as overlap', () => {
    const text = [paragraph(1), paragraph(2)].join('\n\n');
    const chunks = chunkDocument(text, { maxTokens: 250, overlapTokens: 20, minChunkTokens: 1 });
    expect(chunks).toHaveLength(2);
    const lastWordsOfFirst = chunks[0].text.split(/\s+/).slice(-5).join(' ');
    expect(chunks[1].text).toContain(lastWordsOfFirst);
  });

  it('records character offsets that point back into the original text', () => {
    const text = [paragraph(1), paragraph(2), paragraph(3)].join('\n\n');
    const chunks = chunkDocument(text, { maxTokens: 250, overlapTokens: 0, minChunkTokens: 1 });
    for (const c of chunks) {
      expect(text.slice(c.metadata.startChar, c.metadata.endChar)).toBe(c.text);
    }
  });

  it('numbers chunks sequentially', () => {
    const text = Array.from({ length: 6 }, (_, i) => paragraph(i)).join('\n\n');
    const chunks = chunkDocument(text, { maxTokens: 200 });
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });
});
