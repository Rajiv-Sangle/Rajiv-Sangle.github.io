
const NS = 'http://www.w3.org/2000/svg';
export const SUBUNIT_COLOURS = ['#0072B2', '#E69F00', '#009E73', '#CC79A7'];

function make(tag, attrs, parent, text) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  if (parent) parent.append(node);
  return node;
}

function label(parent, x, y, lines, attrs = {}) {
  const t = make('text', { x, y, class: 'sch-label', ...attrs }, parent);
  [].concat(lines).forEach((line, i) => make('tspan', { x, dy: i ? '1.15em' : 0 }, t, line));
  return t;
}

const PER_ANGSTROM = 290 / 270;
const X = 200;
const CAP = { top: 40, half: 135 * PER_ANGSTROM, height: 100 * PER_ANGSTROM };
const STALK = { half: 60 * PER_ANGSTROM, height: 60 * PER_ANGSTROM };
const M = CAP.top + CAP.height;
const MB = M + STALK.height;
const HEIGHT = Math.ceil(MB + 34);
const GATE = M + 2;
const aboveGate = (angstroms) => GATE - angstroms * PER_ANGSTROM;
const D = {
  gap: 7, vestibule: 25, nterm: 50,
  csol: 36 * PER_ANGSTROM, column: 75 * PER_ANGSTROM, corona: 107 * PER_ANGSTROM,
};
const Y = { nterm: CAP.top + 34, outer: M - CAP.height / 4 };
const at = (out, up) => ({ d: out * PER_ANGSTROM, y: aboveGate(up) });
const CTD = { ...at(26, 36), rx: 13 * PER_ANGSTROM, ry: 8.5 };
const CSOL_FOOT = aboveGate(38);
const TAF_AT = at(32, 24);
const S2S3_AT = at(49, 20);
const TAF = { d: [TAF_AT.d - 8.4, TAF_AT.d + 8.4], y: [TAF_AT.y - 14.3, TAF_AT.y + 14.3] };
const S2S3 = { d: [TAF.d[1], 2 * S2S3_AT.d - TAF.d[1]], y: [S2S3_AT.y - 4.5, S2S3_AT.y + 4.5] };
const PART = { pore: 14, tmx: [18, 23], pvsd: [27, 54], s6cFoot: 3.5 };
const S6C_TOP = [CTD.d - CTD.rx / 2, CTD.y + (CTD.ry * Math.sqrt(3)) / 2];
const s6cAt = (y) => PART.s6cFoot + ((M - y) / (M - S6C_TOP[1])) * (S6C_TOP[0] - PART.s6cFoot);

function capHalf(s, r = 12, rTop = 6) {
  const x = (d) => X + s * d;
  const sweep = s < 0 ? 0 : 1;
  return `M${x(D.vestibule)},${CAP.top} H${x(D.nterm - rTop)} A${rTop},${rTop} 0 0 ${sweep} ${x(D.nterm)},${CAP.top + rTop}`
    + ` V${Y.nterm} H${x(CAP.half - r)} A${r},${r} 0 0 ${sweep} ${x(CAP.half)},${Y.nterm + r}`
    + ` V${Y.outer - r} A${r},${r} 0 0 ${sweep} ${x(CAP.half - r)},${Y.outer} H${x(D.column)} V${M} H${x(D.gap)}`
    + ` V${CSOL_FOOT} H${x(D.csol)} V${Y.nterm} H${x(D.vestibule)} Z`;
}

function band(s, d0, d1, y0, y1, attrs, parent) {
  return make('rect', { x: s < 0 ? X - d1 : X + d0, y: y0, width: d1 - d0, height: y1 - y0, ...attrs }, parent);
}

