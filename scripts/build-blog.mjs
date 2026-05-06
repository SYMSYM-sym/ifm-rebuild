import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import matter from 'gray-matter';
import { marked } from 'marked';
import { render, loadPartial } from './render-templates.mjs';
import { ROOT } from './paths.mjs';

const ARTICLES_DIR = join(ROOT, 'content/articles');
const BLOG_DIR = join(ROOT, 'blog');
const TEMPLATES = join(ROOT, 'templates');
const SITE = 'https://igorformen.com';

marked.use({
  mangle: false,
  headerIds: true,
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitMainAndFaq(body) {
  const re = /^##\s+Frequently asked\s*$/im;
  const m = body.match(re);
  if (!m || m.index === undefined) return { main: body.trim(), faq: '' };
  const idx = m.index;
  return { main: body.slice(0, idx).trim(), faq: body.slice(idx).trim() };
}

function faqMarkdownToAccordion(faqMd) {
  const lines = faqMd.split('\n');
  let i = 0;
  while (i < lines.length && !/^##\s+Frequently asked/i.test(lines[i])) i++;
  if (i < lines.length) i++;
  const blocks = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (/^\*\*.+\*\*$/.test(line)) {
      const q = line.replace(/^\*\*|\*\*$/g, '');
      i++;
      const ans = [];
      while (i < lines.length && !/^\*\*.+\*\*$/.test(lines[i].trim())) {
        if (lines[i].trim()) ans.push(lines[i].trim());
        i++;
      }
      blocks.push({ q, a: ans.join(' ') });
    } else i++;
  }
  let html = '<div class="article-faq section"><div class="container"><p class="eyebrow">FAQ</p><h2 class="h2 article-faq__title">Frequently asked</h2><div class="faq">';
  for (const { q, a } of blocks) {
    const bodyHtml = marked.parse(a || '');
    html += `<details class="faq__item"><summary><span>${escapeHtml(q)}</span><span class="faq__icon" aria-hidden="true"></span></summary><div class="faq__body">${bodyHtml}</div></details>`;
  }
  html += '</div></div></div>';
  return { html, blocks };
}

function parseArticles() {
  if (!existsSync(ARTICLES_DIR)) return [];
  const out = [];
  for (const f of readdirSync(ARTICLES_DIR)) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const raw = readFileSync(join(ARTICLES_DIR, f), 'utf8');
    const { data, content } = matter(raw);
    const slug = data.slug;
    if (!slug) continue;
    const { main, faq } = splitMainAndFaq(content.trim());
    out.push({
      file: f,
      slug,
      data,
      mainMd: main,
      faqMd: faq,
      rawBody: content.trim(),
    });
  }
  out.sort((a, b) => String(b.data.date || '').localeCompare(String(a.data.date || '')));
  return out;
}

function excerpt(md, max = 220) {
  const text = md.replace(/^#+\s.*/gm, '').replace(/\[(.*?)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function relatedArticles(all, current) {
  const scores = all
    .filter((a) => a.slug !== current.slug)
    .map((a) => {
      let s = 0;
      if (a.data.bucket === current.data.bucket) s += 3;
      const sec = current.data.secondary_keywords || [];
      const body = `${a.mainMd} ${a.data.target_keyword || ''}`.toLowerCase();
      for (const k of sec) {
        if (body.includes(String(k).toLowerCase())) s += 2;
      }
      return { a, s };
    });
  scores.sort((x, y) => y.s - x.s);
  return scores.slice(0, 3).map((x) => x.a);
}

function articleJsonLd(article, faqBlocks, url) {
  const d = article.data;
  const pub = d.date ? `${d.date}T12:00:00-08:00` : undefined;
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: d.title,
    datePublished: pub,
    dateModified: pub,
    author: { '@type': 'Organization', name: 'The IFM Team' },
    publisher: {
      '@type': 'Organization',
      name: 'Igor For Men',
      url: SITE,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: d.bucket || undefined,
    description: d.description,
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Journal', item: `${SITE}/blog/` },
      { '@type': 'ListItem', position: 3, name: d.title, item: url },
    ],
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqBlocks.map((b) => ({
      '@type': 'Question',
      name: b.q,
      acceptedAnswer: { '@type': 'Answer', text: b.a },
    })),
  };
  return [articleLd, breadcrumb, faqLd];
}

function buildRelatedHtml(related) {
  if (!related.length) return '';
  let h =
    '<section class="section section--dark continue-reading"><div class="container"><p class="eyebrow">Continue reading</p><h2 class="h2">More from the <span class="accent">Journal</span></h2><div class="continue-reading__grid">';
  for (const a of related) {
    const url = `/blog/${a.slug}`;
    h += `<article class="continue-reading__card"><a href="${url}"><h3 class="h3">${escapeHtml(a.data.title)}</h3><p class="muted">${escapeHtml(excerpt(a.mainMd, 140))}</p></a></article>`;
  }
  h += '</div></div></section>';
  return h;
}

async function renderArticlePage(article, all, partials) {
  const { mainMd, faqMd, data, slug } = article;
  const mainHtml = marked.parse(mainMd);
  const { html: faqHtml, blocks: faqBlocks } = faqMarkdownToAccordion(faqMd || '');
  const related = relatedArticles(all, article);
  const relatedHtml = buildRelatedHtml(related);
  const url = `${SITE}/blog/${slug}`;
  const canonical = `/blog/${slug}`;
  const reading = data.reading_time_minutes || Math.max(4, Math.round(mainMd.split(/\s+/).length / 200));
  const ogImage = `${SITE}/og.jpg`;

  const jsonLd = articleJsonLd(article, faqBlocks, url);

  const extraHead = `
<link rel="canonical" href="${url}" />
<meta property="og:title" content="${escapeHtml(data.title)} — Igor For Men" />
<meta property="og:description" content="${escapeHtml(data.description)}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${ogImage}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(data.title)}" />
<meta name="twitter:description" content="${escapeHtml(data.description)}" />
<script type="application/ld+json">${JSON.stringify(jsonLd[0])}</script>
<script type="application/ld+json">${JSON.stringify(jsonLd[1])}</script>
<script type="application/ld+json">${JSON.stringify(jsonLd[2])}</script>`;

  const headHtml = render(partials.head, {
    PAGE_TITLE: `${escapeHtml(data.title)} — Igor For Men`,
    META_DESC: escapeHtml(data.description),
    EXTRA_HEAD: extraHead,
  });

  const bucketEyebrow = data.bucket ? escapeHtml(String(data.bucket).replace(/-/g, ' ')) : 'Journal';

  const tpl = readFileSync(join(TEMPLATES, 'article.html'), 'utf8');
  const body = render(tpl, {
    HEAD: headHtml,
    TOPBAR: partials.topbar,
    NAV: partials.navJournal,
    BUCKET_EYEBROW: bucketEyebrow,
    TITLE: escapeHtml(data.title),
    READING_TIME: String(reading),
    BODY_HTML: mainHtml,
    FAQ_HTML: faqHtml,
    RELATED_HTML: relatedHtml,
    FOOTER: partials.footer,
  });

  const dir = join(BLOG_DIR, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), body, 'utf8');
}

