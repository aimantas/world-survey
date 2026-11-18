// World Survey sound. Every cue is synthesized with Web Audio when it plays: no files, no libraries.
// The palette is paper, wood, brass and ink. Nothing makes a sound (or creates an AudioContext)
// until sfx.unlock() runs inside a user gesture.

const NAMES = [
  'hover', 'tap', 'select', 'pin', 'correct', 'perfect', 'close', 'miss',
  'streak', 'whoosh', 'reveal', 'achievement', 'countdown', 'start', 'finish',
];

const STORE_KEY = 'geo-survey:sfx:v1';
const TRIM = 0.6;            // full volume still sits well below full scale
const MAX_VOICES = 24;
const LEAD = 0.006;          // schedule slightly ahead so every cue starts on its own ramp
const SILENT = 0.0001;       // -80 dB: where every envelope ends before its source stops
const STREAK_CAP = 9;        // ten pitches, A4 to F#6, then it holds

// Per-cue level, the one place to rebalance the mix. Tuned from offline peak/RMS readings, not by ear.
const MIX = {
  hover: 0.5, tap: 0.67, select: 1, pin: 0.75, correct: 0.62, perfect: 0.6, close: 0.7, miss: 1,
  streak: 1.4, whoosh: 0.75, reveal: 1.6, achievement: 2.2, countdown: 0.8, start: 1, finish: 1,
};

const PENTA = [0, 2, 4, 7, 9];                    // D major pentatonic
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (x, fallback) => (Number.isFinite(x) ? x : fallback);

// ---------------------------------------------------------------- state

let volume = 0.7;
let muted = false;
let enabled = true;
let live = null;             // the engine for the real AudioContext, created by unlock()
let wakeAt = -Infinity;
const lastPlayed = {};
const warned = new Set();

try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (saved) {
    if (Number.isFinite(saved.volume)) volume = clamp(saved.volume, 0, 1);
    if (typeof saved.muted === 'boolean') muted = saved.muted;
  }
} catch { /* storage blocked: keep defaults in memory */ }

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ volume, muted })); } catch { /* ignore */ }
}

const levelFor = (v) => TRIM * v * v;   // squared: the slider feels even across its travel
const targetGain = () => (enabled && !muted ? levelFor(volume) : 0);

// ---------------------------------------------------------------- engine

function createEngine(c) {
  const e = { c, voices: 0 };
  e.bus = c.createGain();

  const rumble = c.createBiquadFilter();
  rumble.type = 'highpass';
  rumble.frequency.value = 40;

  const glue = c.createDynamicsCompressor();
  set(glue, { threshold: -16, knee: 10, ratio: 2.5, attack: 0.004, release: 0.18 });
  const limit = c.createDynamicsCompressor();
  set(limit, { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.06 });
  // A new compressor starts fully clamped and takes ~0.2 s to open, which would swallow the
  // first tap after unlock. Release instantly for the first 40 ms, then use the real values.
  for (const [node, release] of [[glue, 0.18], [limit, 0.06]]) {
    node.release.setValueAtTime(0, c.currentTime);
    node.release.setValueAtTime(release, c.currentTime + 0.04);
  }

  e.master = c.createGain();
  e.master.gain.value = 0;
  e.bus.connect(rumble);
  rumble.connect(glue);
  glue.connect(limit);
  limit.connect(e.master);
  e.master.connect(c.destination);

  // A small, soft room so dry synth tones read as objects on a desk.
  e.roomIn = c.createGain();
  const room = c.createConvolver();
  room.buffer = roomImpulse(c);
  e.roomIn.connect(room);
  room.connect(e.bus);

  e.noise = noiseBuffer(c);
  return e;
}

function set(node, params) {
  for (const [k, v] of Object.entries(params)) node[k].value = v;
}

