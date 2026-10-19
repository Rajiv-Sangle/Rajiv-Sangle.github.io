
const host = globalThis.document ? document.querySelector('d-figure#fig-residue-assembly') : null;
const figureName = (fig) => `Figure ${[...document.querySelectorAll('d-title d-figure, d-article d-figure')].indexOf(fig) + 1}`;

export const NAMES = {
  tables: {
    set: 'cl4_set',
    partners: 'cl4_partners',
    structures: 'cl4_structures',
    gnomad: 'cl4_gnomad',
    clinvar: 'cl4_clinvar',
    conditions: 'cl4_clinvar_conditions',
  },
  columns: {
    set: {
      position: 'human_position',
      residue: 'human_residue',
    },
    partners: {
      position: 'human_position',
      species: 'species',
      correspondence: 'correspondence',
      partnerPosition: 'partner_position',
      partnerResidue: 'partner_residue',
      reliability: 'reliability',
      reliabilityReasons: 'reliability_reasons',
      ambiguous: 'ambiguous',
      mappingTable: 'mapping_table',
    },
    structures: {
      position: 'human_position',
      species: 'species',
      partnerPosition: 'partner_position',
      partnerResidue: 'partner_residue',
      entry: 'entry',
      chain: 'chain',
      status: 'status',
      joinPath: 'join_path',
      checkedAgainstSifts: 'checked_against_sifts',
      notJoinedReason: 'not_joined_reason',
      structureResidue: 'structure_residue',
      differs: 'differs_from_reference',
      declaration: 'declaration',
      stateA: 'state_class_a',
      stateMinus: 'state_class_minus_0_5',
      statePlus: 'state_class_plus_0_5',
      quality: 'local_model_quality',
      c5sVerdict: 'c5s_verdict',
      c5sCheckResult: 'c5s_check_result',
      structureRecord: 'structure_record',
      numberingTables: 'numbering_tables',
      stateTable: 'state_table',
    },
    gnomad: {
      position: 'human_position',
      variant: 'variant_id',
      hgvsp: 'hgvsp',
      exomePresent: 'exome_present',
      exomeFilters: 'exome_filters',
      genomePresent: 'genome_present',
      genomeFilters: 'genome_filters',
      observedPass: 'observed_pass',
      gnomadTable: 'gnomad_table',
      attribution: 'attribution',
    },
    clinvar: {
      position: 'human_position',
      accession: 'accession_version',
      title: 'title',
      description: 'description',
      reviewStatus: 'review_status',
      lastEvaluated: 'last_evaluated',
      nConditions: 'n_conditions',
      nWithMondo: 'n_conditions_with_mondo',
      clinvarRetrieval: 'clinvar_retrieval',
      attribution: 'attribution',
    },
    conditions: {
      position: 'human_position',
      accession: 'accession_version',
      index: 'condition_index',
      name: 'condition_name',
      mondo: 'mondo_id',
      mondoGiven: 'mondo_given',
      clinvarRetrieval: 'clinvar_retrieval',
    },
  },
  manifest: {
    files: 'files',
    record: 'table_record',
    withheld: 'withheld',
    withheldRecord: 'record',
    withheldSum: 'sha256',
    withheldReason: 'reason',
  },
  withheldList: {
    item: 'item',
    sha256: 'sha256',
  },
  types: {
    method: 'method',
    run: 'run',
    retrieval: 'retrieval',
    source: 'source',
    table: 'table',
  },
  fields: {
    id: 'id',
    type: 'type',
    synthetic: 'synthetic',
    name: 'name',
    version: 'version',
    implementation: 'implementation',
    methodDigest: 'implementation.code_digest',
    method: 'method',
    runDigest: 'software.code_digest',
    started: 'started_at_time',
    ended: 'ended_at_time',
    usedFiles: 'used_files',
    filePath: 'path',
    source: 'source',
    sourceRelease: 'source_release',
    generated: 'generated',
    url: 'request.url',
    httpMethod: 'request.http_method',
    identifier: 'identifier',
    sha256: 'sha256',
    generatedBy: 'provenance.was_generated_by',
    tableMethod: 'provenance.method',
    used: 'provenance.used',
    primarySource: 'provenance.primary_knowledge_source',
  },
};
export const COLUMNS = NAMES.columns;
const TYPES = NAMES.types;
const PATHS = Object.fromEntries(Object.entries(NAMES.fields).map(([key, name]) => [key, name.split('.')]));
const field = (record, key) => PATHS[key].reduce((v, k) => (v == null ? undefined : v[k]), record);
const FILES = [...Object.keys(NAMES.tables), 'manifest', 'records', 'withheld'];

export const JOIN_PATH = {
  agree: 'numbering checked against SIFTS and by ChannelScope\'s alignment (two methods on the same inputs)',
  'path A only': 'numbering checked by ChannelScope\'s alignment alone, not against SIFTS',
};
export const JOIN_PATH_LINE = {
  agree: JOIN_PATH.agree,
  'path A only': 'numbering checked by ChannelScope\'s alignment alone: SIFTS, read for this entry, maps the chain to no '
    + 'UniProt entry',
};
export const WORDS = {
  correspondence: { pair: '', 'no-correspondence': 'no correspondence' },
  ambiguous: { false: 'unambiguous', true: 'ambiguous' },
  joinPath: JOIN_PATH_LINE,
  c5sVerdict: { consistent: 'consistent', 'not determinable': 'not determinable', 'counts against': 'counts against' },
  state: { closed: 'closed', open: 'open', indeterminate: 'indeterminate' },
  observedPass: { true: 'yes', false: 'no' },
  filters: { none: 'none', absent: 'not in this dataset' },
  mondo: 'none given',
  declared: (declaration) => `a declared difference (${declaration})`,
  moved: (down, up) => `down: ${down} · up: ${up}`,
  unchanged: 'unchanged',
};
const BOOLEAN = { true: true, false: false };
export const STATUSES = [
  { status: 'joined', path: 'agree', label: 'joined where both numbering paths agree (agree)' },
  { status: 'joined', path: 'path A only', label: 'joined on ChannelScope\'s alignment (path A) only' },
  { status: 'withdrawn (C5-S)', label: 'withdrawn by the test by coordinates (C5-S)' },
  { status: 'not joined', label: 'not joined' },
  { status: 'modelled, not placed', label: 'modelled, not placed' },
  { status: 'not determinable', label: 'not determinable' },
  { status: 'not modelled', label: 'not modelled' },
  { status: 'entry not analysed', label: 'entry not analysed' },
];
const JOINED = 'joined';
const WITHDRAWN = 'withdrawn (C5-S)';
const REASONED = [WITHDRAWN, 'not joined', 'modelled, not placed', 'not determinable'];
export const COUNTED = ['closed', 'open'];
export const GROUPS = {
  mapping: { record: 'mappingTable' },
  numbering: { record: 'numberingTables', list: true },
  residue: { record: 'structureRecord' },
  state: { record: 'stateTable' },
  c5s: { record: 'c5sCheckResult' },
  gnomad: { record: 'gnomadTable' },
  clinvar: { record: 'clinvarRetrieval' },
  composition: { fixed: true },
};

