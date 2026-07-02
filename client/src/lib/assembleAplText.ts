// Pure text-assembly for DHCS All Plan Letter PDFs. Given the positioned text
// runs pdfjs extracts from each page, this reconstructs clean body prose: it
// drops the repeating page header and letterhead footer, strips inline footnote
// reference markers, separates footnotes to an appended section, and rejoins
// words/lines split by wrapping. No pdfjs, no I/O — deterministic and
// unit-tested, so cleaning behavior can be verified without rendering a PDF.
//
// Classification works on assembled LINES, not raw runs, because the artifacts
// only exist once runs are joined: DHCS shatters the page header into fragments
// ("A", "LL P", "LA", "N", ...) that match no pattern individually, and body vs
// footnote is separable by font size only per line (body is 12pt, footnote text
// 11pt, reference markers 7pt in these letters).

/** One positioned text run from a page. Coordinates are PDF points. */
export interface ExtractedItem {
  text: string;
  x: number; // left edge
  width: number; // advance width, so x + width is the right edge
  yTop: number; // distance from the top of the page (larger = lower)
  fontSize: number;
}

export interface ExtractedPage {
  width: number;
  height: number;
  items: ExtractedItem[];
}

type Tag = 'header' | 'footnote' | 'letterhead' | 'body';

interface RawLine {
  items: ExtractedItem[]; // sorted left-to-right
  yTop: number;
  maxSize: number;
  yRatio: number;
  page: number;
}

interface Line {
  text: string;
  yTop: number;
  height: number;
  page: number;
  listItem: boolean;
}

// A line is a footnote when its largest font is at least this much smaller than
// the dominant body size (body 12pt vs footnote 11pt in these letters).
const FOOTNOTE_SIZE_GAP = 0.5;
// A run is a superscript reference marker when this much smaller than body.
const MARKER_SIZE_GAP = 2.5;
// The running header sits within this fraction of page height from the top.
const HEADER_MAX_Y_RATIO = 0.14;
// A vertical gap larger than this multiple of the line height starts a new paragraph.
const PARA_GAP_RATIO = 1.7;

const LIST_ITEM = /^(\d{1,2}\.|[IVX]{1,4}\.|\([a-z]\))\s/;
const MARKER = /^[\d,]+$/;

// Fixed DHCS letterhead tokens, matched space-insensitively as substrings
// because the logo/footer is often fragmented and its two columns can merge
// into one line. Each token is distinctive enough that it never occurs in APL
// body prose or footnote URLs (e.g. body says "the Department of Health Care
// Services", never "California Department of Health Care Services").
const LETTERHEAD_TOKENS = [
  'californiadepartmentofhealthcareservices',
  'stateofcalifornia',
  'californiahealthandhumanservicesagency',
  'gavinnewsom',
  'capitolavenue',
  '997413',
  '95899-7413',
  'qualityandmonitoringdivision',
  'ms4410',
  'baass',
];

function despace(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '');
}

function isLetterhead(despaced: string): boolean {
  return LETTERHEAD_TOKENS.some((token) => despaced.includes(token));
}

function isRunningHeader(despaced: string): boolean {
  return despaced.startsWith('allplanletter') || /^page\d+/.test(despaced);
}

function isListItem(text: string): boolean {
  return LIST_ITEM.test(text.trimStart());
}

/** Body font size = the run size carrying the most characters across the doc. */
function dominantFontSize(pages: ExtractedPage[]): number {
  const charsBySize = new Map<number, number>();
  for (const page of pages) {
    for (const item of page.items) {
      const len = item.text.trim().length;
      if (len === 0) continue;
      const size = Math.round(item.fontSize * 2) / 2;
      charsBySize.set(size, (charsBySize.get(size) ?? 0) + len);
    }
  }
  let best = 12;
  let bestChars = -1;
  for (const [size, chars] of charsBySize) {
    if (chars > bestChars) {
      bestChars = chars;
      best = size;
    }
  }
  return best;
}

/** Group a page's runs into visual lines by vertical position. */
function groupRawLines(page: ExtractedPage, bodySize: number): RawLine[] {
  const items = page.items
    .filter((it) => it.text.trim().length > 0)
    .sort((a, b) => a.yTop - b.yTop || a.x - b.x);

  const lines: RawLine[] = [];
  let bucket: ExtractedItem[] = [];
  let bucketY = 0;

  const flush = (): void => {
    if (bucket.length === 0) return;
    const sorted = [...bucket].sort((a, b) => a.x - b.x);
    const yTop = Math.min(...sorted.map((it) => it.yTop));
    lines.push({
      items: sorted,
      yTop,
      maxSize: Math.max(...sorted.map((it) => it.fontSize)),
      yRatio: yTop / page.height,
      page: 0, // set by caller
    });
    bucket = [];
  };

  for (const item of items) {
    // A raised superscript shares a line with body text a few points below it,
    // so the tolerance is scaled to the body size, not the tiny marker size.
    const tolerance = Math.max(item.fontSize, bodySize) * 0.5;
    if (bucket.length > 0 && Math.abs(item.yTop - bucketY) > tolerance) flush();
    if (bucket.length === 0) bucketY = item.yTop;
    bucket.push(item);
  }
  flush();
  return lines;
}

