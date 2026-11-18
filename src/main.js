// Boot: data, globe, sound, router, and the sheet's live margins.
import { loadData } from './data.js';
import { Globe } from './globe/globe.js';
import { sfx } from './sfx.js';
import { progress } from './game/progress.js';
import { shareText } from './game/daily.js';
import { panel } from './ui/panel.js';
import { $, esc, medalSvg } from './ui/dom.js';
import { showHome } from './ui/home.js';
import { startGame } from './ui/play.js';
import { startBlitz } from './ui/blitz.js';
import { showChooser } from './ui/chooser.js';
import { startAtlas } from './ui/atlas.js';
import { showMedals, showAbout } from './ui/pages.js';
import { setNavigator } from './ui/nav.js';
import { createCompass } from './ui/compass.js';
import { slugOf } from './ui/facts.js';
import { showCourse, showCourseRegion, startLesson, startReview } from './ui/learn.js';
import { buildCourse } from './game/course.js';
import { decodeChallenge } from './game/challenge.js';
import { CHALLENGE_MODES } from './game/modes.js';
import { setUnits, getUnits, toUnit, fromUnit } from './game/geo.js';
import { ROUTES, SITE, resolve, fromHash, playPath } from './routes.js';

const stage = $('#globe-stage');

panel.render({
  left: 'World Survey',
  right: 'Printing the sheet',
  body: '<p class="lede">Loading the relief, the borders and 195 countries…</p>',
  turn: false,
});

let data;
let globe;
try {
  data = await loadData();
  globe = new Globe(stage, { data, quality: 'auto', assetBase: '/' });
  await globe.ready;
} catch (err) {
  console.error(err);
  $('#globe-fallback').hidden = false;
  panel.render({
    left: 'World Survey',
    right: 'Could not start',
    body: `<p class="verdict">The globe couldn’t start in this browser${data ? '' : ' because the map data didn’t load'}.</p><p class="hint">Reload the page. If it keeps happening, try a current Chrome, Safari or Firefox with hardware acceleration on.</p>`,
  });
  throw err;
}

// ---------- Sound ----------

const settings = progress.get().settings;
sfx.setVolume(settings.volume);
sfx.setEnabled(settings.sound);
const soundBtn = $('#sound-btn');
const syncSound = () => {
  const on = progress.setting('sound');
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
};
syncSound();
soundBtn.addEventListener('click', () => {
  progress.setting('sound', !progress.setting('sound'));
  sfx.setEnabled(progress.setting('sound'));
  syncSound();
  sfx.play('tap');
});
const unlock = () => sfx.unlock();
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

// ---------- Survey meter and globe tint ----------

const isoList = data.sovereign.map((c) => c.iso3);
$('#meter-total').textContent = isoList.length;
function syncMeter() {
  const n = progress.surveyedCount(isoList);
  $('#meter-count').textContent = n;
  $('#meter-bar').style.setProperty('--fill', `${(n / isoList.length) * 100}%`);
}
syncMeter();
progress.onChange(syncMeter);

function applySurvey(force = false) {
  const m = progress.get().mastery;
  const any = Object.values(m).some((v) => v > 0);
  globe.setSurveyed(any || force ? m : null);
}

// ---------- Units: kilometres, or miles where people think in them ----------

const MILE_LOCALES = /^en-(US|LR)\b|^my\b/;
setUnits(progress.setting('units') || (MILE_LOCALES.test(navigator.language || '') ? 'mi' : 'km'));

// ---------- Margins: coordinates, scale bar, map scale ----------

