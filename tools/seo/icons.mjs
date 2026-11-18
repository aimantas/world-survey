// PNG and ICO icons for World Survey, rendered once from assets/icon.svg into assets/icons/ (checked in, so the
// build only copies them). Run again only when the SVG changes:
//
//   node tools/seo/icons.mjs
//
// icon-192.png, icon-512.png     the SVG as drawn: rounded paper tile, transparent corners (manifest "any")
// icon-maskable-512.png          full-bleed paper square, artwork scaled to 80% so it sits inside the
//                                maskable safe zone (a circle of 40% radius) on every launcher mask
// apple-touch-icon.png (180)     full-bleed, opaque: iOS fills transparent corners with black and rounds the
//                                square itself, so the tile corners are not drawn
// favicon.ico (16, 32, 48)       PNG-compressed ICO entries for /favicon.ico requests
//
// sharp comes from tools/node_modules (cd tools && npm ci --ignore-scripts). Same SVG in, same bytes out.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(ROOT, 'assets', 'icons');
const PAPER = '#f4f5f0';

const svg = await readFile(path.join(ROOT, 'assets', 'icon.svg'), 'utf8');
const box = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
if (!box || box[1] !== box[2]) throw new Error('assets/icon.svg: expected a square viewBox "0 0 N N"');
const N = Number(box[1]);

// The artwork without its rounded tile, on a full-bleed square, scaled about the centre.
const inner = svg.replace(/^\s*<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect\b[^>]*\/>/, '');
const fullBleed = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}"><rect width="${N}" height="${N}" fill="${PAPER}"/>` +
  `<g transform="translate(${N / 2} ${N / 2}) scale(${scale}) translate(${-N / 2} ${-N / 2})">${inner}</g></svg>`;

// Rasterise the vector at the target size (density scales the SVG's own units), not a small bitmap scaled up.
const png = (source, size, { flatten = false } = {}) => {
  let img = sharp(Buffer.from(source), { density: (72 * size) / N }).resize(size, size, { fit: 'fill' });
  if (flatten) img = img.flatten({ background: PAPER });
  return img.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
};

// ICO with PNG entries (supported by every current browser).
function ico(entries) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = head.length + dir.length;
  entries.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); // no palette
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); // colour planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, dir, ...entries.map((e) => e.buf)]);
}

await mkdir(OUT, { recursive: true });
const files = [
  ['icon-192.png', await png(svg, 192)],
  ['icon-512.png', await png(svg, 512)],
  ['icon-maskable-512.png', await png(fullBleed(0.8), 512, { flatten: true })],
  ['apple-touch-icon.png', await png(fullBleed(0.88), 180, { flatten: true })],
  ['favicon.ico', ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await png(svg, size) }))))],
];
for (const [name, buf] of files) {
  await writeFile(path.join(OUT, name), buf);
  console.log(`assets/icons/${name}  ${(buf.length / 1024).toFixed(1)} KB`);
}
