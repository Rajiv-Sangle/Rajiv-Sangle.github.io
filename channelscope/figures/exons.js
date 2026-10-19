import {
  RELEASE, FILES, readRelease, makeModel, makeViews, makePinView, trackModel, columns, parseFasta, exampleWindow,
} from './exon_arithmetic.js';
import { readNotes, readBackgrounds, noteToggle, backgroundBlock, IDENTIFIER_NOTES, UNTRANSLATED_NOTE } from './notes.js';
import { readRules, typedChange } from './variant_arithmetic.js';

const d3 = window.d3;
const host = document.querySelector('d-figure#fig-exons');
const NAME = `Figure ${[...document.querySelectorAll('d-title d-figure, d-article d-figure')].indexOf(host) + 1}`;
const fmt = d3.format(',');
const pct = d3.format('.1%');
const COLOR = { coding: '#0072B2', codingAlt: '#56B4E9', intron: '#b0b0b0', split: '#E69F00', mark: '#D55E00' };
let AMINO = {};
let THREE = {};
const STATE = { r: 'read', f: 'forced', o: 'open' };
let built = false;

function identifierLinks(model) {
  const { header, highlights } = model;
  const links = new Map();
  links.set(header.gene.id, `https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/${header.gene.id}`);
  links.set(header.transcript.refseq, `https://www.ncbi.nlm.nih.gov/nuccore/${header.transcript.refseq}`);
  links.set(header.transcript.ensembl,
    `https://www.ensembl.org/Homo_sapiens/Transcript/Summary?t=${header.transcript.ensembl.split('.')[0]}`);
  links.set(header.sequence_accession, `https://www.ncbi.nlm.nih.gov/nuccore/${header.sequence_accession}`);
  if (header.assembly_accession) {
    links.set(header.assembly, `https://www.ncbi.nlm.nih.gov/datasets/genome/${header.assembly_accession}/`);
    if (header.assembly_name) links.set(header.assembly_name, links.get(header.assembly));
  }
  for (const n of header.numberings) {
    if (n.from === 'source:uniprotkb') {
      const [entry, isoform] = n.accession.split('-');
      links.set(n.accession, `https://www.uniprot.org/uniprotkb/${entry}/entry${isoform && isoform !== '1' ? '#sequences' : ''}`);
    } else if (n.from === 'source:ncbi-refseq') {
      links.set(n.accession, `https://www.ncbi.nlm.nih.gov/protein/${n.accession}`);
    }
  }
  for (const h of highlights) {
    const m = /ClinVar (VCV0*(\d+))/.exec(h.source);
    if (m) links.set(m[1], `https://www.ncbi.nlm.nih.gov/clinvar/variation/${m[2]}/`);
  }
  const v = header.variant;
  if (v) {
    links.set(v.clinvar_accession_version,
      `https://www.ncbi.nlm.nih.gov/clinvar/variation/${Number(v.clinvar_accession.replace(/\D/g, ''))}/`);
  }
  return links;
}

function linkify(links, ...roots) {
  const keys = [...links.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\w.-])(${keys.join('|')})(?![\\w-]|\\.\\d)`, 'g');
  for (const root of roots) {
    if (!root) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('a, code')) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.textContent;
      const matches = [...text.matchAll(pattern)];
      if (!matches.length) continue;
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const m of matches) {
        frag.append(text.slice(last, m.index));
        const a = el('a', 'id-link', m[1]);
        a.href = links.get(m[1]);
        a.target = '_blank';
        a.rel = 'noopener';
        frag.append(a);
        last = m.index + m[1].length;
      }
      frag.append(text.slice(last));
      node.replaceWith(frag);
    }
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
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
  else if (window.crypto && crypto.subtle) {
    status = (await sha256(buffer)) === entry.sha256 && buffer.byteLength === entry.bytes ? 'match' : 'mismatch';
  }
  return { name, status, entry, text: new TextDecoder().decode(buffer) };
}

async function build() {
  if (built) return;
  built = true;
  const root = host.querySelector('.figure-root');
  try {
    const manifestResponse = await fetch(`${RELEASE}manifest.json`);
    if (!manifestResponse.ok) throw new Error(`manifest.json: HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    const files = {};
    for (const [key, name] of Object.entries(FILES)) files[key] = await fetchChecked(manifest, name);
    const header = JSON.parse(files.header.text);
    const sequences = files.genomic
      ? { genomic: parseFasta(files.genomic.text), exonic: parseFasta(files.exonic.text), protein: parseFasta(files.protein.text) }
      : null;
    const model = makeModel(readRelease(files.exons.text, files.highlights.text, header, sequences));
    const problems = [...model.problems];
    for (const f of Object.values(files)) {
      if (f.status === 'mismatch') problems.push(`${f.name} does not match the checksum in the release's manifest.`);
    }
    if (Array.isArray(header.amino_acids) && header.amino_acids.length) {
      AMINO = Object.fromEntries(header.amino_acids.map((a) => [a.one_letter, a.name.toLowerCase()]));
      THREE = Object.fromEntries(header.amino_acids.map((a) => [a.one_letter, a.three_letter]));
    } else problems.push('The release carries no table of amino-acid names.');
    if (problems.length) {
      refuse(root, problems);
      return;
    }
    checkCaption(header);
    formatCaption();
    const links = identifierLinks(model);
    const releaseFiles = manifest.files.map((f) => f.path);
    const idNotes = readNotes(header, releaseFiles);
    idNotes.problems.forEach((p) => console.error(`${NAME}: ${p}`));
    const typed = readRules(header);
    typed.problems.forEach((p) => console.error(`${NAME}: ${p}`));
    draw(root, model, links, idNotes.notes, releaseFiles, typed.rules);
    renderSources(host.querySelector('.figure-sources'), model, manifest, Object.values(files), links);
    linkify(links, ...host.querySelectorAll('figcaption [data-caption]'));
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

function checkCaption(header) {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  for (const key of ['one_idea', 'caption_body']) {
    const span = host.querySelector(`figcaption [data-caption="${key}"]`);
    if (!span || norm(span.textContent) !== norm(header.caption[key])) {
      console.error(`${NAME}: the caption's ${key} differs from the release's.`);
    }
  }
}

function formatCaption() {
  const span = host.querySelector('figcaption [data-caption="caption_body"]');
  if (!span || span.dataset.formatted) return;
  const sentences = span.textContent.replace(/\s+/g, ' ').trim().split(/(?<=\.)\s+(?=[A-Z])/);
  span.replaceChildren();
  sentences.forEach((sentence, i) => {
    if (i) span.append(' ');
    span.append(el('span', 'cap-line', sentence));
  });
  const cite = span.nextElementSibling;
  if (cite && cite.tagName === 'D-CITE' && span.lastElementChild) span.lastElementChild.append(cite);
  span.classList.add('caption-body');
  span.dataset.formatted = 'true';
}

