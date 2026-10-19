
const host = globalThis.document ? document.querySelector('d-figure#fig-ingredients') : null;
const figureName = (fig) => `Figure ${[...document.querySelectorAll('d-title d-figure, d-article d-figure')].indexOf(fig) + 1}`;

export const WORDINGS = [
  {
    id: 'susceptibility',
    quote: 'Disease susceptibility is associated with variants affecting the gene represented in this entry',
    conditions: [{ id: 'mhs1', name: 'Malignant hyperthermia 1' }],
  },
  {
    id: 'caused',
    quote: 'The disease is caused by variants affecting the gene represented in this entry',
    conditions: [
      { id: 'cmyo1a', name: 'Congenital myopathy 1A, autosomal dominant, with susceptibility to malignant hyperthermia' },
      { id: 'cmyo1b', name: 'Congenital myopathy 1B, autosomal recessive' },
      { id: 'kds', name: 'King-Denborough syndrome' },
    ],
  },
];
export const SWITCHES = [
  { id: 'change', label: 'a genetic change' },
  { id: 'trigger', label: 'a trigger' },
];
export const CAVEAT = 'In some cases, stress may serve as an alternative external trigger';
export const TRIGGERED = 'In susceptible people, an MH episode can be triggered by all commonly used inhalational '
  + 'anesthetics such as halothane and by depolarizing muscle relaxants such as succinylcholine';
export const HEADS = { words: 'UniProt\'s two wordings', episode: 'What an episode of malignant hyperthermia needs' };

