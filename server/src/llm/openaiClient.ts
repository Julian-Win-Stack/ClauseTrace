import OpenAI from 'openai';
import * as z from 'zod';
import type { LLMClient, StructuredCallOptions } from './client.js';

/** The only file in the codebase that imports a provider SDK. */
export class OpenAIClient implements LLMClient {
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.LLM_MODEL ?? 'gpt-5.5';
  }

  async structuredCall<T>(options: StructuredCallOptions<T>): Promise<T> {
    const response = await this.openai.responses.create(
      {
        model: this.model,
        input: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.user },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: options.schemaName,
            strict: true,
            schema: z.toJSONSchema(options.schema) as Record<string, unknown>,
          },
        },
      },
      { timeout: options.timeoutMs ?? 120_000 },
    );
    // Strict mode guarantees the shape; parsing again is a cheap backstop
    // and the seam where a schema-invalid response becomes a typed error.
    return options.schema.parse(JSON.parse(response.output_text));
  }
}

export function getLLMClient(): LLMClient {
  const provider = process.env.LLM_PROVIDER ?? 'openai';
  if (provider === 'openai') return new OpenAIClient();
  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}