export const TEXT = {
  badge: 'Mock data · never for publication',
  loading: 'Loading the data…',
  subject: 'Human residue',
  a: {
    head: 'One residue, its layers side by side',
    guide: 'A layer to a group of rows. Each group of values ends in a chip naming its sources and a date: the day it '
      + 'was retrieved, or the day the record holding it was made, in UTC. Choose any value to follow it back in B.',
  },
  partners: {
    head: 'Partners in other species',
    guide: 'The residue that matches it in each species, and how reliable the match is.',
    cols: ['', 'its residue', 'reliability', 'alignment', 'reasons', 'source, date'],
  },
  structures: {
    head: 'Structures of its partners\' channels',
    guide: [`Experimental structures of a partner's channel, by entry and chain. For those joined to the residue: the `
      + `structure's own residue there; its ${JOIN_PATH.agree}, or its ${JOIN_PATH['path A only']}; and its state at `
      + 'the gate, as measured by A, one of two implementations in ChannelScope\'s own code.',
    'Closed means narrow at the gate\'s ring of isoleucines, and open means wide there, as measured, not whether ions '
      + 'flow: closed below 2.0\u00a0Å, open above 3.0\u00a0Å, indeterminate between. The classes are also given with '
      + 'both lines moved together by 0.5\u00a0Å: down, to 1.5 and 2.5\u00a0Å, and up, to 2.5 and 3.5\u00a0Å.'],
    cols: ['entry', 'chains', 'its residue', 'numbering', 'state at the gate', 'if the class lines move by 0.5\u00a0Å',
      'source, date'],
    quality: 'local model quality',
    qualityContext: 'every structure joined to it',
  },
  folds: {
    guide: 'Open a species to list its structures. An entry is counted once per residue and species, under the first '
      + `status that any of its chains reaches, in this order: ${STATUSES.map((s) => s.label).join('; ')}.`,
    structures: (n) => `${n} ${n === 1 ? 'structure' : 'structures'}`,
    status: (label, counts) => `${label}: ${counts}`,
  },
  notJoined: {
    head: 'Not joined to this residue',
    guide: 'Set apart, each with its status and reason, and not among those joined to it.',
    cols: ['entry', 'chains', 'its residue', 'status', 'reason', 'source, date'],
  },
  population: {
    head: 'Population variants',
    guide: (name) => `The variants seen at it in ${name}, with ${name}'s filters, and whether each was observed passing `
      + `them. Observed passing is yes where ${name}'s exomes or genomes have an allele count above 0 for the variant `
      + `and no filter; it is a rule of ChannelScope's build of its ${name} table, not a field ${name} gives.`,
    cols: ['variant', 'its identifier', 'exome filters', 'genome filters', 'observed passing', 'source, date'],
  },
  clinical: {
    head: 'Clinical record',
    guide: (name) => `${name}'s records at it: each classification quoted as ${name} gives it, with its review status, `
      + 'the date it was last evaluated, and each condition with its Mondo identifier.',
    attribution: (name) => `${name}'s classification`,
    cols: ['accession', 'title', 'classification', 'review status', 'last evaluated', 'source, date'],
    conditionCols: ['condition', 'Mondo identifier'],
  },
  b: {
    head: 'One value, followed back',
    guide: 'Choose any value in A: click or tap it, or Tab to it and press Enter. It is followed back here, step by '
      + 'step, to where it came from, each step with its identifier and checksum.',
  },
  steps: {
    value: 'the value',
    record: 'the record that holds it',
    records: 'the records that hold it',
    activity: 'the run and method behind it',
    activities: 'the runs and methods behind it',
    method: 'the method behind it',
    inputs: 'the retrievals behind it',
    inputsFiles: 'the retrievals and files behind it',
    source: 'its source',
    sources: 'its sources',
  },
  chip: { retrieved: 'retrieved', made: 'made', zone: 'UTC' },
  fixed: 'No source: the method writes this text itself.',
  failed: 'It cannot be followed further:',
  unwalkable: 'its chain cannot be walked',
  composition: 'ChannelScope',
  withheld: 'withheld (it cites this project\'s working records by identifier)',
  c5s: (verdict) => `the test by coordinates (C5-S): ${verdict}`,
  usedFile: 'a file it used',
  live: (context, kind, names) => `Panel B follows back ${context}: a value held by ${kind}${names ? `, from ${names}` : ''}.`,
};

