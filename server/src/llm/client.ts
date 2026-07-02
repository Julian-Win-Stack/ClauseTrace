import type { ZodType } from 'zod';

export interface StructuredCallOptions<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  /** Name reported to the provider's structured-output API. */
  schemaName: string;
  timeoutMs?: number;
}

/**
 * The only doorway to any LLM. Provider and model come from env
 * (LLM_PROVIDER, LLM_MODEL); no other module may import a provider SDK.
 */
export interface LLMClient {
  structuredCall<T>(options: StructuredCallOptions<T>): Promise<T>;
}
