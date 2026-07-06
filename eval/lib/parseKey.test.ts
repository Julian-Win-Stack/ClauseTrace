import { describe, expect, it } from 'vitest';
import { parseCsv, parseKey } from './parseKey.js';

describe('parseCsv', () => {
  it.each([
    {
      name: 'keeps commas inside a quoted field',
      input: 'id,quote\n1,"Plans must, within 10 days, notify DHCS."',
      expected: [
        ['id', 'quote'],
        ['1', 'Plans must, within 10 days, notify DHCS.'],
      ],
    },
    {
      name: 'unescapes doubled quotes',
      input: 'id,quote\n1,"She said ""go"" now"',
      expected: [
        ['id', 'quote'],
        ['1', 'She said "go" now'],
      ],
    },
    {
      name: 'keeps newlines inside a quoted field',
      input: 'id,quote\n1,"line one\nline two"',
      expected: [
        ['id', 'quote'],
        ['1', 'line one\nline two'],
      ],
    },
    {
      name: 'handles CRLF endings without a trailing empty row',
      input: 'id,quote\r\n1,a\r\n',
      expected: [
        ['id', 'quote'],
        ['1', 'a'],
      ],
    },
    {
      name: 'skips a leading UTF-8 BOM',
      input: '﻿id,quote\n1,a',
      expected: [
        ['id', 'quote'],
        ['1', 'a'],
      ],
    },
  ])('$name', ({ input, expected }) => {
    expect(parseCsv(input)).toEqual(expected);
  });
});

describe('parseKey', () => {
  it('reads id and quote columns regardless of order', () => {
    const { items, errors } = parseKey('quote,id\n"do X",7');
    expect(errors).toEqual([]);
    expect(items).toEqual([{ id: '7', quote: 'do X' }]);
  });

  it('errors when a required column is missing', () => {
    const { items, errors } = parseKey('id,text\n1,x');
    expect(items).toHaveLength(0);
    expect(errors[0]).toContain('id" and "quote"');
  });

  it('flags a duplicate id and keeps the first occurrence', () => {
    const { items, errors } = parseKey('id,quote\n1,a\n1,b');
    expect(items).toEqual([{ id: '1', quote: 'a' }]);
    expect(errors.some((e) => e.includes('duplicate id "1"'))).toBe(true);
  });

  it('flags an empty quote and skips fully-blank rows', () => {
    const { items, errors } = parseKey('id,quote\n1,\n\n2,ok');
    expect(items).toEqual([{ id: '2', quote: 'ok' }]);
    expect(errors.some((e) => e.includes('empty quote'))).toBe(true);
  });
});