function noiseBuffer(c) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 1.5), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function roomImpulse(c) {
  const sr = c.sampleRate;
  const len = Math.floor(sr * 0.26);
  const pre = Math.floor(sr * 0.006);
  const buf = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      lp += 0.3 * ((Math.random() * 2 - 1) - lp);             // darken: paper and wood, not tile
      const fadeIn = Math.min(1, (i - pre) / (sr * 0.002));
      d[i] = lp * Math.exp(-6.9 * x) * fadeIn;                 // -60 dB by the end
    }
  }
  return buf;
}

// ---------------------------------------------------------------- voices
// A voice owns every node one cue creates. When its last source ends, all of them disconnect.

function voice(e, o, { mix = 1, room = 0, lp = 0 } = {}) {
  const c = e.c;
  const v = { e, c, nodes: [], live: 0, pan: null };
  v.out = keep(v, c.createGain());
  v.out.gain.value = mix;
  let tail = v.out;
  if (lp) {
    const f = keep(v, c.createBiquadFilter());
    f.type = 'lowpass';
    f.frequency.value = lp;
    f.Q.value = 0.5;
    tail.connect(f);
    tail = f;
  }
  if (c.createStereoPanner) {
    v.pan = keep(v, c.createStereoPanner());
    v.pan.pan.value = clamp(num(o.pan, 0), -1, 1);
    tail.connect(v.pan);
    tail = v.pan;
  }
  tail.connect(e.bus);
  if (room) {
    const send = keep(v, c.createGain());
    send.gain.value = room;
    tail.connect(send);
    send.connect(e.roomIn);
  }
  e.voices++;
  return v;
}

function keep(v, node) {
  v.nodes.push(node);
  return node;
}

function run(v, src, t0, t1, offset) {
  v.live++;
  src.onended = () => { if (--v.live === 0) release(v); };
  if (offset === undefined) src.start(t0);
  else src.start(t0, offset);
  src.stop(t1);
}

function release(v) {
  for (const n of v.nodes) {
    try { n.disconnect(); } catch { /* already gone */ }
  }
  v.nodes.length = 0;
  v.e.voices--;
}

// Silence, a linear rise of `a` seconds to `peak`, then an exponential fade over `d` seconds.
function env(param, t, a, peak, d) {
  param.value = 0;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(Math.max(peak, SILENT * 2), t + a);
  param.exponentialRampToValueAtTime(SILENT, t + a + d);
  return t + a + d;
}

// ---------------------------------------------------------------- building blocks

function tone(v, { t, f, f2, glide, type = 'sine', a = 0.003, d = 0.2, peak = 0.1, to = v.out }) {
  const o = keep(v, v.c.createOscillator());
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + num(glide, a + d));
  const g = keep(v, v.c.createGain());
  const end = env(g.gain, t, a, peak, d);
  o.connect(g);
  g.connect(to);
  run(v, o, t, end + 0.02);
}

function noise(v, { t, type = 'bandpass', f = 2000, f2, glide, q = 1, a = 0.002, d = 0.05, peak = 0.1, to = v.out }) {
  const c = v.c;
  const s = keep(v, c.createBufferSource());
  s.buffer = v.e.noise;
  s.loop = true;
  const flt = keep(v, c.createBiquadFilter());
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + num(glide, a + d));
  const g = keep(v, c.createGain());
  const end = env(g.gain, t, a, peak, d);
  s.connect(flt);
  flt.connect(g);
  g.connect(to);
  run(v, s, t, end + 0.02, rand(0, s.buffer.duration - 0.05));
}

// Struck wood: a contact tick and a short body resonance with one inharmonic mode.
function wood(v, { t, f = 1200, peak = 0.12, d = 0.045 }) {
  noise(v, { t, f: f * 2.6, q: 2.5, a: 0.001, d: 0.008, peak: peak * 0.9 });
  tone(v, { t, f, f2: f * 0.94, a: 0.0015, d, peak });
  tone(v, { t, f: f * 2.57, a: 0.001, d: d * 0.4, peak: peak * 0.3 });
}

