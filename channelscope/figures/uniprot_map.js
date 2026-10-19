
const host = document.querySelector('d-figure#fig-uniprot-map');
export const RELEASE = 'data/ryr1_uniprot_features_v0.1/ryr1_uniprot_features_v0.1.tsv';
const RELEASE_COLUMNS = ['type', 'start', 'end', 'description', 'evidence', 'evidence_label', 'evidence_source'];
const SVG = 'http://www.w3.org/2000/svg';
const figureName = () => `Figure ${[...document.querySelectorAll('d-title d-figure, d-article d-figure')].indexOf(host) + 1}`;

const TOPOLOGY = ['Topological domain', 'Transmembrane', 'Intramembrane'];
const SIDES = { Cytoplasmic: 'cytoplasmic', Lumenal: 'lumenal' };
const REGIONS = ['Interaction with FKBP1A', 'Interaction with CALM'];
const REPEATS_REGION = /^\d+ X approximate repeats$/;
const TRACKS = ['topology', 'repeats', 'regions'];
const TITLES = { topology: 'Topology', repeats: 'Repeats', regions: 'Regions' };
const PROMPT = 'Point at a feature, or tap it, to read UniProt\'s record of it.';
const LEAD = 100;
const FONT = 11;
let built = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

const thousands = (n) => n.toLocaleString('en-US');
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const word = (n) => WORDS[n] || String(n);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];
const longDate = (iso) => {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
};
const spanText = (f) => (f.start === f.end ? `residue ${f.start}` : `residues ${f.start}–${f.end}`);
const spanBare = (f) => (f.start === f.end ? `${f.start}` : `${f.start}–${f.end}`);
const listed = (items) => (items.length < 2 ? items.join('')
  : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const helixName = (f) => f.description.replace(/^.*Name=/, '');

export function readData(text) {
  const header = {};
  const rows = [];
  let columns = null;
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('#')) {
      const m = /^#\s*([a-z][a-z0-9_]*):\s*(.*)$/.exec(line);
      if (m) header[m[1]] = m[2].trim();
      continue;
    }
    const cells = line.split('\t');
    if (!columns) {
      columns = cells.map((c) => c.trim());
      continue;
    }
    const f = Object.fromEntries(columns.map((c, i) => [c, (cells[i] ?? '').trim()]));
    rows.push({ type: f.type, start: Number(f.start), end: Number(f.end), description: f.description ?? '',
      evidence: f.evidence ?? '', evidenceLabel: f.evidence_label ?? '', source: f.evidence_source ?? '',
      ligand: f.ligand ?? '', ligandId: f.ligand_id ?? '' });
  }
  return { header, columns: columns || [], rows };
}

