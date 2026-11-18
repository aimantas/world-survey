// Regional detail elevation (about 2.2 km pixels) for the close zoom. 10° tiles from
// tools/elevation-hires.mjs are fetched and decoded in a worker only while the camera is zoomed in,
// written into slots of one R16F atlas texture, and found by the surface shader through a tiny
// indirection texture (one texel per tile: slot + fade-in). Least recently needed tiles are evicted.
import { DataTexture, RedFormat, RGBAFormat, HalfFloatType, UnsignedByteType, NearestFilter, LinearFilter, LinearMipmapLinearFilter, ClampToEdgeWrapping, Vector4 } from './three.js';
import { DETAIL_GRID, DETAIL_TILES } from './detail-index.js';

const FADE_S = 0.45;

export class DetailElevation {
  // slotsX x slotsY slots of DETAIL_GRID.size px each
  constructor(renderer, { assetBase = '', slotsX = 8, slotsY = 8 } = {}) {
    this.renderer = renderer;
    this.gl = renderer.getContext();
    this.assetBase = assetBase;
    const G = DETAIL_GRID;
    this.grid = G;
    this.slotsX = slotsX; this.slotsY = slotsY;
    this.ok = typeof DecompressionStream === 'function' && typeof Worker === 'function' && DETAIL_TILES.length > 0;
    this.files = new Map(DETAIL_TILES.map(([c, r, bytes, file]) => [r * G.cols + c, { c, r, bytes, file }]));

    const W = slotsX * G.size, H = slotsY * G.size;
    this.mips = renderer.extensions.has('EXT_color_buffer_float'); // R16F mip generation needs it renderable
    const atlas = new DataTexture(null, W, H, RedFormat, HalfFloatType);
    atlas.source.dataReady = false; // storage only; slots are filled with texSubImage2D
    atlas.minFilter = this.mips ? LinearMipmapLinearFilter : LinearFilter;
    atlas.magFilter = LinearFilter;
    atlas.generateMipmaps = this.mips;
    atlas.wrapS = atlas.wrapT = ClampToEdgeWrapping;
    atlas.flipY = false;
    atlas.needsUpdate = true;
    this.atlas = atlas;

    this._idx = new Uint8Array(G.cols * G.rows * 4);
    this.index = new DataTexture(this._idx, G.cols, G.rows, RGBAFormat, UnsignedByteType);
    this.index.minFilter = this.index.magFilter = NearestFilter;
    this.index.needsUpdate = true;

    // shader uniforms: grid (cols, rows, content px, gutter px), atlas (slots across, slot px, 1/W, 1/H)
    this.uGrid = new Vector4(G.cols, G.rows, G.content, G.gutter);
    this.uAtlas = new Vector4(slotsX, G.size, 1 / W, 1 / H);

    this.slots = Array.from({ length: slotsX * slotsY }, (_, i) => ({ i, key: -1, used: -1, alpha: 0 }));
    this.bySlotKey = new Map();     // key -> slot (resident)
    this.pending = new Map();       // key -> request id
    this.failed = new Set();
    this.queue = [];                // keys wanted, best first
    this.maxInFlight = 4;
    this.loadedBytes = 0;
    this.loadedTiles = 0;
    this._seq = 0;
    this._fading = false;
    this._wanted = new Set();
    this._t = 0;
  }

  // Must be called once the renderer can upload (after the first compile).
  _ensureInit() {
    if (this._glTex || !this.ok) return !!this._glTex;
    this.renderer.initTexture(this.atlas);
    this._glTex = this.renderer.properties.get(this.atlas).__webglTexture;
    if (!this._glTex) { this.ok = false; return false; }
    try {
      this.worker = new Worker(new URL('./detail-worker.js', import.meta.url));
      this.worker.onmessage = (e) => this._onTile(e.data);
      this.worker.onerror = (e) => { console.warn('Globe: detail worker failed', e.message); this.ok = false; };
    } catch (e) { console.warn('Globe: detail worker unavailable', e); this.ok = false; return false; }
    return true;
  }

