// IndexNow: tells the search engines that take part (Bing, Yandex, Naver, Seznam and others) which URLs of
// World Survey are new or changed, so they need not wait for a crawl.
//
//   node tools/seo/indexnow.mjs <dist>                       dry run: prints the request, sends nothing
//   node tools/seo/indexnow.mjs <dist> --since=2026-11-10    only URLs whose sitemap lastmod is that day or later
//   node tools/seo/indexnow.mjs <dist> --send                POSTs the URL list to api.indexnow.org
//
// Nothing in the build calls this script, and without --send it never touches the network. Submitting is the
// site owner's decision: run it with --send only after the same <dist> has been deployed, because IndexNow
// checks the key by fetching https://geography.aimantas.com/<key>.txt, the file tools/seo/build.mjs writes.
//
// The key lives in tools/seo/indexnow-key.txt. It is not a secret: the protocol publishes it at the site
// root, and it only proves that whoever submits a URL also controls the site.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../../src/routes.js';

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS = 10000; // per request, by the protocol

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const outArg = argv.find((a) => !a.startsWith('--'));
const SEND = argv.includes('--send');
const since = argv.find((a) => a.startsWith('--since='))?.slice(8) ?? null;
const unknown = argv.filter((a) => a.startsWith('--') && a !== '--send' && !a.startsWith('--since='));
const stop = (msg) => { console.error(`indexnow: ${msg}`); process.exit(1); };
if (!outArg || unknown.length) {
  console.error(`usage: node tools/seo/indexnow.mjs <dist> [--since=YYYY-MM-DD] [--send]${unknown.length ? `\nunknown option: ${unknown.join(' ')}` : ''}`);
  process.exit(2);
}
if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) stop('--since takes a date as YYYY-MM-DD');
const OUT = path.resolve(process.cwd(), outArg);
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

// ---------- The key, and the key file the build put in <dist> ----------
const keyFile = path.join(HERE, 'indexnow-key.txt');
if (!(await exists(keyFile))) stop('tools/seo/indexnow-key.txt is missing');
const key = (await readFile(keyFile, 'utf8')).trim();
if (!/^[a-f0-9]{32}$/.test(key)) stop('tools/seo/indexnow-key.txt must hold one 32-character hexadecimal key');
const served = path.join(OUT, `${key}.txt`);
if (!(await exists(served)) || (await readFile(served, 'utf8')).trim() !== key) stop(`${path.relative(process.cwd(), served)} is missing or does not hold the key; run tools/seo/build.mjs on this folder first`);

// ---------- The URL list, from the built sitemap ----------
const sitemapFile = path.join(OUT, 'sitemap.xml');
if (!(await exists(sitemapFile))) stop(`${path.relative(process.cwd(), sitemapFile)} not found`);
const entries = [...(await readFile(sitemapFile, 'utf8')).matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
  loc: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1]?.replace(/&amp;/g, '&'),
  lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? '',
})).filter((e) => e.loc);
if (!entries.length) stop('the sitemap lists no URLs');
const host = new URL(SITE).host;
const offSite = entries.filter((e) => new URL(e.loc).host !== host);
if (offSite.length) stop(`the sitemap lists URLs on another host: ${offSite[0].loc}`);
const urlList = entries.filter((e) => !since || e.lastmod >= since).map((e) => e.loc);
if (!urlList.length) stop(`no URL in the sitemap has a lastmod of ${since} or later`);

// One request per 10,000 URLs; this site needs one.
const requests = [];
for (let i = 0; i < urlList.length; i += MAX_URLS) {
  requests.push({ host, key, keyLocation: `${SITE}/${key}.txt`, urlList: urlList.slice(i, i + MAX_URLS) });
}

console.log(`IndexNow ${SEND ? 'submission' : 'dry run'} for ${host}`);
console.log(`  sitemap:      ${path.relative(process.cwd(), sitemapFile)} (${entries.length} URLs${since ? `, ${urlList.length} with lastmod ${since} or later` : ''})`);
console.log(`  endpoint:     POST ${ENDPOINT}`);
console.log('  content type: application/json; charset=utf-8');
console.log(`  key location: ${SITE}/${key}.txt`);
console.log(`  requests:     ${requests.length} (${urlList.length} URLs)`);
const sample = urlList.length > 8 ? [...urlList.slice(0, 5), `… ${urlList.length - 7} more …`, ...urlList.slice(-2)] : urlList;
console.log(`  body:         {"host":"${host}","key":"${key}","keyLocation":"${SITE}/${key}.txt","urlList":[`);
for (const u of sample) console.log(`                  ${u}`);
console.log('                ]}');

if (!SEND) {
  console.log('\nDry run: nothing was sent. After this build is deployed, add --send to submit.');
  process.exit(0);
}

// ---------- Send (only with --send) ----------
// The live site must already serve the key, or every request is rejected with 403.
let live = null;
try {
  const r = await fetch(`${SITE}/${key}.txt`, { redirect: 'follow' });
  live = r.ok ? (await r.text()).trim() : `HTTP ${r.status}`;
} catch (e) { live = e.message; }
if (live !== key) stop(`the live site does not serve the key at ${SITE}/${key}.txt (${String(live).slice(0, 60)}); deploy this build first`);

const MEANING = {
  200: 'accepted',
  202: 'received; the key is still being checked',
  400: 'bad request: the body is not in the expected format',
  403: 'forbidden: the key is not valid for this host',
  422: 'unprocessable: URLs do not belong to the host, or the key does not match the protocol',
  429: 'too many requests: wait before submitting again',
};
let failed = false;
for (const [i, body] of requests.entries()) {
  const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
  console.log(`request ${i + 1} of ${requests.length}: ${body.urlList.length} URLs, HTTP ${r.status} (${MEANING[r.status] ?? 'unexpected status'})`);
  if (r.status !== 200 && r.status !== 202) failed = true;
}
process.exit(failed ? 1 : 0);
