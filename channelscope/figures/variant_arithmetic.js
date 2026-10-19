
import { translate } from './exon_arithmetic.js';

const SUBSTITUTION_CLASSES = ['intron_variant', '5_prime_UTR_variant', '3_prime_UTR_variant', 'start_lost',
  'stop_retained_variant', 'synonymous_variant', 'stop_gained', 'stop_lost', 'missense_variant'];
const INDEL_CLASSES = ['frameshift_variant', 'inframe_insertion', 'inframe_deletion', 'terminator_codon_variant'];
const ZONES = ['five_prime_cis_splice_site', 'three_prime_cis_splice_site', 'splice_region'];

export function readRules(header) {
  const tv = header.typed_variants;
  if (!tv) return { rules: null, problems: ['the release carries no rules for typed changes, so none can be tried.'] };
  const problems = [];
  const classes = new Map((Array.isArray(tv.classes) ? tv.classes : []).map((c) => [c.so_term, c]));
  for (const term of [...SUBSTITUTION_CLASSES, ...INDEL_CLASSES]) if (!classes.get(term)?.so_id) problems.push(`its classes lack ${term}`);
  const terms = tv.splice_flag?.terms ?? [];
  const splice = new Map(terms.map((t) => [t.so_term, t]));
  const order = terms.map((t) => t.so_term);
  for (const term of ZONES) if (!splice.get(term)?.so_id) problems.push(`its splice-site flag lacks ${term}`);
  if (typeof tv.label !== 'string' || !tv.label.trim()) problems.push('it gives no label for a typed change');
  const forms = tv.forms ?? {};
  if (!forms.coding_reference || !forms.genomic_reference) problems.push('it gives no reference sequences for names');
  const three = new Map((Array.isArray(header.amino_acids) ? header.amino_acids : []).map((a) => [a.one_letter, a.three_letter]));
  if (three.get('*') !== 'Ter') problems.push('its amino-acid table names no Ter');
  if (problems.length) return { rules: null, problems: [`typed changes can't be tried, since the release's typed_variants block is incomplete: ${problems.join('; ')}.`] };
  return {
    rules: { label: tv.label.trim(), classes, splice, order, coding: forms.coding_reference, genomic: forms.genomic_reference, three },
    problems,
  };
}

const zoneCache = new WeakMap();
function spliceZones(model) {
  if (zoneCache.has(model)) return zoneCache.get(model);
  const zones = new Map();
  const add = (g, term) => {
    if (!zones.has(g)) zones.set(g, new Set());
    zones.get(g).add(term);
  };
  const ex = model.exons;
  for (let k = 0; k + 1 < ex.length; k += 1) {
    const a = ex[k].end;
    const b = ex[k + 1].start;
    const intron = (g) => g > a && g < b;
    for (const g of [a + 1, a + 2]) if (intron(g)) add(g, 'five_prime_cis_splice_site');
    for (const g of [b - 2, b - 1]) if (intron(g)) add(g, 'three_prime_cis_splice_site');
    for (let d = 3; d <= 8; d += 1) {
      if (intron(a + d)) add(a + d, 'splice_region');
      if (intron(b - d)) add(b - d, 'splice_region');
    }
    for (let d = 0; d <= 2; d += 1) {
      if (a - d >= ex[k].start) add(a - d, 'splice_region');
      if (b + d <= ex[k + 1].end) add(b + d, 'splice_region');
    }
  }
  zoneCache.set(model, zones);
  return zones;
}

export function zonesAt(model, rules, g) {
  const set = spliceZones(model).get(g);
  return set ? rules.order.filter((t) => set.has(t)).map((t) => ({ term: t, id: rules.splice.get(t).so_id })) : [];
}

function zonesOf(model, rules, positions) {
  const all = spliceZones(model);
  const set = new Set();
  for (const g of positions) for (const t of all.get(g) ?? []) set.add(t);
  return rules.order.filter((t) => set.has(t)).map((t) => ({ term: t, id: rules.splice.get(t).so_id }));
}

const COMPLEMENT = { A: 'T', C: 'G', G: 'C', T: 'A' };
const revcomp = (s) => [...s].reverse().map((b) => COMPLEMENT[b]).join('');
function bases(model, a, b) {
  let s = '';
  for (let g = a; g <= b; g += 1) {
    const x = model.baseAt(g);
    if (!x) return null;
    s += x;
  }
  return s;
}
const positions = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);

