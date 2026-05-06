import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import Anthropic from '@anthropic-ai/sdk';
import { ROOT } from './paths.mjs';
import { laDateString } from './pick-topic.mjs';

const VOICE_PATH = join(ROOT, 'content/brand/voice.md');
const FORBIDDEN_PATH = join(ROOT, 'content/brand/forbidden.yaml');
const INTERNAL_PATH = join(ROOT, 'content/brand/internal-links.yaml');
const ARTICLES_DIR = join(ROOT, 'content/articles');

function loadBrandFiles() {
  const voice = readFileSync(VOICE_PATH, 'utf8');
  const forbiddenDoc = yaml.load(readFileSync(FORBIDDEN_PATH, 'utf8'));
  const phrases = (forbiddenDoc.phrases || []).map((p) => `- ${p}`).join('\n');
  const words = (forbiddenDoc.words || []).map((w) => `- ${w}`).join('\n');
  const forbiddenBullets = `${phrases}\n${words}`;
  const internal = yaml.load(readFileSync(INTERNAL_PATH, 'utf8'));
  let table = '| Anchor idea | Path |\n|---|---|\n';
  for (const [key, def] of Object.entries(internal.services || {})) {
    const v = (def.variants || []).join('; ');
    table += `| ${key}: ${v} | ${def.href} |\n`;
  }
  for (const [key, def] of Object.entries(internal.pages || {})) {
    const v = (def.variants || []).join('; ');
    table += `| ${key}: ${v} | ${def.href} |\n`;
  }
  return { voice, forbiddenBullets, internalTable: table };
}

function listArticleMarkdowns() {
  if (!existsSync(ARTICLES_DIR)) return [];
  return readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => join(ARTICLES_DIR, f));
}

/** Recent articles: title + first ~400 chars of body for originality prompts. */
function recentArticleSummaries(limit = 5) {
  const files = listArticleMarkdowns();
  const parsed = files.map((filePath) => {
    const raw = readFileSync(filePath, 'utf8');
    const { data, content } = matter(raw);
    return {
      date: data.date || '',
      title: data.title || '',
      excerpt: content.replace(/^\s+/, '').slice(0, 450),
    };
  });
  parsed.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return parsed.slice(0, limit);
}

