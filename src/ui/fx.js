// Game feel: score pops at the pin, streak banners over the globe.
const sheet = () => document.getElementById('sheet');

export function scorePop(globe, latLng, text, kind = 'good') {
  const stage = document.getElementById('globe-stage');
  const r = stage.getBoundingClientRect();
  let x = r.left + r.width / 2;
  let y = r.top + r.height * 0.42;
  if (latLng && globe.project) {
    const p = globe.project(latLng);
    if (p?.visible) {
      x = r.left + p.x;
      y = r.top + p.y;
    }
  }
  const el = document.createElement('div');
  el.className = `score-pop score-pop--${kind}`;
  el.textContent = text;
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  sheet().append(el);
  setTimeout(() => el.remove(), 1500);
}

const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const MILESTONES = new Set([3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100]);

export function streakBanner(streak) {
  if (!MILESTONES.has(streak)) return false;
  const el = document.createElement('div');
  el.className = 'streak-banner';
  el.innerHTML = `<b>${streak <= 10 ? WORDS[streak] : streak}</b><span>in a row</span>`;
  sheet().append(el);
  setTimeout(() => el.remove(), 1700);
  return true;
}

export function flash(kind) {
  const el = document.createElement('div');
  el.className = `sheet-flash sheet-flash--${kind}`;
  sheet().append(el);
  setTimeout(() => el.remove(), 500);
}
