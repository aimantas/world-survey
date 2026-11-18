// Classic worker: fetches one detail elevation tile (16-bit greyscale PNG, see tools/elevation-hires.mjs)
// and returns it as half floats in metres, ready for a single texSubImage2D into the R16F atlas.
// Own PNG decoder (zlib via DecompressionStream + scanline unfiltering) because browsers decode 16-bit
// PNGs to 8 bits in canvas and ImageBitmap.

let LUT = null; // 16-bit code -> half-float bits of metres
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function toHalf(v) {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  const e = ((x >>> 23) & 0xff) - 112; // rebias 127 -> 15
  const m = x & 0x7fffff;
  if (e <= 0) return e < -10 ? sign : sign | ((((m | 0x800000) >> (1 - e)) + 0x1000) >> 13);
  if (e >= 31) return sign | 0x7c00;
  return sign | ((e << 10) + ((m + 0x1000) >> 13)); // a rounding carry bumps the exponent correctly
}
// encoding from detail-index.js: 'log' (code = zero + sign(m) ln(1 + |m| k / s0) / k)
function buildLut(enc) {
  const lut = new Uint16Array(65536);
  for (let v = 0; v < 65536; v++) {
    const d = v - enc.zero;
    const m = Math.sign(d) * (Math.exp(Math.abs(d) * enc.k) - 1) * enc.s0 / enc.k;
    lut[v] = toHalf(Math.max(-1e4, Math.min(6e4, m)));
  }
  return lut;
}

async function inflate(bytes) {
  const ds = new DecompressionStream('deflate');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

async function decodePng16(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  let idatLen = 0;
  while (off < buf.length) {
    const len = dv.getUint32(off);
    const tag = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (tag === 'IHDR') {
      width = dv.getUint32(off + 8); height = dv.getUint32(off + 12);
      depth = buf[off + 16]; type = buf[off + 17]; interlace = buf[off + 20];
    } else if (tag === 'IDAT') { idat.push(body); idatLen += len; }
    else if (tag === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 16 || type !== 0 || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const z = new Uint8Array(idatLen);
  let p = 0;
  for (const c of idat) { z.set(c, p); p += c.length; }
  const raw = await inflate(z);
  const bpp = 2, stride = width * bpp;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride, prev = dst - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = y > 0 ? out[prev + i] : 0;
      const c = i >= bpp && y > 0 ? out[prev + i - bpp] : 0;
      let v;
      switch (f) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: throw new Error(`bad PNG filter ${f}`);
      }
      out[dst + i] = v & 255;
    }
  }
  return { width, height, data: out };
}

self.onmessage = async (e) => {
  const { id, url, encoding } = e.data;
  try {
    if (!LUT) LUT = buildLut(encoding);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const { width, height, data } = await decodePng16(buf);
    const half = new Uint16Array(width * height);
    for (let i = 0, j = 0; i < half.length; i++, j += 2) half[i] = LUT[(data[j] << 8) | data[j + 1]];
    self.postMessage({ id, width, height, half, bytes: buf.length }, [half.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