export function makeModel(data) {
  const problems = [];
  const length = Number(data.header.length);
  if (!Number.isInteger(length) || length < 1) problems.push(`The release gives no length for the chain (${data.header.length}).`);
  if (data.header.provisional !== 'no') {
    problems.push(`The release does not say "provisional: no" (it says ${JSON.stringify(data.header.provisional ?? null)}).`);
  }
  for (const c of RELEASE_COLUMNS) {
    if (!data.columns.includes(c)) problems.push(`The release has no column "${c}".`);
  }
  const released = data.rows.map((r, row) => ({ ...r, row, origin: 'release' }));
  for (const r of released) {
    if (Boolean(r.evidence) !== Boolean(r.evidenceLabel)) {
      problems.push(`${r.type} ${spanBare(r)} gives the evidence code "${r.evidence}" with the label "${r.evidenceLabel}".`);
    }
  }
  const rows = released;
  for (const r of rows) {
    if (!Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 1 || r.end < r.start || r.end > length) {
      problems.push(`${r.type} "${r.description}" spans ${r.start}–${r.end}, not within 1–${length}.`);
    }
  }
  const topology = rows.filter((r) => TOPOLOGY.includes(r.type)).sort((a, b) => a.start - b.start);
  let next = 1;
  for (const t of topology) {
    if (t.start !== next) problems.push(`The topology ${t.start > next ? 'leaves a gap before' : 'overlaps at'} residue ${t.start}.`);
    next = t.end + 1;
  }
  if (next !== length + 1) problems.push(`The topology ends at residue ${next - 1}, not ${length}.`);
  topology.forEach((t, i) => {
    if (t.type === 'Topological domain') {
      t.side = SIDES[t.description];
      if (!t.side) problems.push(`A topological domain is "${t.description}", a side the figure does not know.`);
      return;
    }
    t.side = 'membrane';
    const sides = [topology[i - 1], topology[i + 1]].map((s) => (s && s.type === 'Topological domain' ? SIDES[s.description] : null));
    if (!sides[0] || !sides[1]) problems.push(`${t.type} ${spanBare(t)} is not between two stretches outside the membrane.`);
    else if (t.type === 'Transmembrane' && sides[0] === sides[1]) problems.push(`The helix ${spanBare(t)} does not cross from one side to the other.`);
    else if (t.type === 'Intramembrane' && sides[0] !== sides[1]) problems.push(`The segment ${spanBare(t)} crosses the membrane.`);
    [t.from, t.to] = sides;
  });
  const motifs = rows.filter((r) => r.type === 'Motif');
  for (const m of motifs) {
    if (!topology.some((t) => t.side === 'membrane' && m.start <= t.end && t.start <= m.end)) {
      problems.push(`The motif ${spanBare(m)} touches no stretch in the membrane.`);
    }
  }
  const drawn = [
    ...topology.map((f) => ({ ...f, track: 'topology' })),
    ...motifs.map((f) => ({ ...f, track: 'topology', side: 'filter' })),
    ...rows.filter((r) => r.type === 'Repeat').map((f) => ({ ...f, track: 'repeats' })),
    ...rows.filter((r) => r.type === 'Region' && REPEATS_REGION.test(r.description)).map((f) => ({ ...f, track: 'repeats', bracket: true })),
    ...rows.filter((r) => r.type === 'Region' && REGIONS.includes(r.description)).map((f) => ({ ...f, track: 'regions' })),
  ].sort((a, b) => a.start - b.start || TRACKS.indexOf(a.track) - TRACKS.indexOf(b.track)
    || (a.side === 'filter') - (b.side === 'filter') || b.end - a.end);
  drawn.forEach((f, i) => { f.id = i; });
  const membrane = drawn.filter((f) => f.side === 'membrane');
  const from = membrane.length ? Math.max(1, Math.min(...membrane.map((f) => f.start)) - LEAD) : null;
  return { problems, length, header: data.header, features: drawn,
    notDrawn: released.length - drawn.length, inset: from ? { from, to: length } : null };
}

export function values(model) {
  const helices = model.features.filter((f) => f.type === 'Transmembrane');
  const first = model.features.find((f) => f.track === 'topology' && f.start === 1);
  const h = model.header;
  const withheld = /\bits (\d+) Domain rows\b/.exec(h.withheld || '');
  return {
    'withheld-domains': withheld ? word(Number(withheld[1])) : null,
    'length': thousands(model.length),
    'first-end': first ? thousands(first.end) : null,
    'helix-count': word(helices.length),
    'helix-names': helices.length ? `${helixName(helices[0])} to ${helixName(helices[helices.length - 1])}` : null,
    'first-helix-start': helices.length ? thousands(helices[0].start) : null,
    'last-helix-end': helices.length ? thousands(helices[helices.length - 1].end) : null,
    'entry': h.entry || null,
    'entry-version': h.entry_version || null,
    'retrieved': longDate(h.retrieved),
  };
}

function checkPage(model) {
  const want = values(model);
  const name = figureName();
  for (const span of document.querySelectorAll('[data-um]')) {
    const key = span.dataset.um;
    const text = span.textContent.replace(/\s+/g, ' ').trim();
    if (!(key in want)) console.error(`${name}: the page asks for a value the figure does not know (${key}).`);
    else if (text !== want[key]) console.error(`${name}: the page says "${text}" for ${key}, where the data file has "${want[key]}".`);
  }
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
}

async function build() {
  if (built) return;
  built = true;
  const root = host.querySelector('.figure-root');
  let model;
  try {
    model = makeModel(readData(await fetchText(RELEASE)));
  } catch (err) {
    refuse(root, [`A data file could not be read (${err.message}).`]);
    return;
  }
  if (model.problems.length) {
    refuse(root, model.problems);
    return;
  }
  draw(root, model);
  checkPage(model);
}

function refuse(root, problems) {
  const name = figureName();
  problems.forEach((p) => console.error(`${name}: ${p}`));
  const box = el('div', 'figure-refusal');
  box.append(el('p', null, `${name} is not drawn, because its data failed a check:`));
  const ul = el('ul');
  problems.forEach((p) => ul.append(el('li', null, p)));
  box.append(ul);
  root.replaceChildren(box);
  root.dataset.state = 'refused';
}