const POS = '([-*]?\\d+(?:[+-]\\d+)?)';
const SUBSTITUTION = new RegExp(`^${POS}([ACGT])>([ACGT])$`, 'i');
const RANGED = new RegExp(`^${POS}(?:_${POS})?(delins|del|dup|ins|inv)([A-Za-z]*)$`, 'i');

export function parseChange(model, rules, text) {
  let s = String(text).trim().replace(/\s+/g, '');
  const typed = s;
  const withRef = /^([^:]+):(.*)$/.exec(s);
  if (withRef) {
    if (withRef[1] !== rules.coding && withRef[1] !== rules.genomic) return { error: 'reference', reference: withRef[1], typed };
    s = withRef[2];
  }
  s = s.replace(/^c\./i, '');
  if (/\[\d+\]/.test(s)) return { error: 'repeat', typed };
  if (/[;[\]]/.test(s)) return { error: 'several', typed };
  const sub = SUBSTITUTION.exec(s);
  if (sub) {
    const pos = model.parseCName(sub[1]);
    if (pos.error) return { error: 'position', position: pos, typed };
    const ref = sub[2].toUpperCase();
    const alt = sub[3].toUpperCase();
    const base = model.baseAt(pos.g);
    if (base !== ref) return { error: 'ref', at: pos.name, base, ref, typed };
    if (alt === ref) return { error: 'same', at: pos.name, base, typed };
    return { kind: 'substitution', g: pos.g, position: pos.name, typedPosition: pos.typed, ref, alt, start: pos.g, end: pos.g,
      typedName: `${pos.typed}${ref}>${alt}`, typed };
  }
  const m = RANGED.exec(s);
  if (!m) return { error: 'syntax', typed };
  const op = m[3].toLowerCase();
  const seq = m[4].toUpperCase();
  if (seq && !/^[ACGT]+$/.test(seq)) return { error: 'bases', typed };
  const a = model.parseCName(m[1]);
  if (a.error) return { error: 'position', position: a, typed };
  const b = m[2] ? model.parseCName(m[2]) : a;
  if (b.error) return { error: 'position', position: b, typed };
  if (b.g < a.g) return { error: 'order', typed };
  const typedRange = m[2] ? `${a.typed}_${b.typed.slice(2)}` : a.typed;
  const namedRange = m[2] ? `${a.name}_${b.name.slice(2)}` : a.name;
  const renamedPositions = a.typed !== a.name || b.typed !== b.name;
  if (m[2] && op !== 'ins' && (!withRef || withRef[1] === rules.coding)) {
    const [la, lb] = [model.locate(a.g), model.locate(b.g)];
    if (la.region !== 'intron' && lb.region !== 'intron' && la.exon !== lb.exon) {
      return { error: 'junction', typed, from: a.typed, to: b.typed, exons: [la.exon, lb.exon],
        neighbours: model.txOf(b.g) === model.txOf(a.g) + 1, kind: { del: 'deletion', dup: 'duplication', delins: 'deletion-insertion', inv: 'inversion' }[op],
        genomic: `${rules.genomic}:${typedRange}${op === 'del' || op === 'dup' || op === 'inv' ? op : `${op}${seq}`}` };
    }
  }
  const old = bases(model, a.g, b.g);
  const out = (kind, start, end, alt) => ({ kind, start, end, alt, typedName: `${typedRange}${op === 'del' || op === 'dup' ? op : op === 'inv' ? 'inv' : `${op}${alt}`}`,
    at: namedRange, renamedPositions, typed });
  if (op === 'del' || op === 'dup') {
    if (seq && seq !== old) return { error: 'ref', at: namedRange, base: old, ref: seq, typed };
    return op === 'del' ? out('deletion', a.g, b.g, '') : out('duplication', b.g + 1, b.g, old);
  }
  if (op === 'ins') {
    if (m[2] && (!withRef || withRef[1] === rules.coding) && seq) {
      const [la, lb] = [model.locate(a.g), model.locate(b.g)];
      if (la.region !== 'intron' && lb.region !== 'intron' && la.exon !== lb.exon && model.txOf(b.g) === model.txOf(a.g) + 1) {
        const c = (g) => model.cName(g);
        return { error: 'junction', typed, insertion: true, from: a.typed, to: b.typed, exons: [la.exon, lb.exon],
          neighbours: true, forms: [`${rules.genomic}:${c(a.g)}_${c(a.g + 1).slice(2)}ins${seq}`, `${rules.genomic}:${c(b.g - 1)}_${c(b.g).slice(2)}ins${seq}`] };
      }
    }
    if (!m[2] || b.g !== a.g + 1) return { error: 'neighbours', typed };
    if (!seq) return { error: 'syntax', typed };
    return out('insertion', b.g, a.g, seq);
  }
  if (op === 'delins') {
    if (!seq) return { error: 'syntax', typed };
    return out('delins', a.g, b.g, seq);
  }
  if (seq) return { error: 'syntax', typed };
  if (b.g === a.g) return { error: 'short', typed };
  return out('inversion', a.g, b.g, revcomp(old));
}