export function outcome(change, trigger) {
  if (change && trigger) {
    return { episode: true, head: 'An episode can occur.', quote: TRIGGERED, cite: 'uniprot_p21817' };
  }
  if (change) return { episode: false, head: 'No episode.', line: 'With the change alone, the person is susceptible: MH susceptibility.' };
  return { episode: false, head: 'No episode.' };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function quotation(tag, className, text, cite) {
  const node = el(tag, className, `"${text}"`);
  node.dataset.cite = cite;
  return node;
}
const SVG = 'http://www.w3.org/2000/svg';

let built = false;
function build() {
  if (built) return;
  built = true;
  const root = host.querySelector('.figure-root');
  const parts = new Map();
  const add = (id, node) => parts.set(id, [...(parts.get(id) ?? []), node]);

  const words = el('div', 'ing-words');
  words.append(el('p', 'ing-head', HEADS.words));
  const pair = el('div', 'ing-wordings');
  for (const w of WORDINGS) {
    const box = el('div', 'ing-wording');
    box.dataset.part = w.id;
    const list = el('ul', 'ing-conditions');
    for (const c of w.conditions) {
      const item = el('li', 'ing-condition', c.name);
      item.dataset.part = c.id;
      list.append(item);
      add(c.id, item);
    }
    box.append(quotation('p', 'ing-quote', w.quote, 'uniprot_p21817'), list);
    pair.append(box);
    add(w.id, box);
  }
  words.append(pair);

  const episode = el('div', 'ing-episode');
  episode.append(el('p', 'ing-head', HEADS.episode));
  const board = el('div', 'ing-board');
  const on = { change: false, trigger: false };
  const tiles = {};
  const buttons = {};
  for (const s of SWITCHES) {
    const tile = el('div', `ing-tile is-${s.id}`);
    tile.dataset.part = s.id;
    const b = el('button', 'ing-switch');
    b.type = 'button';
    b.dataset.part = s.id;
    b.setAttribute('aria-pressed', 'false');
    const track = el('span', 'ing-track');
    track.setAttribute('aria-hidden', 'true');
    track.append(el('span', 'ing-knob'));
    b.append(track, el('span', 'ing-label', s.label));
    tile.append(b);
    if (s.id === 'trigger') tile.append(quotation('p', 'ing-caveat', CAVEAT, 'vanpetegem2012'));
    board.append(tile);
    tiles[s.id] = tile;
    buttons[s.id] = b;
    add(s.id, tile);
  }
  const out = el('div', 'ing-outcome');
  out.setAttribute('aria-live', 'polite');
  const wires = document.createElementNS(SVG, 'svg');
  wires.setAttribute('class', 'ing-wires');
  wires.setAttribute('aria-hidden', 'true');
  const path = (cls) => {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('class', cls);
    wires.append(p);
    return p;
  };
  const wire = { change: path('ing-wire is-change'), trigger: path('ing-wire is-trigger'), joint: path('ing-wire is-joint') };
  const arrow = path('ing-arrow');
  board.append(out, wires);
  episode.append(board);
  root.replaceChildren(words, episode);

  let lit = null;
  function show() {
    const o = outcome(on.change, on.trigger);
    const head = el('p', 'ing-outcome-head', o.head);
    const lines = [head];
    if (o.line) lines.push(el('p', 'ing-outcome-line', o.line));
    if (o.quote) {
      const p = el('p', 'ing-outcome-line', 'In UniProt\'s words, ');
      p.append(quotation('span', 'ing-outcome-quote', o.quote, o.cite), '.');
      lines.push(p);
    }
    out.replaceChildren(...lines);
    out.classList.toggle('is-episode', o.episode);
    for (const s of SWITCHES) {
      buttons[s.id].setAttribute('aria-pressed', String(on[s.id]));
      tiles[s.id].classList.toggle('is-on', on[s.id]);
      wire[s.id].classList.toggle('is-on', on[s.id]);
    }
    wire.joint.classList.toggle('is-on', o.episode);
    arrow.classList.toggle('is-on', o.episode);
    for (const [id, nodes] of parts) for (const n of nodes) n.classList.toggle('is-lit', !!lit && lit.includes(id));
    root.dataset.state = `change=${on.change ? 'on' : 'off'};trigger=${on.trigger ? 'on' : 'off'};`
      + `episode=${o.episode ? 'can' : 'no'};lit=${lit ? lit.join(',') : 'none'}`;
    drawWires();
  }
  function drawWires() {
    const b = board.getBoundingClientRect();
    if (!b.width) return;
    wires.setAttribute('width', String(b.width));
    wires.setAttribute('height', String(b.height));
    wires.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`);
    const box = (n) => {
      const r = n.getBoundingClientRect();
      return { l: r.left - b.left, r: r.right - b.left, t: r.top - b.top, b: r.bottom - b.top };
    };
    const c = box(tiles.change);
    const t = box(tiles.trigger);
    const o = box(out);
    const mid = (x) => (x.t + x.b) / 2;
    if (o.l >= Math.max(c.r, t.r) - 1) {
      const x0 = Math.max(c.r, t.r);
      const xm = x0 + (o.l - x0) * 0.45;
      const yo = mid(o);
      wire.change.setAttribute('d', `M${c.r},${mid(c)} H${xm} V${yo}`);
      wire.trigger.setAttribute('d', `M${t.r},${mid(t)} H${xm} V${yo}`);
      wire.joint.setAttribute('d', `M${xm},${yo} H${o.l - 7}`);
      arrow.setAttribute('d', `M${o.l - 8},${yo - 5} L${o.l - 1},${yo} L${o.l - 8},${yo + 5} Z`);
    } else {
      const y0 = Math.max(c.b, t.b);
      const ym = y0 + (o.t - y0) * 0.45;
      const xo = (o.l + o.r) / 2;
      wire.change.setAttribute('d', `M${(c.l + c.r) / 2},${c.b} V${ym} H${xo}`);
      wire.trigger.setAttribute('d', `M${(t.l + t.r) / 2},${t.b} V${ym} H${xo}`);
      wire.joint.setAttribute('d', `M${xo},${ym} V${o.t - 7}`);
      arrow.setAttribute('d', `M${xo - 5},${o.t - 8} L${xo},${o.t - 1} L${xo + 5},${o.t - 8} Z`);
    }
  }
  for (const s of SWITCHES) {
    buttons[s.id].addEventListener('click', () => {
      on[s.id] = !on[s.id];
      show();
    });
  }
  new ResizeObserver(() => drawWires()).observe(board);

  for (const link of document.querySelectorAll('.fig-link[data-figure="fig-ingredients"]')) {
    const ids = (link.dataset.part || '').split(/\s+/).filter(Boolean);
    if (!ids.length || ids.some((id) => !parts.has(id))) {
      console.error(`${figureName(host)}: a name in the text links to nothing in the figure (${link.textContent}).`);
      continue;
    }
    link.tabIndex = 0;
    const light = (x) => {
      lit = x;
      show();
    };
    link.addEventListener('pointerenter', () => light(ids));
    link.addEventListener('pointerleave', () => light(null));
    link.addEventListener('focus', () => light(ids));
    link.addEventListener('blur', () => light(null));
  }
  show();
}

if (host) host.addEventListener('ready', build);