function draw(root, model, links, idNotes = new Map(), releaseFiles = null, rules = null) {
  const { header } = model;
  const views = makeViews(model);
  const bgs = readBackgrounds(header, releaseFiles, views);
  bgs.problems.forEach((p) => console.error(`${NAME}: ${p}`));
  root.replaceChildren();

  const identity = el('dl', 'exon-identity');
  const fact = (term, ...desc) => {
    const item = el('div');
    const dd = el('dd');
    dd.append(...desc);
    item.append(el('dt', null, term), dd);
    identity.append(item);
  };
  fact('Gene', el('b', null, header.gene.symbol), ` · ${header.gene.id}`);
  fact('Genome', `${header.assembly}, chromosome ${header.chromosome} (${header.sequence_accession}), `
    + `${header.strand === '+' ? 'plus' : 'minus'} strand`);
  fact('Transcript', `${header.transcript.refseq} = ${header.transcript.ensembl} (${header.transcript.mane_status})`);
  fact('Residue numbering', `UniProt ${canonical(model).accession} = RefSeq ${twin(model).accession}`);
  linkify(links, identity);
  for (const item of identity.children) {
    const toggle = noteToggle(idNotes.get(IDENTIFIER_NOTES[item.querySelector('dt').textContent]));
    if (!toggle) continue;
    linkify(links, toggle.querySelector('.id-note-text'));
    item.append(toggle);
  }

  const picker = el('fieldset', 'exon-picker');
  picker.append(el('legend', null, 'Follow a position'));
  const options = el('div', 'exon-options');
  views.forEach((view, i) => {
    const label = el('label');
    const input = el('input');
    input.type = 'radio';
    input.name = 'exon-view';
    input.value = view.id;
    input.checked = i === 0;
    label.append(input, ` ${viewLabel(model, view)}`);
    options.append(label);
  });
  picker.append(options);

  const explore = el('form', 'figure-control exon-explore');
  explore.setAttribute('aria-label', 'Explore panels 1 and 2');
  const zoomSelect = el('select');
  zoomSelect.name = 'exon-zoom';
  zoomSelect.append(new Option('the whole transcript', 'all'));
  const exonGroup = el('optgroup');
  exonGroup.label = 'Exons';
  model.exons.forEach((e) => exonGroup.append(new Option(`exon ${e.exon}`, `exon:${e.exon}`)));
  const intronGroup = el('optgroup');
  intronGroup.label = 'Introns (intron n lies between exons n and n + 1)';
  model.exons.slice(0, -1).forEach((e) => intronGroup.append(new Option(`intron ${e.exon}`, `intron:${e.exon}`)));
  zoomSelect.append(exonGroup, intronGroup);
  const search = el('input');
  search.type = 'search';
  search.name = 'exon-find';
  search.placeholder = 'c.1840, p.614 or 38457545';
  search.setAttribute('autocomplete', 'off');
  const reset = el('button', null, 'Show the whole transcript');
  reset.type = 'button';
  const showExample = el('button', 'exon-show-example', 'Show the chosen example');
  showExample.type = 'button';
  const status = el('span', 'exon-status');
  status.setAttribute('aria-live', 'polite');
  const zoomLabel = el('label', null, 'Zoom to ');
  zoomLabel.append(zoomSelect);
  const findLabel = el('label', null, 'Find ');
  findLabel.append(search);
  explore.append(zoomLabel, findLabel, reset, showExample, status);

  const stripLabel = el('p', 'exon-strip-label');
  const strip = el('div', 'exon-strip');
  strip.dataset.control = 'drag';
  const overview = el('div', 'exon-overview');
  overview.tabIndex = 0;
  overview.dataset.control = 'click';
  overview.setAttribute('aria-label', 'Panels 1 and 2. Click, or press Enter, to pin a position; the arrow keys move it one '
    + 'base, or ten with Shift; Escape unpins it.');
  const readout = el('div', 'exon-readout');
  const readoutBody = el('div', 'readout-body');
  readoutBody.setAttribute('aria-live', 'polite');
  const copy = el('button', 'readout-copy', 'Copy these coordinates');
  copy.type = 'button';
  const unpin = el('button', 'readout-unpin', 'Unpin');
  unpin.type = 'button';
  unpin.hidden = true;
  const copyStatus = el('span', 'readout-status');
  const readoutActions = el('div', 'readout-actions');
  readoutActions.append(copy, unpin, copyStatus);
  readout.append(readoutBody, readoutActions);

  const trackTitle = el('p', 'exon-panel-title', '3 · The sequence, base by base');
  const trackNote = el('p', 'seq-note');
  const modes = el('div', 'seq-modes');
  modes.setAttribute('role', 'radiogroup');
  modes.setAttribute('aria-label', 'Panel 3 shows');
  modes.append(el('span', 'seq-modes-label', 'Show:'));
  for (const [value, text] of [['exonic', 'the exons joined'], ['genomic', 'the genomic stretch, introns included']]) {
    const label = el('label');
    const input = el('input');
    input.type = 'radio';
    input.name = 'seq-mode';
    input.value = value;
    input.checked = value === 'exonic';
    label.append(input, ` ${text}`);
    modes.append(label);
  }
  const go = el('form', 'figure-control seq-go');
  go.setAttribute('aria-label', 'Go to a place in panel 3');
  const tx = model.header.transcript.refseq;
  const numberBox = (name, max, title) => {
    const box = el('input');
    box.type = 'number';
    box.name = name;
    box.min = '1';
    box.max = String(max);
    box.step = '1';
    box.inputMode = 'numeric';
    box.title = title;
    return box;
  };
  const textBox = (name, placeholder, title) => {
    const box = el('input');
    box.type = 'text';
    box.name = name;
    box.inputMode = 'numeric';
    box.placeholder = placeholder;
    box.title = title;
    box.setAttribute('autocomplete', 'off');
    return box;
  };
  const exonBox = numberBox('seq-exon', model.exons.length, `An exon of ${tx}, 1 to ${model.exons.length}`);
  const cBox = textBox('seq-c', '1840', `A position by its c. name, in ${tx}'s numbering, from `
    + `${model.cName(model.span.start)} to ${model.cName(model.span.end)}, such as c.1840, c.-139, c.1925+70 or c.*10`);
  const intronBox = numberBox('seq-intron', model.exons.length - 1,
    `An intron of ${tx}, 1 to ${model.exons.length - 1}; intron n lies between exons n and n + 1`);
  const genomeBox = textBox('seq-chr19', '38457545', `A position on ${model.header.assembly} `
    + `(${model.header.sequence_accession}), ${fmt(model.span.start)} to ${fmt(model.span.end)}`);
  const boxLabel = (text, box) => {
    const label = el('label', null, text);
    label.append(box);
    return label;
  };
  const stepBack = el('button', 'seq-step', '◀ Previous exon edge');
  stepBack.type = 'button';
  const stepOn = el('button', 'seq-step', 'Next exon edge ▶');
  stepOn.type = 'button';
  const goStatus = el('span', 'seq-go-status');
  goStatus.setAttribute('aria-live', 'polite');
  const group = (...parts) => {
    const span = el('span', 'seq-go-group');
    span.append(...parts);
    return span;
  };
  go.append(group(el('span', 'seq-go-label', `Go to, on ${tx}:`), boxLabel('exon ', exonBox)), boxLabel('c.', cBox),
    boxLabel('intron ', intronBox), group(el('span', 'seq-go-label', `on ${model.header.assembly} `
      + `(${model.header.sequence_accession}):`), boxLabel(`chr${model.header.chromosome}:`, genomeBox)),
    group(stepBack, stepOn), goStatus);
  const tryForm = rules ? el('form', 'figure-control seq-go seq-try') : null;
  const tryBox = textBox('seq-try', '1840C>T', `A change on ${tx}, such as c.1840C>T, c.1840del or c.1840dup`);
  tryBox.inputMode = 'text';
  const tryResult = el('p', 'seq-try-result');
  tryResult.setAttribute('aria-live', 'polite');
  if (tryForm) {
    tryForm.setAttribute('aria-label', 'Try a change');
    tryForm.append(group(el('span', 'seq-go-label', `Try a change, on ${tx}:`), boxLabel('c.', tryBox)),
      el('span', 'seq-try-label', rules.label));
  }
  const trackHost = el('div', 'seq-host');
  const trackStatus = el('p', 'seq-status');
  trackStatus.setAttribute('aria-live', 'polite');

  const zoomTitle = el('p', 'exon-panel-title', '4 · One position in four coordinates');
  const reading = el('p', 'exon-reading');
  reading.setAttribute('aria-live', 'polite');
  const readingNote = el('div', 'exon-reading-note');
  const utrToggle = noteToggle(idNotes.get(UNTRANSLATED_NOTE));
  if (utrToggle) {
    linkify(links, utrToggle.querySelector('.id-note-text'));
    readingNote.append(utrToggle);
  }
  readingNote.hidden = true;
  const scroller = el('div', 'exon-zoom-scroll');
  scroller.tabIndex = 0;
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', 'Panel 4: one position in four coordinates');
  const hint = el('p', 'exon-hint', 'Scroll the table sideways to see every column.');
  const notes = el('p', 'exon-notes');
  const background = el('div', 'exon-background');
  const backgrounds = new Map();
  for (const view of views) {
    const block = backgroundBlock(bgs.backgrounds.get(view.id));
    if (!block) continue;
    linkify(links, ...block.querySelectorAll('.bg-text'));
    block.hidden = true;
    backgrounds.set(view.id, block);
    background.append(block);
  }
  const [guide1, guide2, guide3] = partGuides();
  root.append(...guide1, explore, stripLabel, strip, overview, readout, ...guide2, trackTitle, trackNote, modes, go,
    ...(tryForm ? [tryForm, tryResult] : []), trackHost, trackStatus, ...guide3, zoomTitle, picker, reading, readingNote,
    scroller, hint, notes, background, key(model), identity);

  const whole = [model.span.start, model.span.end];
  const state = { domain: whole, pinned: null, hover: null, change: null };
  let tryNote = null;
  let tryNotePin = null;
  let current = views[0];
  let ov = null;
  let copyText = '';
  let tableKey = null;
  let recenter = false;

  const followed = () => state.pinned ?? current.anchors[0];
  const tableView = () => (state.pinned != null ? makePinView(model, state.pinned) : current);

  const track = createTrack(trackHost, model, {
    onPoint(g) {
      if (g !== state.hover) {
        state.hover = g;
        updateReadout();
      }
    },
    onPin(g) {
      state.pinned = g;
      state.hover = null;
      status.textContent = '';
      render({ fromTrack: true });
    },
  });
  trackNote.textContent = trackText(model, track.mode);

  const fit = (domain) => {
    const [a, b] = [Math.max(whole[0], domain[0]), Math.min(whole[1], domain[1])];
    return b - a < 19 ? [Math.max(whole[0], a - 10), Math.min(whole[1], b + 10)] : [a, b];
  };
  const exampleDomain = (view) => {
    const value = exampleWindow(model, view);
    return fit(value ? featureWindow(model, value) : whole);
  };
  const atExample = () => sameDomain(state.domain, exampleDomain(current)) && state.pinned == null && track.target == null;
  const setState = () => {
    root.dataset.state = `view=${current.id};zoom=${state.domain[0]}-${state.domain[1]};pin=${state.pinned ?? 'none'}`
      + `;track=${track.mode};target=${track.target ?? 'none'};change=${state.change ? state.change.cName : 'none'}`;
    showExample.classList.toggle('at-example', atExample());
  };
  function updateTry() {
    if (!tryForm) return;
    if (tryNote && state.pinned !== tryNotePin) tryNote = null;
    tryResult.replaceChildren(...(state.change ? changeLine(model, rules, state.change)
      : tryNote ? [el('span', 'seq-try-refusal', tryNote)] : []));
    linkify(links, tryResult);
  }
  function render({ fromTrack = false } = {}) {
    if (state.change && state.pinned !== state.change.g) state.change = null;
    track.setChange(state.change);
    updateTry();
    const view = tableView();
    const cols = columns(model, view.positions);
    drawStrip(strip, stripLabel, model, state, zoomTo, markOf(current));
    ov = drawOverview(overview, model, current, cols, state);
    updateTable(view, cols);
    track.show({ pinned: state.pinned, anchors: current.anchors, followed: followed(), center: !fromTrack, force: recenter });
    recenter = false;
    const loc = model.locate(followed());
    trackStatus.textContent = loc.region === 'intron' && track.mode === 'exonic'
      ? `${state.pinned != null ? 'The pinned position' : 'The chosen example'} lies in intron ${loc.after}, which `
        + 'splicing removes; the genomic view shows its bases.' : '';
    updateReadout();
    setState();
  }
  function updateTable(view, cols) {
    const k = view.id === 'pin' ? `pin:${view.anchors[0]}:${state.change ? state.change.cName : ''}` : `view:${view.id}`;
    if (k === tableKey) return;
    tableKey = k;
    drawZoom(scroller, model, view, cols, state.change);
    reading.textContent = readingText(model, view, cols);
    const region = model.locate(view.anchors[0]).region;
    readingNote.hidden = !utrToggle || (region !== '5utr' && region !== '3utr');
    for (const [id, block] of backgrounds) block.hidden = view.id !== id;
    notes.textContent = notesText(model, view, cols);
    linkify(links, reading, notes);
    hint.hidden = scroller.scrollWidth <= scroller.clientWidth + 1;
  }
  function zoomTo(domain, fromSelect = false) {
    state.domain = fit(domain);
    if (!fromSelect) {
      const match = [...zoomSelect.options].find((o) => o.value !== 'all' && sameDomain(featureWindow(model, o.value), state.domain));
      zoomSelect.value = state.domain[0] === whole[0] && state.domain[1] === whole[1] ? 'all' : match ? match.value : '';
    }
    render();
  }
  function updateReadout() {
    const g = state.hover ?? state.pinned ?? current.anchors[0];
    const which = state.hover != null ? 'Under the pointer' : state.pinned != null ? 'Pinned'
      : 'The position panels 3 and 4 follow';
    const r = readoutFor(model, g);
    readoutBody.replaceChildren(el('p', 'readout-which', which));
    const dl = el('dl');
    for (const [term, value] of r.rows) {
      const dd = el('dd');
      dd.append(value);
      dl.append(el('dt', null, term), dd);
    }
    readoutBody.append(dl);
    if (r.note) readoutBody.append(el('p', 'readout-note', r.note));
    linkify(links, readoutBody);
    unpin.hidden = state.pinned == null;
    copyText = r.copy;
    if (ov) ov.guide(state.hover);
    track.hoverAt(state.hover);
  }

  zoomSelect.addEventListener('change', () => {
    status.textContent = '';
    zoomTo(zoomSelect.value === 'all' ? whole : featureWindow(model, zoomSelect.value), true);
  });
  const find = () => {
    const found = parseQuery(model, search.value);
    if (found.error) {
      status.textContent = found.error;
      setState();
      return;
    }
    status.textContent = found.message;
    state.pinned = found.g;
    recenter = true;
    zoomTo([found.g - 150, found.g + 150]);
  };
  search.addEventListener('change', find);
  explore.addEventListener('submit', (event) => {
    event.preventDefault();
    find();
  });
  reset.addEventListener('click', () => {
    state.pinned = null;
    status.textContent = '';
    recenter = true;
    zoomTo(whole);
  });
  unpin.addEventListener('click', (event) => {
    state.pinned = null;
    status.textContent = '';
    render();
    if (event.detail === 0) overview.focus({ preventScroll: true });
  });
  copy.addEventListener('click', () => {
    const done = (text) => { copyStatus.textContent = text; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(copyText).then(() => done(`Copied: ${copyText}`),
        () => done(`This browser didn't allow copying. The text: ${copyText}`));
    } else done(`This browser can't copy from here. The text: ${copyText}`);
  });

  overview.addEventListener('pointermove', (event) => {
    const g = ov && ov.positionAt(event);
    if (g !== state.hover) {
      state.hover = g ?? null;
      updateReadout();
    }
  });
  overview.addEventListener('pointerleave', () => {
    state.hover = null;
    updateReadout();
  });
  overview.addEventListener('click', (event) => {
    const g = event.detail === 0 ? Math.round((state.domain[0] + state.domain[1]) / 2) : ov && ov.positionAt(event);
    if (g == null) return;
    state.pinned = g;
    state.hover = null;
    render();
  });
  overview.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 10 : 1;
    const from = state.pinned ?? Math.round((state.domain[0] + state.domain[1]) / 2);
    let g = null;
    if (event.key === 'ArrowRight') g = from + step;
    else if (event.key === 'ArrowLeft') g = from - step;
    else if (event.key === 'Enter' || event.key === ' ') g = from;
    else if (event.key === 'Escape') {
      state.pinned = null;
      render();
      return;
    } else return;
    event.preventDefault();
    state.pinned = Math.max(whole[0], Math.min(whole[1], g));
    const [a, b] = state.domain;
    if (state.pinned < a || state.pinned > b) zoomTo([state.pinned - (b - a) / 2, state.pinned + (b - a) / 2].map(Math.round));
    else render();
  });

  function showChosen() {
    state.pinned = null;
    status.textContent = '';
    track.goTo(null);
    goStatus.textContent = '';
    for (const box of [exonBox, cBox, intronBox, genomeBox]) box.value = '';
    recenter = true;
    zoomTo(exampleDomain(current));
  }
  picker.addEventListener('change', (event) => {
    if (event.target.name !== 'exon-view') return;
    current = views.find((v) => v.id === event.target.value);
    showChosen();
  });
  showExample.addEventListener('click', (event) => {
    showChosen();
    if (event.detail === 0) overview.focus({ preventScroll: true });
  });
  function setTrackMode(mode) {
    track.setMode(mode);
    for (const input of modes.querySelectorAll('input[name=seq-mode]')) input.checked = input.value === mode;
    trackNote.textContent = trackText(model, track.mode);
    if (track.target != null && !track.has(track.target)) {
      track.goTo(null);
      goStatus.textContent = '';
      intronBox.value = '';
      genomeBox.value = '';
    }
    render();
  }
  modes.addEventListener('change', (event) => {
    if (event.target.name !== 'seq-mode') return;
    setTrackMode(event.target.value);
  });

  function goTo(g, align, message) {
    const loc = model.locate(g);
    if (loc.region === 'intron' && track.mode !== 'genomic') setTrackMode('genomic');
    track.goTo(g, align);
    exonBox.value = loc.region === 'intron' ? '' : String(loc.exon);
    intronBox.value = loc.region === 'intron' ? String(loc.after) : '';
    cBox.value = model.cName(g).slice(2);
    genomeBox.value = String(g);
    goStatus.textContent = message;
    setState();
  }
  const refuseGo = (message) => {
    goStatus.textContent = message;
    setState();
  };
  const goExon = () => {
    const n = Number(exonBox.value);
    const e = Number.isInteger(n) ? model.exonByNumber.get(n) : null;
    if (!e) return refuseGo(`Exons of ${tx} are numbered 1 to ${model.exons.length}.`);
    return goTo(e.start, 'start', `Exon ${n}: its first base, outlined in blue.`);
  };
  const goCoding = () => {
    const found = parseCoding(model, cBox.value);
    if (found.error) return refuseGo(found.error);
    const loc = model.locate(found.g);
    const intron = loc.region === 'intron';
    if (renamed(found)) return goTo(found.g, 'centre', `${renamed(found)}Outlined in blue${intron ? ', in the genomic view' : ''}.`);
    return goTo(found.g, 'centre', intron
      ? `${found.name}, in intron ${loc.after}, between exons ${loc.after} and ${loc.before}, outlined in blue, in the `
        + 'genomic view.'
      : `${found.name}, in exon ${loc.exon}, outlined in blue.`);
  };
  const goIntron = () => {
    const n = Number(intronBox.value);
    const e = Number.isInteger(n) && n < model.exons.length ? model.exonByNumber.get(n) : null;
    if (!e) {
      return refuseGo(`Introns of ${tx} are numbered 1 to ${model.exons.length - 1}; intron n lies between exons n `
        + 'and n + 1.');
    }
    return goTo(e.end + 1, 'start', `Intron ${n}, between exons ${n} and ${n + 1}: its first base, outlined in blue, in `
      + 'the genomic view.');
  };
  const goGenome = () => {
    const { assembly, sequence_accession: acc, chromosome } = model.header;
    const range = `${assembly} (${acc}) positions here run from ${fmt(model.span.start)} to ${fmt(model.span.end)}.`;
    const m = new RegExp(`^(?:chr${chromosome}:)?(\\d+)$`, 'i').exec(genomeBox.value.trim().replace(/[\s,]+/g, ''));
    if (!m) return refuseGo(`Not recognised. ${range}`);
    const g = Number(m[1]);
    if (g < model.span.start || g > model.span.end) return refuseGo(`${fmt(g)} is outside this transcript. ${range}`);
    const loc = model.locate(g);
    return goTo(g, 'centre', loc.region === 'intron'
      ? `${assembly} ${fmt(g)}, in intron ${loc.after}, between exons ${loc.after} and ${loc.before}, outlined in blue, `
        + 'in the genomic view.'
      : `${assembly} ${fmt(g)}, in exon ${loc.exon}, outlined in blue.`);
  };
  const exonEdges = [...new Set(model.exons.flatMap((e) => [e.start, e.end]))].sort((a, b) => a - b);
  const stepEdge = (dir) => {
    const from = track.reference();
    const g = dir > 0 ? exonEdges.find((x) => x > from) : [...exonEdges].reverse().find((x) => x < from);
    if (g == null) return refuseGo(dir > 0 ? 'No exon edge after this point.' : 'No exon edge before this point.');
    const e = model.exons.find((x) => x.start === g || x.end === g);
    return goTo(g, 'centre', `The ${g === e.start ? 'first' : 'last'} base of exon ${e.exon}, outlined in blue.`);
  };
  for (const [box, run] of [[exonBox, goExon], [cBox, goCoding], [intronBox, goIntron], [genomeBox, goGenome]]) {
    box.addEventListener('change', run);
    box.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      run();
    });
  }
  go.addEventListener('submit', (event) => event.preventDefault());
  stepBack.addEventListener('click', () => stepEdge(-1));
  stepOn.addEventListener('click', () => stepEdge(1));
  const tryChange = () => {
    if (!tryBox.value.trim()) {
      state.change = null;
      tryNote = null;
      render();
      return;
    }
    const r = typedChange(model, rules, tryBox.value);
    if (r.error) {
      state.change = null;
      tryNote = changeRefusal(model, rules, r);
      tryNotePin = state.pinned;
      render();
      return;
    }
    tryNote = null;
    state.change = r;
    state.pinned = r.g;
    state.hover = null;
    status.textContent = '';
    if (r.region === 'intron' && track.mode !== 'genomic') setTrackMode('genomic');
    else if (r.region === 'cds' && track.mode !== 'exonic') setTrackMode('exonic');
    recenter = true;
    zoomTo([r.g - 150, r.g + 150]);
  };
  if (tryForm) {
    tryBox.addEventListener('change', tryChange);
    tryBox.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      tryChange();
    });
    tryForm.addEventListener('submit', (event) => event.preventDefault());
  }
  let queued = false;
  let drawnWidth = 0;
  new ResizeObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (Math.floor(overview.clientWidth) !== drawnWidth) {
        drawnWidth = Math.floor(overview.clientWidth);
        render();
      }
      hint.hidden = scroller.scrollWidth <= scroller.clientWidth + 1;
    });
  }).observe(root);
  render();
  drawnWidth = Math.floor(overview.clientWidth);
  wireTextLinks(root, model);
}


function partGuides() {
  return ['1', '2', '3'].map((step) => {
    const found = host.querySelectorAll(`.exon-guides > .exon-step-guide[data-guide="${step}"]`);
    if (found.length === 1) return [found[0]];
    console.error(`${NAME}: the article gives ${found.length ? `${found.length} guides` : 'no guide'} for step ${step}, `
      + 'so the step goes without one.');
    return [];
  });
}

const LIGHTS = {
  exon: ['.p1-coding', '.p1-utr', '.p2-coding', '.seq-base:not(.intron)', '.lane-exon td:is(.r-cds, .r-5utr, .r-3utr)'],
  intron: ['.p1-intron', 'text.exon-svg-intron', '.exon-band polygon[fill="#888"]', '.seq-base.intron',
    '.seq-junction:not([hidden])', 'td.r-intron'],
  coding: ['.p1-coding', '.p2-coding', '.seq-base:is(.odd, .even, .cds)', 'td.r-cds'],
  utr: ['.p1-utr', '.seq-base.utr', 'td:is(.r-5utr, .r-3utr)'],
  codon: ['.seq-base:is(.odd, .even)', '.seq-aa', '.lane-codon td.codon'],
  aa: ['.seq-aa', '.lane-residue td.residue'],
  residue: ['.p2-ruler', '.seq-resno', '.lane-residue td.residue'],
  band: ['.exon-band polygon'],
  marker: [`line:is(.mark-p1, .mark-p2)[stroke="${COLOR.mark}"]`, 'text.exon-svg-mark', '.exon-strip-mark',
    '.seq-base.anchor', '.figure-root[data-state*="pin=none"] td:is(.anchor, .anchor-group)'],
  box: ['.exon-readout'],
  c: ['.seq-track[data-mode="exonic"] .seq-tick', '.lane-c td'],
  genome: ['.p1-position', '.seq-track[data-mode="genomic"] .seq-tick', '.lane-genome td'],
};

