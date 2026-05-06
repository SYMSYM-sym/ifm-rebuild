import { readFileSync, existsSync, readdirSync } from 'fs';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { ROOT } from './paths.mjs';
import { maxSimilarityToCorpus } from './embed-similarity.mjs';

const FORBIDDEN_PATH = join(ROOT, 'content/brand/forbidden.yaml');
const ARTICLES_DIR = join(ROOT, 'content/articles');

const LOCATION_ANCHORS = [
  'west hollywood',
  'weho',
  'larrabee',
  'sunset strip',
  'pacific design center',
  'the abbey',
  'beverly center',
  'cedars-sinai',
  'robertson',
  'santa monica boulevard',
  'beverly hills',
  'hollywood',
  'mid-city',
  'fairfax',
  'melrose',
  'beverly grove',
  'century city',
  'hancock park',
  'larchmont',
  'los angeles',
  'westside',
];

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitMainAndFaq(body) {
  const re = /^##\s+Frequently asked\s*$/im;
  const m = body.match(re);
  if (!m || m.index === undefined) return { main: body.trim(), faq: '' };
  const idx = m.index;
  return {
    main: body.slice(0, idx).trim(),
    faq: body.slice(idx).trim(),
  };
}

function countH2BeforeFaq(main) {
  const lines = main.split('\n');
  let n = 0;
  for (const line of lines) {
    if (/^##\s+/.test(line) && !/^##\s+Frequently asked\s*$/i.test(line)) n++;
  }
  return n;
}

function countBlockquotes(body) {
  const lines = body.split('\n');
  let inQuote = false;
  let blocks = 0;
  for (const line of lines) {
    if (/^>\s?/.test(line)) {
      if (!inQuote) {
        blocks++;
        inQuote = true;
      }
    } else if (line.trim() === '') {
      continue;
    } else {
      inQuote = false;
    }
  }
  return blocks;
}

function countInternalLinks(body) {
  const a = [...body.matchAll(/\]\(\/(?!\/)/g)].length;
  const b = [...body.matchAll(/\]\(https:\/\/igorformen\.com\//gi)].length;
  return a + b;
}

function countLocationMentions(text) {
  const lower = text.toLowerCase();
  let n = 0;
  for (const a of LOCATION_ANCHORS) {
    const needle = a.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(needle, idx)) !== -1) {
      n++;
      idx += needle.length;
    }
  }
  return n;
}

function faqQuestionCount(faqSection) {
  const lines = faqSection.split('\n').filter((l) => l.trim());
  let q = 0;
  for (const line of lines) {
    if (/^\*\*.+\*\*\s*$/.test(line.trim())) q++;
  }
  return q;
}

function loadForbidden() {
  const doc = yaml.load(readFileSync(FORBIDDEN_PATH, 'utf8'));
  return {
    phrases: (doc.phrases || []).map((s) => String(s).toLowerCase()),
    words: (doc.words || []).map((s) => String(s).toLowerCase()),
  };
}

function containsForbidden(text, fb) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const p of fb.phrases) if (lower.includes(p)) hits.push(`phrase:${p}`);
  for (const w of fb.words) {
    const re = new RegExp(`\\b${escapeWord(w)}\\b`, 'i');
    if (re.test(lower)) hits.push(`word:${w}`);
  }
  return hits;
}

function escapeWord(w) {
  return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function contactLeakChecks(body) {
  const errors = [];
  if (/mailto:/i.test(body)) errors.push('mailto: link not allowed');
  if (/tel:/i.test(body)) errors.push('tel: link not allowed');
  if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(body)) errors.push('Phone-like digit pattern detected');
  if (/\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b/.test(body)) errors.push('Phone-like digit pattern detected');
  if (/\b\+?1[-.\s]?\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(body)) errors.push('Phone-like digit pattern detected');
  const emailRe = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
  if (emailRe.test(body)) errors.push('Email-like pattern detected');
  return errors;
}

function markdownParseOk(body) {
  try {
    marked.parse(body);
    return true;
  } catch {
    return false;
  }
}

function countPriorArticles(currentSlug) {
  if (!existsSync(ARTICLES_DIR)) return 0;
  let n = 0;
  for (const f of readdirSync(ARTICLES_DIR)) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const raw = readFileSync(join(ARTICLES_DIR, f), 'utf8');
    const { data } = matter(raw);
    const slug = data.slug || '';
    if (slug && slug !== currentSlug) n++;
  }
  return n;
}

