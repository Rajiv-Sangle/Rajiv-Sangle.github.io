import { RELEASE, FILES, readRelease, makeModel, parseFasta, translate } from './exon_arithmetic.js';
import { readRules, typedChange, zonesAt } from './variant_arithmetic.js';

const host = globalThis.document ? document.querySelector('d-figure#fig-kinds') : null;
const figureName = (fig) => `Figure ${[...document.querySelectorAll('d-title d-figure, d-article d-figure')].indexOf(fig) + 1}`;
const NAME = host ? figureName(host) : 'The kinds figure';

export const EXAMPLES = [
  { name: 'c.1840C>T', tag: 'ClinVar VCV000012964' },
  { name: 'c.1842C>T', tag: 'computed' },
  { name: 'c.9093C>T', tag: 'ClinVar VCV000329085' },
  { name: 'c.10171G>T', tag: 'ClinVar VCV002710027' },
  { name: 'c.51_53del', tag: 'ClinVar VCV000133146' },
  { name: 'c.992_994dup', tag: 'ClinVar VCV004813083' },
  { name: 'c.13013_13032del', tag: 'ClinVar VCV000012996' },
  { name: 'c.1843_1844insAAT', tag: 'computed' },
  { name: 'c.14422_14423inv', tag: 'ClinVar VCV000478199' },
  { name: 'c.13994_13995delinsCT', tag: 'ClinVar VCV000133055' },
  { name: 'c.1A>G', tag: 'gnomAD' },
  { name: 'c.15115T>C', tag: 'computed' },
  { name: 'c.-108T>C', tag: 'ClinVar VCV000132987' },
  { name: 'NC_000019.10(NM_000540.3):c.14364+1G>T', tag: 'ClinVar VCV001330370' },
];
export const OPENING = 'c.1840C>T';

export const KINDS = [
  { id: 'substitution', word: 'substitution', mark: '>', hgvs: '"one nucleotide is replaced by one other nucleotide"' },
  { id: 'deletion', word: 'deletion', mark: 'del', hgvs: 'letters "not present (deleted)"' },
  { id: 'duplication', word: 'duplication', mark: 'dup',
    hgvs: '"a copy of one or more nucleotides is inserted directly 3\' of the original copy"' },
  { id: 'insertion', word: 'insertion', mark: 'ins',
    hgvs: 'letters added where "the insertion is not a copy of a sequence immediately 5\'"' },
  { id: 'delins', word: 'deletion-insertion', mark: 'delins',
    hgvs: 'letters "replaced by one or more other nucleotides and which is not a substitution or inversion"' },
  { id: 'inversion', word: 'inversion', mark: 'inv',
    hgvs: 'more than one letter replaced by their reverse complement: "an inversion would change AAGC to GCTT", whereas '
      + '"CGAA is only the reverse of AAGC"' },
];
export const OUTCOMES = [
  { id: 'none', words: 'no amino acid changed', classes: ['synonymous_variant', 'stop_retained_variant'] },
  { id: 'one', words: 'one amino acid changed', classes: ['missense_variant'] },
  { id: 'short', words: 'cut short', classes: ['stop_gained'] },
  { id: 'inframe', words: 'amino acids lost or added', classes: ['inframe_deletion', 'inframe_insertion'] },
  { id: 'frame', words: 'frame shifted', classes: ['frameshift_variant'] },
  { id: 'ends', words: 'start or stop changed', classes: ['start_lost', 'stop_lost', 'terminator_codon_variant'] },
  { id: 'outside', words: 'outside coding sequence', classes: ['5_prime_UTR_variant', '3_prime_UTR_variant', 'intron_variant'] },
];
const SOURCE_KEY = {
  clinvar: 'ClinVar record',
  computed: 'computed by this figure, not a record of a person',
  gnomad: 'seen in gnomAD',
};
const sourceOf = (tag) => (tag.startsWith('ClinVar ') ? 'clinvar' : tag === 'computed' ? 'computed' : tag === 'gnomAD' ? 'gnomad' : null);
const REGION_WORDS = { '5utr': '5′ untranslated end', cds: 'coding sequence', '3utr': '3′ untranslated end' };
const ZONE_WORDS = { five_prime_cis_splice_site: 'site', three_prime_cis_splice_site: 'site', splice_region: 'region' };