const evidenceText = (f) => f.evidenceLabel || 'none given';

function describe(item) {
  if (!item) return [PROMPT];
  if (item.features) {
    const fs = item.features;
    const spans = listed(fs.map(spanBare));
    return [el('b', null, `${capital(word(fs.length))} ${fs[0].type} features`), `, at residues ${spans}.`];
  }
  const f = item;
  return [el('b', null, f.type), `, ${spanText(f)}. UniProt's description: “${f.description}”. Evidence (UniProt): `
    + `${evidenceText(f)}${f.source ? `, ${f.source}` : ''}.`];
}

function draw(root, model) {
  root.replaceChildren();
  const readout = el('p', 'um-readout');
  readout.setAttribute('aria-live', 'polite');
  const controls = el('div', 'figure-control um-controls');
  const prev = el('button', 'um-step', '‹ Previous');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous feature, track by track');
  const counter = el('span', 'um-count');
  const next = el('button', 'um-step', 'Next ›');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next feature, track by track');
  controls.append(prev, counter, next);
  const map = el('div', 'um-map');
  const svg = svgEl('svg', { class: 'um-svg', role: 'img',
    'aria-label': `UniProt's features of human RyR1 along its chain, residues 1 to ${thousands(model.length)}, to scale, `
      + 'with the stretch that crosses the membrane enlarged below. The record of each is read out above the drawing.' });
  svg.setAttribute('tabindex', '-1');
  map.append(svg);
  const legend = el('div', 'um-legend');
  const chip = (cls, text) => {
    const s = el('span', 'um-legend-item');
    s.append(el('i', `um-chip ${cls}`), text);
    return s;
  };
  legend.append(el('span', 'um-legend-title', 'Topology, as UniProt gives it:'),
    chip('um-chip-cytoplasmic', 'cytoplasmic'), chip('um-chip-lumenal', 'lumenal'),
    chip('um-chip-membrane', 'in the membrane: helices and the pore-forming stretch'),
    chip('um-chip-filter', 'selectivity filter'));
  root.append(readout, controls, map, legend);
  root.dataset.release = model.header.release || '';
  root.dataset.drawn = String(model.features.length);
  root.dataset.notDrawn = String(model.notDrawn);

  const order = TRACKS.flatMap((t) => model.features.filter((f) => f.track === t));
  const counted = {
    topology: order.filter((f) => f.track === 'topology' && f.side !== 'filter'),
    repeats: order.filter((f) => f.track === 'repeats' && !f.bracket),
    regions: order.filter((f) => f.track === 'regions'),
  };
  const NOUNS = { topology: 'stretch ', repeats: 'repeat ', regions: '' };
  const countOf = (f) => {
    if (f.side === 'filter') return `${TITLES.topology}: the ${f.description.toLowerCase()}`;
    if (f.bracket) return `${TITLES.repeats}: the region of all ${word(counted.repeats.length)}`;
    const list = counted[f.track];
    return `${TITLES[f.track]}: ${NOUNS[f.track]}${list.indexOf(f) + 1} of ${list.length}`;
  };
  const atRest = `${counted.topology.length} stretches · ${counted.repeats.length} repeats · ${counted.regions.length} regions`;
  let lit = null;
  let pinned = null;
  let geometry = null;
  const say = (item, into = readout) => into.replaceChildren(...describe(item));
  const idOf = (x) => (x == null ? 'none' : x.features ? `set:${x.features.map((f) => f.id).join(',')}` : String(x.id));
  const stamp = () => {
    root.dataset.state = `lit=${idOf(lit)};pinned=${idOf(pinned)}`;
    counter.textContent = pinned && !pinned.features ? countOf(pinned) : atRest;
  };
  const paint = () => {
    const ids = new Set(lit ? (lit.features ? lit.features.map((f) => f.id) : [lit.id]) : []);
    for (const node of svg.querySelectorAll('[data-ring]')) node.classList.toggle('is-lit', ids.has(Number(node.dataset.ring)));
    if (!geometry) return;
    geometry.washLayer.replaceChildren();
    for (const f of order.filter((x) => ids.has(x.id))) {
      for (const band of geometry.washes(f)) geometry.washLayer.append(svgEl('rect', { class: 'um-wash', ...band }));
    }
  };
  const show = (item) => {
    lit = item;
    say(item);
    paint();
    stamp();
  };
  const same = (a, b) => a === b || Boolean(a && b && a.features && b.features && idOf(a) === idOf(b));
  const pin = (item) => {
    pinned = same(pinned, item) ? null : item;
    show(pinned);
  };
  const step = (by) => {
    const at = pinned && !pinned.features ? order.indexOf(pinned) : (by > 0 ? -1 : order.length);
    pinned = order[(at + by + order.length) % order.length];
    show(pinned);
  };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

  const itemAt = (event) => {
    const m = geometry && svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
    return geometry.at(p.x, p.y);
  };
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const it = itemAt(e);
    const want = it || pinned;
    if (!same(want, lit)) show(want);
  });
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') show(pinned);
  });
  let pressed = null;
  svg.addEventListener('pointerup', (e) => { pressed = { clientX: e.clientX, clientY: e.clientY, at: e.timeStamp }; });
  svg.addEventListener('click', (e) => {
    const at = pressed && e.timeStamp - pressed.at < 800 ? pressed : e;
    pressed = null;
    const it = itemAt(at);
    if (it) pin(it);
    else if (pinned) pin(pinned);
  });
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pinned) pin(pinned);
  });

  const linked = [];
  for (const link of document.querySelectorAll('.fig-link[data-figure="fig-uniprot-map"]')) {
    const named = link.dataset.description ? link.dataset.description.split('|') : null;
    const ofType = order.filter((f) => f.type === link.dataset.type);
    const fs = named ? ofType.filter((f) => named.includes(f.description)) : ofType;
    const missing = named ? named.filter((d) => !ofType.some((f) => f.description === d)) : [];
    if (!fs.length || missing.length) {
      console.error(`${figureName()}: a name in the text links to no feature drawn (${link.textContent.trim()}`
        + `${missing.length ? `: ${missing.join(', ')}` : ''}).`);
      continue;
    }
    const item = fs.length === 1 ? fs[0] : { features: fs };
    linked.push(item);
    link.tabIndex = 0;
    link.addEventListener('pointerenter', () => show(item));
    link.addEventListener('pointerleave', () => show(pinned));
    link.addEventListener('focus', () => show(item));
    link.addEventListener('blur', () => show(pinned));
  }

  const reserve = () => {
    const copy = el('p', 'um-readout');
    copy.setAttribute('aria-hidden', 'true');
    copy.style.cssText = `position: absolute; visibility: hidden; width: ${getComputedStyle(readout).width};`;
    root.append(copy);
    let tallest = 0;
    for (const item of [null, ...order, ...linked, ...geometry.groups]) {
      say(item, copy);
      tallest = Math.max(tallest, copy.getBoundingClientRect().height);
    }
    copy.remove();
    readout.style.minHeight = `${Math.ceil(tallest)}px`;
  };
  const redraw = () => {
    geometry = render(svg, model, map.clientWidth);
    Object.assign(root.dataset, geometry.data);
    paint();
  };
  redraw();
  show(null);
  reserve();
  let lastWidth = map.clientWidth;
  new ResizeObserver(() => {
    if (map.clientWidth !== lastWidth) {
      lastWidth = map.clientWidth;
      redraw();
      reserve();
    }
  }).observe(map);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      redraw();
      reserve();
    });
  }
}