/** Join a line's runs into text, reconstructing spacing from horizontal gaps. */
function renderLine(
  items: ExtractedItem[],
  stripMarkers: boolean,
  bodySize: number,
): string {
  let text = '';
  let prevRightEdge = -Infinity;

  for (const item of items) {
    if (
      stripMarkers &&
      item.fontSize < bodySize - MARKER_SIZE_GAP &&
      MARKER.test(item.text.trim())
    ) {
      continue; // superscript footnote reference marker
    }
    const gap = item.x - prevRightEdge;
    // Runs abut with no gap when a word was split into runs (e.g. "Medi-Cal");
    // only insert a space when there is a real horizontal gap between them.
    if (text.length > 0 && gap > item.fontSize * 0.25) text += ' ';
    text += item.text;
    prevRightEdge = item.x + item.width;
  }
  return text.replace(/\s+/g, ' ').trim();
}

function classify(raw: RawLine, pageIndex: number, bodySize: number): Tag {
  const despaced = despace(renderLine(raw.items, false, bodySize));
  if (isLetterhead(despaced)) return 'letterhead';
  // Only pages after the first carry the running header; page 1's reference
  // block ("ALL PLAN LETTER 24-009") is real content and must be kept.
  if (
    pageIndex > 0 &&
    raw.yRatio < HEADER_MAX_Y_RATIO &&
    isRunningHeader(despaced)
  ) {
    return 'header';
  }
  if (raw.maxSize < bodySize - FOOTNOTE_SIZE_GAP) return 'footnote';
  return 'body';
}

/** Join a wrapped line onto the paragraph, keeping hyphenated compounds intact. */
function joinWrapped(paragraph: string, next: string): string {
  if (paragraph.endsWith('-')) return paragraph + next;
  return paragraph + ' ' + next;
}

function startsNewParagraph(prev: Line, line: Line): boolean {
  if (line.listItem) return true;
  if (line.page !== prev.page) {
    // Across a page break there is no measurable gap. Only start a paragraph
    // when the previous line clearly ended a sentence and this one begins
    // fresh — otherwise a sentence (or word) split across pages stays joined.
    const endsSentence = /[.:;?!]$/.test(prev.text.trimEnd());
    const startsFresh = /^[A-Z(•]/.test(line.text.trimStart());
    return endsSentence && startsFresh;
  }
  return line.yTop - prev.yTop > prev.height * PARA_GAP_RATIO;
}

function assembleParagraphs(lines: Line[]): string {
  const paragraphs: string[] = [];
  let current = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as Line;
    const prev = i > 0 ? (lines[i - 1] as Line) : null;
    if (prev === null || startsNewParagraph(prev, line)) {
      if (current.length > 0) paragraphs.push(current);
      current = line.text;
    } else {
      current = joinWrapped(current, line.text);
    }
  }
  if (current.length > 0) paragraphs.push(current);
  return paragraphs.join('\n\n');
}

/** Concatenate footnote lines (ordered by page then position) into one
 * paragraph per footnote, split on each leading footnote number. */
function assembleFootnotes(lines: Line[]): string {
  const notes: string[] = [];
  let current = '';
  for (const line of lines) {
    if (/^\d+\s+\S/.test(line.text)) {
      if (current.length > 0) notes.push(current);
      current = line.text;
    } else if (current.length > 0) {
      current = joinWrapped(current, line.text);
    }
  }
  if (current.length > 0) notes.push(current);
  return notes.join('\n');
}

export interface AssembledText {
  text: string;
  aplNumber: string | null;
}

export function assembleText(pages: ExtractedPage[]): AssembledText {
  const bodySize = dominantFontSize(pages);
  const bodyLines: Line[] = [];
  const footnoteLines: Line[] = [];

  pages.forEach((page, pageIndex) => {
    for (const raw of groupRawLines(page, bodySize)) {
      const tag = classify(raw, pageIndex, bodySize);
      if (tag === 'header' || tag === 'letterhead') continue;

      if (tag === 'footnote') {
        const text = renderLine(raw.items, false, bodySize);
        // Skip a lone reference marker that ended up on its own line.
        if (text.length === 0 || /^[\d,.\s]+$/.test(text)) continue;
        footnoteLines.push({
          text,
          yTop: raw.yTop,
          height: raw.maxSize,
          page: pageIndex,
          listItem: false,
        });
      } else {
        const text = renderLine(raw.items, true, bodySize);
        if (text.length === 0) continue;
        bodyLines.push({
          text,
          yTop: raw.yTop,
          height: raw.maxSize,
          page: pageIndex,
          listItem: isListItem(text),
        });
      }
    }
  });

  let text = assembleParagraphs(bodyLines);
  const footnotes = assembleFootnotes(footnoteLines);
  if (footnotes.length > 0) {
    text += '\n\n———\nFootnotes\n\n' + footnotes;
  }
  text = text.trim();

  const match = /all plan letter\s+(\d\d-\d{3})/i.exec(text);
  return { text, aplNumber: match?.[1] ?? null };
}
