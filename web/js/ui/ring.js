// The battle ring: a needle spins over a red ring with a green hit zone and a
// bright crit zone. Stop it to attack (tap, click or Space).
import { h } from './dom.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const AUTO_STOP_MS = 8000;

function svg(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function arc(cx, cy, r, from, to) {
  // Fractions of a turn, clockwise from 12 o'clock.
  if (to - from >= 0.9999) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  const p = (f) => [cx + r * Math.sin(f * 2 * Math.PI), cy - r * Math.cos(f * 2 * Math.PI)];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  const large = to - from > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

export function resultAt(f, ring) {
  if (f >= ring.hitEnd && f < ring.critEnd) return 'crit';
  if (f >= ring.hitStart && f < ring.hitEnd) return 'hit';
  return 'miss';
}

/**
 * Shows the ring for `pending` (hitStart, hitEnd, critEnd, spin seconds per turn).
 * Resolves with 'hit' | 'crit' | 'miss'.
 */
export function spinRing(container, pending, { attacker = '', defender = '' } = {}) {
  return new Promise((resolve) => {
    const s = svg('svg', { viewBox: '0 0 200 200', class: 'ring-svg' });
    s.append(
      svg('circle', { cx: 100, cy: 100, r: 92, fill: '#a94a48', stroke: '#1b1b1b', 'stroke-width': 3 }),
      svg('path', { d: arc(100, 100, 92, pending.hitStart, pending.hitEnd), fill: '#30984b', stroke: '#1b1b1b', 'stroke-width': 2 }),
    );
    if (pending.critEnd > pending.hitEnd) {
      s.append(svg('path', { d: arc(100, 100, 92, pending.hitEnd, pending.critEnd), fill: '#16f016', stroke: '#1b1b1b', 'stroke-width': 2 }));
    }
    s.append(
      svg('circle', { cx: 100, cy: 100, r: 22, fill: '#5d7487', stroke: '#1b1b1b', 'stroke-width': 3 }),
      svg('circle', { cx: 100, cy: 100, r: 13, fill: '#9cb4c4' }),
    );
    const needle = svg('g', { class: 'ring-needle' });
    needle.append(
      svg('path', { d: 'M100 14 L106 26 L105 92 L95 92 L94 26 Z', fill: '#dfe7ea', stroke: '#1b1b1b', 'stroke-width': 2 }),
      svg('rect', { x: 86, y: 90, width: 28, height: 7, rx: 2, fill: '#f0b43c', stroke: '#1b1b1b', 'stroke-width': 2 }),
      svg('circle', { cx: 100, cy: 104, r: 6, fill: '#f0b43c', stroke: '#1b1b1b', 'stroke-width': 2 }),
    );
    s.append(needle);

    const label = h('div.ring-result');
    const box = h('div.ring-overlay',
      h('div.ring-title', attacker ? `${attacker} attacks${defender ? ' ' + defender : ''}!` : 'Attack!'),
      h('div.ring-wrap', s, label),
      h('div.ring-help', 'Tap to stop the sword. Green hits, bright green crits.'),
    );
    container.append(box);

    const period = Math.max(0.35, pending.spin || 1.1) * 1000;
    const offset = Math.random();
    const t0 = performance.now();
    let frac = offset;
    let done = false;
    let raf = 0;
    const tick = (t) => {
      frac = (offset + (t - t0) / period) % 1;
      needle.setAttribute('transform', `rotate(${frac * 360} 100 100)`);
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const stop = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      cleanup();
      const r = resultAt(frac, pending);
      label.textContent = r === 'crit' ? 'CRITICAL!' : r === 'hit' ? 'Hit!' : 'Miss';
      label.className = 'ring-result show ' + r;
      setTimeout(() => {
        box.remove();
        resolve(r);
      }, 650);
    };
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        stop();
      }
    };
    const timer = setTimeout(stop, AUTO_STOP_MS);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
    box.addEventListener('pointerdown', (e) => { e.preventDefault(); stop(); });
    window.addEventListener('keydown', onKey);
  });
}