function wireTextLinks(root, model) {
  const on = { pointer: null, focus: null, held: null };
  let watch = null;
  const names = [];
  for (const link of document.querySelectorAll('.fig-link[data-figure="fig-exons"]')) {
    if (Object.prototype.hasOwnProperty.call(LIGHTS, link.dataset.light ?? '')) names.push(link);
    else {
      console.error(`${NAME}: a name in the text lights nothing in the figure (data-light="${link.dataset.light ?? ''}", `
        + `"${link.textContent.replace(/\s+/g, ' ').trim()}").`);
    }
  }
  const mark = () => {
    for (const e of root.querySelectorAll('[data-lit-mark]')) e.removeAttribute('data-lit-mark');
    const key = root.dataset.lit;
    if (key) for (const e of root.querySelectorAll(LIGHTS[key].join(', '))) e.setAttribute('data-lit-mark', '');
  };
  const update = () => {
    const link = on.pointer ?? on.focus ?? on.held;
    if (link) root.dataset.lit = link.dataset.light;
    else delete root.dataset.lit;
    for (const n of names) {
      n.classList.toggle('is-lit', n === link);
      n.classList.toggle('is-held', n === on.held);
    }
    mark();
    if (link && !watch) {
      watch = new MutationObserver(mark);
      watch.observe(root, { childList: true, subtree: true });
    } else if (!link && watch) {
      watch.disconnect();
      watch = null;
    }
  };
  const hold = (link) => {
    on.held = on.held === link ? null : link;
    update();
  };
  for (const link of names) {
    link.tabIndex = 0;
    link.addEventListener('pointerenter', () => {
      on.pointer = link;
      update();
    });
    link.addEventListener('pointerleave', () => {
      if (on.pointer === link) on.pointer = null;
      update();
    });
    link.addEventListener('focus', () => {
      if (!link.matches(':focus-visible')) return;
      on.focus = link;
      update();
    });
    link.addEventListener('blur', () => {
      if (on.focus !== link) return;
      on.focus = null;
      update();
    });
    link.addEventListener('click', () => hold(link));
    link.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      hold(link);
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !on.held) return;
    on.held = null;
    update();
  });

  for (const link of document.querySelectorAll('.fig-act[data-figure="fig-exons"]')) {
    const act = actOf(root, model, link);
    if (!act) continue;
    link.tabIndex = 0;
    link.setAttribute('role', 'button');
    link.title = act.title;
    link.addEventListener('click', act.run);
    link.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      act.run();
    });
  }
}

function actOf(root, model, link) {
  const { act = '', value = '' } = link.dataset;
  const refuse = (why) => {
    console.error(`${NAME}: an instruction in the text works nothing in the figure (${why}, `
      + `"${link.textContent.replace(/\s+/g, ' ').trim()}").`);
    return null;
  };
  const controls = [...root.querySelectorAll('select, input')].filter((c) => c.name === act);
  if (!controls.length) return refuse(`no control named "${act}"`);
  const send = (control) => control.dispatchEvent(new Event('change', { bubbles: true }));
  const [first] = controls;
  if (first.tagName === 'SELECT') {
    const option = [...first.options].find((o) => o.value === value);
    if (!option) return refuse(`"${value}" is not in its list`);
    const label = first.closest('label');
    return {
      title: `${label && label.firstChild.nodeType === Node.TEXT_NODE ? label.firstChild.textContent : ''}${option.textContent}`,
      run: () => {
        first.value = value;
        send(first);
      },
    };
  }
  if (first.type === 'radio') {
    const radio = controls.find((c) => c.value === value);
    if (!radio) return refuse(`no choice "${value}"`);
    const group = radio.closest('[role=radiogroup]');
    const legend = radio.closest('fieldset') && radio.closest('fieldset').querySelector('legend');
    const name = group ? group.getAttribute('aria-label') : legend ? legend.textContent : '';
    return {
      title: `${name}: ${radio.parentElement.textContent.trim()}`,
      run: () => {
        radio.checked = true;
        send(radio);
      },
    };
  }
  if (act === 'seq-c') {
    if (model.parseCName(`c.${value}`).error) return refuse(`c.${value} names no position of the transcript`);
    return {
      title: `${first.form ? first.form.getAttribute('aria-label') : 'Go to'}: c.${value}`,
      run: () => {
        first.value = value;
        send(first);
      },
    };
  }
  return refuse(`the text can't work "${act}"`);
}

const sameDomain = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

function featureWindow(model, value) {
  const [kind, n] = String(value).split(':');
  const e = model.exonByNumber.get(Number(n));
  if (!e) return null;
  if (kind === 'exon') {
    const pad = Math.max(20, Math.round((e.end - e.start + 1) * 0.25));
    return [Math.max(model.span.start, e.start - pad), Math.min(model.span.end, e.end + pad)];
  }
  const next = model.exonByNumber.get(Number(n) + 1);
  return [e.end + 1 - 30, next.start - 1 + 30];
}

function parseQuery(model, text) {
  const q = text.trim().replace(/[\s,]+/g, '');
  const usage = 'Try c.1840, c.-139, c.1925+70, p.614, p.Arg614 or a chr19 position such as 38457545.';
  if (!q) return { error: `Type a position to find. ${usage}` };
  if (/^c(?!hr)/i.test(q)) {
    const r = model.parseCName(q.replace(/[ACGT]>[ACGT]$/i, ''));
    if (r.error) return { error: nameRefusal(model, r, usage) };
    return { g: r.g, message: `${renamed(r)}Found ${r.name}.` };
  }
  let m = /^p\.?([A-Za-z]{3})?(\d+)(?:[A-Za-z]{3}|=|\*)?$/.exec(q);
  if (m && /^p/i.test(q)) {
    const r = Number(m[2]);
    if (r < 1 || r > model.residues) return { error: `Residue ${r} is outside ${canonical(model).accession}, which has residues 1 to ${fmt(model.residues)}.` };
    const three = m[1] && m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    const given = THREE[model.aaAt(r)];
    if (three && given !== three) return { error: `Residue ${r} is ${given} in the release, not ${three}.` };
    return { g: model.genomeOfC(3 * r - 2), message: `Found residue ${r}, at its codon's first base.` };
  }
  m = /^(?:chr19:)?(\d+)$/i.exec(q);
  if (m) {
    const g = Number(m[1]);
    if (g < model.span.start || g > model.span.end) {
      return { error: `${fmt(g)} is outside this transcript, which spans chr19:${fmt(model.span.start)} to ${fmt(model.span.end)}.` };
    }
    return { g, message: `Found chr19:${fmt(g)}.` };
  }
  return { error: `Not recognised. ${usage}` };
}
function parseCoding(model, text) {
  const q = text.trim().replace(/[\s,]+/g, '');
  const range = `This box takes c. names from ${model.cName(model.span.start)} to ${model.cName(model.span.end)}, such as `
    + 'c.1840, c.-139, c.1925+70 or c.*10.';
  if (!q) return { error: `Type a c. name. ${range}` };
  const r = model.parseCName(q);
  return r.error ? { error: nameRefusal(model, r, range) } : r;
}

const genomicReference = (model) => (model.header.typed_variants && model.header.typed_variants.forms
  && model.header.typed_variants.forms.genomic_reference)
  || `${model.header.sequence_accession}(${model.header.transcript.refseq})`;
const intronic = (model, g) => model.locate(g).region === 'intron';
const nameOn = (model, g) => (intronic(model, g) ? `${genomicReference(model)}:${model.cName(g)}`
  : `${model.cName(g)} on ${model.header.transcript.refseq}`);
const copyName = (model, g) => `${intronic(model, g) ? genomicReference(model) : model.header.transcript.refseq}:${model.cName(g)}`;

const ordinal = (n) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
  return `${fmt(n)}${s}`;
};

function nameNote(model, g) {
  const loc = model.locate(g);
  const name = model.cName(g);
  if (loc.region === 'intron') {
    const [, from, side, k] = /^c\.([-*]?\d+)([+-])(\d+)$/.exec(name);
    return `HGVS names a base in an intron from the nearer exon: ${name} is the ${ordinal(Number(k))} base `
      + `${side === '+' ? 'after' : 'before'} c.${from}, the ${side === '+' ? 'last' : 'first'} base of exon `
      + `${side === '+' ? loc.after : loc.before}. The transcript holds no intron, so the full name gives the genome: `
      + `${nameOn(model, g)}.`;
  }
  const n = Number(/(\d+)$/.exec(name)[1]);
  if (loc.region === '5utr') return `HGVS numbers the bases before the start codon back from c.1: ${name} is the ${ordinal(n)} base before it.`;
  if (loc.region === '3utr') {
    return `HGVS numbers the bases after the stop codon on from c.${model.cds}: ${name} is the ${ordinal(n)} base after it.`;
  }
  return null;
}

function nameRefusal(model, r, range) {
  const first = model.cName(model.span.start);
  const last = model.cName(model.span.end);
  switch (r.error) {
    case 'c0': return `HGVS numbering has no c.0. ${range}`;
    case 'past-stop': return `${r.typed} is past the stop codon, which ends at c.${model.cds}. The bases after it are c.*1 to ${last}.`;
    case 'before': return `${r.typed} is before this transcript, which starts at ${first}.`;
    case 'after': return `${r.typed} is after this transcript, which ends at ${last}.`;
    case 'not-last': return `${r.base} is not the last base of an exon, so ${r.typed} names no base: a name with + counts on from an exon's last base.`;
    case 'not-first': return `${r.base} is not the first base of an exon, so ${r.typed} names no base: a name with - counts back from an exon's first base.`;
    case 'past-intron': return `Intron ${r.intron} has ${fmt(r.length)} bases, so ${r.typed} lies past its end.`;
    default: return `Not recognised. ${range}`;
  }
}

const renamed = (r) => {
  if (!r.typed || r.typed === r.name) return '';
  const half = r.name.includes('+') ? "first half from the exon before it" : 'second half from the next exon';
  return `${r.typed} is named ${r.name}: HGVS numbers an intron's ${half}. `;
};

const KIND_WORD = {
  substitution: 'a substitution', deletion: 'a deletion', duplication: 'a duplication', insertion: 'an insertion',
  delins: 'a deletion-insertion', inversion: 'an inversion',
};
function renamedNote(r) {
  const n = r.renamed;
  if (!n) return '';
  if (n.reasons.length === 1 && n.reasons[0] === 'position') return renamed({ typed: n.typed, name: n.name }).trim();
  const parts = [];
  if (n.reasons.includes('trimmed')) parts.push('writes only the bases that change');
  if (n.reasons.includes('moved')) {
    parts.push(`names a change at its most 3′ position${n.landsIn ? `, even across an intron's edge, so it lies in ${n.landsIn}` : ''}`
      + `${n.rotated ? `, and shifted ${n.shift === 1 ? 'one base' : `${n.shift} bases`} the same inserted bases read ${r.alt}` : ''}`);
  }
  if (n.reasons.includes('type')) {
    parts.push(n.fromInsertion ? 'writes an insertion that repeats the bases before it as a duplication' : `writes it as ${KIND_WORD[r.kind]}`);
  }
  if (n.reasons.includes('position')) parts.push(`numbers an intron's ${n.name.includes('+') ? 'first half from the exon before it' : 'second half from the next exon'}`);
  return `${n.typed} is named ${n.name}: HGVS ${parts.join(', and ')}.`;
}

function codonBasesOf(model, r, origins) {
  const replaced = new Map(r.replaced);
  return origins.map(([g, j]) => (j > 0 ? r.inserted.bases[j - 1] : replaced.get(g) ?? model.baseAt(g))).join('');
}

