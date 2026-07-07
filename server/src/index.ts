import './lib/env.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { logger } from './lib/logger.js';
import { analyzeRouter } from './routes/analyze.js';

const app = express();
// Railway puts one proxy in front of the app; trust it so req.ip (used by
// the analyze rate limiter) is the real client IP, not the proxy's.
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/analyze', analyzeRouter);

// In production the server serves the built client.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    } else {
      next();
    }
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('unhandled error', { message });
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  logger.info('server listening', { port });
});
// Node's default requestTimeout is 5m, which would abort a long analysis
// before the 20m app-level timeout can fire.
server.requestTimeout = 1_200_000;
