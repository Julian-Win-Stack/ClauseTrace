import { Router } from 'express';
import * as z from 'zod';
import { createAdhocApl, getApl } from '../db/queries.js';
import { classifyError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { runAnalysis } from '../pipeline/runAnalysis.js';

export const analyzeRouter = Router();

const bodySchema = z.union([
  z.object({ aplId: z.number().int().positive() }),
  z.object({
    text: z.string().trim().min(1).max(500_000),
    title: z.string().trim().max(300).optional(),
  }),
]);

analyzeRouter.post('/', async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: 'body must be { aplId } or { text, title? }' });
    return;
  }

  let aplId: number;
  if ('aplId' in parsed.data) {
    aplId = parsed.data.aplId;
    if (!(await getApl(aplId))) {
      res.status(404).json({ error: 'APL not found' });
      return;
    }
  } else {
    aplId = await createAdhocApl(
      parsed.data.text,
      parsed.data.title || 'Pasted document',
    );
  }

  try {
    const result = await runAnalysis(aplId);
    res.json({ aplId, ...result });
  } catch (err) {
    const kind = classifyError(err);
    const message = err instanceof Error ? err.message : String(err);
    logger.error('analysis failed', { aplId, kind, message });
    if (kind === 'fatal') {
      res.status(502).json({
        error: `Analysis failed (LLM auth/configuration): ${message}`,
      });
    } else if (kind === 'schema_invalid') {
      res.status(502).json({
        error:
          'Analysis failed: the model returned invalid output twice. Re-run the analysis.',
      });
    } else {
      res.status(503).json({
        error:
          'Analysis failed after retries (rate limit or network). Re-run the analysis.',
      });
    }
  }
});
