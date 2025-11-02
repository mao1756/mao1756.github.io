# Personal Homepage (Free + Google Scholar Sync)

A clean, modern personal homepage you can host **for free** on **GitHub Pages**, with a **GitHub Action** that keeps your **Publications** page in sync with your public **Google Scholar** profile.

> ⚠️ Google Scholar has no official public API. The `scripts/fetch_scholar.js` scraper may break if Scholar changes its HTML, or if rate-limited. Use reasonably and respect Google’s terms. If you'd prefer an alternative, you can switch the fetcher to a source like Semantic Scholar or ORCID.

## What you get

- `index.html` – hero + quick overview in a dark, product-style aesthetic.
- `publications.html` – searchable, sortable list rendered from `data/publications.json`.
- `projects.html` – a simple placeholder grid.
- GitHub Action that refreshes `data/publications.json` weekly (and on manual trigger).

## Quick start (GitHub Pages)

1. **Create a new GitHub repository** (public), e.g. `my-homepage`.
2. **Upload all files** from this folder into the repo (or push via git).
3. In your repo, go to **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: **main** / **root**
   - Save. Your site will be live at `https://YOUR-USER.github.io/REPO-NAME/`.
4. In your repo, go to **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `SCHOLAR_ID`
   - Value: your Google Scholar profile ID (the `user=...` part of your profile URL).
     - Example profile URL: `https://scholar.google.com/citations?user=ABCDEFGHIJK&hl=en` → ID is `ABCDEFGHIJK`.
5. Open the **Actions** tab and run **“Update publications (Google Scholar)”** with **Run workflow**.
   - After it runs, check `data/publications.json` and your `Publications` page for the updated list.
6. Edit `index.html`, `projects.html`, and text labels to replace placeholder content with your information (name, email, social links, etc.).

## Custom domain (optional)

- In **Settings → Pages**, set your custom domain (e.g., `me.example.com`).
- Add a `CNAME` record at your DNS provider pointing to `YOUR-USER.github.io` per GitHub Pages docs.

## Local development

- No build step is required. Just open `index.html` in a browser.
- If you want to test the Scholar fetch locally:
  ```bash
  npm i
  SCHOLAR_ID=YOUR_ID node scripts/fetch_scholar.js
  ```

## Switching data source (optional)

If scraping Google Scholar is not for you, consider alternative sources and update the script accordingly:

- **Semantic Scholar API** (authorId → publications & citations)
- **ORCID** (works well if your works are up to date there)
- **Manual file**: export BibTeX/CSV and convert to `data/publications.json`

## License

MIT — do whatever you like. Please don’t reuse logos or trademarks you don’t own.