  has(c, r) { return this.files.has(r * this.grid.cols + c); }
  keyOf(c, r) { return r * this.grid.cols + c; }

  // keys: tile keys in priority order (nearest the view centre first). Only these are loaded; resident
  // tiles not in the list stay until their slot is needed.
  want(keys, time) {
    if (!this.ok) return;
    this._t = time;
    this._wanted = new Set(keys);
    this.queue = [];
    for (const k of keys) {
      if (!this.files.has(k) || this.failed.has(k)) continue;
      const s = this.bySlotKey.get(k);
      if (s) { s.used = time; continue; }
      if (!this.pending.has(k)) this.queue.push(k);
    }
    this._pump();
  }

  _pump() {
    if (!this.queue.length || !this._ensureInit()) return;
    while (this.pending.size < this.maxInFlight && this.queue.length) {
      const key = this.queue.shift();
      // never evict a tile that the current view needs, and keep one slot per in-flight request
      const free = this._freeSlots();
      if (free <= this.pending.size) break;
      const id = ++this._seq;
      this.pending.set(key, id);
      const f = this.files.get(key);
      this.worker.postMessage({ id, key, url: new URL(`${this.assetBase}assets/${f.file}`, location.href).href, encoding: this.grid });
    }
  }
  _freeSlots() {
    let n = 0;
    for (const s of this.slots) if (s.key < 0 || !this._wanted.has(s.key)) n++;
    return n;
  }
  _takeSlot() {
    let best = null;
    for (const s of this.slots) {
      if (s.key < 0) return s;
      if (this._wanted.has(s.key)) continue;
      if (!best || s.used < best.used) best = s;
    }
    return best;
  }

  _onTile(msg) {
    let key = -1;
    for (const [k, id] of this.pending) if (id === msg.id) { key = k; break; }
    if (key < 0) return;
    this.pending.delete(key);
    if (msg.error) {
      console.warn('Globe: detail tile failed', msg.error);
      this.failed.add(key);
      this._pump();
      return;
    }
    const slot = this._takeSlot();
    if (!slot) { this._pump(); return; }
    if (slot.key >= 0) { this.bySlotKey.delete(slot.key); this._setIndex(slot.key, 0, 0); }
    const G = this.grid;
    const gl = this.gl;
    const x = (slot.i % this.slotsX) * G.size, y = Math.floor(slot.i / this.slotsX) * G.size;
    this.renderer.state.bindTexture(gl.TEXTURE_2D, this._glTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, msg.width, msg.height, gl.RED, gl.HALF_FLOAT, msg.half);
    if (this.mips) gl.generateMipmap(gl.TEXTURE_2D);
    slot.key = key; slot.used = this._t; slot.alpha = 0;
    this.bySlotKey.set(key, slot);
    this._setIndex(key, slot.i + 1, 0);
    this._fading = true;
    this.loadedBytes += msg.bytes; this.loadedTiles++;
    this.onLoad?.();
    this._pump();
  }

  _setIndex(key, slotPlus1, alpha) {
    const o = key * 4;
    this._idx[o] = slotPlus1; this._idx[o + 1] = Math.round(alpha * 255);
    this.index.needsUpdate = true;
  }

  // advance fade-ins; returns true while something is still fading (keep rendering)
  tick(dt, reduced) {
    if (!this._fading) return false;
    let any = false;
    for (const s of this.slots) {
      if (s.key < 0 || s.alpha >= 1) continue;
      s.alpha = reduced ? 1 : Math.min(1, s.alpha + dt / FADE_S);
      this._setIndex(s.key, s.i + 1, s.alpha);
      if (s.alpha < 1) any = true;
    }
    this._fading = any;
    return true;
  }

  busy() { return this.pending.size > 0 || this.queue.length > 0 || this._fading; }
  stats() {
    return { resident: this.bySlotKey.size, slots: this.slots.length, pending: this.pending.size, queued: this.queue.length, loadedTiles: this.loadedTiles, loadedBytes: this.loadedBytes, mips: this.mips };
  }

  dispose() {
    this.worker?.terminate();
    this.atlas.dispose();
    this.index.dispose();
  }
}
