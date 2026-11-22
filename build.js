#!/usr/bin/env node
/*
 * AI Tool Scout - static site builder.
 * No npm packages needed. Run:  node build.js
 * Output goes to /dist. Vercel runs this command on every deploy.
 *
 * Inputs:
 *   site.json            site name, URL, author, default image
 *   src/index.html       the homepage (your current big file, with 2 markers added)
 *   data/tools.json      one object per tool  -> /tools/<slug>/
 *   data/articles.json   one object per article -> /articles/<slug>/
 *   data/versus.json     hand-picked pairs     -> /versus/<a>-vs-<b>/
 *   data/pages.json      About, Privacy, Contact, Terms -> /<slug>/
 *   assets/              CSS, favicon, share image (copied to /dist/assets)
 *
 * Any item with "draft": true is skipped unless you run:  BUILD_DRAFTS=1 node build.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const DRAFTS = process.env.BUILD_DRAFTS === '1';
const warnings = [];
const sitemap = []; // { loc, lastmod }

// ---------- helpers ----------
function readJson(rel, fallback) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    if (fallback !== undefined) return fallback;
    throw new Error('Missing file: ' + rel);
  }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { throw new Error('Invalid JSON in ' + rel + ': ' + e.message); }
}
const SITE = readJson('site.json');
const BASE = SITE.url.replace(/\/+$/, '');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ld = obj => '<script type="application/ld+json">' +
  JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';
const abs = p => (/^https?:\/\//.test(p) ? p : BASE + (p.startsWith('/') ? p : '/' + p));
const live = list => (list || []).filter(x => DRAFTS || !x.draft);
const today = () => new Date().toISOString().slice(0, 10);

function fmtDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return '';
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB',
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function trimWords(s, max) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}
function write(rel, content) {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}
function seoCheck(label, title, description) {
  if (title.length > 65) warnings.push(`${label}: title is ${title.length} characters (aim for 60 or less)`);
  if (description.length < 70) warnings.push(`${label}: description is short (${description.length}); aim for 120-160`);
  if (description.length > 165) warnings.push(`${label}: description is ${description.length} characters (aim for 160 or less)`);
}
function requireFields(label, obj, fields) {
  const missing = fields.filter(f => obj[f] == null || obj[f] === '');
  if (missing.length) throw new Error(`${label} is missing: ${missing.join(', ')}`);
}
// External links: open safely. Add data-aff to an <a> to mark it as an affiliate link.
function fixLinks(html) {
  return String(html || '').replace(/<a\s([^>]*?)href="(https?:\/\/[^"]+)"([^>]*)>/gi, (m, pre, url, post) => {
    if (url.startsWith(BASE)) return m;
    const attrs = (pre + ' ' + post);
    const aff = /data-aff/i.test(attrs);
    const clean = attrs.replace(/\s*(rel|target)="[^"]*"/gi, '').trim();
    return `<a ${clean ? clean + ' ' : ''}href="${url}" target="_blank" rel="${aff ? 'sponsored nofollow noopener' : 'noopener'}">`;
  });
}

// ---------- shared head, header, footer ----------
function seoHead({ title, description, urlPath, ogType, image, noindex, jsonld, withTitle }) {
  const img = abs(image || SITE.defaultImage);
  const parts = [];
  if (withTitle) {
    parts.push(`<title>${esc(title)}</title>`);
    parts.push(`<meta name="description" content="${esc(description)}">`);
  }
  parts.push(`<link rel="canonical" href="${abs(urlPath)}">`);
  if (noindex) parts.push('<meta name="robots" content="noindex, follow">');
  else parts.push('<meta name="robots" content="index, follow, max-image-preview:large">');
  parts.push(`<meta property="og:site_name" content="${esc(SITE.name)}">`);
  parts.push(`<meta property="og:type" content="${ogType || 'website'}">`);
  parts.push(`<meta property="og:title" content="${esc(title)}">`);
  parts.push(`<meta property="og:description" content="${esc(description)}">`);
  parts.push(`<meta property="og:url" content="${abs(urlPath)}">`);
  parts.push(`<meta property="og:image" content="${img}">`);
  if (!image) {
    parts.push(`<meta property="og:image:width" content="${SITE.defaultImageWidth || 1200}">`);
    parts.push(`<meta property="og:image:height" content="${SITE.defaultImageHeight || 630}">`);
  }
  parts.push('<meta property="og:locale" content="en_US">');
  parts.push('<meta name="twitter:card" content="summary_large_image">');
  parts.push(`<meta name="twitter:title" content="${esc(title)}">`);
  parts.push(`<meta name="twitter:description" content="${esc(description)}">`);
  parts.push(`<meta name="twitter:image" content="${img}">`);
  parts.push('<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">');
  (jsonld || []).forEach(o => parts.push(ld(o)));
  return parts.join('\n');
}

const orgLd = () => ({
  '@type': 'Organization', '@id': BASE + '/#org', name: SITE.name, url: BASE + '/',
  logo: abs(SITE.logo || '/assets/favicon.svg')
});
function breadcrumbLd(trail) { // trail = [[name, path], ...]
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t[0], item: abs(t[1]) }))
  };
}
function crumbsHtml(trail) {
  return '<nav class="crumbs" aria-label="Breadcrumb">' + trail.map((t, i) =>
    i < trail.length - 1 ? `<a href="${t[1]}">${esc(t[0])}</a><span aria-hidden="true">›</span>` : `<span>${esc(t[0])}</span>`
  ).join('') + '</nav>';
}

let FOOTER_PAGES = [];
function header() {
  return `<header class="site-header"><div class="wrap bar">
<a class="brand" href="/">${esc(SITE.name)}</a>
<nav class="nav" aria-label="Main">
<a href="/#tools">Reviews</a><a href="/#compare">Compare</a><a href="/#guides">Guides</a><a href="/#articles">Articles</a><a href="/#prompt-lab">Prompt Lab</a>
</nav><a class="btn" href="/#free">Try free tools →</a></div></header>`;
}
function footer() {
  const trust = FOOTER_PAGES.map(p => `<a href="/${p.slug}/">${esc(p.footerLabel || p.title)}</a>`).join('');
  return `<footer class="site-footer"><div class="wrap">
<p class="disclosure"><strong>How this site earns:</strong> ${esc(SITE.name)} is reader-supported. Some links are affiliate links; if you subscribe through one we may earn a commission at no extra cost to you. It never changes a score or ranking. Prices can change, so confirm on the official site before paying.</p>
<div class="foot-links"><a href="/">Home</a><a href="/#tools">All reviews</a><a href="/#articles">All articles</a>${trust}</div>
<p class="small">© ${new Date().getFullYear()} ${esc(SITE.name)}. Independent reviews, not affiliated with any tool listed.</p>
</div></footer>`;
}
function layout({ title, description, urlPath, ogType, image, noindex, jsonld, main, lastmod }) {
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
${seoHead({ title, description, urlPath, ogType, image, noindex, jsonld, withTitle: true })}
<link rel="stylesheet" href="/assets/site.css">
</head><body>
${header()}
<main class="wrap content">${main}</main>
${footer()}
</body></html>`;
  write(urlPath.replace(/^\//, '') + 'index.html', html);
  if (!noindex) sitemap.push({ loc: abs(urlPath), lastmod: lastmod || today() });
}

// ---------- page types ----------
function byline(item) {
  const a = SITE.author || {};
  const aboutExists = FOOTER_PAGES.some(p => p.slug === 'about');
  const name = aboutExists && a.name ? `<a href="/about/">${esc(a.name)}</a>` : esc(a.name || SITE.name);
  const pub = fmtDate(item.datePublished), upd = fmtDate(item.dateUpdated);
  return `<p class="meta">By ${name}${pub ? ' · Published ' + pub : ''}${upd && upd !== pub ? ' · Updated ' + upd : ''}</p>`;
}
function relatedBlock(title, items) {
  if (!items.length) return '';
  return `<section class="related"><h2>${esc(title)}</h2><ul>` +
    items.map(i => `<li><a href="${i.url}">${esc(i.label)}</a>${i.note ? `<span>${esc(i.note)}</span>` : ''}</li>`).join('') +
    '</ul></section>';
}
const cta = () => `<aside class="cta"><strong>Not sure which tool fits you?</strong>
<p>Answer two quick questions and get a straight recommendation.</p><a class="btn" href="/#finder">Open the Tool Finder →</a></aside>`;

function buildArticle(a, all) {
  requireFields('Article ' + (a.slug || '?'), a, ['slug', 'title', 'description', 'category', 'datePublished', 'bodyHtml']);
  const urlPath = `/articles/${a.slug}/`;
  const pageTitle = a.metaTitle || a.title;
  seoCheck('Article ' + a.slug, pageTitle, a.description);
  const trail = [['Home', '/'], ['Articles', '/#articles'], [a.title, urlPath]];
  const rel = all.filter(x => x.slug !== a.slug && x.category === a.category).slice(0, 3);
  const fill = all.filter(x => x.slug !== a.slug && !rel.includes(x)).slice(0, 3 - rel.length);
  const author = SITE.author || {};
  const jsonld = [{
    '@context': 'https://schema.org', '@type': 'Article',
    headline: a.title, description: a.description, mainEntityOfPage: abs(urlPath),
    datePublished: a.datePublished, dateModified: a.dateUpdated || a.datePublished,
    image: [abs(a.image || SITE.defaultImage)],
    author: { '@type': author.type || 'Organization', name: author.name || SITE.name, url: abs('/about/') },
    publisher: orgLd()
  }, breadcrumbLd(trail)];
  const main = `${crumbsHtml(trail)}<article>
<p class="kicker">${esc(a.category)}${a.readMinutes ? ' · ' + a.readMinutes + ' min read' : ''}</p>
<h1>${esc(a.title)}</h1><p class="lede">${esc(a.description)}</p>${byline(a)}
<div class="prose">${fixLinks(a.bodyHtml)}</div></article>
${relatedBlock('Keep reading', rel.concat(fill).map(x => ({ url: `/articles/${x.slug}/`, label: x.title, note: x.category })))}${cta()}`;
  layout({ title: `${pageTitle} | ${SITE.name}`, description: a.description, urlPath, ogType: 'article', image: a.image, jsonld, main, lastmod: a.dateUpdated || a.datePublished });
}

function toolTitle(t) {
  const y = (t.checkedDate || t.datePublished || today()).slice(0, 4);
  return `${t.name} Review ${y}: Pricing, Pros and Cons`;
}
function buildTool(t, tools, versusPages) {
  requireFields('Tool ' + (t.slug || '?'), t, ['slug', 'name', 'category', 'score', 'summary', 'pricing', 'pricingUrl', 'checkedDate', 'datePublished']);
  const urlPath = `/reviews/${t.slug}/`;
  const title = t.title || toolTitle(t);
  const description = t.metaDescription || trimWords(t.summary, 158);
  seoCheck('Tool ' + t.slug, title, description);
  const trail = [['Home', '/'], ['Reviews', '/#tools'], [t.name, urlPath]];
  const jsonld = [{
    '@context': 'https://schema.org', '@type': 'Review',
    name: title, reviewBody: t.summary, datePublished: t.datePublished, dateModified: t.dateUpdated || t.checkedDate,
    author: { '@type': (SITE.author || {}).type || 'Organization', name: (SITE.author || {}).name || SITE.name },
    publisher: orgLd(),
    itemReviewed: { '@type': 'SoftwareApplication', name: t.name, applicationCategory: 'BusinessApplication', ...(t.maker ? { publisher: { '@type': 'Organization', name: t.maker } } : {}) },
    reviewRating: { '@type': 'Rating', ratingValue: t.score, bestRating: 5, worstRating: 1 }
  }, breadcrumbLd(trail)];
  const facts = [['Made by', t.maker], ['Category', t.category], ['Our score', t.score + ' / 5'], ['Free plan', t.freePlan], ['Pricing', t.pricing], ['Best for', t.bestFor]]
    .filter(r => r[1]).map(r => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('');
  const scores = t.scores ? '<h2>Score breakdown</h2><table class="table"><tbody>' +
    Object.entries(t.scores).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v} / 5</td></tr>`).join('') + '</tbody></table>' : '';
  const list = (h, arr, cls) => arr && arr.length ? `<div class="${cls}"><h2>${h}</h2><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  const mine = versusPages.filter(v => v.a === t.slug || v.b === t.slug);
  const sameCat = tools.filter(x => x.slug !== t.slug && x.category === t.category).slice(0, 3);
  const main = `${crumbsHtml(trail)}<article>
<p class="kicker">${esc(t.category)} review</p><h1>${esc(title)}</h1><p class="lede">${esc(t.summary)}</p>${byline(t)}
<table class="table facts"><tbody>${facts}</tbody></table>
<p class="note">Price checked ${esc(fmtDate(t.checkedDate))}. Prices change, so <a href="${esc(t.pricingUrl)}">confirm on the official pricing page</a> before you pay.</p>
<div class="proscons">${list('What we like', t.pros, 'pros')}${list('What to watch out for', t.cons, 'cons')}</div>
${scores}<div class="prose">${fixLinks(t.bodyHtml || '')}</div></article>
${relatedBlock('Compare ' + t.name, mine.map(v => ({ url: v.url, label: v.label })))}
${relatedBlock('Similar tools', sameCat.map(x => ({ url: `/reviews/${x.slug}/`, label: x.name + ' review', note: x.score + ' / 5' })))}${cta()}`;
  layout({ title: `${title} | ${SITE.name}`, description, urlPath, ogType: 'article', jsonld, main, lastmod: t.dateUpdated || t.checkedDate });
}

function buildVersus(v, toolMap) {
  const A = toolMap[v.a], B = toolMap[v.b];
  if (!A || !B) { warnings.push(`Versus ${v.a} vs ${v.b}: skipped, tool not found in tools.json`); return null; }
  requireFields(`Versus ${v.a}-vs-${v.b}`, v, ['verdict', 'datePublished']);
  const slug = `${v.a}-vs-${v.b}`, urlPath = `/versus/${slug}/`;
  const y = (v.dateUpdated || v.datePublished).slice(0, 4);
  const title = v.title || `${A.name} vs ${B.name} (${y}): Which Is Better?`;
  const description = v.metaDescription || trimWords(v.verdict, 158);
  seoCheck('Versus ' + slug, title, description);
  const trail = [['Home', '/'], ['Compare', '/#versus'], [`${A.name} vs ${B.name}`, urlPath]];
  const auto = [['Our score', A.score + ' / 5', B.score + ' / 5'], ['Pricing', A.pricing, B.pricing], ['Free plan', A.freePlan, B.freePlan],
    ['Best for', A.bestFor, B.bestFor], ['Main drawback', (A.cons || [])[0], (B.cons || [])[0]]];
  Object.keys(A.scores || {}).forEach(k => { if (B.scores && B.scores[k] != null) auto.push([k, A.scores[k] + ' / 5', B.scores[k] + ' / 5']); });
  const rows = (v.rows || auto).filter(r => r[1] && r[2]);
  const jsonld = [{
    '@context': 'https://schema.org', '@type': 'Article', headline: title, description,
    mainEntityOfPage: abs(urlPath), datePublished: v.datePublished, dateModified: v.dateUpdated || v.datePublished,
    image: [abs(SITE.defaultImage)], author: { '@type': (SITE.author || {}).type || 'Organization', name: (SITE.author || {}).name || SITE.name }, publisher: orgLd()
  }, breadcrumbLd(trail)];
  const main = `${crumbsHtml(trail)}<article>
<p class="kicker">Versus</p><h1>${esc(title)}</h1>${byline(v)}
<div class="verdict"><strong>Our verdict</strong><p>${esc(v.verdict)}</p></div>
<div class="table-wrap"><table class="table cmp"><thead><tr><th></th><th><a href="/reviews/${A.slug}/">${esc(A.name)}</a></th><th><a href="/reviews/${B.slug}/">${esc(B.name)}</a></th></tr></thead><tbody>
${rows.map(r => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>
<p class="note">Prices checked ${esc(fmtDate(A.checkedDate))}. Confirm on the official pages: <a href="${esc(A.pricingUrl)}">${esc(A.name)}</a> · <a href="${esc(B.pricingUrl)}">${esc(B.name)}</a>.</p>
<div class="prose">${fixLinks(v.bodyHtml || '')}</div></article>
${relatedBlock('Read the full reviews', [{ url: `/reviews/${A.slug}/`, label: A.name + ' review' }, { url: `/reviews/${B.slug}/`, label: B.name + ' review' }])}${cta()}`;
  layout({ title: `${title} | ${SITE.name}`, description, urlPath, ogType: 'article', jsonld, main, lastmod: v.dateUpdated || v.datePublished });
  return { a: v.a, b: v.b, url: urlPath, label: `${A.name} vs ${B.name}` };
}

function buildPage(p) {
  requireFields('Page ' + (p.slug || '?'), p, ['slug', 'title', 'description', 'bodyHtml']);
  const urlPath = `/${p.slug}/`;
  const trail = [['Home', '/'], [p.title, urlPath]];
  const jsonld = [{ '@context': 'https://schema.org', '@type': 'WebPage', name: p.title, description: p.description, url: abs(urlPath), isPartOf: { '@type': 'WebSite', name: SITE.name, url: BASE + '/' } }, breadcrumbLd(trail)];
  const main = `${crumbsHtml(trail)}<article><h1>${esc(p.title)}</h1><div class="prose">${fixLinks(p.bodyHtml)}</div></article>`;
  layout({ title: `${p.title} | ${SITE.name}`, description: p.description, urlPath, jsonld, main, lastmod: p.dateUpdated });
}

// ---------- reviews index ----------
function buildReviewsIndex(tools) {
  const urlPath = '/reviews/';
  const title = 'All tool reviews | ' + SITE.name;
  const description = 'Every AI tool review on AI Tool Scout, with scores, prices and free plans. Independent reviews, not affiliated with any tool listed.';
  seoCheck('Reviews index', title, description);
  const trail = [['Home', '/'], ['Reviews', urlPath]];
  const jsonld = [{
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: 'All tool reviews', description,
    itemListElement: tools.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name + ' review',
      url: abs(`/reviews/${t.slug}/`),
      item: { '@type': 'Review', name: t.name + ' review', reviewBody: t.summary,
        reviewRating: { '@type': 'Rating', ratingValue: t.score, bestRating: 5, worstRating: 1 } }
    }))
  }, breadcrumbLd(trail)];
  const main = `${crumbsHtml(trail)}<h1>All tool reviews</h1>
<p class="lede">Every tool we have reviewed, with its score, price and free plan. Prices checked ${esc(fmtDate('2026-11-12'))} — confirm on the official site before paying.</p>
<ul>${tools.map(t => `<li><a href="/reviews/${t.slug}/">${esc(t.name)} review</a> — ${t.score} / 5 · ${esc(t.pricing)} · ${esc(t.bestFor)}</li>`).join('')}</ul>${cta()}`;
  layout({ title, description, urlPath, jsonld, main, lastmod: '2026-11-21' });
}

// ---------- homepage ----------
function buildHome(tools, articles, versusPages) {
  const srcFile = path.join(ROOT, 'src', 'index.html');
  if (!fs.existsSync(srcFile)) throw new Error('Missing src/index.html (put your current homepage there).');
  let html = fs.readFileSync(srcFile, 'utf8');
  const homeTitle = SITE.homeTitle || SITE.name;
  const jsonld = [{ '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': BASE + '/#website', url: BASE + '/', name: SITE.name, description: SITE.description, inLanguage: 'en', publisher: { '@id': BASE + '/#org' } },
    orgLd()] }];
  const head = seoHead({ title: homeTitle, description: SITE.description, urlPath: '/', ogType: 'website', jsonld, withTitle: false });
  if (html.includes('<!--SEO_HEAD-->')) html = html.replace('<!--SEO_HEAD-->', head);
  else warnings.push('src/index.html has no <!--SEO_HEAD--> marker inside <head>. Home page tags were NOT added.');
  const list = (h, arr) => arr.length ? `<div><h3>${h}</h3><ul>${arr.map(x => `<li><a href="${x.url}">${esc(x.label)}</a></li>`).join('')}</ul></div>` : '';
  const links = `<nav class="seo-links" aria-label="All pages" style="max-width:1100px;margin:2rem auto;padding:1rem;font:15px/1.6 system-ui,sans-serif">
<h2 style="font-size:1.1rem">Browse every review, comparison and guide</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem">
${list('Tool reviews', tools.map(t => ({ url: `/reviews/${t.slug}/`, label: t.name + ' review' })))}
${list('Comparisons', versusPages.map(v => ({ url: v.url, label: v.label })))}
${list('Articles', articles.map(a => ({ url: `/articles/${a.slug}/`, label: a.title })))}</div></nav>`;
  if (html.includes('<!--SEO_LINKS-->')) html = html.replace('<!--SEO_LINKS-->', links);
  else warnings.push('src/index.html has no <!--SEO_LINKS--> marker before the footer. Crawlable links were NOT added.');
  write('index.html', html);
  sitemap.unshift({ loc: BASE + '/', lastmod: SITE.homeLastmod || today() });
}

// ---------- run ----------
function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  if (fs.existsSync(path.join(ROOT, 'assets'))) fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  // Root-level files that must stay live at the site root (Monetag verification
  // service-worker files + Google Search Console verification file, when present).
  ['sw 3 bula.js', 'sw__1__3_bula.js', 'googlec977543df02b9a20.html'].forEach(f => {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(DIST, f));
  });

  const tools = live(readJson('data/tools.json', []));
  const articles = live(readJson('data/articles.json', []))
    .sort((a, b) => String(b.datePublished).localeCompare(String(a.datePublished)));
  const versusIn = live(readJson('data/versus.json', []));
  const pages = live(readJson('data/pages.json', []));
  FOOTER_PAGES = pages.filter(p => p.footer);

  const slugs = new Set();
  [...tools.map(t => 'tools/' + t.slug), ...articles.map(a => 'articles/' + a.slug), ...pages.map(p => p.slug)].forEach(s => {
    if (slugs.has(s)) throw new Error('Duplicate slug: ' + s);
    slugs.add(s);
  });
  const toolMap = Object.fromEntries(tools.map(t => [t.slug, t]));

  // Versus first, so tool pages can link to them
  const versusPages = [];
  versusIn.forEach(v => { const r = buildVersus(v, toolMap); if (r) versusPages.push(r); });
  tools.forEach(t => buildTool(t, tools, versusPages));
  buildReviewsIndex(tools);
  articles.forEach(a => buildArticle(a, articles));
  pages.forEach(buildPage);
  buildHome(tools, articles, versusPages);

  // 404, robots, sitemap
  const nf = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Page not found | ${esc(SITE.name)}</title><meta name="robots" content="noindex"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/site.css"></head><body>${header()}<main class="wrap content"><h1>Page not found</h1><p class="lede">That page does not exist or has moved.</p><a class="btn" href="/">Go to the homepage →</a></main>${footer()}</body></html>`;
  write('404.html', nf);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
  write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    sitemap.map(u => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n') + '\n</urlset>\n');

  console.log(`Built ${sitemap.length} pages: ${tools.length} tools, ${versusPages.length} comparisons, ${articles.length} articles, ${pages.length} info pages.`);
  if (DRAFTS) console.log('NOTE: BUILD_DRAFTS=1 is on, draft items were included. Do not deploy this build.');
  if (warnings.length) { console.log('\nWarnings to fix:'); warnings.forEach(w => console.log(' - ' + w)); }
}
main();