// Marimba bar: modes near 1x, 3.9x and 9.2x; the upper ones die quickly. `bright` softens the mallet.
function mallet(v, { t, f, peak = 0.12, d = 0.4, bright = 1 }) {
  tone(v, { t, f, a: 0.004, d, peak });
  tone(v, { t, f: f * 3.93, a: 0.002, d: d * 0.18, peak: peak * 0.22 * bright });
  tone(v, { t, f: f * 9.2, a: 0.001, d: d * 0.06, peak: peak * 0.07 * bright });
  noise(v, { t, f: Math.min(f * 6, 9000), q: 1.2, a: 0.001, d: 0.012, peak: peak * 0.5 * bright });
}

// A clean small bell: strong fundamental, a quiet octave and a fast inharmonic shimmer.
function bell(v, { t, f, peak = 0.08, d = 0.8 }) {
  tone(v, { t, f, a: 0.002, d, peak });
  tone(v, { t, f: f * 2, a: 0.002, d: d * 0.5, peak: peak * 0.28 });
  tone(v, { t, f: f * 2.76, a: 0.001, d: d * 0.22, peak: peak * 0.16 });
  tone(v, { t, f: f * 5.4, a: 0.001, d: d * 0.07, peak: peak * 0.06 });
}

// Rubber stamp on paper: felt thump, broad slap, a small ring from the handle, then the lift.
function stamp(v, t, i) {
  const k = 0.55 + 0.45 * i;
  tone(v, { t, f: 115 + 35 * i, f2: 52, glide: 0.09, a: 0.002, d: 0.15, peak: 0.5 * k });
  tone(v, { t, type: 'triangle', f: 220, f2: 120, glide: 0.05, a: 0.002, d: 0.06, peak: 0.16 * k });
  noise(v, { t, f: 900 + 900 * i, q: 0.6, a: 0.001, d: 0.07 + 0.03 * i, peak: 0.55 * k });
  noise(v, { t: t + 0.002, type: 'highpass', f: 3500, q: 0.7, a: 0.001, d: 0.03, peak: 0.16 * k });
  tone(v, { t: t + 0.01, f: midi(86), a: 0.004, d: 0.32, peak: 0.03 * (0.4 + i) });
  tone(v, { t: t + 0.01, f: midi(93), a: 0.003, d: 0.16, peak: 0.012 * (0.4 + i) });
  noise(v, { t: t + 0.16, f: 2400, q: 1.2, a: 0.02, d: 0.08, peak: 0.05 * k });
}

const streakNote = (idx) => 62 + 12 * Math.floor((idx + 3) / 5) + PENTA[(idx + 3) % 5];

// ---------------------------------------------------------------- the cues