function measurer(svg) {
  const ctx = document.createElement('canvas').getContext('2d');
  const family = getComputedStyle(svg).fontFamily;
  return (text, px = FONT, weight = 400) => {
    ctx.font = `${weight} ${px}px ${family}`;
    return ctx.measureText(text).width;
  };
}

function spread(row, lo, hi, gap) {
  const clusters = row.map((e) => ({ items: [e] }));
  const layout = (c) => {
    let offset = 0;
    const offsets = c.items.map((e) => {
      const o = offset + e.w / 2;
      offset += e.w + gap;
      return o;
    });
    c.w = offset - gap;
    const ideal = c.items.reduce((s, e, i) => s + e.want - offsets[i], 0) / c.items.length;
    c.left = Math.min(Math.max(ideal, lo), Math.max(hi - c.w, lo));
  };
  clusters.forEach(layout);
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i + 1 < clusters.length; i++) {
      if (clusters[i].left + clusters[i].w + gap > clusters[i + 1].left) {
        const c = { items: [...clusters[i].items, ...clusters[i + 1].items] };
        layout(c);
        clusters.splice(i, 2, c);
        merged = true;
        break;
      }
    }
  }
  for (const c of clusters) {
    let x = c.left;
    for (const e of c.items) {
      e.left = x;
      x += e.w + gap;
    }
  }
}