const ID = /^cs:([a-z_]+)\.[A-Za-z0-9_-]{32}$/;
const SHA = /^sha256:[0-9a-f]{64}$/;
const SOURCE_ID = /^source:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/;
const POSITION = /^[1-9]\d*$/;
const COUNT = /^(?:0|[1-9]\d*)$/;
const AMINO = /^[A-Z](?:[a-z]{2})?$|^[A-Z]{3}$/;
const FILTER_LIST = /^[A-Za-z0-9_]+(?:,[A-Za-z0-9_]+)*$/;
const MONDO = /^MONDO:\d+$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SVG = 'http://www.w3.org/2000/svg';
const ONE = { ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V' };
const oneLetter = (code) => (code && code.length === 1 ? code.toUpperCase() : ONE[(code || '').toUpperCase()] || null);

export function day(cell) {
  const m = DATE.exec(cell || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : cell;
}
const dateOf = (cell) => (DATE.test(cell || '') ? cell.slice(0, 10) : null);
const clock = (iso) => `${day(iso)}, ${iso.slice(11, 16)} UTC`;
export const shortSum = (sum) => `${(sum || '').replace(/^sha256:/, '').slice(0, 12)}…`;
const unique = (list) => [...new Set(list)];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}


export function parseTable(text, key) {
  const name = NAMES.tables[key];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  if (!lines.length) return { key, columns: [], rows: [], problems: [`The table ${name} is empty: it has no column line.`] };
  const problems = [];
  const columns = lines[0].split('\t');
  const twice = columns.filter((c, k) => columns.indexOf(c) !== k);
  if (twice.length) problems.push(`The table ${name} names a column twice: ${unique(twice).join(', ')}.`);
  const rows = [];
  for (let k = 1; k < lines.length; k += 1) {
    const cells = lines[k].split('\t');
    if (cells.length !== columns.length) {
      problems.push(`${name}, row ${rows.length + 1}: ${cells.length} cells for ${columns.length} columns.`);
    }
    rows.push({ table: key, n: rows.length + 1, cells: Object.fromEntries(columns.map((c, j) => [c, cells[j] ?? ''])) });
  }
  return { key, columns, rows, problems };
}

export function parseManifest(text) {
  const M = NAMES.manifest;
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { problems: [`The manifest is not JSON (${err.message}).`] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { problems: ['The manifest is not a JSON object.'] };
  const problems = [];
  const files = Array.isArray(data[M.files]) ? data[M.files] : null;
  if (!files) problems.push(`The manifest lists no files ("${M.files}", NAMES.manifest.files).`);
  const tableRecords = (files || []).map((f) => (f && typeof f === 'object' ? f[M.record] : undefined));
  if (tableRecords.some((id) => !ID.test(id || ''))) {
    problems.push(`A file of the manifest names no table record ("${M.record}", NAMES.manifest.record).`);
  }
  const withheld = new Map();
  const listed = data[M.withheld] === undefined ? [] : data[M.withheld];
  if (!Array.isArray(listed)) problems.push(`The manifest's withheld records are not a list ("${M.withheld}", NAMES.manifest.withheld).`);
  for (const w of Array.isArray(listed) ? listed : []) {
    const id = w && w[M.withheldRecord];
    if (!ID.test(id || '') || !SHA.test((w && w[M.withheldSum]) || '') || !isText(w && w[M.withheldReason])) {
      problems.push(`A record the manifest withholds has no identifier, SHA-256 or reason of their form (NAMES.manifest.withheld*).`);
      continue;
    }
    withheld.set(id, { id, sum: w[M.withheldSum], reason: w[M.withheldReason] });
  }
  return { tableRecords: tableRecords.filter(Boolean), withheld, problems };
}

export function parseWithheldList(text) {
  const L = NAMES.withheldList;
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.length);
  const columns = (lines[0] || '').split('\t');
  const at = { item: columns.indexOf(L.item), sum: columns.indexOf(L.sha256) };
  if (at.item < 0 || at.sum < 0) {
    return { sums: new Map(), problems: [`The release's withheld list has no column "${L.item}" or "${L.sha256}" (NAMES.withheldList).`] };
  }
  const sums = new Map();
  const problems = [];
  for (const line of lines.slice(1)) {
    const cells = line.split('\t');
    if (!SHA.test(cells[at.sum] || '')) problems.push(`The release's withheld list gives ${cells[at.item]} no SHA-256 of its form.`);
    sums.set(cells[at.item], cells[at.sum]);
  }
  return { sums, problems };
}

export function parseRecords(text) {
  const trimmed = text.trim();
  try {
    if (trimmed.startsWith('[')) {
      const list = JSON.parse(trimmed);
      if (Array.isArray(list)) return { records: list, problems: [] };
    }
    const records = trimmed.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    if (records.every((r) => r && typeof r === 'object' && !Array.isArray(r))) return { records, problems: [] };
    return { problems: ['The records file holds something other than records.'] };
  } catch (err) {
    return { problems: [`The records file is not JSON Lines (${err.message}).`] };
  }
}

const isText = (v) => typeof v === 'string';
const MADE = { generatedBy: (v) => ID.test(v || ''), tableMethod: (v) => ID.test(v || ''), used: Array.isArray };
const FORMS = {
  method: { name: isText, version: isText, implementation: (v) => !!v && typeof v === 'object' },
  run: { method: (v) => ID.test(v || ''), runDigest: (v) => SHA.test(v || ''), started: (v) => TIME.test(v || ''),
    ended: (v) => TIME.test(v || '') },
  retrieval: { source: (v) => SOURCE_ID.test(v || ''), method: (v) => ID.test(v || ''), generated: (v) => SHA.test(v || ''),
    started: (v) => TIME.test(v || ''), url: isText },
  source: { identifier: (v) => SOURCE_ID.test(v || ''), name: (v) => isText(v) && v.length > 0 },
  table: { sha256: (v) => SHA.test(v || ''), name: isText, ...MADE },
  made: MADE,
};
const kindOf = (r) => Object.keys(TYPES).find((k) => TYPES[k] === field(r, 'type'))
  || (field(r, 'generatedBy') !== undefined ? 'made' : undefined);
const derived = (r) => ['table', 'made'].includes(kindOf(r));

export function checkRecords(records) {
  const problems = [];
  const seen = new Set();
  records.forEach((r, k) => {
    const id = r && typeof r === 'object' ? field(r, 'id') : undefined;
    const m = ID.exec(id || '');
    if (!m || m[1] !== field(r, 'type')) {
      problems.push(`Record ${k + 1} has no identifier of its type's form (${id}).`);
      return;
    }
    if (seen.has(id)) problems.push(`The record ${id} is listed twice.`);
    seen.add(id);
    if (typeof field(r, 'synthetic') !== 'boolean') {
      problems.push(`The record ${id} does not say whether it is synthetic (${NAMES.fields.synthetic}).`);
    }
    for (const [key, ok] of Object.entries(FORMS[kindOf(r)] || {})) {
      if (!ok(field(r, key))) {
        problems.push(`The record ${id} (a ${field(r, 'type')}) has no field "${NAMES.fields[key]}" of its form `
          + `(NAMES.fields.${key} in residue_assembly.js).`);
      }
    }
  });
  return problems;
}

const cell = (row, key) => row.cells[COLUMNS[row.table][key]];
const colName = (row, key) => COLUMNS[row.table][key];
const recordIds = (row, group) => {
  const v = cell(row, GROUPS[group].record) || '';
  return GROUPS[group].list ? v.split(';').filter(Boolean) : (v ? [v] : []);
};
const rankOf = (row) => STATUSES.findIndex((s) => s.status === cell(row, 'status')
  && (!s.path || s.path === cell(row, 'joinPath')));
const structureOf = (r) => cell(r, 'entry');

export function readComposition(tables) {
  const problems = tables.flatMap((t) => t.problems);
  let missing = 0;
  for (const t of tables) {
    for (const [key, name] of Object.entries(COLUMNS[t.key])) {
      if (t.columns.includes(name)) continue;
      missing += 1;
      problems.push(`The table ${NAMES.tables[t.key]} has no column "${name}" (NAMES.columns.${t.key}.${key} in `
        + 'residue_assembly.js).');
    }
  }
  if (missing) return { model: null, problems };
  const T = Object.fromEntries(tables.map((t) => [t.key, t.rows]));
  const bad = (row, what) => problems.push(`${NAMES.tables[row.table]}, row ${row.n}: ${what}`);
  const known = (row, key, words) => {
    const v = cell(row, key);
    if (!Object.prototype.hasOwnProperty.call(words, v)) bad(row, `"${v}" is not a value the figure knows for ${colName(row, key)}.`);
    return v;
  };
  const filled = (row, ...keys) => keys.forEach((k) => { if (!cell(row, k)) bad(row, `${colName(row, k)} is empty.`); });
  const form = (row, key, re, what) => {
    if (cell(row, key) && !re.test(cell(row, key))) bad(row, `${colName(row, key)} is not ${what}.`);
  };
  const records = (row, group) => {
    const ids = recordIds(row, group);
    if (!ids.length) bad(row, `${colName(row, GROUPS[group].record)} is empty.`);
    for (const id of ids) if (!ID.test(id)) bad(row, `${colName(row, GROUPS[group].record)} names no record (${id}).`);
  };

  if (T.set.length !== 1) problems.push(`The table ${NAMES.tables.set} has ${T.set.length} rows, not the one residue's.`);
  const first = T.set[0];
  const position = first ? cell(first, 'position') : '';
  const aa = first ? cell(first, 'residue') : '';
  if (first && !POSITION.test(position)) bad(first, `the residue's position is not a number (${position}).`);
  if (first && !AMINO.test(aa)) bad(first, `the residue is not an amino acid's code (${aa}).`);
  for (const t of tables) {
    for (const row of t.rows) if (cell(row, 'position') !== position) bad(row, 'it names another residue.');
  }

  const partners = new Map();
  for (const row of T.partners) {
    filled(row, 'species', 'reliability');
    const sp = cell(row, 'species');
    if (partners.has(sp)) bad(row, `a second partner in ${sp}.`);
    partners.set(sp, row);
    if (known(row, 'correspondence', WORDS.correspondence) === 'pair') {
      filled(row, 'partnerPosition', 'partnerResidue');
      form(row, 'partnerPosition', POSITION, 'a position');
      form(row, 'partnerResidue', AMINO, 'an amino acid\'s code');
    }
    known(row, 'ambiguous', WORDS.ambiguous);
    records(row, 'mapping');
  }

  const entries = new Map();
  for (const row of T.structures) {
    filled(row, 'species', 'entry', 'chain', 'status');
    const status = cell(row, 'status');
    const path = cell(row, 'joinPath');
    const reason = cell(row, 'notJoinedReason');
    const rank = rankOf(row);
    if (!STATUSES.some((s) => s.status === status)) bad(row, `"${status}" is not a status the figure knows.`);
    else if ([JOINED, WITHDRAWN].includes(status)) {
      if (!Object.prototype.hasOwnProperty.call(WORDS.joinPath, path)) bad(row, `"${path}" is not a join path the figure knows.`);
      const checked = cell(row, 'checkedAgainstSifts');
      if (!Object.prototype.hasOwnProperty.call(BOOLEAN, checked)) bad(row, `${colName(row, 'checkedAgainstSifts')} is not true or false.`);
      else if (BOOLEAN[checked] !== (path === 'agree')) bad(row, `its join path and ${colName(row, 'checkedAgainstSifts')} disagree.`);
    } else if (path) bad(row, `a row ${status} has a join path.`);
    if (status === JOINED && reason) bad(row, 'a joined row gives a reason it is not joined.');
    if (REASONED.includes(status) && !reason) bad(row, `a row ${status} gives no reason.`);
    if (status === WITHDRAWN) records(row, 'c5s');
    if (cell(row, 'c5sVerdict')) {
      known(row, 'c5sVerdict', WORDS.c5sVerdict);
      if (path !== 'path A only') bad(row, `a verdict of C5-S on a row whose join path is not path A only.`);
      else if (status === JOINED) records(row, 'c5s');
    }
    const p = partners.get(cell(row, 'species'));
    if (!p || cell(p, 'correspondence') !== 'pair') bad(row, `a structure of ${cell(row, 'species')}, which has no partner here.`);
    else if (cell(row, 'partnerPosition') !== cell(p, 'partnerPosition') || cell(row, 'partnerResidue') !== cell(p, 'partnerResidue')) {
      bad(row, 'its partner\'s position or residue is not its species\' partner\'s.');
    }
    form(row, 'structureResidue', AMINO, 'an amino acid\'s code');
    records(row, 'numbering');
    if (cell(row, 'structureResidue')) records(row, 'residue');
    if (status === JOINED) {
      filled(row, 'structureResidue', 'quality');
      const differs = cell(row, 'differs');
      if (!Object.prototype.hasOwnProperty.call(BOOLEAN, differs)) bad(row, `${colName(row, 'differs')} is not true or false.`);
      if (differs === 'true' && !cell(row, 'declaration')) bad(row, 'a joined residue that differs carries no declaration.');
      const own = oneLetter(cell(row, 'structureResidue'));
      if (p && own && oneLetter(cell(p, 'partnerResidue'))) {
        const same = own === oneLetter(cell(p, 'partnerResidue'));
        if (same && differs === 'true') bad(row, 'its residue equals its partner\'s, yet it is listed as differing.');
        if (!same && differs === 'false') bad(row, 'its residue differs from its partner\'s, and is not listed as differing.');
      }
      known(row, 'stateA', WORDS.state);
      for (const key of ['stateMinus', 'statePlus']) {
        const parts = cell(row, key).split('/');
        if (parts.length !== 2 || !parts.every((c) => Object.prototype.hasOwnProperty.call(WORDS.state, c))) {
          bad(row, `${colName(row, key)} is not two classes, A's and B's, written A/B.`);
        }
      }
      records(row, 'state');
    }
    const k = `${cell(row, 'species')}\u001f${structureOf(row)}`;
    if (!entries.has(k)) entries.set(k, { species: cell(row, 'species'), entry: cell(row, 'entry'), rank, state: null, rows: [] });
    const e = entries.get(k);
    e.rank = Math.min(e.rank, rank);
    e.rows.push(row);
    if (cell(row, 'status') === JOINED) e.state = cell(row, 'stateA');
  }
  for (const e of entries.values()) {
    for (const key of ['stateA', 'stateMinus', 'statePlus', 'stateTable']) {
      if (unique(e.rows.map((r) => cell(r, key)).filter(Boolean)).length > 1) {
        problems.push(`The rows of ${e.entry} disagree on ${colName(e.rows[0], key)}, which is one to an entry.`);
      }
    }
  }

  const lineOf = (list, keys) => {
    const lines = new Map();
    for (const row of list) {
      const k = keys.map((key) => cell(row, key)).join('\u001f');
      if (!lines.has(k)) lines.set(k, { rows: [] });
      lines.get(k).rows.push(row);
    }
    return [...lines.values()];
  };
  const joinedRows = T.structures.filter((r) => cell(r, 'status') === JOINED);
  const apartRows = T.structures.filter((r) => cell(r, 'status') !== JOINED);
  const joined = lineOf(joinedRows, ['species', 'entry', 'structureResidue', 'joinPath', 'differs', 'declaration',
    'stateA', 'stateMinus', 'statePlus', 'numberingTables', 'structureRecord', 'stateTable', 'c5sVerdict',
    'c5sCheckResult']);
  const apart = lineOf(apartRows, ['species', 'entry', 'structureResidue', 'status', 'notJoinedReason', 'numberingTables',
    'structureRecord', 'c5sCheckResult']);
  if (unique(joinedRows.map((r) => cell(r, 'quality'))).length > 1) {
    problems.push('The structures joined to it disagree on local model quality.');
  }

  for (const row of T.gnomad) {
    filled(row, 'variant', 'hgvsp', 'attribution');
    for (const [present, filters] of [['exomePresent', 'exomeFilters'], ['genomePresent', 'genomeFilters']]) {
      if (!Object.prototype.hasOwnProperty.call(BOOLEAN, cell(row, present))) bad(row, `${colName(row, present)} is not true or false.`);
      if (cell(row, present) === 'false' && cell(row, filters)) bad(row, `${colName(row, filters)} is filled for a dataset without the variant.`);
      form(row, filters, FILTER_LIST, 'a list of filters');
    }
    known(row, 'observedPass', WORDS.observedPass);
    records(row, 'gnomad');
  }

  const clinvar = [];
  const byAccession = new Map();
  for (const row of T.clinvar) {
    filled(row, 'accession', 'title', 'description', 'reviewStatus', 'lastEvaluated', 'attribution');
    form(row, 'nConditions', COUNT, 'a count');
    form(row, 'nWithMondo', COUNT, 'a count');
    records(row, 'clinvar');
    if (byAccession.has(cell(row, 'accession'))) bad(row, `a second row for ${cell(row, 'accession')}.`);
    const rec = { row, conditions: [] };
    byAccession.set(cell(row, 'accession'), rec);
    clinvar.push(rec);
  }
  for (const row of T.conditions) {
    filled(row, 'name');
    form(row, 'index', POSITION, 'a condition\'s place in its list');
    const rec = byAccession.get(cell(row, 'accession'));
    if (!rec) {
      bad(row, `a condition of ${cell(row, 'accession')}, which is no record here.`);
      continue;
    }
    rec.conditions.push(row);
    const given = cell(row, 'mondoGiven');
    if (!Object.prototype.hasOwnProperty.call(BOOLEAN, given)) bad(row, `${colName(row, 'mondoGiven')} is not true or false.`);
    else if (BOOLEAN[given] !== MONDO.test(cell(row, 'mondo'))) bad(row, `${colName(row, 'mondo')} and ${colName(row, 'mondoGiven')} disagree.`);
    if (cell(row, 'clinvarRetrieval') !== cell(rec.row, 'clinvarRetrieval')) bad(row, 'its retrieval is not its record\'s.');
  }
  for (const rec of clinvar) {
    rec.conditions.sort((x, y) => Number(cell(x, 'index')) - Number(cell(y, 'index')));
    const places = rec.conditions.map((r) => cell(r, 'index'));
    if (unique(places).length !== places.length) bad(rec.row, 'two of its conditions hold one place.');
    if (String(rec.conditions.length) !== cell(rec.row, 'nConditions')) {
      bad(rec.row, `${colName(rec.row, 'nConditions')} is ${cell(rec.row, 'nConditions')}; its conditions are ${rec.conditions.length}.`);
    }
    const withMondo = rec.conditions.filter((r) => cell(r, 'mondoGiven') === 'true').length;
    if (String(withMondo) !== cell(rec.row, 'nWithMondo')) {
      bad(rec.row, `${colName(rec.row, 'nWithMondo')} is ${cell(rec.row, 'nWithMondo')}; its conditions with one are ${withMondo}.`);
    }
  }
  return {
    problems,
    model: { residue: { position, aa }, partners: T.partners, joined, apart, joinedRows, entries: [...entries.values()],
      variants: T.gnomad, clinvar },
  };
}


export function indexRecords(records, withheld = new Map()) {
  const byId = new Map();
  const sources = new Map();
  const byGenerated = new Map();
  for (const r of records) {
    byId.set(field(r, 'id'), r);
    if (kindOf(r) === 'source') sources.set(field(r, 'identifier'), r);
    if (kindOf(r) === 'retrieval') {
      const sum = field(r, 'generated');
      byGenerated.set(sum, [...(byGenerated.get(sum) || []), r]);
    }
  }
  return { byId, sources, byGenerated, withheld };
}

export function walk(ix, ids, fixed = false) {
  const chain = { records: [], runs: [], methods: [], inputs: [], tables: [], files: [], others: [], sources: [], fixed,
    failure: null };
  const fail = (why) => {
    chain.failure = why;
    return chain;
  };
  const add = (list, r) => {
    if (!list.includes(r)) list.push(r);
  };
  const methodOf = (id) => {
    const m = ix.byId.get(id);
    if (m) return kindOf(m) === 'method' ? m : null;
    return (ix.withheld && ix.withheld.get(id)) || null;
  };
  if (!ids.length) return fail('its row names no record.');
  for (const id of ids) {
    const rec = ix.byId.get(id);
    if (!rec) return fail(`its record, ${id}, is not among the records.`);
    add(chain.records, rec);
  }
  const queue = [];
  const primaries = [];
  for (const rec of chain.records) {
    if (kindOf(rec) === 'retrieval') {
      const m = methodOf(field(rec, 'method'));
      if (!m) return fail(`its retrieval's method, ${field(rec, 'method')}, is not among the records.`);
      add(chain.methods, m);
      const s = ix.sources.get(field(rec, 'source'));
      if (!s) return fail(`its retrieval's source, ${field(rec, 'source')}, is not among the records.`);
      add(chain.sources, s);
    } else if (derived(rec)) {
      const run = ix.byId.get(field(rec, 'generatedBy'));
      if (!run || kindOf(run) !== 'run') return fail(`the run that made its record, ${field(rec, 'generatedBy')}, is not among the records.`);
      const m = methodOf(field(rec, 'tableMethod'));
      if (!m) return fail(`its record's method, ${field(rec, 'tableMethod')}, is not among the records.`);
      if (field(run, 'method') !== field(m, 'id')) {
        return fail(`its record names the method ${field(m, 'id')}, but its run followed ${field(run, 'method')}.`);
      }
      add(chain.runs, run);
      add(chain.methods, m);
      queue.push(rec);
    } else return fail(`its record is a ${field(rec, 'type')}, which holds no value here.`);
  }
  if (fixed) return chain;
  const seen = new Set(chain.records);
  while (queue.length) {
    const rec = queue.shift();
    if (field(rec, 'primarySource')) primaries.push(field(rec, 'primarySource'));
    for (const u of field(rec, 'used') || []) {
      if (SHA.test(u)) {
        const found = ix.byGenerated.get(u);
        if (found) {
          found.forEach((r) => add(chain.inputs, r));
          continue;
        }
        const run = ix.byId.get(field(rec, 'generatedBy'));
        const read = ((run && field(run, 'usedFiles')) || []).find((f) => f && field(f, 'sha256') === u);
        if (!read) {
          return fail(`its records used a file, sha256 ${shortSum(u)}, which no retrieval among the records returned and `
            + 'no run among them read.');
        }
        if (!chain.files.some((f) => f.sum === u)) chain.files.push({ sum: u, path: field(read, 'filePath') || '' });
      } else if (ID.test(u)) {
        const x = ix.byId.get(u);
        if (!x) return fail(`its records used ${u}, which is not among the records.`);
        if (kindOf(x) === 'retrieval') add(chain.inputs, x);
        else if (derived(x)) {
          if (!seen.has(x)) {
            seen.add(x);
            chain.tables.push(x);
            queue.push(x);
          }
        } else add(chain.others, x);
      }
    }
  }
  if (!chain.records.some((r) => kindOf(r) === 'retrieval') && !chain.inputs.length) {
    return fail('its records name no retrieval among the records.');
  }
  for (const id of [...primaries, ...chain.inputs.map((r) => field(r, 'source'))]) {
    if (!id || chain.sources.some((s) => field(s, 'identifier') === id)) continue;
    const s = ix.sources.get(id);
    if (!s) return fail(`its source, ${id}, is not among the records.`);
    chain.sources.push(s);
  }
  return chain;
}

export function chainOf(ix, model, group, row) {
  if (GROUPS[group].fixed) {
    const own = model.ownRecord;
    const chain = walk(ix, own ? [own] : [], true);
    if (!own) chain.failure = `the manifest names no table record of ${NAMES.tables.structures} among the records.`;
    return chain;
  }
  return walk(ix, recordIds(row, group));
}

export const shortName = (s) => String(field(s, 'name') || '').split(/\s*[,(]/)[0].trim();

export function chipOf(chain, group) {
  const name = GROUPS[group].fixed ? TEXT.composition : chain.sources.map(shortName).join(', ');
  const retrievals = chain.records.filter((r) => kindOf(r) === 'retrieval');
  const dates = retrievals.length ? retrievals.map((r) => field(r, 'started')) : chain.runs.map((r) => field(r, 'started'));
  const days = unique(dates.map(dateOf).filter(Boolean));
  return { name, kind: retrievals.length ? TEXT.chip.retrieved : TEXT.chip.made, days };
}


function refuse(root, problems) {
  const name = figureName(host);
  problems.forEach((p) => console.error(`${name}: ${p}`));
  const box = el('div', 'figure-refusal');
  box.append(el('p', null, `${name} is not drawn, because its data failed a check:`));
  const list = el('ul');
  problems.forEach((p) => list.append(el('li', null, p)));
  box.append(list);
  root.replaceChildren(box);
  root.dataset.state = 'refused';
}

function glyph() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'ra-glyph');
  svg.setAttribute('viewBox', '0 0 8 10');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M0.5 0.5h4.5l2.5 2.5v6.5h-7z M5 0.5v2.5h2.5');
  svg.append(path);
  return svg;
}

