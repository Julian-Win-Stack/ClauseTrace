import { test, expect } from 'vitest';
import {
  assembleText,
  type ExtractedItem,
  type ExtractedPage,
} from './assembleAplText';

// A two-page APL fixture at the real font scales this format uses: 12pt body,
// 11pt footnote text, 7pt superscript markers. It carries one instance of each
// artifact the cleaner must handle: a reference block, an inline marker, a word
// hyphenated across the page break, a same-font running header on page 2,
// footnotes at each page bottom, and the letterhead footer. US-Letter is
// 612 x 792 points; yTop 700+ is the page-bottom footnote band.
const PAGE_HEIGHT = 792;

function item(
  text: string,
  x: number,
  yTop: number,
  fontSize: number,
  width = text.length * fontSize * 0.5,
): ExtractedItem {
  return { text, x, yTop, fontSize, width };
}

const FIXTURE: ExtractedPage[] = [
  {
    width: 612,
    height: PAGE_HEIGHT,
    items: [
      item('ALL PLAN LETTER 24-009', 350, 150, 12),
      item(
        'The purpose of this APL is to standardize benefit standardization.',
        90,
        300,
        12,
      ),
      item('4', 470, 296, 7), // superscript reference marker sitting in the body line
      item(
        'MCPs must cover services provided in both freestanding and hospital-',
        90,
        360,
        12,
      ),
      item(
        '4 See Attachment 1 of APL 21-015 for more information.',
        72,
        700,
        11,
      ),
      item('California Department of Health Care Services', 72, 740, 8),
      item('Gavin Newsom, Governor', 400, 760, 8),
    ],
  },
  {
    width: 612,
    height: PAGE_HEIGHT,
    items: [
      // Running header: same 12pt as body, so only position + pattern identify it.
      item('ALL PLAN LETTER 24-009', 72, 50, 12),
      item('Page 2', 72, 66, 12),
      item(
        'based facilities), consistent with the Provider Manual.',
        90,
        120,
        12,
      ),
      item('5 See the MCP boilerplate Contract.', 72, 700, 11),
    ],
  },
];

const result = assembleText(FIXTURE);

test('same-font running header is dropped so it never lands mid-body', () => {
  expect(result.text).not.toContain('Page 2');
});

test('inline footnote marker is stripped from the sentence it follows', () => {
  expect(result.text).toContain('benefit standardization.');
  expect(result.text).not.toMatch(/standardization\.\s*4/);
});

test('a word hyphenated across the page break is rejoined without a space', () => {
  expect(result.text).toContain('hospital-based facilities)');
});

test('footnotes are moved out of the body into an appended section, in order', () => {
  const footnoteHeading = result.text.indexOf('Footnotes');
  expect(footnoteHeading).toBeGreaterThan(0);
  expect(result.text.indexOf('hospital-based')).toBeLessThan(footnoteHeading);
  expect(result.text.indexOf('See Attachment')).toBeGreaterThan(
    footnoteHeading,
  );
  expect(result.text.indexOf('See Attachment')).toBeLessThan(
    result.text.indexOf('See the MCP'),
  );
});

test('letterhead footer is dropped from the output', () => {
  expect(result.text).not.toContain('Gavin Newsom');
  expect(result.text).not.toContain(
    'California Department of Health Care Services',
  );
});

test('APL number is parsed from the reference line', () => {
  expect(result.aplNumber).toBe('24-009');
});

test('scanned PDF with no text layer yields empty text for the caller to reject', () => {
  expect(
    assembleText([{ width: 612, height: PAGE_HEIGHT, items: [] }]).text,
  ).toBe('');
});

// Regression: the letterhead footer's two columns (e.g. "California Department
// of Health Care Services" | "State of California") share a yTop and merge into
// one line, which an exact-line match missed and leaked into a footnote.
test('a footer line with two merged letterhead cells is still dropped', () => {
  const out = assembleText([
    {
      width: 612,
      height: PAGE_HEIGHT,
      items: [
        item(
          'The MCP must cover all Medically Necessary services.',
          90,
          300,
          12,
        ),
        item('California Department of Health Care Services', 72, 745, 8),
        item('State of California', 430, 745, 8),
      ],
    },
  ]).text;
  expect(out).toContain('The MCP must cover all Medically Necessary services.');
  expect(out).not.toContain('California Department');
  expect(out).not.toContain('State of California');
});
