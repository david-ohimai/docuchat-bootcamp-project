import pdfParse from 'pdf-parse';
import { UnprocessableError } from './errors';

export type SupportedFormat = 'text' | 'markdown' | 'pdf';

// Detect format from the extension, never by trying to parse the content.
export function detectFormat(filename: string): SupportedFormat {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'txt':
      return 'text';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'pdf':
      return 'pdf';
    default:
      throw new UnprocessableError(`Unsupported file format: .${ext ?? 'unknown'} (use .txt, .md or .pdf)`);
  }
}

export async function extractText(
  content: Buffer | string,
  format: SupportedFormat,
): Promise<{ text: string; pageCount?: number }> {
  switch (format) {
    case 'text':
      return { text: cleanExtractedText(asString(content)) };
    case 'markdown':
      return { text: cleanExtractedText(stripMarkdown(asString(content))) };
    case 'pdf': {
      // PDFs are stored base64-encoded in the Document.content column.
      const buffer = typeof content === 'string' ? Buffer.from(content, 'base64') : content;
      const parsed = await pdfParse(buffer);
      return { text: cleanExtractedText(parsed.text), pageCount: parsed.numpages };
    }
  }
}

function asString(content: Buffer | string): string {
  return typeof content === 'string' ? content : content.toString('utf-8');
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/`([^`]*)`/g, '$1') // inline code: keep the text
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1') // bold / italic
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images
    .replace(/^\s*[-*+]\s+/gm, '') // list markers
    .trim();
}

// PDF extraction leaves odd whitespace; clean it before it pollutes embeddings.
// Spaces and tabs are collapsed separately so paragraph breaks survive for the chunker.
export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
