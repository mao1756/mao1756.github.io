# Personal Homepage (SerpAPI + Node 20)

This variant uses **SerpAPI’s Google Scholar Author API** to keep your `Publications` page in sync with your Google Scholar profile. It also includes **OpenAlex** (public API) and an optional direct Scholar scraper (may fail).

## Configure SerpAPI (recommended)
1. Create a SerpAPI account and get your **API key**.
2. In your GitHub repo, add these **Actions secrets**:
   - `SERPAPI_API_KEY` — your key
   - `SCHOLAR_ID` — your Google Scholar author ID (the `user=...` from your profile URL)
3. Run the GitHub Action **Update publications** (default `source=serpapi`).

The workflow calls:
```
GET https://serpapi.com/search.json?engine=google_scholar_author&author_id=...&hl=en&num=100&start=0&api_key=...
```
…and paginates with `start` and `num` until all articles are fetched.

## Fallbacks
- **OpenAlex**: set `OPENALEX_AUTHOR_ID` (or `OPENALEX_QUERY`) and run with `source=openalex`.
- **Direct Scholar**: set `SCHOLAR_ID` and run with `source=scholar` (may be blocked by Google).

## Local test
```bash
npm i
# SerpAPI
SERPAPI_API_KEY=XXXX SCHOLAR_ID=YYYY npm run fetch:serpapi

# OpenAlex
OPENALEX_AUTHOR_ID=A1969205032 npm run fetch:openalex
```

The site reads from `data/publications.json`, so all sources render the same UI.
