
export const RELEASE = 'data/exon_map_v0.5.3/';
export const FILES = {
  exons: 'exon_map_v0.5.3.tsv',
  highlights: 'exon_map_highlights_v0.5.3.tsv',
  header: 'exon_map_header_v0.5.3.json',
  genomic: 'exon_map_genomic_v0.5.3.fa',
  exonic: 'exon_map_exonic_v0.5.3.fa',
  protein: 'exon_map_protein_v0.5.3.fa',
};

export function parseFasta(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  return lines[0].startsWith('>') ? lines.slice(1).join('').trim() : '';
}

const BASES = 'TCAG';
const AAS = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
export const translate = (codon) => {
  const i = [...codon].map((b) => BASES.indexOf(b));
  return i.some((x) => x < 0) ? null : AAS[16 * i[0] + 4 * i[1] + i[2]];
};

export function parseTSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.length > 0);
  const cols = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
  });
}

const int = (v) => (v === '' || v == null ? null : Number.parseInt(v, 10));

export function readRelease(exonsText, highlightsText, header, sequences = null) {
  const exons = parseTSV(exonsText).map((r) => ({
    exon: int(r.exon_number),
    start: int(r.genome_start),
    end: int(r.genome_end),
    codingStart: int(r.coding_genome_start),
    codingEnd: int(r.coding_genome_end),
    codingLength: int(r.coding_length_nt) ?? 0,
    cStart: int(r.c_start),
    cEnd: int(r.c_end),
    firstResidue: int(r.first_residue),
    lastResidue: int(r.last_residue),
    startPhase: int(r.start_phase),
    endPhase: int(r.end_phase),
    splitsAtEnd: r.splits_codon_at_end === 'true',
  }));
  const highlights = parseTSV(highlightsText);
  return { header, exons, highlights, sequences };
}

