import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import * as z from 'zod';
import { classifyError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { runAnalysis } from '../pipeline/runAnalysis.js';

export const analyzeRouter = Router();

// Each analysis burns real LLM tokens, so production rate-limits this
// endpoint: per-IP caps plus a site-wide daily budget. Counters are
// in-memory and reset on redeploy. Failed runs count too (they also cost).
// Per-IP limiters run first so a blocked IP can't drain the global budget.
const isProd = process.env.NODE_ENV === 'production';
const rateLimits = !isProd
  ? []
  : [
      rateLimit({
        windowMs: 30 * 60 * 1000,
        limit: 3,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error:
            'Rate limit reached: max 3 analyses per 30 minutes. Please wait and try again.',
        },
      }),
      rateLimit({
        windowMs: 24 * 60 * 60 * 1000,
        limit: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error:
            'Rate limit reached: max 10 analyses per day. Try again tomorrow.',
        },
      }),
      rateLimit({
        windowMs: 24 * 60 * 60 * 1000,
        limit: 20,
        keyGenerator: () => 'global',
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error:
            "The site's daily budget of 20 analyses is used up. Try again tomorrow.",
        },
      }),
    ];

const bodySchema = z.object({
  text: z.string().trim().min(1).max(500_000),
  title: z.string().trim().max(300).optional(),
});

analyzeRouter.post('/', ...rateLimits, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'body must be { text, title? }' });
    return;
  }

  const title = parsed.data.title || 'Pasted document';
  try {
    const result = await runAnalysis(title, parsed.data.text);
    res.json(result);
  } catch (err) {
    const kind = classifyError(err);
    const message = err instanceof Error ? err.message : String(err);
    logger.error('analysis failed', { title, kind, message });
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
