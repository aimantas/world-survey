// World Survey globe engine (three.js r170, vendored). Public API below.
//
//   const globe = new Globe(container, { data, quality: 'auto' })   // data from src/data.js loadData()
//   await globe.ready                       // 2k textures loaded (or fallbacks), maps baked, first frame drawn
//
// Events  globe.on(name, fn) -> unsubscribe fn;  globe.off(name, fn)
//   'hover'     ({ iso3, latLng, screen })        once per frame at most, while interactive and the pointer
//                                                 moves (or the camera moves under it). iso3 null over sea;
//                                                 latLng null off the globe.
//   'pick'      ({ iso3, latLng, screen, tiny, under })   click / tap without drag (4 px mouse / 9 px touch
//                                                 slop). `tiny` = hit through a tiny-country tap radius (13 px
//                                                 mouse, 22 px touch); `under` = polygon under the pointer.
//                                                 screen = { x, y } CSS px inside the container.
//   'longpress' (same payload as pick)            press held ~0.5 s without moving (pick is then suppressed).
//   'view'      ({ center: [lat, lng], kmPerPx, distance, heading, tilt })   once per frame when the camera
//                                                 changed. center = point under the globe's visual centre,
//                                                 kmPerPx = ground km per CSS px there (across the screen),
//                                                 distance = zoom as camera distance in globe radii (centre to
//                                                 camera when tilt is 0; under tilt it stays 1 + the camera's
//                                                 distance to the centre point, so it round-trips through
//                                                 flyTo). heading = degrees, 0 = north up, clockwise positive,
//                                                 in (-180, 180] (the bearing at the top of the screen).
//                                                 tilt = pitch in degrees (0 = straight down).
//   'quality'   ({ quality })                     auto tier changed (adaptive drop to 'low' on slow frames).
//   'frame'     ({ dt, calls, triangles })        after every rendered frame (payload object is reused).
//
// Methods
//   setInteractive(bool)                 picking + hover tint
//   setHover(iso3|null)                  manual hover tint (wins over the pointer hover)
//   flyTo({ iso3 } | { latLng, distance? }, { duration?: ms, heading?: deg }) -> Promise<{ completed }>
//                                        keeps the current heading unless `heading` is given (in the options
//                                        or on the target); the turn eases with the flight.
//                                        distance = camera distance from the globe centre in globe radii (as in
//                                        getView().distance); omitted = keep the current zoom. No-bbox countries
//                                        (TUV) frame ~6° around labelLatLng.
//                                        great-circle move, zooms out mid-flight on long hops, fits the
//                                        country bbox inside the free area left by setViewOffset. Never rejects;
//                                        resolves { completed: false } if interrupted by input or another fly.
//   highlight(iso3, 'target'|'correct'|'wrong'|'focus'|'neighbour')   tiny countries and countries without a
//                                        polygon also get a ring target. Calling it again restyles the country.
//   clearHighlights()
//   dropPin([lat, lng], 'guess'|'answer'|'capital') -> id
//   drawArc([lat, lng], [lat, lng], { label?, duration?: ms }) -> id
//   clearMarks()                         pins, arcs and arc labels
//   setSurveyed(map|null, { animate? })  map: Map or object iso3 -> 0..3 mastery. First call is instant,
//                                        later calls spread the colour out from each country's label point.
//                                        null = survey mode off (all land in full colour, the default).
//   setRegionFocus(region|null) -> Promise   dims land outside the region and frames it
//   showLabels([{ iso3, text?, latLng?, strong? }] | 'auto' | null)
//   idle(bool)                           slow rotation (ignored under prefers-reduced-motion)
//   setQuality('low'|'high'|'auto')
//   dispose()
// Additions
//   setViewOffset({ x, y }, { animate = true })   shift the globe's visual centre in CSS px (x right, y down);
//                                        flyTo / overview / region framing fit the remaining area.
//   getView() -> { center, kmPerPx, distance, heading, tilt }
//   distanceForSpan(km), overviewDistance()   camera distances for framing within the free area
//   overview({ duration?, heading? }) -> Promise   fly out to the whole-globe view, keeping the centre
//                                        (and the heading unless `heading` is given)
//   setControls(bool)                    enable / disable drag, zoom and keyboard camera input
//   setOceanLabels(bool), setTinyMarkers(bool)
//   project([lat, lng]) -> { x, y, visible }   CSS px inside the container
//   countryAt(lat, lng) -> iso3|null     antimeridian-safe lookup used by picking (data.countryAt's planar
//                                        test misreads the stitched RUS / FJI / ATA rings)
//   invalidate()                         request a frame (rendering is on demand)
//   renderer, info (renderer.info.render), quality, device   read-only, for diagnostics
// Heading and tilt (2026-11-04)
//   setHeading(deg, { duration? }) -> Promise<{ completed }>   eased turn so bearing `deg` is up (shortest way;
//                                        default 320-900 ms by angle; instant under reduced motion or
//                                        duration 0). Interrupted (completed: false) by rotate input, a
//                                        flight with a heading, or another turn.
//   resetNorth({ duration? }) -> Promise  setHeading(0)
//   setAutoTilt(bool)                    automatic pitch when zoomed in (default on, option autoTilt): 0° at
//                                        6 km/px easing to 35° near the closest zoom, always limited so every
//                                        viewport corner still looks at the ground (no horizon, limb or paper
//                                        behind the globe). Turning it off eases back to straight down.
//   heading, tilt                        read-only properties (degrees)
//   Input: Q / E turn (with inertia), right-drag or ctrl / alt + drag turns the sheet around the view
//   centre (right / ctrl / alt clicks never pick; the canvas has no context menu while controls are on),
//   two-finger rotate on touch (engages after 7°, pivots on the fingers). Drag, pinch-pan and arrow keys
//   follow the turned map. Light stays at the screen's upper left (cartographic convention).
// Realism (2026-11-04)
//   detail                               DetailElevation (detail.js) or null: 2.2 km regional elevation tiles
//                                        (assets/elevation-18k-*.png, index in detail-index.js) fetched in a
//                                        worker only below ~5 km per CSS px, nearest the view first; drive a
//                                        crisp hillshade, survey contours (500 / 200 / 100 m, index every 5th,
//                                        contour brown; blue on ice, grey on the unsurveyed plate) and a rock
//                                        micro-relief (desktop). detail.stats() -> { resident, loadedTiles,
//                                        loadedBytes, ... }; detail.busy() while tiles load or fade in.
//   Ocean depth tint from the coast distance field and a soft view-dependent sheen; pale printed halo
//   outside the limb (frame.js); relief exaggeration eases from x22 (overview) to x9 when zoomed in.
//   Adaptive: on 'auto', sustained missed frames above DPR 1.5 first render at DPR 1.5, then (as before)
//   sustained slow frames drop to 'low'. The low tier has no detail tiles, contours or micro-relief.
//
// Options: { data, quality = 'auto', assetBase = '', intro = true, oceanLabels = true, tinyMarkers = true,
//            keyboard = true, autoTilt = true, initialView = { lat: 22, lng: 12 } }
// The container needs a size; the globe fills it with a transparent canvas plus an HTML label layer.
// Label CSS (classes globe-label, globe-label--ocean, globe-arc-label) is injected at the start of <head>
// so page styles override it.

import {
  WebGLRenderer, Scene, PerspectiveCamera, Vector2, Vector3, Raycaster, Sphere, DataTexture, Texture,
  RGBAFormat, FloatType, NearestFilter, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, ClampToEdgeWrapping,
  SRGBColorSpace, NoColorSpace, RedFormat, InstancedBufferGeometry, Quaternion,
} from './three.js';
import {
  DEG, EARTH_KM, latLngToVec3, vec3ToLatLng, wrapLng, slerpUnit, angleBetween, bboxFrame,
  clamp, lerp, easeInOutCubic, easeInOutSine, easeOutCubic,
} from './util.js';
import { detectDevice, qualityParams } from './quality.js';
import { createSurface, cubeSphereGeometry, defineSet } from './surface.js';
import { bakeCountryMaps } from './bake.js';
import { createLineMaterial, createLineMesh, SegmentBuffer, pushPolyline, MAX_SLOTS } from './lines.js';
import { Highlights } from './highlights.js';
import { Sprites, SHAPE } from './sprites.js';
import { createFrame } from './frame.js';
import { Labels, injectStyle } from './labels.js';
import { CountryLookup } from './rings.js';
import { DetailElevation } from './detail.js';

const FOV = 30;
const TAN_HALF = Math.tan((FOV / 2) * DEG);
const DISP = 22 * (8.848 / EARTH_KM);     // relief exaggeration x22 (world units for elevation^2 = 1)
const PALETTE_W = 1024;
const SURVEY_LEVELS = [0, 0.72, 0.88, 1];
const AUTO_TILT_MAX = 35;      // degrees of pitch at the closest zoom
const TILT_FROM_KM = 6;        // auto tilt starts below this many km per CSS px ...
const TILT_FULL_KM = 0.8;      // ... and reaches AUTO_TILT_MAX here
const DETAIL_LOAD_KM = 5.2;    // regional elevation tiles load below this km per CSS px
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

const BASE_STYLES = [
  { color: '#2b6e98', width: 0.95, pattern: 0 },             // 0 coastline: thin blue ink
  { color: '#5b3654', width: 1.2, pattern: 1 },              // 1 international boundary: dash-dot brown-violet
];
const ARC_STYLES = [{ color: '#c3177b', width: 2.0, halo: 1.3, pattern: 2 }];

const REGION_FRAMES = {
  Europe: { lat: 53, lng: 15, halfLat: 17, halfLng: 19 },
  Asia: { lat: 33, lng: 88, halfLat: 30, halfLng: 40 },
  Africa: { lat: 2, lng: 18, halfLat: 36, halfLng: 34 },
  Americas: { lat: 10, lng: -78, halfLat: 60, halfLng: 40 },
  Oceania: { lat: -18, lng: 160, halfLat: 26, halfLng: 34 },
  Antarctic: { lat: -78, lng: 20, halfLat: 14, halfLng: 30 },
};

