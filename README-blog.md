# IFM Journal — how the automated blog works

This site can publish new Journal articles from a topic list in the repo, without a CMS or database. Articles are plain Markdown in GitHub, turned into static HTML that matches the main site design.

## Skip a planned article

Every automated article opens as a pull request with the label `auto-article`. Within **24 hours**, add the label **`hold`** to that pull request. The hourly job will not merge held PRs. Remove `hold` only when you are ready for the usual timer to apply again.

## Publish a specific topic now

In GitHub: **Actions → Publish Article → Run workflow**. Optionally enter a **slug** that matches a topic still listed in `content/topics/queue.yaml`. Leave slug blank to take the next topic in order.

You still need the **`ANTHROPIC_API_KEY`** secret set on the repository for a real generation run.

## Edit the topic queue

Open `content/topics/queue.yaml` in the GitHub editor (or locally). Each topic is one YAML item with `slug`, `title`, `target_keyword`, `secondary_keywords`, `intent`, `bucket`, `internal_links`, and `notes`. Keep valid YAML indentation so the file continues to parse.

## Change brand voice

Edit `content/brand/voice.md`. The publishing script sends this file to Claude as the authoritative tone guide.

## Ban a phrase or word

Edit `content/brand/forbidden.yaml` under `phrases:` or `words:`. The validator fails the build if generated copy breaks these rules.

## Read recent posts on the site

Open the live Journal at **[/blog/](https://igorformen.com/blog/)** (alias **[/journal](https://igorformen.com/journal)**).

## Local dry run (no API calls)

From the repo root with Node 20+:

```bash
npm install
npm run dry
```

This writes a sample Markdown file under `content/articles/`, rebuilds `/blog/`, `sitemap.xml`, `feed.xml`, `feed.json`, and `llms.txt`. If you do not want those changes in git, discard them afterward with `git checkout` or `git restore` on the paths that moved.

## Troubleshooting

- **Workflow exits cleanly but no PR:** Either nothing changed (for example, already published today in Pacific time) or generation failed—check the Actions log.
- **Validator errors:** Open the generated Markdown in `content/articles/` and compare with `scripts/validate-article.mjs` rules (length, internal links, FAQ shape, forbidden phrases, etc.).