export function makeModel({ header, exons, highlights, sequences = null }) {
  const problems = [];
  if (header.strand !== '+') {
    problems.push(`The gene is on the "${header.strand}" strand, and this figure can draw only a plus-strand gene.`);
  }
  const coding = exons.filter((e) => e.codingLength > 0);
  const cds = coding.reduce((sum, e) => sum + e.codingLength, 0);
  const residues = cds / 3 - 1;
  const cdsStart = header.transcript.cds_genome_start;
  const cdsEnd = header.transcript.cds_genome_end;
  const first = exons[0];
  const last = exons[exons.length - 1];

  exons.forEach((e, i) => {
    if (i > 0 && e.start <= exons[i - 1].end) problems.push(`Exon ${e.exon} overlaps or precedes exon ${e.exon - 1}.`);
    if (e.codingLength === 0) return;
    if (e.codingEnd - e.codingStart + 1 !== e.codingLength) problems.push(`Exon ${e.exon}: coding bounds and length disagree.`);
    if (e.cEnd - e.cStart + 1 !== e.codingLength) problems.push(`Exon ${e.exon}: c. range and length disagree.`);
    if (e.startPhase !== (e.cStart - 1) % 3) problems.push(`Exon ${e.exon}: start_phase is not (c_start - 1) mod 3.`);
    if (e.endPhase !== e.cEnd % 3) problems.push(`Exon ${e.exon}: end_phase is not c_end mod 3.`);
    if (e.splitsAtEnd !== (e.endPhase !== 0)) problems.push(`Exon ${e.exon}: splits_codon_at_end disagrees with end_phase.`);
  });
  coding.forEach((e, i) => {
    if (e.cStart !== (i === 0 ? 1 : coding[i - 1].cEnd + 1)) problems.push(`Exon ${e.exon}: c. numbering is not continuous.`);
  });
  const fig = header.figures;
  if (cds !== fig.coding_bases || cds !== header.transcript.cds_length_nt) problems.push('Coding bases disagree with the header.');
  if (residues !== fig.residues) problems.push('Residues disagree with the header.');
  if (coding.filter((e) => e.splitsAtEnd).length !== fig.split_codons) problems.push('Split codons disagree with the header.');
  if (cdsStart !== coding[0].codingStart || cdsEnd !== coding[coding.length - 1].codingEnd) {
    problems.push('The header\'s coding start or end disagrees with the exon table.');
  }

  function locate(g) {
    let lo = 0;
    let hi = exons.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const e = exons[mid];
      if (g < e.start) hi = mid - 1;
      else if (g > e.end) lo = mid + 1;
      else if (g < cdsStart) return { region: '5utr', exon: e.exon };
      else if (g > cdsEnd) return { region: '3utr', exon: e.exon };
      else {
        const c = e.cStart + (g - e.codingStart);
        const codon = Math.ceil(c / 3);
        return { region: 'cds', exon: e.exon, c, codon, codonPos: c - 3 * (codon - 1), residue: codon <= residues ? codon : null };
      }
    }
    if (lo === 0 || lo === exons.length) return { region: 'outside' };
    return { region: 'intron', after: exons[lo - 1].exon, before: exons[lo].exon };
  }

  function genomeOfC(c) {
    const e = coding.find((x) => x.cStart <= c && c <= x.cEnd);
    return e ? e.codingStart + (c - e.cStart) : null;
  }

  const exonByNumber = new Map(exons.map((e) => [e.exon, e]));
  const rowAt = new Map(highlights.map((h) => [Number(h.genome_pos), h]));

  const txFirst = [];
  let txLength = 0;
  for (const e of exons) {
    txFirst.push(txLength);
    txLength += e.end - e.start + 1;
  }
  const exonIndexOf = (g) => {
    let lo = 0;
    let hi = exons.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (g < exons[mid].start) hi = mid - 1;
      else if (g > exons[mid].end) lo = mid + 1;
      else return mid;
    }
    return -1;
  };
  const txOf = (g) => {
    const k = exonIndexOf(g);
    return k < 0 ? null : txFirst[k] + (g - exons[k].start) + 1;
  };
  const genomeOfTx = (p) => {
    if (p < 1 || p > txLength) return null;
    let k = exons.length - 1;
    while (txFirst[k] >= p) k -= 1;
    return exons[k].start + (p - txFirst[k] - 1);
  };
  const txCdsStart = txOf(cdsStart);
  const txCdsEnd = txOf(cdsEnd);

  const exonicNumber = (g) => {
    const loc = locate(g);
    if (loc.region === 'cds') return String(loc.c);
    return loc.region === '5utr' ? `-${txCdsStart - txOf(g)}` : `*${txOf(g) - txCdsEnd}`;
  };
  function cName(g) {
    const loc = locate(g);
    if (loc.region === 'outside') return null;
    if (loc.region !== 'intron') return `c.${exonicNumber(g)}`;
    const a = exonByNumber.get(loc.after);
    const b = exonByNumber.get(loc.before);
    const k = g - a.end;
    return k <= Math.ceil((b.start - a.end - 1) / 2) ? `c.${exonicNumber(a.end)}+${k}` : `c.${exonicNumber(b.start)}-${b.start - g}`;
  }

  function parseCName(text) {
    const m = /^(?:c\.?)?([-*])?(\d+)(?:([+-])(\d+))?$/i.exec(String(text).trim().replace(/[\s,]+/g, ''));
    if (!m) return { error: 'syntax' };
    const [, sign, digits, side, offsetDigits] = m;
    const n = Number(digits);
    const k = side ? Number(offsetDigits) : 0;
    const base = `c.${sign ?? ''}${n}`;
    const typed = side ? `${base}${side}${k}` : base;
    if (n === 0 || (side && k === 0)) return { error: sign || side ? 'syntax' : 'c0', typed };
    let g;
    if (!sign) {
      if (n > cds) return { error: 'past-stop', typed };
      g = genomeOfC(n);
    } else {
      const p = sign === '-' ? txCdsStart - n : txCdsEnd + n;
      if (p < 1) return { error: 'before', typed };
      if (p > txLength) return { error: 'after', typed };
      g = genomeOfTx(p);
    }
    if (!side) return { g, name: typed, typed };
    const i = exonIndexOf(g);
    const e = exons[i];
    if (side === '+' ? e.end !== g : e.start !== g) return { error: side === '+' ? 'not-last' : 'not-first', base, typed };
    const next = side === '+' ? exons[i + 1] : exons[i - 1];
    if (!next) return { error: side === '+' ? 'after' : 'before', typed };
    const length = side === '+' ? next.start - e.end - 1 : e.start - next.end - 1;
    if (k > length) return { error: 'past-intron', intron: side === '+' ? e.exon : next.exon, length, typed };
    const target = side === '+' ? g + k : g - k;
    return { g: target, name: cName(target), typed };
  }

  for (const h of highlights) {
    const loc = locate(Number(h.genome_pos));
    const where = `Highlight ${h.c_hgvs} (${h.label})`;
    if (loc.region !== h.region) problems.push(`${where}: region ${h.region}, arithmetic says ${loc.region}.`);
    if (loc.region === 'cds') {
      if (`c.${loc.c}` !== h.c_hgvs || String(loc.c) !== h.c_pos) problems.push(`${where}: c. position disagrees.`);
      if (String(loc.codon) !== h.codon_number || String(loc.residue) !== h.residue_number
        || String(loc.codonPos) !== h.codon_position) problems.push(`${where}: codon or residue disagrees.`);
      if (String(loc.exon) !== h.exon_number) problems.push(`${where}: exon disagrees.`);
      if (h.ref_codon && translate(h.ref_codon) !== h.ref_aa) problems.push(`${where}: ${h.ref_codon} does not translate to ${h.ref_aa}.`);
    } else if (h.c_pos || h.codon_number || h.residue_number) {
      problems.push(`${where}: a position with no residue carries a residue field.`);
    }
    if (loc.region === 'intron' && h.intron_number !== String(loc.after)) {
      problems.push(`${where}: intron_number ${h.intron_number}, but it lies between exons ${loc.after} and ${loc.before}.`);
    }
    if (h.c_hgvs !== cName(Number(h.genome_pos))) problems.push(`${where}: HGVS's rule names it ${cName(Number(h.genome_pos))}.`);
  }
  const byCodon = new Map();
  for (const h of highlights) if (h.region === 'cds') byCodon.set(h.codon_number, [...(byCodon.get(h.codon_number) || []), h]);
  for (const [n, rows] of byCodon) {
    if (rows.length !== 3) continue;
    const spelled = [1, 2, 3].map((p) => (rows.find((r) => r.codon_position === String(p)) || {}).genome_base).join('');
    if (rows.some((r) => r.ref_codon && r.ref_codon !== spelled)) problems.push(`Codon ${n}: its bases spell ${spelled}, not ${rows[0].ref_codon}.`);
  }
  const v = header.variant;
  if (v) {
    const row = highlights.find((h) => h.label === 'variant');
    const alt = v.ref_codon.slice(0, v.codon_position - 1) + v.alt_base + v.ref_codon.slice(v.codon_position);
    const loc = locate(v.genome_pos);
    if (!row || Number(row.genome_pos) !== v.genome_pos || row.genome_base !== v.ref_base) problems.push('The variant block disagrees with its highlight row.');
    if (loc.c !== v.c_pos || loc.codon !== v.codon_number || loc.codonPos !== v.codon_position || loc.exon !== v.exon_number) {
      problems.push('The variant block\'s c., codon or exon disagrees with the arithmetic.');
    }
    if (alt !== v.alt_codon || translate(v.alt_codon) !== v.alt_aa || translate(v.ref_codon) !== v.ref_aa) {
      problems.push('The variant\'s alternate codon or residue is not the reference codon with its base changed.');
    }
    if (v.c_change !== `c.${v.c_pos}${v.ref_base}>${v.alt_base}`) problems.push('The variant\'s c. change disagrees with its bases.');
    for (const h of byCodon.get(String(v.codon_number)) || []) {
      if (h.alt_codon !== v.alt_codon || h.alt_aa !== v.alt_aa) problems.push(`Highlight ${h.c_hgvs}: its alternate codon disagrees with the variant block.`);
    }
  }

  let baseAt = () => null;
  let codonBases = () => null;
  let aaAt = () => null;
  if (sequences) {
    const { genomic, exonic, protein } = sequences;
    const s0 = first.start;
    const stated = header.sequences;
    if (stated && (stated.genomic_span.first_position !== s0 || stated.genomic_span.last_position !== last.end)) {
      problems.push('The genomic span\'s first or last position disagrees with the exon table.');
    }
    if (genomic.length !== last.end - s0 + 1) problems.push('The genomic span is not as long as the exon table\'s span.');
    if (!/^[ACGT]+$/.test(genomic) || !/^[ACGT]+$/.test(exonic)) problems.push('A sequence holds a letter other than A, C, G or T.');
    if (exons.map((e) => genomic.slice(e.start - s0, e.end - s0 + 1)).join('') !== exonic) {
      problems.push('The exonic sequence is not the genomic span cut at the exon bounds.');
    }
    if (protein.length !== residues) problems.push('The protein is not as long as the coding sequence has residues.');
    baseAt = (g) => (g >= s0 && g <= last.end ? genomic[g - s0] : null);
    codonBases = (n) => (n >= 1 && n <= residues + 1 ? [0, 1, 2].map((k) => baseAt(genomeOfC(3 * n - 2 + k))).join('') : null);
    aaAt = (r) => (r >= 1 && r <= protein.length ? protein[r - 1] : null);
    for (let n = 1; n <= residues + 1; n += 1) {
      const aa = translate(codonBases(n));
      if (n <= residues ? aa !== protein[n - 1] : aa !== '*') {
        problems.push(`Codon ${n} (${codonBases(n)}) does not translate to ${n <= residues ? `residue ${n}, ${protein[n - 1]}` : 'a stop'}.`);
        break;
      }
    }
    for (const h of highlights) {
      if (h.genome_base && baseAt(Number(h.genome_pos)) !== h.genome_base) {
        problems.push(`Highlight ${h.c_hgvs}: its base is ${h.genome_base}, the genomic span has ${baseAt(Number(h.genome_pos))}.`);
      }
    }
  }

  return {
    header, exons, coding, highlights, problems, cds, residues, cdsStart, cdsEnd,
    span: { start: first.start, end: last.end },
    locate, genomeOfC, exonByNumber, rowAt,
    sequences, baseAt, codonBases, aaAt,
    cName, parseCName, txLength, txOf, genomeOfTx,
  };
}