export function stripOf(model, rules, r) {
  const removed = new Set(r.removed ?? []);
  const replaced = new Map(r.replaced ?? []);
  const inserted = r.inserted ?? null;
  const protein = model.sequences.protein;
  const P = `${protein}*`;
  const out = {
    mode: r.region === 'intron' ? 'intron' : r.region === 'cds' ? 'coding' : 'untranslated',
    slots: [], ref: [], alt: [], refCodons: [], altCodons: [], regions: [], zones: [],
    more: null, removedCount: removed.size, notComputed: !r.effectComputed, problems: [],
  };
  if (out.mode === 'intron') return intronStrip(model, rules, r, out, replaced);

  const exonic = model.sequences.exonic;
  const tx = (g) => model.txOf(g);
  const cds0 = tx(model.cdsStart);
  const cdsLast = tx(model.cdsEnd);
  const codonOfTx = (p) => (p >= cds0 && p <= cdsLast ? Math.floor((p - cds0) / 3) + 1 : null);
  const changed = [];
  for (let p = 1; p <= exonic.length; p += 1) {
    const g = model.genomeOfTx(p);
    if (!removed.has(g)) changed.push({ letter: replaced.get(g) ?? exonic[p - 1], g, j: 0 });
    if (inserted && g === inserted.after) [...inserted.bases].forEach((b, k) => changed.push({ letter: b, g, j: k + 1 }));
  }
  const key = (g, j) => `${g}:${j}`;
  const indexOf = new Map(changed.map((c, i) => [key(c.g, c.j), i]));
  const start = indexOf.get(key(model.cdsStart, 0));
  if (start == null) {
    out.problems.push(`${r.cName}: c.1 is removed, so the change can't be read in threes here.`);
    return out;
  }
  const codons = [];
  let q = '';
  for (let i = start; i + 3 <= changed.length; i += 3) {
    const aa = translate(changed[i].letter + changed[i + 1].letter + changed[i + 2].letter);
    codons.push({ k: codons.length + 1, at: i, aa });
    q += aa;
    if (aa === '*') break;
  }
  const lastRead = codons.length ? codons[codons.length - 1].at + 2 : start - 1;
  const unknown = !!r.startUnknown;
  let lost = [1, 0];
  let made = [1, 0];
  if (!unknown && q !== P) {
    let i = 0;
    while (i < q.length && i < P.length && q[i] === P[i]) i += 1;
    const net = changed.length - exonic.length;
    let s = 0;
    if (net % 3 === 0 && q.length - P.length === net / 3 && q.endsWith('*')) {
      const cap = Math.min(q.length, P.length) - i;
      while (s < cap && q[q.length - 1 - s] === P[P.length - 1 - s]) s += 1;
    }
    lost = [i + 1, P.length - s];
    made = [i + 1, q.length - s];
    if (r.firstChangedResidue !== i + 1) {
      out.problems.push(`${r.cName}: read in threes, its first changed residue is ${i + 1}; typedChange gives ${r.firstChangedResidue}.`);
    }
    if (q.endsWith('*') && r.newStopCodon != null && r.newStopCodon !== q.length) {
      out.problems.push(`${r.cName}: read in threes, its new stop is codon ${q.length}; typedChange gives ${r.newStopCodon}.`);
    }
  } else if (!unknown && r.firstChangedResidue != null) {
    out.problems.push(`${r.cName}: read in threes, the protein is unchanged; typedChange gives a changed residue.`);
  }
  out.lost = lost;
  out.made = made;
  const inRange = (k, [a, b]) => k >= a && k <= b;
  const madeCount = made[1] - made[0] + 1;
  const runsOn = !unknown && madeCount > 3;

  const first = tx(r.gFirst);
  const last = tx(r.gLast) + (r.kind === 'duplication' ? 1 : 0);
  let from;
  let to;
  const cFirst = Math.max(first, cds0);
  const cLast = Math.min(last, cdsLast);
  if (cFirst <= cLast) {
    from = cds0 + 3 * (codonOfTx(cFirst) - 3);
    to = cds0 + 3 * (codonOfTx(cLast) + 2) - 1;
  } else {
    from = first - 6;
    to = last + 6;
  }
  if (runsOn) {
    const third = codons[made[0] - 1 + 2];
    const end = changed[third.at + 2];
    const p = tx(end.g);
    to = Math.max(to, codonOfTx(p) ? cds0 + 3 * codonOfTx(p) - 1 : p);
  }
  from = Math.max(1, from);
  to = Math.min(exonic.length, to);
  for (let p = from; p <= to; p += 1) {
    const g = model.genomeOfTx(p);
    out.slots.push({ g, j: 0 });
    if (inserted && g === inserted.after) [...inserted.bases].forEach((_, k) => out.slots.push({ g, j: k + 1 }));
  }
  const slotOf = new Map();
  out.slots.forEach((s, si) => {
    const i = indexOf.get(key(s.g, s.j));
    if (i != null) slotOf.set(i, si);
  });

  const refGroups = new Map();
  out.slots.forEach((s, si) => {
    if (s.j) {
      out.ref.push(null);
      return;
    }
    const p = tx(s.g);
    const k = codonOfTx(p);
    let mark = removed.has(s.g) ? 'removed' : k == null ? 'unread' : 'plain';
    if (mark === 'plain' && r.kind === 'duplication' && s.g >= r.gFirst && s.g <= r.gLast) mark = 'copied';
    out.ref.push({ letter: exonic[p - 1], mark });
    if (k != null) refGroups.set(k, [...(refGroups.get(k) ?? []), si]);
  });
  for (const [k, slots] of refGroups) {
    out.refCodons.push({ k, slots, aa: k <= protein.length ? protein[k - 1] : '*', mark: inRange(k, lost) ? 'lost' : 'plain' });
  }

  const shownTo = runsOn ? made[0] + 2 : Infinity;
  let cut = Infinity;
  for (const c of codons) {
    if (c.k > shownTo) break;
    const slots = [c.at, c.at + 1, c.at + 2].map((i) => slotOf.get(i)).filter((x) => x != null);
    if (!slots.length) continue;
    out.altCodons.push({ k: c.k, slots, aa: unknown ? '?' : c.aa, mark: unknown ? 'unknown' : inRange(c.k, made) ? 'new' : 'plain' });
    if (c.k === shownTo) cut = Math.max(...slots);
  }
  out.slots.forEach((s, si) => {
    const i = indexOf.get(key(s.g, s.j));
    if (si > cut) out.alt.push(null);
    else if (i == null) out.alt.push({ letter: '–', mark: 'gap' });
    else {
      const c = changed[i];
      const isNew = c.j > 0 || replaced.has(c.g);
      const read = i >= start && (unknown || i <= lastRead);
      out.alt.push({ letter: c.letter, mark: isNew ? 'new' : read ? 'plain' : 'unread' });
    }
  });
  if (runsOn) out.more = { from: cut + 1, count: madeCount - 3, stop: q.endsWith('*') };

  regionsOf(out, (s) => REGION_WORDS[model.locate(s.g).region] ?? '');
  if (r.splice && r.splice.length) zonesOfStrip(model, rules, out);
  return out;
}