async function renderBlogIndex(all, partials) {
  const cards = all
    .map((a) => {
      const bucket = escapeHtml(String(a.data.bucket || '').replace(/-/g, ' '));
      const dt = escapeHtml(String(a.data.date || ''));
      return `<article class="blog-card" data-bucket="${escapeHtml(String(a.data.bucket || ''))}">
<a class="blog-card__link" href="/blog/${a.slug}">
<span class="blog-card__meta"><time datetime="${dt}">${dt}</time><span class="blog-card__pill">${bucket}</span></span>
<h2 class="blog-card__title h3">${escapeHtml(a.data.title)}</h2>
<p class="blog-card__excerpt muted">${escapeHtml(excerpt(a.mainMd))}</p>
</a></article>`;
    })
    .join('\n');

  const buckets = [...new Set(all.map((a) => a.data.bucket).filter(Boolean))];
  const filterHtml = buckets
    .map((b) => `<button type="button" class="blog-filter__btn" data-bucket="${escapeHtml(String(b))}">${escapeHtml(String(b).replace(/-/g, ' '))}</button>`)
    .join('');

  const tpl = readFileSync(join(TEMPLATES, 'blog-index.html'), 'utf8');
  const extraHead = `
<link rel="canonical" href="${SITE}/blog/" />
<meta property="og:title" content="Journal — Igor For Men" />
<meta property="og:description" content="Notes on men's grooming, written from a private salon in West Hollywood." />
<meta property="og:type" content="website" />
<meta property="og:url" content="${SITE}/blog/" />`;

  const headHtml = render(partials.head, {
    PAGE_TITLE: 'Journal — Igor For Men',
    META_DESC: "Notes on men's grooming, written from a private salon in West Hollywood.",
    EXTRA_HEAD: extraHead,
  });

  const html = render(tpl, {
    HEAD: headHtml,
    TOPBAR: partials.topbar,
    NAV: partials.navJournal,
    FILTER_BUTTONS: filterHtml || '',
    ARTICLE_CARDS: cards,
    EMPTY_STATE_HTML: all.length === 0 ? '<div class="blog-empty-state"><p><strong>The Journal is just getting started.</strong></p><p>New notes on men\'s grooming publish every Monday and Thursday.</p></div>' : '',
    FOOTER: partials.footer,
  });

  mkdirSync(BLOG_DIR, { recursive: true });
  writeFileSync(join(BLOG_DIR, 'index.html'), html, 'utf8');
}