const cRange = (model, from, to) => Array.from({ length: to - from + 1 }, (_, i) => model.genomeOfC(from + i))
  .filter((g) => g != null);

function withIntronEdges(model, positions) {
  const out = [...positions];
  for (let i = 1; i < positions.length; i += 1) {
    const a = positions[i - 1];
    const b = positions[i];
    if (b - a > 1 && model.locate(a).exon !== model.locate(b).exon) out.push(a + 1, b - 1);
  }
  return out;
}

export function makeViews(model) {
  const { highlights: hl, locate, exonByNumber } = model;
  const views = [];
  const pos = (h) => Number(h.genome_pos);

  const variant = hl.find((h) => h.label === 'variant' && h.region === 'cds');
  if (variant) {
    const n = Number(variant.codon_number);
    views.push({ id: 'variant', kind: 'variant', anchors: [pos(variant)], positions: cRange(model, 3 * n - 5, 3 * n + 3) });
  }

  const split = hl.filter((h) => h.split_codon === 'true');
  let splitIntron = null;
  if (split.length) {
    const n = Number(split[0].codon_number);
    const positions = withIntronEdges(model, cRange(model, 3 * n - 5, 3 * n + 3));
    splitIntron = positions.map(locate).find((l) => l.region === 'intron')?.after ?? null;
    views.push({ id: 'split', kind: 'example', anchors: split.map(pos), positions });
  }

  const introns = d3groups(hl.filter((h) => h.region === 'intron'), (h) => locate(pos(h)).after);
  const [intronAfter, intronic] = introns.find(([after]) => after !== splitIntron) || introns[0] || [];
  if (intronic) {
    const a = exonByNumber.get(intronAfter);
    const b = exonByNumber.get(intronAfter + 1);
    const positions = [a.end - 1, a.end, a.end + 1, ...intronic.map(pos), b.start - 1, b.start, b.start + 1];
    views.push({ id: 'intron', kind: 'example', anchors: intronic.map(pos), positions });
  }

  const utr = hl.find((h) => h.region === '5utr' || h.region === '3utr');
  if (utr) {
    const g = pos(utr);
    const edge = utr.region === '5utr'
      ? [model.cdsStart - 1, model.cdsStart, model.cdsStart + 1, model.cdsStart + 2]
      : [model.cdsEnd - 2, model.cdsEnd - 1, model.cdsEnd, model.cdsEnd + 1];
    views.push({ id: 'utr', kind: 'example', anchors: [g], positions: [g - 1, g, g + 1, ...edge] });
  }
  return views;
}