function intronStrip(model, rules, r, out, replaced) {
  const g0 = r.gFirst;
  const loc = model.locate(g0);
  const a = model.exonByNumber.get(loc.after);
  const b = model.exonByNumber.get(loc.before);
  let [from, to] = g0 - a.end <= b.start - g0 ? [a.end - 5, a.end + 10] : [b.start - 10, b.start + 5];
  if (g0 < from || r.gLast > to) [from, to] = [g0 - 6, r.gLast + 6];
  const protein = model.sequences.protein;
  const refGroups = new Map();
  for (let g = from; g <= to; g += 1) {
    const l = model.locate(g);
    const si = out.slots.length;
    out.slots.push({ g, j: 0 });
    const coding = l.region === 'cds';
    out.ref.push({ letter: model.baseAt(g), mark: coding ? 'plain' : 'unread' });
    out.alt.push({ letter: replaced.get(g) ?? model.baseAt(g), mark: replaced.has(g) ? 'new' : coding ? 'plain' : 'unread' });
    if (coding) refGroups.set(l.codon, [...(refGroups.get(l.codon) ?? []), si]);
  }
  for (const [k, slots] of refGroups) {
    out.refCodons.push({ k, slots, aa: k <= protein.length ? protein[k - 1] : '*', mark: 'plain' });
  }
  regionsOf(out, (s) => {
    const l = model.locate(s.g);
    return l.region === 'intron' ? `intron ${l.after}` : `exon ${l.exon}`;
  });
  zonesOfStrip(model, rules, out);
  return out;
}

