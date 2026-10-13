// First layer of prompt-injection defence. Pattern matching is easy to evade,
// so this only flags and neutralises the obvious attempts; the system prompt,
// "answer from context only" rule and output monitoring are the other layers.

const DANGEROUS_PATTERNS = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /disregard (all )?(previous|prior|above)/i,
  /you are now/i,
  /pretend (you are|to be)/i,
  /system prompt:/i,
  /new instructions:/i,
];

export function detectPromptInjection(input: string): { isSuspicious: boolean; sanitized: string } {
  let sanitized = input;
  let isSuspicious = false;

  for (const pattern of DANGEROUS_PATTERNS) {
    // Test with a non-global regex: a shared /g regex keeps lastIndex between
    // calls and would silently miss matches on the next request.
    if (pattern.test(sanitized)) {
      isSuspicious = true;
      sanitized = sanitized.replace(new RegExp(pattern.source, 'gi'), '[FILTERED]');
    }
  }

  return { isSuspicious, sanitized };
}