/**
 * @returns {Promise<{ ok: boolean, errors: string[], warnings: string[] }>}
 */
export async function validateArticleFile(mdPath, options = {}) {
  const errors = [];
  const warnings = [];
  if (!existsSync(mdPath)) {
    return { ok: false, errors: [`Missing file: ${mdPath}`], warnings };
  }

  const raw = readFileSync(mdPath, 'utf8');
  let data;
  let body;
  try {
    const parsed = matter(raw);
    data = parsed.data;
    body = parsed.content.trim();
  } catch (e) {
    return { ok: false, errors: [`Frontmatter parse error: ${e.message}`], warnings };
  }

  const req = ['title', 'slug', 'target_keyword', 'description', 'date', 'author', 'bucket', 'intent'];
  for (const k of req) {
    if (data[k] == null || data[k] === '') errors.push(`Missing frontmatter: ${k}`);
  }

  const { main, faq } = splitMainAndFaq(body);
  if (!faq || !/^##\s+Frequently asked/im.test(body)) errors.push('Missing "## Frequently asked" section');

  const wcMain = wordCount(main);
  if (wcMain < 850 || wcMain > 1500) errors.push(`Main body word count ${wcMain} (need 850–1500, excluding FAQ)`);

  const h2Main = countH2BeforeFaq(main);
  if (h2Main < 3 || h2Main > 5) errors.push(`H2 sections in main body: ${h2Main} (need 3–5)`);

  const quotes = countBlockquotes(body);
  if (quotes !== 1) errors.push(`Blockquote blocks: ${quotes} (need exactly 1)`);

  if (faq) {
    const qs = faqQuestionCount(faq);
    if (qs < 4) errors.push(`FAQ questions found: ${qs} (need ≥4 bold question lines)`);
  }

  const il = countInternalLinks(body);
  if (il < 2 || il > 4) errors.push(`Internal links: ${il} (need 2–4)`);

  const loc = countLocationMentions(body);
  if (loc < 3) errors.push(`Location mentions: ${loc} (need ≥3)`);

  const desc = String(data.description || '');
  if (desc.length < 70 || desc.length > 160) errors.push(`Meta description length ${desc.length} (need 70–160)`);

  const fb = loadForbidden();
  const bad = containsForbidden(body, fb);
  if (bad.length) errors.push(`Forbidden: ${bad.join(', ')}`);

  errors.push(...contactLeakChecks(body));

  if (!markdownParseOk(body)) errors.push('Markdown failed to parse');

  const skipEmbed = options.skipSimilarity === true;
  if (!skipEmbed && data.slug) {
    const priorCount = countPriorArticles(data.slug);
    if (priorCount > 0) {
      try {
        const sim = await maxSimilarityToCorpus(body, data.slug);
        if (sim > 0.85) errors.push(`Originality: max cosine similarity ${sim.toFixed(3)} exceeds 0.85`);
      } catch (e) {
        warnings.push(`Embedding check skipped/failed: ${e.message}`);
      }
    }
  }

  const kw = String(data.target_keyword || '').toLowerCase();
  const mainLower = main.toLowerCase();
  if (kw) {
    const occurrences = mainLower.split(kw).length - 1;
    const density = occurrences / Math.max(wcMain, 1);
    const pct = density * 100;
    if (pct < 0.5 || pct > 2.5) warnings.push(`Keyword density ${pct.toFixed(2)}% (soft band 0.5–2.5%)`);
  }
  const secs = data.secondary_keywords || [];
  const anySec = secs.some((s) => mainLower.includes(String(s).toLowerCase()));
  if (secs.length && !anySec) warnings.push('No secondary keyword detected in main body (soft check)');

  return { ok: errors.length === 0, errors, warnings };
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule && process.argv[2]) {
  validateArticleFile(process.argv[2], { skipSimilarity: process.env.SKIP_EMBED === '1' }).then((r) => {
    for (const w of r.warnings) console.warn('WARN:', w);
    if (!r.ok) {
      for (const e of r.errors) console.error('ERR:', e);
      process.exit(1);
    }
    console.log('OK');
    process.exit(0);
  });
}