function planLabels(features, X, measure, W, nameOf) {
  const prefix = (f) => nameOf(f).replace(/\s*\d+$/, '');
  const numbered = (f) => /\s\d+$/.test(nameOf(f));
  const runs = [];
  for (const f of features) {
    const last = runs[runs.length - 1];
    if (last && numbered(f) && numbered(last[0]) && prefix(last[0]) === prefix(f)) last.push(f);
    else runs.push([f]);
  }
  const centred = (fs, text) => {
    const a = X(fs[0].start);
    const b = X(fs[fs.length - 1].end + 1);
    return { features: fs, text, w: measure(text) + 6, want: (a + b) / 2, a, b };
  };
  const labels = [];
  for (const run of runs) {
    const one = run.map((f) => centred([f], nameOf(f)));
    const crowded = one.some((l, i) => i > 0 && one[i - 1].want + one[i - 1].w / 2 + 2 > l.want - l.w / 2);
    if (run.length > 1 && crowded) {
      const num = (f) => nameOf(f).match(/(\d+)$/)[1];
      labels.push(centred(run, `${prefix(run[0])} ${num(run[0])}–${num(run[run.length - 1])}`));
    } else labels.push(...one);
  }
  for (let rows = 1; rows <= 3; rows++) {
    const tiers = Array.from({ length: rows }, (_, t) => labels.filter((_, i) => i % rows === t));
    tiers.forEach((tier) => spread(tier, 0, W, 4));
    const far = labels.some((l) => Math.abs(l.left + l.w / 2 - l.want) > Math.max(40, (l.b - l.a) / 2 + 24));
    if (!far || rows === 3) {
      tiers.forEach((tier, t) => tier.forEach((l) => { l.tier = t; }));
      return { labels, rows };
    }
  }
  return { labels, rows: 1 };
}