function changeLine(model, rules, r) {
  const aa = (x) => (x === '*' ? 'a stop' : AMINO[x]);
  const n = model.residues;
  const c = (g) => model.cName(g);
  const bases = (k) => (k === 1 ? 'one base' : `${k} bases`);
  const residuesWord = (k) => (k === 1 ? 'one residue' : `${k} residues`);
  const codonOf = (k) => r.newCodons.find(([m]) => m === k);
  const basesOfCodon = (k) => (codonOf(k) ? codonBasesOf(model, r, codonOf(k)[2]) : '');
  const firstDiffers = r.nameWithheld ? `; the first residue that differs is ${r.firstChangedResidue}` : '';
  const verb = ({ where = false } = {}) => {
    const old = r.ref.length;
    const now = r.alt.length;
    if (r.kind === 'deletion') return `It removes ${bases(old)}`;
    if (r.kind === 'insertion') return `It adds ${bases(now)}`;
    if (r.kind === 'duplication') {
      if (!where) return `It duplicates ${bases(now)}`;
      return now === 1 ? `It duplicates one base, ${c(r.gFirst)}` : `It duplicates ${now} bases, ${c(r.gFirst)} to ${c(r.gLast)}`;
    }
    return `It replaces ${bases(old)} with ${now}`;
  };
  const lengthChange = () => (r.kind === 'delins' && r.ref.length !== r.alt.length ? `, changing the length by ${bases(Math.abs(r.alt.length - r.ref.length))}` : '');
  const keptFrame = () => {
    const d = r.proteinEnd - n;
    return `${verb()}${lengthChange()}, a multiple of three, so the reading frame is kept and the protein would be `
      + `${residuesWord(Math.abs(d))} ${d < 0 ? 'shorter' : 'longer'}, ending at residue ${r.proteinEnd} instead of ${n}${firstDiffers}.`
      + asFrameshift();
  };
  const broughtStop = () => {
    const brought = `${r.kind === 'deletion' ? 'the change brings' : 'the new bases bring'} a stop: the protein would end at `
      + `residue ${r.proteinEnd} instead of ${n}.`;
    const net = r.alt.length - (r.kind === 'insertion' || r.kind === 'duplication' ? 0 : r.ref.length);
    return net === 0 ? `${verb()}, so the reading frame is kept, but ${brought}`
      : `${verb()}${lengthChange()}, a multiple of three, so the reading frame is kept, but ${brought}`;
  };
  const frameshiftStop = () => {
    const items = r.newCodons.map(([k, x, origins]) => `codon ${k} becomes ${codonBasesOf(model, r, origins)}, `
      + `${x === '*' ? 'a stop' : `still ${aa(x)}`}`);
    const listed = items.length > 1 ? `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}` : items[0];
    return `${verb({ where: true })}${lengthChange()}. That isn't a multiple of three, so the reading frame shifts: ${listed}, `
      + `so the protein would end at residue ${r.proteinEnd} instead of ${n}.`;
  };
  const throughStopRule = {
    delins: 'HGVS names a deletion-insertion that starts before the stop codon and includes it as a frameshift',
    inversion: 'HGVS describes an inversion on the protein level as a deletion-insertion, and names one that starts before '
      + 'the stop codon and includes it as a frameshift',
  };
  const frameshiftNamed = () => `${verb()}, so the reading frame is kept, but the new bases bring a stop at codon ${n + 1}, `
    + `where the old stop was: the protein would still end at residue ${n}; the first residue that differs is `
    + `${r.firstChangedResidue}. ${throughStopRule[r.kind]}, though here the frame is kept and the stop stays at codon `
    + `${n + 1}, so its name isn't given here.`;
  const misreadStop = () => `${verb()}, so the reading frame is kept, but the new bases bring a stop at codon `
    + `${r.newStopCodon}, so the protein would end at residue ${r.proteinEnd} instead of ${n}; the first residue that `
    + `differs is ${r.firstChangedResidue}. ${throughStopRule[r.kind]}, though here the frame is kept, so its name isn't `
    + 'given here.';
  const sameLength = () => {
    if (!(r.residueChange?.was.length > 1)) {
      const k = r.firstChangedResidue;
      return `Codon ${k} becomes ${basesOfCodon(k)}, so residue ${k} changes from ${aa(model.aaAt(k))} to ${aa(codonOf(k)[1])}; `
        + `the protein still ends at residue ${n}.`;
    }
    const last = r.firstChangedResidue + r.residueChange.was.length - 1;
    return `${verb()}, so the reading frame is kept and the protein still ends at residue ${n}; the first residue that `
      + `differs is ${r.firstChangedResidue}, and the last ${last}.`;
  };
  const unending = () => `reading goes on to the transcript's end without meeting a stop, through ${r.residuesRead} residues, `
    + (r.soTerm === 'stop_lost'
      ? `more than the ${n} of P21817-1: the protein would be longer, but where it would end is unknown (HGVS writes it Ter?).`
      : `no more than the ${n} of P21817-1, so the protein's length can't be told (HGVS writes its end Ter?).`);
  const stopWhere = () => ({ in: ' in the stop codon', into: ', reaching into the stop codon', through: ', through the stop codon',
    out: ', from the stop codon into the 3′ untranslated region' }[r.stopPart] ?? '');
  const asFrameshift = () => (r.shiftsFrame ? '' : {
    deletion: ' HGVS names a deletion that starts before the stop codon and includes it as a frameshift.',
    delins: ' HGVS names a deletion-insertion that starts before the stop codon and includes it as a frameshift.',
    inversion: ' HGVS describes an inversion on the protein level as a deletion-insertion, and names one that starts before '
      + 'the stop codon and includes it as a frameshift.',
  }[r.namedAsFrameshift] ?? '');
  const indel = r.kind !== 'substitution';
  const what = {
    missense_variant: () => (indel ? (r.withheldBecause === 'frameshift-name' ? frameshiftNamed() : sameLength())
      : `Codon ${r.codon} becomes ${r.altCodon}, so residue ${r.codon} changes from `
      + `${aa(r.refAa)} to ${aa(r.altAa)}; the protein still ends at residue ${r.proteinEnd}.`),
    synonymous_variant: () => {
      if (!indel) return `Codon ${r.codon} becomes ${r.altCodon}, which still codes for ${aa(r.refAa)}, so the protein is unchanged.`;
      if (r.severalCodons) return `${verb()}, and the changed codons still code for the same residues, so the protein is unchanged.`;
      const k = r.newCodons[0][0];
      return `Codon ${k} becomes ${basesOfCodon(k)}, which still codes for ${aa(model.aaAt(k))}, so the protein is unchanged.`;
    },
    stop_retained_variant: () => (indel && !codonOf(n + 1)
      ? `The stop codon is still ${model.codonBases(n + 1)}, so the protein is unchanged.`
      : `The stop codon becomes ${indel ? basesOfCodon(n + 1) : r.altCodon}, still a stop, so the protein is unchanged.`),
    stop_gained: () => (r.withheldBecause === 'class-misread' ? misreadStop()
      : indel && r.bringsStop ? broughtStop()
        : indel && r.shiftsFrame ? frameshiftStop()
          : `Codon ${indel ? r.firstChangedResidue : r.codon} becomes ${indel ? basesOfCodon(r.firstChangedResidue) : r.altCodon}, `
            + `a stop, so the protein would end at residue ${r.proteinEnd} instead of ${n}.`),
    stop_lost: () => {
      if (!indel) {
        return r.newStopCodon
          ? `The stop codon becomes ${r.altCodon}, which codes for ${aa(r.altAa)}, so reading goes on into the 3′ untranslated `
            + `region to a new stop at codon ${r.newStopCodon}; the protein would end at residue ${r.proteinEnd} instead of ${n}.`
          : `The stop codon becomes ${r.altCodon}, which codes for ${aa(r.altAa)}, and reading goes on to the transcript's end `
            + 'without meeting a new stop.';
      }
      const ends = `the protein would end at residue ${r.proteinEnd} instead of ${n}${firstDiffers}.`;
      const onward = !r.newStopCodon ? unending()
        : r.stopFromChange ? `the new bases bring a stop at codon ${r.newStopCodon}: ${ends}`
          : `reading goes on into the 3′ untranslated region to a new stop at codon ${r.newStopCodon}; ${ends}`;
      if (r.shiftsFrame) return `${verb()}${stopWhere()}, so the stop is lost and the reading frame shifts${r.stopFromChange ? ', but' : ':'} ${onward}`;
      return `The stop codon is lost, ${!r.newStopCodon ? 'and' : r.stopFromChange ? 'but' : 'so'} ${onward}${asFrameshift()}`;
    },
    terminator_codon_variant: () => (r.p === 'p.?'
      ? `${verb()}${stopWhere()}, and the transcript then ends inside codon ${r.firstChangedResidue}, the first that would `
        + 'change, so no changed residue can be read and its consequence for the protein can\'t be predicted.'
      : `${verb()}${stopWhere()}${r.shiftsFrame ? ', so the stop is lost and the reading frame shifts' : ', so the stop is lost'}: `
        + `${unending()}${asFrameshift()}`),
    frameshift_variant: () => {
      const k = r.proteinEnd - r.firstChangedResidue + 1;
      return `${verb({ where: true })}${lengthChange()}. That isn't a multiple of three, so the reading frame shifts: from residue `
        + `${r.firstChangedResidue} the protein is read in the new frame, ${k === 1 ? 'one new residue' : `${k} new residues`}, then `
        + `a stop at codon ${r.newStopCodon} (HGVS's Ter${k + 1} counts the stop itself); the protein would end at residue `
        + `${r.proteinEnd} instead of ${n}.`;
    },
    inframe_deletion: () => keptFrame(),
    inframe_insertion: () => keptFrame(),
    start_lost: () => (indel
      ? `It ${r.removesStart ? 'removes' : 'changes'} the start codon, ${model.codonBases(1)}, so its consequence for the protein `
        + 'can\'t be predicted.'
      : `It changes the start codon, ${r.refCodon}, to ${r.altCodon}, so its consequence for the protein can't be predicted.`),
    '5_prime_UTR_variant': () => 'It lies before the coding sequence. Read from c.1, the protein is unchanged; a start codon '
      + 'the change might make upstream is not looked for.',
    '3_prime_UTR_variant': () => (r.kind === 'duplication' && model.locate(r.gFirst).region === 'cds'
      ? `Its copy goes after the stop codon, which still reads ${model.codonBases(n + 1)}. Read from c.1, the protein is unchanged.`
      : 'It lies after the stop codon. Read from c.1, the protein is unchanged.'),
    intron_variant: () => `It lies in intron ${r.intron}, between exons ${r.intron} and ${r.intron + 1}. Its effect is not `
      + 'computed.',
  };
  const unclassed = () => {
    const name = (part) => (part.exon != null ? `exon ${part.exon}` : `intron ${part.intron}`);
    const { from, to } = r.edge;
    const ord = (part) => (part.exon != null ? 2 * part.exon : 2 * part.intron + 1);
    const partAt = (k) => (k % 2 ? `intron ${(k - 1) / 2}` : `exon ${k / 2}`);
    const edges = ord(to) - ord(from);
    const counted = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][edges] ?? String(edges);
    const where = edges === 1
      ? `${r.kind === 'insertion' || r.kind === 'duplication' ? 'lies at' : 'spans'} the edge between ${name(from)} and ${name(to)}`
      : edges === 2 ? `runs from ${name(from)} through ${partAt(ord(from) + 1)} into ${name(to)}, across two exon-intron edges`
        : `runs from ${name(from)} to ${name(to)}, across ${counted} exon-intron edges`;
    return `It ${where}, and ChannelScope leaves such a change unclassed: its effect is not computed.`;
  };
  const oldPlace = () => `${verb()}${r.alt.length === (r.kind === 'insertion' || r.kind === 'duplication' ? 0 : r.ref.length)
    ? '' : `${lengthChange()}, a multiple of three`}, so the reading frame is kept, but the new bases `
    + `bring a stop at codon ${n + 1}, where the old stop was: the protein would still end at residue ${n}; the first `
    + `residue that differs is ${r.firstChangedResidue}. The release's rules class a change that puts in a stop as `
    + 'stop_gained (SO:0001587), which the Sequence Ontology defines by a change "resulting in a premature stop codon, '
    + 'leading to a shortened polypeptide"; this protein is not shorter, so neither a class nor a name is given here.';
  const sentence = r.soTerm ? what[r.soTerm]() : r.stopAtOldPlace ? oldPlace() : unclassed();
  const zoneList = (zones) => {
    const items = zones.map((z) => `${z.term} (${z.id})`);
    return items.length > 2 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items.join(' and ');
  };
  const zones = zoneList(r.splice);
  const first = zones ? ` It lies in the ${zones}${r.effectComputed ? '.' : '; splicing is not computed.'}` : '';
  let second = '';
  if (r.placements?.length) {
    const words = ['', 'one', 'two', 'three'];
    const shown = (name) => name.replace(/ins([ACGT]+)$/, (all, run) => (run.length <= SHOWN_INSERT ? all : `ins${shortInsert(run)} (${run.length} bases)`));
    const items = r.placements.map((p, k) => {
      const same = k > 0 && zoneList(p.zones) === zoneList(r.placements[k - 1].zones);
      return `${p.reference}:${shown(p.name)} in the ${same ? `same ${p.zones.length === 1 ? 'zone' : words[p.zones.length]}` : zoneList(p.zones)}`;
    });
    const all = new Set(r.placements.flatMap((p) => p.zones.map((z) => z.term)));
    second = ` ${r.placements.length === 1 ? 'An equally valid placement lies' : 'Equally valid placements lie'} in `
      + `${all.size === 1 ? 'a splice-site zone' : 'splice-site zones'}: ${items.length > 1 ? `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}` : items[0]}.`;
  }
  const closing = r.effectComputed ? ' Splicing and what becomes of the transcript are not computed.' : '';
  let held = '';
  if (r.copyIntrons && r.effectComputed) {
    const l = r.copyIntrons.introns;
    const which = l.length === 1 ? `intron ${l[0]}` : l.length === 2 ? `introns ${l[0]} and ${l[1]}` : `introns ${l[0]} to ${l[l.length - 1]}`;
    held = ` Its copy holds bases from ${which}, read here as part of exon ${r.copyIntrons.exon}.`;
  }
  const note = renamedNote(r);
  const head = r.soTerm ? `${r.soTerm} (${r.soId}).` : 'not classed.';
  return [el('b', 'seq-try-name', r.p ? `${r.name}, ${r.p}` : r.name), `: ${head} ${sentence}${held}${first}${second}${closing}${note ? ` ${note}` : ''}`];
}

function changeRefusal(model, rules, r) {
  const takes = 'This box takes a change such as c.1840C>T.';
  const at = (x) => (x.includes('_') ? x.replace('_', ' to c.') : x);
  const one = !r.at || !r.at.includes('_');
  switch (r.error) {
    case 'reference': return `This box takes changes on ${rules.coding}, not on ${r.reference}.`;
    case 'position': return nameRefusal(model, r.position, takes);
    case 'ref': return one ? `The base at ${r.at} is ${r.base}, not ${r.ref}.` : `The bases at ${at(r.at)} are ${r.base}, not ${r.ref}.`;
    case 'same': return one ? `The base at ${r.at} is already ${r.base}, so that names no change.`
      : `The bases at ${at(r.at)} are already ${r.base}, so that names no change.`;
    case 'neighbours': return 'An insertion goes between two neighbouring positions, such as c.1843_1844insAAT.';
    case 'short': return 'An inversion takes at least two bases, such as c.14422_14423inv.';
    case 'order': return 'The first position comes after the second: write the range from 5′ to 3′, such as c.51_53del.';
    case 'several': return 'This box takes one change at a time.';
    case 'repeat': return 'Repeat notation, such as HGVS\'s own example c.89_118AGC[13], from another gene, isn\'t taken: write '
      + 'the change as a deletion, duplication or insertion.';
    case 'bases': return 'Inserted bases are written with A, C, G and T.';
    case 'junction': {
      const [e1, e2] = r.exons;
      if (r.insertion) {
        return `On ${rules.coding} alone, ${r.from} and ${r.to} are neighbours, at the junction of exons ${e1} and ${e2}; on the `
          + `genome, intron ${e1} lies between them, so an insertion there has no single place. Write ${r.forms[0]} for exon `
          + `${e1}'s end, or ${r.forms[1]} for exon ${e2}'s start.`;
      }
      const many = e2 - e1 > 1;
      const head = r.neighbours
        ? `On ${rules.coding} alone, ${r.from} and ${r.to} are neighbours, at the junction of exons ${e1} and ${e2}; on the genome, `
          + `intron ${e1} lies between them.`
        : `On ${rules.coding} alone, ${r.from} to ${r.to} runs across the junction${many ? 's' : ''} of exons ${e1} ${many ? 'to' : 'and'} `
          + `${e2}; on the genome, ${many ? `introns ${e1} to ${e2 - 1} lie` : `intron ${e1} lies`} within it.`;
      return `${head} Write ${r.genomic} for the genomic ${r.kind}, intron${many ? 's' : ''} included.`;
    }
    case 'before-start': return `This puts bases before ${model.cName(model.span.start)}, the first base of the genome the release `
      + 'holds, so it can\'t be named here.';
    case 'past-end': return `HGVS's 3′ rule carries this change to ${model.cName(model.span.end)}, the last base of the genome the `
      + 'release holds, and could move it further, so its name can\'t be settled here.';
    default: return 'Not recognised. This box takes a change such as c.1840C>T, c.1840del, c.1840dup, c.1843_1844insAAT, '
      + 'c.13994_13995delinsCT or c.14422_14423inv.';
  }
}

function readoutFor(model, g) {
  const { header } = model;
  const loc = model.locate(g);
  const row = model.rowAt.get(g);
  const tx = `${header.transcript.refseq} = ${header.transcript.ensembl}`;
  const can = canonical(model).accession;
  const rows = [['GRCh38', `chr${header.chromosome}:${fmt(g)}, ${header.strand === '+' ? 'plus' : 'minus'} strand`]];
  const copy = [`chr${header.chromosome}:${g} (${header.assembly})`];
  const spanBase = model.baseAt(g);
  if (spanBase) {
    rows.push(['Base', el('span', 'readout-base', spanBase)]);
  } else if (row && row.genome_base) {
    const states = row.ref_base_states;
    if (!(states && loc.codonPos) || STATE[states[loc.codonPos - 1]] === 'read') {
      rows.push(['Base', el('span', 'readout-base', row.genome_base)]);
    }
  }
  let note = null;
  if (loc.region === 'cds') {
    const codonRows = model.highlights.filter((h) => h.codon_number === String(loc.codon));
    const rowAa = codonRows.find((h) => h.ref_aa && AMINO[h.ref_aa]);
    const rowCodon = codonRows.find((h) => h.ref_codon);
    const codonSeq = model.codonBases(loc.codon) || (rowCodon ? rowCodon.ref_codon : null);
    const aaLetter = (loc.residue ? model.aaAt(loc.residue) : null) || (rowAa ? rowAa.ref_aa : null);
    const exonsOf = [...new Set([0, 1, 2].map((k) => model.locate(model.genomeOfC(3 * loc.codon - 2 + k)).exon))];
    rows.push([tx, `c.${loc.c}`]);
    copy.push(`${header.transcript.refseq}:c.${loc.c}`);
    rows.push(['Exon', `exon ${loc.exon} of ${header.transcript.exon_count}`]);
    copy.push(`exon ${loc.exon}`);
    const codon = document.createDocumentFragment();
    codon.append(`codon ${loc.codon}`);
    if (codonSeq) {
      const bases = el('span', 'readout-bases');
      [...codonSeq].forEach((b, i) => bases.append(i + 1 === loc.codonPos ? el('b', null, b) : b));
      codon.append(' (', bases, ')');
    }
    codon.append(`, base ${loc.codonPos} of 3${exonsOf.length > 1 ? `, split across exons ${exonsOf.join(' and ')}` : ''}`);
    rows.push(['Codon', codon]);
    copy.push(`codon ${loc.codon} base ${loc.codonPos}`);
    if (loc.residue) {
      rows.push(['Residue', `${loc.residue} in ${can} = ${twin(model).accession}${aaLetter ? `, ${AMINO[aaLetter]}` : ''}`]);
      copy.push(`residue ${loc.residue} (${can})`);
    } else {
      rows.push(['Residue', 'none: this is the stop codon, which ends the protein']);
    }
    if (!codonSeq || (loc.residue && !aaLetter)) {
      note = `Bases are named only at the positions the release highlights, and amino acids only for ${codonsGiven(model)
        ?? 'the codons it gives'}, because ChannelScope's release does not yet carry the transcript's sequence or the `
        + 'protein\'s.';
    }
  } else if (loc.region === 'intron') {
    rows.push([tx, model.cName(g)]);
    copy.push(copyName(model, g));
    rows.push(['Intron', `intron ${loc.after}, between exons ${loc.after} and ${loc.before}`]);
    copy.push(`intron ${loc.after}`);
    rows.push(['Codon and residue', 'none: splicing removes introns']);
    note = nameNote(model, g);
  } else if (loc.region === '5utr' || loc.region === '3utr') {
    rows.push([tx, model.cName(g)]);
    copy.push(copyName(model, g));
    rows.push(['Exon', `exon ${loc.exon}, ${loc.region === '5utr' ? 'before' : 'after'} the coding sequence`]);
    copy.push(`exon ${loc.exon}`);
    rows.push(['Codon and residue', 'none: this part of the exon is not translated']);
    note = nameNote(model, g);
  } else {
    rows.push(['Transcript', 'outside this transcript']);
  }
  return { rows, copy: copy.join(' | '), note };
}