export function exampleWindow(model, view) {
  const locs = view.anchors.map((g) => model.locate(g));
  if (!locs.length || locs.some((l) => l.region === 'outside')) return null;
  const exons = [...new Set(locs.filter((l) => l.exon != null).map((l) => l.exon))];
  const introns = [...new Set(locs.filter((l) => l.region === 'intron').map((l) => l.after))];
  if (!introns.length && exons.length === 1) return `exon:${exons[0]}`;
  const n = introns.length ? introns[0] : Math.min(...exons);
  const around = introns.length <= 1 && exons.every((e) => e === n || e === n + 1);
  return around && model.exonByNumber.has(n + 1) ? `intron:${n}` : null;
}

export function makePinView(model, g) {
  const loc = model.locate(g);
  let positions;
  if (loc.region === 'cds') {
    const n = loc.codon;
    positions = withIntronEdges(model, cRange(model, Math.max(1, 3 * n - 5), Math.min(model.cds, 3 * n + 3)));
    if (n === 1) positions.push(model.cdsStart - 3, model.cdsStart - 2, model.cdsStart - 1);
    if (n === model.residues + 1) positions.push(model.cdsEnd + 1, model.cdsEnd + 2, model.cdsEnd + 3);
  } else {
    positions = Array.from({ length: 9 }, (_, k) => g - 4 + k);
  }
  return { id: 'pin', kind: 'pin', anchors: [g], positions: positions.filter((p) => p >= model.span.start && p <= model.span.end) };
}

