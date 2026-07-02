import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Loads the repo-root .env regardless of cwd (npm workspace scripts run with
// cwd=server/). Resolves from this file: server/{src|dist}/lib -> repo root.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env'), quiet: true });
