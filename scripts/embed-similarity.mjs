import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { ROOT } from './paths.mjs';

const CACHE_PATH = join(ROOT, 'content/articles/_embeddings.json');
const ARTICLES_DIR = join(ROOT, 'content/articles');

let pipePromise;

async function getPipe() {
  if (!pipePromise) {
    const { pipeline } = await import('@xenova/transformers');
    pipePromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return pipePromise;
}

function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function saveEmbeddingCache(cache) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8');
}

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

async function embedText(text) {
  const pipe = await getPipe();
  const out = await pipe(String(text).slice(0, 8000), { pooling: 'mean', normalize: true });
  if (out?.data != null) return Array.from(out.data);
  if (ArrayBuffer.isView(out)) return Array.from(out);
  return Array.from(out);
}

function articleFiles() {
  if (!existsSync(ARTICLES_DIR)) return [];
  return readdirSync(ARTICLES_DIR).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
}

/**
 * Max cosine similarity vs other articles (by slug). Updates cache for current slug.
 * @returns {Promise<number>} 0 if no prior articles to compare.
 */
export async function maxSimilarityToCorpus(bodyText, currentSlug) {
  const others = [];
  for (const file of articleFiles()) {
    const raw = readFileSync(join(ARTICLES_DIR, file), 'utf8');
    const { data, content } = matter(raw);
    const slug = data.slug || file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
    if (slug === currentSlug) continue;
    others.push({ slug, body: content });
  }
  if (others.length === 0) return 0;

  const cache = loadCache();
  let vecNew = cache[currentSlug];
  if (!vecNew) {
    vecNew = await embedText(bodyText);
    cache[currentSlug] = vecNew;
  }

  let max = 0;
  for (const o of others) {
    let vec = cache[o.slug];
    if (!vec) {
      vec = await embedText(o.body);
      cache[o.slug] = vec;
    }
    const sim = dot(vecNew, vec);
    if (sim > max) max = sim;
  }
  saveEmbeddingCache(cache);
  return max;
}