function writeSitemap(all) {
  const urls = [{ loc: `${SITE}/`, lastmod: new Date().toISOString().slice(0, 10) }];
  for (const a of all) {
    urls.push({ loc: `${SITE}/blog/${a.slug}`, lastmod: (a.data.date || '').toString().slice(0, 10) });
  }
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const u of urls) {
    xml += `<url><loc>${escapeHtml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>\n`;
  }
  xml += '</urlset>';
  writeFileSync(join(ROOT, 'sitemap.xml'), xml, 'utf8');
}

function writeFeeds(all) {
  const latest = all[0]?.data.date || new Date().toISOString().slice(0, 10);
  let rssItems = '';
  let jsonItems = [];
  for (const a of all.slice(0, 40)) {
    const link = `${SITE}/blog/${a.slug}`;
    const pub = a.data.date ? `${a.data.date}T12:00:00-08:00` : latest;
    rssItems += `
    <item>
      <title>${escapeXml(a.data.title)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>${formatRssDate(pub)}</pubDate>
      <description>${escapeXml(excerpt(a.mainMd, 400))}</description>
    </item>`;
    jsonItems.push({
      id: link,
      url: link,
      title: a.data.title,
      content_text: excerpt(a.mainMd, 5000),
      date_published: pub,
    });
  }
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Journal — Igor For Men</title>
    <link>${SITE}/blog/</link>
    <description>Notes on men's grooming from a private West Hollywood salon.</description>
    <language>en-US</language>
    ${rssItems}
  </channel>
</rss>`;
  writeFileSync(join(ROOT, 'feed.xml'), rss, 'utf8');

  const jfeed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Journal — Igor For Men',
    home_page_url: `${SITE}/blog/`,
    feed_url: `${SITE}/feed.json`,
    items: jsonItems,
  };
  writeFileSync(join(ROOT, 'feed.json'), JSON.stringify(jfeed, null, 2), 'utf8');
}

function escapeXml(s) {
  return escapeHtml(s).replace(/'/g, '&apos;');
}

function formatRssDate(isoLike) {
  try {
    const d = new Date(isoLike);
    return d.toUTCString();
  } catch {
    return new Date().toUTCString();
  }
}

function writeLlmsTxt(all) {
  const lines = [
    '# Igor For Men',
    '',
    '> Private male grooming salon in West Hollywood. By appointment only.',
    '',
    '## Canonical pages',
    `- ${SITE}/`,
    `- ${SITE}/blog/`,
    ...all.slice(0, 30).map((a) => `- ${SITE}/blog/${a.slug}`),
    '',
    '## Contact',
    'Book via the phone link on the website (no published phone number in plain text).',
  ];
  writeFileSync(join(ROOT, 'llms.txt'), lines.join('\n'), 'utf8');
}

async function loadPartials() {
  const [head, navHome, footer, topbar] = await Promise.all([
    loadPartial(ROOT, 'head.html'),
    loadPartial(ROOT, 'nav.html'),
    loadPartial(ROOT, 'footer.html'),
    loadPartial(ROOT, 'topbar.html'),
  ]);
  const navJournal = navHome.replaceAll(
    '<a href="/blog/">Journal</a>',
    '<a href="/blog/" class="nav__link--active" aria-current="page">Journal</a>',
  );

  return {
    head,
    navJournal,
    footer,
    topbar,
  };
}

export async function buildBlog() {
  const all = parseArticles();
  const partials = await loadPartials();
  mkdirSync(BLOG_DIR, { recursive: true });
  for (const article of all) {
    await renderArticlePage(article, all, partials);
  }
  await renderBlogIndex(all, partials);
  writeSitemap(all);
  writeFeeds(all);
  writeLlmsTxt(all);
  console.log(`Built ${all.length} article(s), blog index, sitemap, feeds, llms.txt`);
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  buildBlog().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
