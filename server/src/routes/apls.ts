import { Router } from 'express';
import * as z from 'zod';
import {
  createAdhocApl,
  getAnalysis,
  getApl,
  listApls,
} from '../db/queries.js';

export const aplsRouter = Router();

aplsRouter.get('/', async (_req, res) => {
  res.json(await listApls());
});

aplsRouter.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const apl = await getApl(id);
  if (!apl) {
    res.status(404).json({ error: 'APL not found' });
    return;
  }
  const analysis = await getAnalysis(id);
  res.json({ apl, analysis });
});

const pasteSchema = z.object({
  text: z.string().trim().min(1).max(500_000),
  title: z.string().trim().max(300).optional(),
});

aplsRouter.post('/', async (req, res) => {
  const parsed = pasteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'body must be { text, title? }' });
    return;
  }
  const title = parsed.data.title || 'Pasted document';
  const id = await createAdhocApl(parsed.data.text, title);
  res.status(201).json({ id });
});