function codonsGiven(model) {
  const ns = [...new Set(model.highlights.filter((h) => h.codon_number && h.ref_aa && AMINO[h.ref_aa])
    .map((h) => Number(h.codon_number)))].sort((a, b) => a - b);
  if (!ns.length) return null;
  const runs = [];
  for (const n of ns) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  const words = runs.map(([a, b]) => (a === b ? `${a}` : `${a} to ${b}`));
  const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];
  return `${ns.length > 1 ? 'codons' : 'codon'} ${list}`;
}

const canonical = (model) => model.header.numberings.find((n) => n.identifier === model.header.proteins[0].canonical_numbering);
const twin = (model) => model.header.numberings.find((n) => n.md5 === canonical(model).md5 && n.accession !== canonical(model).accession);
const rowsOf = (model, view) => view.anchors.map((g) => model.rowAt.get(g));

function viewLabel(model, view) {
  const rows = rowsOf(model, view);
  const v = model.header.variant;
  switch (view.id) {
    case 'variant': return v ? `a known variant (${v.c_change}, ${v.p_change})` : `the variant's base, ${rows[0].c_hgvs}`;
    case 'split': return `a codon split by an intron (codon ${rows[0].codon_number})`;
    case 'intron': return `inside an intron (${rows[0].c_hgvs})`;
    default: return `before the coding sequence (${rows[0].c_hgvs})`;
  }
}

function markerLabel(model, view) {
  const rows = rowsOf(model, view);
  if (view.id === 'split') return `codon ${rows[0].codon_number}`;
  return rows.length > 1 ? `${rows[0].c_hgvs} … ${rows[rows.length - 1].c_hgvs}` : rows[0].c_hgvs;
}

