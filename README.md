# SKC AI studio public catalogue

This repository publishes the public model and price catalogue, selected GitHub projects, source-backed developer works and the AI era directory for [Simon Seow](https://simonseow.com/news/).

The current version has no news feeds, hot-topic tracker, daily/weekly/monthly news reports, Tibo/Codex reset monitor, bookmarks service or translation pipeline. Existing Git commits are retained as history by the owner's choice. They are not API fallback data.

## Daily update

The single `.github/workflows/update.yml` workflow uses a standard `ubuntu-latest` runner and is scheduled at `01:00 UTC`, which is `09:00 Asia/Kuala_Lumpur` daily. GitHub may queue, delay or drop a scheduled run; the actual collection time is visible in the receipt. A configured schedule is not proof of completion.

Only public metadata, official pricing pages and declared source links are read. The publishing token is the repository-scoped built-in `GITHUB_TOKEN`; it is sent only to GitHub API or Git, never to demonstration sites. The workflow has no paid inference API, database, Vercel key, model weights or Python translation dependency. No showcased project is installed or executed.

Standard public GitHub Actions runners are used under the existing free arrangement. Larger runners, paid APIs, paid storage or subscriptions require the owner's advance approval. Existing website hosting and third-party product subscriptions have their own terms.

## Publication contract

- `data/catalog.json`: schema 2, containing `models`, `projects`, `showcases`, `aiEra`, `sources`, `refreshPolicy` and `receipt`.
- `data/receipt.json`: actual attempt, source-component status and scheduler/run identity.
- `data/manifest.json`: schema 2, byte counts and SHA-256 hashes for the two files above, plus the generation hash.

No other current data file is permitted. The website accepts only schema 2, validates exact hashes and keeps at most a previous schema-2 catalogue in memory or its clean bundled catalogue. It never falls back to a former news snapshot. Removed API formats return 410.

Individual model and tool source failures retain their last verified quotes, evidence and dates. Unknown prices or unavailable sources do not become free. API token prices, subscriptions, external tools, taxes and actual account usage remain distinct. Recommendations and scenario estimates are labelled; usage rankings must preserve metric, period and original source rather than fabricate a universal ranking.

## Local checks

```sh
npm ci --ignore-scripts
npm test
npm run collect
npm run verify
```

`node scripts/update.cjs --output /a/temporary/data --work /a/temporary/lock` can validate a separate publication without writing the current committed data.

Website source, private files, reference media, credentials, environment files, model binaries, `node_modules` and local QA do not belong in this repository. The project preserves all submitted source links and does not claim complete coverage of every online product, personal creator or price.