export function trackModel(model, mode) {
  const { exons, span } = model;
  const exonIndexAt = (g) => {
    let lo = 0;
    let hi = exons.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (g < exons[mid].start) hi = mid - 1;
      else if (g > exons[mid].end) lo = mid + 1;
      else return mid;
    }
    return -1;
  };
  const cuts = (g0, g1) => {
    const a = model.locate(g0);
    const b = model.locate(g1);
    if (a.region === 'cds' && b.region === 'cds') return a.codon === b.codon;
    if (a.region === 'cds' && b.region === 'intron') return a.codonPos < 3;
    if (a.region === 'intron' && b.region === 'cds') return b.codonPos > 1;
    return false;
  };
  if (mode === 'genomic') {
    const length = span.end - span.start + 1;
    const genomeAt = (i) => (i >= 0 && i < length ? span.start + i : null);
    const inExon = (g) => exonIndexAt(g) >= 0;
    const edgeAfter = (i) => i >= 0 && i < length - 1 && inExon(span.start + i) !== inExon(span.start + i + 1);
    return {
      mode,
      length,
      genomeAt,
      indexOf: (g) => (g >= span.start && g <= span.end ? g - span.start : null),
      junctionOf: () => null,
      edgeAfter,
      splitAfter: (i) => edgeAfter(i) && cuts(span.start + i, span.start + i + 1),
      featureAt(i) {
        const g = genomeAt(i);
        if (g == null) return null;
        const k = exonIndexAt(g);
        if (k >= 0) return exons[k].start === g ? { kind: 'exon', n: exons[k].exon } : null;
        const loc = model.locate(g);
        return loc.region === 'intron' && model.exonByNumber.get(loc.after).end === g - 1 ? { kind: 'intron', n: loc.after } : null;
      },
    };
  }
  const offsets = [];
  let length = 0;
  for (const e of exons) {
    offsets.push(length);
    length += e.end - e.start + 1;
  }
  const firstCells = new Map(offsets.map((o, k) => [o, k]));
  const exonOfCell = (i) => {
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= i) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const genomeAt = (i) => {
    if (i < 0 || i >= length) return null;
    const k = exonOfCell(i);
    return exons[k].start + (i - offsets[k]);
  };
  const edgeAfter = (i) => i >= 0 && i < length - 1 && firstCells.has(i + 1);
  return {
    mode,
    length,
    genomeAt,
    indexOf(g) {
      const k = exonIndexAt(g);
      return k < 0 ? null : offsets[k] + (g - exons[k].start);
    },
    junctionOf(g) {
      const loc = model.locate(g);
      if (loc.region !== 'intron') return null;
      const k = exons.indexOf(model.exonByNumber.get(loc.after));
      return offsets[k] + (exons[k].end - exons[k].start);
    },
    edgeAfter,
    splitAfter: (i) => edgeAfter(i) && cuts(genomeAt(i), genomeAt(i + 1)),
    featureAt: (i) => (firstCells.has(i) ? { kind: 'exon', n: exons[firstCells.get(i)].exon } : null),
  };
}

function d3groups(items, keyOf) {
  const map = new Map();
  for (const item of items) {
    const k = keyOf(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return [...map];
}

export function columns(model, positions) {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((g, i) => {
    if (i > 0 && g - sorted[i - 1] > 1) {
      const from = sorted[i - 1] + 1;
      const to = g - 1;
      const a = model.locate(from);
      const b = model.locate(to);
      const same = a.region === b.region && a.exon === b.exon && a.after === b.after;
      out.push({ kind: 'gap', from, to, ...(same ? a : { region: 'mixed' }) });
    }
    out.push({ kind: 'position', g, ...model.locate(g), row: model.rowAt.get(g) ?? null });
  });
  return out;
}
