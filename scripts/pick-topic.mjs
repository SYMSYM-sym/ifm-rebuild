import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { ROOT } from './paths.mjs';

const QUEUE_PATH = join(ROOT, 'content/topics/queue.yaml');
const PUBLISHED_PATH = join(ROOT, 'content/topics/published.yaml');

export function laDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function loadPublished() {
  if (!existsSync(PUBLISHED_PATH)) return { entries: [] };
  const doc = yaml.load(readFileSync(PUBLISHED_PATH, 'utf8'));
  return doc && typeof doc === 'object' ? doc : { entries: [] };
}

export function loadQueue() {
  const raw = readFileSync(QUEUE_PATH, 'utf8');
  const doc = yaml.load(raw);
  if (Array.isArray(doc)) return doc;
  if (doc && Array.isArray(doc.topics)) return doc.topics;
  throw new Error('queue.yaml must be a YAML array of topics');
}

export function alreadyPublishedToday(published = loadPublished()) {
  const today = laDateString();
  const entries = published.entries || [];
  return entries.some((e) => e.published_at === today);
}

/**
 * @returns {{ topic: object, index: number } | null}
 */
export function pickTopic({ forceSlug } = {}) {
  const queue = loadQueue();
  if (!queue.length) return null;

  if (forceSlug) {
    const idx = queue.findIndex((t) => t.slug === forceSlug);
    if (idx === -1) throw new Error(`Topic slug not in queue: ${forceSlug}`);
    return { topic: queue[idx], index: idx };
  }

  return { topic: queue[0], index: 0 };
}

/** Remove topic at index and persist queue (comments at top of file are dropped on rewrite). */
export function dequeueTopic(index) {
  const queue = loadQueue();
  if (index < 0 || index >= queue.length) throw new Error('Invalid dequeue index');
  const removed = queue.splice(index, 1)[0];
  const header =
    '# Topic queue — editorial backlog (50 seeded). Remaining GAMEPLAN keywords: backfill in batches.\n' +
    '# TODO: backfill keywords 51–100 from GAMEPLAN.md Appendix A into this file after launch.\n\n';
  writeFileSync(QUEUE_PATH, header + yaml.dump(queue, { lineWidth: 100, noRefs: true, quotingType: '"' }));
  return removed;
}

export function appendPublished(entry) {
  const published = loadPublished();
  published.entries = published.entries || [];
  published.entries.push(entry);
  writeFileSync(
    PUBLISHED_PATH,
    yaml.dump(published, { lineWidth: 100, noRefs: true, quotingType: '"' }),
  );
}

export function archiveCompletedFrontmatter(slug, data) {
  const dir = join(ROOT, 'content/topics/completed');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${slug}.yaml`), yaml.dump(data, { lineWidth: 100, noRefs: true }));
}