function buildSystemPrompt(topic, isoDate) {
  const { voice, forbiddenBullets, internalTable } = loadBrandFiles();
  const recent = recentArticleSummaries(5);
  const recentBlock = recent.length
    ? recent.map((r) => `- ${r.title}: ${r.excerpt.replace(/\s+/g, ' ')}`).join('\n')
    : '(none yet — first article in repo)';

  const secKw = yaml.dump(topic.secondary_keywords || [], { lineWidth: 120 });

  return `You write articles for Igor For Men (IFM), a private male grooming salon in West Hollywood. Your output is published verbatim. You follow the brand voice exactly.

# Brand voice (authoritative)
${voice}

# Forbidden phrases and words (case-insensitive)
${forbiddenBullets}

# Internal link map
The article MUST include at least 2 internal links chosen from this map. Use ONE anchor variant per service/page; do not reuse the same anchor twice in the article. Always link to the absolute path. Do not invent paths.
${internalTable}

# Location anchors (use 3+ in the article, naturally)
West Hollywood, WeHo, Larrabee Street, Sunset Strip, Pacific Design Center, The Abbey, Beverly Center, Cedars-Sinai, Robertson Boulevard, Santa Monica Boulevard, Beverly Hills, Hollywood, Mid-City, Sunset Strip, Fairfax, Melrose, Beverly Grove

# Recent articles (avoid repeating angles, examples, or quotes)
${recentBlock}

# Output rules
- Word count: 1000–1400 in the main body sections (everything between the first paragraph and the FAQ — DO NOT include the FAQ in your word count target).
- One H1 (the article title — exactly the title field below).
- 3–5 H2 sections. H3 sparingly.
- Open with a 40–60 word "answer paragraph" that directly answers the article's keyword query. No preamble.
- Include exactly ONE blockquote. Voice it as Rene' (the practitioner with 21+ years of experience). No first person plural in the quote.
- Include exactly ONE FAQ section at the end with 4 Q&As. Each Q must be a real long-tail query a man might type.
- Internal links: minimum 2, maximum 4.
- Location mentions: minimum 3 (neighborhood, cross street, or landmark).
- No emojis. No exclamation points except in the FAQ if a real question contains one.
- No superlatives without evidence ("best", "most", "ultimate").
- No medical claims.
- No prices unless they appear in the brand reference data below.

# Brand reference data — these are the only prices/facts you may cite
- Address: 801 Larrabee St, Suite 5, West Hollywood, CA 90069
- Hours: Tue–Sat, 8 AM – 6 PM
- Practitioner: Rene', 21+ years experience
- Service prices (start at): Male Brazilian $145+, Back End $105+, Back $145+, Chest & Abdomen $145+, Arms $145+, Legs $195+, Eyebrows $65+, Full-Body Trimming $150/hr
- We do not publish a phone number on the site (visitors tap a CTA). Do not write a phone number.
- We do not have an email on the site. Do not write an email.
- Salon is by appointment only.

# Output format — STRICT
Return a single fenced markdown block. No prose before or after. Frontmatter is YAML. Body is Markdown. Do not include the H1 heading inside the body — it is rendered from the title field.

\`\`\`markdown
---
title: "${topic.title.replace(/"/g, '\\"')}"
slug: "${topic.slug}"
target_keyword: "${topic.target_keyword.replace(/"/g, '\\"')}"
secondary_keywords: ${secKw.trimEnd()}
description: "<150 character meta description, no quotes around it>"
date: "${isoDate}"
author: "ifm-team"
bucket: "${topic.bucket}"
intent: "${topic.intent}"
reading_time_minutes: <integer>
self_check:
  word_count: <integer>
  h2_count: <integer>
  internal_links: <integer>
  location_mentions: <integer>
  has_blockquote: <boolean>
  has_faq_block: <boolean>
---

<answer paragraph, 40–60 words, no header>

## <H2 #1>
<body>

## <H2 #2>
<body>

> "<Rene' quote, 1–3 sentences>"
> — Rene', practitioner

## <H2 #3>
<body>

## Frequently asked

**<Q1>**
<A1, 1–3 sentences>

**<Q2>**
<A2, 1–3 sentences>

**<Q3>**
<A3, 1–3 sentences>

**<Q4>**
<A4, 1–3 sentences>
\`\`\`

Now write the article for:
TITLE: ${topic.title}
TARGET KEYWORD: ${topic.target_keyword}
SECONDARY KEYWORDS: ${(topic.secondary_keywords || []).join(', ')}
INTENT: ${topic.intent}
BUCKET: ${topic.bucket}
NOTES: ${topic.notes || ''}`;
}

function extractFencedMarkdown(text) {
  const m = text.match(/```markdown\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  const m2 = text.match(/```md\s*([\s\S]*?)```/);
  if (m2) return m2[1].trim();
  throw new Error('Claude response missing fenced markdown block');
}

/**
 * @returns {{ filePath: string, frontmatter: object }}
 */
export async function generateArticleFromTopic(topic) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const isoDate = laDateString();
  const system = buildSystemPrompt(topic, isoDate);
  const client = new Anthropic({ apiKey });

  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    temperature: 0.7,
    system,
    messages: [{ role: 'user', content: 'Write the article now. Output the markdown block only.' }],
  });

  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const md = extractFencedMarkdown(text);
  const { data, content } = matter(md);
  if (!data.slug) data.slug = topic.slug;
  const body = content.trim();
  const stitched = matter.stringify(body, data);
  const fileName = `${isoDate}-${data.slug}.md`;
  const filePath = join(ARTICLES_DIR, fileName);
  writeFileSync(filePath, stitched, 'utf8');
  return { filePath, frontmatter: data };
}