const SOUNDS = {
  hover(e, t, o) {
    const v = voice(e, o, { mix: MIX.hover });
    noise(v, { t, f: rand(3800, 6000), q: rand(1.4, 2.6), a: 0.0015, d: rand(0.008, 0.016), peak: rand(0.08, 0.11) });
  },

  tap(e, t, o) {
    const v = voice(e, o, { mix: MIX.tap, room: 0.04, lp: 5200 });
    wood(v, { t, f: rand(1150, 1250), peak: 0.13, d: 0.04 });
  },

  select(e, t, o) {
    const v = voice(e, o, { mix: MIX.select, room: 0.08, lp: 6000 });
    wood(v, { t, f: rand(960, 1010), peak: 0.1, d: 0.05 });
    mallet(v, { t: t + 0.004, f: midi(74), peak: 0.09, d: 0.18, bright: 0.5 });
  },

  pin(e, t, o) {
    const v = voice(e, o, { mix: MIX.pin, room: 0.06 });
    noise(v, { t, f: rand(5000, 5600), q: 3, a: 0.001, d: 0.006, peak: 0.2 });
    tone(v, { t, f: rand(3000, 3200), a: 0.001, d: 0.03, peak: 0.02 });
    tone(v, { t: t + 0.012, f: 150, f2: 70, glide: 0.07, a: 0.003, d: 0.09, peak: 0.24 });
    noise(v, { t: t + 0.012, type: 'lowpass', f: 600, q: 0.7, a: 0.002, d: 0.05, peak: 0.12 });
  },

  correct(e, t, o) {
    const v = voice(e, o, { mix: MIX.correct, room: 0.12 });
    stamp(v, t, clamp(num(o.intensity, 0.7), 0, 1));
  },

  perfect(e, t, o) {
    const v = voice(e, o, { mix: MIX.perfect, room: 0.16 });
    stamp(v, t, Math.max(0.8, clamp(num(o.intensity, 1), 0, 1)));
    bell(v, { t: t + 0.09, f: midi(81), peak: 0.1, d: 0.6 });
    bell(v, { t: t + 0.22, f: midi(86), peak: 0.11, d: 0.75 });
  },

  close(e, t, o) {
    const v = voice(e, o, { mix: MIX.close, room: 0.08, lp: 1500 });
    mallet(v, { t, f: midi(57), peak: 0.16, d: 0.24, bright: 0.35 });
    mallet(v, { t, f: midi(64), peak: 0.08, d: 0.2, bright: 0.3 });
    noise(v, { t, type: 'lowpass', f: 450, q: 0.7, a: 0.002, d: 0.05, peak: 0.1 });
  },

  miss(e, t, o) {
    const v = voice(e, o, { mix: MIX.miss, room: 0.1 });
    mallet(v, { t, f: midi(57), peak: 0.15, d: 0.28, bright: 0.5 });
    mallet(v, { t: t + 0.16, f: midi(54), peak: 0.15, d: 0.42, bright: 0.45 });
    for (const dt of [0.2, 0.27]) {             // crossed out in pencil, back and forth
      noise(v, { t: t + dt + rand(0, 0.01), f: rand(2800, 4200), f2: rand(2600, 4400), q: 1.6, a: 0.012, d: 0.06, peak: 0.035 });
    }
  },

  streak(e, t, o) {
    const idx = clamp(Math.round(num(o.step, 1)) - 1, 0, STREAK_CAP);
    const f = midi(streakNote(idx));
    const level = 0.1 * (1 - idx * 0.035);      // high notes read louder; keep them level
    const v = voice(e, o, { mix: MIX.streak, room: 0.18 });
    bell(v, { t, f, peak: level, d: 0.75 });
    noise(v, { t, f: Math.min(f * 4, 9000), q: 2, a: 0.001, d: 0.01, peak: level * 0.6 });
    if (idx >= 4) tone(v, { t, f: f / 2, a: 0.004, d: 0.5, peak: level * 0.35 });
  },

  whoosh(e, t, o) {
    const i = clamp(num(o.intensity, 0.5), 0, 1);
    const dur = 0.32 + 0.58 * i;
    const peakAt = dur * 0.42;
    const top = 700 + 1700 * i;
    const v = voice(e, o, { mix: MIX.whoosh, room: 0.08 });
    const c = e.c;
    if (v.pan && !Number.isFinite(o.pan)) {
      v.pan.pan.setValueAtTime(-0.3, t);
      v.pan.pan.linearRampToValueAtTime(0.3, t + dur);
    }
    const layers = [['bandpass', 0.8, 0.22 * (0.6 + 0.4 * i), 260, top], ['lowpass', 0.7, 0.12 * (0.6 + 0.4 * i), 180, top * 0.35]];
    for (const [type, q, level, f0, f1] of layers) {
      const s = keep(v, c.createBufferSource());
      s.buffer = e.noise;
      s.loop = true;
      const flt = keep(v, c.createBiquadFilter());
      flt.type = type;
      flt.Q.value = q;
      flt.frequency.setValueAtTime(f0, t);
      flt.frequency.exponentialRampToValueAtTime(f1, t + peakAt);
      flt.frequency.exponentialRampToValueAtTime(f0 * 1.2, t + dur);
      const g = keep(v, c.createGain());
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + peakAt);
      g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
      s.connect(flt);
      flt.connect(g);
      g.connect(v.out);
      run(v, s, t, t + dur + 0.02, rand(0, 0.5));
    }
  },

  reveal(e, t, o) {
    const v = voice(e, o, { mix: MIX.reveal, room: 0.1 });
    noise(v, { t, f: 900, f2: 1600, q: 0.6, a: 0.08, d: 0.3, peak: 0.05 });
    const grains = 7;
    for (let k = 0; k < grains; k++) {
      const tk = t + (k / grains) ** 1.3 * 0.32 + rand(0, 0.02);
      noise(v, { t: tk, f: rand(1800, 5200), q: rand(0.8, 2.2), a: 0.002, d: rand(0.015, 0.045), peak: rand(0.05, 0.09) * (1 - (k / grains) * 0.5) });
    }
  },

  achievement(e, t, o) {
    const v = voice(e, o, { mix: MIX.achievement, room: 0.22 });
    const c = e.c;
    const end = t + 1.8;
    const filter = keep(v, c.createBiquadFilter());
    filter.type = 'lowpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(320, t);
    filter.frequency.exponentialRampToValueAtTime(2300, t + 0.32);
    filter.frequency.exponentialRampToValueAtTime(800, t + 1.5);
    const amp = keep(v, c.createGain());
    amp.gain.value = 0;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(1, t + 0.26);
    amp.gain.linearRampToValueAtTime(0.75, t + 0.7);
    amp.gain.exponentialRampToValueAtTime(SILENT, end - 0.02);
    filter.connect(amp);
    amp.connect(v.out);

    const lfo = keep(v, c.createOscillator());
    lfo.frequency.value = 5.2;
    const depth = keep(v, c.createGain());       // vibrato in cents, arriving after the attack
    depth.gain.value = 0;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(5, t + 0.5);
    lfo.connect(depth);
    run(v, lfo, t, end);

    [[50, 1], [57, 0.8], [62, 0.7], [66, 0.6]].forEach(([note, w], k) => {
      const tk = t + k * 0.035;                   // the chord blooms from the bottom up
      for (const cents of [-7, 6]) {
        const osc = keep(v, c.createOscillator());
        osc.type = 'sawtooth';
        osc.frequency.value = midi(note);
        osc.detune.value = cents;
        depth.connect(osc.detune);
        const g = keep(v, c.createGain());
        g.gain.value = 0;
        g.gain.setValueAtTime(0, tk);
        g.gain.linearRampToValueAtTime(0.035 * w, tk + 0.12);
        osc.connect(g);
        g.connect(filter);
        run(v, osc, tk, end);
      }
    });
    noise(v, { t, f: 1200, q: 0.8, a: 0.05, d: 0.2, peak: 0.02 });   // breath at the mouthpiece
  },

  countdown(e, t, o) {
    const v = voice(e, o, { mix: MIX.countdown, room: 0.05 });
    const last = Math.round(num(o.step, 3)) === 1;   // step = seconds left; the final tick sits higher
    wood(v, { t, f: last ? 1720 : 1480, peak: 0.1, d: 0.035 });
  },

  start(e, t, o) {
    const v = voice(e, o, { mix: MIX.start, room: 0.06, lp: 6000 });
    wood(v, { t, f: 1180, peak: 0.11, d: 0.04 });
    wood(v, { t: t + 0.095, f: 1580, peak: 0.12, d: 0.045 });
  },

  finish(e, t, o) {
    const v = voice(e, o, { mix: MIX.finish, room: 0.2, lp: 6000 });
    mallet(v, { t, f: midi(69), peak: 0.12, d: 0.35 });
    mallet(v, { t: t + 0.15, f: midi(73), peak: 0.12, d: 0.35 });
    mallet(v, { t: t + 0.32, f: midi(74), peak: 0.14, d: 1.0 });
    bell(v, { t: t + 0.32, f: midi(86), peak: 0.025, d: 0.9 });
    tone(v, { t: t + 0.3, f: midi(50), a: 0.06, d: 1.2, peak: 0.08 });
    tone(v, { t: t + 0.3, f: midi(57), a: 0.06, d: 1.1, peak: 0.05 });
  },
};