function normalize(model, e) {
  let { start, end } = e;
  let ref = bases(model, start, end) ?? '';
  let alt = e.alt;
  while (ref && alt && ref[ref.length - 1] === alt[alt.length - 1]) {
    ref = ref.slice(0, -1);
    alt = alt.slice(0, -1);
    end -= 1;
  }
  while (ref && alt && ref[0] === alt[0]) {
    ref = ref.slice(1);
    alt = alt.slice(1);
    start += 1;
  }
  if (!ref && !alt) return null;
  const trimmed = { start, end };
  if (ref.length === 1 && alt.length === 1) return { kind: 'substitution', start, end, ref, alt, trimmed };
  const fivePrime = (s, t) => {
    while (model.baseAt(s - 1) && model.baseAt(s - 1) === model.baseAt(t)) {
      s -= 1;
      t -= 1;
    }
    return s;
  };
  if (!alt) {
    while (model.baseAt(end + 1) && model.baseAt(end + 1) === model.baseAt(start)) {
      start += 1;
      end += 1;
    }
    if (!model.baseAt(end + 1)) return { kind: 'past-end' };
    return { kind: 'deletion', start, end, ref: bases(model, start, end), alt: '', first5: fivePrime(start, end), trimmed };
  }
  if (!ref) {
    let p = start;
    let ins = alt;
    while (model.baseAt(p) && model.baseAt(p) === ins[0]) {
      ins = ins.slice(1) + ins[0];
      p += 1;
    }
    if (!model.baseAt(p)) return { kind: 'past-end' };
    if (!model.baseAt(p - 1)) return { kind: 'before-start' };
    if (bases(model, p - ins.length, p - 1) === ins) {
      return { kind: 'duplication', start: p - ins.length, end: p - 1, ref: '', alt: ins, first5: fivePrime(p - ins.length, p - 1), trimmed };
    }
    return { kind: 'insertion', start: p, end: p - 1, ref: '', alt: ins, trimmed };
  }
  if (ref.length === alt.length && alt === revcomp(ref)) return { kind: 'inversion', start, end, ref, alt, trimmed };
  return { kind: 'delins', start, end, ref, alt, trimmed };
}

function nameOf(model, n) {
  const c = (g) => model.cName(g);
  const range = (a, b) => (a === b ? c(a) : `${c(a)}_${c(b).slice(2)}`);
  const ends = n.kind === 'insertion' ? [n.start - 1, n.start] : [n.start, n.end];
  const [l1, l2] = ends.map((g) => model.locate(g));
  const intronic = l1.region === 'intron' || l2.region === 'intron' || l1.exon !== l2.exon;
  const name = {
    substitution: () => `${c(n.start)}${n.ref}>${n.alt}`,
    deletion: () => `${range(n.start, n.end)}del`,
    duplication: () => `${range(n.start, n.end)}dup`,
    insertion: () => `${range(n.start - 1, n.start)}ins${n.alt}`,
    delins: () => `${range(n.start, n.end)}delins${n.alt}`,
    inversion: () => `${range(n.start, n.end)}inv`,
  }[n.kind]();
  return { name, intronic };
}

function changeZones(model, rules, n) {
  const all = spliceZones(model);
  if (n.kind === 'insertion') return all.has(n.start - 1) && all.has(n.start) ? zonesOf(model, rules, [n.start - 1, n.start]) : [];
  const these = positions(n.start, n.end);
  if (n.kind === 'duplication' && all.has(n.end) && all.has(n.end + 1)) these.push(n.end + 1);
  return zonesOf(model, rules, these);
}

