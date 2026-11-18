// Page chrome for the reference pages: head, masthead, breadcrumbs, footer. A copy of the country pages'
// chrome (tools/encyclopedia/build.mjs is a script, so it cannot be imported): keep MAST_NAV, FOOT_NAV and the
// head in step with it. tools/seo/verify.mjs compares the footer with the encyclopedia's, character for character.
import { SITE, REGIONS, slug, esc } from '../encyclopedia/lib.mjs';
import { LISTS_INDEX, COMPARE_INDEX, SITE_MAP } from './urls.mjs';

// The Speculation Rules block every pre-rendered page carries (prerender static pages, prefetch game pages).
// Shared with the encyclopedia so a hover behaves the same wherever the link sits; left out if that module goes.
let speculationTag = '';
try {
  ({ speculationTag } = await import('../encyclopedia/speculation.mjs'));
} catch {
  console.error('warning: tools/encyclopedia/speculation.mjs not found; reference pages carry no speculation rules');
}
export { speculationTag };

export const WORDMARK = `<a class="wordmark" href="/" aria-label="World Survey, play the game"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.5"/><path d="M3.5 16h25M16 3.5c-4 3.6-6 7.8-6 12.5s2 8.9 6 12.5M16 3.5c4 3.6 6 7.8 6 12.5s-2 8.9-6 12.5"/><path class="tri" d="M16 11.5l3.6 6.3h-7.2z"/></svg><span>World Survey</span></a>`;
export const ICON = {
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c-2.8 2.4-4.2 5.2-4.2 8.5s1.4 6.1 4.2 8.5M12 3.5c2.8 2.4 4.2 5.2 4.2 8.5s-1.4 6.1-4.2 8.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5l11 6.5-11 6.5z"/></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 21V4M5.5 4.5h12l-2.5 4 2.5 4h-12"/></svg>',
};

export const regionUrl = (r) => `/countries/${slug(r)}/`;

// `assets` carries the versioned URLs of reference.css / reference.js (content hash, so a deploy is never stale).
export function head({ title, desc, url, jsonld, type = 'website', assets, script = false }) {
  const ld = JSON.stringify(jsonld).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}">
<meta name="theme-color" content="#f4f5f0">
<meta name="color-scheme" content="light">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="World Survey">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${url}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/assets/og.png">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/encyclopedia.css">${assets?.css ? `\n<link rel="stylesheet" href="${assets.css}">` : ''}
<script type="application/ld+json">${ld}</script>${speculationTag ? `\n${speculationTag}` : ''}${script && assets?.js ? `\n<script src="${assets.js}" defer></script>` : ''}
<script src="/assets/analytics.js" defer></script>
</head>
<body>
<div class="neat" aria-hidden="true"></div>`;
}

// The country pages' masthead: Countries and the five regions. Lists and Compare are reached from the
// breadcrumbs and the footer, as on every other static page.
const MAST_NAV = [['Countries', '/countries/'], ...REGIONS.map((r) => [r, regionUrl(r)])];
export function mast(current) {
  const nav = MAST_NAV.map(([t, u]) => `<a href="${u}"${current === u ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  return `<header class="mast">${WORDMARK}<nav aria-label="Atlas">${nav}</nav><a class="btn play" href="/">${ICON.play}Play</a></header>`;
}

// The footer is the same on every static page, so it marks no link as current.
const FOOT_NAV = [['Countries', '/countries/'], ['Lists', LISTS_INDEX], ['Compare', COMPARE_INDEX], ['Learn', '/learn/'], ['Atlas', '/atlas/'], ['Play', '/'], ['About', '/about/'], ['Site map', SITE_MAP]];
export const colophon = `<footer class="colophon"><nav class="foot" aria-label="World Survey">${FOOT_NAV.map(([t, u]) => `<a href="${u}">${t}</a>`).join('')}</nav><p>World Survey, a geography game on a 3D globe. Made by <a href="https://aimantas.com/">Aimantas</a>.</p></footer>
</body>
</html>
`;

export function crumbs(items) {
  const li = items.map(([name, url], i) => (i === items.length - 1 ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${url}">${esc(name)}</a></li>`)).join('');
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${li}</ol></nav>`;
}
export const breadcrumbLd = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + url })),
});

export const webSite = { '@type': 'WebSite', name: 'World Survey', url: `${SITE}/` };
export const author = { '@type': 'Person', name: 'Aimantas', url: 'https://aimantas.com/' };

// Sources footer, the same shape as on the country pages.
export const sourcesFooter = (items) => `<footer class="sources measure"><h2 class="h2">Sources</h2><ul>${items.filter(Boolean).map((x) => `<li>${x}</li>`).join('')}</ul></footer>`;
export const srcLink = (s) => `<a href="${s.url}">${esc(s.name)}</a>`;
export const licLink = (s) => (s.licenceUrl ? `<span>(<a href="${s.licenceUrl}">${esc(s.licence)}</a>)</span>` : `<span>(${esc(s.licence)})</span>`);
