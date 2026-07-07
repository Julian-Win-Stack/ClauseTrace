import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { classifyError, withRetry } from '../src/lib/errors.js';

function zodError(): unknown {
  const { error } = z.string().safeParse(1);
  return error;
}

function withCode(code: string): Error {
  const err = new Error('socket hang up');
  (err as Error & { code: string }).code = code;
  return err;
}

describe('classifyError', () => {
  it.each([
    ['zod validation failure', zodError(), 'schema_invalid'],
    ['JSON syntax error', new SyntaxError('bad json'), 'schema_invalid'],
    ['401 auth error', { status: 401 }, 'fatal'],
    ['403 permission error', { status: 403 }, 'fatal'],
    ['404 API error', { status: 404 }, 'fatal'],
    ['429 rate limit', { status: 429 }, 'retryable'],
    ['500 server error', { status: 500 }, 'retryable'],
    ['connection reset', withCode('ECONNRESET'), 'retryable'],
    ['plain error', new Error('boom'), 'fatal'],
  ])('classifies a %s as %s', (_label, err, expected) => {
    expect(classifyError(err)).toBe(expected);
  });
});

describe('withRetry', () => {
  it('retries a retryable failure and returns the eventual success', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw { status: 429 };
        return 'ok';
      },
      { attempts: 3, baseDelayMs: 0 },
    );
    expect(result).toBe('ok');
  });

  it('fails fast on a non-retryable error without another attempt', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw { status: 401 };
        },
        { attempts: 3, baseDelayMs: 0 },
      ),
    ).rejects.toEqual({ status: 401 });
    expect(calls).toBe(1);
  });

  it('gives up after the configured attempts and rethrows the last error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw { status: 429 };
        },
        { attempts: 3, baseDelayMs: 0 },
      ),
    ).rejects.toEqual({ status: 429 });
    expect(calls).toBe(3);
  });
});