function wrap(text, width, font) {
  wrap.ctx = wrap.ctx || document.createElement('canvas').getContext('2d');
  wrap.ctx.font = font;
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && wrap.ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const markOf = (view) => view.anchors[Math.floor(view.anchors.length / 2)];

function drawStrip(box, label, model, state, zoomTo, mark) {
  const W = Math.floor(box.clientWidth);
  if (W < 60) return;
  const { exons, span } = model;
  const [z0, z1] = state.domain;
  const whole = z0 === span.start && z1 === span.end;
  label.textContent = whole
    ? 'Drag along this strip to zoom in on a stretch of the transcript, or pick an exon or intron above.'
    : `Shown below: chr19:${fmt(z0)} to ${fmt(z1)}, ${fmt(z1 - z0 + 1)} bases. Drag along the strip to choose another stretch.`;
  const x0 = d3.scaleLinear([span.start, span.end + 1], [0, W]);
  const H = 22;
  const svg = d3.create('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
    .attr('class', 'exon-strip-svg').attr('aria-hidden', 'true');
  svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', H / 2).attr('y2', H / 2).attr('stroke', COLOR.intron);
  for (const e of exons) {
    svg.append('rect').attr('x', x0(e.start)).attr('width', Math.max(0.6, x0(e.end + 1) - x0(e.start)))
      .attr('y', 5).attr('height', H - 10).attr('fill', COLOR.coding).attr('fill-opacity', 0.6);
  }
  const brush = d3.brushX().extent([[0, 0], [W, H]]).on('end', (event) => {
    if (!event.sourceEvent) return;
    if (!event.selection) {
      zoomTo([span.start, span.end]);
      return;
    }
    const [a, b] = event.selection.map((px) => Math.round(x0.invert(px)));
    zoomTo([a, b]);
  });
  const g = svg.append('g').attr('class', 'exon-brush').call(brush);
  if (!whole) g.call(brush.move, [x0(z0), x0(z1 + 1)]);
  if (mark != null) {
    const x = Math.max(1, Math.min(W - 1, x0(mark + 0.5)));
    svg.append('line').attr('class', 'exon-strip-mark').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', H)
      .attr('stroke', COLOR.mark).attr('stroke-width', 2).attr('pointer-events', 'none');
  }
  box.replaceChildren(svg.node());
}

function codingRange(model, z0, z1) {
  let c0 = Infinity;
  let c1 = -Infinity;
  for (const e of model.coding) {
    const a = Math.max(e.codingStart, z0);
    const b = Math.min(e.codingEnd, z1);
    if (a > b) continue;
    c0 = Math.min(c0, e.cStart + (a - e.codingStart));
    c1 = Math.max(c1, e.cStart + (b - e.codingStart));
  }
  if (c0 <= c1) return { c0, c1, joint: null };
  let joint = 0;
  for (const e of model.coding) if (e.codingEnd < z0) joint = e.cEnd;
  return { c0: Math.max(1, joint - 29), c1: Math.min(model.cds, joint + 30), joint };
}

function drawnScale(node) {
  let k = 1;
  for (let n = node; n; n = n.parentElement) {
    const t = getComputedStyle(n).transform;
    if (t && t !== 'none') k *= new DOMMatrixReadOnly(t).a;
  }
  return k > 0 ? k : 1;
}

function drawOverview(box, model, view, cols, state) {
  const W = Math.floor(box.clientWidth);
  if (W < 60) return null;
  const { header, exons, coding, cds, span, exonByNumber } = model;
  const fig = header.figures;
  const family = getComputedStyle(box).fontFamily;
  const [z0, z1] = state.domain;
  const zoomed = z0 > span.start || z1 < span.end;
  const x1 = d3.scaleLinear([z0, z1 + 1], [0, W]);
  const cr = codingRange(model, z0, z1);
  const x2 = d3.scaleLinear([cr.c0 - 1, cr.c1], [0, W]);
  const inView = (g) => g >= z0 && g <= z1;
  const svg = d3.create('svg').attr('width', W).attr('class', 'exon-overview-svg').attr('role', 'img')
    .attr('aria-label', zoomed
      ? `Panel 1: chromosome ${header.chromosome} from ${fmt(z0)} to ${fmt(z1)}, with its exons at true width. Panel 2: `
        + (cr.joint == null ? `the coding bases c.${cr.c0} to c.${cr.c1} inside that stretch.` : `the coding bases either side of it.`)
      : `Panel 1: the ${header.transcript.exon_count} exons of ${header.gene.symbol} drawn to scale along `
        + `${fmt(fig.transcript_span_bp)} bases of chromosome ${header.chromosome}, ${pct(fig.intron_fraction)} of them intron. `
        + `Panel 2: the coding parts of the exons joined end to end, ${fmt(fig.coding_bases)} bases making `
        + `${fmt(fig.residues)} residues, with a tick at each of the ${fig.split_codons} exons that end part-way through a codon.`);
  let y = 0;
  const put = (str, x, yy, cls, anchor = 'start') => svg.append('text').attr('x', x).attr('y', yy)
    .attr('class', cls).attr('text-anchor', anchor).text(str);
  const para = (str, cls, size, weight = 400) => {
    for (const line of wrap(str, W - 2, `${weight} ${size}px ${family}`)) {
      y += size + 4;
      put(line, 0, y, cls);
    }
  };
  const clampText = (str, x, yy, cls, size, weight = 600) => {
    wrap.ctx.font = `${weight} ${size}px ${family}`;
    const half = wrap.ctx.measureText(str).width / 2;
    if (x - half < 0) return put(str, 0, yy, cls, 'start');
    if (x + half > W) return put(str, W, yy, cls, 'end');
    return put(str, x, yy, cls, 'middle');
  };

  para('1 · The transcript on the genome, to scale', 'exon-svg-title', 12, 600);
  para(zoomed
    ? `A stretch of ${fmt(z1 - z0 + 1)} bases of chromosome ${header.chromosome} (${header.assembly}), ${fmt(z0)} to `
      + `${fmt(z1)}. Exons are drawn at their true width; the gaps between them are introns.`
    : `From its first exon to its last, the transcript spans ${fmt(fig.transcript_span_bp)} bases of chromosome `
      + `${header.chromosome} (${header.assembly}, ${fmt(span.start)} to ${fmt(span.end)}); ${pct(fig.intron_fraction)} `
      + `of that span is intron. The ${header.transcript.exon_count} exons are drawn at their true width.`, 'exon-svg-note', 11);
  y += 20;
  const labelY = y;
  const t1 = y + 7;
  const h1 = 16;
  const t1b = t1 + h1;
  const ly = t1b + 12;
  const ty = t1b + 26;
  const bt = ty + 8;
  const t2 = bt + 40;
  const h2 = 18;

  const x1c = (g) => Math.max(0, Math.min(W, x1(g)));
  const within = (a, b) => [Math.max(a, z0), Math.min(b, z1)];

  const band = svg.append('g').attr('class', 'exon-band');
  const poly = (points, fill) => band.append('polygon').attr('points', points.map((p) => p.join(',')).join(' '))
    .attr('fill', fill).attr('fill-opacity', 0.16).attr('stroke', fill).attr('stroke-opacity', 0.45).attr('stroke-width', 0.75);
  const x2c = (c) => Math.max(0, Math.min(W, x2(c)));
  const visible = exons.filter((e) => e.end >= z0 && e.start <= z1);
  const segments = zoomed && visible.length <= 30
    ? visible.map((e) => e.exon)
    : [...new Set(cols.filter((c) => c.region === 'cds' || c.region === '5utr' || c.region === '3utr').map((c) => c.exon))];
  for (const n of segments) {
    const e = exonByNumber.get(n);
    if (e.codingLength > 0) {
      const [a, b] = zoomed ? within(e.codingStart, e.codingEnd) : [e.codingStart, e.codingEnd];
      if (a <= b) {
        const ca = e.cStart + (a - e.codingStart);
        const cb = e.cStart + (b - e.codingStart);
        poly([[x1c(a), t1b], [x1c(b + 1), t1b], [x2c(cb), t2], [x2c(ca - 1), t2]], COLOR.coding);
      }
    }
  }
  const introns = zoomed && visible.length <= 30
    ? exons.slice(0, -1).map((e, i) => [e, exons[i + 1]]).filter(([a, b]) => b.start - 1 >= z0 && a.end + 1 <= z1)
    : [...new Set(cols.filter((c) => c.region === 'intron').map((c) => c.after))].map((n) => [exonByNumber.get(n), exonByNumber.get(n + 1)]);
  for (const [a, b] of introns) {
    const [s, t] = zoomed ? within(a.end + 1, b.start - 1) : [a.end + 1, b.start - 1];
    if (a.cEnd >= cr.c0 - 1 && a.cEnd <= cr.c1) poly([[x1c(s), t1b], [x1c(t + 1), t1b], [x2c(a.cEnd), t2]], '#888');
  }

  const [bs, be] = within(span.start, span.end);
  svg.append('line').attr('class', 'p1-intron').attr('x1', x1c(bs)).attr('x2', x1c(be + 1)).attr('y1', t1 + h1 / 2)
    .attr('y2', t1 + h1 / 2).attr('stroke', COLOR.intron).attr('stroke-width', 1);
  const track1 = svg.append('g');
  for (const e of visible) {
    if (e.codingLength > 0) {
      const [a, b] = within(e.codingStart, e.codingEnd);
      if (a <= b) {
        track1.append('rect').attr('class', 'p1-coding').attr('x', x1(a)).attr('width', x1(b + 1) - x1(a)).attr('y', t1)
          .attr('height', h1).attr('fill', COLOR.coding);
      }
    }
    const utr = e.codingLength > 0 ? [[e.start, e.codingStart - 1], [e.codingEnd + 1, e.end]] : [[e.start, e.end]];
    for (const [u0, u1] of utr) {
      const [a, b] = within(u0, u1);
      if (b < a) continue;
      track1.append('rect').attr('class', 'p1-utr').attr('x', x1(a)).attr('width', x1(b + 1) - x1(a)).attr('y', t1 + 0.5)
        .attr('height', h1 - 1).attr('fill', '#fff').attr('stroke', COLOR.coding).attr('stroke-width', 0.75);
    }
    const [a, b] = within(e.start, e.end);
    if (x1(b + 1) - x1(a) >= 44) put(`exon ${e.exon}`, (x1(a) + x1(b + 1)) / 2, ly, 'exon-svg-tick', 'middle');
  }
  for (const [a, b] of exons.slice(0, -1).map((e, i) => [e, exons[i + 1]])) {
    const [s, t] = within(a.end + 1, b.start - 1);
    if (t >= s && x1(t + 1) - x1(s) >= 58) put(`intron ${a.exon}`, (x1(s) + x1(t + 1)) / 2, ly, 'exon-svg-tick exon-svg-intron', 'middle');
  }
  for (const v of x1.ticks(Math.max(2, Math.floor(W / 150)))) {
    if (!inView(v) || x1(v) < 40 || x1(v) > W - 40) continue;
    svg.append('line').attr('class', 'p1-position').attr('x1', x1(v + 0.5)).attr('x2', x1(v + 0.5)).attr('y1', t1b)
      .attr('y2', t1b + 3).attr('stroke', '#999');
    put(fmt(v), x1(v + 0.5), ty, 'exon-svg-tick p1-position', 'middle');
  }

  const track2 = svg.append('g');
  const perBase = W / (cr.c1 - cr.c0 + 1);
  coding.forEach((e, i) => {
    const a = Math.max(e.cStart, cr.c0);
    const b = Math.min(e.cEnd, cr.c1);
    if (a > b) return;
    track2.append('rect').attr('class', 'p2-coding').attr('x', x2(a - 1)).attr('width', x2(b) - x2(a - 1)).attr('y', t2)
      .attr('height', h2).attr('fill', i % 2 ? COLOR.codingAlt : COLOR.coding);
    if (perBase < 3 && x2(b) - x2(a - 1) >= 52) put(`exon ${e.exon}`, (x2(a - 1) + x2(b)) / 2, t2 + 13, 'exon-svg-tick exon-svg-onribbon', 'middle');
  });
  if (perBase >= 3) {
    for (let k = Math.ceil((cr.c0 - 1) / 3) * 3; k <= cr.c1; k += 3) {
      track2.append('line').attr('x1', x2(k)).attr('x2', x2(k)).attr('y1', t2).attr('y2', t2 + h2)
        .attr('stroke', '#fff').attr('stroke-width', 1).attr('stroke-opacity', 0.8);
    }
  }
  coding.filter((e) => e.splitsAtEnd && e.cEnd >= cr.c0 - 1 && e.cEnd <= cr.c1).forEach((e) => {
    track2.append('line').attr('x1', x2(e.cEnd)).attr('x2', x2(e.cEnd)).attr('y1', t2 - 4).attr('y2', t2 + h2 + 4)
      .attr('stroke', COLOR.split).attr('stroke-width', 1);
  });
  if (cr.joint != null) {
    const xj = x2(cr.joint);
    svg.append('line').attr('x1', xj).attr('x2', xj).attr('y1', t2 - 6).attr('y2', t2 + h2 + 6)
      .attr('stroke', '#555').attr('stroke-width', 1.5).attr('stroke-dasharray', '3 2');
    const where = model.locate(Math.round((z0 + z1) / 2)).region;
    clampText(where === 'intron' ? 'spliced out here' : where === '5utr' ? 'the coding sequence starts here'
      : where === '3utr' ? 'the coding sequence ends here' : 'joins here', xj, t2 - 9, 'exon-svg-tick', 10, 400);
  }

  const ry = t2 + h2 + 12;
  const rx = (r) => x2(3 * r - 1.5);
  const r0 = Math.max(1, Math.ceil(cr.c0 / 3));
  const r1 = Math.min(model.residues, Math.ceil(cr.c1 / 3));
  if (r1 >= r0) {
    svg.append('line').attr('class', 'p2-ruler').attr('x1', Math.max(0, rx(r0))).attr('x2', Math.min(W, rx(r1)))
      .attr('y1', ry).attr('y2', ry).attr('stroke', '#999').attr('stroke-width', 1);
    const ticks = d3.scaleLinear([r0, r1], [0, W]).ticks(Math.max(2, Math.floor(W / 90)))
      .filter((r) => Number.isInteger(r) && r > r0 && r < r1 && rx(r) - rx(r0) > 40 && rx(r1) - rx(r) > 44);
    for (const r of [r0, ...ticks, r1]) {
      svg.append('line').attr('class', 'p2-ruler').attr('x1', rx(r)).attr('x2', rx(r)).attr('y1', ry - 3).attr('y2', ry + 3)
        .attr('stroke', '#999');
      put(fmt(r), Math.max(0, Math.min(W, rx(r))), ry + 14, 'exon-svg-tick p2-ruler', r === r0 ? 'start' : r === r1 ? 'end' : 'middle');
    }
  }
  y = ry + 14;
  para(`Residue numbers, as in ${canonical(model).accession}`, 'exon-svg-axis p2-ruler', 10);
  y += 8;
  para('2 · The coding bases alone, joined end to end', 'exon-svg-title', 12, 600);
  para(zoomed
    ? (cr.joint == null
      ? `The coding bases c.${cr.c0} to c.${cr.c1} of ${header.transcript.refseq}, the ones inside the stretch above, `
        + 'joined as splicing joins them. ' + (perBase >= 3
        ? 'White lines mark codons, and an orange tick marks an exon that ends part-way through one.'
        : 'An orange tick marks an exon that ends part-way through a codon; zoom in further to see the codons.')
      : 'The stretch above holds no coding bases. Shown are the coding bases either side of the point where it would join them.')
    : `Introns removed: these bases are not next to each other on the chromosome. The ${fmt(fig.coding_bases)} coding `
      + `bases make ${fmt(fig.residues)} residues, numbered as in ${canonical(model).accession}; an orange tick marks each `
      + `of the ${fig.split_codons} exons that end part-way through a codon.`, 'exon-svg-note', 11);

  const mark = (g, color, width, label) => {
    const loc = model.locate(g);
    if (inView(g)) {
      const x = x1(g + 0.5);
      svg.append('line').attr('class', 'mark-p1').attr('x1', x).attr('x2', x).attr('y1', t1 - 5).attr('y2', t1b + 3)
        .attr('stroke', color).attr('stroke-width', width);
      if (label) clampText(label, x, labelY, 'exon-svg-mark', 11);
    }
    const c = loc.region === 'cds' ? loc.c - 0.5 : loc.region === 'intron' ? exonByNumber.get(loc.after).cEnd
      : loc.region === '5utr' ? 0 : loc.region === '3utr' ? cds : null;
    if (c != null && c >= cr.c0 - 1 && c <= cr.c1) {
      svg.append('line').attr('class', 'mark-p2').attr('x1', x2(c)).attr('x2', x2(c)).attr('y1', t2 - 7)
        .attr('y2', t2 + h2 + 7).attr('stroke', color).attr('stroke-width', width);
    }
  };
  for (const g of view.anchors) mark(g, COLOR.mark, 1.5, g === markOf(view) ? markerLabel(model, view) : null);
  if (state.pinned != null) mark(state.pinned, '#222', 1.5, null);
  const guide1 = svg.append('line').attr('class', 'exon-guide').attr('y1', t1 - 5).attr('y2', t1b + 3).attr('visibility', 'hidden');
  const guide2 = svg.append('line').attr('class', 'exon-guide').attr('y1', t2 - 7).attr('y2', t2 + h2 + 7).attr('visibility', 'hidden');

  svg.attr('height', y + 6).attr('viewBox', `0 0 ${W} ${y + 6}`);
  box.replaceChildren(svg.node());
  return {
    positionAt(event) {
      const rect = svg.node().getBoundingClientRect();
      const k = drawnScale(svg.node());
      const px = (event.clientX - rect.left) / k;
      const py = (event.clientY - rect.top) / k;
      if (px < 0 || px > W) return null;
      if (py >= t1 - 12 && py <= bt) return Math.max(z0, Math.min(z1, Math.floor(x1.invert(px))));
      if (py >= t2 - 10 && py <= ry + 8) {
        const c = Math.max(cr.c0, Math.min(cr.c1, Math.floor(x2.invert(px)) + 1));
        return model.genomeOfC(c);
      }
      return null;
    },
    guide(g) {
      const loc = g == null ? null : model.locate(g);
      guide1.attr('visibility', g != null && inView(g) ? 'visible' : 'hidden');
      if (g != null) guide1.attr('x1', x1(g + 0.5)).attr('x2', x1(g + 0.5));
      const c = loc && loc.region === 'cds' ? loc.c - 0.5 : null;
      guide2.attr('visibility', c != null && c >= cr.c0 - 1 && c <= cr.c1 ? 'visible' : 'hidden');
      if (c != null) guide2.attr('x1', x2(c)).attr('x2', x2(c));
    },
  };
}

const CELL = 14;
const OVERSCAN = 60;
const TRACK_LANES = {
  exonic: [
    { id: 'ruler', label: 'c.', height: 18 },
    { id: 'base', label: 'base', height: 22 },
    { id: 'aa', label: 'amino acid', height: 20 },
    { id: 'resno', label: 'residue', height: 16 },
  ],
  genomic: [
    { id: 'ruler', label: 'GRCh38', height: 18 },
    { id: 'base', label: 'base', height: 22 },
  ],
};

function trackText(model, mode) {
  const s = model.header.sequences;
  if (mode === 'genomic') {
    return `${s.genomic_span.what}: ${fmt(s.genomic_span.length)} bases, one to a cell. Intron bases are grey. Codons and `
      + 'amino acids are shown with the exons joined, because a codon can be split by an intron.';
  }
  return `${s.exonic.what.split(':')[0]}: ${fmt(s.exonic.length)} bases, one to a cell. In the coding sequence each codon `
    + 'is shaded, with its amino acid beneath it, and the stop codon marked as such; every tenth residue is numbered. '
    + 'Untranslated bases have no codon.';
}

function createTrack(host, model, { onPoint, onPin }) {
  const root = el('div', 'seq-track');
  const labels = el('div', 'seq-labels');
  labels.setAttribute('aria-hidden', 'true');
  const scroller = el('div', 'seq-scroll');
  scroller.tabIndex = 0;
  scroller.dataset.control = 'click';
  scroller.setAttribute('role', 'region');
  const inner = el('div', 'seq-inner');
  const cells = el('div', 'seq-cells');
  const hoverBand = el('div', 'seq-band hover');
  const pinBand = el('div', 'seq-band pin');
  const targetBand = el('div', 'seq-band target');
  const junction = el('div', 'seq-junction');
  const junctionLabel = el('span', 'seq-junction-label');
  junction.append(junctionLabel);
  inner.append(cells, hoverBand, pinBand, targetBand, junction);
  scroller.append(inner);
  root.append(labels, scroller);
  host.replaceChildren(root);

  const t = { tm: null, lanes: null, top: {}, bandHeight: 0, drawn: [-1, -1], hover: null, pin: null,
    anchors: new Set(), followed: undefined, target: null, change: null, marks: null };
  const place = (band, i) => {
    band.hidden = i == null;
    if (i != null) band.style.left = `${i * CELL}px`;
  };

  function layout() {
    const lanes = [];
    for (const lane of TRACK_LANES[t.tm.mode]) {
      lanes.push(lane);
      if (t.change && lane.id === 'base') lanes.push({ id: 'change', label: '→ base', height: 22 });
      if (t.change && lane.id === 'aa') lanes.push({ id: 'newaa', label: '→ amino acid', height: 20 });
    }
    t.lanes = lanes;
    t.top = {};
    let y = 0;
    for (const lane of lanes) {
      t.top[lane.id] = y;
      y += lane.height;
    }
    t.bandHeight = lanes.filter((lane) => ['base', 'change', 'aa', 'newaa'].includes(lane.id))
      .reduce((s, lane) => s + lane.height, 0);
    labels.replaceChildren(...lanes.map((lane) => {
      const d = el('div', null, lane.label);
      d.style.height = `${lane.height}px`;
      return d;
    }));
    inner.style.height = `${y}px`;
    if (t.top.aa != null) cells.style.setProperty('--codon-reach', `${t.top.aa - t.top.base}px`);
    for (const band of [hoverBand, pinBand, targetBand]) {
      band.style.top = `${t.top.base}px`;
      band.style.height = `${t.bandHeight}px`;
    }
  }

  function setChange(change) {
    if (change === t.change) return;
    t.change = change;
    t.marks = null;
    layout();
    draw(true);
  }

  function setMode(mode) {
    t.tm = trackModel(model, mode);
    layout();
    inner.style.width = `${t.tm.length * CELL}px`;
    place(targetBand, t.target == null ? null : t.tm.indexOf(t.target));
    junction.style.height = `${t.top.base}px`;
    scroller.setAttribute('aria-label', `Panel 3: ${mode === 'exonic' ? 'the exons joined' : 'the genomic stretch, introns '
      + 'included'}, one base to a cell. The arrow keys move the pin one base, or three with Shift; Enter pins; Escape `
      + 'unpins.');
    root.dataset.mode = mode;
    t.drawn = [-1, -1];
    t.hover = null;
    t.marks = null;
    t.followed = undefined;
  }

  function draw(force = false) {
    const { tm } = t;
    const first = Math.max(0, Math.floor(scroller.scrollLeft / CELL) - OVERSCAN);
    const last = Math.min(tm.length - 1, Math.ceil((scroller.scrollLeft + scroller.clientWidth) / CELL) + OVERSCAN);
    if (!force && first >= t.drawn[0] && last <= t.drawn[1]) return;
    const a = Math.max(0, first - OVERSCAN);
    const b = Math.min(tm.length - 1, last + OVERSCAN);
    const exonic = tm.mode === 'exonic';
    const nearFeature = (i, reach) => {
      for (let k = i - reach; k <= i + reach; k += 1) if (tm.featureAt(k)) return true;
      return false;
    };
    const html = [];
    if (t.change && !t.marks) t.marks = changeMarks(model, tm, t.change);
    if (t.change) {
      for (const m of t.marks.bases) {
        if (m.i < a || m.i > b) continue;
        html.push(`<span class="${m.cls}" data-i="${m.i}" data-g="${m.g}"${m.title ? ` title="${m.title}"` : ''} `
          + `style="left:${m.x}px;top:${t.top.change}px">${m.text}</span>`);
      }
      for (const m of t.marks.codons) {
        if (m.left + m.width < a * CELL || m.left > (b + 1) * CELL) continue;
        if (m.inserted) {
          html.push(`<span class="seq-newaa inserted" data-i="${m.i}" data-codon="${m.k}" data-count="${m.count}"`
            + `${m.title ? ` title="${m.title}"` : ''} style="left:${m.left}px;top:${t.top.newaa}px">${m.text}</span>`);
          continue;
        }
        html.push(`<span class="seq-newaa${m.stop ? ' stop' : ''}" data-i="${Math.floor(m.left / CELL)}" data-codon="${m.k}" `
          + `style="left:${m.left}px;top:${t.top.newaa}px;width:${m.width}px">${m.text}</span>`);
      }
    }
    for (let i = a; i <= b; i += 1) {
      const x = i * CELL;
      const g = tm.genomeAt(i);
      const loc = model.locate(g);
      const cls = ['seq-base'];
      if (loc.region === 'cds') cls.push(exonic ? (loc.codon % 2 ? 'odd' : 'even') : 'cds');
      else cls.push(loc.region === 'intron' ? 'intron' : 'utr');
      if (t.anchors.has(g)) cls.push('anchor');
      html.push(`<span class="${cls.join(' ')}" data-i="${i}" data-g="${g}" style="left:${x}px;top:${t.top.base}px">`
        + `${model.baseAt(g)}</span>`);
      if (tm.edgeAfter(i)) {
        html.push(`<span class="seq-edge${tm.splitAfter(i) ? ' split' : ''}" data-after="${i}" `
          + `style="left:${x + CELL - 1}px;top:${t.top.base - 3}px;height:${t.bandHeight + 3}px"></span>`);
      }
      const feature = tm.featureAt(i);
      if (feature) {
        html.push(`<span class="seq-feature" data-i="${i}" style="left:${x}px;top:${t.top.ruler}px">${feature.kind} `
          + `${feature.n}</span>`);
      } else if (exonic ? Number(/(\d+)$/.exec(model.cName(g))[1]) % 10 === 0 && !nearFeature(i, 4) : g % 10 === 0 && !nearFeature(i, 6)) {
        html.push(`<span class="seq-tick" data-i="${i}" style="left:${x}px;top:${t.top.ruler}px">`
          + `${exonic ? model.cName(g) : fmt(g)}</span>`);
      }
      if (exonic && loc.region === 'cds' && loc.codonPos === 1) {
        const aa = loc.residue ? model.aaAt(loc.residue) : null;
        html.push(`<span class="seq-aa ${loc.codon % 2 ? 'odd' : 'even'}${aa ? '' : ' stop'}" data-i="${i}" `
          + `data-codon="${loc.codon}" style="left:${x}px;top:${t.top.aa}px;width:${3 * CELL}px">${aa ?? 'stop'}</span>`);
        if (aa && loc.residue % 10 === 0) {
          html.push(`<span class="seq-resno" data-i="${i}" style="left:${x}px;top:${t.top.resno}px;width:${3 * CELL}px">`
            + `${loc.residue}</span>`);
        }
      }
    }
    cells.innerHTML = html.join('');
    t.drawn = [a, b];
  }

  const middle = () => Math.max(0, Math.min(t.tm.length - 1,
    Math.floor((scroller.scrollLeft + scroller.clientWidth / 2) / CELL)));
  const centre = (i) => { scroller.scrollLeft = i * CELL - (scroller.clientWidth - CELL) / 2; };
  const reveal = (i) => {
    const x = i * CELL;
    if (x < scroller.scrollLeft) scroller.scrollLeft = x - 2 * CELL;
    else if (x + CELL > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = x + 3 * CELL - scroller.clientWidth;
  };

  function show({ pinned, anchors, followed, center, force = false }) {
    const { tm } = t;
    t.anchors = new Set(anchors);
    t.pin = pinned == null ? null : tm.indexOf(pinned);
    place(pinBand, t.pin);
    const j = followed != null && tm.indexOf(followed) == null ? tm.junctionOf(followed) : null;
    junction.hidden = j == null;
    if (j != null) {
      junction.style.left = `${(j + 1) * CELL - 1}px`;
      junction.classList.toggle('example', pinned == null);
      junctionLabel.textContent = `intron ${model.locate(followed).after} removed here`;
    }
    const target = followed == null ? null : tm.indexOf(followed) ?? j;
    if (target != null && (force || (center && followed !== t.followed))) centre(target);
    else if (!center && t.pin != null) reveal(t.pin);
    t.followed = followed;
    draw(true);
  }

  function hoverAt(g) {
    t.hover = g == null ? null : t.tm.indexOf(g);
    place(hoverBand, t.hover);
  }

  function goTo(g, align = 'centre') {
    t.target = g;
    const i = g == null ? null : t.tm.indexOf(g);
    place(targetBand, i);
    if (i != null) {
      if (align === 'start') scroller.scrollLeft = (i - 2) * CELL;
      else centre(i);
    }
    draw(true);
    return i != null;
  }

  function reference() {
    const i = t.target == null ? null : t.tm.indexOf(t.target);
    const inView = i != null && i * CELL >= scroller.scrollLeft && (i + 1) * CELL <= scroller.scrollLeft + scroller.clientWidth;
    return inView ? t.target : t.tm.genomeAt(middle());
  }

  let frame = 0;
  scroller.addEventListener('scroll', () => {
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    }
  });
  const cellAt = (event) => {
    const x = (event.clientX - scroller.getBoundingClientRect().left) / drawnScale(scroller);
    const i = Math.floor((x + scroller.scrollLeft) / CELL);
    return i >= 0 && i < t.tm.length ? i : null;
  };
  scroller.addEventListener('pointermove', (event) => {
    const i = cellAt(event);
    if (i === t.hover) return;
    t.hover = i;
    place(hoverBand, i);
    onPoint(i == null ? null : t.tm.genomeAt(i));
  });
  scroller.addEventListener('pointerleave', () => {
    t.hover = null;
    place(hoverBand, null);
    onPoint(null);
  });
  scroller.addEventListener('click', (event) => {
    const i = event.detail === 0 ? middle() : cellAt(event);
    if (i != null) onPin(t.tm.genomeAt(i));
  });
  scroller.addEventListener('keydown', (event) => {
    const from = t.pin ?? middle();
    const step = event.shiftKey ? 3 : 1;
    let i = null;
    if (event.key === 'ArrowRight') i = from + step;
    else if (event.key === 'ArrowLeft') i = from - step;
    else if (event.key === 'Home') i = 0;
    else if (event.key === 'End') i = t.tm.length - 1;
    else if (event.key === 'Enter' || event.key === ' ') i = from;
    else if (event.key === 'Escape') {
      event.preventDefault();
      onPin(null);
      return;
    } else return;
    event.preventDefault();
    onPin(t.tm.genomeAt(Math.max(0, Math.min(t.tm.length - 1, i))));
  });

  setMode('exonic');
  place(hoverBand, null);
  place(pinBand, null);
  junction.hidden = true;
  return {
    get mode() { return t.tm.mode; },
    get target() { return t.target; },
    has: (g) => t.tm.indexOf(g) != null,
    setMode,
    setChange,
    show,
    hoverAt,
    goTo,
    reference,
    redraw: () => draw(true),
    get model() { return t.tm; },
    scroller,
    cell: CELL,
    drawn: () => [...t.drawn],
  };
}

const SHOWN_INSERT = 12;
const shortInsert = (s) => (s.length <= SHOWN_INSERT ? s : `${s.slice(0, SHOWN_INSERT - 3)}…`);
function changeMarks(model, tm, change) {
  const cell = (g) => tm.indexOf(g);
  const bases = [];
  for (const [g, base] of change.replaced) {
    const i = cell(g);
    if (i != null) bases.push({ i, g, x: i * CELL, text: base, cls: 'seq-change' });
  }
  for (const g of change.removed) {
    const i = cell(g);
    if (i != null) bases.push({ i, g, x: i * CELL, text: '–', cls: 'seq-change removed' });
  }
  if (change.inserted) {
    const i = cell(change.inserted.after);
    if (i != null) {
      bases.push({ i, g: change.inserted.after, x: (i + 1) * CELL, text: `+${shortInsert(change.inserted.bases)}`,
        cls: 'seq-change inserted',
        title: change.inserted.bases.length > SHOWN_INSERT ? `${change.inserted.bases.length} bases inserted` : null });
    }
  }
  const codons = [];
  if (tm.mode === 'exonic') {
    const list = change.newCodons;
    for (let n = 0; n < list.length; n += 1) {
      const [k, aa, origins] = list[n];
      if (origins.every(([, j]) => j > 0)) {
        const after = origins[0][0];
        const run = [];
        for (; n < list.length && list[n][2].every(([g, j]) => j > 0 && g === after); n += 1) run.push(list[n]);
        n -= 1;
        const i = cell(after);
        if (i == null) continue;
        const letters = run.filter(([, a]) => a !== '*').map(([, a]) => a).join('');
        const stop = run[run.length - 1][1] === '*';
        codons.push({ k: run[0][0], count: run.length, inserted: true, i, left: (i + 1) * CELL, width: 0,
          text: `+${shortInsert(letters)}${stop ? `${letters ? ' ' : ''}stop` : ''}`,
          title: letters.length > SHOWN_INSERT ? `${run.length} codons of inserted bases` : null });
        continue;
      }
      const xs = origins.map(([g, j]) => {
        const i = cell(g);
        return i == null ? null : j > 0 ? [(i + 1) * CELL, (i + 1) * CELL] : [i * CELL, (i + 1) * CELL];
      }).filter(Boolean);
      if (!xs.length) continue;
      let left = Math.min(...xs.map(([x0]) => x0));
      let right = Math.max(...xs.map(([, x1]) => x1));
      if (right - left < CELL) {
        const mid = (left + right) / 2;
        left = mid - CELL / 2;
        right = mid + CELL / 2;
      }
      codons.push({ k, left, width: right - left, text: aa === '*' ? 'stop' : aa, stop: aa === '*' });
    }
    if (change.startUnknown) {
      const i = cell(model.genomeOfC(1));
      if (i != null) codons.push({ k: 1, left: i * CELL, width: 3 * CELL, text: '?', stop: false });
    }
  }
  return { bases, codons };
}

function firstChangedCodon(model, change) {
  if (change.startUnknown) return { codon: 1, altCodon: change.kind === 'substitution' ? change.altCodon : null, altName: '?' };
  if (!change.newCodons.length) return { codon: null, altCodon: null, altName: null };
  const [k, aa, origins] = change.newCodons[0];
  return { codon: k, altCodon: codonBasesOf(model, change, origins), altName: aa === '*' ? 'stop' : AMINO[aa] };
}

function drawZoom(scroller, model, view, cols, change = null) {
  const anchors = new Set(view.anchors);
  const v = model.header.variant;
  const shown = change
    ? { replaced: new Map(change.replaced), removed: new Set(change.removed), inserted: change.inserted, ...firstChangedCodon(model, change) }
    : v ? { replaced: new Map([[v.genome_pos, v.alt_base]]), removed: new Set(), inserted: null, codon: v.codon_number,
      altCodon: v.alt_codon, altName: AMINO[v.alt_aa] } : null;
  const table = el('table', 'exon-table');
  const body = el('tbody');
  table.append(body);
  const lane = (name, qualifier, cls) => {
    const tr = el('tr', cls);
    const th = el('th');
    th.scope = 'row';
    th.append(el('span', 'lane-name', name));
    if (qualifier) th.append(el('span', 'lane-qual', qualifier));
    tr.append(th);
    body.append(tr);
    return tr;
  };
  const cellClass = (col) => [col.kind === 'gap' ? 'gap' : '', `r-${col.region}`, col.kind === 'position' && anchors.has(col.g) ? 'anchor' : '']
    .filter(Boolean).join(' ');
  const merged = (tr, groups, render) => {
    for (const group of groups) {
      const td = el('td');
      td.colSpan = group.cols.length;
      render(td, group);
      tr.append(td);
    }
  };
  const runs = (keyOf) => {
    const out = [];
    for (const col of cols) {
      const k = keyOf(col);
      const last = out[out.length - 1];
      if (last && last.key === k) last.cols.push(col);
      else out.push({ key: k, cols: [col] });
    }
    return out;
  };
  const segment = (col) => (col.region === 'intron' ? `intron:${col.after}`
    : col.region === 'outside' ? 'outside' : col.region === 'mixed' ? 'mixed' : `exon:${col.exon}`);

  merged(lane('exon', null, 'lane-exon'), runs(segment), (td, group) => {
    const col = group.cols[0];
    td.className = `seg r-${col.region}`;
    const intron = group.cols.map((c) => c.row && c.row.intron_number).find(Boolean);
    td.textContent = col.region === 'intron'
      ? `${intron ? `intron ${intron}, ` : 'intron '}between exons ${col.after} and ${col.before}`
      : col.region === 'outside' ? 'outside the transcript' : col.region === 'mixed' ? '' : `exon ${col.exon}`;
  });

  const baseRow = lane('base', null, 'lane-base');
  const genomeRow = lane('GRCh38', `chr${model.header.chromosome}`, 'lane-genome');
  const cRow = lane('c.', model.header.transcript.refseq, 'lane-c');
  for (const col of cols) {
    const base = el('td', cellClass(col));
    const genome = el('td', cellClass(col));
    const c = el('td', cellClass(col));
    if (col.kind === 'gap') {
      base.textContent = '…';
      genome.textContent = '…';
      genome.title = `${fmt(col.from)} to ${fmt(col.to)}`;
      c.textContent = '…';
    } else {
      genome.textContent = fmt(col.g);
      const row = col.row;
      if (row && row.genome_base) {
        const states = row.ref_base_states;
        const state = states && col.codonPos ? STATE[states[col.codonPos - 1]] : 'read';
        base.textContent = state === 'open' ? '?' : row.genome_base;
        base.classList.add(`b-${state}`);
      } else if (model.baseAt(col.g)) {
        base.textContent = model.baseAt(col.g);
        base.classList.add('b-read');
      } else if (col.region === 'intron' || col.region === 'outside') {
        base.textContent = '';
      } else {
        base.textContent = '·';
        base.classList.add('b-absent');
      }
      if (shown) {
        const alt = shown.replaced.get(col.g);
        if (alt) base.append(el('span', 'alt', `→${alt}`));
        else if (shown.removed.has(col.g)) base.append(el('span', 'alt', '→–'));
        if (shown.inserted && col.g === shown.inserted.after) base.append(el('span', 'alt', ` +${shortInsert(shown.inserted.bases)}`));
      }
      c.textContent = model.cName(col.g) ?? '—';
    }
    baseRow.append(base);
    genomeRow.append(genome);
    cRow.append(c);
  }

  const codonKey = (col) => (col.kind === 'position' && col.region === 'cds' ? `codon:${col.codon}` : `none:${segment(col)}`);
  const groups = runs(codonKey);
  const codonRuns = new Map();
  groups.forEach((g) => { if (g.key.startsWith('codon:')) codonRuns.set(g.key, (codonRuns.get(g.key) || 0) + 1); });
  const rowFor = (group) => group.cols.map((c) => c.row).find((r) => r && r.ref_codon);
  merged(lane('codon', null, 'lane-codon'), groups, (td, group) => {
    if (!group.key.startsWith('codon:')) {
      td.className = `nocodon r-${group.cols[0].region}`;
      td.textContent = '—';
      return;
    }
    const split = codonRuns.get(group.key) > 1;
    td.className = `codon${split ? ' split' : ''}${group.cols.some((c) => anchors.has(c.g)) ? ' anchor-group' : ''}`;
    const row = rowFor(group);
    td.append(el('span', 'codon-number', `codon ${group.cols[0].codon}`));
    const codonSeq = model.codonBases(group.cols[0].codon) || (row ? row.ref_codon : null);
    if (codonSeq) {
      const bases = el('span', 'codon-bases', codonSeq);
      if (shown && shown.altCodon && group.cols[0].codon === shown.codon) bases.append(el('span', 'alt', ` → ${shown.altCodon}`));
      td.append(bases);
    }
    if (split) td.append(el('span', 'codon-split', 'split'));
  });
  merged(lane('residue', canonical(model).accession, 'lane-residue'), groups, (td, group) => {
    const col = group.cols[0];
    if (!group.key.startsWith('codon:')) {
      td.className = `nores r-${col.region}`;
      td.textContent = col.region === 'outside' ? 'not transcribed' : 'no residue';
      return;
    }
    td.className = `residue${group.cols.some((c) => anchors.has(c.g)) ? ' anchor-group' : ''}`;
    if (col.residue == null) {
      td.textContent = 'stop, no residue';
      if (shown && shown.altName && col.codon === shown.codon) td.append(el('span', 'alt', ` → ${shown.altName}`));
      return;
    }
    td.append(el('span', 'residue-number', String(col.residue)));
    const row = group.cols.map((c) => c.row).find((r) => r && r.ref_aa);
    const aaLetter = model.aaAt(col.residue) || (row ? row.ref_aa : null);
    if (aaLetter && AMINO[aaLetter]) {
      const name = el('span', 'residue-name', AMINO[aaLetter]);
      if (shown && shown.altName && col.codon === shown.codon) name.append(el('span', 'alt', ` → ${shown.altName}`));
      td.append(name);
    }
  });

  scroller.replaceChildren(table);
  const first = table.querySelector('.lane-genome td.anchor');
  if (first) {
    const label = table.querySelector('.lane-genome th').offsetWidth;
    const lastAnchor = [...table.querySelectorAll('.lane-genome td.anchor')].pop();
    const middle = (first.offsetLeft + lastAnchor.offsetLeft + lastAnchor.offsetWidth) / 2;
    scroller.scrollLeft = Math.max(0, middle - label - (scroller.clientWidth - label) / 2);
  }
}

function readingText(model, view, cols) {
  if (view.id === 'pin') return pinnedText(model, view.anchors[0]);
  const rows = rowsOf(model, view);
  const at = (g) => model.locate(g);
  const aa = (row) => (row && AMINO[row.ref_aa] ? `, ${AMINO[row.ref_aa]}` : '');
  const anAa = (row) => {
    const name = row && AMINO[row.ref_aa];
    return name ? `, ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}` : '';
  };
  if (view.id === 'variant') {
    const row = rows[0];
    const l = at(view.anchors[0]);
    const codon = row.ref_codon ? ` (${row.ref_codon})` : '';
    const where = `GRCh38 ${fmt(view.anchors[0])} is ${row.c_hgvs} on ${model.header.transcript.refseq}, in exon ${l.exon}: `
      + `base ${l.codonPos} of codon ${l.codon}${codon}, which codes for residue ${l.residue} of `
      + `${canonical(model).accession}${anAa(row)}.`;
    const v = model.header.variant;
    if (!v || !AMINO[v.alt_aa]) return where;
    return `An example of a known variant: ${where} The variant ${v.c_change} changes that base to ${v.alt_base}, so the `
      + `codon becomes ${v.alt_codon} and the residue a ${AMINO[v.alt_aa]}: ${v.p_change} (ClinVar ${v.clinvar_accession_version}).`;
  }
  if (view.id === 'split') {
    const row = rows[0];
    const count = ['no bases', 'one base', 'two bases', 'three bases'];
    const byExon = d3.groups(view.anchors.map((g) => ({ g, ...at(g) })), (p) => p.exon);
    const parts = byExon.map(([exon, ps]) => {
      const cs = ps.map((p) => `c.${p.c}`).join(' and ');
      const gs = ps.map((p) => fmt(p.g)).join(' and ');
      return `${count[ps.length]}, ${cs}, in exon ${exon} (GRCh38 ${gs})`;
    });
    return `An example of a split codon: codon ${row.codon_number}${row.ref_codon ? ` (${row.ref_codon}${aa(row)})` : ''} `
      + `has ${parts.join(', and ')}. Splicing removes the intron between them and so joins the three bases into one codon.`;
  }
  if (view.id === 'intron') {
    const l = at(view.anchors[0]);
    const a = model.exonByNumber.get(l.after);
    const b = model.exonByNumber.get(l.before);
    const n = model.rowAt.get(view.anchors[0]).intron_number;
    const where = (g) => (g === a.end + 1 ? 'the first base of the intron' : g === b.start - 1 ? 'its last base' : 'inside it');
    const named = view.anchors.map((g) => `GRCh38 ${fmt(g)}, ${where(g)}, is ${model.rowAt.get(g).c_hgvs}`).join('; ');
    return `An example of positions inside an intron: ${named}. ${n ? `Intron ${n}` : 'The intron'} lies between exons `
      + `${l.after} and ${l.before}, and splicing removes it, so its positions have a name in the transcript's coordinates `
      + 'but no codon and no residue.';
  }
  const row = rows[0];
  const g = view.anchors[0];
  const l = at(g);
  const e = model.exonByNumber.get(l.exon);
  const edge = g === e.start ? `the first base of exon ${l.exon}` : `in exon ${l.exon}`;
  const side = row.region === '5utr'
    ? `before the coding sequence, which starts at c.1 (GRCh38 ${fmt(model.cdsStart)})`
    : `after the coding sequence, which ends at c.${model.cds} (GRCh38 ${fmt(model.cdsEnd)}), the stop codon's last base`;
  return `An example of an untranslated position: GRCh38 ${fmt(g)} is ${row.c_hgvs}, ${edge}. It lies ${side}, so it is `
    + 'part of the transcript but makes no residue.';
}

function pinnedText(model, g) {
  const tx = model.header.transcript.refseq;
  const l = model.locate(g);
  if (l.region === 'cds') {
    const bases = model.codonBases(l.codon);
    const head = `Pinned: GRCh38 ${fmt(g)} is c.${l.c} on ${tx}, in exon ${l.exon}: base ${l.codonPos} of codon ${l.codon}`
      + `${bases ? ` (${bases})` : ''}`;
    if (!l.residue) return `${head}, the stop codon, which ends the protein and makes no residue.`;
    const exonsOf = [...new Set([0, 1, 2].map((k) => model.locate(model.genomeOfC(3 * l.codon - 2 + k)).exon))];
    const name = AMINO[model.aaAt(l.residue)];
    return `${head}, which ${exonsOf.length > 1 ? `is split across exons ${exonsOf.join(' and ')} and ` : ''}codes for `
      + `residue ${l.residue} of ${canonical(model).accession}${name ? `, ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}` : ''}.`;
  }
  if (l.region === 'intron') {
    const a = model.exonByNumber.get(l.after);
    const b = model.exonByNumber.get(l.before);
    const edge = g === a.end + 1 ? 'the first base' : g === b.start - 1 ? 'the last base' : null;
    const between = `between exons ${l.after} and ${l.before}. Splicing removes the intron, so this position has no codon `
      + 'and no residue.';
    return `Pinned: GRCh38 ${fmt(g)} is ${nameOn(model, g)}, ${edge ? `${edge} of` : 'inside'} intron ${l.after}, ${between}`;
  }
  if (l.region === '5utr' || l.region === '3utr') {
    const side = l.region === '5utr'
      ? `before the coding sequence, which starts at c.1 (GRCh38 ${fmt(model.cdsStart)})`
      : `after the coding sequence, which ends at c.${model.cds} (GRCh38 ${fmt(model.cdsEnd)}), the stop codon's last base`;
    const e = model.exonByNumber.get(l.exon);
    return `Pinned: GRCh38 ${fmt(g)} is ${nameOn(model, g)}, ${g === e.start ? `the first base of exon ${l.exon}` : `in exon ${l.exon}`}. `
      + `It lies ${side}, so it is part of the transcript but makes no residue.`;
  }
  return `Pinned: GRCh38 ${fmt(g)} is outside this transcript.`;
}

function notesText(model, view) {
  if (view.id === 'pin') {
    return 'Computed from ChannelScope\'s release: the exon, c. number, codon and residue from its exon table (and, at '
      + `the ${model.highlights.length} highlighted positions, its highlights table), and the bases and amino acid from `
      + 'its sequences.';
  }
  const rows = rowsOf(model, view);
  const bySource = d3.groups(rows, (r) => r.source);
  return `As the release gives them: ${bySource.map(([source, rs]) => `${rs.map((r) => r.c_hgvs).join(', ')} (${source})`).join('; ')}.`;
}

function key(model) {
  const box = el('div', 'exon-key');
  const swatch = (cls, text) => {
    const span = el('span');
    span.append(el('i', cls), text);
    box.append(span);
  };
  swatch('k-coding', 'coding part of an exon');
  swatch('k-utr', 'untranslated part of an exon');
  swatch('k-intron', 'intron');
  swatch('k-split', 'exon ends part-way through a codon');
  swatch('k-mark', 'the chosen example');
  swatch('k-pin', 'a pinned position');
  const states = new Set(['r', ...model.highlights.flatMap((h) => (h.ref_base_states ? [...h.ref_base_states] : []))]);
  const words = { r: 'base read from sequence', f: 'base forced by the genetic code', o: 'base not known' };
  const bases = el('span', 'k-bases');
  for (const s of ['r', 'f', 'o']) {
    if (states.has(s)) bases.append(el('b', `b-${STATE[s]}`, s === 'o' ? '?' : 'C'), ` ${words[s]}`);
  }
  if (!model.sequences) bases.append(el('b', 'b-absent', '·'), ' base not given in this release');
  const v = model.header.variant;
  if (v) bases.append(el('b', 'alt', `→${v.alt_base}`), ' the variant\'s change');
  box.append(bases);
  return box;
}

const USES = {
  exon: ['exon record', 'exon records'],
  transcript: ['transcript record', 'transcript records'],
  gene: ['gene record', 'gene records'],
  gene_locus: ['gene-locus record', 'gene-locus records'],
  numbering: ['numbering record', 'numbering records'],
  protein: ['protein record', 'protein records'],
};
function uses(usedBy) {
  return Object.entries(usedBy || {}).map(([k, n]) => {
    if (k.startsWith('check:')) return `check ${k.slice(6)}`;
    if (k.startsWith('table:')) return `the ${k.slice(6).replace(/_/g, ' ')} table`;
    const [one, many] = USES[k] || [k, k];
    return `${n} ${n === 1 ? one : many}`;
  });
}

function renderSources(box, model, manifest, files, links) {
  if (!box) return;
  const { header } = model;
  const prov = header.provenance;
  const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const time = (iso) => `${iso.slice(11, 16)} UTC`;
  const short = (hash) => hash.replace(/^sha256:/, '').slice(0, 12);
  const shortUrl = (href) => {
    const url = new URL(href);
    return `${url.host}${url.pathname}${url.search.length > 40 ? '?…' : url.search}`;
  };
  box.replaceChildren();
  box.append(el('p', 'sources-title', `Where the data in ${NAME} comes from`));

  const release = el('p');
  const name = (header.release && header.release.name) || manifest.release;
  const supersedes = header.release && header.release.supersedes;
  const table = prov.codon_map_table;
  const map = `${table.rows ? ` (${fmt(table.rows)} rows` : ' ('}${table.rows ? ', ' : ''}SHA-256 ${short(table.checksum)}…)`;
  const base = manifest.built_from && manifest.built_from.release;
  release.append(base
    ? `Drawn from ChannelScope's release ${name}${supersedes ? `, which replaces ${supersedes}` : ''}, built on `
      + `${day(manifest.built_at)} from ${base}'s files, with ${base}'s data and engine unchanged; those were cut from `
      + `ChannelScope's codon map${map}. `
    : `Drawn from ChannelScope's release ${name}${supersedes ? `, which replaces ${supersedes}` : ''}, built on `
      + `${day(manifest.built_at)} from ChannelScope's evidence graph and cut from its codon map${map}. `);
  if (manifest.builder && manifest.inputs) {
    const programs = manifest.builder.sha256_lf ? 1 : Object.keys(manifest.builder).length;
    release.append(`The release's manifest pins the build: the SHA-256 of ${programs === 1 ? 'the program' : `the ${programs} programs`} `
      + `that built it and of each of its ${manifest.inputs.length} inputs. `);
  }
  const verified = files.every((f) => f.status === 'match');
  release.append(verified
    ? `The ${files.length} files match the checksums in that manifest, checked in this browser as the page loaded: `
    : 'The manifest lists these checksums, which this browser could not check: ');
  files.forEach((f, i) => {
    const code = el('code', null, `${f.name} ${short(f.entry.sha256)}…`);
    code.title = f.entry.sha256;
    release.append(code, i < files.length - 1 ? ', ' : '.');
  });
  box.append(release);

  const ids = el('dl', 'sources-ids');
  const item = (term, ...desc) => {
    ids.append(el('dt', null, term));
    const dd = el('dd');
    dd.append(...desc);
    ids.append(dd);
  };
  const can = canonical(model);
  const tw = twin(model);
  const others = header.numberings.filter((n) => n.accession.startsWith(can.accession.split('-')[0]) && n.accession !== can.accession);
  item('Gene', `${header.gene.symbol}, ${header.gene.id}`);
  item('Genome', `${header.assembly}, chromosome ${header.chromosome} (${header.sequence_accession}), ${header.strand === '+' ? 'plus' : 'minus'} strand`);
  item('Transcript', `${header.transcript.refseq} = ${header.transcript.ensembl}, ${header.transcript.mane_status}: `
    + `${header.transcript.exon_count} exons, ${fmt(header.transcript.cds_length_nt)} coding bases`);
  const md5 = el('code', null, can.md5);
  item('Residue numbering', `UniProt ${can.accession} (${fmt(can.length_aa)} residues, entry version `
    + `${header.proteins[0].entry_version}) is identical to RefSeq ${tw.accession}: the two sequences have the same MD5 checksum, `,
  md5, others.length ? `. Other isoforms number the protein differently (${others.map((n) => `${n.accession}, ${fmt(n.length_aa)} residues`).join('; ')}), so a residue number means little without its numbering.` : '.');
  const outLink = (text, href) => {
    const a = el('a', 'id-link', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  };
  const commit = (href) => (/\/blob\/([0-9a-f]{7})/.exec(href) || [])[1];
  const aas = header.amino_acids_source;
  if (aas) {
    item('Amino acids', 'Names and three-letter codes as the release gives them, from ',
      outLink(aas.location, aas.link), `, at commit ${commit(aas.link)}. The names are lowercased in running text. This `
      + "article's own check tests every name and code the figure uses against its own copy of that table.");
  }
  const hgvsNames = header.hgvs_names;
  if (hgvsNames && hgvsNames.rules && hgvsNames.rules.length) {
    const lines = hgvsNames.rules.map((r) => Number(/line (\d+)/.exec(r.location)[1]));
    const href = hgvsNames.rules[0].link.replace(/#L\d+$/, `#L${Math.min(...lines)}-L${Math.max(...lines)}`);
    const where = hgvsNames.rules[0].location.replace(/, line \d+$/, `, lines ${Math.min(...lines)}-${Math.max(...lines)}`);
    item('c. names', "Every position is named by HGVS's rules as the release quotes them (", outLink(where, href),
      `), computed in this browser, and checked against ChannelScope's names at ${fmt(hgvsNames.rows)} positions and against `
      + "this article's own computation at every position.");
  }
  const lic = header.licence;
  if (lic) {
    item('Licence', 'The release carries ', outLink(lic.name, lic.url), ` (${lic.title}; `, outLink('legal code', lic.legal_code),
      `) for the parts it covers, credited as "${lic.credit}". In the release's words: "${lic.covers}"`);
  }
  const v = header.variant;
  if (v) {
    item('Variant', `${v.transcript}:${v.c_change} (${v.p_change}), as ClinVar records it in ${v.clinvar_accession_version}, `
      + `with its canonical SPDI ${v.spdi}, read on ${day(v.retrieval.retrieved_at)}. The alternate codon is the reference `
      + "codon as read, with the SPDI's alternate base put in.");
  }
  const seqs = header.sequences;
  if (seqs) {
    const units = { genomic_span: 'bases', exonic: 'bases', protein: 'residues' };
    const list = el('ul', 'sources-seqs');
    for (const key of ['genomic_span', 'exonic', 'protein']) {
      const s = seqs[key];
      const li = el('li');
      const md5 = el('code', null, s.md5);
      li.append(`${s.what} (${fmt(s.length)} ${units[key]}), read from ${s.read_from.record}; MD5 `, md5, '.');
      list.append(li);
    }
    item('Sequences', list);
  }
  linkify(links, ids);
  box.append(ids);

  if (header.terms && header.terms.sources) {
    const names = new Map(prov.sources.map((s) => [s.source, s.name]));
    const what = { genomic_span: 'the genomic span', exonic: 'the exonic sequence', protein: 'the protein' };
    const terms = el('div', 'sources-terms');
    terms.append(el('p', 'sources-terms-title', 'The sources\' terms, as the release quotes them'), el('p', null, header.terms.note));
    for (const t of header.terms.sources) {
      const p = el('p');
      const page = el('a', null, t.title);
      page.href = t.page;
      page.target = '_blank';
      page.rel = 'noopener';
      const parts = t.applies_to.map((a) => (what[a] ? document.createTextNode(what[a]) : el('code', null, a)));
      p.append(el('b', null, names.get(t.source) || t.source), ' (for ');
      parts.forEach((part, i) => p.append(part, i < parts.length - 2 ? ', ' : i === parts.length - 2 ? ' and ' : ''));
      p.append('): ', page, `, as retrieved on ${day(t.retrieved_at)}.`);
      terms.append(p);
      for (const sec of t.sections) {
        const quote = el('blockquote');
        quote.append(el('span', 'terms-section', `${sec.section}: `), sec.quotes.map((q) => `“${q}”`).join(' '));
        terms.append(quote);
      }
    }
    for (const n of header.terms.not_read || []) {
      const p = el('p');
      p.append(el('b', null, names.get(n.source) || n.source), ': terms not read. ', n.note);
      terms.append(p);
    }
    box.append(terms);
  }

  const sources = el('table', 'sources-table');
  const head = el('tr');
  ['Source', 'Release, and how it is known', 'Used for', 'Read'].forEach((h) => head.append(el('th', null, h)));
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  for (const s of prov.sources) {
    const tr = el('tr');
    const nameCell = el('td');
    const link = el('a', null, s.name);
    link.href = s.homepage;
    nameCell.append(link);

    const rel = el('td', 'src-release');
    rel.append(el('b', null, s.release ?? 'none stated'), `: ${s.release_basis}`);
    if (s.release_established_by) {
      const by = el('code', null, shortUrl(s.release_established_by));
      by.title = s.release_established_by;
      rel.append(' (', by, ')');
    }

    const counts = {};
    const builds = new Set();
    for (const r of s.retrievals) {
      for (const [k, n] of Object.entries(r.used_by || {})) counts[k] = (counts[k] || 0) + n;
      if (r.read_by_this_build) builds.add(r.read_by_this_build);
    }
    const used = el('td', 'src-used');
    const list = uses(counts);
    used.append(list.length ? list.join(', ') : 'establishing the release');
    for (const b of builds) used.append(el('br'), `this release's build, ${b}`);

    const when = el('td', 'src-read');
    const days = [...new Set(s.retrievals.map((r) => day(r.retrieved_at)))];
    const details = el('details');
    details.append(el('summary', null, `${days.join(', ')}: ${s.retrievals.length} ${s.retrievals.length === 1 ? 'file' : 'files'}`));
    const ul = el('ul');
    for (const r of s.retrievals) {
      const li = el('li');
      const code = el('code', null, shortUrl(r.url));
      code.title = r.url;
      const status = r.http_status == null ? 'HTTP status withheld' : `HTTP ${r.http_status}`;
      li.append(code, ` · ${status} · ${r.bytes == null ? 'size withheld' : `${fmt(r.bytes)} bytes`} · `
        + `${time(r.retrieved_at)} · snapshot `);
      const hash = el('code', null, `${short(r.snapshot_sha256)}…`);
      hash.title = r.snapshot_sha256;
      li.append(hash);
      const u = uses(r.used_by);
      if (r.release) li.append(` · release ${r.release}`);
      li.append(` · used for: ${u.length ? u.join(', ') : 'establishing the release'}`);
      if (r.read_by_this_build) li.append(`; this release's build, ${r.read_by_this_build}`);
      ul.append(li);
    }
    details.append(ul);
    when.append(details);
    tr.append(nameCell, rel, used, when);
    tbody.append(tr);
  }
  sources.append(thead, tbody);
  const scroll = el('div', 'sources-scroll');
  scroll.append(sources);
  box.append(scroll);

  const checks = el('details', 'sources-checks');
  checks.append(el('summary', null, `The ${prov.checks.length} checks behind the data, each also run on a deliberately broken `
    + 'copy to show that it catches the fault'));
  const ol = el('ol');
  for (const c of prov.checks) {
    const li = el('li');
    li.append(el('b', null, c.check), ` · ${c.outcome === 'pass' ? 'passed' : c.outcome}. Fails if: ${c.fails_if}. `
      + `Broken copy: ${c.control_fault}; ${c.control_outcome}. Registered before it was run, in commit ${c.pre_registered_in}.`);
    ol.append(li);
  }
  checks.append(ol);
  box.append(checks);

  if (manifest.checks && manifest.checks.length) {
    const build = el('details', 'sources-checks');
    build.append(el('summary', null, `The ${manifest.checks.length} checks this release's build ran`
      + `${base ? '' : ' before writing anything'}, each also shown to catch a deliberately introduced fault`));
    const bl = el('ol');
    const controlsOf = (c) => (Array.isArray(manifest.controls) ? manifest.controls.filter((k) => k.check === c.id) : [c.control]);
    for (const c of manifest.checks) {
      const li = el('li');
      li.append(el('b', null, c.id), ` · ${c.outcome === 'pass' ? 'passed' : c.outcome}. ${c.statement} Fails if: ${c.fails_if} `);
      controlsOf(c).forEach((k, i) => li.append(`${i ? ' ' : ''}Fault introduced: `, el('code', null, k.fault),
        `${k.caught_by ? `, caught by ${k.caught_by.join(' and ')}` : ''}; ${k.outcome}.`));
      bl.append(li);
    }
    build.append(bl);
    if (base && manifest.v0_5_checks) {
      const reworded = (manifest.rewordings ?? []).filter((r) => r.at?.[0] === 'typed_variants' && r.at?.[1] === 'rules').length;
      build.append(el('p', null, `Its data are ${base}'s byte for byte, and its engine's rules are unchanged`
        + `${reworded ? `, though ${reworded} ${reworded === 1 ? 'note' : 'notes'} on how they apply ${reworded === 1 ? 'is' : 'are'} reworded` : ''}; `
        + `exon_map_v0.5's build ran ${manifest.v0_5_checks.count} checks on its data and engine, listed in this release's manifest.`));
    }
    box.append(build);
  }
  const details = el('details', 'sources-details');
  details.append(el('summary', 'sources-title', `Where the data in ${NAME} comes from`), ...[...box.childNodes].slice(1));
  box.replaceChildren(details);
}

host.addEventListener('ready', build);