export function sideView(svg, { state = null, title = '', inset = false, cap = null, tag = '' } = {}) {
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 400 ${HEIGHT}`);
  svg.setAttribute('class', 'sch sch-side');
  svg.setAttribute('role', 'img');
  if (title) make('title', {}, svg, title);

  make('rect', { x: 0, y: M, width: 400, height: STALK.height, class: 'sch-membrane' }, svg);
  make('line', { x1: 0, x2: 400, y1: M, y2: M, class: 'sch-membrane-face' }, svg);
  make('line', { x1: 0, x2: 400, y1: MB, y2: MB, class: 'sch-membrane-face' }, svg);
  make('rect', { x: 0, y: MB, width: 400, height: HEIGHT - MB, class: 'sch-lumen' }, svg);

  const outline = `${capHalf(-1)} ${capHalf(1)}`;
  const defs = make('defs', {}, svg);
  const clip = make('clipPath', { id: `${svg.id}-cap` }, defs);
  make('path', { d: outline }, clip);
  const zones = make('g', { 'clip-path': `url(#${svg.id}-cap)`, class: 'sch-cap' }, svg);
  const zone = (name, kind, d0, d1, y0, y1) => {
    for (const s of [-1, 1]) band(s, d0, d1, y0, y1, { class: `sch-zone sch-${kind}`, 'data-zone': name }, zones);
  };
  zone('periphery', 'shell', D.corona, CAP.half, Y.nterm, Y.outer);
  zone('corona', 'shell', D.column, D.corona, Y.nterm, Y.outer);
  zone('tower-top', 'shell', D.vestibule, D.nterm, CAP.top, Y.nterm);
  zone('tower-core', 'core', D.csol, D.column, Y.nterm, CSOL_FOOT);
  zone('foot', 'core', D.gap, D.column, CSOL_FOOT, M);
  for (const s of [-1, 1]) {
    const x = (d) => X + s * d;
    for (const d of [D.corona, D.column]) make('line', { x1: x(d), x2: x(d), y1: Y.nterm, y2: Y.outer, class: 'sch-seam' }, zones);
    make('line', { x1: x(D.csol), x2: x(D.nterm), y1: Y.nterm, y2: Y.nterm, class: 'sch-seam' }, zones);
    make('line', { x1: x(D.csol), x2: x(D.column), y1: CSOL_FOOT, y2: CSOL_FOOT, class: 'sch-seam sch-seam-thin' }, zones);
  }
  make('path', { d: outline, class: 'sch-outline' }, svg);

  make('rect', { x: X - D.vestibule, y: CAP.top, width: 2 * D.vestibule, height: Y.nterm - CAP.top, class: 'sch-vestibule', 'data-zone': 'vestibule' }, svg);

  make('rect', { x: X - STALK.half, y: M, width: 2 * STALK.half, height: STALK.height, rx: 4, class: 'sch-zone sch-core sch-stalk', 'data-zone': 'membrane' }, svg);
  for (const s of [-1, 1]) {
    band(s, ...PART.pvsd, M + 4, MB - 4, { rx: 3, class: 'sch-part sch-core-part', 'data-zone': 'pvsd' }, svg);
    band(s, ...PART.tmx, M + 7, MB - 7, { rx: 2, class: 'sch-part sch-tmx', 'data-zone': 'tmx' }, svg);
  }
  make('rect', { x: X - PART.pore, y: M + 2, width: 2 * PART.pore, height: STALK.height - 4, rx: 3, class: 'sch-part sch-pore', 'data-zone': 'pore' }, svg);
  if (state === 'closed' || state === 'open') {
    const mid = M + STALK.height * 0.43;
    const top = state === 'closed' ? 2 : 11;
    for (const s of [-1, 1]) {
      make('polyline', { points: `${X + s * 10.5},${MB - 2} ${X + s * 5.2},${mid} ${X + s * top},${M + 2}`, class: 'sch-s6' }, svg);
    }
  }

  for (const s of [-1, 1]) {
    band(s, ...S2S3.d, ...S2S3.y, { rx: 3, class: 'sch-part sch-core-part', 'data-zone': 's2s3' }, svg);
    band(s, ...TAF.d, ...TAF.y, { rx: 3, class: 'sch-part sch-core-part', 'data-zone': 'taf' }, svg);
    make('line', { x1: X + s * PART.s6cFoot, y1: M, x2: X + s * S6C_TOP[0], y2: S6C_TOP[1], class: 'sch-helix', 'data-zone': 's6c' }, svg);
    make('ellipse', { cx: X + s * CTD.d, cy: CTD.y, rx: CTD.rx, ry: CTD.ry, class: 'sch-part sch-core-part', 'data-zone': 'ctd' }, svg);
  }

  make('line', { x1: X, x2: X, y1: CAP.top - 2, y2: HEIGHT - 2, class: 'sch-axis' }, svg);

  label(svg, 8, 22, 'cytosol', { class: 'sch-label sch-place' });
  label(svg, 8, M + 22, ['membrane of the', 'sarcoplasmic', 'reticulum'], { class: 'sch-label sch-place' });
  label(svg, 8, MB + 12, ['inside the', 'sarcoplasmic reticulum'], { class: 'sch-label sch-place' });
  const leader = (x1, y1, x2, y2) => make('line', { x1, y1, x2, y2, class: 'sch-leader' }, svg);
  if (!inset) {
    label(svg, X, CAP.top - 8, 'central tower', { 'text-anchor': 'middle', class: 'sch-label sch-halo', 'data-zone': 'tower-top' });
    label(svg, X, CAP.top + 21, 'vestibule', { 'text-anchor': 'middle', class: 'sch-label sch-halo', 'data-zone': 'vestibule' });
    label(svg, X - (D.corona + CAP.half) / 2, Y.nterm - 4, 'periphery', { 'text-anchor': 'middle', 'data-zone': 'periphery' });
    label(svg, X + (D.column + D.corona) / 2, Y.nterm - 4, 'corona', { 'text-anchor': 'middle', 'data-zone': 'corona' });
    label(svg, X - (D.csol + D.column) / 2, (Y.nterm + CSOL_FOOT) / 2 + 4, 'CSol', { 'text-anchor': 'middle', 'data-zone': 'tower-core' });
    label(svg, X, CTD.y + 4, 'CTD', { 'text-anchor': 'middle', class: 'sch-label sch-halo', 'data-zone': 'ctd' });
    const side = D.column + 4;
    const tafY = TAF.y[1] - 2;
    leader(X - side, tafY, X - TAF.d[1], tafY);
    label(svg, X - side - 2, tafY + 4, 'TaF', { 'text-anchor': 'end', class: 'sch-label sch-halo', 'data-zone': 'taf' });
    const s6cY = M - 5.4;
    leader(X + side, s6cY, X + s6cAt(s6cY) + 1, s6cY);
    label(svg, X + side + 2, s6cY + 3.5, 'S6c', { class: 'sch-label sch-halo', 'data-zone': 's6c' });
    const pvsdMid = X - (PART.pvsd[0] + PART.pvsd[1]) / 2;
    leader(pvsdMid, MB - 4, pvsdMid, MB + 2);
    label(svg, pvsdMid, MB + 12, 'pVSD', { 'text-anchor': 'middle', class: 'sch-label sch-halo', 'data-zone': 'pvsd' });
    const tmxMid = X + (PART.tmx[0] + PART.tmx[1]) / 2;
    leader(tmxMid, MB - 7, tmxMid, MB + 2);
    label(svg, tmxMid, MB + 12, 'TMx', { 'text-anchor': 'middle', class: 'sch-label sch-halo', 'data-zone': 'tmx' });
    const hit = { fill: 'none', 'pointer-events': 'all', class: 'sch-hit', 'data-zone': 'tmx' };
    for (const s of [-1, 1]) band(s, PART.pore + 1, PART.pvsd[0] - 1, M, MB, hit, svg);
    make('rect', { x: tmxMid - 15, y: MB, width: 30, height: 18, ...hit }, svg);
    leader(X + STALK.half - 5, M + 32, X + STALK.half + 22, M + 32);
    label(svg, X + STALK.half + 25, M + 36, 'stalk', { 'data-zone': 'membrane' });
  }
  leader(X - 7, MB - 2, X - 7, MB + 18);
  label(svg, X - 4, MB + 28, 'pore', { 'text-anchor': 'end', class: 'sch-label sch-halo', ...(inset ? {} : { 'data-zone': 'pore' }) });
  label(svg, X + 6, MB + 28, 'four-fold axis', { class: 'sch-label sch-halo' });
  make('path', { d: `M${X + CAP.half + 9},${CAP.top + 2} h5 V${M - 2} h-5`, class: 'sch-bracket' }, svg);
  label(svg, X + CAP.half + 18, (CAP.top + M) / 2 + 4, 'cap');
  if (inset) poreInset(svg, state);

  if (cap) {
    const o = 4;
    const r = 16;
    const L = X - CAP.half - o;
    const R = X + CAP.half + o;
    const top = Y.nterm - o;
    const under = Y.outer + o;
    const d = `M${X - D.column - o},${M} V${under} H${L + r} A${r},${r} 0 0 1 ${L},${under - r} V${top + r}`
      + ` A${r},${r} 0 0 1 ${L + r},${top} H${X - D.nterm - o} V${CAP.top - o} H${X + D.nterm + o} V${top} H${R - r}`
      + ` A${r},${r} 0 0 1 ${R},${top + r} V${under - r} A${r},${r} 0 0 1 ${R - r},${under} H${X + D.column + o} V${M}`;
    make('path', { d, class: `sch-capmark sch-capmark-${cap}` }, svg);
    if (tag) label(svg, X, 26, tag, { 'text-anchor': 'middle', class: `sch-label sch-halo sch-tag sch-tag-${cap}` });
  }
  return svg;
}

function poreInset(svg, state) {
  const box = { x: 298, y: HEIGHT - 88, w: 98, h: 80 };
  make('line', { x1: X + PART.pore, y1: M + 24, x2: box.x, y2: box.y + 30, class: 'sch-leader' }, svg);
  const g = make('g', { class: 'sch-inset' }, svg);
  make('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 6, class: 'sch-inset-box' }, g);
  make('rect', { x: box.x, y: box.y + 14, width: box.w, height: 36, class: 'sch-membrane' }, g);
  make('line', { x1: box.x, x2: box.x + box.w, y1: box.y + 14, y2: box.y + 14, class: 'sch-membrane-face' }, g);
  make('line', { x1: box.x, x2: box.x + box.w, y1: box.y + 50, y2: box.y + 50, class: 'sch-membrane-face' }, g);
  const c = box.x + box.w / 2;
  const bottom = box.y + 56;
  const middle = box.y + 32;
  const top = box.y + 8;
  const ends = state === 'open' ? [c - 16, c + 16] : [c - 2.5, c + 2.5];
  make('polyline', { points: `${c - 20},${bottom} ${c - 8},${middle} ${ends[0]},${top}`, class: 'sch-s6 sch-s6-big' }, g);
  make('polyline', { points: `${c + 20},${bottom} ${c + 8},${middle} ${ends[1]},${top}`, class: 'sch-s6 sch-s6-big' }, g);
  make('line', { x1: c, x2: c, y1: box.y + 3, y2: box.y + 60, class: 'sch-axis' }, g);
  label(g, box.x + box.w / 2, box.y + box.h - 5, 'pore, enlarged', { 'text-anchor': 'middle', class: 'sch-label sch-place' });
}

export function topView(svg, { title = '' } = {}) {
  svg.replaceChildren();
  svg.setAttribute('viewBox', '16 16 228 228');
  svg.setAttribute('class', 'sch sch-top');
  svg.setAttribute('role', 'img');
  if (title) make('title', {}, svg, title);
  const c = 130;
  const P = 110;
  const K = (D.corona * P) / CAP.half;
  const T = (D.column * P) / CAP.half;
  const a = 7;
  const b = 9;
  const vestibule = (D.vestibule * P) / CAP.half;
  const first = {
    periphery: [[c + a, c - K], [c - K, c - K], [c - K, c - a], [c - P, c - a], [c - P, c - P], [c + a, c - P]],
    corona: [[c - b, c - T], [c - T, c - T], [c - T, c + b], [c - K, c + b], [c - K, c - K], [c - b, c - K]],
    'tower-top': [[c - a, c - a], [c + a, c - a], [c + a, c - T], [c - T, c - T], [c - T, c - a]],
  };
  const turn = (q, [x, y]) => {
    let dx = x - c;
    let dy = y - c;
    for (let i = 0; i < q; i += 1) [dx, dy] = [-dy, dx];
    return `${c + dx},${c + dy}`;
  };
  const defs = make('defs', {}, svg);
  const clip = make('clipPath', { id: `${svg.id}-square` }, defs);
  make('rect', { x: c - P, y: c - P, width: 2 * P, height: 2 * P, rx: 10 }, clip);
  const quads = make('g', { class: 'sch-quads', 'clip-path': `url(#${svg.id}-square)` }, svg);
  for (let q = 0; q < 4; q += 1) {
    const g = make('g', { style: `--subunit: ${SUBUNIT_COLOURS[q]}` }, quads);
    for (const [zone, points] of Object.entries(first)) {
      make('path', { d: `M${points.map((p) => turn(q, p)).join(' L')} Z`, class: 'sch-band', 'data-zone': zone }, g);
    }
  }
  for (const h of [T, K]) {
    make('rect', { x: c - h, y: c - h, width: 2 * h, height: 2 * h, class: 'sch-gap sch-gap-thin' }, svg);
  }
  make('rect', { x: c - P, y: c - P, width: 2 * P, height: 2 * P, rx: 10, class: 'sch-outline' }, svg);
  make('circle', { cx: c, cy: c, r: vestibule + 7, class: 'sch-beneath', 'data-zone': 'beneath' }, svg);
  make('circle', { cx: c, cy: c, r: vestibule, class: 'sch-vestibule', 'data-zone': 'vestibule' }, svg);
  make('circle', { cx: c, cy: c, r: 2, class: 'sch-axis-dot' }, svg);
  label(svg, c, c - vestibule - 13, 'central tower', { 'text-anchor': 'middle', class: 'sch-label sch-halo', 'data-zone': 'tower-top' });
  label(svg, (c - K + c - b) / 2, c - (T + K) / 2 + 4, 'corona', { 'text-anchor': 'middle', class: 'sch-label sch-halo', 'data-zone': 'corona' });
  label(svg, (c - P + c + a) / 2, c - (K + P) / 2 + 4, 'periphery', { 'text-anchor': 'middle', class: 'sch-label sch-halo', 'data-zone': 'periphery' });
  return svg;
}

const BENEATH = new Set(['tower-core', 'taf', 'foot', 'membrane', 'pore', 'pvsd', 'tmx', 's2s3', 's6c', 'ctd']);
export function light(svgs, zones) {
  const on = new Set(zones);
  for (const svg of svgs) {
    const top = svg.classList.contains('sch-top');
    for (const shape of svg.querySelectorAll('[data-zone]')) {
      const z = shape.dataset.zone;
      const lit = top && z === 'beneath' ? zones.some((n) => BENEATH.has(n)) : on.has(z);
      shape.classList.toggle('is-lit', lit);
    }
    svg.classList.toggle('has-lit', on.size > 0);
  }
}

export function zoneAt(event) {
  const shape = event.target.closest && event.target.closest('[data-zone]');
  return shape ? shape.dataset.zone : null;
}
