
const host = globalThis.document ? document.querySelector('d-figure#fig-emhg') : null;
const figureName = (fig) => `Figure ${[...document.querySelectorAll('d-title d-figure, d-article d-figure')].indexOf(fig) + 1}`;

export const LIST = {
  retrieved: '6 October 2026',
  rows: 84,
  missense: 83,
  functional: 54,
  none: 30,
  pma: 0,
  classes: [
    { id: 'pathogenic', word: 'pathogenic', total: 56, functional: 52, none: 4 },
    { id: 'likely', word: 'likely pathogenic', total: 28, functional: 2, none: 26 },
  ],
};
export const OPENING = 'pathogenic';
export const GROUPS = [
  { id: 'PS', head: 'Pathogenic strong (PS)', criteria: [
    { code: 'PSa', words: '"Same amino acid change as a previously established pathogenic variant regardless of nucleotide change"' },
    { code: 'PSb', words: 'functional studies, in vitro', functional: true },
  ] },
  { id: 'PM', head: 'Pathogenic moderate (PM)', criteria: [
    { code: 'PMa', words: 'functional studies, ex vivo in two independent families', functional: true },
    { code: 'PMb', words: 'how much more often the variant is found in a cohort of patients, against a relevant low-risk population' },
  ] },
  { id: 'PP', head: 'Pathogenic supporting (PP)', criteria: [
    { code: 'PPa', words: 'supporting evidence from families' },
    { code: 'PPb', words: 'supporting evidence from computation' },
    { code: 'PPc', words: 'supporting evidence from reactions under anaesthesia' },
  ] },
];
export const RULES = {
  pathogenic: { word: 'Pathogenic', main: 'PS', rule: 'at least 1 PS criterion and 2 PP criteria' },
  likely: { word: 'Likely pathogenic', main: 'PM', rule: 'at least 1 PM criterion and 2 PP criteria' },
};
const classOf = (id) => LIST.classes.find((k) => k.id === id);

export function countedBy(id) {
  const main = RULES[id].main;
  return GROUPS.filter((g) => g.id === main || g.id === 'PP').flatMap((g) => g.criteria.map((c) => c.code));
}

export function classLine(id) {
  const rule = RULES[id];
  return `${rule.word} needs "${rule.rule}".`;
}

export function criterionLine(code) {
  const group = GROUPS.find((g) => g.criteria.some((c) => c.code === code));
  const c = group.criteria.find((x) => x.code === code);
  let line = `${code}, ${group.head}: ${c.words}.`;
  if (c.functional) {
    const carriers = code === 'PSb' ? `${LIST.functional} of the ${LIST.rows} listed variants carry it`
      : 'no listed variant carries it';
    line += ` ◇ One of the two that ask for functional studies; ${carriers}.`;
  }
  return line;
}
export const DEFAULT_LINE = 'Point at a criterion to read it. ◇ marks the two that ask for functional studies.';
export const GUIDES = {
  classes: 'Choose a class of the list: the kinds of criteria its printed rule counts are marked in the matrix below.',
  strip: 'The whole list: one square for each variant, in two rows by class.',
};
export const LEGEND = {
  functional: 'carries a functional criterion, always PSb',
  none: 'carries none',
};

export function problemsOf() {
  const out = [];
  const sum = (f) => LIST.classes.reduce((s, k) => s + f(k), 0);
  if (sum((k) => k.total) !== LIST.rows) out.push(`The classes hold ${sum((k) => k.total)} variants, not ${LIST.rows}.`);
  for (const k of LIST.classes) {
    if (k.functional + k.none !== k.total) out.push(`${k.word}: ${k.functional} with and ${k.none} without are not ${k.total}.`);
    if (!RULES[k.id]) out.push(`${k.word}: no printed rule.`);
  }
  if (sum((k) => k.functional) !== LIST.functional) out.push(`The classes' functional counts are not ${LIST.functional}.`);
  if (sum((k) => k.none) !== LIST.none) out.push(`The classes' counts without one are not ${LIST.none}.`);
  if (LIST.missense + 1 !== LIST.rows) out.push(`${LIST.missense} missense and one deletion are not ${LIST.rows}.`);
  if (!classOf(OPENING)) out.push(`The figure opens on ${OPENING}, which is no class of the list.`);
  return out;
}