// ---------------------------------------------------------------- context lifecycle

function wake() {
  if (!live) return;
  const c = live.c;
  if (c.state === 'running' || c.state === 'closed' || document.hidden) return;
  wakeAt = performance.now();
  try {
    const p = c.resume();
    if (p && p.catch) p.catch(() => {});
  } catch { /* not allowed yet; the next gesture tries again */ }
}

function onVisibility() {
  if (!live) return;
  if (document.hidden) {
    if (live.c.state === 'running') live.c.suspend().catch(() => {});
  } else {
    wake();
  }
}

// iOS opens the output only after something plays inside the gesture.
function prime(c) {
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, c.sampleRate);
  src.connect(c.destination);
  src.onended = () => src.disconnect();
  src.start(0);
}

function canPlay() {
  const s = live.c.state;
  if (s === 'running') return true;
  // Just unlocked or resumed in this gesture: the context is about to run, so don't drop the first tap.
  return s !== 'closed' && !document.hidden && performance.now() - wakeAt < 400;
}

function applyGain() {
  if (!live) return;
  live.master.gain.setTargetAtTime(targetGain(), live.c.currentTime, 0.02);
}

// ---------------------------------------------------------------- public API

export const sfx = {
  names: NAMES.slice(),

  unlock() {
    if (typeof window === 'undefined') return;
    if (!live) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        // Ambient: mixes with the player's own audio and follows the iOS silent switch.
        if (navigator.audioSession) navigator.audioSession.type = 'ambient';
      } catch { /* unsupported */ }
      try {
        live = createEngine(new AC({ latencyHint: 'interactive' }));
      } catch {
        live = null;
        return;
      }
      live.master.gain.value = targetGain();
      document.addEventListener('visibilitychange', onVisibility);
      for (const type of ['pointerdown', 'keydown', 'touchend']) {
        window.addEventListener(type, wake, { capture: true, passive: true });
      }
    }
    if (live.c.state !== 'running') {
      wake();
      try { prime(live.c); } catch { /* harmless */ }
    }
  },

  play(name, opts = {}) {
    const fn = SOUNDS[name];
    if (!fn) {
      if (!warned.has(name)) { warned.add(name); console.warn(`sfx: unknown sound "${name}"`); }
      return;
    }
    if (!live || !enabled || muted || !canPlay()) return;
    const now = performance.now();
    const gap = name === 'hover' ? 70 : 30;       // also swallows pointer + click double fires
    if (now - (lastPlayed[name] ?? -Infinity) < gap) return;
    if (live.voices >= MAX_VOICES) return;
    lastPlayed[name] = now;
    try {
      fn(live, live.c.currentTime + LEAD, opts || {});
    } catch { /* sound must never break the game */ }
  },

  setVolume(v) {
    volume = clamp(num(Number(v), volume), 0, 1);
    persist();
    applyGain();
  },
  getVolume: () => volume,

  setMuted(m) {
    muted = !!m;
    persist();
    applyGain();
  },
  isMuted: () => muted,

  setEnabled(on) {
    enabled = !!on;
    applyGain();
  },
  isEnabled: () => enabled,

  // For the audition page: context state and live voice count.
  debug: () => ({ context: live ? live.c.state : 'locked', voices: live ? live.voices : 0 }),

  // Render one cue offline at a given volume (ignores mute). Used by sfx-test.html to measure cues.
  async renderOffline(name, opts = {}, { volume: vol = 1, seconds = 2.4, sampleRate = 44100 } = {}) {
    const fn = SOUNDS[name];
    if (!fn) throw new Error(`unknown sound "${name}"`);
    const c = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const e = createEngine(c);
    e.master.gain.value = levelFor(clamp(vol, 0, 1));
    fn(e, 0.01, opts || {});
    const buffer = await c.startRendering();
    await new Promise((r) => setTimeout(r, 30));  // let `ended` events run
    return { buffer, voicesLeft: e.voices };
  },
};

export default sfx;
