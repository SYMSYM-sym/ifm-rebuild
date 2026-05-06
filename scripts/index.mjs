import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  readdirSync,
  appendFileSync,
  mkdirSync,
} from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { ROOT } from './paths.mjs';
import { generateArticleFromTopic } from './generate-article.mjs';
import { validateArticleFile } from './validate-article.mjs';
import { buildBlog } from './build-blog.mjs';
import {
  pickTopic,
  dequeueTopic,
  appendPublished,
  archiveCompletedFrontmatter,
  alreadyPublishedToday,
  laDateString,
} from './pick-topic.mjs';

const ARTICLES_DIR = join(ROOT, 'content/articles');
const FIXTURE_PATH = join(ROOT, 'scripts/fixtures/dry-run-sample.md');

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const skipMergePrep = process.argv.includes('--skip-merge-prep');
  return { dryRun, skipMergePrep };
}

function appendGithubEnv(pairs) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const path = process.env.GITHUB_ENV;
  if (!path) return;
  for (const [k, raw] of Object.entries(pairs)) {
    const v = String(raw ?? '').replace(/\n/g, '%0A');
    appendFileSync(path, `${k}=${v}\n`);
  }
}

function removePriorDryRunArtifacts() {
  if (!existsSync(ARTICLES_DIR)) return;
  for (const f of readdirSync(ARTICLES_DIR)) {
    if (f.endsWith('-dry-run-sample.md')) {
      try {
        unlinkSync(join(ARTICLES_DIR, f));
      } catch {
        /* ignore */
      }
    }
  }
}

async function runDryRunFixture() {
  removePriorDryRunArtifacts();
  mkdirSync(ARTICLES_DIR, { recursive: true });
  const iso = laDateString();
  const raw = readFileSync(FIXTURE_PATH, 'utf8');
  const { data, content } = matter(raw);
  data.date = iso;
  const stitched = matter.stringify(content.trim(), data);
  const dest = join(ARTICLES_DIR, `${iso}-dry-run-sample.md`);
  writeFileSync(dest, stitched, 'utf8');
  return dest;
}

async function main() {
  const { dryRun, skipMergePrep } = parseArgs();
  const forceSlug = (process.env.FORCE_SLUG || '').trim();

  if (process.env.GITHUB_ACTIONS === 'true' && !dryRun && !forceSlug && alreadyPublishedToday()) {
    console.log('Already published today (America/Los_Angeles). Skipping.');
    process.exit(0);
  }

  let picked;
  let articlePath;
  let frontmatter;

  if (dryRun) {
    console.log('Dry run: using fixture article (no API).');
    articlePath = await runDryRunFixture();
    const v = await validateArticleFile(articlePath, { skipSimilarity: true });
    for (const w of v.warnings) console.warn('WARN:', w);
    if (!v.ok) {
      for (const e of v.errors) console.error('ERR:', e);
      process.exit(1);
    }
    const parsed = matter(readFileSync(articlePath, 'utf8'));
    frontmatter = parsed.data;
  } else {
    picked = pickTopic({ forceSlug: forceSlug || undefined });
    if (!picked) {
      console.error('Topic queue is empty.');
      process.exit(1);
    }
    const { topic, index } = picked;
    console.log('Selected topic:', topic.slug);
    const gen = await generateArticleFromTopic(topic);
    articlePath = gen.filePath;
    frontmatter = gen.frontmatter;

    const v = await validateArticleFile(articlePath, { skipSimilarity: false });
    for (const w of v.warnings) console.warn('WARN:', w);
    if (!v.ok) {
      for (const e of v.errors) console.error('ERR:', e);
      process.exit(1);
    }

    if (!skipMergePrep) {
      dequeueTopic(index);
      appendPublished({
        slug: topic.slug,
        published_at: laDateString(),
        title: topic.title,
        target_keyword: topic.target_keyword,
      });
      const finalFm = matter(readFileSync(articlePath, 'utf8')).data;
      archiveCompletedFrontmatter(topic.slug, finalFm);
    }
  }

  await buildBlog();

  const wc = matter(readFileSync(articlePath, 'utf8')).content.split(/\s+/).filter(Boolean).length;
  appendGithubEnv({
    ARTICLE_TITLE: frontmatter.title || '',
    ARTICLE_SLUG: frontmatter.slug || '',
    ARTICLE_KEYWORD: frontmatter.target_keyword || '',
    ARTICLE_BUCKET: frontmatter.bucket || '',
    ARTICLE_WORDS: String(wc),
  });

  console.log('Done:', articlePath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