function runsOf(slots, valueOf) {
  const runs = [];
  slots.forEach((s, si) => {
    const v = valueOf(s);
    const prev = runs[runs.length - 1];
    if (prev && prev.text === v) prev.to = si;
    else runs.push({ from: si, to: si, text: v });
  });
  return runs;
}
function regionsOf(out, valueOf) {
  out.regions = runsOf(out.slots, valueOf).filter((x) => x.text);
}
function zonesOfStrip(model, rules, out) {
  out.zones = runsOf(out.slots, (s) => (s.j ? '' : zonesAt(model, rules, s.g).map((z) => z.term).join(' ')))
    .filter((x) => x.text).map((x) => ({ ...x, terms: x.text.split(' ') }));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function breakable(text) {
  const span = el('span');
  text.split('_').forEach((part, i) => {
    if (i) span.append('_', document.createElement('wbr'));
    span.append(part);
  });
  return span;
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return `sha256:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
async function fetchChecked(manifest, name) {
  const response = await fetch(RELEASE + name);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const entry = manifest.files.find((f) => f.path === name);
  let status = 'unchecked';
  if (!entry) status = 'mismatch';
  else if (globalThis.crypto && crypto.subtle) {
    status = (await sha256(buffer)) === entry.sha256 && buffer.byteLength === entry.bytes ? 'match' : 'mismatch';
  }
  return { name, status, text: new TextDecoder().decode(buffer) };
}

let built = false;
async function build() {
  if (built) return;
  built = true;
  const root = host.querySelector('.figure-root');
  try {
    const manifestResponse = await fetch(`${RELEASE}manifest.json`);
    if (!manifestResponse.ok) throw new Error(`manifest.json: HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    const files = {};
    for (const [k, name] of Object.entries(FILES)) files[k] = await fetchChecked(manifest, name);
    const header = JSON.parse(files.header.text);
    const sequences = { genomic: parseFasta(files.genomic.text), exonic: parseFasta(files.exonic.text), protein: parseFasta(files.protein.text) };
    const model = makeModel(readRelease(files.exons.text, files.highlights.text, header, sequences));
    const problems = [...model.problems];
    for (const f of Object.values(files)) if (f.status === 'mismatch') problems.push(`${f.name} does not match the checksum in the release's manifest.`);
    const typed = readRules(header);
    problems.push(...typed.problems);
    const rules = typed.rules;
    const names = new Map((header.amino_acids ?? []).map((a) => [a.one_letter, { name: a.name.toLowerCase(), code: a.three_letter }]));
    if (!names.size) problems.push('The release carries no table of amino-acid names.');
    const examples = [];
    if (rules && !problems.length) {
      for (const e of EXAMPLES) {
        const r = typedChange(model, rules, e.name);
        if (r.error) {
          problems.push(`${e.name}: the release's rules refuse it (${r.error}).`);
          continue;
        }
        const shown = r.reference === rules.genomic ? r.name : r.cName;
        const kind = KINDS.find((k) => k.id === r.kind);
        const outcome = OUTCOMES.find((o) => o.classes.includes(r.soTerm));
        const source = sourceOf(e.tag);
        if (shown !== e.name) problems.push(`${e.name}: the release names it ${shown}.`);
        if (!kind || !outcome) problems.push(`${e.name}: no row for ${r.kind} or no column for ${r.soTerm}.`);
        if (!source) problems.push(`${e.name}: its tag, ${e.tag}, names no source.`);
        const strip = stripOf(model, rules, r);
        problems.push(...strip.problems);
        examples.push({ ...e, r, kind, outcome, source, strip });
      }
    }
    if (problems.length) {
      refuse(root, problems);
      return;
    }
    draw(root, { model, rules, names, examples });
  } catch (err) {
    refuse(root, [`The release could not be read (${err.message}).`]);
  }
}

function refuse(root, problems) {
  problems.forEach((p) => console.error(`${NAME}: ${p}`));
  const box = el('div', 'figure-refusal');
  box.append(el('p', null, `${NAME} is not drawn, because its data failed a check:`));
  const list = el('ul');
  problems.forEach((p) => list.append(el('li', null, p)));
  box.append(list);
  root.replaceChildren(box);
  root.dataset.state = 'refused';
}

