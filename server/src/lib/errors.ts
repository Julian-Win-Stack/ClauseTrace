import { ZodError } from 'zod';

export type ErrorClass = 'retryable' | 'schema_invalid' | 'fatal';

/**
 * Classify before retrying — the strategy depends on the failure:
 *   retryable      → rate limit / 5xx / network; capped exponential backoff
 *   schema_invalid → model output failed validation; ONE repair re-prompt
 *   fatal          → auth/quota (401/403) and everything else; fail fast
 *
 * Detects provider API errors by duck-typing on `status` so the OpenAI SDK
 * stays imported only inside llm/.
 */
export function classifyError(err: unknown): ErrorClass {
  if (err instanceof ZodError || err instanceof SyntaxError) {
    return 'schema_invalid';
  }
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number') {
    if (status === 401 || status === 403) return 'fatal';
    if (status === 429 || status >= 500) return 'retryable';
    return 'fatal';
  }
  if (err instanceof Error) {
    const name = err.name.toLowerCase();
    const code = (err as { code?: unknown }).code;
    if (
      name.includes('timeout') ||
      name.includes('connection') ||
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT'
    ) {
      return 'retryable';
    }
  }
  return 'fatal';
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (classifyError(err) !== 'retryable' || attempt === attempts - 1) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * 2 ** attempt),
      );
    }
  }
  throw lastError;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