function placementsOf(model, rules, n) {
  if (n.kind !== 'deletion' && n.kind !== 'duplication') return [];
  const out = [];
  const add = (p) => {
    const zones = changeZones(model, rules, p);
    if (!zones.length) return;
    const { name, intronic } = nameOf(model, p);
    out.push({ name, reference: intronic ? rules.genomic : rules.coding, zones });
  };
  if (n.kind === 'deletion') {
    const length = n.end - n.start + 1;
    for (let s = n.first5; s < n.start; s += 1) add({ kind: 'deletion', start: s, end: s + length - 1 });
    return out;
  }
  const length = n.alt.length;
  const places = [];
  for (let q = n.end + 1, run = n.alt; model.baseAt(q - 1) && model.baseAt(q - 1) === run[length - 1];) {
    run = run[length - 1] + run.slice(0, -1);
    q -= 1;
    places.unshift({ q, run });
  }
  for (const { q, run } of places) {
    add(bases(model, q - length, q - 1) === run ? { kind: 'duplication', start: q - length, end: q - 1, alt: run }
      : { kind: 'insertion', start: q, end: q - 1, alt: run });
  }
  return out;
}

function readOn(model) {
  const exonic = model.sequences.exonic;
  const after = model.txOf(model.cdsEnd);
  const codons = [];
  for (let k = 0; after + 3 * k + 3 <= exonic.length; k += 1) {
    const bases3 = exonic.slice(after + 3 * k, after + 3 * k + 3);
    const aa = translate(bases3);
    const codon = model.residues + 2 + k;
    codons.push({ codon, bases: bases3, aa, g: model.genomeOfTx(after + 3 * k + 1) });
    if (aa === '*') return { codons, stopCodon: codon };
  }
  return { codons, stopCodon: null };
}

const codonPositions = (model, n) => [0, 1, 2].map((k) => model.genomeOfC(3 * n - 2 + k));

export function computeChange(model, rules, parsed) {
  const { g, ref, alt } = parsed;
  const loc = model.locate(g);
  const reference = loc.region === 'intron' ? rules.genomic : rules.coding;
  const cName = `${parsed.position}${ref}>${alt}`;
  const three = (aa) => rules.three.get(aa);
  const out = {
    kind: 'substitution', g, ref, alt, region: loc.region, cName, reference, name: `${reference}:${cName}`,
    renamed: parsed.typedPosition !== parsed.position ? { typed: parsed.typedPosition, name: parsed.position, reasons: ['position'] } : null,
    soTerm: null, soId: null, p: null, effectComputed: true, notComputedBecause: null,
    firstChangedResidue: null, proteinEnd: null, newStopCodon: null,
    splice: zonesAt(model, rules, g), placements: [], codon: null, readOn: [],
    gFirst: g, gLast: g, replaced: [[g, alt]], removed: [], inserted: null, newCodons: [], startUnknown: false,
  };
  const classed = (term) => {
    out.soTerm = term;
    out.soId = rules.classes.get(term).so_id;
    return out;
  };
  if (loc.region === 'intron') {
    out.effectComputed = false;
    out.notComputedBecause = 'intronic';
    out.intron = loc.after;
    return classed('intron_variant');
  }
  if (loc.region === '5utr' || loc.region === '3utr') {
    out.p = 'p.(=)';
    return classed(loc.region === '5utr' ? '5_prime_UTR_variant' : '3_prime_UTR_variant');
  }
  const n = loc.codon;
  const stop = model.residues + 1;
  const refCodon = model.codonBases(n);
  const altCodon = refCodon.slice(0, loc.codonPos - 1) + alt + refCodon.slice(loc.codonPos);
  const refAa = n < stop ? model.aaAt(n) : '*';
  const altAa = translate(altCodon);
  Object.assign(out, { codon: n, codonPos: loc.codonPos, refCodon, altCodon, refAa, altAa });
  const changedCodon = [n, altAa, codonPositions(model, n).map((x) => [x, 0])];
  if (n === 1) {
    out.p = `p.(${three(refAa)}1?)`;
    out.startUnknown = true;
    return classed('start_lost');
  }
  out.newCodons = [changedCodon];
  if (altAa === refAa) {
    out.p = `p.(${three(refAa)}${n}=)`;
    out.proteinEnd = model.residues;
    out.newStopCodon = stop;
    return classed(n === stop ? 'stop_retained_variant' : 'synonymous_variant');
  }
  if (altAa === '*') {
    out.p = `p.(${three(refAa)}${n}Ter)`;
    out.firstChangedResidue = n;
    out.proteinEnd = n - 1;
    out.newStopCodon = n;
    return classed('stop_gained');
  }
  if (n === stop) {
    const on = readOn(model);
    out.readOn = on.codons;
    out.newCodons = [changedCodon, ...on.codons.map((c) => [c.codon, c.aa, [0, 1, 2].map((k) => [model.genomeOfTx(model.txOf(c.g) + k), 0])])];
    out.firstChangedResidue = n;
    if (on.stopCodon) {
      out.p = `p.(Ter${n}${three(altAa)}extTer${on.stopCodon - n})`;
      out.proteinEnd = on.stopCodon - 1;
      out.newStopCodon = on.stopCodon;
    } else {
      out.p = `p.(Ter${n}${three(altAa)}extTer?)`;
      out.proteinEnd = n + on.codons.length;
    }
    return classed('stop_lost');
  }
  out.p = `p.(${three(refAa)}${n}${three(altAa)})`;
  out.firstChangedResidue = n;
  out.proteinEnd = model.residues;
  out.newStopCodon = stop;
  return classed('missense_variant');
}

