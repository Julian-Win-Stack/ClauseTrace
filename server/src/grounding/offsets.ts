export interface NormalizedText {
  normalized: string;
  /** map[i] = index in the raw text of the char that produced normalized[i] */
  map: number[];
}

// Typographic variants that PDFs and word processors commonly substitute.
const CHAR_MAP: Record<string, string> = {
  '‘': "'", // ‘
  '’': "'", // ’
  '‚': "'", // ‚
  '′': "'", // ′
  '“': '"', // “
  '”': '"', // ”
  '„': '"', // „
  '″': '"', // ″
  '‒': '-', // ‒
  '–': '-', // –
  '—': '-', // —
  '−': '-', // −
  ' ': ' ', // non-breaking space
};

/**
 * Lowercases, maps typographic quote/dash variants to ASCII, and collapses
 * whitespace runs to a single space, while recording for every normalized
 * character the raw index it came from — so a match found in normalized
 * space can be mapped back to raw offsets.
 */
export function buildNormalized(raw: string): NormalizedText {
  const chars: string[] = [];
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < raw.length; i++) {
    let ch = raw[i] as string;
    ch = CHAR_MAP[ch] ?? ch;
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      chars.push(' ');
      map.push(i);
      lastWasSpace = true;
    } else {
      const lower = ch.toLowerCase();
      // A few Unicode chars lowercase to multiple chars; keep the mapping 1:1.
      chars.push(lower.length === 1 ? lower : ch);
      map.push(i);
      lastWasSpace = false;
    }
  }
  return { normalized: chars.join(''), map };
}

/**
 * Maps a [start, end) span in normalized space back to raw-text offsets.
 * The raw span can be longer than the normalized one (collapsed whitespace),
 * which is why callers treat these offsets as approximate for non-exact
 * matches.
 */
export function mapSpanToRaw(
  norm: NormalizedText,
  normStart: number,
  normEnd: number,
): { start: number; end: number } {
  const startRaw = norm.map[normStart];
  const lastRaw = norm.map[normEnd - 1];
  if (startRaw === undefined || lastRaw === undefined) {
    throw new RangeError(
      `normalized span [${normStart}, ${normEnd}) is out of bounds`,
    );
  }
  return { start: startRaw, end: lastRaw + 1 };
}