const coordTL = $('[data-coord="tl"]');
const coordBR = $('[data-coord="br"]');
const fmtLat = (v) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLng = (v) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}`;
const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
function onView(v) {
  if (!v?.center) return;
  // The legend only shows once you're zoomed in; at the overview it would sit on the globe's ring.
  document.body.classList.toggle('is-overview', v.distance >= globe.overviewDistance() * 0.8);
  const [lat, lng] = v.center;
  coordTL.textContent = `${fmtLat(lat)} ${fmtLng(lng)}`;
  coordBR.textContent = `Centre of sheet · ${fmtLat(lat)} ${fmtLng(lng)}`;
  if (v.kmPerPx) {
    const target = toUnit(v.kmPerPx * 120);
    const len = NICE.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best), NICE[0]);
    $('#scalebar-bar').style.setProperty('--bar', `${Math.round(fromUnit(len) / v.kmPerPx)}px`);
    $('#scalebar-km').textContent = `${len.toLocaleString('en-GB')} ${getUnits()}`;
    const denom = (v.kmPerPx * 1e6) / 0.2646; // CSS px is 0.2646 mm
    const rounded = Number(denom.toPrecision(2));
    $('#map-scale').textContent = `1 : ${rounded.toLocaleString('en-GB').replace(/,/g, ' ')}`;
  }
}
globe.on('view', onView);
if (globe.getView) onView(globe.getView());

// The scale bar is the units switch: press it to read distances in miles or kilometres.
const unitsBtn = $('#units-btn');
function syncUnits() {
  unitsBtn?.setAttribute('aria-label', `Distances in ${getUnits() === 'mi' ? 'miles' : 'kilometres'}. Press to switch.`);
  if (globe.getView) onView(globe.getView());
}
function switchUnits() {
  setUnits(getUnits() === 'mi' ? 'km' : 'mi');
  progress.setting('units', getUnits());
  sfx.play('tap');
  syncUnits();
}
unitsBtn?.addEventListener('click', switchUnits);
syncUnits();

panel.onResize((offset) => globe.setViewOffset?.(offset));

// Hover cursor
globe.on('hover', ({ iso3 }) => {
  stage.classList.toggle('is-hovering', !!iso3);
  if (iso3) sfx.play('hover');
});

// ---------- Toasts ----------

const toasts = $('#toasts');
function toastMedal(m) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${medalSvg(false)}<div><b>Medal earned</b><span>${esc(m.name)}</span></div>`;
  toasts.append(t);
  setTimeout(() => t.classList.add('is-out'), 3600);
  setTimeout(() => t.remove(), 4100);
}
function toastText(text, label = 'Copied') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${medalSvg(false)}<div><b>${esc(label)}</b><span>${esc(text)}</span></div>`;
  toasts.append(t);
  setTimeout(() => t.classList.add('is-out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

async function shareDaily(date) {
  const entry = progress.get().daily[date];
  if (!entry) return;
  const text = shareText({ date, score: entry.score, grades: entry.grades });
  sfx.play('tap');
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      toastText('Result copied to the clipboard');
    }
  } catch {
    /* share sheet dismissed */
  }
}

// Share sheet on phones, clipboard elsewhere.
async function share({ text, url, copied = 'Link copied' }) {
  sfx.play('tap');
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text, url });
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toastText(copied);
    }
  } catch {
    /* share sheet dismissed, or the clipboard is blocked */
  }
}

// Screen readers hear each verdict; the title block itself is replaced too often to be a live region.
const live = $('#live');
function announce(text) {
  if (!live || !text) return;
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = text.replace(/\s+/g, ' ').trim(); });
}

// ---------- Router ----------

const course = buildCourse(data.countries);
const app = {
  data, globe, sfx, panel, course, applySurvey, toastMedal, toastText, shareDaily, share, announce, switchUnits,
  restart: () => route(true),
  go: (p) => navigate(p),
  // A session that has no URL of its own (practising the misses of the game just played).
  runSession(opts) {
    active?.stop?.();
    active = startGame(app, opts);
  },
};
let active = null;
app.compass = createCompass(app);
if (new URLSearchParams(location.search).has('debug')) window.__ws = app;

// Real paths (/play/find/, /atlas/lithuania/) so every screen has its own indexable URL.
// Old hash links (#/play/find) are rewritten to their path on load.
const isoBySlug = new Map(data.countries.map((c) => [slugOf(c.name), c.iso3]));
const slugByIso = new Map(data.countries.map((c) => [c.iso3, slugOf(c.name)]));
const ROUTE_META = new Map(ROUTES.map((r) => [r.path, r]));
const ROUTE_BY_PATH_GET = (p) => ROUTE_META.get(p);

function route(force = false) {
  const r = resolve(location.pathname);
  const params = new URLSearchParams(location.search);
  active?.stop?.();
  active = null;
  const section = r.path.split('/').filter(Boolean)[0] || '';
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (r.unknown && location.pathname !== '/') history.replaceState(null, '', '/');

  const s = progress.get().settings;
  let region = r.region || params.get('region') || s.region;
  let difficulty = params.get('difficulty') || s.difficulty;
  // A saved region shows in the address, so the page you share is the page you played.
  const regional = (r.view === 'play' || r.view === 'blitz') && r.mode !== 'higherlower' && r.mode !== 'lookalikes';
  if (regional && !r.region && region !== 'World' && !params.has('c')) {
    const path = playPath(r.mode, region);
    history.replaceState(null, '', path);
    Object.assign(r, resolve(path));
  }
  const lesson = r.view === 'lesson' ? course.bySlug.get(r.slug) : null;
  setHead(r, lesson);

  // ?c=… is a challenge: the same countries and options as the game it came from, and its score to beat.
  const challenge = r.view === 'play' && CHALLENGE_MODES.includes(r.mode) ? decodeChallenge(params.get('c'), data) : null;
  if (r.view === 'blitz') {
    active = startBlitz(app, { region, difficulty });
  } else if (challenge) {
    difficulty = challenge.difficulty;
    active = startGame(app, {
      mode: r.mode, region, difficulty,
      session: {
        kind: 'challenge', seed: challenge.seed, beat: challenge.beat,
        script: challenge.iso3s.map((iso3) => ({ mode: r.mode, iso3 })),
        sideLabel: `Beat ${challenge.beat.toLocaleString('en-GB')}`,
      },
    });
  } else if (r.view === 'play') {
    active = startGame(app, { mode: r.mode, region, difficulty, preset: r.preset });
  } else if (r.view === 'learn') {
    if (r.region) showCourseRegion(app, r.region);
    else showCourse(app);
  } else if (r.view === 'lesson') {
    if (!lesson) return navigate('/learn/', { replace: true });
    active = startLesson(app, lesson);
  } else if (r.view === 'review') {
    active = startReview(app);
  } else if (r.view === 'chooser') {
    showChooser(app, r.which);
  } else if (r.view === 'daily') {
    const done = progress.get().daily[new Date().toISOString().slice(0, 10)];
    if (done && !force) return navigate('/', { replace: true });
    active = startGame(app, { mode: 'daily', region: 'World', difficulty: 'normal' });
  } else if (r.view === 'atlas') {
    active = startAtlas(app, r.slug ? isoBySlug.get(r.slug) : null);
  } else if (r.view === 'medals') {
    showMedals(app);
  } else if (r.view === 'about') {
    showAbout(app);
  } else {
    showHome(app);
  }
}

// Title, description and canonical follow the route, so a rendered page matches its pre-built shell.
const headDesc = document.querySelector('meta[name="description"]');
const headCanon = document.querySelector('link[rel="canonical"]');
function setHead(r, lesson) {
  const base = ROUTE_BY_PATH_GET(r.canonical || r.path) || ROUTE_BY_PATH_GET('/');
  let title = base.title;
  let desc = base.description;
  let canon = r.canonical || r.path;
  if (lesson) {
    title = `${lesson.name}: learn ${lesson.iso3.length} countries · World Survey`;
    desc = `Lesson ${lesson.number} of the World Survey field course: ${lesson.iso3.map((iso) => data.get(iso).name).join(', ')}. Study them on a 3D globe, then find and name them.`;
    canon = lesson.path;
  }
  document.title = title;
  if (headDesc && r.view !== 'atlas') headDesc.setAttribute('content', desc);
  if (headCanon && r.view !== 'atlas') headCanon.setAttribute('href', SITE + canon);
}

function navigate(path, { replace = false } = {}) {
  const url = new URL(path, location.origin);
  if (url.pathname + url.search !== location.pathname + location.search) {
    history[replace ? 'replaceState' : 'pushState'](null, '', url.pathname + url.search);
  }
  route();
}
setNavigator(navigate);

// Same-origin links into the game are handled here; /countries/ pages and files load normally.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/countries/') || /\.[a-z0-9]+$/i.test(url.pathname)) return;
  if (resolve(url.pathname).unknown && url.pathname !== '/') return;
  e.preventDefault();
  navigate(url.pathname + url.search);
});

// ---------- Offline and install ----------

// The service worker keeps a copy of the game so it starts without a connection after one visit.
// It is built into dist/ (tools/sw); the source folder has none, and a failed registration is harmless.
if ('serviceWorker' in navigator && window.isSecureContext && !new URLSearchParams(location.search).has('debug')) {
  setTimeout(() => navigator.serviceWorker.register('/sw.js').catch(() => {}), 2500);
}
// Browsers that can install the game say so; the home sheet then shows an Install link.
let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  document.body.classList.add('can-install');
});
window.addEventListener('appinstalled', () => document.body.classList.remove('can-install'));
app.install = async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice.catch(() => {});
  installEvent = null;
  document.body.classList.remove('can-install');
};

window.addEventListener('popstate', () => route());
if (location.hash.startsWith('#/')) {
  const path = fromHash(location.hash, (iso) => slugByIso.get(iso.toUpperCase()));
  history.replaceState(null, '', path || '/');
}
route();