function chevron() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'ra-chevron');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M3.5 1.5l4 3.5-4 3.5');
  svg.append(path);
  return svg;
}

let built = false;
async function build() {
  if (built) return;
  built = true;
  const root = host.querySelector('.figure-root');
  root.replaceChildren(el('p', 'figure-loading', TEXT.loading));
  const texts = {};
  try {
    const urls = Object.fromEntries(FILES.map((k) => [k, host.dataset[k]]));
    const lacking = FILES.filter((k) => !urls[k]);
    if (lacking.length) throw new Error(`the figure names no ${lacking.map((k) => `data-${k}`).join(', ')}`);
    const answers = await Promise.all(FILES.map((k) => fetch(urls[k])));
    answers.forEach((a, i) => {
      if (!a.ok) throw new Error(`${urls[FILES[i]]}: HTTP ${a.status}`);
    });
    const bodies = await Promise.all(answers.map((a) => a.text()));
    FILES.forEach((k, i) => { texts[k] = bodies[i]; });
  } catch (err) {
    refuse(root, [`The data could not be read (${err.message}).`]);
    return;
  }
  const tables = Object.keys(NAMES.tables).map((k) => parseTable(texts[k], k));
  const manifest = parseManifest(texts.manifest);
  const parsed = parseRecords(texts.records);
  const problems = [...manifest.problems, ...parsed.problems];
  const listed = parseWithheldList(texts.withheld);
  problems.push(...listed.problems);
  for (const w of manifest.withheld ? manifest.withheld.values() : []) {
    if (!listed.sums.has(w.id)) problems.push(`The release's withheld list does not list ${w.id}, which the manifest withholds.`);
    else w.sum = listed.sums.get(w.id);
  }
  if (parsed.records) problems.push(...checkRecords(parsed.records));
  const { model, problems: tableProblems } = readComposition(tables);
  problems.push(...tableProblems);
  const flags = parsed.records ? unique(parsed.records.map((r) => field(r, 'synthetic'))) : [];
  if (flags.length > 1) problems.push('The records disagree on whether the data is synthetic.');
  const mock = flags[0] === true;
  if (problems.length) {
    refuse(root, problems);
    return;
  }
  const ix = indexRecords(parsed.records, manifest.withheld);
  model.ownRecord = manifest.tableRecords.find((id) => {
    const r = ix.byId.get(id);
    return !!r && kindOf(r) === 'table' && field(r, 'name') === NAMES.tables.structures;
  }) || null;
  draw(root, model, ix, mock);
}

