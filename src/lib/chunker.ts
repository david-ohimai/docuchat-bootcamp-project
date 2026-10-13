// Recursive chunking with overlap.
// Split on the largest natural boundary first (paragraphs), and only fall back to
// smaller ones (lines, sentences, words) for pieces that are still too big.

export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
  minChunkTokens?: number;
}

export interface TextChunk {
  text: string;
  index: number;
  tokenEstimate: number;
  metadata: { startChar: number; endChar: number };
}

interface Piece {
  text: string;
  startChar: number;
}

const SEPARATORS = ['\n\n', '\n', '. ', '? ', '! ', ' '];

// Rough but consistent: ~4 characters per token for English text.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkDocument(text: string, options: ChunkOptions = {}): TextChunk[] {
  const { maxTokens = 500, overlapTokens = 50, minChunkTokens = 50 } = options;
  if (!text.trim()) return [];

  const raw = recursiveSplit(text, SEPARATORS, maxTokens, 0);
  const withOverlap = addOverlap(raw, overlapTokens);

  let kept = withOverlap.filter((c) => estimateTokens(c.text) >= minChunkTokens);
  // A short document is still a document: never drop everything.
  if (kept.length === 0) kept = withOverlap;

  return kept.map((c, index) => ({
    text: c.text,
    index,
    tokenEstimate: estimateTokens(c.text),
    metadata: { startChar: c.startChar, endChar: c.endChar },
  }));
}

function recursiveSplit(text: string, separators: string[], maxTokens: number, base: number): Piece[] {
  if (estimateTokens(text) <= maxTokens) {
    return [{ text: text.trim(), startChar: base + leadingWhitespace(text) }];
  }

  for (let s = 0; s < separators.length; s++) {
    const sep = separators[s];
    const parts = text.split(sep).filter((p) => p.trim());
    if (parts.length <= 1) continue;

    // Merge neighbouring parts while they fit, tracking real character offsets.
    const merged: Piece[] = [];
    let current = '';
    let currentStart = 0;
    let cursor = 0;

    for (const part of parts) {
      const at = text.indexOf(part, cursor);
      cursor = at + part.length;
      const combined = current ? current + sep + part : part;

      if (current && estimateTokens(combined) > maxTokens) {
        merged.push({ text: current, startChar: currentStart });
        current = part;
        currentStart = at;
      } else {
        if (!current) currentStart = at;
        current = combined;
      }
    }
    if (current.trim()) merged.push({ text: current, startChar: currentStart });

    const remaining = separators.slice(s + 1);
    return merged.flatMap((piece) =>
      estimateTokens(piece.text) > maxTokens && remaining.length > 0
        ? recursiveSplit(piece.text, remaining, maxTokens, base + piece.startChar)
        : [{ text: piece.text.trim(), startChar: base + piece.startChar + leadingWhitespace(piece.text) }],
    );
  }

  return [{ text: text.trim(), startChar: base }];
}

function leadingWhitespace(text: string): number {
  return text.length - text.trimStart().length;
}

function addOverlap(pieces: Piece[], overlapTokens: number): (Piece & { endChar: number })[] {
  return pieces.map((piece, i) => {
    const endChar = piece.startChar + piece.text.length;
    if (i === 0 || overlapTokens === 0) return { ...piece, endChar };
    const overlap = lastNTokens(pieces[i - 1].text, overlapTokens);
    return { text: `${overlap}\n${piece.text}`, startChar: piece.startChar, endChar };
  });
}

function lastNTokens(text: string, n: number): string {
  const words = text.split(/\s+/);
  return words.slice(-Math.ceil(n / 1.3)).join(' ');
}
