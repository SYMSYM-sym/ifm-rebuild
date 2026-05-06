import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root (parent of /scripts). */
export const ROOT = join(__dirname, '..');

export function contentPath(...segments) {
  return join(ROOT, 'content', ...segments);
}