function draw(root, model, ix, mock) {
  const values = new Map();
  const chains = new Map();
  const failures = [];

  function chainFor(group, row) {
    const k = GROUPS[group].fixed ? group : [group, ...recordIds(row, group)].join('\u001f');
    if (!chains.has(k)) {
      const chain = chainOf(ix, model, group, row);
      chains.set(k, chain);
      if (chain.failure) failures.push({ group, why: chain.failure });
    }
    return chains.get(k);
  }
  function chip(group, rows) {
    const node = el('span', 'ra-chip');
    node.dataset.group = group;
    node.dataset.table = NAMES.tables[rows[0].table];
    node.dataset.rows = rows.map((r) => r.n).join(',');
    const c = chipOf(chainFor(group, rows[0]), group);
    node.dataset.kind = c.kind;
    node.dataset.date = c.days.join(' ');
    const text = el('span', 'ra-chip-text', c.name);
    if (c.days.length) text.append(' ', el('span', 'ra-chip-date', `· ${c.kind} ${c.days.map(day).join(', ')} ${TEXT.chip.zone}`));
    node.append(glyph(), text);
    return node;
  }
  function chips(...made) {
    const out = [];
    for (const c of made.filter(Boolean)) {
      const same = out.find((o) => o.textContent === c.textContent);
      if (same) {
        same.dataset.group = `${same.dataset.group} ${c.dataset.group}`;
      } else out.push(c);
    }
    const box = el('span', 'ra-cell ra-c-chip');
    box.append(...out);
    return box;
  }
  const brk = () => el('span', 'ra-break');
  function value(cols, rows, text, context, group, opts = {}) {
    const table = NAMES.tables[rows[0].table];
    const names = cols.map((c) => colName(rows[0], c));
    const key = `${table}:${names.join('+')}@${rows.map((r) => r.n).join(',')}`;
    const b = el('button', `ra-v${opts.quote ? ' ra-quote' : ''}`, opts.quote ? `"${text}"` : text);
    b.type = 'button';
    b.dataset.key = key;
    b.dataset.table = table;
    b.dataset.col = names.join(' ');
    b.dataset.rows = rows.map((r) => r.n).join(',');
    b.dataset.group = group;
    b.title = context;
    b.setAttribute('aria-pressed', 'false');
    const chain = chainFor(group, rows[0]);
    if (chain.failure) {
      b.classList.add('is-unwalkable');
      b.title = `${context} (${TEXT.unwalkable})`;
    }
    values.set(key, { button: b, item: { key, cols, rows, text, context, group, quote: !!opts.quote,
      attribution: opts.attribution || null } });
    b.addEventListener('click', (e) => choose(key, e.detail > 0));
    return b;
  }
  function cellBox(label, ...contents) {
    const box = el('span', 'ra-cell');
    if (label) box.append(el('span', 'ra-k', label));
    box.append(...contents.filter(Boolean));
    return box;
  }
  const empty = () => el('span', 'ra-cell ra-empty');
  const heads = (cols) => {
    const row = el('div', 'ra-heads');
    row.setAttribute('aria-hidden', 'true');
    cols.forEach((c) => row.append(el('span', 'ra-head', c)));
    return row;
  };
  const layer = (name, head, guide) => {
    const box = el('div', 'ra-layer');
    box.dataset.layer = name;
    box.append(el('p', 'ra-layer-head', head));
    for (const g of guide ? [].concat(guide) : []) box.append(el('p', 'ra-guide', g));
    return box;
  };
  const credit = (kind, ...contents) => {
    const p = el('p', 'ra-credit');
    p.dataset.credit = kind;
    p.append(...contents);
    return p;
  };
  const speciesOrder = model.partners.map((r) => cell(r, 'species'));

  const a = el('div', 'ra-a');
  const aHead = el('p', 'ra-panel-head');
  aHead.append(el('b', 'ra-letter', 'A'), ' ', TEXT.a.head);
  const subject = el('p', 'ra-subject', `${TEXT.subject} ${model.residue.aa}${model.residue.position}`);
  a.append(aHead, subject, el('p', 'ra-guide', TEXT.a.guide));

  const partners = layer('partners', TEXT.partners.head, TEXT.partners.guide);
  const pGrid = el('div', 'ra-grid ra-partners');
  pGrid.append(heads(TEXT.partners.cols));
  const pc = TEXT.partners.cols;
  for (const row of model.partners) {
    const sp = cell(row, 'species');
    const line = el('div', 'ra-line');
    line.dataset.rows = String(row.n);
    const residue = cell(row, 'correspondence') === 'pair'
      ? value(['partnerResidue', 'partnerPosition'], [row], `${cell(row, 'partnerResidue')}${cell(row, 'partnerPosition')}`,
        `${sp} · its residue`, 'mapping')
      : value(['correspondence'], [row], WORDS.correspondence[cell(row, 'correspondence')], `${sp} · its residue`, 'mapping');
    const reasons = cell(row, 'reliabilityReasons');
    line.append(
      el('span', 'ra-cell ra-species', sp),
      cellBox(pc[1], residue),
      cellBox(pc[2], value(['reliability'], [row], cell(row, 'reliability'), `${sp} · reliability`, 'mapping')),
      cellBox(pc[3], value(['ambiguous'], [row], WORDS.ambiguous[cell(row, 'ambiguous')], `${sp} · alignment`, 'mapping')),
      reasons ? cellBox(pc[4], value(['reliabilityReasons'], [row], reasons, `${sp} · reasons for a lowered reliability`,
        'mapping')) : empty(),
      chips(chip('mapping', [row])),
    );
    pGrid.append(line);
  }
  partners.append(pGrid);

  const cols = TEXT.structures.cols;
  const nc = TEXT.notJoined.cols;
  let folds = 0;
  function fold(sp, parts, counts) {
    const box = el('div', 'ra-fold');
    box.dataset.fold = sp;
    folds += 1;
    const body = el('div', 'ra-fold-body');
    body.id = `ra-fold-${folds}`;
    body.append(...parts);
    const toggle = el('button', 'ra-fold-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', body.id);
    const tally = el('span', 'ra-fold-counts');
    counts.forEach((c, i) => tally.append(...(i ? [' '] : []), el('span', 'ra-fold-count', i ? `· ${c}` : c)));
    toggle.append(chevron(), el('span', 'ra-fold-species', sp), tally);
    toggle.setAttribute('aria-expanded', 'false');
    body.hidden = true;
    toggle.addEventListener('click', () => {
      const open = body.hidden;
      body.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
    box.append(toggle, body);
    return box;
  }
  function countsOf(sp) {
    const mine = model.entries.filter((e) => e.species === sp);
    const counts = [TEXT.folds.structures(mine.length)];
    STATUSES.forEach((s, i) => {
      const here = mine.filter((e) => e.rank === i);
      if (!here.length) return;
      if (s.status !== JOINED) {
        counts.push(TEXT.folds.status(s.label, String(here.length)));
        return;
      }
      const n = (code) => here.filter((e) => e.state === code).length;
      const shown = Object.keys(WORDS.state).filter((code) => COUNTED.includes(code) || n(code) > 0);
      counts.push(TEXT.folds.status(s.label, shown.map((code) => `${n(code)} ${WORDS.state[code]}`).join(', ')));
    });
    return counts;
  }
  const movedWords = (row) => {
    const [down, up] = ['stateMinus', 'statePlus'].map((k) => cell(row, k).split('/')[0]);
    const w = (c) => (c === cell(row, 'stateA') ? WORDS.unchanged : WORDS.state[c]);
    return WORDS.moved(w(down), w(up));
  };
  const joinedLine = (l, sp) => {
    const r0 = l.rows[0];
    const entry = cell(r0, 'entry');
    const line = el('div', 'ra-line');
    line.dataset.rows = l.rows.map((r) => r.n).join(',');
    const chainsBox = cellBox(cols[1], ...l.rows.map((r) => value(['chain'], [r], cell(r, 'chain'), `${entry} · chain`, 'numbering')));
    chainsBox.classList.add('ra-chains');
    const own = cellBox(cols[2], value(['structureResidue'], l.rows, cell(r0, 'structureResidue'),
      `${entry} · its residue there`, 'residue'));
    if (cell(r0, 'differs') === 'true') {
      own.append(value(['differs', 'declaration'], l.rows, WORDS.declared(cell(r0, 'declaration')),
        `${entry} · its residue differs from the reference`, 'numbering'));
    }
    line.append(
      cellBox(cols[0], value(['entry'], l.rows, entry, `${entry} · a structure of ${sp}`, 'numbering')),
      chainsBox,
      own,
      brk(),
      cellBox(cols[3], value(['joinPath'], l.rows, WORDS.joinPath[cell(r0, 'joinPath')], `${entry} · numbering`, 'numbering'),
        cell(r0, 'c5sVerdict') ? value(['c5sVerdict'], l.rows, TEXT.c5s(WORDS.c5sVerdict[cell(r0, 'c5sVerdict')]),
          `${entry} · the test by coordinates (C5-S)`, 'c5s') : null),
      brk(),
      cellBox(cols[4], value(['stateA'], l.rows, WORDS.state[cell(r0, 'stateA')], `${entry} · state at the gate`, 'state')),
      cellBox(cols[5], value(['stateMinus', 'statePlus'], l.rows, movedWords(r0),
        `${entry} · if the class lines move by 0.5\u00a0Å, down or up`, 'state')),
      chips(chip('numbering', l.rows), chip('residue', l.rows), chip('state', l.rows),
        cell(r0, 'c5sVerdict') ? chip('c5s', l.rows) : null),
    );
    return line;
  };
  const apartLine = (l, sp) => {
    const r0 = l.rows[0];
    const entry = cell(r0, 'entry');
    const withdrawn = cell(r0, 'status') === WITHDRAWN;
    const why = withdrawn ? 'c5s' : 'numbering';
    const line = el('div', 'ra-line');
    line.dataset.rows = l.rows.map((r) => r.n).join(',');
    const chainsBox = cellBox(nc[1], ...l.rows.map((r) => value(['chain'], [r], cell(r, 'chain'), `${entry} · chain`, 'numbering')));
    chainsBox.classList.add('ra-chains');
    line.append(
      cellBox(nc[0], value(['entry'], l.rows, entry, `${entry} · a structure of ${sp}`, 'numbering')),
      chainsBox,
      cell(r0, 'structureResidue')
        ? cellBox(nc[2], value(['structureResidue'], l.rows, cell(r0, 'structureResidue'), `${entry} · its residue there`, 'residue'))
        : empty(),
      brk(),
      cellBox(nc[3], value(['status'], l.rows, cell(r0, 'status'), `${entry} · its status`, why)),
      cell(r0, 'notJoinedReason')
        ? cellBox(nc[4], value(['notJoinedReason'], l.rows, cell(r0, 'notJoinedReason'), `${entry} · its reason`, why))
        : empty(),
      chips(chip('numbering', l.rows), cell(r0, 'structureResidue') ? chip('residue', l.rows) : null,
        withdrawn ? chip('c5s', l.rows) : null),
    );
    return line;
  };

  const structures = layer('structures', TEXT.structures.head, TEXT.structures.guide);
  structures.append(el('p', 'ra-guide ra-fold-guide', TEXT.folds.guide));
  const given = host.querySelector('.ra-credits');
  const holder = given ? (given.content || given) : null;
  const c5sNote = holder ? holder.querySelector('[data-c5s]') : null;
  let c5sDrawn = false;
  const foldBox = el('div', 'ra-folds');
  for (const sp of speciesOrder) {
    const joinedLines = model.joined.filter((l) => cell(l.rows[0], 'species') === sp);
    const apartLines = model.apart.filter((l) => cell(l.rows[0], 'species') === sp);
    if (!joinedLines.length && !apartLines.length) continue;
    const parts = [];
    if (joinedLines.length) {
      const g = el('div', 'ra-grid ra-structures ra-group');
      g.dataset.group = 'joined';
      g.append(heads(cols), ...joinedLines.map((l) => joinedLine(l, sp)));
      parts.push(g);
      if (c5sNote && !c5sDrawn && joinedLines.some((l) => cell(l.rows[0], 'c5sVerdict'))) {
        const note = el('p', 'ra-guide ra-c5s-note');
        note.append(...[...c5sNote.childNodes]);
        parts.push(note);
        c5sDrawn = true;
      }
    }
    if (apartLines.length) {
      const g = el('div', 'ra-apart ra-group');
      g.dataset.group = 'not-joined';
      const grid = el('div', 'ra-grid ra-notjoined');
      grid.append(heads(nc), ...apartLines.map((l) => apartLine(l, sp)));
      g.append(el('p', 'ra-apart-head', TEXT.notJoined.head), el('p', 'ra-guide', TEXT.notJoined.guide), grid);
      parts.push(g);
    }
    foldBox.append(fold(sp, parts, countsOf(sp)));
  }
  structures.append(foldBox);
  if (model.joinedRows.length) {
    const qBox = el('div', 'ra-grid ra-structures');
    const q = el('div', 'ra-line ra-quality');
    q.dataset.rows = model.joinedRows.map((r) => r.n).join(',');
    q.append(
      el('span', 'ra-cell ra-quality-k', TEXT.structures.quality),
      cellBox(null, value(['quality'], model.joinedRows, cell(model.joinedRows[0], 'quality'),
        `${TEXT.structures.qualityContext} · ${TEXT.structures.quality}`, 'composition')),
      chips(chip('composition', model.joinedRows)),
    );
    qBox.append(q);
    structures.append(qBox);
  }
  const paths = unique(model.joinedRows.map((r) => cell(r, 'joinPath')));
  for (const node of holder ? [...holder.querySelectorAll('[data-join-path]')] : []) {
    if (paths.includes(node.dataset.joinPath)) structures.append(credit(`join-path:${node.dataset.joinPath}`, ...[...node.childNodes]));
  }

  const popName = model.variants.length ? chipOf(chainFor('gnomad', model.variants[0]), 'gnomad').name : '';
  const population = layer('population', TEXT.population.head, model.variants.length ? TEXT.population.guide(popName) : null);
  const vGrid = el('div', 'ra-grid ra-population');
  vGrid.append(heads(TEXT.population.cols));
  const vc = TEXT.population.cols;
  const filters = (row, present, list) => (cell(row, present) === 'false' ? WORDS.filters.absent
    : (cell(row, list) || WORDS.filters.none));
  for (const row of model.variants) {
    const name = cell(row, 'hgvsp');
    const line = el('div', 'ra-line');
    line.dataset.rows = String(row.n);
    line.append(
      cellBox(vc[0], value(['hgvsp'], [row], name, `${name} · variant`, 'gnomad')),
      cellBox(vc[1], value(['variant'], [row], cell(row, 'variant'), `${name} · its identifier`, 'gnomad')),
      cellBox(vc[2], value(['exomePresent', 'exomeFilters'], [row], filters(row, 'exomePresent', 'exomeFilters'),
        `${name} · exome filters`, 'gnomad')),
      cellBox(vc[3], value(['genomePresent', 'genomeFilters'], [row], filters(row, 'genomePresent', 'genomeFilters'),
        `${name} · genome filters`, 'gnomad')),
      cellBox(vc[4], value(['observedPass'], [row], WORDS.observedPass[cell(row, 'observedPass')], `${name} · observed passing`,
        'gnomad')),
      chips(chip('gnomad', [row])),
    );
    vGrid.append(line);
  }
  population.append(vGrid);
  for (const text of unique(model.variants.map((r) => cell(r, 'attribution')))) population.append(credit('attribution', text));

  const clinName = model.clinvar.length ? chipOf(chainFor('clinvar', model.clinvar[0].row), 'clinvar').name : '';
  const clinical = layer('clinical', TEXT.clinical.head, model.clinvar.length ? TEXT.clinical.guide(clinName) : null);
  const cGrid = el('div', 'ra-grid ra-clinical');
  cGrid.append(heads(TEXT.clinical.cols));
  const cc = TEXT.clinical.cols;
  for (const rec of model.clinvar) {
    const r0 = rec.row;
    const acc = cell(r0, 'accession');
    const block = el('div', 'ra-record');
    block.dataset.rows = String(r0.n);
    const line = el('div', 'ra-line');
    line.dataset.rows = String(r0.n);
    const attribution = TEXT.clinical.attribution(clinName);
    const quoteBox = cellBox(null, el('span', 'ra-attrib', attribution),
      value(['description'], [r0], cell(r0, 'description'), `${acc} · classification`, 'clinvar', { quote: true, attribution }));
    quoteBox.classList.add('ra-c-quote');
    line.append(
      cellBox(cc[0], value(['accession'], [r0], acc, `${acc} · accession`, 'clinvar')),
      cellBox(cc[1], value(['title'], [r0], cell(r0, 'title'), `${acc} · title`, 'clinvar')),
      quoteBox,
      cellBox(cc[3], value(['reviewStatus'], [r0], cell(r0, 'reviewStatus'), `${acc} · review status`, 'clinvar')),
      cellBox(cc[4], value(['lastEvaluated'], [r0], cell(r0, 'lastEvaluated'), `${acc} · last evaluated`, 'clinvar')),
      chips(chip('clinvar', [r0])),
    );
    block.append(line);
    for (const r of rec.conditions) {
      const cond = el('div', 'ra-line ra-condition');
      cond.dataset.rows = String(r.n);
      const mondo = cell(r, 'mondoGiven') === 'true' ? cell(r, 'mondo') : WORDS.mondo;
      cond.append(
        cellBox(TEXT.clinical.conditionCols[0], value(['name'], [r], cell(r, 'name'), `${acc} · condition`, 'clinvar')),
        cellBox(TEXT.clinical.conditionCols[1], value(['mondo', 'mondoGiven'], [r], mondo, `${acc} · Mondo identifier`,
          'clinvar')),
      );
      block.append(cond);
    }
    cGrid.append(block);
  }
  clinical.append(cGrid);
  for (const text of unique(model.clinvar.map((rec) => cell(rec.row, 'attribution')))) clinical.append(credit('attribution', text));
  a.append(partners, structures, population, clinical);

  const b = el('div', 'ra-b');
  const bHead = el('p', 'ra-panel-head');
  bHead.append(el('b', 'ra-letter', 'B'), ' ', TEXT.b.head);
  const chainBox = el('div', 'ra-chain');
  const live = el('p', 'ra-live');
  live.setAttribute('aria-live', 'polite');
  b.append(bHead, el('p', 'ra-guide', TEXT.b.guide), chainBox, live);

  const parts = [];
  if (mock) {
    const badge = el('p', 'ra-badge');
    badge.append(el('span', 'ra-badge-text', TEXT.badge));
    parts.push(badge);
  }
  root.replaceChildren(...parts, a, b);
  root.classList.add('ra-root');

  const name = figureName(host);
  for (const f of failures) console.error(`${name}: a value's chain cannot be walked (${f.group}): ${f.why}`);

  const line = (label, text, cls) => {
    const p = el('p', `ra-kv${cls ? ` ${cls}` : ''}`);
    if (label) p.append(el('span', 'ra-kv-k', label), ' ');
    p.append(el('span', 'ra-kv-v', text));
    return p;
  };
  const idLine = (id) => line('identifier', id, 'ra-id');
  const sumLine = (sum, label = 'checksum') => {
    const p = line(label, `sha256 ${shortSum(sum)}`, 'ra-sum');
    p.title = sum;
    return p;
  };
  function step(kind, label) {
    const s = el('div', `ra-step is-${kind}`);
    s.dataset.step = kind;
    s.append(el('p', 'ra-step-label', label));
    return s;
  }
  function item(kind, rec, checksum, ...lines) {
    const it = el('div', 'ra-item');
    it.dataset.kind = kind;
    it.dataset.id = field(rec, 'id');
    it.dataset.checksum = checksum || '';
    it.append(...lines);
    return it;
  }
  const retrievalLines = (r) => [line('asked', asked(r)), line('retrieved', clock(field(r, 'started'))),
    idLine(field(r, 'id')), sumLine(field(r, 'generated'))];
  const recordItem = (r) => {
    if (kindOf(r) === 'retrieval') return item('retrieval', r, field(r, 'generated'), el('p', 'ra-type', 'a retrieval'), ...retrievalLines(r));
    if (kindOf(r) === 'table') {
      return item('table', r, field(r, 'sha256'), el('p', 'ra-type', `a table, ${field(r, 'name')}`), idLine(field(r, 'id')),
        sumLine(field(r, 'sha256')));
    }
    const sum = field(r, 'sha256');
    return item(field(r, 'type'), r, sum, el('p', 'ra-type', `a ${String(field(r, 'type')).replace(/_/g, ' ')}${field(r, 'name')
      ? `, ${field(r, 'name')}` : ''}`), idLine(field(r, 'id')), ...(sum ? [sumLine(sum)] : []));
  };
  function renderB(entry) {
    const { item: v } = entry;
    const chain = chainFor(v.group, v.rows[0]);
    const steps = [];
    const s0 = step('value', TEXT.steps.value);
    s0.dataset.key = v.key;
    const shown = el('p', 'ra-step-value');
    if (v.quote) shown.append(el('span', 'ra-attrib', v.attribution), ' ', el('span', 'ra-v ra-quote is-chosen', `"${v.text}"`));
    else shown.append(el('span', 'ra-v is-chosen', v.text));
    s0.append(shown, el('p', 'ra-step-context', v.context), chip(v.group, v.rows));
    steps.push(s0);
    if (chain.records.length) {
      const s1 = step('record', chain.records.length === 1 ? TEXT.steps.record : TEXT.steps.records);
      s1.append(...chain.records.map(recordItem));
      steps.push(s1);
    }
    if (chain.runs.length || chain.methods.length) {
      const label = chain.runs.length ? (chain.runs.length + chain.methods.length > 2 ? TEXT.steps.activities : TEXT.steps.activity)
        : TEXT.steps.method;
      const s2 = step('activity', label);
      for (const run of chain.runs) {
        s2.append(item('run', run, field(run, 'runDigest'), line('run', clock(field(run, 'started'))), idLine(field(run, 'id')),
          sumLine(field(run, 'runDigest'))));
      }
      for (const m of chain.methods) {
        const kept = ix.withheld && ix.withheld.get(field(m, 'id')) === m;
        if (kept) {
          s2.append(item('method', m, m.sum, line('method', TEXT.withheld), idLine(m.id),
            sumLine(m.sum, 'checksum of the record')));
          continue;
        }
        const digest = field(m, 'methodDigest');
        const it = item('method', m, digest, line('method', `${field(m, 'name')}, version ${field(m, 'version')}`),
          idLine(field(m, 'id')), ...(digest ? [sumLine(digest)] : []));
        it.dataset.version = field(m, 'version');
        s2.append(it);
      }
      steps.push(s2);
    }
    if (chain.inputs.length || chain.tables.length || chain.files.length || chain.others.length) {
      const s3 = step('inputs', chain.files.length ? TEXT.steps.inputsFiles : TEXT.steps.inputs);
      for (const t of chain.tables) {
        s3.append(item('table', t, field(t, 'sha256'), line('through a table it used', field(t, 'name') || field(t, 'type')),
          idLine(field(t, 'id')), ...(field(t, 'sha256') ? [sumLine(field(t, 'sha256'))] : [])));
      }
      for (const f of chain.files) s3.append(item('file', { id: f.path }, f.sum, line(TEXT.usedFile, f.path), sumLine(f.sum)));
      const counts = new Map();
      for (const r of chain.inputs) counts.set(field(r, 'source'), (counts.get(field(r, 'source')) || 0) + 1);
      const sourceName = (id) => (ix.sources.has(id) ? shortName(ix.sources.get(id)) : id);
      const tally = [...counts].map(([id, n]) => `${sourceName(id)} ${n}`).join(', ');
      s3.append(el('p', 'ra-tally', `${chain.inputs.length} ${chain.inputs.length === 1 ? 'retrieval' : 'retrievals'}${tally ? `: ${tally}` : ''}`));
      const list = el('div', 'ra-items');
      for (const r of chain.inputs) list.append(item('retrieval', r, field(r, 'generated'), ...retrievalLines(r)));
      if (chain.inputs.length > 3) {
        const details = el('details', 'ra-more');
        details.append(el('summary', null, `Show the ${chain.inputs.length} retrievals`), list);
        s3.append(details);
      } else s3.append(list);
      for (const o of chain.others) {
        s3.append(item('other', o, '', line(`also used, a ${String(field(o, 'type')).replace(/_/g, ' ')}`, field(o, 'id'), 'ra-id')));
      }
      steps.push(s3);
    }
    if (chain.sources.length) {
      const s4 = step('sources', chain.sources.length === 1 ? TEXT.steps.source : TEXT.steps.sources);
      for (const s of chain.sources) {
        const identifier = field(s, 'identifier');
        const releases = unique([...chain.records, ...chain.inputs].filter((r) => kindOf(r) === 'retrieval'
          && field(r, 'source') === identifier && field(r, 'sourceRelease')).map((r) => field(r, 'sourceRelease')));
        const it = item('source', s, '', el('p', 'ra-source-name', field(s, 'name')), line('identifier', identifier, 'ra-id'),
          line('record', field(s, 'id'), 'ra-id'), ...(releases.length ? [line('release', releases.join('; '))] : []));
        it.dataset.identifier = identifier;
        s4.append(it);
      }
      steps.push(s4);
    }
    if (chain.failure || chain.fixed) {
      const end = step('end', '');
      end.dataset.end = chain.failure ? 'failed' : 'fixed';
      end.replaceChildren(el('p', 'ra-end', chain.failure ? `${TEXT.failed} ${chain.failure}` : TEXT.fixed));
      steps.push(end);
    }
    chainBox.replaceChildren(...steps);
    chainBox.dataset.steps = String(steps.length);
    const kind = chain.records.length ? chain.records.map((r) => `a ${String(field(r, 'type')).replace(/_/g, ' ')}`)
      .filter((x, i, all) => all.indexOf(x) === i).join(' and ') : 'a record that is missing';
    live.textContent = TEXT.live(v.context, kind, chain.sources.map(shortName).join(', '));
  }

  let chosen = null;
  function choose(key, byPointer = false) {
    const entry = values.get(key);
    if (!entry) return;
    if (chosen && chosen !== key) {
      const old = values.get(chosen).button;
      old.classList.remove('is-chosen');
      old.setAttribute('aria-pressed', 'false');
    }
    chosen = key;
    entry.button.classList.add('is-chosen');
    entry.button.setAttribute('aria-pressed', 'true');
    renderB(entry);
    root.dataset.state = `chosen=${key};mock=${mock ? 'yes' : 'no'};unwalkable=${failures.length}`;
    if (byPointer) reveal(b);
  }
  function reveal(panel) {
    const r = panel.getBoundingClientRect();
    if (r.top < window.innerHeight - 48) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({ block: r.height < window.innerHeight - 80 ? 'end' : 'start', behavior: still ? 'auto' : 'smooth' });
  }
  const opening = values.values().next().value;
  if (opening) choose(opening.item.key);
}

function asked(r) {
  const url = field(r, 'url');
  try {
    const u = new URL(url);
    return `${field(r, 'httpMethod')} ${u.host}${u.pathname}${u.search.length > 40 ? '?…' : u.search}`;
  } catch {
    return `${field(r, 'httpMethod')} ${url}`;
  }
}

if (host) host.addEventListener('ready', build);