function computeIndel(model, rules, typed, n) {
  const three = (aa) => rules.three.get(aa);
  const { name: cName, intronic } = nameOf(model, n);
  const reference = intronic ? rules.genomic : rules.coding;
  const [gFirst, gLast] = n.kind === 'insertion' ? [n.start - 1, n.start] : [n.start, n.end];
  const reasons = [];
  if (typed.start !== n.trimmed.start || typed.end !== n.trimmed.end) reasons.push('trimmed');
  const point = (x, kind) => (kind === 'duplication' && x !== n.trimmed ? x.end + 1 : x.start);
  const moved = point(n, n.kind) !== point(n.trimmed, n.kind);
  if (moved) reasons.push('moved');
  if (n.kind !== typed.kind) reasons.push('type');
  if (typed.renamedPositions) reasons.push('position');
  const regionOf = (s, t) => {
    const [l1, l2] = [model.locate(s), model.locate(t)];
    if (l1.region === 'intron' && l2.region === 'intron' && l1.after === l2.after) return `intron ${l1.after}`;
    if (l1.region !== 'intron' && l2.region !== 'intron' && l1.exon === l2.exon) return `exon ${l1.exon}`;
    return null;
  };
  const span = (x, kind) => (kind === 'insertion' || (kind === 'duplication' && x === n.trimmed) ? [x.start - 1, x.start] : [x.start, x.end]);
  const typedRegion = regionOf(...span(n.trimmed, n.kind));
  const namedRegion = regionOf(...span(n, n.kind));
  const typedName = typed.typedName;
  const out = {
    kind: n.kind, ref: n.ref, alt: n.alt, cName, reference, name: `${reference}:${cName}`, gFirst, gLast,
    renamed: cName !== typedName && reasons.length ? {
      typed: typedName, name: cName, reasons,
      landsIn: moved && namedRegion && typedRegion !== namedRegion ? namedRegion : null,
      shift: n.kind === 'insertion' && typed.kind === 'insertion' && moved ? n.start - n.trimmed.start : 0,
      rotated: n.kind === 'insertion' && typed.kind === 'insertion' && typed.alt !== n.alt,
      fromInsertion: typed.kind === 'insertion' && n.kind === 'duplication',
    } : null,
    soTerm: null, soId: null, p: null, effectComputed: true, notComputedBecause: null,
    firstChangedResidue: null, proteinEnd: null, newStopCodon: null,
    splice: changeZones(model, rules, n), placements: placementsOf(model, rules, n),
    replaced: [], removed: [], inserted: null, newCodons: [], startUnknown: false, readOn: [],
  };
  if (n.kind === 'duplication') {
    const introns = [...new Set(positions(n.start, n.end).map((g) => model.locate(g)).filter((l) => l.region === 'intron').map((l) => l.after))];
    if (introns.length) out.copyIntrons = { introns, exon: model.locate(n.end).exon };
  }
  const sameLength = (n.kind === 'delins' || n.kind === 'inversion') && n.alt.length === n.ref.length;
  if (sameLength) out.replaced = positions(n.start, n.end).map((g, k) => [g, n.alt[k]]);
  else if (n.kind === 'deletion' || n.kind === 'delins') out.removed = positions(n.start, n.end);
  if (n.kind === 'insertion') out.inserted = { after: n.start - 1, bases: n.alt };
  else if (n.kind === 'duplication' || (n.kind === 'delins' && !sameLength)) out.inserted = { after: n.end, bases: n.alt };
  const classed = (term) => {
    out.soTerm = term;
    out.soId = term ? rules.classes.get(term).so_id : null;
    return out;
  };

  const [lFirst, lLast] = [model.locate(gFirst), model.locate(gLast)];
  out.g = gFirst;
  out.region = lFirst.region === 'intron' || lLast.region === 'intron' ? 'intron'
    : lFirst.region === lLast.region && (lFirst.region === '5utr' || lFirst.region === '3utr') ? lFirst.region : 'cds';
  const between = n.kind === 'insertion' || n.kind === 'duplication';
  const [a, b] = n.kind === 'duplication' ? [n.end, n.end + 1] : [gFirst, gLast];
  const la = model.locate(a);
  const lb = model.locate(b);
  if (la.region === 'intron' && lb.region === 'intron' && la.after === lb.after) {
    out.effectComputed = false;
    out.notComputedBecause = 'intronic';
    out.intron = la.after;
    return classed('intron_variant');
  }
  if (la.region === 'intron' || lb.region === 'intron' || la.exon !== lb.exon) {
    out.effectComputed = false;
    out.notComputedBecause = 'across';
    const part = (l) => (l.region === 'intron' ? { intron: l.after } : { exon: l.exon });
    out.edge = { from: part(la), to: part(lb) };
    return classed(null);
  }
  const cOf = (g) => model.locate(g).c ?? null;
  if (between) {
    if (la.region === '5utr' && (lb.region === '5utr' || cOf(b) === 1)) return Object.assign(classed('5_prime_UTR_variant'), { p: 'p.(=)' });
    if (lb.region === '3utr' && (la.region === '3utr' || cOf(a) === model.cds)) return Object.assign(classed('3_prime_UTR_variant'), { p: 'p.(=)' });
  } else if (la.region === lb.region && (la.region === '5utr' || la.region === '3utr')) {
    return Object.assign(classed(la.region === '5utr' ? '5_prime_UTR_variant' : '3_prime_UTR_variant'), { p: 'p.(=)' });
  }
  const touched = (c1, c3) => (between
    ? cOf(a) != null && cOf(b) != null && cOf(a) >= c1 && cOf(b) <= c3
    : positions(a, b).some((g) => cOf(g) != null && cOf(g) >= c1 && cOf(g) <= c3));
  if (touched(1, 3)) {
    out.p = `p.(${three(model.aaAt(1))}1?)`;
    out.startUnknown = true;
    out.removesStart = n.kind === 'deletion' && [1, 2, 3].every((c) => model.genomeOfC(c) >= a && model.genomeOfC(c) <= b);
    return classed('start_lost');
  }
  const touchesStop = touched(model.cds - 2, model.cds);
  if (touchesStop) {
    const before = !between && cOf(a) != null && cOf(a) < model.cds - 2;
    const after = !between && lb.region === '3utr';
    out.stopPart = before ? (after ? 'through' : 'into') : after ? 'out' : 'in';
  }

  const exonic = model.sequences.exonic;
  let cut;
  let resume;
  let runOrigins;
  if (n.kind === 'insertion') {
    cut = model.txOf(n.start) - 1;
    resume = cut;
    runOrigins = [...n.alt].map((_, j) => [n.start - 1, j + 1]);
  } else if (n.kind === 'duplication') {
    cut = model.txOf(n.end);
    resume = cut;
    runOrigins = [...n.alt].map((_, j) => [n.end, j + 1]);
  } else {
    cut = model.txOf(n.start) - 1;
    resume = model.txOf(n.end);
    runOrigins = sameLength ? positions(n.start, n.end).map((g) => [g, 0]) : [...n.alt].map((_, j) => [n.end, j + 1]);
  }
  const R = runOrigins.length;
  const changed = exonic.slice(0, cut) + n.alt + exonic.slice(resume);
  const originAt = (p) => (p < cut ? [model.genomeOfTx(p + 1), 0]
    : p < cut + R ? runOrigins[p - cut] : [model.genomeOfTx(resume + (p - cut - R) + 1), 0]);
  const cds0 = model.txOf(model.cdsStart) - 1;
  let q = '';
  let stopped = false;
  for (let i = cds0; i + 3 <= changed.length; i += 3) {
    const aa = translate(changed.slice(i, i + 3));
    q += aa;
    if (aa === '*') {
      stopped = true;
      break;
    }
  }
  const P = `${model.sequences.protein}*`;
  const replacedAt = new Set(out.replaced.map(([g]) => g));
  const codonAt = (k) => [k, q[k - 1] ?? translate(changed.slice(cds0 + 3 * (k - 1), cds0 + 3 * k)),
    [0, 1, 2].map((d) => originAt(cds0 + 3 * (k - 1) + d))];
  const isTouched = ([, , o]) => {
    if (o.some(([g, j]) => j > 0 || replacedAt.has(g))) return true;
    const loc = model.locate(o[0][0]);
    return !(loc.region === 'cds' && loc.codonPos === 1 && o[1][0] === model.genomeOfC(loc.c + 1) && o[2][0] === model.genomeOfC(loc.c + 2));
  };
  const lastCodon = stopped ? q.length : Math.floor((changed.length - cds0) / 3);
  const kc = Math.max(1, Math.floor((Math.max(cut, cds0) - cds0) / 3) + 1);
  const touchedFrom = (k0, k1) => {
    const list = [];
    for (let k = k0; k <= Math.min(k1, lastCodon); k += 1) {
      const c = codonAt(k);
      if (isTouched(c)) list.push(c);
    }
    return list;
  };
  const tail = () => {
    const near = touchedFrom(kc, kc + 2);
    const k0 = near.length ? near[0][0] : kc;
    return Array.from({ length: lastCodon - k0 + 1 }, (_, d) => codonAt(k0 + d));
  };
  const net = n.alt.length - (n.kind === 'insertion' || n.kind === 'duplication' ? 0 : n.end - n.start + 1);

  const withhold = () => {
    out.p = null;
    out.nameWithheld = true;
  };
  if (q === P) {
    const hit = touchedFrom(kc, kc + Math.ceil(R / 3) + 2);
    out.newCodons = hit;
    if (hit.length === 1) out.p = `p.(${three(P[hit[0][0] - 1])}${hit[0][0]}=)`;
    else if (hit.length > 1) out.p = 'p.(=)';
    else withhold();
    out.severalCodons = hit.length > 1;
    out.proteinEnd = model.residues;
    out.newStopCodon = model.residues + 1;
    return classed(touchesStop ? 'stop_retained_variant' : 'synonymous_variant');
  }
  let i = 0;
  while (i < q.length && q[i] === P[i]) i += 1;
  const first = i + 1;
  out.firstChangedResidue = first;
  const end = stopped ? q.length - 1 : q.length;
  out.proteinEnd = end;
  out.newStopCodon = stopped ? q.length : null;
  out.shiftsFrame = ((net % 3) + 3) % 3 !== 0;
  const misreadShortening = () => n.kind === 'inversion' && (out.stopPart === 'into' || out.stopPart === 'through');
  const withholdAs = (why) => {
    out.withheldBecause = why;
    withhold();
  };
  if (q[i] === '*') {
    out.p = `p.(${three(P[i])}${first}Ter)`;
    out.newCodons = tail();
    return classed('stop_gained');
  }
  const throughStop = (newStop) => {
    if (first === model.residues + 1) return `p.(Ter${first}${three(q[i])}extTer${newStop})`;
    if (n.kind !== 'deletion' && n.kind !== 'delins' && n.kind !== 'inversion') return null;
    out.namedAsFrameshift = n.kind;
    return `p.(${three(P[i])}${first}${three(q[i])}fsTer${newStop})`;
  };
  if (!stopped) {
    out.proteinEnd = null;
    out.residuesRead = q.length;
    if (first > q.length) {
      out.p = 'p.?';
      out.notComputedBecause = 'transcript-end';
      return classed('terminator_codon_variant');
    }
    out.newCodons = tail();
    out.p = throughStop('?');
    if (!out.p) withhold();
    return classed(q.length > model.residues ? 'stop_lost' : 'terminator_codon_variant');
  }
  if (touchesStop && end > model.residues) {
    out.newCodons = tail();
    const stopCodon = out.newCodons.find(([k]) => k === q.length);
    out.stopFromChange = !!stopCodon
      && !stopCodon[2].some(([g, j]) => j === 0 && model.locate(g).region === '3utr' && !replacedAt.has(g));
    out.p = throughStop(first === model.residues + 1 ? q.length - first : q.length - first + 1);
    if (!out.p) withhold();
    return classed('stop_lost');
  }
  if (out.shiftsFrame) {
    out.p = `p.(${three(P[i])}${first}${three(q[i])}fsTer${q.length - first + 1})`;
    out.newCodons = tail();
    return classed('frameshift_variant');
  }
  const ownStop = codonAt(q.length)[2].some(([g, j]) => j > 0 || replacedAt.has(g));
  if (q.length === P.length && ownStop) {
    out.newCodons = touchedFrom(kc, q.length);
    if (net === 0 && (n.kind === 'delins' || n.kind === 'inversion') && (out.stopPart === 'into' || out.stopPart === 'through')) {
      withholdAs('frameshift-name');
      return classed('missense_variant');
    }
    out.stopAtOldPlace = true;
    withhold();
    return classed(null);
  }
  if (touchesStop && !ownStop && (out.stopPart === 'into' || out.stopPart === 'through') && first <= model.residues
      && (n.kind === 'deletion' || n.kind === 'delins' || n.kind === 'inversion')) {
    out.p = throughStop(q.length - first + 1);
    out.newCodons = tail();
    return classed(net > 0 ? 'inframe_insertion' : net < 0 ? 'inframe_deletion' : 'missense_variant');
  }
  out.newCodons = touchedFrom(kc, kc + Math.ceil(R / 3) + 2);
  let qq = '';
  for (let k = cds0; k + 3 <= changed.length && qq.length < P.length + net / 3; k += 3) qq += translate(changed.slice(k, k + 3));
  let s = 0;
  while (s < qq.length - i && s < P.length - i && qq[qq.length - 1 - s] === P[P.length - 1 - s]) s += 1;
  let was = P.slice(i, P.length - s);
  let now = qq.slice(i, qq.length - s);
  const stopAt = now.indexOf('*');
  if (stopAt >= 0) {
    now = now.slice(0, stopAt + 1);
    was = was.slice(0, now.length);
    out.bringsStop = true;
  }
  out.residueChange = { was, now };
  const at = (k) => `${three(P[k - 1])}${k}`;
  const run = (k, len) => (len === 1 ? at(k) : `${at(k)}_${at(k + len - 1)}`);
  const put = [...now].map(three).join('');
  if (was.length === 1 && now.length === 1) out.p = `p.(${at(first)}${put})`;
  else if (!now.length) out.p = `p.(${run(first, was.length)}del)`;
  else if (!was.length && !out.bringsStop && P.slice(i - now.length, i) === now) {
    out.p = `p.(${run(i - now.length + 1, now.length)}dup)`;
  } else if (!was.length) out.p = `p.(${at(i)}_${at(i + 1)}ins${put})`;
  else out.p = `p.(${run(first, was.length)}delins${put})`;
  const term = net > 0 ? 'inframe_insertion' : net < 0 ? 'inframe_deletion' : 'missense_variant';
  if (!out.bringsStop) return classed(term);
  if (q.length < P.length && misreadShortening()) withholdAs('class-misread');
  if (q.length < P.length) return classed('stop_gained');
  out.p = first === model.residues + 1 ? `p.(Ter${first}${three(q[i])}extTer${q.length - first})` : null;
  if (!out.p) withhold();
  return classed(term);
}

export function typedChange(model, rules, text) {
  const parsed = parseChange(model, rules, text);
  if (parsed.error) return parsed;
  if (parsed.kind === 'substitution') return computeChange(model, rules, parsed);
  const n = normalize(model, parsed);
  if (!n) return { error: 'same', at: parsed.at, base: bases(model, parsed.start, parsed.end), typed: parsed.typed };
  if (n.kind === 'past-end') return { error: 'past-end', typed: parsed.typed };
  if (n.kind === 'before-start') return { error: 'before-start', typed: parsed.typed };
  if (n.kind === 'substitution') {
    const r = computeChange(model, rules, { g: n.start, position: model.cName(n.start), typedPosition: model.cName(n.start), ref: n.ref, alt: n.alt });
    const reasons = parsed.start !== n.start || parsed.end !== n.end ? ['trimmed', 'type'] : ['type'];
    r.renamed = { typed: parsed.typedName, name: r.cName, reasons, landsIn: null, shift: 0, rotated: false, fromInsertion: false };
    return r;
  }
  return computeIndel(model, rules, parsed, n);
}
