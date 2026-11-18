// The title block: one ruled panel that every screen renders into.
// A render can "turn the sheet": the old panel fades off as a ghost while the new content settles in.
import { esc, icon, isNarrow, reducedMotion } from './dom.js';
import { go } from './nav.js';

const el = document.getElementById('panel');
let sizeListener = null;

function ghostOut() {
  if (!el.children.length || reducedMotion()) return;
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  ghost.classList.add('tb-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, bottom: 'auto', right: 'auto', maxHeight: 'none' });
  const body = ghost.querySelector('.tb-body');
  const oldBody = el.querySelector('.tb-body');
  if (body && oldBody) body.scrollTop = oldBody.scrollTop;
  el.parentNode.append(ghost);
  setTimeout(() => ghost.remove(), 320);
}

export const panel = {
  el,
  render({ left = '', right = '', back = null, body = '', cells = null, focus = false, turn = true, tone = '' }) {
    if (turn) ghostOut();
    const head = back
      ? `<button class="tb-head__back" type="button" data-action="back" data-href="${esc(back)}">${icon.back}<span>${left}</span></button>`
      : `<span>${left}</span>`;
    el.innerHTML = `
      <header class="tb-head">${head}<span class="tb-head__right">${right}</span></header>
      <div class="tb-body">${body}</div>
      ${cells ? `<dl class="tb-cells">${cells.map((c) => `<div class="tb-cell"><dt>${c.label}</dt><dd id="${c.id}">${c.value}</dd></div>`).join('')}</dl>` : ''}`;
    el.dataset.tone = tone;
    if (turn && !reducedMotion()) {
      el.classList.remove('is-entering');
      void el.offsetWidth;
      el.classList.add('is-entering');
    }
    el.scrollTop = 0;
    if (focus) el.focus({ preventScroll: true });
    notify();
    markOverflow();
  },
  body() {
    return el.querySelector('.tb-body');
  },
  cell(id, html) {
    const d = el.querySelector(`#${id}`);
    if (d) d.innerHTML = html;
    return d;
  },
  onResize(fn) {
    sizeListener = fn;
  },
};

el.addEventListener('click', (e) => {
  const back = e.target.closest('[data-action="back"]');
  if (back) go(back.dataset.href);
  const more = e.target.closest('[data-action="more-facts"]');
  if (more) {
    const open = more.previousElementSibling?.classList.toggle('is-open');
    more.setAttribute('aria-expanded', String(!!open));
    more.textContent = open ? 'Fewer facts' : 'More facts';
  }
});
el.addEventListener('animationend', (e) => {
  if (e.target === el.querySelector('.tb-body > :last-child')) el.classList.remove('is-entering');
});

// The fade above an action row only shows when content actually scrolls under it.
function markOverflow() {
  const measure = () => {
    const b = el.querySelector('.tb-body');
    if (b) b.classList.toggle('is-overflowing', b.scrollHeight > b.clientHeight + 4);
  };
  requestAnimationFrame(measure);
  // Measure again once the entrance has settled: content sliding in reads as taller than it is.
  setTimeout(measure, 700);
}
window.addEventListener('resize', markOverflow);

// The globe centres itself in the part of the stage the panel leaves free.
function notify() {
  if (!sizeListener) return;
  requestAnimationFrame(() => {
    const stage = document.getElementById('globe-stage').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!el.children.length) return sizeListener({ x: 0, y: 0 });
    const cx = stage.left + stage.width / 2;
    const cy = stage.top + stage.height / 2;
    if (isNarrow()) {
      sizeListener({ x: 0, y: Math.round((stage.top + r.top) / 2 - cy) });
    } else {
      // A short panel only takes the bottom-left corner, so the globe needs less of a shift.
      const share = Math.min(1, Math.max(0.4, r.height / (stage.height * 0.62)));
      sizeListener({ x: Math.round(((r.right + stage.right) / 2 - cx) * share), y: share < 1 ? -Math.round((1 - share) * 30) : 0 });
    }
  });
}

new ResizeObserver(notify).observe(el);
window.addEventListener('resize', notify);
