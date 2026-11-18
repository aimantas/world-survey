// The compass in the sheet margin. The rose turns with the map's heading; the needle has a little inertia,
// swings when you drag the globe and settles north. In a hint it swings to the target instead and the
// readout gives the distance and direction from the centre of the view.
import { distanceKm, formatKm } from '../game/geo.js';
import { reducedMotion } from './dom.js';

const RAD = Math.PI / 180;
const WINDS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function bearing(a, b) {
  const [la1, lo1, la2, lo2] = [a[0] * RAD, a[1] * RAD, b[0] * RAD, b[1] * RAD];
  const y = Math.sin(lo2 - lo1) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

function roseSvg(mini) {
  const ticks = [];
  for (let a = 0; a < 360; a += mini ? 30 : 10) {
    const long = a % 30 === 0;
    ticks.push(`<line x1="50" y1="${long ? 7 : 8}" x2="50" y2="${long ? 13 : 11}" transform="rotate(${a} 50 50)" stroke="#1b232b" stroke-width="${long ? 1.4 : 0.8}"/>`);
  }
  // Eight-point rose: each point is two triangles, one inked and one left as paper.
  const point = (a, len, w) => `
    <g transform="rotate(${a} 50 50)">
      <path d="M50 ${50 - len} L${50 + w} 50 L50 50 Z" fill="#1b232b"/>
      <path d="M50 ${50 - len} L${50 - w} 50 L50 50 Z" fill="#fbfcf8" stroke="#1b232b" stroke-width="0.7" stroke-linejoin="round"/>
    </g>`;
  const star = [0, 90, 180, 270].map((a) => point(a, 30, 6)).join('') + [45, 135, 225, 315].map((a) => point(a, 19, 4.5)).join('');
  const letters = mini
    ? `<text x="50" y="27" class="compass__n">N</text>`
    : `<text x="50" y="25.5" class="compass__n">N</text><text x="76" y="53.6">E</text><text x="50" y="81">S</text><text x="24" y="53.6">W</text>`;
  return `
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="compass__glow" cx="50" cy="50" r="49" fill="none" stroke="#c3177b" stroke-width="2.4" stroke-dasharray="3 3"/>
      <circle class="compass__bezel" cx="50" cy="50" r="46" fill="#fbfcf8" stroke="#1b232b" stroke-width="1.6"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(27,35,43,.22)" stroke-width="0.8"/>
      <g class="compass__rose">
        ${ticks.join('')}
        ${mini ? '' : star}
        <g class="compass__letters">${letters}</g>
      </g>
      <g class="compass__needle">
        <path class="compass__needle-n" d="M50 ${mini ? 14 : 11} L54 50 L46 50 Z" fill="#c3177b"/>
        <path d="M50 ${mini ? 86 : 89} L54 50 L46 50 Z" fill="#1b232b"/>
        <circle cx="50" cy="50" r="${mini ? 6 : 4.2}" fill="#fbfcf8" stroke="#1b232b" stroke-width="1.4"/>
      </g>
    </svg>
    <span class="compass__readout" hidden></span>`;
}

export function createCompass(app) {
  const { globe, sfx } = app;
  const els = [document.getElementById('compass'), document.getElementById('compass-mini')].filter(Boolean);
  els.forEach((el) => { el.innerHTML = roseSvg(el.classList.contains('compass--mini')); });
  const roses = els.map((el) => el.querySelector('.compass__rose'));
  const needles = els.map((el) => el.querySelector('.compass__needle'));
  const readouts = els.map((el) => el.querySelector('.compass__readout'));

  let heading = 0;
  let theta = 0;
  let omega = 0;
  let target = null;
  let lastCenter = null;
  let raf = 0;
  let last = 0;

  const aim = () => {
    const v = globe.getView?.();
    if (target && v?.center) return bearing(v.center, target) - heading;
    return -heading;
  };

  function draw() {
    for (const r of roses) r.setAttribute('transform', `rotate(${-heading} 50 50)`);
    for (const n of needles) n.setAttribute('transform', `rotate(${theta} 50 50)`);
  }

  function step(t) {
    const dt = Math.min(0.05, (t - (last || t)) / 1000) || 0.016;
    last = t;
    const d = wrap(aim() - theta);
    omega += (d * 70 - omega * 7.5) * dt;
    theta += omega * dt;
    draw();
    if (Math.abs(d) < 0.08 && Math.abs(omega) < 0.08) {
      theta += d;
      draw();
      raf = 0;
      last = 0;
      return;
    }
    raf = requestAnimationFrame(step);
  }
  const kick = () => {
    if (reducedMotion()) { theta = aim(); draw(); return; }
    if (!raf) raf = requestAnimationFrame(step);
  };

  function readout() {
    const v = globe.getView?.();
    const show = !!(target && v?.center);
    for (const r of readouts) {
      r.hidden = !show;
      if (show) {
        const km = distanceKm(v.center, target);
        r.textContent = km < 30 ? 'here' : `${formatKm(km)} ${WINDS[Math.round(bearing(v.center, target) / 45) % 8]}`;
      }
    }
  }

  globe.on('view', (v) => {
    if (typeof v.heading === 'number') heading = v.heading;
    // Dragging the globe nudges the needle sideways, as a real needle would swing.
    if (lastCenter && v.center) {
      const dLng = wrap(v.center[1] - lastCenter[1]) * Math.cos(v.center[0] * RAD);
      const dLat = v.center[0] - lastCenter[0];
      omega += Math.max(-240, Math.min(240, (dLng - dLat * 0.3) * 18));
    }
    lastCenter = v.center;
    readout();
    kick();
  });

  els.forEach((el) => {
    el.addEventListener('click', () => {
      sfx.play('tap');
      if (Math.abs(heading) > 0.5 && globe.resetNorth) {
        globe.resetNorth();
      } else {
        omega += 520; // a playful spin; it settles back on its own
        kick();
      }
    });
  });

  draw();
  return {
    point(latLng) {
      target = latLng;
      els.forEach((el) => {
        el.classList.add('is-hinting');
        el.setAttribute('aria-label', 'Compass pointing toward the answer');
      });
      sfx.play('select');
      readout();
      kick();
    },
    clear() {
      if (!target) return;
      target = null;
      els.forEach((el) => {
        el.classList.remove('is-hinting');
        el.setAttribute('aria-label', 'Compass. Press to turn the map north up.');
      });
      readout();
      kick();
    },
  };
}
