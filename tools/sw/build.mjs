// Writes dist/sw.js: the service worker with the list of files the game needs to start offline
// and a version made from their contents, so the worker only changes when the game does.
// Usage: node tools/sw/build.mjs <outDir>   (run last, after every other build step)
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[2] || 'dist');

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
const rel = (p) => `/${path.relative(OUT, p).split(path.sep).join('/')}`;
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

// What a cold, offline start needs: the shell, the code, the data, the type, the 2k maps and the flags.
const core = ['/'];
for (const p of ['/styles.css', '/data/countries.json', '/data/world.json', '/manifest.webmanifest', '/assets/icon.svg',
  '/assets/relief-2k.webp', '/assets/elevation-2k.png', '/assets/coast-sdf-2k.png']) {
  if (await exists(path.join(OUT, p))) core.push(p);
}
for (const dir of ['src', 'vendor', 'assets/fonts', 'assets/flags', 'assets/icons']) {
  if (!(await exists(path.join(OUT, dir)))) continue;
  for (const p of await walk(path.join(OUT, dir))) {
    if (/\.(js|woff2|svg|png)$/.test(p)) core.push(rel(p));
  }
}
core.sort();

const hash = createHash('sha256');
let bytes = 0;
for (const url of core) {
  const buf = await readFile(path.join(OUT, url === '/' ? 'index.html' : url));
  bytes += buf.length;
  hash.update(url).update(buf);
}
const version = hash.digest('hex').slice(0, 12);
const template = await readFile(path.join(HERE, 'sw.template.js'), 'utf8');
await writeFile(path.join(OUT, 'sw.js'), template.replace('__VERSION__', version).replace('__CORE__', JSON.stringify(core)));
console.log(`sw: ${core.length} files precached (${(bytes / 1e6).toFixed(2)} MB), version ${version}`);
