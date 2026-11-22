# AI Tool Scout: separate pages starter kit

This kit turns the one big HTML file into a small site where **every tool review, article and comparison has its own web address (URL)**. Google can then rank each page for its own search words.

## The structure (one file becomes many, built from data)

```
site.json            site name, URL, author, share image
vercel.json          tells Vercel to run the build
build.js             the builder (no packages needed, plain Node)
src/index.html       the homepage (your current big file, with 2 markers added)
data/tools.json      one entry per tool      -> /reviews/<slug>/ (plus a /reviews/ index)
data/articles.json   one entry per article   -> /articles/<slug>/
data/versus.json     hand-picked pairs       -> /versus/<a>-vs-<b>/
data/pages.json      About, Privacy, Contact, Terms -> /<slug>/
assets/              site.css, favicon.svg, og-default.png
dist/                build output (created automatically, never edit, never commit)
```

Keep the homepage as ONE file. Everything else is generated from the data files, so a fix or a new article is one edit in one place.

## Step-by-step

1. **Back up first.** Make a new Git branch (for example `separate-pages`). Do not work on `main`.
2. **Copy this kit into the GitHub repo.** Move the current `index.html` to `src/index.html`.
3. **Add two markers to `src/index.html`:**
   - Inside `<head>`, add this line on its own: `<!--SEO_HEAD-->`
     Keep the existing `<title>` and `<meta name="description">`. The marker adds the canonical link, Open Graph, Twitter tags and structured data.
   - Just before the footer, add: `<!--SEO_LINKS-->`
     The build replaces it with normal links to every review, comparison and article. Google needs real links to find the pages.
4. **Edit `site.json`:** set the real author or team name. If you buy a custom domain later, change `url` here and nothing else.
5. **Move the content into the data files.**
   - Search `src/index.html` for a piece of text from an article (for example `Muse AI Explained`). The 31 articles are probably in a JavaScript array. Copy each one into `data/articles.json` using the format of the sample entry: `slug`, `title`, `description`, `category`, `readMinutes`, `datePublished`, `dateUpdated`, `bodyHtml`.
   - Do the same for the 12 tools into `data/tools.json` (the Versus and review cards already hold the scores, prices and drawbacks).
   - Use **real** dates. Do not invent dates or authors.
   - Delete the sample entries, or leave `"draft": true` on them so they are skipped.
6. **Write a real verdict for each comparison** in `data/versus.json` (2 to 3 sentences, by hand). Start with the 10 most searched pairs. A pair without a real verdict should not be published.
7. **Fill in `data/pages.json`** (About, Contact, Privacy, Terms) with real text. Set `"footer": true` so they appear in every footer. Remove `"draft": true` only when the text is real.
8. **Test on your computer:**
   ```
   node build.js
   ```
   Fix every warning it prints (title too long, description too short, and so on). Then open `dist/index.html` and a few generated pages in a browser (or run `npx serve dist`).
9. **Change the homepage cards to real links.** In the homepage JavaScript, make each article, review and Versus card go to its page (`/articles/<slug>/`, `/reviews/<slug>/`) instead of opening "right here". Keep the Versus picker for fun, but add a "Read the full comparison" link when that pair has a page.
10. **Vercel settings.** `vercel.json` already sets the build command to `node build.js` and the output folder to `dist`. In the Vercel project settings, set Framework Preset to "Other". Push the branch, check the Preview link, then merge into `main`.
11. **After going live:**
    - Open `/sitemap.xml` and `/robots.txt` in the browser to check them.
    - Add the site in **Google Search Console** and submit `https://<your-domain>/sitemap.xml`.
    - Check one page with Google's Rich Results Test and one with the Facebook Sharing Debugger (paste a link to see the preview card).
    - Set up analytics (Vercel Analytics, Plausible or GA4).

## Rules that keep the site trusted

- **Every page needs its own unique title (60 characters or less) and description (120 to 160).** The build warns you.
- **Mark affiliate links** with `data-aff` in the HTML (`<a data-aff href="...">`). The build turns them into `rel="sponsored nofollow noopener"`. All other outside links get `noopener`.
- **Only describe testing you really did.** If a review is based on research, say "researched", not "tested".
- **Prices:** update `pricing` and `checkedDate` whenever you check the official page. The page shows the date.
- **Do not publish thin pages.** No comparison without a hand-written verdict. No article without real text.
- **Changing a slug later breaks links.** If you must, add a redirect in `vercel.json`.

## Notes on structured data

- Articles and comparisons use `Article`, tool pages use `Review` (with the tool as `SoftwareApplication`), and every page has `BreadcrumbList`.
- The homepage gets `WebSite` and `Organization`.
- FAQ markup is not included on purpose. Google now shows FAQ rich results only for a small set of government and health sites, so it would not help this site.
- Structured data helps Google understand the pages. It does not guarantee any special display.

## Adding things later

- **New article:** add an entry to `data/articles.json`, run `node build.js`, push.
- **New tool:** add an entry to `data/tools.json`.
- **New comparison:** add `{ "a": "slug-one", "b": "slug-two", "verdict": "...", "datePublished": "YYYY-MM-DD" }` to `data/versus.json`.
- **Draft items:** keep `"draft": true` while writing. Preview them with `BUILD_DRAFTS=1 node build.js`. Never deploy that build.