function draw(root, { model, rules, names, examples }) {
  const byName = new Map(examples.map((x) => [x.name, x]));
  const guide = (step, text) => {
    const p = el('p', 'kinds-guide', text);
    p.dataset.guide = step;
    return p;
  };
  const guide1 = el('div', 'kinds-guide');
  guide1.dataset.guide = '1';
  guide1.append(
    el('p', 'kinds-wide', 'Each dot is one change. Down the side: what happens to the DNA\'s letters. Across the top: '
      + 'what that does to the protein\'s sequence. Point at a dot, a row or a column; click to keep it.'),
    el('p', 'kinds-narrow', 'Each dot is one change, listed under what it does to the protein\'s sequence; its tag names '
      + 'what happens to the DNA\'s letters. Tap a dot, a heading or one of the six kinds to keep it lit.'),
  );
  const table = el('div', 'kinds-table');
  table.setAttribute('role', 'group');
  table.setAttribute('aria-label', 'The examples, by kind of change to the letters and by what it does to the protein\'s sequence');
  const corner = el('div', 'kinds-corner');
  corner.setAttribute('aria-hidden', 'true');
  table.append(corner);
  const items = [];
  const rowsBox = el('div', 'kinds-rows');
  KINDS.forEach((k, i) => {
    const b = el('button', 'kinds-row-head');
    b.type = 'button';
    b.append(el('span', 'kinds-word', k.word), ' ', el('span', 'kinds-mark', k.mark));
    b.style.gridRow = String(i + 2);
    b.setAttribute('aria-label', `${k.word}: light its row`);
    rowsBox.append(b);
    items.push({ type: 'row', id: k.id, node: b });
  });
  table.append(rowsBox);
  const classesIn = (o) => o.classes.filter((c) => examples.some((x) => x.r.soTerm === c));
  OUTCOMES.forEach((o, j) => {
    const col = el('div', 'kinds-col');
    const head = el('button', 'kinds-col-head');
    head.type = 'button';
    head.style.gridColumn = String(j + 2);
    const so = el('span', 'kinds-so');
    classesIn(o).forEach((c, i) => {
      if (i) so.append(', ');
      so.append(breakable(c));
    });
    head.append(el('span', 'kinds-words', o.words), so);
    head.setAttribute('aria-label', `${o.words}: light its column`);
    col.append(head);
    items.push({ type: 'column', id: o.id, node: head });
    KINDS.forEach((k, i) => {
      const cell = el('div', 'kinds-cell');
      cell.style.gridRow = String(i + 2);
      cell.style.gridColumn = String(j + 2);
      const here = examples.filter((x) => x.kind === k && x.outcome === o);
      if (!here.length) cell.classList.add('is-empty');
      for (const x of here) {
        const b = el('button', 'kinds-dot');
        b.type = 'button';
        b.dataset.dot = x.name;
        b.dataset.source = x.source;
        b.dataset.row = k.id;
        b.dataset.column = o.id;
        const shape = el('i', `kinds-shape is-${x.source}`);
        shape.setAttribute('aria-hidden', 'true');
        const pos = x.r.cName.replace(/^(c\.[-*]?\d+(?:[+-]\d+)?(?:_[-*]?\d+(?:[+-]\d+)?)?).*$/, '$1');
        b.append(shape, el('span', 'kinds-pos'), el('span', 'kinds-full'), el('span', 'kinds-chip', k.word));
        b.querySelector('.kinds-pos').append(breakable(pos));
        b.querySelector('.kinds-full').append(breakable(x.name));
        b.setAttribute('aria-label', `${x.name}: ${k.word}, ${o.words}; ${SOURCE_KEY[x.source]}`);
        cell.append(b);
        items.push({ type: 'dot', id: x.name, node: b });
      }
      col.append(cell);
    });
    table.append(col);
  });
  const legend = el('p', 'kinds-legend');
  for (const s of ['clinvar', 'computed', 'gnomad']) {
    const span = el('span', 'kinds-legend-item');
    const shape = el('i', `kinds-shape is-${s}`);
    shape.setAttribute('aria-hidden', 'true');
    span.append(shape, ` ${SOURCE_KEY[s]}`);
    legend.append(span);
  }
  const readout1 = el('p', 'kinds-readout');
  readout1.setAttribute('aria-live', 'polite');

  const guide2 = guide('2', 'The kept change, read in threes as the protein is: reference on top, the change under it.');
  const head2 = el('p', 'kinds-head');
  const scroller = el('div', 'ks-scroll');
  scroller.tabIndex = 0;
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', 'The kept change, read in threes');
  const key2 = el('p', 'ks-key');
  const readout2 = el('div', 'kinds-source');
  const exonsHost = document.getElementById('fig-exons');
  const see = el('button', 'kinds-see');
  see.type = 'button';
  see.dataset.leavesFigure = 'fig-exons';
  const ref4 = el('span', 'figure-ref');
  ref4.dataset.figure = 'fig-exons';
  ref4.textContent = exonsHost ? figureName(exonsHost) : '';
  see.append('See it in the whole sequence: ', ref4, ' ↑');
  if (!exonsHost) see.hidden = true;
  root.replaceChildren(guide1, table, legend, readout1, guide2, head2, scroller, key2, readout2, see);

  let kept = { type: 'dot', id: OPENING };
  let pointed = null;
  let change = OPENING;
  let sent = null;
  const same = (a, b) => a && b && a.type === b.type && a.id === b.id;
  const litDots = (it) => {
    if (!it) return [];
    if (it.type === 'dot') return [it.id];
    if (it.type === 'class') return examples.filter((x) => x.r.soTerm === it.id).map((x) => x.name);
    return examples.filter((x) => (it.type === 'row' ? x.kind.id : x.outcome.id) === it.id).map((x) => x.name);
  };
  function show() {
    const lit = pointed ?? kept;
    const dots = new Set(litDots(lit));
    const litX = lit && lit.type === 'dot' ? byName.get(lit.id) : null;
    for (const it of items) {
      const on = it.type === 'dot' ? dots.has(it.id)
        : lit && lit.type === it.type && lit.id === it.id;
      const soft = !!litX && ((it.type === 'row' && litX.kind.id === it.id) || (it.type === 'column' && litX.outcome.id === it.id));
      it.node.classList.toggle('is-lit', !!on);
      it.node.classList.toggle('is-lit-soft', soft);
      it.node.classList.toggle('is-read', it.type === 'dot' && it.id === change);
      it.node.setAttribute('aria-pressed', String(same(kept, it)));
    }
    table.classList.toggle('has-lit', !!lit);
    readout1.replaceChildren(...describe(lit));
    root.dataset.state = `change=${change};kept=${kept ? `${kept.type}:${kept.id}` : 'none'};`
      + `lit=${lit ? `${lit.type}:${lit.id}` : 'none'};figure4=${sent ?? 'none'}`;
  }
  function describe(lit) {
    if (!lit) return ['Nothing is lit. Point at a dot, a row or a column.'];
    if (lit.type === 'dot') {
      const x = byName.get(lit.id);
      return [el('b', null, x.name), `${x.r.p ? `, ${x.r.p}` : ''}: ${x.kind.word}, ${x.outcome.words} (${x.r.soTerm}); `
        + `${x.source === 'clinvar' ? 'a ' : ''}${SOURCE_KEY[x.source]}.`];
    }
    if (lit.type === 'row') {
      const k = KINDS.find((x) => x.id === lit.id);
      return [el('b', null, `${k.word[0].toUpperCase()}${k.word.slice(1)}`), ` (HGVS): ${k.hgvs}.`];
    }
    const classes = lit.type === 'class' ? [lit.id] : classesIn(OUTCOMES.find((o) => o.id === lit.id));
    const words = lit.type === 'class' ? lit.id.replace(/_/g, ' ') : OUTCOMES.find((o) => o.id === lit.id).words;
    const parts = [el('b', null, `${words[0].toUpperCase()}${words.slice(1)}`), ' (Sequence Ontology): '];
    classes.forEach((c, i) => {
      const def = rules.classes.get(c);
      parts.push(`${i ? '; ' : ''}${c} (${def.so_id}), "${def.definition}"`);
    });
    parts.push('.');
    return parts;
  }
  function point(it) {
    pointed = it;
    show();
  }
  function keep(it) {
    if (same(kept, it)) kept = null;
    else {
      kept = it;
      if (it.type === 'dot' && it.id !== change) {
        change = it.id;
        sent = null;
        drawChange();
      }
    }
    show();
  }
  for (const it of items) {
    it.node.addEventListener('pointerenter', () => point(it));
    it.node.addEventListener('pointerleave', () => point(null));
    it.node.addEventListener('focus', () => point(it));
    it.node.addEventListener('blur', () => point(null));
    it.node.addEventListener('click', () => keep({ type: it.type, id: it.id }));
  }
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && kept) {
      kept = null;
      show();
    }
  });
  see.addEventListener('click', () => {
    if (openInFigure4(change)) {
      sent = change;
      show();
    }
  });

  function drawChange() {
    const x = byName.get(change);
    const { r } = x;
    head2.replaceChildren(el('b', 'kinds-name', x.name), ' ', el('span', 'kinds-p', r.p ?? ''), ' ',
      el('span', 'kinds-sort', `${x.kind.word} · ${x.outcome.words} (`));
    head2.lastChild.append(el('span', 'kinds-class', r.soTerm), ')');
    drawStrip(scroller, x.strip, names);
    const keyParts = ['Orange: letters or amino acids the change puts in. Struck through: what it takes out. Grey: '
      + 'letters not read in threes.'];
    if (x.strip.ref.some((c) => c && c.mark === 'copied')) keyParts.push('Dotted: the letters a duplication copies.');
    if (x.strip.removedCount) keyParts.push(`${x.strip.removedCount} removed letter${x.strip.removedCount === 1 ? '' : 's'}, struck.`);
    if (r.startUnknown) {
      keyParts.push(`"?": not predicted. HGVS writes ${r.p} when the consequence "can not be predicted (i.e. is `
        + 'unknown)", so the change\'s amino acids are left as "?".');
    }
    key2.textContent = keyParts.join(' ');
    const lines = [];
    const src = el('p', 'kinds-src');
    src.dataset.source = x.source;
    if (x.source === 'clinvar') {
      const acc = x.tag.slice('ClinVar '.length);
      const a = el('a', 'id-link', acc);
      a.href = `https://www.ncbi.nlm.nih.gov/clinvar/variation/${Number(acc.replace(/\D/g, ''))}/`;
      a.target = '_blank';
      a.rel = 'noopener';
      src.append('A ClinVar record, ', a, r.p ? '; its p. name is this figure\'s prediction.' : '.');
    } else if (x.source === 'computed') {
      src.append('Computed by this figure, not a record of a person; its p. name is this figure\'s prediction.');
    } else {
      src.append('Seen in gnomAD, with at least one copy passing filters, as retrieved on 6 October 2026 from the dataset '
        + 'labelled gnomAD v4.1.2, whose variant frequency data and filtering status gnomAD calls "unchanged from v4.1.1"; '
        + 'its p. name is this figure\'s prediction.');
    }
    lines.push(src);
    lines.push(el('p', 'kinds-label', `${rules.label[0].toUpperCase()}${rules.label.slice(1)}.`));
    const note = noteFor(x);
    if (note) lines.push(el('p', 'kinds-note', note));
    readout2.replaceChildren(...lines);
    openOnChange(scroller);
  }
  function noteFor(x) {
    const { r } = x;
    if (r.kind === 'duplication' && r.soTerm === 'inframe_insertion') {
      return `HGVS's duplication and the Sequence Ontology's in-frame insertion (${r.soTerm}): HGVS says "duplicating `
        + `insertions should be described as duplications". This figure names its protein change ${r.p}.`;
    }
    if (r.splice && r.splice.length) {
      const zones = r.splice.map((z) => `${z.term} (${z.id})`).join(' and ');
      return `The release's rules flag it in the ${zones}; the flag "predicts nothing", and the change's effect is not computed.`;
    }
    return null;
  }

  for (const link of document.querySelectorAll('.fig-link[data-figure="fig-kinds"]')) {
    const d = link.dataset;
    const it = d.dot ? (byName.has(d.dot) ? { type: 'dot', id: d.dot } : null)
      : d.row ? (KINDS.some((k) => k.id === d.row) ? { type: 'row', id: d.row } : null)
        : d.column ? (OUTCOMES.some((o) => o.id === d.column) ? { type: 'column', id: d.column } : null)
          : d.class ? (examples.some((x) => x.r.soTerm === d.class) ? { type: 'class', id: d.class } : null) : null;
    if (!it) {
      console.error(`${NAME}: a name in the text links to nothing in the figure (${link.textContent}).`);
      continue;
    }
    link.tabIndex = 0;
    link.addEventListener('pointerenter', () => point(it));
    link.addEventListener('pointerleave', () => point(null));
    link.addEventListener('focus', () => point(it));
    link.addEventListener('blur', () => point(null));
  }
  drawChange();
  show();
  let width = 0;
  new ResizeObserver(() => {
    if (Math.round(scroller.clientWidth) !== width) {
      width = Math.round(scroller.clientWidth);
      openOnChange(scroller);
    }
  }).observe(scroller);
}

