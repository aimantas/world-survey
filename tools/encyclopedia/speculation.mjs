// Speculation Rules for every pre-rendered page: the encyclopedia pages and the route shells (tools/seo)
// emit this same block, so a hover behaves the same wherever the link sits.
//
//   prerender (moderate)  links to other static pages: /countries/, /lists/, /compare/, /sitemap/. Plain HTML,
//                         so rendering one ahead of the click is cheap and makes the navigation instant.
//   prefetch (moderate)   links into the game: / and every top-level section in src/routes.js (/play/, /atlas/,
//                         /learn/ ...). Only the HTML is fetched; prerendering a WebGL globe on hover would
//                         cost far more than it saves.
//
// It is a JSON data block, not script: browsers without the API ignore it, and the site's CSP
// (script-src 'self' 'unsafe-inline') allows it inline.
import { ROUTES } from '../../src/routes.js';

export const STATIC_SECTIONS = ['countries', 'lists', 'compare', 'sitemap'];
export const GAME_SECTIONS = [...new Set(ROUTES.map((r) => r.path.split('/')[1]).filter(Boolean))].sort();
for (const s of GAME_SECTIONS) if (STATIC_SECTIONS.includes(s)) throw new Error(`route section /${s}/ collides with a static section`);

export const SPECULATION_RULES = {
  prerender: [{ where: { href_matches: STATIC_SECTIONS.map((s) => `/${s}/*`) }, eagerness: 'moderate' }],
  prefetch: [{ where: { href_matches: ['/', ...GAME_SECTIONS.map((s) => `/${s}/*`)] }, eagerness: 'moderate' }],
};

export const speculationTag = `<script type="speculationrules">${JSON.stringify(SPECULATION_RULES)}</script>`;