export class Globe {
  constructor(container, opts = {}) {
    if (!opts.data) throw new Error('Globe: options.data (from loadData) is required');
    this.data = opts.data;
    this.opts = { quality: 'auto', assetBase: '', intro: true, oceanLabels: true, tinyMarkers: true, keyboard: true, autoTilt: true, ...opts };
    this.container = container;
    this._events = new Map();
    this._disposed = false;

    injectStyle();
    this.root = document.createElement('div');
    this.root.className = 'globe-root';
    container.appendChild(this.root);
    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Interactive globe. Drag to move, scroll or pinch to zoom, arrow keys to pan, Q and E or right-drag to turn the map.');
    this.root.appendChild(this.canvas);

    this.renderer = new WebGLRenderer({
      canvas: this.canvas, alpha: true, antialias: true, premultipliedAlpha: true,
      powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.info = this.renderer.info.render;
    this.device = detectDevice(this.renderer.getContext());
    this._qualityPref = this.opts.quality;
    this.quality = this._qualityPref === 'auto' ? (this.device.low ? 'low' : 'high') : this._qualityPref;
    this.params = qualityParams(this.quality, this.device);
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(FOV, 1, 0.01, 20);
    this.raycaster = new Raycaster();
    this._pickSphere = new Sphere(new Vector3(), 1.0015);

    // ---- shared uniforms (same objects referenced by every material) ----
    const black = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    black.needsUpdate = true;
    this._black = black;
    this.shared = {
      uElev: { value: black }, uElevSize: { value: new Vector2(2048, 1024) },
      uDisp: { value: DISP }, uElevLod: { value: this.params.elevLod }, uHasElev: { value: 0 },
      uRes: { value: new Vector2(1, 1) }, uDpr: { value: 1 }, uTime: { value: 0 },
      uPxPerUnit: { value: 100 }, uReduced: { value: 0 }, uLiftK: { value: 1 },
    };

    // ---- regional detail elevation (zoomed in only) ----
    this.detail = null;
    this._createDetail();

    // ---- surface ----
    this.surface = createSurface({ black }, this._surfaceParams(), this.shared);
    this._bindDetailUniforms();
    this.scene.add(this.surface.mesh);

    // ---- palette: rows 0 (sTo, hover, dim, progress), 1 (spread centre xyz, radius), 2 (sFrom) ----
    this._pal = new Float32Array(PALETTE_W * 3 * 4);
    this.palette = new DataTexture(this._pal, PALETTE_W, 3, RGBAFormat, FloatType);
    this.palette.minFilter = this.palette.magFilter = NearestFilter;
    this.palette.needsUpdate = true;
    this.surface.uniforms.uPalette.value = this.palette;

    // ---- line work, highlights, arcs, sprites, frame ----
    this.lineMaterial = createLineMaterial(this.shared, BASE_STYLES);
    this.lineMesh = createLineMesh(this.lineMaterial, new InstancedBufferGeometry(), 4);
    this.lineMesh.visible = false;
    this.scene.add(this.lineMesh);

    this.highlights = new Highlights(this.shared, this.data.shapes);
    this.scene.add(this.highlights.fill, this.highlights.outline, this.highlights.outlineCore);

    this.arcMaterial = createLineMaterial(this.shared, ARC_STYLES, { arc: true, pass: 'halo' });
    this.arcMaterial.uniforms.uSlot.value = new Array(MAX_SLOTS).fill(0);
    this.arcMaterial.uniforms.uTime = { value: 0 }; // own dash clock: only advances while arcs draw
    this.arcCoreMaterial = createLineMaterial(this.shared, ARC_STYLES, { arc: true, pass: 'core', uniforms: this.arcMaterial.uniforms });
    this.arcMesh = createLineMesh(this.arcMaterial, new InstancedBufferGeometry(), 6);
    this.arcCore = createLineMesh(this.arcCoreMaterial, this.arcMesh.geometry, 6.5);
    this.arcMesh.visible = this.arcCore.visible = false;
    this.scene.add(this.arcMesh, this.arcCore);
    this._arcs = []; // { id, slot, a, b, start, dur, label, mid }

    this.sprites = new Sprites(this.shared);
    this.scene.add(this.sprites.mesh);

    this.frame = createFrame();
    this.scene.add(this.frame.mesh);

    this.labels = new Labels(this.root);
    this.labels.setOceans(this.opts.oceanLabels);

    // ---- camera state ----
    const iv = this.opts.initialView || { lat: 22, lng: 12 };
    this.lat = iv.lat; this.lng = iv.lng;
    this.gap = 4; this.gapTarget = 4;
    this.heading = 0;                  // degrees, 0 = north up, clockwise positive (map turned so that bearing is up)
    this.tilt = 0;                     // degrees of pitch (0 = looking straight down)
    this._hVel = 0;                    // deg/s (Q / E, rotate gestures)
    this._headAnim = null;
    this._autoTilt = !!this.opts.autoTilt; this._tiltAmt = this._autoTilt ? 1 : 0;
    this.vel = new Vector2();          // deg/s (lat, lng)
    this._anchor = null;               // zoom anchor (unit vector)
    this._fly = null;
    this._offset = new Vector2();      // CSS px, current
    this._offsetTarget = new Vector2();
    this._idle = false; this._idleRamp = 0; this._lastInput = -1e9;
    this._interactive = false; this._controls = true;
    this._time = 0; this._lastT = 0;
    this._raf = 0;
    this._width = 1; this._height = 1;
    this._lastView = { lat: NaN, lng: NaN, gap: NaN, heading: NaN, tilt: NaN };
    this._viewOut = { center: [0, 0], kmPerPx: 0, distance: 0, heading: 0, tilt: 0 };
    this._framePayload = { dt: 0, calls: 0, triangles: 0 };
    this._v = new Vector3(); this._v2 = new Vector3(); this._v3 = new Vector3();
    this._ll = [0, 0];
    this._ndc = new Vector2();
    this._slowFrames = 0; this._frameCount = 0;
    this._projectFn = (v, out, lifted) => this._project(v, out, lifted);

    // survey / hover / dim state per index
    this._surveyMode = false; this._surveyFirst = true;
    this._hoverIso = null; this._manualHover = null; this._pointerHoverIso = null;
    this._regionFocus = null;
    this._dimDefault = 0; this._dimDefaultTarget = 0;

    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.shared.uReduced.value = this.reduced ? 1 : 0;

    this._bindInput();
    this._resize();
    this._ro = new ResizeObserver(() => { this._resize(); this.invalidate(); });
    this._ro.observe(this.root);
    this._onVis = () => { if (!document.hidden) { this._lastT = 0; this.invalidate(); } };
    document.addEventListener('visibilitychange', this._onVis);
    this._mq = matchMedia('(prefers-reduced-motion: reduce)');
    this._onMq = () => { this.reduced = this._mq.matches; this.shared.uReduced.value = this.reduced ? 1 : 0; this.invalidate(); };
    this._mq.addEventListener?.('change', this._onMq);

    this.gap = this.gapTarget = this._overviewGap();
    this.ready = this._init();
  }

  // ------------------------------------------------------------------ init
  async _init() {
    const t0 = performance.now();
    const base = this.opts.assetBase;
    const texP = Promise.allSettled([
      this._loadTexture(`${base}assets/relief-2k.webp`, { srgb: true }),
      this._loadTexture(`${base}assets/elevation-2k.png`, { red: true }),
      this._loadTexture(`${base}assets/coast-sdf-2k.png`, { red: true, mips: false }),
    ]);

    // country index + land mask (GPU), countries table, line work: synchronous, while textures decode
    const baked = bakeCountryMaps(this.renderer, this.data.shapes, {
      indexW: this.params.indexW, maskW: this.params.maskW, maskPasses: this.params.maskPasses,
    });
    this.bakeMs = baked.ms;
    this.isoToIdx = baked.isoToIdx; this.idxToIso = baked.idxToIso;
    this._indexRT = baked.indexRT; this._maskRT = baked.maskRT;
    const su = this.surface.uniforms;
    su.uIndex.value = baked.indexRT.texture; su.uIndexSize.value.set(baked.indexRT.width, baked.indexRT.height); su.uHasIndex.value = 1;
    su.uMask.value = baked.maskRT.texture; su.uHasMask.value = 1;
    this._setAnisotropy(baked.maskRT.texture, Math.min(8, this.params.anisotropy));
    this._initCountries();
    const tk = performance.now();
    this._lookup = new CountryLookup(this.data.shapes);
    this.lookupMs = performance.now() - tk;
    const tl = performance.now();
    this._buildBaseLines();
    this.linesMs = performance.now() - tl;
    this._initTiny();

    const [relief, elev, sdf] = await texP;
    if (relief.status === 'fulfilled') this._setRelief(relief.value, 2); else console.warn('Globe: relief-2k missing, using elevation tint', relief.reason);
    if (elev.status === 'fulfilled') {
      this.shared.uElev.value = elev.value; this.shared.uElevSize.value.set(elev.value.image.width, elev.value.image.height); this.shared.uHasElev.value = 1;
      this._buildHeights(elev.value.image);
    } else console.warn('Globe: elevation-2k missing, flat globe', elev.reason);
    if (sdf.status === 'fulfilled') {
      su.uSdf.value = sdf.value; su.uSdfSize.value.set(sdf.value.image.width, sdf.value.image.height); su.uHasSdf.value = 1;
    } else console.warn('Globe: coast-sdf-2k missing, no water lines', sdf.reason);
    if (this._disposed) return;

    // upload everything now so the first frame does not stall mid-animation
    this.renderer.compile(this.scene, this.camera);
    this._started = true;
    if (this.opts.intro && !this.reduced) this._startIntro();
    this._applyCamera();
    this._render();
    this.readyMs = performance.now() - t0;
    this._scheduleUpgrades();
    this.invalidate();
    return this;
  }

  async _loadTexture(url, { srgb = false, red = false, mips = true } = {}) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const blob = await res.blob();
    let img;
    try {
      img = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    } catch {
      img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el); el.onerror = reject;
        el.src = URL.createObjectURL(blob);
      });
    }
    const tex = new Texture(img);
    tex.flipY = false;
    tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    if (red) tex.format = RedFormat;
    tex.wrapS = RepeatWrapping; tex.wrapT = ClampToEdgeWrapping;
    tex.magFilter = LinearFilter;
    tex.minFilter = mips ? LinearMipmapLinearFilter : LinearFilter;
    tex.generateMipmaps = mips;
    tex.anisotropy = srgb && mips ? Math.min(this.params.anisotropy, this.maxAniso) : 1; // relief only: elevation is smooth
    tex.needsUpdate = true;
    return tex;
  }

  _setRelief(tex, k) {
    const su = this.surface.uniforms;
    const old = su.uRelief.value;
    su.uRelief.value = tex; su.uHasRelief.value = 1; su.uBakedShade.value = 1;
    su.uReliefSize.value.set(tex.image.width, tex.image.height);
    this.reliefK = k;
    if (old && old !== this._black) old.dispose();
  }

  // ---- regional detail ----
  _createDetail() {
    if (!this.params.detail || this.detail) return;
    const [sx, sy] = this.params.detailSlots;
    if (sx * 512 > this.device.maxTex || sy * 512 > this.device.maxTex) return;
    try {
      const d = new DetailElevation(this.renderer, { assetBase: this.opts.assetBase, slotsX: sx, slotsY: sy });
      if (!d.ok) { d.dispose(); return; }
      d.onLoad = () => this.invalidate();
      this.detail = d;
    } catch (e) { console.warn('Globe: detail elevation unavailable', e); }
  }
  _surfaceParams() { return { ...this.params, detail: this.params.detail && !!this.detail }; }
  _bindDetailUniforms() {
    const d = this.detail, su = this.surface.uniforms;
    if (!d) return;
    su.uDetail.value = d.atlas; su.uDetailIdx.value = d.index;
    su.uDetailGrid.value.copy(d.uGrid); su.uDetailAtlas.value.copy(d.uAtlas);
  }
  _setAnisotropy(tex, n) {
    const ext = this.renderer.extensions.get('EXT_texture_filter_anisotropic');
    const handle = this.renderer.properties.get(tex).__webglTexture;
    if (!ext || !handle) return;
    const gl = this.renderer.getContext();
    this.renderer.state.bindTexture(gl.TEXTURE_2D, handle);
    gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(n, this.maxAniso));
  }

  // CPU copy of the displacement heights (box mips 1..3 of elevation-2k, as the GPU builds them), so
  // labels, picking and projected marks sit on the displaced surface, which matters once the view tilts.
  _buildHeights(img) {
    try {
      const W = img.width, H = img.height;
      const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, W, H).data;
      let w = W, h = H, cur = new Float32Array(W * H);
      for (let i = 0; i < cur.length; i++) cur[i] = px[i * 4] / 255;
      const mips = [];
      for (let lvl = 1; lvl <= 3; lvl++) {
        const nw = w >> 1, nh = h >> 1, nx = new Float32Array(nw * nh);
        for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
          const a = (2 * y) * w + 2 * x;
          nx[y * nw + x] = (cur[a] + cur[a + 1] + cur[a + w] + cur[a + w + 1]) * 0.25;
        }
        mips.push({ w: nw, h: nh, d: nx });
        cur = nx; w = nw; h = nh;
      }
      this._heights = mips;
    } catch (e) { console.warn('Globe: no CPU heights', e); this._heights = null; }
  }
  // heightAt() of shaders.js on the CPU (fraction of 8,848 m, ice sheets capped). v need not be unit.
  _heightAt(v) {
    const M = this._heights;
    if (!M) return 0;
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    const lat = Math.asin(Math.max(-1, Math.min(1, v.y / len))), lng = Math.atan2(v.x, v.z);
    const u = lng / (2 * Math.PI) + 0.5, t = 0.5 - lat / Math.PI;
    const lod = clamp(this.shared.uElevLod.value, 1, 3);
    const l0 = Math.min(2, Math.floor(lod)), f = lod - l0;
    const samp = (m) => {
      const fx = u * m.w - 0.5, fy = clamp(t * m.h - 0.5, 0, m.h - 1.001);
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const xa = ((x0 % m.w) + m.w) % m.w, xb = (xa + 1) % m.w, r0 = y0 * m.w, r1 = Math.min(m.h - 1, y0 + 1) * m.w;
      return (m.d[r0 + xa] * (1 - tx) + m.d[r0 + xb] * tx) * (1 - ty) + (m.d[r1 + xa] * (1 - tx) + m.d[r1 + xb] * tx) * ty;
    };
    const e = f > 0 && l0 < 3 ? lerp(samp(M[l0 - 1]), samp(M[Math.min(2, l0)]), f) : samp(M[l0 - 1]);
    const hh = e * e;
    const latD = lat / DEG, lngD = lng / DEG;
    const ss = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
    const ant = 1 - ss(-62, -58, latD);
    const grl = ss(58, 61, latD) * ss(-76, -72, lngD) * (1 - ss(-14, -10, lngD));
    const k = 0.2826;
    return lerp(hh, 0.5 * Math.min(hh, k) + 0.05 * Math.max(hh - k, 0), Math.max(ant, grl));
  }
  // Radius of the displaced surface at direction v (unit-sphere radii).
  _surfaceR(v) { return 1 + this.shared.uDisp.value * this._heightAt(v); }

  _scheduleUpgrades() {
    const p = this.params;
    this._reliefQueue = [];
    if (p.reliefMax >= 4 && p.reliefEager4k) this._reliefQueue.push(4);
    if (p.reliefMax >= 8 && this.device.maxTex >= 8192) this._reliefQueue.push(8);
    this._lazy4k = p.reliefMax >= 4 && !p.reliefEager4k; // mobile: 4k only once zoomed in
    this._pumpUpgrade();
  }
  _pumpUpgrade() {
    if (this._upgrading || this._disposed || !this._reliefQueue.length) return;
    const k = this._reliefQueue.shift();
    if (k <= (this.reliefK || 0)) { this._pumpUpgrade(); return; }
    this._upgrading = true;
    this._loadTexture(`${this.opts.assetBase}assets/relief-${k}k.webp`, { srgb: true }).then((tex) => {
      // upload when the scene is calm so the stall never lands mid-flight
      const swap = () => {
        if (this._disposed) { tex.dispose(); return; }
        if (this._fly || this._dragging) { setTimeout(swap, 250); return; }
        this.renderer.initTexture(tex);
        this._setRelief(tex, k);
        this._upgrading = false;
        this.invalidate();
        this._pumpUpgrade();
      };
      (window.requestIdleCallback || setTimeout)(swap, { timeout: 600 });
    }).catch((e) => { console.warn('Globe: relief upgrade failed', e); this._upgrading = false; this._pumpUpgrade(); });
  }

  _initCountries() {
    // spread centre + radius per index for the survey fill animation
    const P = this._pal;
    this._sTo = new Float32Array(PALETTE_W); this._sFrom = new Float32Array(PALETTE_W);
    this._prog = new Float32Array(PALETTE_W).fill(1);
    this._hov = new Float32Array(PALETTE_W); this._hovT = new Float32Array(PALETTE_W);
    this._dim = new Float32Array(PALETTE_W); this._dimT = new Float32Array(PALETTE_W);
    this._spreadDur = new Float32Array(PALETTE_W).fill(0.9);
    this._sTo.fill(1); this._sFrom.fill(1);
    const v = new Vector3(), w = new Vector3();
    for (let i = 1; i < this.idxToIso.length; i++) {
      const iso = this.idxToIso[i];
      const c = this.data.byIso.get(iso);
      const ll = c?.labelLatLng || this._polyCentroid(iso);
      latLngToVec3(ll[0], ll[1], v);
      let maxR = 0.05;
      for (const poly of this.data.shapes.get(iso)) {
        const ring = poly[0];
        const step = Math.max(1, Math.floor(ring.length / 64));
        for (let k = 0; k < ring.length; k += step) { latLngToVec3(ring[k][1], ring[k][0], w); maxR = Math.max(maxR, angleBetween(v, w)); }
      }
      const o = (PALETTE_W + i) * 4;
      P[o] = v.x; P[o + 1] = v.y; P[o + 2] = v.z; P[o + 3] = Math.min(maxR, Math.PI);
    }
    this._writePalette();
  }
  _polyCentroid(iso) {
    const polys = this.data.shapes.get(iso);
    if (!polys) { const c = this.data.byIso.get(iso); return c?.labelLatLng || c?.capitalLatLng || [0, 0]; }
    let best = null, area = -1;
    for (const p of polys) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of p[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const a = (x1 - x0) * (y1 - y0);
      if (a > area) { area = a; best = [(y0 + y1) / 2, (x0 + x1) / 2]; }
    }
    return best || [0, 0];
  }
  _writePalette() {
    const P = this._pal, n = this.idxToIso.length;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      P[o] = this._sTo[i]; P[o + 1] = this._hov[i]; P[o + 2] = this._dim[i]; P[o + 3] = this._prog[i];
      P[(PALETTE_W * 2 + i) * 4] = this._sFrom[i];
    }
    this.palette.needsUpdate = true;
  }

  _buildBaseLines() {
    const buf = new SegmentBuffer(120000);
    const tj = window.topojson;
    const topo = this.data.topo;
    const obj = topo && (topo.objects.countries || topo.objects[Object.keys(topo.objects)[0]]);
    if (tj && obj) {
      const coast = tj.mesh(topo, obj, (a, b) => a === b);
      const border = tj.mesh(topo, obj, (a, b) => a !== b);
      for (const line of coast.coordinates) pushPolyline(buf, line, 0, 0, 0.5);
      for (const line of border.coordinates) pushPolyline(buf, line, 1, 0, 0.5);
    } else {
      console.warn('Globe: window.topojson missing; drawing every ring as coastline');
      for (const polys of this.data.shapes.values()) for (const poly of polys) for (const ring of poly) pushPolyline(buf, ring, 0, 0, 0.5);
    }
    this.lineMesh.geometry.dispose();
    this.lineMesh.geometry = buf.toGeometry();
    this.lineMesh.visible = true;
    this.lineSegments = buf.n;
  }

  _initTiny() {
    this._tiny = [];
    for (const c of this.data.countries) {
      if (!c.tiny || !c.sovereign) continue;
      const ll = c.labelLatLng || c.capitalLatLng;
      if (!ll) continue;
      this._tiny.push({ iso3: c.iso3, pos: latLngToVec3(ll[0], ll[1]), idx: this.isoToIdx.get(c.iso3) ?? -1, area: c.area || 0 });
    }
    this._tiny.sort((a, b) => b.area - a.area); // declutter keeps the larger state's ring
    this._tinyMarkers = this.opts.tinyMarkers;
    this._syncTinySprites();
  }
  _syncTinySprites() {
    this.sprites.remove((it) => it.group === 'tiny');
    const size = Math.min(this._width, this._height) < 560 ? 3.4 : 4.6;
    this._tinySize = size;
    for (const t of this._tiny) {
      t.sprite = null;
      if (!this._tinyMarkers) continue;
      this.sprites.add(t.pos, SHAPE.tiny, { start: this._time, size, idx: t.idx, group: 'tiny' });
      t.sprite = this.sprites.items[this.sprites.items.length - 1];
    }
    this._labelsDirty = true;
    this.invalidate();
  }

  _startIntro() {
    const lat = this.lat, lng = this.lng, gap = this.gap;
    this.lng = lng - 70; this.lat = lat - 8; this.gap = this.gapTarget = gap * 1.9;
    this._flyRaw(latLngToVec3(lat, lng), gap, 1900, { bump: 0, ease: easeOutCubic, zoomEase: easeOutCubic });
    this._fly.toOverview = true;
  }

  // ------------------------------------------------------------------ events
  on(name, fn) {
    if (!this._events.has(name)) this._events.set(name, new Set());
    this._events.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { this._events.get(name)?.delete(fn); }
  _emit(name, payload) {
    const set = this._events.get(name);
    if (!set) return;
    for (const fn of set) { try { fn(payload); } catch (e) { console.error(e); } }
  }

  // ------------------------------------------------------------------ public API
  setInteractive(on) {
    this._interactive = !!on;
    if (!on) { this._pointerHoverIso = null; this._refreshHover(); this.canvas.classList.remove('is-pointing'); }
    this.invalidate();
  }
  setControls(on) { this._controls = !!on; }
  setHover(iso3) { this._manualHover = iso3 || null; this._refreshHover(); }

  flyTo(target, { duration, heading } = {}) {
    let dest, gap;
    heading = heading ?? target?.heading;
    const fitHeading = heading ?? this._headingGoal();
    if (target?.iso3) {
      const c = this.data.byIso.get(target.iso3);
      if (!c) return Promise.resolve({ completed: false });
      let f;
      if (c.bbox) f = bboxFrame(c.bbox);
      else { const ll = c.labelLatLng || this._polyCentroid(target.iso3); f = { lat: ll[0], lng: ll[1], halfLat: 6, halfLng: 6 }; } // no polygon (TUV): show the neighbourhood
      dest = latLngToVec3(f.lat, f.lng);
      gap = this._fitGap(f.halfLat, f.halfLng, 0.62, fitHeading);
    } else if (target?.latLng) {
      dest = latLngToVec3(target.latLng[0], target.latLng[1]);
      gap = target.distance ? clamp(target.distance - 1, this._minGap(), this._maxGap()) : this.gapTarget;
    } else return Promise.resolve({ completed: false });
    return this._flyTo(dest, gap, duration, heading);
  }

  overview({ duration, heading } = {}) {
    const p = this._flyTo(latLngToVec3(this.lat, this.lng), this._overviewGap(), duration, heading);
    if (this._fly) this._fly.toOverview = true;
    return p;
  }
  // Layout changed (resize / view offset): keep an overview view fitted, including one in flight.
  _refit(wasOverview) {
    const ov = this._overviewGap();
    if (this._fly && this._fly.toOverview) { this._fly.g1 = ov; this.gapTarget = ov; }
    else if (wasOverview && !this._fly) this.gapTarget = ov;
    this.gapTarget = clamp(this.gapTarget, this._minGap(), this._maxGap());
  }

  _flyTo(dest, gap, duration, heading) {
    const from = latLngToVec3(this.lat, this.lng);
    const omega = angleBetween(from, dest);
    if (this.reduced) return this._crossfadeTo(dest, gap, heading);
    const dh = heading == null ? 0 : Math.abs(wrap180(heading - this.heading));
    const dur = duration ?? clamp(520 + omega / DEG * 4.2 + Math.abs(Math.log((gap + 1e-3) / (this.gap + 1e-3))) * 120 + dh * 1.6, 450, 1200);
    const ov = this._overviewGap();
    const peak = this.gap + (ov - this.gap) * clamp((omega / DEG - 12) / 90, 0, 1);
    const bump = Math.max(0, Math.min(peak, ov) - Math.max(this.gap, gap));
    return this._flyRaw(dest, gap, dur, { bump, heading });
  }

  _flyRaw(dest, gap, durMs, { bump = 0, ease = easeInOutCubic, zoomEase = easeInOutSine, heading = null } = {}) {
    this._endFly(false);
    this.vel.set(0, 0); this._anchor = null;
    if (heading != null) { this._endHeadAnim(false); this._hVel = 0; }
    return new Promise((resolve) => {
      this._fly = {
        v0: latLngToVec3(this.lat, this.lng), v1: dest.clone().normalize(), g0: this.gap, g1: gap,
        h0: this.heading, dh: heading == null ? 0 : wrap180(heading - this.heading),
        t0: this._time, dur: Math.max(0.05, durMs / 1000), bump, ease, zoomEase, resolve,
      };
      this.gapTarget = gap;
      this.invalidate();
    });
  }
  _endFly(completed) {
    const f = this._fly;
    if (!f) return;
    this._fly = null;
    f.resolve({ completed });
  }
  _crossfadeTo(dest, gap, heading) {
    this._endFly(false);
    return new Promise((resolve) => {
      const root = this.root;
      root.classList.add('is-fading');
      root.style.opacity = '0';
      setTimeout(() => {
        vec3ToLatLng(dest, this._ll);
        this.lat = this._ll[0]; this.lng = this._ll[1]; this.gap = this.gapTarget = gap;
        if (heading != null) { this._endHeadAnim(false); this.heading = wrap180(heading); this._hVel = 0; }
        this.vel.set(0, 0);
        this.invalidate();
        requestAnimationFrame(() => { root.style.opacity = '1'; setTimeout(() => { root.classList.remove('is-fading'); resolve({ completed: true }); }, 130); });
      }, 120);
    });
  }

  highlight(iso3, style = 'target') {
    if (!this.highlights.set(iso3, style)) {
      // no polygon: still show a ring target if we know a point
      if (!this.data.byIso.get(iso3)) return;
    }
    const c = this.data.byIso.get(iso3);
    this.sprites.remove((it) => it.group === 'hl' && it.iso3 === iso3);
    if (c?.tiny || !this.data.shapes.has(iso3)) {
      const ll = c.labelLatLng || c.capitalLatLng;
      if (ll) {
        const shape = { target: SHAPE.tinyTarget, focus: SHAPE.tinyFocus, correct: SHAPE.tinyCorrect, wrong: SHAPE.tinyWrong, neighbour: SHAPE.tinyNeighbour }[style] ?? SHAPE.tinyTarget;
        this.sprites.add(latLngToVec3(ll[0], ll[1]), shape, { start: this._time, size: style === 'neighbour' ? 7 : 10.5, idx: this.isoToIdx.get(iso3) ?? -1, group: 'hl' });
        this.sprites.items[this.sprites.items.length - 1].iso3 = iso3;
      }
    }
    this.invalidate();
  }
  clearHighlights() {
    this.highlights.clear();
    this.sprites.remove((it) => it.group === 'hl');
    this.invalidate();
  }

  dropPin(latLng, style = 'guess') {
    const shape = SHAPE[style] ?? SHAPE.guess;
    const id = this.sprites.add(latLngToVec3(latLng[0], latLng[1]), shape, { start: this._time, size: style === 'capital' ? 11 : 12, group: 'mark' });
    this.invalidate();
    return id;
  }

  drawArc(fromLatLng, toLatLng, { label, duration } = {}) {
    const used = new Set(this._arcs.map((a) => a.slot));
    let slot = 0;
    while (used.has(slot) && slot < MAX_SLOTS) slot++;
    if (slot >= MAX_SLOTS) { const old = this._arcs.shift(); this.labels.arcs.get(old.id)?.el.remove(); this.labels.arcs.delete(old.id); slot = old.slot; }
    const a = latLngToVec3(fromLatLng[0], fromLatLng[1]), b = latLngToVec3(toLatLng[0], toLatLng[1]);
    const omega = angleBetween(a, b);
    const id = `arc${++this._arcSeq || (this._arcSeq = 1)}`;
    const dur = this.reduced ? 0.01 : (duration ?? clamp(450 + omega / DEG * 3.5, 450, 1100)) / 1000;
    const lift = clamp(omega * 0.3, 0.012, 0.34);
    const mid = new Vector3();
    slerpUnit(a, b, 0.5, mid).multiplyScalar(1 + lift + 0.004);
    this._arcs.push({ id, slot, a, b, omega, lift, start: this._time, dur, label, mid });
    if (label) this.labels.addArc(id, a, b, lift, label);
    this._rebuildArcs();
    this.invalidate();
    return id;
  }
  _rebuildArcs() {
    const buf = new SegmentBuffer(2048, true);
    const p = new Vector3(), q = new Vector3();
    for (const arc of this._arcs) {
      const n = Math.max(24, Math.min(160, Math.ceil(arc.omega / DEG * 1.2)));
      let dist = 0;
      const at = (t, out) => slerpUnit(arc.a, arc.b, t, out).multiplyScalar(1 + 0.0025 + arc.lift * Math.sin(Math.PI * t));
      at(0, p);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        at(t1, q);
        const seg = p.distanceTo(q);
        buf.push(p.x, p.y, p.z, q.x, q.y, q.z, dist, dist + seg, 0, arc.slot, t0, t1);
        dist += seg;
        p.copy(q);
      }
    }
    this.arcMesh.geometry.dispose();
    this.arcMesh.geometry = this.arcCore.geometry = buf.toGeometry();
    this.arcMesh.visible = this.arcCore.visible = buf.n > 0;
  }
  clearMarks() {
    this.sprites.remove((it) => it.group === 'mark');
    this._arcs = [];
    this.labels.clearArcs();
    this._rebuildArcs();
    this.invalidate();
  }

  setSurveyed(map, { animate } = {}) {
    if (!this.isoToIdx) { this._pendingSurvey = [map, { animate }]; this.ready.then(() => this._pendingSurvey && this.setSurveyed(...this._pendingSurvey)); return; }
    this._pendingSurvey = null;
    const get = map instanceof Map ? (k) => map.get(k) : (k) => map?.[k];
    const wasMode = this._surveyMode;
    this._surveyMode = !!map;
    this.surface.uniforms.uSurveyMode.value = this._surveyMode ? 1 : 0;
    const anim = !this.reduced && (animate ?? (!this._surveyFirst && wasMode === this._surveyMode));
    this._surveyFirst = false;
    for (let i = 1; i < this.idxToIso.length; i++) {
      const lvl = map ? Math.max(0, Math.min(3, Math.round(get(this.idxToIso[i]) || 0))) : 3;
      const to = SURVEY_LEVELS[lvl];
      if (Math.abs(to - this._sTo[i]) < 1e-4 && this._prog[i] >= 1) continue;
      const cur = this._surveyValueNow(i);
      this._sFrom[i] = anim ? cur : to;
      this._sTo[i] = to;
      this._prog[i] = anim ? 0 : 1;
      this._spreadDur[i] = to > cur ? 1.0 : 0.45;
    }
    this._writePalette();
    this.invalidate();
  }
  _surveyValueNow(i) { return this._prog[i] >= 1 ? this._sTo[i] : lerp(this._sFrom[i], this._sTo[i], this._prog[i]); }

  setRegionFocus(region) {
    this._regionFocus = region || null;
    if (this.idxToIso) {
      for (let i = 1; i < this.idxToIso.length; i++) {
        const c = this.data.byIso.get(this.idxToIso[i]);
        this._dimT[i] = region && c?.region !== region ? 1 : 0;
      }
    }
    this._dimDefaultTarget = region ? 1 : 0;
    this.invalidate();
    const f = region && REGION_FRAMES[region];
    if (!f) return Promise.resolve({ completed: true });
    return this._flyTo(latLngToVec3(f.lat, f.lng), this._fitGap(f.halfLat, f.halfLng, 0.9, this._headingGoal()));
  }

  showLabels(list) {
    this.labels.setCountries(list === 'auto' ? 'auto' : Array.isArray(list) ? list : null, this.data);
    this._labelsDirty = true;
    this.invalidate();
  }
  setOceanLabels(on) { this.labels.setOceans(!!on); this._labelsDirty = true; this.invalidate(); }
  setTinyMarkers(on) { this._tinyMarkers = !!on; this._syncTinySprites(); }

  idle(on) { this._idle = !!on; if (on) this._lastInput = -1e9; this.invalidate(); }

  setQuality(q) {
    this._qualityPref = q;
    const tier = q === 'auto' ? (this.device.low ? 'low' : 'high') : q;
    if (tier === this.quality && q !== 'auto') return;
    this.quality = tier;
    const prevN = this.params.sphereN;
    this.params = qualityParams(tier, this.device);
    if (this.params.sphereN !== prevN) {
      this.surface.mesh.geometry.dispose();
      this.surface.mesh.geometry = cubeSphereGeometry(this.params.sphereN);
    }
    if (this.params.detail && !this.detail) { this._createDetail(); this._bindDetailUniforms(); }
    this.surface.material.defines = defineSet(this._surfaceParams());
    this.surface.material.needsUpdate = true;
    this.shared.uElevLod.value = this.params.elevLod;
    this._resize();
    if (this.isoToIdx) this._scheduleUpgrades();
    this._emit('quality', { quality: tier });
    this.invalidate();
  }

  setViewOffset({ x = 0, y = 0 } = {}, { animate = true } = {}) {
    const atOverview = this.gapTarget >= this._overviewGap() * 0.97;
    this._offsetTarget.set(x, y);
    if (!animate || this.reduced) this._offset.copy(this._offsetTarget);
    this._refit(atOverview);
    if (!animate || this.reduced) this.gap = this.gapTarget;
    this.invalidate();
  }

  getView() {
    return { center: [clamp(this.lat, -85, 85), wrapLng(this.lng)], kmPerPx: this._kmPerPx(), distance: 1 + this.gap, heading: this._headingOut(), tilt: this.tilt };
  }
  _headingOut() { const h = wrap180(this.heading); return Math.abs(h) < 1e-6 ? 0 : h; }
  // heading the camera is heading for (a running turn or flight), for framing
  _headingGoal() {
    if (this._headAnim) return this._headAnim.h0 + this._headAnim.dh;
    if (this._fly && this._fly.dh) return this._fly.h0 + this._fly.dh;
    return this.heading;
  }

  // Turn the map so that bearing `deg` points up (0 = north up, clockwise positive). Eased; resolves
  // { completed } (false if interrupted by a rotate input, a flight with a heading, or another turn).
  setHeading(deg, { duration } = {}) {
    if (!Number.isFinite(deg)) return Promise.resolve({ completed: false });
    this._endHeadAnim(false);
    this._hVel = 0;
    if (this._fly) this._fly.dh = 0;
    const dh = wrap180(deg - this.heading);
    if (this.reduced || duration === 0 || Math.abs(dh) < 1e-3) {
      this.heading = wrap180(deg);
      this.invalidate();
      return Promise.resolve({ completed: true });
    }
    const dur = (duration ?? clamp(320 + Math.abs(dh) * 2.4, 320, 900)) / 1000;
    return new Promise((resolve) => {
      this._headAnim = { h0: this.heading, dh, t0: this._time, dur, resolve };
      this.invalidate();
    });
  }
  resetNorth({ duration } = {}) { return this.setHeading(0, { duration }); }
  _endHeadAnim(completed) {
    const a = this._headAnim;
    if (!a) return;
    this._headAnim = null;
    a.resolve({ completed });
  }
  // Automatic pitch when zoomed in (default on). Turning it off eases the view back to straight down.
  setAutoTilt(on) { this._autoTilt = !!on; this.invalidate(); }

  project(latLng) {
    const v = latLngToVec3(latLng[0], latLng[1], new Vector3());
    const out = new Vector3();
    const vis = this._project(v, out);
    return { x: out.x, y: out.y, visible: vis > 0 };
  }

  // Antimeridian-safe country lookup on the same planar polygons the globe draws (null over sea).
  countryAt(lat, lng) {
    return this._lookup ? this._lookup.countryAt(lat, wrapLng(lng)) : this.data.countryAt(lat, lng);
  }

  invalidate() { this._needsRender = true; this._schedule(); }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    this._endFly(false);
    this._endHeadAnim(false);
    this._ro.disconnect();
    document.removeEventListener('visibilitychange', this._onVis);
    this._mq.removeEventListener?.('change', this._onMq);
    this._unbindInput();
    this.surface.mesh.geometry.dispose(); this.surface.material.dispose();
    for (const t of [this.surface.uniforms.uRelief.value, this.surface.uniforms.uSdf.value, this.shared.uElev.value, this.palette, this._black]) if (t && t.dispose) t.dispose();
    this._indexRT?.dispose(); this._maskRT?.dispose();
    this.lineMesh.geometry.dispose(); this.lineMaterial.dispose();
    this.arcMesh.geometry.dispose(); this.arcMaterial.dispose(); this.arcCoreMaterial.dispose();
    this.highlights.dispose(); this.sprites.dispose();
    this.frame.mesh.geometry.dispose(); this.frame.material.dispose();
    this.labels.dispose();
    this.detail?.dispose();
    this.renderer.dispose();
    this.root.remove();
    this._events.clear();
  }

  // ------------------------------------------------------------------ geometry of the view
  _halfFree() {
    const ox = Math.abs(this._offsetTarget.x), oy = Math.abs(this._offsetTarget.y);
    return [Math.max(60, this._width / 2 - ox), Math.max(60, this._height / 2 - oy)];
  }
  // Camera distance (globe radii, centre to camera) that fits `km` of ground across the free area; capped at the overview.
  distanceForSpan(km) {
    const [hw, hh] = this._halfFree();
    const g = ((km / EARTH_KM) / 2) * (this._height / 2) / (Math.min(hw, hh) * TAN_HALF);
    return 1 + clamp(g, this._minGap(), this._overviewGap());
  }
  overviewDistance() { return 1 + this._overviewGap(); }

  _overviewGap() {
    const [hw, hh] = this._halfFree();
    const rPx = Math.min(hw, hh) * 0.86; // disc diameter = 0.86 x min(free width, free height); ring fits outside
    const alpha = Math.atan(rPx * TAN_HALF / (this._height / 2));
    return 1 / Math.sin(alpha) - 1;
  }
  _minGap() {
    const [hw, hh] = this._halfFree();
    const tanShort = TAN_HALF * Math.min(hw, hh) / (this._height / 2);
    return 0.045 / tanShort; // ~290 km from the centre to the nearest free edge
  }
  _maxGap() { return this._overviewGap() * 1.45; }
  _fitGap(halfLatDeg, halfLngDeg, pad, headingDeg = 0) {
    const [hw, hh] = this._halfFree();
    if (headingDeg) {
      // a turned map shows the box rotated: fit its screen-aligned extents
      const c = Math.abs(Math.cos(headingDeg * DEG)), sn = Math.abs(Math.sin(headingDeg * DEG));
      [halfLatDeg, halfLngDeg] = [halfLatDeg * c + halfLngDeg * sn, halfLngDeg * c + halfLatDeg * sn];
    }
    const tanH = TAN_HALF * (hh * pad) / (this._height / 2);
    const tanW = TAN_HALF * (hw * pad) / (this._height / 2);
    const f = (th, tp) => { const t = clamp(Math.max(th, 2.1), 0, 80) * DEG; return Math.cos(t) + Math.sin(t) / tp; };
    const d = Math.max(f(halfLatDeg, tanH), f(halfLngDeg, tanW));
    return clamp(d - 1, this._minGap(), this._overviewGap());
  }
  _kmPerPx() { return (2 * this.gap * TAN_HALF / this._height) * EARTH_KM; }
  _labelCtx() {
    const c = this._lctx || (this._lctx = { width: 0, height: 0, kmPerPx: 0, cx: 0, cy: 0, r: 0 });
    const dpr = this.renderer.getPixelRatio();
    c.width = this._width; c.height = this._height; c.kmPerPx = this._kmPerPx();
    c.cx = this._width / 2 + this._offset.x; c.cy = this._height / 2 + this._offset.y;
    c.r = this.frame.mesh.visible ? this.frame.uniforms.uR.value / dpr : 1e6; // globe covers the view: no disc test
    // pins as obstacles for arc chips
    const marks = c.marks || (c.marks = []);
    marks.length = 0;
    for (const it of this.sprites.items) {
      if (it.group !== 'mark' || this._project(it.pos, this._v3) <= 0) continue;
      const r = it.size + 4;
      marks.push(this._v3.x - r, this._v3.y - r, this._v3.x + r, this._v3.y + r);
    }
    return c;
  }

  // Projects a world point to CSS px (out.x/out.y); returns horizon visibility (> 0 visible).
  // Surface points (unit vectors) are lifted onto the displaced relief first, as the shaders draw them.
  // `lifted` points (arcs) use a ray-occlusion test instead of the surface horizon.
  _project(v, out, lifted = false) {
    if (!lifted && this._heights) out.copy(v).multiplyScalar((this._surfaceR(v) + 0.0006 * this.shared.uLiftK.value) / (v.length() || 1)).project(this.camera);
    else out.copy(v).project(this.camera);
    const x = (out.x + 1) * 0.5 * this._width, y = (1 - out.y) * 0.5 * this._height;
    const cam = this.camera.position;
    let vis;
    if (!lifted) {
      const cl = cam.length(), ch = 1 / cl;
      const len = v.length() || 1;
      vis = ((v.x * cam.x + v.y * cam.y + v.z * cam.z) / (len * cl) - ch) / (1 - ch);
    } else {
      // segment camera -> v intersects the unit sphere?
      const dx = v.x - cam.x, dy = v.y - cam.y, dz = v.z - cam.z;
      const a = dx * dx + dy * dy + dz * dz, b = 2 * (cam.x * dx + cam.y * dy + cam.z * dz);
      const c = cam.lengthSq() - 1, disc = b * b - 4 * a * c;
      vis = 1;
      if (disc > 0) { const t = (-b - Math.sqrt(disc)) / (2 * a); if (t > 0 && t < 1) vis = -1; }
    }
    out.x = x; out.y = y;
    return vis;
  }

  // ------------------------------------------------------------------ input
  _bindInput() {
    const c = this.canvas;
    this._pointers = new Map();
    this._dragging = false;
    this._pointerIn = false;
    this._pointerPos = new Vector2(-1, -1);
    this._pointerMoved = false;
    this._onDown = (e) => this._pDown(e);
    this._onMove = (e) => this._pMove(e);
    this._onUp = (e) => this._pUp(e);
    this._onLeave = (e) => { if (e.pointerType === 'mouse') { this._pointerIn = false; this._pointerMoved = true; this.invalidate(); } };
    this._onWheel = (e) => this._wheel(e);
    this._onKey = (e) => this._key(e);
    // right-drag turns the map, so the canvas has no context menu while the camera is controllable
    this._onCtx = (e) => { if (this._longFired || this._controls) e.preventDefault(); };
    c.addEventListener('pointerdown', this._onDown);
    c.addEventListener('pointermove', this._onMove);
    c.addEventListener('pointerup', this._onUp);
    c.addEventListener('pointercancel', this._onUp);
    c.addEventListener('pointerleave', this._onLeave);
    c.addEventListener('wheel', this._onWheel, { passive: false });
    c.addEventListener('contextmenu', this._onCtx);
    if (this.opts.keyboard) c.addEventListener('keydown', this._onKey);
  }
  _unbindInput() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._onDown);
    c.removeEventListener('pointermove', this._onMove);
    c.removeEventListener('pointerup', this._onUp);
    c.removeEventListener('pointercancel', this._onUp);
    c.removeEventListener('pointerleave', this._onLeave);
    c.removeEventListener('wheel', this._onWheel);
    c.removeEventListener('contextmenu', this._onCtx);
    c.removeEventListener('keydown', this._onKey);
    clearTimeout(this._longTimer);
  }
  _localXY(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  _touchInput() { this._lastInput = this._time; this._idleRamp = 0; }

  _pDown(e) {
    const [x, y] = this._localXY(e);
    this._pointers.set(e.pointerId, { x, y, x0: x, y0: y, type: e.pointerType });
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this._touchInput();
    this._pointerIn = true;
    this._pointerPos.set(x, y);
    if (this._pointers.size === 1) {
      // right button, or ctrl / alt with the main button: turn the map instead of moving it
      const rotate = e.pointerType === 'mouse' && (e.button === 2 || e.ctrlKey || e.altKey);
      this._down = { x, y, t: performance.now(), moved: false, type: e.pointerType, rotate };
      this._longFired = false;
      clearTimeout(this._longTimer);
      this._longTimer = setTimeout(() => {
        if (this._down && !this._down.moved && !this._down.rotate && this._pointers.size === 1) {
          this._longFired = true;
          const hit = this._pickAt(this._down.x, this._down.y, this._down.type);
          this._emit('longpress', hit);
        }
      }, 520);
      if (this._controls) { this.vel.set(0, 0); this._anchor = null; }
      this._velSamples = [];
    } else if (this._pointers.size === 2) {
      clearTimeout(this._longTimer);
      if (this._down) this._down.moved = true;
      this._pinch = this._pinchState();
    }
  }
  _pinchState() {
    const [a, b] = [...this._pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, gap: this.gapTarget, ang: Math.atan2(b.y - a.y, b.x - a.x), turn: 0, turning: false };
  }
  // Screen drag (CSS px, y down) -> change of the view centre in degrees, for the current heading and tilt.
  _panDelta(dx, dy, out) {
    const radPerPx = (2 * this.gap * TAN_HALF) / this._height;
    const h = this.heading * DEG, c = Math.cos(h), sn = Math.sin(h);
    const sx = dx, sy = -dy / Math.max(0.5, Math.cos(this.tilt * DEG)); // ground is stretched along the view under tilt
    const north = sy * c - sx * sn, east = sx * c + sy * sn;
    out[0] = (-north * radPerPx) / DEG;
    out[1] = (-east * radPerPx) / DEG / Math.max(0.2, Math.cos(this.lat * DEG));
    return out;
  }
  // Turn by `deg` (clockwise positive), keeping the ground under CSS px (px, py) in place.
  _turnAbout(deg, px, py) {
    if (!deg) return;
    const before = px != null ? this._rayHit(px, py)?.clone() : null;
    this.heading = wrap180(this.heading + deg);
    if (!before) return;
    this._applyCamera();
    const after = this._rayHit(px, py);
    if (!after) return;
    // move the centre by the rotation that takes `after` back to `before`
    const q = this._q || (this._q = new Quaternion());
    q.setFromUnitVectors(after, before);
    const c = latLngToVec3(this.lat, this.lng, this._v2).applyQuaternion(q);
    vec3ToLatLng(c, this._ll);
    this.lat = clamp(this._ll[0], -85, 85); this.lng = this._ll[1];
  }
  _userTurn() { this._endHeadAnim(false); if (this._fly) this._fly.dh = 0; }
  _pMove(e) {
    const [x, y] = this._localXY(e);
    this._pointerIn = true;
    this._pointerPos.set(x, y);
    this._pointerMoved = true;
    const p = this._pointers.get(e.pointerId);
    if (!p) { this.invalidate(); return; }
    const dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    if (this._pointers.size === 1 && this._down) {
      const slop = this._down.type === 'touch' ? 9 : 4;
      if (!this._down.moved && Math.hypot(x - this._down.x, y - this._down.y) > slop) {
        this._down.moved = true;
        clearTimeout(this._longTimer);
      }
      if (this._down.moved && this._controls && this._down.rotate) {
        // turn the sheet: follow the pointer's angle around the view centre (sideways drag near it)
        if (!this._dragging) { this._dragging = true; this.canvas.classList.add('is-dragging'); this._userTurn(); }
        const cx = this._width / 2 + this._offset.x, cy = this._height / 2 + this._offset.y;
        const r = Math.hypot(x - cx, y - cy);
        let da = Math.atan2(y - cy, x - cx) - Math.atan2(y - dy - cy, x - dx - cx);
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const w = clamp((r - 30) / 90, 0, 1);
        const deg = -(da / DEG) * w - dx * 0.3 * (1 - w);
        this.heading = wrap180(this.heading + deg);
        this._hVel = 0;
        this._turnSamples = this._turnSamples || [];
        const t = performance.now();
        this._turnSamples.push(t, deg);
        while (this._turnSamples.length > 2 && t - this._turnSamples[0] > 90) this._turnSamples.splice(0, 2);
        this._touchInput();
      } else if (this._down.moved && this._controls) {
        if (!this._dragging) { this._dragging = true; this.canvas.classList.add('is-dragging'); if (this._fly) this._endFly(false); }
        const [dLat, dLng] = this._panDelta(dx, dy, this._ll);
        this.lat = clamp(this.lat + dLat, -85, 85);
        this.lng += dLng;
        const t = performance.now();
        this._velSamples.push(t, dLat, dLng);
        while (this._velSamples.length > 3 && t - this._velSamples[0] > 90) this._velSamples.splice(0, 3);
        this._touchInput();
      }
    } else if (this._pointers.size === 2 && this._pinch && this._controls) {
      const s = this._pinchState();
      const ratio = this._pinch.d / s.d;
      this.gapTarget = clamp(this._pinch.gap * ratio, this._minGap(), this._maxGap());
      this.gap = this.gapTarget; // pinch follows the fingers directly
      const [dLat, dLng] = this._panDelta(s.mx - this._pinch.mx, s.my - this._pinch.my, this._ll);
      this.lat = clamp(this.lat + dLat, -85, 85);
      this.lng += dLng;
      // two-finger rotate: engages after 7° so a pinch never turns the map by accident
      let da = s.ang - this._pinch.ang;
      da = Math.atan2(Math.sin(da), Math.cos(da)) / DEG;
      this._pinch.ang = s.ang;
      if (!this._pinch.turning) {
        this._pinch.turn += da;
        if (Math.abs(this._pinch.turn) > 7) { this._pinch.turning = true; this._userTurn(); da = this._pinch.turn; }
      }
      if (this._pinch.turning && da) this._turnAbout(-da, s.mx, s.my);
      this._pinch.mx = s.mx; this._pinch.my = s.my;
      if (this._fly) this._endFly(false);
      this._touchInput();
    }
    this.invalidate();
  }
  _pUp(e) {
    const p = this._pointers.get(e.pointerId);
    this._pointers.delete(e.pointerId);
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    clearTimeout(this._longTimer);
    if (!p) return;
    if (this._pointers.size === 1) { this._pinch = null; const [q] = this._pointers.values(); this._down = { x: q.x, y: q.y, t: performance.now(), moved: true, type: q.type }; return; }
    if (this._pointers.size > 0) return;
    this._pinch = null;
    const down = this._down;
    this._down = null;
    if (this._dragging && down?.rotate) {
      this._dragging = false;
      this.canvas.classList.remove('is-dragging');
      const s = this._turnSamples || [];
      const t = performance.now();
      if (s.length >= 4 && t - s[s.length - 2] < 70) {
        let sum = 0;
        for (let i = 1; i < s.length; i += 2) sum += s[i];
        this._hVel = clamp(sum / (Math.max(16, t - s[0]) / 1000), -360, 360);
      }
      this._turnSamples = [];
    } else if (this._dragging) {
      this._dragging = false;
      this.canvas.classList.remove('is-dragging');
      const s = this._velSamples || [];
      const t = performance.now();
      if (s.length >= 6 && t - s[s.length - 3] < 70) {
        let sl = 0, sg = 0;
        for (let i = 0; i < s.length; i += 3) { sl += s[i + 1]; sg += s[i + 2]; }
        const span = Math.max(16, t - s[0]) / 1000;
        this.vel.set(clamp(sl / span, -400, 400), clamp(sg / span, -900, 900));
      }
    } else if (down && !down.moved && !down.rotate && !this._longFired && e.type === 'pointerup') {
      const hit = this._pickAt(down.x, down.y, down.type);
      this._emit('pick', hit);
    }
    if (e.pointerType !== 'mouse') { this._pointerIn = false; this._pointerMoved = true; }
    this.invalidate();
  }
  _wheel(e) {
    if (!this._controls) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 400;
    const k = e.ctrlKey ? 0.01 : 0.0017;
    this.gapTarget = clamp(this.gapTarget * Math.exp(dy * k), this._minGap(), this._maxGap());
    const [x, y] = this._localXY(e);
    const hit = this._rayHit(x, y);
    this._anchor = hit ? hit.clone() : null;
    if (this._fly) this._endFly(false);
    this.vel.set(0, 0);
    this._touchInput();
    this.invalidate();
  }
  _key(e) {
    if (!this._controls || e.metaKey || e.ctrlKey || e.altKey) return;
    const step = 70 * Math.min(1, this.gap / 2 + 0.15);
    const h = this.heading * DEG, c = Math.cos(h), sn = Math.sin(h);
    // arrows pan along the screen: up = toward the bearing at the top of the turned map
    const pan = (up, right) => { this.vel.x += (up * c - right * sn) * step; this.vel.y += (right * c + up * sn) * step; };
    let used = true;
    switch (e.key) {
      case 'ArrowLeft': pan(0, -1); break;
      case 'ArrowRight': pan(0, 1); break;
      case 'ArrowUp': pan(0.8, 0); break;
      case 'ArrowDown': pan(-0.8, 0); break;
      case 'q': case 'Q': this._userTurn(); this._hVel = clamp(this._hVel - 70, -150, 150); break;
      case 'e': case 'E': this._userTurn(); this._hVel = clamp(this._hVel + 70, -150, 150); break;
      case '+': case '=': this.gapTarget = clamp(this.gapTarget / 1.45, this._minGap(), this._maxGap()); break;
      case '-': case '_': this.gapTarget = clamp(this.gapTarget * 1.45, this._minGap(), this._maxGap()); break;
      default: used = false;
    }
    if (used) { e.preventDefault(); if (this._fly) this._endFly(false); this._anchor = null; this._touchInput(); this.invalidate(); }
  }

  // Ground point under a CSS px (unit vector), refined against the displaced relief so tilted views
  // pick what is drawn there. null off the globe.
  _rayHit(x, y) {
    this._ndc.set((x / this._width) * 2 - 1, -(y / this._height) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const ray = this.raycaster.ray, sph = this._pickSphere;
    sph.radius = 1.0015;
    const hit = ray.intersectSphere(sph, this._v3);
    if (!hit) return null;
    if (this._heights) {
      const q = this._rayQ || (this._rayQ = new Vector3());
      for (let i = 0; i < 4; i++) {
        sph.radius = this._surfaceR(hit);
        if (!ray.intersectSphere(sph, q)) break;
        hit.copy(q);
      }
      sph.radius = 1.0015;
    }
    return hit.normalize();
  }

  // Tiny-country radius test first, then exact point-in-polygon via data.countryAt.
  _pickAt(x, y, type = 'mouse') {
    const hitP = this._rayHit(x, y);
    let latLng = null, under = null;
    if (hitP) {
      vec3ToLatLng(hitP, this._ll);
      latLng = [this._ll[0], this._ll[1]];
      under = this.countryAt(latLng[0], latLng[1]);
    }
    let tiny = null;
    if (this._tinyMarkers || this.sprites.items.some((it) => it.group === 'hl')) {
      const r = type === 'touch' ? 22 : 13;
      let best = r * r;
      const out = this._v2;
      for (const t of this._tiny) {
        const lit = this.highlights.styleOf(t.iso3) !== null || this.sprites.items.some((it) => it.group === 'hl' && it.iso3 === t.iso3);
        if (!lit && (!this._tinyMarkers || t.sprite?.hidden || this._facing(t.pos) < 0.3)) continue;
        const vis = this._project(t.pos, out);
        if (vis <= 0.02) continue;
        const d2 = (out.x - x) ** 2 + (out.y - y) ** 2;
        if (d2 < best) { best = d2; tiny = t.iso3; }
      }
    }
    return { iso3: tiny || under, latLng, screen: { x, y }, tiny: !!tiny, under };
  }

  _refreshHover() {
    const iso = this._manualHover || this._pointerHoverIso;
    if (iso === this._hoverIso) return;
    if (this._hoverIso && this.isoToIdx?.has(this._hoverIso)) this._hovT[this.isoToIdx.get(this._hoverIso)] = 0;
    this._hoverIso = iso;
    if (iso && this.isoToIdx?.has(iso)) this._hovT[this.isoToIdx.get(iso)] = 1;
    this.sprites.uniforms.uHoverIdx.value = iso && this.isoToIdx?.has(iso) ? this.isoToIdx.get(iso) : -1;
    this.invalidate();
  }

  // ------------------------------------------------------------------ loop
  _schedule() {
    if (!this._raf && !this._disposed) this._raf = requestAnimationFrame(this._loop);
  }
  _loop = (tms) => {
    this._raf = 0;
    if (this._disposed || document.hidden || !this._started) return;
    const t = tms / 1000;
    const dt = this._lastT ? clamp(t - this._lastT, 0, 0.1) : 1 / 60;
    this._lastT = t;
    this._time += dt;
    const animating = this._update(dt);
    this._render();
    this._trackPerf(dt, animating);
    if (animating || this._needsRender) this._schedule();
    else this._lastT = 0;
  };

  _update(dt) {
    this._needsRender = false;
    let anim = false;
    const time = this._time;
    this.shared.uTime.value = time;
    const camBefore = this._lastView;

    // view offset easing
    if (!this._offset.equals(this._offsetTarget)) {
      const k = 1 - Math.exp(-dt * 9);
      this._offset.lerp(this._offsetTarget, k);
      if (this._offset.distanceTo(this._offsetTarget) < 0.3) this._offset.copy(this._offsetTarget);
      anim = true;
    }

    // camera
    const f = this._fly;
    if (f) {
      const u = clamp((time - f.t0) / f.dur, 0, 1);
      const e = f.ease(u);
      slerpUnit(f.v0, f.v1, e, this._v);
      vec3ToLatLng(this._v, this._ll);
      this.lat = this._ll[0]; this.lng = this._ll[1];
      this.gap = lerp(f.g0, f.g1, f.zoomEase(u)) + f.bump * Math.pow(Math.sin(Math.PI * u), 1.3);
      if (f.dh) this.heading = wrap180(f.h0 + f.dh * f.ease(u));
      if (u >= 1) { this.gap = f.g1; this._endFly(true); }
      anim = true;
    } else if (!this._dragging && !this._pinch) {
      // inertia
      if (this.vel.lengthSq() > 1e-4) {
        this.lat = clamp(this.lat + this.vel.x * dt, -85, 85);
        this.lng += this.vel.y * dt;
        this.vel.multiplyScalar(Math.exp(-dt * 4.0));
        if (this.vel.lengthSq() < 0.02) this.vel.set(0, 0);
        anim = true;
      }
      // zoom damping (log space) with anchor pull
      if (Math.abs(this.gap - this.gapTarget) > 1e-5) {
        const g0 = this.gap;
        const k = 1 - Math.exp(-dt * 11);
        this.gap = Math.exp(lerp(Math.log(this.gap), Math.log(this.gapTarget), k));
        if (Math.abs(this.gap - this.gapTarget) / this.gapTarget < 1e-3) this.gap = this.gapTarget;
        if (this._anchor) {
          const frac = 1 - this.gap / g0;
          latLngToVec3(this.lat, this.lng, this._v);
          slerpUnit(this._v, this._anchor, clamp(frac, -0.5, 0.5), this._v2);
          vec3ToLatLng(this._v2, this._ll);
          this.lat = clamp(this._ll[0], -85, 85); this.lng = this._ll[1];
        }
        anim = true;
      } else this._anchor = null;
      // idle spin
      if (this._idle && !this.reduced && time - this._lastInput > 2.5) {
        this._idleRamp = Math.min(1, this._idleRamp + dt * 0.6);
        this.lng += 4.5 * this._idleRamp * dt;
        anim = true;
      }
    }
    // heading: eased turn, or inertia from Q / E and rotate gestures
    const ha = this._headAnim;
    if (ha) {
      const u = clamp((time - ha.t0) / ha.dur, 0, 1);
      this.heading = wrap180(ha.h0 + ha.dh * easeInOutCubic(u));
      if (u >= 1) this._endHeadAnim(true);
      anim = true;
    } else if (this._hVel && !(this._dragging && this._down?.rotate)) {
      this.heading = wrap180(this.heading + this._hVel * dt);
      this._hVel *= Math.exp(-dt * 5);
      if (Math.abs(this._hVel) < 0.5) this._hVel = 0;
      anim = true;
    }
    // auto tilt on / off eases; the pitch itself follows the zoom in _applyCamera
    const ta = this._autoTilt ? 1 : 0;
    if (this._tiltAmt !== ta) {
      this._tiltAmt = this.reduced ? ta : clamp(this._tiltAmt + Math.sign(ta - this._tiltAmt) * dt * 2.2, 0, 1);
      anim = true;
    }
    // mobile: fetch 4k once the player zooms in
    if (this._lazy4k && this.gap < 0.9 && this.reliefK < 4) { this._lazy4k = false; this._reliefQueue.unshift(4); this._pumpUpgrade(); }
    this._applyCamera();
    if (this._updateDetail(dt)) anim = true;

    // palette transitions
    let palDirty = false;
    const n = this.idxToIso ? this.idxToIso.length : 0;
    const kh = 1 - Math.exp(-dt * 16), kd = 1 - Math.exp(-dt * 6);
    for (let i = 1; i < n; i++) {
      if (this._prog[i] < 1) { this._prog[i] = Math.min(1, this._prog[i] + dt / this._spreadDur[i]); palDirty = true; }
      if (this._hov[i] !== this._hovT[i]) {
        this._hov[i] += (this._hovT[i] - this._hov[i]) * kh;
        if (Math.abs(this._hov[i] - this._hovT[i]) < 0.01) this._hov[i] = this._hovT[i];
        palDirty = true;
      }
      if (this._dim[i] !== this._dimT[i]) {
        this._dim[i] += (this._dimT[i] - this._dim[i]) * kd;
        if (Math.abs(this._dim[i] - this._dimT[i]) < 0.01) this._dim[i] = this._dimT[i];
        palDirty = true;
      }
    }
    if (this._dimDefault !== this._dimDefaultTarget) {
      this._dimDefault += (this._dimDefaultTarget - this._dimDefault) * kd;
      if (Math.abs(this._dimDefault - this._dimDefaultTarget) < 0.01) this._dimDefault = this._dimDefaultTarget;
      this.surface.uniforms.uDimDefault.value = this._dimDefault;
      anim = true;
    }
    if (palDirty) { this._writePalette(); anim = true; }

    // highlights, sprites, arcs
    if (this.highlights.update(dt)) anim = true;
    if (this.highlights.animating() && !this.reduced) anim = true;
    this.sprites.sync();
    if (time < this.sprites.busyUntil()) anim = true;
    if (this.sprites.hasPulse() && !this.reduced) anim = true;
    const arcSlots = this.arcMaterial.uniforms.uSlot.value;
    let arcBusy = false;
    for (const arc of this._arcs) {
      const u = clamp((time - arc.start) / arc.dur, 0, 1);
      arcSlots[arc.slot] = easeOutCubic(u) * 1.0001;
      if (u < 1) arcBusy = true;
      this.labels.setArcProgress(arc.id, easeOutCubic(u));
    }
    if (arcBusy) { this.arcMaterial.uniforms.uTime.value += dt; anim = true; }

    // pointer hover (once per frame)
    const camChanged = this.lat !== camBefore.lat || this.lng !== camBefore.lng || this.gap !== camBefore.gap ||
      this.heading !== camBefore.heading || this.tilt !== camBefore.tilt;
    if (this._interactive && (this._pointerMoved || (camChanged && this._pointerIn)) && !this._dragging) {
      this._pointerMoved = false;
      if (this._pointerIn) {
        const hit = this._pickAt(this._pointerPos.x, this._pointerPos.y, 'mouse');
        if (hit.iso3 !== this._pointerHoverIso) { this._pointerHoverIso = hit.iso3; this._refreshHover(); }
        this.canvas.classList.toggle('is-pointing', !!hit.iso3);
        this._emit('hover', hit);
      } else if (this._pointerHoverIso) {
        this._pointerHoverIso = null; this._refreshHover();
        this.canvas.classList.remove('is-pointing');
        this._emit('hover', { iso3: null, latLng: null, screen: null });
      }
    }

    // view event + labels
    if (camChanged || this._labelsDirty || this._offsetMoved) {
      this._labelsDirty = false;
      camBefore.lat = this.lat; camBefore.lng = this.lng; camBefore.gap = this.gap;
      camBefore.heading = this.heading; camBefore.tilt = this.tilt;
      this.labels.update(this._projectFn, this._labelCtx());
      this._hideRingsUnderLabels();
      if (camChanged) {
        const o = this._viewOut;
        o.center = [clamp(this.lat, -85, 85), wrapLng(this.lng)];
        o.kmPerPx = this._kmPerPx();
        o.distance = 1 + this.gap;
        o.heading = this._headingOut();
        o.tilt = this.tilt;
        this._emit('view', o);
      }
    } else if (this._arcs.length) {
      this.labels.update(this._projectFn, this._labelCtx());
      this._hideRingsUnderLabels();
    }
    this.sprites.sync(); // ring visibility depends on the label pass above
    return anim;
  }

  // Idle tiny-country rings (and neighbour rings) never sit inside a shown label or arc chip: they
  // read as part of the name. Target / correct / wrong rings are the answer and always stay.
  // Also declutters: an idle ring that would overlap an already shown ring (island chains at small
  // scale) is hidden until the player zooms in; rings are visited largest state first.
  _hideRingsUnderLabels() {
    const boxes = this.labels.boxes;
    const out = this._v2;
    const shown = this._ringsShown || (this._ringsShown = []);
    shown.length = 0;
    let changed = false;
    for (let pass = 0; pass < 2; pass++) for (const it of this.sprites.items) {
      // pass 0: highlighted rings claim their space; pass 1: idle rings
      const idle = it.group === 'tiny';
      if (pass === 0 ? !(it.group === 'hl' && it.shape >= SHAPE.tinyTarget) : !idle) continue;
      let hide = false;
      const vis = this._project(it.pos, out) > 0 && this._facing(it.pos) > 0.3;
      if (vis) {
        const m = it.size + 3;
        if (idle || it.shape === SHAPE.tinyNeighbour) {
          for (let i = 0; i < boxes.length; i += 4) {
            if (out.x + m > boxes[i] && out.x - m < boxes[i + 2] && out.y + m > boxes[i + 1] && out.y - m < boxes[i + 3]) { hide = true; break; }
          }
        }
        if (!hide && idle) {
          for (let i = 0; i < shown.length; i += 3) {
            const dx = out.x - shown[i], dy = out.y - shown[i + 1], r = m + shown[i + 2];
            if (dx * dx + dy * dy < r * r) { hide = true; break; }
          }
        }
        if (!hide) shown.push(out.x, out.y, m);
      }
      if (hide !== !!it.hidden) { it.hidden = hide; changed = true; }
    }
    if (changed) this.sprites.markHidden();
  }
  // n·v of a surface point (unit vector) toward the camera: 1 facing, 0 at the limb.
  _facing(d) {
    const c = this.camera.position;
    const dx = c.x - d.x, dy = c.y - d.y, dz = c.z - d.z;
    return (d.x * dx + d.y * dy + d.z * dz) / (Math.hypot(dx, dy, dz) || 1);
  }

  // Auto pitch for a zoom level (degrees, before the horizon limit).
  _autoTiltFor(km) {
    const t = clamp(Math.log(TILT_FROM_KM / km) / Math.log(TILT_FROM_KM / TILT_FULL_KM), 0, 1);
    return AUTO_TILT_MAX * t * t * (3 - 2 * t);
  }
  // Largest pitch <= want (degrees) at which every viewport corner still looks at the ground at a
  // comfortable angle, so a tilted view never shows the horizon, the limb or the paper behind it.
  _tiltLimit(P, F, g, want) {
    const ok = (Tdeg) => {
      const t = Tdeg * DEG, ct = Math.cos(t), st = Math.sin(t);
      const px = P.x * (1 + g * ct) - F.x * g * st, py = P.y * (1 + g * ct) - F.y * g * st, pz = P.z * (1 + g * ct) - F.z * g * st;
      const fx = -P.x * ct + F.x * st, fy = -P.y * ct + F.y * st, fz = -P.z * ct + F.z * st; // forward (unit)
      const ux = F.x * ct + P.x * st, uy = F.y * ct + P.y * st, uz = F.z * ct + P.z * st;     // up (unit)
      const rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;          // right
      const cx = this._width / 2 + this._offset.x, cy = this._height / 2 + this._offset.y, hh = this._height / 2;
      const pp = px * px + py * py + pz * pz;
      for (let k = 0; k < 4; k++) {
        const a = ((k & 1 ? this._width : 0) - cx) / hh * TAN_HALF, b = -((k & 2 ? this._height : 0) - cy) / hh * TAN_HALF;
        let dx = fx + rx * a + ux * b, dy = fy + ry * a + uy * b, dz = fz + rz * a + uz * b;
        const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
        const bb = px * dx + py * dy + pz * dz, disc = bb * bb - (pp - 1);
        if (disc <= 0) return false;
        const th = -bb - Math.sqrt(disc);
        if (th <= 0) return false;
        const inc = -((px + dx * th) * dx + (py + dy * th) * dy + (pz + dz * th) * dz); // cos of incidence
        if (inc < 0.22) return false;
      }
      return true;
    };
    if (ok(want)) return want;
    if (!ok(0)) return 0;
    let lo = 0, hi = want;
    for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    return lo;
  }

  _applyCamera() {
    const cam = this.camera;
    const g = this.gap;
    // target P on the surface, local north / east, F = the bearing at the top of the screen
    const P = this._camP || (this._camP = new Vector3()), F = this._camF || (this._camF = new Vector3());
    const la = clamp(this.lat, -85, 85) * DEG, lo = this.lng * DEG, h = this.heading * DEG;
    const cla = Math.cos(la), sla = Math.sin(la), clo = Math.cos(lo), slo = Math.sin(lo);
    P.set(cla * slo, sla, cla * clo);
    F.set(-sla * slo * Math.cos(h) + clo * Math.sin(h), cla * Math.cos(h), -sla * clo * Math.cos(h) - slo * Math.sin(h));
    const km = this._kmPerPx();
    const want = this._tiltAmt * this._autoTiltFor(km);
    this.tilt = want > 0.05 ? this._tiltLimit(P, F, g, want) : 0;
    const t = this.tilt * DEG;
    this.shared.uLiftK.value = 1 - 0.88 * clamp(this.tilt / 20, 0, 1);
    cam.position.copy(P).multiplyScalar(1 + g * Math.cos(t)).addScaledVector(F, -g * Math.sin(t));
    cam.up.copy(F).multiplyScalar(Math.cos(t)).addScaledVector(P, Math.sin(t));
    cam.lookAt(P);
    const d = cam.position.length();
    const near = Math.max(0.0012, Math.min((d - 1) * 0.5, d - 1.42));
    const far = d + 1.6;
    const ox = this._offset.x, oy = this._offset.y;
    this._offsetMoved = ox !== this._lastOx || oy !== this._lastOy;
    if (near !== cam.near || far !== cam.far || this._offsetMoved || this._sizeChanged) {
      cam.near = near; cam.far = far;
      if (ox || oy) cam.setViewOffset(this._width, this._height, -ox, -oy, this._width, this._height);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
      this._lastOx = ox; this._lastOy = oy; this._sizeChanged = false;
    }
    cam.updateMatrixWorld();

    // per-frame shader inputs
    const dpr = this.renderer.getPixelRatio();
    const bufH = this._height * dpr;
    this.shared.uPxPerUnit.value = bufH / (2 * this.gap * TAN_HALF);
    const ov = this._overviewGap(), mg = this._minGap();
    const zoomT = clamp(1 - Math.log(this.gap / mg) / Math.log(Math.max(ov / mg, 1.01)), 0, 1);
    this.lineMaterial.uniforms.uWidthScale.value = lerp(0.85, 1.35, zoomT);
    this.lineMaterial.uniforms.uLift.value = 0.0005 + 0.0004 * zoomT;
    // relief exaggeration: x22 lifts mountains at the limb; close in, x9 keeps tilted terrain believable
    const ss = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
    this.shared.uDisp.value = DISP * lerp(9, 22, ss(2, 10, km)) / 22;
    const su = this.surface.uniforms;
    su.uDetailOn.value = this.detail ? 1 - ss(4.0, 5.2, km) : 0;
    // survey contours: 500 m (index 2,500) -> 200 m (index 1,000) -> 100 m (index 500), each step fading in
    const coarse = km >= 2.5;
    const cmix = coarse ? 1 - ss(2.5, 3.3, km) : 1 - ss(1.0, 1.6, km);
    const ci = coarse ? 500 : 200, cf = coarse ? 200 : 100;
    su.uContour.value.set(ci, cf, cmix, 1 - ss(3.0, 4.8, km));
    su.uContourIdx.value.set(ci * 5, cf * 5, cmix, 0);
    su.uMicro.value = 1 - ss(2.2, 4.2, km);
    su.uReliefSoft.value = 0.65 * ss(15, 75, Math.abs(wrap180(this.heading)));
    const fu = this.frame.uniforms;
    const alpha = Math.asin(Math.min(1, 1 / d));
    fu.uR.value = (bufH / 2) * Math.tan(alpha) / TAN_HALF;
    fu.uCenter.value.set(this._width * dpr / 2 + ox * dpr, bufH / 2 - oy * dpr);
    fu.uDpr.value = dpr;
    fu.uRes.value.set(this._width * dpr, bufH);
    // once the globe covers the whole viewport there is no paper furniture to draw
    const cx = this._width / 2 + ox, cy = this._height / 2 + oy;
    const farCorner = Math.hypot(Math.max(cx, this._width - cx), Math.max(cy, this._height - cy));
    this.frame.mesh.visible = this.tilt < 0.01 && fu.uR.value / dpr < farCorner + 2;
    fu.uSpin.value = -this.lng - this.heading;
    fu.uAlpha.value = clamp((this.gap - mg * 3) / (ov * 0.6 - mg * 3), 0, 1);
    fu.uShadowA.value = 0.16 * clamp((this.gap - mg * 2) / (ov * 0.5), 0.15, 1);
    this.sprites.uniforms.uTinyAlpha.value = clamp((this.gap - mg * 1.2) / (mg * 3), 0.35, 1);
  }

  _render() {
    this.renderer.render(this.scene, this.camera);
  }

  // Detail tiles for what the camera sees (or will see at the end of a flight), nearest the centre first.
  _updateDetail(dt) {
    const d = this.detail;
    if (!d || !this.params.detail) return false;
    const f = this._fly;
    const gap = f ? f.g1 : this.gap;
    const km = (2 * gap * TAN_HALF / this._height) * EARTH_KM;
    if (km < DETAIL_LOAD_KM && this._time - (this._detailT ?? -9) > 0.12) {
      const key = f ? `fly${f.t0}` : `${this.lat.toFixed(2)},${this.lng.toFixed(2)},${this.gap.toFixed(4)},${Math.round(this.heading)},${Math.round(this.tilt)},${this._width}x${this._height}`;
      if (key !== this._detailKey || this._time - this._detailT > 1) {
        this._detailKey = key; this._detailT = this._time;
        d.want(f ? this._footprintAt(f) : this._footprint(), this._time);
      }
    }
    return d.tick(dt, this.reduced);
  }
  // Ray-cast a grid over the viewport (plus an 8% margin) and collect the tiles under it.
  _footprint() {
    const G = this.detail.grid, deg = G.tileDeg, best = new Map(), ll = this._ll;
    const W = this._width, H = this._height, cx = W / 2 + this._offset.x, cy = H / 2 + this._offset.y;
    for (let j = 0; j <= 8; j++) for (let i = 0; i <= 12; i++) {
      const x = W * (-0.08 + 1.16 * i / 12), y = H * (-0.08 + 1.16 * j / 8);
      const hit = this._rayHit(x, y);
      if (!hit) continue;
      vec3ToLatLng(hit, ll);
      const c = clamp(Math.floor((wrapLng(ll[1]) + 180) / deg), 0, G.cols - 1), r = clamp(Math.floor((90 - ll[0]) / deg), 0, G.rows - 1);
      if (!this.detail.has(c, r)) continue;
      const k = this.detail.keyOf(c, r), dd = Math.hypot(x - cx, y - cy);
      if (!(best.get(k) <= dd)) best.set(k, dd);
    }
    return [...best.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
  }
  // The same at a flight's destination, by briefly placing the camera there.
  _footprintAt(f) {
    const save = [this.lat, this.lng, this.gap, this.heading, this._offsetMoved];
    vec3ToLatLng(f.v1, this._ll);
    this.lat = this._ll[0]; this.lng = this._ll[1]; this.gap = f.g1; this.heading = wrap180(f.h0 + f.dh);
    this._applyCamera();
    const keys = this._footprint();
    [this.lat, this.lng, this.gap, this.heading] = save;
    this._applyCamera();
    this._offsetMoved = save[4] || this._offsetMoved;
    return keys;
  }

  _trackPerf(dt, animating) {
    const p = this._framePayload;
    p.dt = dt; p.calls = this.info.calls; p.triangles = this.info.triangles;
    this._emit('frame', p);
    // adaptive: sustained slow frames on 'high' (auto only) drop to 'low' once
    if (this._qualityPref !== 'auto' || this.quality === 'low' || !animating) { this._slowFrames = 0; this._missFrames = 0; return; }
    this._frameCount++;
    if (this._frameCount < 30) return;
    // first step down: sustained missed frames at a pixel ratio above 1.5 render at 1.5 (all features kept)
    if (this.renderer.getPixelRatio() > 1.5) {
      if (dt > 0.0215) this._missFrames = (this._missFrames || 0) + 1; else this._missFrames = Math.max(0, (this._missFrames || 0) - 1);
      if (this._missFrames > 50) { this._missFrames = 0; this._slowFrames = 0; this._dprLimit = 1.5; this._resize(); this.invalidate(); return; }
    }
    if (dt > 0.034) this._slowFrames++; else this._slowFrames = Math.max(0, this._slowFrames - 1);
    if (this._slowFrames > 45) {
      this._slowFrames = 0;
      this._qualityPref = 'auto';
      const pref = this._qualityPref;
      this.setQuality('low');
      this._qualityPref = pref;
    }
  }

  _resize() {
    const w = Math.max(1, this.root.clientWidth), h = Math.max(1, this.root.clientHeight);
    const atOverview = this.gapTarget >= this._overviewGap() * 0.97;
    this._width = w; this._height = h;
    this.root.classList.toggle('is-compact', Math.min(w, h) < 560);
    if (this._tiny && this._tinySize !== (Math.min(w, h) < 560 ? 3.4 : 4.6)) this._syncTinySprites();
    const dpr = Math.min(window.devicePixelRatio || 1, this.params.dprCap, this._dprLimit ?? Infinity);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this._sizeChanged = true;
    this.shared.uRes.value.set(w * dpr, h * dpr);
    this.shared.uDpr.value = dpr;
    this._refit(atOverview);
    if (atOverview && !this._fly) this.gap = this.gapTarget;
    this._labelsDirty = true;
  }
}