const ROW = { region: 1, number: 2, ref: 3, refAa: 4, alt: 5, altAa: 6, zone: 7 };
function drawStrip(scroller, s, names) {
  const grid = el('div', 'ks-grid');
  grid.style.gridTemplateColumns = `var(--ks-label) repeat(${s.slots.length}, var(--ks-cell)) max-content`;
  const place = (node, row, from, to = from) => {
    node.style.gridRow = String(row);
    node.style.gridColumn = `${from + 2} / ${to + 3}`;
    node.dataset.from = String(from);
    node.dataset.to = String(to);
    return node;
  };
  const label = (text, row) => {
    const node = el('span', 'ks-label', text);
    node.style.gridRow = String(row);
    node.style.gridColumn = '1';
    grid.append(node);
  };
  label('codon', ROW.number);
  label('reference', ROW.ref);
  label('the change', ROW.alt);
  if (s.zones.length) label('zones', ROW.zone);
  for (const g of s.regions) {
    const region = place(el('span', 'ks-region'), ROW.region, g.from, g.to);
    region.append(el('span', null, g.text));
    grid.append(region);
  }
  const aaLabel = (aa) => {
    const span = el('span', 'ks-aa-text');
    if (aa === '*' || aa === '?') span.append(aa === '*' ? 'stop' : '?');
    else {
      const n = names.get(aa);
      span.append(el('span', 'ks-aa-name', n.name), el('span', 'ks-aa-code', n.code));
    }
    return span;
  };
  const codon = (c, row, aaRow, which) => {
    const sorted = [...c.slots].sort((a, b) => a - b);
    let runStart = sorted[0];
    sorted.forEach((si, i) => {
      if (i + 1 === sorted.length || sorted[i + 1] !== si + 1) {
        grid.append(place(el('span', `ks-box ks-box-${which}`), row, runStart, si));
        runStart = sorted[i + 1];
      }
    });
    const aa = place(el('span', 'ks-aa'), aaRow, sorted[0], sorted[sorted.length - 1]);
    aa.dataset.row = which;
    aa.dataset.codon = String(c.k);
    aa.dataset.aa = c.aa;
    aa.dataset.mark = c.mark;
    aa.append(aaLabel(c.aa));
    grid.append(aa);
    if (which === 'ref') {
      const num = place(el('span', 'ks-num', String(c.k)), ROW.number, sorted[0], sorted[sorted.length - 1]);
      grid.append(num);
    }
  };
  s.refCodons.forEach((c) => codon(c, ROW.ref, ROW.refAa, 'ref'));
  s.altCodons.forEach((c) => codon(c, ROW.alt, ROW.altAa, 'alt'));
  const letters = (cells, row, which) => cells.forEach((c, si) => {
    if (!c) return;
    const b = place(el('span', 'ks-b', c.letter), row, si);
    b.dataset.row = which;
    b.dataset.slot = String(si);
    b.dataset.mark = c.mark;
    grid.append(b);
  });
  letters(s.ref, ROW.ref, 'ref');
  letters(s.alt, ROW.alt, 'alt');
  if (s.more) {
    const more = el('span', 'ks-more', `… ${s.more.count} more codon${s.more.count === 1 ? '' : 's'}${s.more.stop ? ', the last a stop' : ''}`);
    more.style.gridRow = String(ROW.alt);
    more.style.gridColumn = `${s.more.from + 2} / -1`;
    more.dataset.count = String(s.more.count);
    grid.append(more);
  }
  if (s.notComputed) grid.append(place(el('span', 'ks-not', 'effect not computed'), ROW.altAa, 0, s.slots.length - 1));
  for (const z of s.zones) {
    const words = [...new Set(z.terms.map((t) => ZONE_WORDS[t]))].join(', ');
    const zone = place(el('span', `ks-zone ${z.terms.includes('splice_region') && z.terms.length === 1 ? 'is-region' : 'is-site'}`, words),
      ROW.zone, z.from, z.to);
    zone.dataset.zone = z.terms.join(' ');
    grid.append(zone);
  }
  scroller.replaceChildren(grid);
}