export function squaresOf() {
  const squares = [];
  for (const k of LIST.classes) {
    for (const fill of ['functional', 'none']) {
      for (let i = 0; i < k[fill]; i += 1) squares.push({ cls: k.id, fill });
    }
  }
  return squares;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
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

let built = false;
function build() {
  if (built) return;
  built = true;
  const root = host.querySelector('.figure-root');
  const problems = problemsOf();
  if (problems.length) {
    refuse(root, problems);
    return;
  }
  draw(root);
}

function draw(root) {
  const guide1 = el('p', 'emhg-guide', GUIDES.classes);
  guide1.dataset.guide = 'classes';
  const chooser = el('div', 'emhg-chooser');
  chooser.setAttribute('role', 'radiogroup');
  chooser.setAttribute('aria-label', 'A class of the list');
  const radios = new Map();
  const chipOf = new Map();
  for (const k of LIST.classes) {
    const label = el('label', 'emhg-chip');
    label.dataset.cls = k.id;
    const input = el('input');
    input.type = 'radio';
    input.name = 'emhg-class';
    input.value = k.id;
    input.checked = k.id === OPENING;
    label.append(input, el('span', 'emhg-chip-w', k.word));
    chooser.append(label);
    radios.set(k.id, input);
    chipOf.set(k.id, label);
  }

  const matrix = el('div', 'emhg-matrix');
  const cards = new Map();
  for (const g of GROUPS) {
    const group = el('div', 'emhg-group');
    group.dataset.group = g.id;
    group.append(el('p', 'emhg-group-head', g.head));
    for (const c of g.criteria) {
      const b = el('button', 'emhg-crit');
      b.type = 'button';
      b.dataset.code = c.code;
      b.setAttribute('aria-pressed', 'false');
      const mark = el('span', 'emhg-box');
      mark.setAttribute('aria-hidden', 'true');
      const code = el('span', 'emhg-code', c.code);
      if (c.functional) code.append(' ', el('span', 'emhg-diamond', '◇'));
      b.append(mark, code, el('span', 'emhg-words', c.words));
      group.append(b);
      cards.set(c.code, b);
    }
    matrix.append(group);
  }
  const critLine = el('p', 'emhg-criterion');
  critLine.setAttribute('aria-live', 'polite');
  const readout = el('div', 'emhg-readout');
  readout.setAttribute('aria-live', 'polite');

  const guide2 = el('p', 'emhg-guide', GUIDES.strip);
  guide2.dataset.guide = 'strip';
  const strip = el('div', 'emhg-strip');
  strip.setAttribute('role', 'img');
  const [p, lp] = LIST.classes;
  strip.setAttribute('aria-label', `The list's ${LIST.rows} RYR1 variants, as retrieved on ${LIST.retrieved}: ${p.total} `
    + `${p.word}, of which ${p.functional} carry a functional criterion and ${p.none} do not; ${lp.total} ${lp.word}, of `
    + `which ${lp.functional} carry one and ${lp.none} do not.`);
  const squares = squaresOf().map((s) => {
    const i = el('i', `emhg-sq is-${s.fill}`);
    i.dataset.cls = s.cls;
    i.dataset.fill = s.fill;
    return { ...s, node: i };
  });
  for (const k of LIST.classes) {
    const row = el('div', 'emhg-class');
    row.dataset.cls = k.id;
    const head = el('div', 'emhg-class-head');
    const title = el('p', 'emhg-class-title');
    title.append(el('b', null, k.word), ' ', el('span', 'emhg-class-n', String(k.total)));
    const split = el('p', 'emhg-class-split');
    const with1 = el('span', 'emhg-split-line');
    with1.dataset.fill = 'functional';
    with1.append(el('span', 'emhg-sq is-functional is-key'), ` ${k.functional} carry a functional criterion`);
    const without = el('span', 'emhg-split-line');
    without.dataset.fill = 'none';
    without.append(el('span', 'emhg-sq is-none is-key'), ` ${k.none} do not`);
    split.append(with1, without);
    head.append(title, split);
    const box = el('div', 'emhg-squares');
    for (const s of squares) if (s.cls === k.id) box.append(s.node);
    row.append(head, box);
    strip.append(row);
  }
  const litLine = el('p', 'emhg-lit');
  litLine.setAttribute('aria-live', 'polite');
  const legend = el('p', 'emhg-legend');
  const key = (cls, words) => {
    const item = el('span', 'emhg-legend-item');
    const mark = el('span', `emhg-sq is-key ${cls}`);
    mark.setAttribute('aria-hidden', 'true');
    item.append(mark, ` ${words}`);
    legend.append(item);
  };
  key('is-functional', LEGEND.functional);
  key('is-none', LEGEND.none);
  root.replaceChildren(guide1, chooser, matrix, critLine, readout, guide2, strip, litLine, legend);

  let chosen = OPENING;
  let kept = null;
  let lit = null;
  const groupTest = {
    pathogenic: (s) => s.cls === 'pathogenic',
    likely: (s) => s.cls === 'likely',
    functional: (s) => s.fill === 'functional',
    none: (s) => s.fill === 'none',
  };
  function litCriteria() {
    if (lit && lit.criteria) return lit.criteria;
    return kept ? [kept] : [];
  }
  function show() {
    const counted = new Set(countedBy(chosen));
    for (const [code, b] of cards) {
      b.classList.toggle('is-carried', counted.has(code));
      b.setAttribute('aria-pressed', String(kept === code));
    }
    const crit = litCriteria();
    for (const [code, b] of cards) b.classList.toggle('is-lit', crit.includes(code));
    matrix.classList.toggle('has-lit', crit.length > 0);
    critLine.textContent = crit.length === 1 ? criterionLine(crit[0]) : crit.length ? `Lit: ${crit.join(', ')}.` : DEFAULT_LINE;
    readout.replaceChildren(el('p', 'emhg-class-rule', classLine(chosen)));
    for (const [c, label] of chipOf) label.classList.toggle('is-chosen', c === chosen);
    let test = null;
    if (lit && lit.group) test = groupTest[lit.group];
    else if (crit.includes('PSb')) test = groupTest.functional;
    else if (crit.includes('PMa')) test = () => false;
    let count = 0;
    for (const s of squares) {
      const on = !!test && test(s);
      count += on;
      s.node.classList.toggle('is-lit', on);
    }
    strip.classList.toggle('has-lit', !!test);
    litLine.textContent = test ? `Lit: ${count} of the ${LIST.rows} squares.` : '';
    root.dataset.state = `class=${chosen};kept=${kept ?? 'none'};lit=${lit ? (lit.criteria ? `criteria:${lit.criteria.join(',')}`
      : `group:${lit.group}`) : 'none'};squares=${test ? count : 'none'}`;
  }
  for (const [c, input] of radios) {
    input.addEventListener('change', () => {
      if (input.checked) {
        chosen = c;
        show();
      }
    });
  }
  for (const [code, b] of cards) {
    b.addEventListener('pointerenter', () => { lit = { criteria: [code] }; show(); });
    b.addEventListener('pointerleave', () => { lit = null; show(); });
    b.addEventListener('focus', () => { lit = { criteria: [code] }; show(); });
    b.addEventListener('blur', () => { lit = null; show(); });
    b.addEventListener('click', () => {
      kept = kept === code ? null : code;
      show();
    });
  }
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && kept) {
      kept = null;
      show();
    }
  });

  for (const link of document.querySelectorAll('.fig-link[data-figure="fig-emhg"]')) {
    const d = link.dataset;
    const criteria = (d.criteria || '').split(/\s+/).filter(Boolean);
    const it = criteria.length ? (criteria.every((c) => cards.has(c)) ? { criteria } : null)
      : d.group ? (groupTest[d.group] ? { group: d.group } : null) : null;
    if (!it) {
      console.error(`${figureName(host)}: a name in the text links to nothing in the figure (${link.textContent}).`);
      continue;
    }
    link.tabIndex = 0;
    link.addEventListener('pointerenter', () => { lit = it; show(); });
    link.addEventListener('pointerleave', () => { lit = null; show(); });
    link.addEventListener('focus', () => { lit = it; show(); });
    link.addEventListener('blur', () => { lit = null; show(); });
  }
  show();
}

if (host) host.addEventListener('ready', build);