function render(svg, model, boxWidth) {
  const W = Math.max(boxWidth, 280);
  const narrow = W < 600;
  const measure = measurer(svg);
  const L = model.length;
  const k = W / L;
  const X = (r) => (r - 1) * k;
  const nameOf = (f) => (f.track === 'repeats' && !f.bracket ? f.description.split(';')[0] : f.description);
  const of = (track) => model.features.filter((f) => f.track === track);
  const topo = of('topology').filter((f) => f.side !== 'filter');
  const motifs = of('topology').filter((f) => f.side === 'filter');
  const layer = (cls) => svgEl('g', { class: cls });
  const L_ = { back: layer('um-layer-back'), wash: layer('um-layer-wash'), under: layer('um-layer-under'),
    marks: layer('um-layer-marks'), over: layer('um-layer-over'), leaders: layer('um-layer-leaders'), text: layer('um-layer-text') };
  svg.replaceChildren(...Object.values(L_));
  const zones = [];
  const groups = [];
  const insetWashes = new Map();
  const title = (text, y) => L_.text.append(svgEl('text', { class: 'um-title', x: 0, y }, text));
  const ring = (f, attrs) => L_.over.append(svgEl('rect', { class: 'um-ring', 'data-ring': f.id, ...attrs }));
  const feature = (f, tag, attrs, view = 'main') => {
    const cls = ['um-feature', `um-${f.track}`, f.side ? `um-side-${f.side}` : '', f.bracket ? 'um-bracket' : ''];
    const node = svgEl(tag, { class: cls.filter(Boolean).join(' '), 'data-index': f.id, 'data-type': f.type,
      'data-start': f.start, 'data-end': f.end, 'data-description': f.description, 'data-origin': f.origin,
      'data-view': view, ...attrs });
    L_.marks.append(node);
    return node;
  };
  const leader = (x1, y1, x2, y2) => L_.leaders.append(svgEl('path', { class: 'um-leader', d: `M${x1},${y1}L${x2},${y2}` }));
  const label = (text, x, y, anchor = 'middle', cls = 'um-label') => {
    const t = svgEl('text', { class: cls, x, y, 'text-anchor': anchor }, text);
    L_.text.append(t);
    return t;
  };
  const rectOf = (f, top, h) => ({ x: X(f.start), y: top, width: X(f.end + 1) - X(f.start), height: h });
  const ringOf = (f, top, h) => ({ x: X(f.start) - 2, y: top - 2.5, width: X(f.end + 1) - X(f.start) + 4, height: h + 5 });

  let y = 12;
  title(TITLES.topology, y);
  const barTop = y + 6;
  const barH = 14;
  for (const f of topo) {
    feature(f, 'rect', rectOf(f, barTop, barH));
    ring(f, ringOf(f, barTop, barH));
  }
  const longest = topo.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a), topo[0]);
  if (measure(longest.description) + 12 < X(longest.end + 1) - X(longest.start)) {
    label(longest.description, (X(longest.start) + X(longest.end + 1)) / 2, barTop + barH - 3.5, 'middle', 'um-label um-label-in');
  }
  zones.push({ band: [barTop - 4, barTop + barH + 4], features: topo });
  y = barTop + barH + 24;

  for (const track of ['repeats', 'regions']) {
    const fs = of(track);
    if (!fs.length) continue;
    title(TITLES[track], y);
    y += 6;
    if (track === 'repeats') {
      let top = y;
      for (const b of fs.filter((f) => f.bracket)) {
        const w = measure(b.description) + 6;
        const cx = (X(b.start) + X(b.end + 1)) / 2;
        const left = Math.min(Math.max(cx - w / 2, 0), W - w);
        label(b.description, left + w / 2, top + 12);
        zones.push({ box: [left, top, left + w, top + 16], item: b });
        const by = top + 20;
        feature(b, 'path', { d: `M${X(b.start) + 0.5},${by + 5}V${by}H${X(b.end + 1) - 0.5}V${by + 5}` });
        ring(b, { x: X(b.start) - 2, y: by - 3, width: X(b.end + 1) - X(b.start) + 4, height: 11 });
        zones.push({ band: [by - 4, by + 6], features: [b] });
        top = by + 9;
      }
      const boxTop = top + 2;
      const boxH = 12;
      const boxes = fs.filter((f) => !f.bracket);
      for (const f of boxes) {
        feature(f, 'rect', rectOf(f, boxTop, boxH));
        ring(f, ringOf(f, boxTop, boxH));
        const n = nameOf(f);
        if (measure(n) + 6 < X(f.end + 1) - X(f.start)) {
          label(n, (X(f.start) + X(f.end + 1)) / 2, boxTop + boxH - 2.5, 'middle', 'um-label um-label-in um-label-light');
        }
      }
      zones.push({ band: [boxTop - 4, boxTop + boxH + 4], features: boxes });
      y = boxTop + boxH + 24;
      continue;
    }
    const plan = planLabels(fs, X, measure, W, nameOf);
    const markTop = y + plan.rows * 16 + 6;
    for (const l of plan.labels) {
      const ly = y + l.tier * 16;
      label(l.text, l.left + l.w / 2, ly + 12);
      leader(l.left + l.w / 2, ly + 15, Math.min(Math.max(l.want, l.a + 0.5), l.b - 0.5), markTop - (track === 'regions' ? 0 : 1));
      const item = l.features.length > 1 ? { features: l.features } : l.features[0];
      zones.push({ box: [l.left, ly, l.left + l.w, ly + 16], item });
      if (l.features.length > 1) groups.push(item);
    }
    const h = 12;
    for (const f of fs) {
      if (track === 'regions') {
        const cx = (X(f.start) + X(f.end + 1)) / 2;
        L_.marks.append(svgEl('path', { class: 'um-marker', d: `M${cx - 4},${markTop}h8l-4,6z` }));
        feature(f, 'rect', rectOf(f, markTop + 6, h - 4));
        ring(f, { x: Math.min(X(f.start), cx - 4) - 2, y: markTop - 2.5, width: Math.max(X(f.end + 1) - X(f.start), 8) + 4, height: h + 5 });
      } else {
        feature(f, 'rect', rectOf(f, markTop, h));
        ring(f, ringOf(f, markTop, h));
      }
    }
    zones.push({ band: [markTop - 4, markTop + h + 4], features: fs });
    y = markTop + h + 24;
  }

  const axisY = y - 4;
  L_.text.append(svgEl('line', { class: 'um-axis', x1: 0, x2: W, y1: axisY, y2: axisY }));
  const ticks = [1, ...[1000, 2000, 3000, 4000].filter((t) => t < L - 400), L];
  ticks.forEach((t, i) => {
    const x = X(t) + k / 2;
    L_.text.append(svgEl('line', { class: 'um-tick', x1: x, x2: x, y1: axisY, y2: axisY + 4 }));
    label(thousands(t), i === 0 ? 0 : i === ticks.length - 1 ? W : x, axisY + 15,
      i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle', 'um-number');
  });
  label('Residue number in human RyR1', W / 2, axisY + 30, 'middle', 'um-axis-title');
  y = axisY + 36;

  let inset = null;
  if (model.inset) {
    const { from, to } = model.inset;
    const kI = W / (to - from + 1);
    const XI = (r) => (r - from) * kI;
    const top = y + 24;
    L_.back.append(svgEl('path', { class: 'um-lens',
      d: `M${X(from)},${barTop - 4}H${W}V${y - 2}L${W},${top}H0L${X(from)},${y - 2}Z` }));
    const labelTop = top + 4;
    const yC = labelTop + 28;
    const bandTop = yC + 9;
    const bandH = 40;
    const yL = bandTop + bandH + 9;
    L_.back.append(svgEl('rect', { class: 'um-lumen-side', x: 0, y: bandTop + bandH, width: W, height: yL + 14 - bandTop - bandH }));
    L_.back.append(svgEl('rect', { class: 'um-band', x: 0, y: bandTop, width: W, height: bandH }));
    L_.back.append(svgEl('line', { class: 'um-face', x1: 0, x2: W, y1: bandTop, y2: bandTop }));
    L_.back.append(svgEl('line', { class: 'um-face', x1: 0, x2: W, y1: bandTop + bandH, y2: bandTop + bandH }));
    const level = { cytoplasmic: yC, lumenal: yL };
    const pieces = new Map();
    const inView = topo.filter((f) => f.end >= from);
    for (const f of inView) {
      const a = Math.max(f.start, from);
      let pts;
      if (f.side !== 'membrane') pts = [[XI(a), level[f.side]], [XI(f.end + 1), level[f.side]]];
      else if (f.type === 'Transmembrane') pts = [[XI(a), level[f.from]], [XI(f.end + 1), level[f.to]]];
      else {
        const dip = level[f.from] === yL ? bandTop + bandH * 0.3 : bandTop + bandH * 0.7;
        pts = [[XI(a), level[f.from]], [XI((f.start + f.end + 1) / 2), dip], [XI(f.end + 1), level[f.to]]];
      }
      pieces.set(f.id, pts);
    }
    const pointAt = (r) => {
      const f = inView.find((g) => Math.max(g.start, from) <= r && r <= g.end + 1);
      const pts = pieces.get(f.id);
      const x = XI(r);
      for (let i = 1; i < pts.length; i++) {
        if (x <= pts[i][0] + 1e-9) {
          const [x0, y0] = pts[i - 1];
          const [x1, y1] = pts[i];
          return [x, x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)];
        }
      }
      return pts[pts.length - 1];
    };
    const d = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('');
    const washOf = (a, b) => ({ x: a, y: labelTop, width: Math.max(b - a, 2), height: yL + 14 - labelTop });
    for (const f of inView) {
      const pts = pieces.get(f.id);
      L_.under.append(svgEl('path', { class: `um-halo um-halo-${f.side === 'membrane' ? 'thick' : 'thin'}`, 'data-ring': f.id, d: d(pts) }));
      feature(f, 'path', { d: d(pts) }, 'inset');
      insetWashes.set(f.id, washOf(pts[0][0], pts[pts.length - 1][0]));
    }
    const motifPts = new Map();
    for (const m of motifs.filter((f) => f.start >= from)) {
      const pts = [];
      for (let r = m.start; r < m.end + 1; r += 0.25) pts.push(pointAt(r));
      pts.push(pointAt(m.end + 1));
      motifPts.set(m.id, pts);
      L_.under.append(svgEl('path', { class: 'um-halo um-halo-thick', 'data-ring': m.id, d: d(pts) }));
      feature(m, 'path', { d: d(pts) }, 'inset');
      insetWashes.set(m.id, washOf(XI(m.start), XI(m.end + 1)));
    }
    label('cytoplasmic', 2, yC - 5, 'start', 'um-label um-side');
    label('membrane', 2, bandTop + bandH / 2 + 4, 'start', 'um-label um-side');
    label('lumenal', 2, yL + 13, 'start', 'um-label um-side');
    const above = inView.filter((f) => f.type === 'Transmembrane').map((f) => {
      const text = `S${helixName(f)}`;
      const end = pieces.get(f.id).find((p) => p[1] === yC) || pieces.get(f.id)[0];
      return { f, text, w: measure(text, FONT, 600) + 6, want: end[0], tx: end[0], ty: end[1] };
    });
    spread(above, 0, W, 3);
    for (const l of above) {
      label(l.text, l.left + l.w / 2, labelTop + 12, 'middle', 'um-label um-helix-name');
      leader(l.left + l.w / 2, labelTop + 15, l.tx, l.ty - 3);
      zones.push({ box: [l.left, labelTop, l.left + l.w, labelTop + 16], item: l.f });
    }
    const belowTop = yL + 18;
    const below = [];
    for (const f of inView.filter((g) => g.type === 'Intramembrane')) {
      const p = pieces.get(f.id)[1];
      below.push({ f, text: f.description.toLowerCase(), want: p[0] - 14, tx: p[0], ty: p[1] });
    }
    for (const m of motifs.filter((f) => f.start >= from)) {
      const pts = motifPts.get(m.id);
      const p = pts[Math.floor(pts.length / 2)];
      below.push({ f: m, text: m.description.toLowerCase(), want: p[0] + 14, tx: p[0], ty: p[1] });
    }
    below.sort((a, b) => a.want - b.want);
    below.forEach((l) => { l.w = measure(l.text) + 6; });
    spread(below, 0, W, 8);
    for (const l of below) {
      label(l.text, l.left + l.w / 2, belowTop + 12);
      leader(l.left + l.w / 2, belowTop + 2, l.tx, l.ty + 3);
      zones.push({ box: [l.left, belowTop, l.left + l.w, belowTop + 16], item: l.f });
    }
    const axisI = belowTop + 24;
    L_.text.append(svgEl('line', { class: 'um-axis', x1: 0, x2: W, y1: axisI, y2: axisI }));
    for (let t = Math.ceil(from / 50) * 50; t <= to; t += narrow ? 100 : 50) {
      const x = XI(t) + kI / 2;
      L_.text.append(svgEl('line', { class: 'um-tick', x1: x, x2: x, y1: axisI, y2: axisI + 4 }));
      if (t % 100 === 0 && x > 16 && x < W - 16) label(thousands(t), x, axisI + 15, 'middle', 'um-number');
    }
    label('Residue number in human RyR1, enlarged', W / 2, axisI + 30, 'middle', 'um-axis-title');
    y = axisI + 36;
    inset = { from, to, kI, pieces, motifPts, top: labelTop, bottom: belowTop + 16 };
  }
  const height = Math.ceil(y);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${W} ${height}`);

  const near = (fs, x) => {
    let best = null;
    let dist = Infinity;
    for (const f of fs) {
      const a = X(f.start);
      const b = X(f.end + 1);
      const dd = x < a ? a - x : x > b ? x - b : 0;
      if (dd < dist || (dd === dist && best && b - a < X(best.end + 1) - X(best.start))) {
        dist = dd;
        best = f;
      }
    }
    return dist <= 10 ? best : null;
  };
  const toSegment = (px, py, [x0, y0], [x1, y1]) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const t = dx || dy ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
  };
  const toPath = (px, py, pts) => {
    let m = Infinity;
    for (let i = 1; i < pts.length; i++) m = Math.min(m, toSegment(px, py, pts[i - 1], pts[i]));
    return m;
  };
  const at = (px, py) => {
    for (const z of zones) {
      if (z.box && px >= z.box[0] && px <= z.box[2] && py >= z.box[1] && py <= z.box[3]) return z.item;
    }
    for (const z of zones) {
      if (z.band && py >= z.band[0] && py <= z.band[1]) return near(z.features, px);
    }
    if (inset && py >= inset.top && py <= inset.bottom) {
      for (const [id, pts] of inset.motifPts) if (toPath(px, py, pts) <= 6) return model.features[id];
      let best = null;
      let dist = Infinity;
      for (const [id, pts] of inset.pieces) {
        const dd = toPath(px, py, pts);
        if (dd < dist) {
          dist = dd;
          best = model.features[id];
        }
      }
      return dist <= 16 ? best : null;
    }
    return null;
  };
  const washes = (f) => [{ x: X(f.start), y: barTop - 4, width: Math.max(X(f.end + 1) - X(f.start), 2), height: axisY - barTop + 4 },
    ...(insetWashes.has(f.id) ? [insetWashes.get(f.id)] : [])];
  return {
    at, washes, groups, washLayer: L_.wash,
    data: { k: String(k), insetFrom: inset ? String(inset.from) : '', insetTo: inset ? String(inset.to) : '',
      insetK: inset ? String(inset.kI) : '', width: String(W) },
  };
}

if (host) {
  if (host._ready) build();
  else host.addEventListener('ready', build);
}