function openOnChange(scroller) {
  const grid = scroller.firstElementChild;
  if (!grid) return;
  const target = grid.querySelector('.ks-b[data-mark="new"], .ks-b[data-mark="removed"], .ks-b[data-mark="gap"]');
  if (!target || scroller.scrollWidth <= scroller.clientWidth + 1) {
    scroller.scrollLeft = 0;
    return;
  }
  const labelWidth = grid.querySelector('.ks-label')?.offsetWidth ?? 0;
  const view = scroller.clientWidth - labelWidth;
  scroller.scrollLeft = Math.max(0, target.offsetLeft - labelWidth - view / 3);
}

function bringIntoView(node) {
  const top = node.getBoundingClientRect().top + window.scrollY - 72;
  window.scrollTo(0, Math.max(0, top));
}
function tryBoxOf(fig) {
  return fig.querySelector('input[name="seq-try"]');
}
function fill(box, name) {
  box.value = name.replace(/^[^:]*:/, '').replace(/^c\./, '');
  box.dispatchEvent(new Event('change', { bubbles: true }));
  bringIntoView(box.closest('form') ?? box);
}
export function openInFigure4(name) {
  const fig = globalThis.document && document.getElementById('fig-exons');
  if (!fig) return false;
  const box = tryBoxOf(fig);
  if (box) {
    fill(box, name);
    return true;
  }
  bringIntoView(fig);
  const done = () => {
    observer.disconnect();
    clearTimeout(timer);
  };
  const observer = new MutationObserver(() => {
    const found = tryBoxOf(fig);
    if (found) {
      done();
      fill(found, name);
    } else if (fig.querySelector('.figure-root')?.dataset.state === 'refused') done();
  });
  observer.observe(fig, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
  const timer = setTimeout(done, 10000);
  return false;
}
function wireTryLinks() {
  const exons = document.getElementById('fig-exons');
  for (const link of document.querySelectorAll('a.try-link[data-try]')) {
    if (exons) link.title = `Open ${link.dataset.try} in ${figureName(exons)}`;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openInFigure4(link.dataset.try);
    });
  }
}

if (host) {
  host.addEventListener('ready', build);
  wireTryLinks();
}
