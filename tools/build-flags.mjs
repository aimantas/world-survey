// assets/flags/<iso2>.svg from flag-icons (MIT), 4x3, optimised with svgo preset-default.
// Each optimised flag is rasterised next to its original and compared; if the render differs, the
// original file is kept instead.
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { optimize } from 'svgo';
import sharp from 'sharp';
import { nm } from './build-world.mjs';

async function render(svg) {
  return sharp(Buffer.from(svg), { density: 96 }).resize(160, 120, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
}

function diff(a, b) {
  let max = 0, sum = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; if (d > max) max = d; }
  return { max, mean: sum / a.length };
}

export async function buildFlags(countries, outDir) {
  await mkdir(outDir, { recursive: true });
  const wanted = new Map();
  for (const c of countries) if (c.flag) wanted.set(path.basename(c.flag), c.iso3);
  // Remove flags no longer referenced (keeps the folder an exact mirror of countries.json).
  for (const f of await readdir(outDir)) if (f.endsWith('.svg') && !wanted.has(f)) await unlink(path.join(outDir, f));
  const report = { written: 0, bytesIn: 0, bytesOut: 0, keptOriginal: [] };
  for (const file of wanted.keys()) {
    const src = await readFile(nm(`flag-icons/flags/4x3/${file}`), 'utf8');
    const { data } = optimize(src, { multipass: true, plugins: ['preset-default'] });
    let out = data;
    const d = diff(await render(src), await render(data));
    if (d.max > 8 || d.mean > 0.05) { out = src; report.keptOriginal.push(`${file} (max ${d.max}, mean ${d.mean.toFixed(3)})`); }
    await writeFile(path.join(outDir, file), out);
    report.written++; report.bytesIn += Buffer.byteLength(src); report.bytesOut += Buffer.byteLength(out);
  }
  return report;
}
