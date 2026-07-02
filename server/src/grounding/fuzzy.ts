export interface Token {
  text: string;
  /** [start, end) offsets in the string that was tokenized */
  start: number;
  end: number;
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

/**
 * Token bigrams. Word *order* matters for a citation — a window containing
 * the same words scrambled must not score as a match — and bigrams capture
 * order where a bag of single tokens would not. Quotes of one or two tokens
 * fall back to unigrams (no bigrams exist).
 */
function grams(tokens: string[]): string[] {
  if (tokens.length < 3) return tokens;
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    out.push(tokens[i] + ' ' + tokens[i + 1]);
  }
  return out;
}

/** Sørensen–Dice over multisets: 2·|intersection| / (|a| + |b|). */
function diceSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const item of a) counts.set(item, (counts.get(item) ?? 0) + 1);
  let intersection = 0;
  for (const item of b) {
    const remaining = counts.get(item) ?? 0;
    if (remaining > 0) {
      counts.set(item, remaining - 1);
      intersection++;
    }
  }
  return (2 * intersection) / (a.length + b.length);
}

export interface FuzzyMatch {
  score: number;
  /** [start, end) span in the searched string */
  start: number;
  end: number;
}

/**
 * Slides a window of the quote's token count across the document and returns
 * the best-scoring span. Deterministic: on score ties the earliest window
 * wins. Both inputs are expected to be normalized text.
 */
export function findBestWindow(quote: string, doc: string): FuzzyMatch | null {
  const quoteTokens = tokenize(quote).map((t) => t.text);
  const docTokens = tokenize(doc);
  const windowSize = quoteTokens.length;
  if (windowSize === 0 || docTokens.length < windowSize) return null;

  const quoteGrams = grams(quoteTokens);
  let best: FuzzyMatch | null = null;
  for (let i = 0; i + windowSize <= docTokens.length; i++) {
    const windowTokens = docTokens.slice(i, i + windowSize).map((t) => t.text);
    const score = diceSimilarity(quoteGrams, grams(windowTokens));
    if (best === null || score > best.score) {
      const first = docTokens[i] as Token;
      const last = docTokens[i + windowSize - 1] as Token;
      best = { score, start: first.start, end: last.end };
    }
  }
  return best;
}
